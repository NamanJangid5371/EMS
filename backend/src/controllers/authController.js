import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import config from '../config/index.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { recordEmployeeLogin, recordEmployeeLogout } from '../services/attendanceService.js';

export const loginValidators = [
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('employeeId').optional().isString().trim().notEmpty(),
  body('password').isString().isLength({ min: 6 }).withMessage('Password is required'),
];

export async function login(req, res) {
  const { email, employeeId, password } = req.body;
  if (!email && !employeeId) {
    return fail(res, 'Email or employee ID is required', 400);
  }

  const query = email ? { email: email.toLowerCase() } : { employeeId };
  const user = await User.findOne(query);
  if (!user || user.status !== 'active') {
    return fail(res, 'Invalid credentials', 401);
  }

  const ok = await user.comparePassword(password);
  if (!ok) return fail(res, 'Invalid credentials', 401);

  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role, employeeId: user.employeeId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  let profile = null;
  let attendance = null;
  if (user.employeeProfile) {
    profile = await Employee.findById(user.employeeProfile)
      .populate('departmentId', 'name')
      .populate('managerId', 'name employeeId');

    if (user.role === 'employee' || user.role === 'manager') {
      attendance = await recordEmployeeLogin(user.employeeProfile);
    }
  }

  await writeAudit({
    userId: user._id,
    action: 'login',
    entity: 'auth',
    entityId: user._id.toString(),
    meta: { role: user.role },
  });

  return success(res, {
    token,
    user: {
      id: user._id,
      employeeId: user.employeeId,
      email: user.email,
      role: user.role,
      status: user.status,
      profile,
    },
    attendance,
  }, 'Login successful');
}

export const changePasswordValidators = [
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];

export async function changePassword(req, res) {
  if (req.user.role !== 'admin') {
    return fail(res, 'Only an admin can change passwords. Ask your admin to reset it.', 403);
  }

  const user = await User.findById(req.user._id);
  const ok = await user.comparePassword(req.body.currentPassword);
  if (!ok) return fail(res, 'Current password is incorrect', 400);

  user.passwordHash = await User.hashPassword(req.body.newPassword);
  user.loginPassword = req.body.newPassword;
  await user.save();
  await writeAudit({
    userId: user._id,
    action: 'change_password',
    entity: 'user',
    entityId: user._id.toString(),
  });

  return success(res, null, 'Password updated');
}

export async function me(req, res) {
  let profile = null;
  if (req.user.employeeProfile) {
    profile = await Employee.findById(req.user.employeeProfile)
      .populate('departmentId', 'name')
      .populate('managerId', 'name employeeId');
  }
  return success(res, {
    id: req.user._id,
    employeeId: req.user.employeeId,
    email: req.user.email,
    role: req.user.role,
    status: req.user.status,
    profile,
  });
}

export async function logout(req, res) {
  let attendance = null;
  if (
    (req.user.role === 'employee' || req.user.role === 'manager') &&
    req.user.employeeProfile
  ) {
    attendance = await recordEmployeeLogout(req.user.employeeProfile);
  }

  await writeAudit({
    userId: req.user._id,
    action: 'logout',
    entity: 'auth',
    entityId: req.user._id.toString(),
    meta: { role: req.user.role },
  });

  return success(res, { attendance }, 'Logout successful');
}
