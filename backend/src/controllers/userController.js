import { body } from 'express-validator';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Task from '../models/Task.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';

export const resetUserPasswordValidators = [
  body('newPassword')
    .isString()
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];

export async function resetUserPassword(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found', 404);

  if (user._id.toString() === req.user._id.toString()) {
    return fail(res, 'Use Settings to change your own password', 400);
  }

  if (!['employee', 'manager'].includes(user.role)) {
    return fail(res, 'Only manager and employee passwords can be reset here', 400);
  }

  user.passwordHash = await User.hashPassword(req.body.newPassword);
  user.loginPassword = req.body.newPassword;
  await user.save();

  await writeAudit({
    userId: req.user._id,
    action: 'admin_reset_password',
    entity: 'user',
    entityId: user._id.toString(),
    meta: { email: user.email, role: user.role },
  });

  return success(res, { id: user._id, email: user.email, role: user.role }, 'Password reset successfully');
}

export async function listUsers(req, res) {
  const { q, role, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { email: new RegExp(q, 'i') },
      { employeeId: new RegExp(q, 'i') },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const total = await User.countDocuments(filter);
  const items = await User.find(filter)
    .select('-passwordHash')
    .populate('employeeProfile', 'name designation employmentStatus')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  return success(res, {
    items,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 0,
  });
}

export async function updateUserStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found', 404);
  if (!['active', 'inactive'].includes(req.body.status)) {
    return fail(res, 'Invalid status', 400);
  }

  user.status = req.body.status;
  await user.save();

  await writeAudit({
    userId: req.user._id,
    action: 'update_user_status',
    entity: 'user',
    entityId: user._id.toString(),
    meta: { status: user.status },
  });

  return success(res, user, 'User status updated');
}

export async function deleteUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found', 404);

  if (user._id.toString() === req.user._id.toString()) {
    return fail(res, 'You cannot delete your own account', 400);
  }

  if (!['employee', 'manager'].includes(user.role)) {
    return fail(res, 'Only employees and managers can be permanently removed from Users', 400);
  }

  const employee = user.employeeProfile
    ? await Employee.findById(user.employeeProfile)
    : await Employee.findOne({ userId: user._id });

  if (employee) {
    await Employee.updateMany({ managerId: employee._id }, { $set: { managerId: null } });
    await Department.updateMany({ managerId: employee._id }, { $set: { managerId: null } });
    await Attendance.deleteMany({ employeeId: employee._id });
    await Leave.deleteMany({ employeeId: employee._id });
    await Task.deleteMany({ assignedTo: employee._id });
    await Employee.findByIdAndDelete(employee._id);
  }

  const snapshot = {
    employeeId: user.employeeId,
    email: user.email,
    role: user.role,
  };

  await User.findByIdAndDelete(user._id);

  await writeAudit({
    userId: req.user._id,
    action: 'delete_user',
    entity: 'user',
    entityId: req.params.id,
    meta: snapshot,
  });

  return success(res, snapshot, `${user.role === 'manager' ? 'Manager' : 'Employee'} permanently removed`);
}
