import { body } from 'express-validator';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Holiday from '../models/Holiday.js';
import Leave from '../models/Leave.js';
import { success, fail } from '../utils/apiResponse.js';
import { evaluateAttendance, startOfDay, isLeaveDayVoided } from '../services/attendanceService.js';
import { writeAudit } from '../utils/audit.js';

async function teamEmployeeIds(user) {
  if (user.role === 'admin') return null;
  if (user.role === 'manager') {
    const ids = await Employee.find({ managerId: user.employeeProfile }).select('_id');
    return ids.map((e) => e._id);
  }
  return [user.employeeProfile];
}

function intersectIds(current, next) {
  if (!current) return next;
  if (!next) return current;
  const allowed = new Set(next.map((id) => id.toString()));
  return current.filter((id) => allowed.has(id.toString()));
}

async function employeeIdsForQuery(query) {
  const { q, departmentId, role, employeeId, designation } = query;
  if (employeeId) return [employeeId];

  const empFilter = {};
  if (departmentId) empFilter.departmentId = departmentId;
  if (designation && String(designation).trim()) {
    empFilter.designation = String(designation).trim();
  }
  if (q) {
    empFilter.$or = [
      { name: new RegExp(q, 'i') },
      { employeeId: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') },
    ];
  }

  let employees = await Employee.find(empFilter).select('_id userId');
  if (!employees.length) return [];

  if (role) {
    const users = await User.find({
      _id: { $in: employees.map((e) => e.userId) },
      role,
    }).select('_id');
    const allowed = new Set(users.map((u) => u._id.toString()));
    employees = employees.filter((e) => allowed.has(e.userId?.toString()));
  }

  return employees.map((e) => e._id);
}

async function finalizeFilter(query, scopedEmployeeIds) {
  const filter = {};
  const needsLookup = query.q || query.departmentId || query.role || query.employeeId || query.designation;

  if (needsLookup) {
    let ids = await employeeIdsForQuery(query);
    if (scopedEmployeeIds) {
      ids = intersectIds(scopedEmployeeIds, ids);
    }
    if (!ids.length) return null;
    filter.employeeId = { $in: ids };
  } else if (scopedEmployeeIds) {
    filter.employeeId = { $in: scopedEmployeeIds };
  }

  const { from, to, status, minWorkHours, maxWorkHours, hasOvertime, stillLoggedIn } = query;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(from);
    if (to) filter.date.$lte = startOfDay(to);
  }
  if (status) filter.status = status;
  if (minWorkHours !== undefined && minWorkHours !== '') {
    filter.workHours = { ...(filter.workHours || {}), $gte: Number(minWorkHours) };
  }
  if (maxWorkHours !== undefined && maxWorkHours !== '') {
    filter.workHours = { ...(filter.workHours || {}), $lte: Number(maxWorkHours) };
  }
  if (hasOvertime === '1' || hasOvertime === 'true') {
    filter.overtimeHours = { $gt: 0 };
  }
  if (stillLoggedIn === '1' || stillLoggedIn === 'true') {
    filter.checkIn = { $ne: null };
    filter.checkOut = null;
  }

  return filter;
}

async function attendanceSummary(filter) {
  const [row] = await Attendance.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        records: { $sum: 1 },
        totalWorkHours: { $sum: '$workHours' },
        totalOvertimeHours: { $sum: '$overtimeHours' },
        withOvertime: { $sum: { $cond: [{ $gt: ['$overtimeHours', 0] }, 1, 0] } },
        stillLoggedIn: {
          $sum: {
            $cond: [{ $and: [{ $ne: ['$checkIn', null] }, { $eq: ['$checkOut', null] }] }, 1, 0],
          },
        },
      },
    },
  ]);

  return {
    records: row?.records || 0,
    totalWorkHours: Math.round((row?.totalWorkHours || 0) * 100) / 100,
    totalOvertimeHours: Math.round((row?.totalOvertimeHours || 0) * 100) / 100,
    withOvertime: row?.withOvertime || 0,
    stillLoggedIn: row?.stillLoggedIn || 0,
  };
}

function populateAttendance(query) {
  return query.populate({
    path: 'employeeId',
    select: 'name employeeId email departmentId',
    populate: { path: 'departmentId', select: 'name' },
  });
}

