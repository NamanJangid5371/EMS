import { body } from 'express-validator';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Task from '../models/Task.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { sendWelcomeEmail } from '../utils/hrEmails.js';
import { notifyAdminsAndManager } from '../utils/notify.js';
import AuditLog from '../models/AuditLog.js';
import { materializePastAbsences } from '../services/attendanceService.js';

async function populateEmployee(id, { includeLogin = false } = {}) {
  const userSelect = includeLogin
    ? 'role status loginPassword email employeeId'
    : 'role status';
  return Employee.findById(id)
    .populate('departmentId', 'name')
    .populate('managerId', 'name employeeId')
    .populate('userId', userSelect);
}

async function getManagerEmployeeId(user) {
  if (!user.employeeProfile) return null;
  return user.employeeProfile.toString();
}

function canViewLoginCredentials(role) {
  return role === 'admin';
}

async function managerOwnsEmployee(user, employee) {
  const managerEmpId = await getManagerEmployeeId(user);
  if (!managerEmpId) return false;
  const managerRef = employee.managerId?._id || employee.managerId;
  return Boolean(managerRef && managerRef.toString() === managerEmpId);
}

function clampScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.min(10, Math.max(0, n));
}

async function applyProfileUpdates(employee, body, { allowRole = false, allowManager = false, allowPassword = false, allowPerformance = false } = {}) {
  const fields = [
    'name',
    'phone',
    'designation',
    'joiningDate',
    'employmentStatus',
    'emergencyContact',
    'leaveBalance',
    'bankDetails',
    'education',
  ];
  for (const key of fields) {
    if (body[key] !== undefined) employee[key] = body[key];
  }
  if (body.dateOfBirth !== undefined) {
    employee.dateOfBirth = body.dateOfBirth || null;
  }
  if (allowPerformance && body.performance !== undefined) {
    const incoming = body.performance || {};
    employee.performance = {
      ...(employee.performance?.toObject?.() || employee.performance || {}),
      taskCompletion: clampScore(incoming.taskCompletion),
      monthlyAttendance: clampScore(incoming.monthlyAttendance),
      workQuality: clampScore(incoming.workQuality),
      aptitude: clampScore(incoming.aptitude),
      remarks: String(incoming.remarks || '').trim(),
      updatedAt: new Date(),
    };
  }

  if (body.departmentId !== undefined) {
    employee.departmentId = body.departmentId || null;
  }
  if (allowManager && body.managerId !== undefined) {
    employee.managerId = body.managerId || null;
  }

  if (body.employeeId && body.employeeId !== employee.employeeId) {
    const taken = await Employee.findOne({
      employeeId: body.employeeId,
      _id: { $ne: employee._id },
    });
    if (taken) return { message: 'Employee ID already in use', status: 409 };
    employee.employeeId = body.employeeId;
    await User.findByIdAndUpdate(employee.userId, { employeeId: body.employeeId });
  }

  if (body.email) {
    const email = body.email.toLowerCase().trim();
    const taken = await User.findOne({
      email,
      _id: { $ne: employee.userId },
    });
    if (taken) return { message: 'Email already in use', status: 409 };
    employee.email = email;
    await User.findByIdAndUpdate(employee.userId, { email });
  }

  const linkedUser = await User.findById(employee.userId);
  if (linkedUser) {
    if (allowRole && body.role && ['employee', 'manager'].includes(body.role) && linkedUser.role !== 'admin') {
      linkedUser.role = body.role;
    }
    if (allowPassword && body.password) {
      if (String(body.password).length < 6) {
        return { message: 'Password must be at least 6 characters', status: 400 };
      }
      linkedUser.passwordHash = await User.hashPassword(body.password);
      linkedUser.loginPassword = body.password;
    }
    await linkedUser.save();
  }

  return null;
}

export const createEmployeeValidators = [
  body('employeeId').isString().trim().notEmpty(),
  body('name').isString().trim().notEmpty(),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 6 }),
  body('role').optional().isIn(['manager', 'employee']),
];

