import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Leave from '../models/Leave.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import { success } from '../utils/apiResponse.js';
import { startOfDay } from '../services/attendanceService.js';

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

export async function getOrgTree(req, res) {
  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  const adminProfileIds = (
    await Employee.find({ userId: { $in: adminUsers.map((u) => u._id) } }).select('_id')
  ).map((e) => e._id.toString());

  const scopedIds = await scopedEmployeeIds(req.user);
  const employeeFilter = {
    employmentStatus: { $ne: 'inactive' },
    ...(scopedIds ? { _id: { $in: scopedIds } } : {}),
  };

  const [departments, employees] = await Promise.all([
    Department.find({ status: 'active' }).populate('managerId', 'name employeeId designation').sort({ name: 1 }),
    Employee.find(employeeFilter)
      .select('name employeeId designation departmentId managerId userId joiningDate')
      .populate('userId', 'role')
      .populate('managerId', 'name employeeId')
      .sort({ name: 1 }),
  ]);

  const visible = employees.filter((emp) => !adminProfileIds.includes(emp._id.toString()));
  const byDept = new Map();
  const unassigned = [];

  for (const emp of visible) {
    const deptId = emp.departmentId ? String(emp.departmentId) : '';
    if (!deptId) {
      unassigned.push(emp);
      continue;
    }
    if (!byDept.has(deptId)) byDept.set(deptId, []);
    byDept.get(deptId).push(emp);
  }

  const tree = departments.map((dept) => {
    const members = byDept.get(String(dept._id)) || [];
    const manager = dept.managerId;
    return {
      _id: dept._id,
      name: dept.name,
      manager: manager
        ? {
          _id: manager._id,
          name: manager.name,
          employeeId: manager.employeeId,
          designation: manager.designation,
        }
        : null,
      employees: members
        .filter((emp) => emp.userId?.role !== 'manager' && String(emp._id) !== String(manager?._id || ''))
        .map((emp) => ({
          _id: emp._id,
          name: emp.name,
          employeeId: emp.employeeId,
          designation: emp.designation,
          role: emp.userId?.role || 'employee',
        })),
      managers: members
        .filter((emp) => emp.userId?.role === 'manager' || String(emp._id) === String(manager?._id || ''))
        .map((emp) => ({
          _id: emp._id,
          name: emp.name,
          employeeId: emp.employeeId,
          designation: emp.designation,
          role: emp.userId?.role || 'manager',
        })),
    };
  });

  return success(res, {
    departments: tree,
    unassigned: unassigned.map((emp) => ({
      _id: emp._id,
      name: emp.name,
      employeeId: emp.employeeId,
      designation: emp.designation,
      role: emp.userId?.role || 'employee',
    })),
  });
}

export async function getCompanyCalendar(req, res) {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || (now.getMonth() + 1);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const scopedIds = await scopedEmployeeIds(req.user);

  const employeeFilter = {
    employmentStatus: { $ne: 'inactive' },
    ...(scopedIds ? { _id: { $in: scopedIds } } : {}),
  };

  const [holidays, leaves, employees] = await Promise.all([
    Holiday.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 }),
    Leave.find({
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: start },
      ...(scopedIds ? { employeeId: { $in: scopedIds } } : {}),
    }).populate('employeeId', 'name employeeId'),
    Employee.find(employeeFilter).select('name employeeId joiningDate'),
  ]);

  const events = [];

  for (const holiday of holidays) {
    events.push({
      date: holiday.date,
      type: 'holiday',
      title: holiday.name,
      subtitle: 'Company holiday',
    });
  }

  for (const leave of leaves) {
    events.push({
      date: leave.startDate,
      endDate: leave.endDate,
      type: 'leave',
      title: `${leave.employeeId?.name || 'Employee'} · ${leave.type} leave`,
      subtitle: leave.employeeId?.employeeId || '',
      employeeId: leave.employeeId?._id || leave.employeeId,
    });
  }

  for (const emp of employees) {
    if (!emp.joiningDate) continue;
    const joined = new Date(emp.joiningDate);
    const thisYearJoin = new Date(year, joined.getMonth(), joined.getDate());
    if (thisYearJoin >= start && thisYearJoin <= end) {
      const isAnniversary = joined.getFullYear() < year;
      events.push({
        date: thisYearJoin,
        type: isAnniversary ? 'anniversary' : 'joining',
        title: isAnniversary
          ? `${emp.name} · work anniversary`
          : `${emp.name} · joining date`,
        subtitle: emp.employeeId,
        employeeId: emp._id,
      });
    }
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  return success(res, {
    year,
    month,
    from: startOfDay(start),
    to: end,
    events,
  });
}