export async function getAttendanceCalendar(req, res) {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const daysInMonth = new Date(year, month, 0).getDate();

  let scoped = await teamEmployeeIds(req.user);
  if (req.query.employeeId) {
    const requestedId = String(req.query.employeeId);
    const isSelf = req.user.employeeProfile && requestedId === req.user.employeeProfile.toString();
    if (isSelf) {
      scoped = [req.user.employeeProfile];
    } else {
      const requested = [req.query.employeeId];
      scoped = scoped ? intersectIds(scoped, requested) : requested;
      if (!scoped.length) return fail(res, 'Forbidden', 403);
    }
  }

  const attFilter = { date: { $gte: start, $lte: end } };
  if (scoped) attFilter.employeeId = { $in: scoped };

  const leaveFilter = {
    status: { $in: ['approved', 'pending'] },
    startDate: { $lte: end },
    endDate: { $gte: start },
  };
  if (scoped) leaveFilter.employeeId = { $in: scoped };

  const [records, holidays, leaves, employees] = await Promise.all([
    Attendance.find(attFilter).populate('employeeId', 'name employeeId'),
    Holiday.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 }),
    Leave.find(leaveFilter).populate('employeeId', 'name employeeId'),
    scoped
      ? Employee.find({ _id: { $in: scoped } }).select('name employeeId').sort({ name: 1 })
      : Employee.find().select('name employeeId').sort({ name: 1 }).limit(200),
  ]);

  const holidayMap = new Map(holidays.map((h) => [startOfDay(h.date).getTime(), h]));
  const days = [];

  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(year, month - 1, d);
    const key = startOfDay(date).getTime();
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const holiday = holidayMap.get(key);
    const dayRecords = records.filter((row) => startOfDay(row.date).getTime() === key);
    const dayLeaves = leaves.filter((leave) => {
      const from = startOfDay(leave.startDate).getTime();
      const to = startOfDay(leave.endDate).getTime();
      return key >= from && key <= to;
    });

    const attended = dayRecords.filter((row) => ['present', 'late', 'half_day'].includes(row.status));
    const onLeave = dayRecords.filter((row) => row.status === 'on_leave');
    const markedAbsent = dayRecords.filter((row) => row.status === 'absent');
    const approvedLeave = dayLeaves.filter((leave) => (
      leave.status === 'approved' && !isLeaveDayVoided(leave, date)
    ));
    const pendingLeave = dayLeaves.filter((leave) => leave.status === 'pending');

    // Sat/Sun are office off — never mark leave, attendance, or absent.
    const todayStart = startOfDay();
    const isPastWeekday = !isWeekend && key < todayStart.getTime();
    let kind = null;
    if (isWeekend) kind = null;
    else if (attended.length) kind = 'attended';
    else if (approvedLeave.length || onLeave.length) kind = 'leave';
    else if (holiday) kind = 'holiday';
    else if (markedAbsent.length || isPastWeekday) kind = 'absent';

    days.push({
      date: startOfDay(date),
      day: d,
      kind,
      holidayName: holiday?.name || '',
      attendedCount: attended.length,
      leaveCount: Math.max(onLeave.length, approvedLeave.length),
      absentCount: markedAbsent.length,
      pendingLeaveCount: pendingLeave.length,
      records: dayRecords.map((row) => ({
        _id: row._id,
        status: row.status,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        workHours: row.workHours,
        overtimeHours: row.overtimeHours,
        employee: row.employeeId,
      })),
    });
  }

  return success(res, {
    year,
    month,
    days,
    holidays,
    employees,
  });
}

export const markAttendanceValidators = [
  body('status').optional().isIn(['present', 'absent', 'late', 'half_day', 'on_leave']),
];