export async function listEmployees(req, res) {
  const {
    q,
    departmentId,
    status,
    role,
    designation,
    sortBy = 'name',
    sortOrder = 'asc',
    page = 1,
    limit = 100,
  } = req.query;
  const filter = {};

  if (req.user.role === 'manager') {
    const managerEmpId = await getManagerEmployeeId(req.user);
    if (!managerEmpId) return success(res, { items: [], total: 0, page: 1, pages: 0 });
    filter.managerId = managerEmpId;
  }

  if (q) {
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') },
      { employeeId: new RegExp(q, 'i') },
      { designation: new RegExp(q, 'i') },
    ];
  }
  if (departmentId) filter.departmentId = departmentId;
  if (status) filter.employmentStatus = status;
  if (designation && String(designation).trim()) {
    filter.designation = new RegExp(String(designation).trim(), 'i');
  }

  // Never include admin accounts in the employee directory / stats.
  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  const adminIds = adminUsers.map((u) => u._id);
  if (role && ['employee', 'manager'].includes(role)) {
    const users = await User.find({ role }).select('_id');
    filter.userId = { $in: users.map((u) => u._id) };
  } else {
    filter.userId = { $nin: adminIds };
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 100));
  const order = String(sortOrder).toLowerCase() === 'desc' ? -1 : 1;
  const sortField = {
    name: 'name',
    employeeId: 'employeeId',
    designation: 'designation',
    employmentStatus: 'employmentStatus',
    createdAt: 'createdAt',
  }[String(sortBy)] || 'name';

  const total = await Employee.countDocuments(filter);
  const userSelect = req.user.role === 'admin' ? 'role status loginPassword email' : 'role status';
  const items = await Employee.find(filter)
    .populate('departmentId', 'name')
    .populate('managerId', 'name employeeId')
    .populate('userId', userSelect)
    .sort({ [sortField]: order, name: 1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  return success(res, {
    items,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 0,
    sortBy: sortField,
    sortOrder: order === 1 ? 'asc' : 'desc',
  });
}

export async function getEmployee(req, res) {
  const employee = await populateEmployee(req.params.id, {
    includeLogin: canViewLoginCredentials(req.user.role),
  });

  if (!employee) return fail(res, 'Employee not found', 404);

  if (req.user.role === 'manager') {
    const isSelf = req.user.employeeProfile
      && req.user.employeeProfile.toString() === employee._id.toString();
    if (!isSelf && !(await managerOwnsEmployee(req.user, employee))) {
      return fail(res, 'Forbidden', 403);
    }
  }

  if (req.user.role === 'employee') {
    if (!req.user.employeeProfile || req.user.employeeProfile.toString() !== employee._id.toString()) {
      return fail(res, 'Forbidden', 403);
    }
  }

  return success(res, employee);
}

export async function createEmployee(req, res) {
  const {
    employeeId,
    name,
    email,
    password,
    phone,
    designation,
    departmentId,
    managerId,
    joiningDate,
    dateOfBirth,
    role = 'employee',
    emergencyContact,
  } = req.body;

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    employeeId,
    email: email.toLowerCase(),
    passwordHash,
    loginPassword: password,
    role: role === 'manager' ? 'manager' : 'employee',
    status: 'active',
  });

  try {
    const employee = await Employee.create({
      employeeId,
      userId: user._id,
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      designation: designation || '',
      departmentId: departmentId || null,
      managerId: managerId || null,
      joiningDate: joiningDate || new Date(),
      dateOfBirth: dateOfBirth || null,
      emergencyContact: emergencyContact || {},
    });

    user.employeeProfile = employee._id;
    await user.save();

    await writeAudit({
      userId: req.user._id,
      action: 'create_employee',
      entity: 'employee',
      entityId: employee._id.toString(),
      meta: { employeeId, role: user.role },
    });

    try {
      await sendWelcomeEmail(employee, { password, role: user.role });
      await notifyAdminsAndManager({
        managerEmployeeId: employee.managerId,
        actorUserId: req.user._id,
        title: 'New employee added',
        message: `${name} (${employeeId}) was added as ${user.role}.`,
        type: 'employee',
        link: `/employees/${employee._id}`,
        managerLink: `/team/${employee._id}`,
        entity: 'employee',
        entityId: employee._id,
      });
    } catch (err) {
      console.error('Welcome notification failed:', err.message);
    }

    const populated = await Employee.findById(employee._id)
      .populate('departmentId', 'name')
      .populate('managerId', 'name employeeId');

    return success(res, populated, 'Employee created', 201);
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw err;
  }
}

