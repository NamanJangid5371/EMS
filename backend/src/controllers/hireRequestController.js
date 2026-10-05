import { body } from 'express-validator';
import HireRequest from '../models/HireRequest.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { sendWelcomeEmail } from '../utils/hrEmails.js';
import { notifyAdminsAndManager } from '../utils/notify.js';

function populateHireRequest(query) {
  return query
    .populate('requestedBy', 'name employeeId email')
    .populate('managerId', 'name employeeId email')
    .populate('departmentId', 'name')
    .populate({
      path: 'decidedBy',
      select: 'email role employeeProfile',
      populate: { path: 'employeeProfile', select: 'name' },
    })
    .populate('createdEmployeeId', 'name employeeId');
}

async function identifiersTaken({ employeeId, email, ignoreRequestId = null }) {
  const emailNorm = String(email || '').toLowerCase().trim();
  const idNorm = String(employeeId || '').trim();

  const [userByEmail, userById, empByEmail, empById] = await Promise.all([
    User.findOne({ email: emailNorm }).select('_id'),
    User.findOne({ employeeId: idNorm }).select('_id'),
    Employee.findOne({ email: emailNorm }).select('_id'),
    Employee.findOne({ employeeId: idNorm }).select('_id'),
  ]);

  if (userByEmail || empByEmail) return 'Email is already in use';
  if (userById || empById) return 'Employee ID is already in use';

  const pendingFilter = {
    status: 'pending',
    $or: [{ email: emailNorm }, { employeeId: idNorm }],
  };
  if (ignoreRequestId) pendingFilter._id = { $ne: ignoreRequestId };
  const pending = await HireRequest.findOne(pendingFilter).select('_id email employeeId');
  if (pending) {
    if (pending.email === emailNorm) return 'A pending hire request already uses this email';
    return 'A pending hire request already uses this employee ID';
  }
  return null;
}

export const createHireRequestValidators = [
  body('employeeId').isString().trim().notEmpty(),
  body('name').isString().trim().notEmpty(),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().isString(),
  body('designation').optional().isString(),
  body('joiningDate').optional().isISO8601(),
  body('dateOfBirth').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('managerNote').optional().isString(),
];

export async function listHireRequests(req, res) {
  const { status, page = 1, limit = 50 } = req.query;
  const filter = {};

  if (req.user.role === 'manager') {
    if (!req.user.employeeProfile) return success(res, { items: [], total: 0, page: 1, pages: 0 });
    filter.requestedBy = req.user.employeeProfile;
    // Drop decided requests from the manager inbox 1 hour after admin action.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    filter.$or = [{ status: 'pending' }, { decisionAt: { $gte: cutoff } }];
  }

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    filter.status = status;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
  const total = await HireRequest.countDocuments(filter);
  const items = await populateHireRequest(
    HireRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
  );

  const safeItems = req.user.role === 'admin'
    ? items
    : items.map((row) => {
      const obj = row.toObject();
      delete obj.loginPassword;
      return obj;
    });

  return success(res, {
    items: safeItems,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 0,
  });
}

export async function getHireRequest(req, res) {
  const request = await populateHireRequest(HireRequest.findById(req.params.id));
  if (!request) return fail(res, 'Hire request not found', 404);

  if (req.user.role === 'manager') {
    const owner = request.requestedBy?._id || request.requestedBy;
    if (!req.user.employeeProfile || owner.toString() !== req.user.employeeProfile.toString()) {
      return fail(res, 'Forbidden', 403);
    }
    const obj = request.toObject();
    delete obj.loginPassword;
    return success(res, obj);
  }

  return success(res, request);
}