export async function listAttendance(req, res) {
  const {
    from,
    to,
    status,
    page = 1,
    limit = 30,
    sortBy = 'date',
    sortOrder = 'desc',
  } = req.query;

  const scoped = await teamEmployeeIds(req.user);
  const filter = await finalizeFilter(req.query, scoped);
  if (filter === null) {
    return success(res, {
      items: [],
      total: 0,
      page: 1,
      pages: 0,
      summary: {
        records: 0,
        totalWorkHours: 0,
        totalOvertimeHours: 0,
        withOvertime: 0,
        stillLoggedIn: 0,
      },
      sortBy: 'date',
      sortOrder: 'desc',
    });
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(500, Math.max(1, Number(limit) || 30));
  const order = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
  const sortField = String(sortBy || 'date');

  const directSortFields = {
    date: 'date',
    status: 'status',
    checkIn: 'checkIn',
    checkOut: 'checkOut',
    workHours: 'workHours',
    overtimeHours: 'overtimeHours',
  };

  const [total, summary] = await Promise.all([
    Attendance.countDocuments(filter),
    req.user.role === 'admin' || req.user.role === 'manager'
      ? attendanceSummary(filter)
      : Promise.resolve(null),
  ]);

  if (sortField === 'employeeName') {
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
      { $sort: { 'employee.name': order, date: -1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
    ];
    const rows = await Attendance.aggregate(pipeline);
    const ids = rows.map((row) => row._id);
    const populated = await populateAttendance(Attendance.find({ _id: { $in: ids } }));
    const docs = await populated;
    const byId = Object.fromEntries(docs.map((row) => [row._id.toString(), row]));
    const items = ids.map((id) => byId[id.toString()]).filter(Boolean);

    return success(res, {
      items,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 0,
      summary,
      sortBy: sortField,
      sortOrder: order === 1 ? 'asc' : 'desc',
    });
  }

  const sortKey = directSortFields[sortField] || 'date';
  const items = await populateAttendance(
    Attendance.find(filter)
      .sort({ [sortKey]: order, date: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
  );

  return success(res, {
    items,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 0,
    summary,
    sortBy: sortKey,
    sortOrder: order === 1 ? 'asc' : 'desc',
  });
}

export async function markAttendance(req, res) {
  if (!req.user.employeeProfile) {
    return fail(res, 'No employee profile linked', 400);
  }

  const today = startOfDay();
  let record = await Attendance.findOne({
    employeeId: req.user.employeeProfile,
    date: today,
  });

  const now = new Date();
  if (!record) {
    const evaluated = evaluateAttendance(now, null);
    record = await Attendance.create({
      employeeId: req.user.employeeProfile,
      date: today,
      status: req.body.status || evaluated.status,
      checkIn: now,
      workHours: 0,
      overtimeHours: 0,
    });
    await writeAudit({
      userId: req.user._id,
      action: 'attendance_check_in',
      entity: 'attendance',
      entityId: record._id.toString(),
      meta: { employeeId: req.user.employeeProfile.toString() },
    });
    return success(res, record, 'Checked in', 201);
  }

  if (!record.checkOut) {
    const checkIn = record.checkIn || now;
    record.checkIn = checkIn;
    record.checkOut = now;
    const evaluated = evaluateAttendance(checkIn, now);
    record.status = evaluated.status;
    record.workHours = evaluated.workHours;
    record.overtimeHours = evaluated.overtimeHours;
    await record.save();
    await writeAudit({
      userId: req.user._id,
      action: 'attendance_check_out',
      entity: 'attendance',
      entityId: record._id.toString(),
      meta: { employeeId: req.user.employeeProfile.toString(), workHours: record.workHours },
    });
    return success(res, record, 'Checked out');
  }

  return fail(res, 'Attendance already completed for today', 400);
}

export async function upsertAttendance(req, res) {
  const { employeeId, date, status, checkIn, checkOut, notes } = req.body;
  if (!employeeId || !date) {
    return fail(res, 'employeeId and date are required', 400);
  }

  if (req.user.role === 'manager') {
    const employee = await Employee.findById(employeeId);
    if (!employee || !employee.managerId || employee.managerId.toString() !== req.user.employeeProfile.toString()) {
      return fail(res, 'Forbidden', 403);
    }
  }

  const day = startOfDay(date);
  const evaluated = checkIn
    ? evaluateAttendance(checkIn, checkOut || null)
    : { status: status || 'absent', workHours: 0, overtimeHours: 0 };

  const record = await Attendance.findOneAndUpdate(
    { employeeId, date: day },
    {
      status: status || evaluated.status,
      checkIn: checkIn || null,
      checkOut: checkOut || null,
      workHours: evaluated.workHours,
      overtimeHours: evaluated.overtimeHours,
      notes: notes || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('employeeId', 'name employeeId');

  return success(res, record, 'Attendance saved');
}