export async function updateEmployee(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return fail(res, 'Employee not found', 404);

  const isSelf = req.user.employeeProfile
    && req.user.employeeProfile.toString() === employee._id.toString();

  if (req.body.notificationEmail !== undefined) {
    const value = String(req.body.notificationEmail || '').trim().toLowerCase();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return fail(res, 'Enter a valid notification email', 400);
    }
    if (!isSelf && req.user.role !== 'admin') {
      return fail(res, 'Only the account owner can set notification email', 403);
    }
    employee.notificationEmail = value;
  }

  if (req.user.role === 'manager') {
    if (isSelf) {
      // Managers may update their own contact fields used for leave mail.
      if (req.body.phone !== undefined) employee.phone = req.body.phone;
      if (req.body.emergencyContact !== undefined) employee.emergencyContact = req.body.emergencyContact;
      if (req.body.dateOfBirth !== undefined) employee.dateOfBirth = req.body.dateOfBirth || null;
    } else {
      if (!(await managerOwnsEmployee(req.user, employee))) {
        return fail(res, 'Forbidden', 403);
      }
      const updateError = await applyProfileUpdates(employee, req.body, { allowPerformance: true });
      if (updateError) return fail(res, updateError.message, updateError.status);
    }
  } else if (req.user.role === 'employee') {
    if (!isSelf) {
      return fail(res, 'Forbidden', 403);
    }
    const allowed = ['phone', 'emergencyContact', 'dateOfBirth'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        employee[key] = key === 'dateOfBirth' ? (req.body[key] || null) : req.body[key];
      }
    }
  } else {
    const updateError = await applyProfileUpdates(employee, req.body, {
      allowRole: true,
      allowManager: true,
      allowPassword: true,
    });
    if (updateError) return fail(res, updateError.message, updateError.status);
  }

  await employee.save();
  await writeAudit({
    userId: req.user._id,
    action: 'update_employee',
    entity: 'employee',
    entityId: employee._id.toString(),
  });

  const populated = await populateEmployee(employee._id, {
    includeLogin: canViewLoginCredentials(req.user.role),
  });

  return success(res, populated, 'Employee updated');
}

export async function deactivateEmployee(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return fail(res, 'Employee not found', 404);

  employee.employmentStatus = 'inactive';
  await employee.save();
  await User.findByIdAndUpdate(employee.userId, { status: 'inactive' });

  await writeAudit({
    userId: req.user._id,
    action: 'deactivate_employee',
    entity: 'employee',
    entityId: employee._id.toString(),
  });

  return success(res, employee, 'Employee deactivated');
}

export async function reactivateEmployee(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return fail(res, 'Employee not found', 404);

  employee.employmentStatus = 'active';
  await employee.save();
  await User.findByIdAndUpdate(employee.userId, { status: 'active' });

  await writeAudit({
    userId: req.user._id,
    action: 'reactivate_employee',
    entity: 'employee',
    entityId: employee._id.toString(),
  });

  const populated = await Employee.findById(employee._id)
    .populate('departmentId', 'name')
    .populate('managerId', 'name employeeId')
    .populate('userId', 'role status');

  return success(res, populated, 'Employee reactivated');
}

export const addEmployeeNoteValidators = [
  body('kind').isIn(['comment', 'remark']),
  body('text').isString().trim().notEmpty().withMessage('Note text is required'),
];

export async function addEmployeeNote(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return fail(res, 'Employee not found', 404);

  if (req.user.role === 'manager') {
    if (!(await managerOwnsEmployee(req.user, employee))) {
      return fail(res, 'Forbidden', 403);
    }
  }

  const kind = req.body.kind === 'remark' ? 'remark' : 'comment';
  const text = String(req.body.text || '').trim();
  if (!text) return fail(res, 'Note text is required', 400);

  let authorName = 'Manager';
  if (req.user.employeeProfile) {
    const author = await Employee.findById(req.user.employeeProfile).select('name');
    if (author?.name) authorName = author.name;
  } else if (req.user.role === 'admin') {
    authorName = 'Admin';
  }

  employee.managerNotes = employee.managerNotes || [];
  employee.managerNotes.unshift({
    kind,
    text,
    authorId: req.user._id,
    authorName,
    createdAt: new Date(),
  });
  await employee.save();

  await writeAudit({
    userId: req.user._id,
    action: 'add_employee_note',
    entity: 'employee',
    entityId: employee._id.toString(),
    meta: { kind },
  });

  const populated = await populateEmployee(employee._id, {
    includeLogin: canViewLoginCredentials(req.user.role),
  });
  return success(res, populated, kind === 'remark' ? 'Remark added' : 'Comment added');
}

