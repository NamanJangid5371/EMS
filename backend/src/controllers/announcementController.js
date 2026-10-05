import { body } from 'express-validator';
import Announcement from '../models/Announcement.js';
import Employee from '../models/Employee.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { createNotifications } from '../utils/notify.js';
import User from '../models/User.js';

export const announcementValidators = [
  body('title').isString().trim().notEmpty(),
  body('message').isString().trim().notEmpty(),
  body('audience').optional().isIn(['company', 'team']),
];

export async function listAnnouncements(req, res) {
  let filter = {};

  if (req.user.role === 'employee' || req.user.role === 'manager') {
    const profile = req.user.employeeProfile
      ? await Employee.findById(req.user.employeeProfile)
      : null;
    const departmentId = profile?.departmentId || null;
    filter = {
      $or: [
        { audience: 'company' },
        ...(departmentId ? [{ audience: 'team', departmentId }] : []),
      ],
    };
  }

  const items = await Announcement.find(filter)
    .populate('createdBy', 'email role employeeId')
    .populate('departmentId', 'name')
    .sort({ createdAt: -1 })
    .limit(50);

  return success(res, items);
}

export async function createAnnouncement(req, res) {
  const audience = req.body.audience || (req.user.role === 'manager' ? 'team' : 'company');

  if (req.user.role === 'manager' && audience === 'company') {
    return fail(res, 'Managers can only publish team announcements', 403);
  }

  let departmentId = req.body.departmentId || null;
  if (req.user.role === 'manager') {
    const profile = await Employee.findById(req.user.employeeProfile);
    departmentId = profile?.departmentId || null;
    if (!departmentId) return fail(res, 'Manager has no department assigned', 400);
  }

  const item = await Announcement.create({
    title: req.body.title,
    message: req.body.message,
    audience,
    departmentId: audience === 'team' ? departmentId : null,
    createdBy: req.user._id,
  });

  await writeAudit({
    userId: req.user._id,
    action: 'create_announcement',
    entity: 'announcement',
    entityId: item._id.toString(),
  });

  try {
    let recipients = [];
    if (audience === 'company') {
      recipients = await User.find({ status: 'active', role: { $in: ['employee', 'manager', 'admin'] } }).select('_id');
    } else if (departmentId) {
      const members = await Employee.find({ departmentId }).select('userId');
      recipients = members.map((m) => ({ _id: m.userId })).filter((m) => m._id);
    }
    await createNotifications({
      recipientUserIds: recipients.map((u) => u._id).filter((id) => String(id) !== String(req.user._id)),
      title: item.title,
      message: item.message,
      type: 'announcement',
      link: '/announcements',
      entity: 'announcement',
      entityId: item._id,
    });
  } catch (err) {
    console.error('Announcement notification failed:', err.message);
  }

  const populated = await Announcement.findById(item._id)
    .populate('createdBy', 'email role employeeId')
    .populate('departmentId', 'name');

  return success(res, populated, 'Announcement published', 201);
}

export async function deleteAnnouncement(req, res) {
  const item = await Announcement.findById(req.params.id);
  if (!item) return fail(res, 'Announcement not found', 404);

  await Announcement.findByIdAndDelete(item._id);

  await writeAudit({
    userId: req.user._id,
    action: 'delete_announcement',
    entity: 'announcement',
    entityId: item._id.toString(),
    meta: { title: item.title },
  });

  return success(res, { id: item._id, title: item.title }, 'Announcement removed');
}
