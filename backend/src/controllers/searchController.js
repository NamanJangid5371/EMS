import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Leave from '../models/Leave.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { success } from '../utils/apiResponse.js';

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scopedEmployeeIds(user) {
  if (user.role === 'admin') return null;
  if (user.role === 'manager') {
    const team = await Employee.find({ managerId: user.employeeProfile }).select('_id');
    const ids = team.map((row) => row._id);
    if (user.employeeProfile) ids.push(user.employeeProfile);
    return ids;
  }
  return user.employeeProfile ? [user.employeeProfile] : [];
}

export async function globalSearch(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return success(res, { employees: [], managers: [], departments: [], leaves: [], attendance: [] });
  }

  const rx = new RegExp(escapeRegex(q), 'i');
  const scopedIds = await scopedEmployeeIds(req.user);
  const employeeFilter = scopedIds ? { _id: { $in: scopedIds } } : {};

  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  const adminProfileIds = (
    await Employee.find({ userId: { $in: adminUsers.map((u) => u._id) } }).select('_id')
  ).map((e) => e._id);

  const peopleFilter = {
    ...employeeFilter,
    ...(adminProfileIds.length && req.user.role === 'admin' ? { _id: { $nin: adminProfileIds } } : {}),
    $or: [
      { name: rx },
      { email: rx },
      { employeeId: rx },
      { designation: rx },
    ],
  };

  const [people, departments, leaves, attendance] = await Promise.all([
    Employee.find(peopleFilter)
      .select('name employeeId email designation departmentId userId')
      .populate('departmentId', 'name')
      .populate('userId', 'role')
      .limit(12),
    req.user.role === 'employee'
      ? Department.find({ name: rx, status: 'active' }).select('name').limit(8)
      : Department.find({ name: rx }).select('name status').limit(8),
    Leave.find({
      ...(scopedIds ? { employeeId: { $in: scopedIds } } : {}),
      $or: [{ reason: rx }, { type: rx }, { status: rx }],
    })
      .populate('employeeId', 'name employeeId')
      .sort({ createdAt: -1 })
      .limit(8),
    Attendance.find({
      ...(scopedIds ? { employeeId: { $in: scopedIds } } : {}),
      $or: [{ status: rx }, { notes: rx }],
    })
      .populate('employeeId', 'name employeeId')
      .sort({ date: -1 })
      .limit(8),
  ]);

  const employees = people.filter((row) => row.userId?.role !== 'manager');
  const managers = people.filter((row) => row.userId?.role === 'manager');

  return success(res, {
    employees,
    managers,
    departments,
    leaves,
    attendance,
  });
}