async function assertEmployeeAccess(req, employee) {
  if (!employee) return { message: 'Employee not found', status: 404 };
  if (req.user.role === 'admin') return null;
  if (req.user.role === 'manager') {
    const isSelf = req.user.employeeProfile
      && req.user.employeeProfile.toString() === employee._id.toString();
    if (!isSelf && !(await managerOwnsEmployee(req.user, employee))) {
      return { message: 'Forbidden', status: 403 };
    }
    return null;
  }
  if (!req.user.employeeProfile || req.user.employeeProfile.toString() !== employee._id.toString()) {
    return { message: 'Forbidden', status: 403 };
  }
  return null;
}

export async function getEmployeeActivity(req, res) {
  const employee = await Employee.findById(req.params.id).select('name managerNotes managerId');
  const denied = await assertEmployeeAccess(req, employee);
  if (denied) return fail(res, denied.message, denied.status);

  const id = employee._id.toString();
  const [logs, leaves, attendance] = await Promise.all([
    AuditLog.find({
      $or: [
        { entity: 'employee', entityId: id },
        { 'meta.employeeId': id },
      ],
    })
      .select('action entity actorName timestamp meta')
      .sort({ timestamp: -1 })
      .limit(40),
    Leave.find({ employeeId: employee._id }).select('type status days startDate endDate createdAt decisionAt').sort({ createdAt: -1 }).limit(20),
    Attendance.find({ employeeId: employee._id }).select('date status checkIn checkOut workHours').sort({ date: -1 }).limit(20),
  ]);

  const items = [
    ...(employee.managerNotes || []).map((note) => ({
      at: note.createdAt,
      type: 'note',
      title: `${note.kind === 'remark' ? 'Remark' : 'Comment'} from ${note.authorName || 'Manager'}`,
      detail: note.text,
    })),
    ...leaves.map((row) => ({
      at: row.decisionAt || row.createdAt,
      type: 'leave',
      title: `${row.type} leave ${row.status}`,
      detail: `${row.days} day(s)`,
    })),
    ...attendance.map((row) => ({
      at: row.date,
      type: 'attendance',
      title: `Attendance ${String(row.status || '').replace(/_/g, ' ')}`,
      detail: row.checkIn ? new Date(row.checkIn).toLocaleTimeString() : 'No login',
    })),
    ...logs.map((log) => ({
      at: log.timestamp,
      type: 'audit',
      title: String(log.action || '').replace(/_/g, ' '),
      detail: log.actorName || '',
    })),
  ]
    .filter((row) => row.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 60);

  return success(res, { items });
}

export async function getEmployeeLeaveRecord(req, res) {
  const employee = await Employee.findById(req.params.id).select('_id joiningDate');
  const denied = await assertEmployeeAccess(req, employee);
  if (denied) return fail(res, denied.message, denied.status);

  try {
    await materializePastAbsences(employee._id, employee.joiningDate);
  } catch (err) {
    console.error('Absence record update skipped:', err.message);
  }

  const [leaves, absences] = await Promise.all([
    Leave.find({ employeeId: employee._id, status: 'approved' }).sort({ startDate: -1 }).limit(200),
    Attendance.find({ employeeId: employee._id, status: 'absent' }).sort({ date: -1 }).limit(200),
  ]);

  return success(res, {
    leaves,
    absences,
    absentDays: absences.length,
  });
}