export async function createHireRequest(req, res) {
  if (!req.user.employeeProfile) return fail(res, 'No manager profile linked', 400);

  const manager = await Employee.findById(req.user.employeeProfile).populate('departmentId', 'name');
  if (!manager) return fail(res, 'Manager profile not found', 404);
  if (!manager.departmentId) {
    return fail(res, 'Your department is not set. Ask admin to assign a department before adding employees.', 400);
  }

  const taken = await identifiersTaken({
    employeeId: req.body.employeeId,
    email: req.body.email,
  });
  if (taken) return fail(res, taken, 409);

  const request = await HireRequest.create({
    requestedBy: manager._id,
    departmentId: manager.departmentId._id || manager.departmentId,
    managerId: manager._id,
    employeeId: String(req.body.employeeId).trim(),
    name: String(req.body.name).trim(),
    email: String(req.body.email).toLowerCase().trim(),
    loginPassword: req.body.password,
    phone: req.body.phone || '',
    designation: req.body.designation || '',
    joiningDate: req.body.joiningDate || new Date(),
    dateOfBirth: req.body.dateOfBirth || null,
    emergencyContact: req.body.emergencyContact || {},
    managerNote: String(req.body.managerNote || '').trim(),
    status: 'pending',
  });

  await writeAudit({
    userId: req.user._id,
    action: 'create_hire_request',
    entity: 'hire_request',
    entityId: request._id.toString(),
    meta: { employeeId: request.employeeId, name: request.name },
  });

  const populated = await populateHireRequest(HireRequest.findById(request._id));
  const obj = populated.toObject();
  delete obj.loginPassword;
  await notifyAdminsAndManager({
    managerEmployeeId: request.requestedBy,
    actorUserId: req.user._id,
    title: 'New hire request',
    message: `${manager.name} submitted ${request.name} (${request.employeeId}) for review.`,
    type: 'hire',
    link: `/hire-requests/${request._id}`,
    entity: 'hire_request',
    entityId: request._id,
  });
  return success(res, obj, 'Hire request submitted for admin review', 201);
}

export async function updateHireRequestStatus(req, res) {
  const { status, decisionNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return fail(res, 'Status must be approved or rejected', 400);
  }

  const note = String(decisionNote || '').trim();
  if (!note) {
    return fail(res, 'A decision reason is required', 400);
  }

  const request = await HireRequest.findById(req.params.id);
  if (!request) return fail(res, 'Hire request not found', 404);
  if (request.status !== 'pending') return fail(res, 'Hire request already processed', 400);

  if (status === 'rejected') {
    request.status = 'rejected';
    request.decidedBy = req.user._id;
    request.decisionAt = new Date();
    request.decisionNote = note;
    await request.save();

    await writeAudit({
      userId: req.user._id,
      action: 'hire_request_rejected',
      entity: 'hire_request',
      entityId: request._id.toString(),
      meta: { employeeId: request.employeeId, name: request.name },
    });

    await notifyAdminsAndManager({
      managerEmployeeId: request.requestedBy,
      actorUserId: req.user._id,
      title: 'Hire request rejected',
      message: `${request.name} (${request.employeeId}) was rejected. ${note}`,
      type: 'hire',
      link: `/hire-requests/${request._id}`,
      managerLink: '/team',
      entity: 'hire_request',
      entityId: request._id,
    });

    const populated = await populateHireRequest(HireRequest.findById(request._id));
    return success(res, populated, 'Hire request rejected');
  }

  const taken = await identifiersTaken({
    employeeId: request.employeeId,
    email: request.email,
    ignoreRequestId: request._id,
  });
  if (taken) return fail(res, taken, 409);

  const passwordHash = await User.hashPassword(request.loginPassword);
  const user = await User.create({
    employeeId: request.employeeId,
    email: request.email,
    passwordHash,
    loginPassword: request.loginPassword,
    role: 'employee',
    status: 'active',
  });

  try {
    const employee = await Employee.create({
      employeeId: request.employeeId,
      userId: user._id,
      name: request.name,
      email: request.email,
      phone: request.phone || '',
      designation: request.designation || '',
      departmentId: request.departmentId,
      managerId: request.managerId,
      joiningDate: request.joiningDate || new Date(),
      dateOfBirth: request.dateOfBirth || null,
      emergencyContact: request.emergencyContact || {},
    });

    user.employeeProfile = employee._id;
    await user.save();

    request.status = 'approved';
    request.decidedBy = req.user._id;
    request.decisionAt = new Date();
    request.decisionNote = note;
    request.createdEmployeeId = employee._id;
    await request.save();

    await writeAudit({
      userId: req.user._id,
      action: 'hire_request_approved',
      entity: 'hire_request',
      entityId: request._id.toString(),
      meta: { employeeId: request.employeeId, createdEmployeeId: employee._id.toString() },
    });

    try {
      await sendWelcomeEmail(employee, { password: request.loginPassword, role: 'employee' });
      await notifyAdminsAndManager({
        managerEmployeeId: request.requestedBy,
        actorUserId: req.user._id,
        title: 'Hire request approved',
        message: `${request.name} (${request.employeeId}) was approved and added to the team.`,
        type: 'hire',
        link: `/employees/${employee._id}`,
        managerLink: `/team/${employee._id}`,
        entity: 'hire_request',
        entityId: request._id,
      });
    } catch (err) {
      console.error('Hire approval notification failed:', err.message);
    }
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw err;
  }

  const populated = await populateHireRequest(HireRequest.findById(request._id));
  return success(res, populated, 'Employee added to the company');
}