export async function addEmployeeDocument(req, res) {
  const employee = await Employee.findById(req.params.id);
  const denied = await assertEmployeeAccess(req, employee);
  if (denied) return fail(res, denied.message, denied.status);

  if (req.user.role === 'employee' && req.user.employeeProfile.toString() !== employee._id.toString()) {
    return fail(res, 'Forbidden', 403);
  }

  const name = String(req.body.name || '').trim();
  const url = String(req.body.url || '').trim();
  const note = String(req.body.note || '').trim();
  if (!name) return fail(res, 'Document name is required', 400);

  employee.documents = employee.documents || [];
  employee.documents.unshift({
    name,
    url,
    note,
    uploadedAt: new Date(),
    uploadedBy: req.user._id,
  });
  await employee.save();

  await writeAudit({
    userId: req.user._id,
    action: 'add_employee_document',
    entity: 'employee',
    entityId: employee._id.toString(),
    meta: { name },
  });

  const populated = await populateEmployee(employee._id, {
    includeLogin: canViewLoginCredentials(req.user.role),
  });
  return success(res, populated, 'Document added', 201);
}

export async function updateEmployeeDocument(req, res) {
  const employee = await Employee.findById(req.params.id);
  const denied = await assertEmployeeAccess(req, employee);
  if (denied) return fail(res, denied.message, denied.status);

  if (req.user.role === 'employee' && req.user.employeeProfile.toString() !== employee._id.toString()) {
    return fail(res, 'Forbidden', 403);
  }

  const doc = (employee.documents || []).find((item) => String(item._id) === String(req.params.docId));
  if (!doc) return fail(res, 'Document not found', 404);

  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 'Document name is required', 400);

  doc.name = name;
  doc.url = String(req.body.url || '').trim();
  if (req.body.note !== undefined) {
    doc.note = String(req.body.note || '').trim();
  }
  await employee.save();

  await writeAudit({
    userId: req.user._id,
    action: 'update_employee_document',
    entity: 'employee',
    entityId: employee._id.toString(),
    meta: { docId: String(doc._id), name: doc.name },
  });

  const populated = await populateEmployee(employee._id, {
    includeLogin: canViewLoginCredentials(req.user.role),
  });
  return success(res, populated, 'Document updated');
}

export async function deleteEmployeeDocument(req, res) {
  const employee = await Employee.findById(req.params.id);
  const denied = await assertEmployeeAccess(req, employee);
  if (denied) return fail(res, denied.message, denied.status);
  if (req.user.role === 'employee') return fail(res, 'Forbidden', 403);

  const docId = String(req.params.docId);
  const before = (employee.documents || []).length;
  employee.documents = (employee.documents || []).filter((doc) => String(doc._id) !== docId);
  if (employee.documents.length === before) return fail(res, 'Document not found', 404);
  await employee.save();

  await writeAudit({
    userId: req.user._id,
    action: 'delete_employee_document',
    entity: 'employee',
    entityId: employee._id.toString(),
    meta: { docId },
  });

  const populated = await populateEmployee(employee._id, {
    includeLogin: canViewLoginCredentials(req.user.role),
  });
  return success(res, populated, 'Document removed');
}

export async function deleteEmployee(req, res) {
  const employee = await Employee.findById(req.params.id);
  if (!employee) return fail(res, 'Employee not found', 404);

  const linkedUser = await User.findById(employee.userId);

  if (linkedUser && linkedUser._id.toString() === req.user._id.toString()) {
    return fail(res, 'You cannot delete your own account', 400);
  }

  if (linkedUser?.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin', status: 'active' });
    if (adminCount <= 1 && linkedUser.status === 'active') {
      return fail(res, 'Cannot delete the last active admin', 400);
    }
  }

  const employeeId = employee._id;
  const userId = employee.userId;
  const snapshot = {
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    role: linkedUser?.role || 'employee',
  };

  await Employee.updateMany({ managerId: employeeId }, { $set: { managerId: null } });
  await Department.updateMany({ managerId: employeeId }, { $set: { managerId: null } });
  await Attendance.deleteMany({ employeeId });
  await Leave.deleteMany({ employeeId });
  await Task.deleteMany({ assignedTo: employeeId });
  await Employee.findByIdAndDelete(employeeId);
  if (userId) await User.findByIdAndDelete(userId);

  await writeAudit({
    userId: req.user._id,
    action: 'delete_employee',
    entity: 'employee',
    entityId: employeeId.toString(),
    meta: snapshot,
  });

  return success(res, snapshot, `${snapshot.role === 'manager' ? 'Manager' : 'Employee'} permanently removed`);
}
