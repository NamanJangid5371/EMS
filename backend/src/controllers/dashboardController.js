import User from '../models/User.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Task from '../models/Task.js';
import Holiday from '../models/Holiday.js';
import HireRequest from '../models/HireRequest.js';
import AuditLog from '../models/AuditLog.js';
import { success } from '../utils/apiResponse.js';
import { startOfDay, isLeaveDayVoided } from '../services/attendanceService.js';

function isWeekend(date) {
  const day = startOfDay(date).getDay();
  return day === 0 || day === 6;
}

function summarizeAttendanceRows(rows = []) {
  const lateToday = rows.filter((r) => r.status === 'late').length;
  const halfDayToday = rows.filter((r) => r.status === 'half_day').length;
  const fullDayToday = rows.filter((r) => r.status === 'present').length;
  const overtimeToday = rows.filter((r) => (r.overtimeHours || 0) > 0).length;
  const overtimeHoursToday = Math.round(
    rows.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0) * 100
  ) / 100;
  return { lateToday, halfDayToday, fullDayToday, overtimeToday, overtimeHoursToday };
}

function serializeAttendanceRow(row) {
  return {
    _id: row._id,
    date: row.date,
    checkIn: row.checkIn || null,
    checkOut: row.checkOut || null,
    workHours: row.workHours || 0,
    overtimeHours: row.overtimeHours || 0,
    status: row.status,
    notes: row.notes || '',
    employeeId: row.employeeId,
  };
}

function rangeFromPreset(preset, from, to) {
  const today = startOfDay();
  let start = startOfDay(from || today);
  let end = startOfDay(to || today);

  if (preset === 'this_week') {
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
    end = today;
  } else if (preset === 'last_30_days') {
    start = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
    end = today;
  } else if (preset === 'custom' && from && to) {
    start = startOfDay(from);
    end = startOfDay(to);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = today;
  }

  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);
  return { start, end: endOfDay };
}

async function buildAdminAttendanceReport({ departmentId, rangePreset, from, to }) {
  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  const adminProfileIds = (
    await Employee.find({ userId: { $in: adminUsers.map((u) => u._id) } }).select('_id')
  ).map((e) => e._id.toString());

  const { start, end } = rangeFromPreset(rangePreset, from, to);
  const employeeFilter = {
    employmentStatus: { $ne: 'inactive' },
    ...(departmentId ? { departmentId } : {}),
  };
  const employees = await Employee.find(employeeFilter)
    .select('name employeeId departmentId userId phone designation managerId joiningDate leaveBalance performance')
    .populate('departmentId', 'name')
    .populate('managerId', 'name employeeId')
    .populate('userId', 'role');

  const scopedEmployees = employees.filter((emp) => !adminProfileIds.includes(emp._id.toString()));
  const scopedIds = scopedEmployees.map((emp) => emp._id);
  const scopedIdStrings = scopedEmployees.map((emp) => emp._id.toString());

  const [records, leaves, holidays, departments] = await Promise.all([
    Attendance.find({
      employeeId: { $in: scopedIds },
      date: { $gte: start, $lte: end },
    }).populate('employeeId', 'name employeeId departmentId'),
    Leave.find({
      employeeId: { $in: scopedIds },
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).select('employeeId startDate endDate type status days voidedDates'),
    Holiday.find({ date: { $gte: start, $lte: end } }).select('date'),
    Department.find(departmentId ? { _id: departmentId } : { status: 'active' }).select('name'),
  ]);

  const holidayKeys = new Set(holidays.map((h) => startOfDay(h.date).getTime()));
  const recordMap = new Map(
    records.map((row) => [`${row.employeeId?._id || row.employeeId}:${startOfDay(row.date).getTime()}`, row])
  );
  const approvedLeaves = leaves.filter((leave) => leave.status === 'approved');
  const leaveRanges = approvedLeaves.map((leave) => ({
    employeeId: String(leave.employeeId),
    start: startOfDay(leave.startDate).getTime(),
    end: startOfDay(leave.endDate).getTime(),
    voided: new Set((leave.voidedDates || []).map((d) => startOfDay(d).getTime())),
  }));

  const counts = { present: 0, absent: 0, on_leave: 0, late: 0 };
  const departmentStats = new Map();
  const issueStats = new Map();
  let workingDaySlots = 0;

  for (const employee of scopedEmployees) {
    issueStats.set(employee._id.toString(), {
      employee,
      lateDays: 0,
      absentDays: 0,
    });
  }

  for (let cursor = startOfDay(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = startOfDay(cursor);
    const key = day.getTime();
    if (isWeekend(day) || holidayKeys.has(key)) continue;

    for (const employee of scopedEmployees) {
      workingDaySlots += 1;
      const empId = employee._id.toString();
      const record = recordMap.get(`${empId}:${key}`);
      const onLeave = leaveRanges.some((leave) => (
        leave.employeeId === empId
        && key >= leave.start
        && key <= leave.end
        && !leave.voided.has(key)
      ));
      const worked = Boolean(record?.checkIn && record.status !== 'on_leave');

      let status = 'absent';
      if (worked && record.status === 'late') status = 'late';
      else if (worked && ['present', 'half_day'].includes(record.status)) status = 'present';
      else if (onLeave || record?.status === 'on_leave') status = 'on_leave';
      else if (record?.status === 'late') status = 'late';
      else if (record && ['present', 'half_day'].includes(record.status)) status = 'present';

      if (status === 'late') {
        counts.late += 1;
      } else if (status === 'present') {
        counts.present += 1;
      } else if (status === 'on_leave') {
        counts.on_leave += 1;
      } else {
        counts.absent += 1;
      }

      const issue = issueStats.get(empId);
      if (status === 'late') issue.lateDays += 1;
      if (status === 'absent') issue.absentDays += 1;

      const deptKey = String(employee.departmentId?._id || 'unassigned');
      if (!departmentStats.has(deptKey)) {
        departmentStats.set(deptKey, {
          label: employee.departmentId?.name || 'Unassigned',
          attended: 0,
          total: 0,
          present: 0,
          late: 0,
          halfDay: 0,
          onLeave: 0,
          absent: 0,
        });
      }
      const dept = departmentStats.get(deptKey);
      dept.total += 1;
      if (status === 'present' || status === 'late') dept.attended += 1;
      if (record?.status === 'half_day' && status === 'present') dept.halfDay += 1;
      else if (status === 'present') dept.present += 1;
      else if (status === 'late') dept.late += 1;
      else if (status === 'on_leave') dept.onLeave += 1;
      else dept.absent += 1;
    }
  }

  const pct = (value) => (workingDaySlots ? Math.round((value / workingDaySlots) * 100) : 0);
  const topIssues = [...issueStats.values()]
    .filter((row) => row.lateDays > 0 || row.absentDays > 0)
    .sort((a, b) => (b.lateDays + b.absentDays) - (a.lateDays + a.absentDays) || a.employee.name.localeCompare(b.employee.name))
    .slice(0, 8)
    .map((row) => ({
      employeeId: row.employee._id,
      name: row.employee.name,
      code: row.employee.employeeId,
      lateDays: row.lateDays,
      absentDays: row.absentDays,
    }));

  const leaveByStatus = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  const leaveByType = { annual: 0, sick: 0, casual: 0, unpaid: 0 };
  let approvedLeaveDays = 0;
  for (const leave of leaves) {
    if (leaveByStatus[leave.status] !== undefined) leaveByStatus[leave.status] += 1;
    if (leave.status === 'approved') {
      if (leaveByType[leave.type] !== undefined) leaveByType[leave.type] += Number(leave.days) || 0;
      approvedLeaveDays += Number(leave.days) || 0;
    }
  }

  const completedRows = records.filter((row) => row.checkOut);
  const totalHours = completedRows.reduce((sum, row) => sum + (Number(row.workHours) || 0), 0);
  const overtimeHours = completedRows.reduce((sum, row) => sum + (Number(row.overtimeHours) || 0), 0);
  const hoursByEmployee = new Map();
  for (const row of completedRows) {
    const empId = String(row.employeeId?._id || row.employeeId);
    if (!hoursByEmployee.has(empId)) {
      hoursByEmployee.set(empId, {
        employeeId: empId,
        name: row.employeeId?.name || '—',
        code: row.employeeId?.employeeId || '',
        hours: 0,
        overtime: 0,
        days: 0,
      });
    }
    const bucket = hoursByEmployee.get(empId);
    bucket.hours += Number(row.workHours) || 0;
    bucket.overtime += Number(row.overtimeHours) || 0;
    bucket.days += 1;
  }
  const workingHoursRows = [...hoursByEmployee.values()]
    .map((row) => ({
      ...row,
      hours: Math.round(row.hours * 100) / 100,
      overtime: Math.round(row.overtime * 100) / 100,
      avg: row.days ? Math.round((row.hours / row.days) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const empById = new Map(scopedEmployees.map((emp) => [emp._id.toString(), emp]));
  const deptHeadcount = new Map();
  for (const emp of scopedEmployees) {
    const key = String(emp.departmentId?._id || 'unassigned');
    if (!deptHeadcount.has(key)) {
      deptHeadcount.set(key, {
        id: key,
        label: emp.departmentId?.name || 'Unassigned',
        employees: 0,
        managers: 0,
        incomplete: 0,
        designations: new Set(),
        hours: 0,
        overtime: 0,
        completedDays: 0,
        pendingLeaves: 0,
        approvedLeaves: 0,
        approvedLeaveDays: 0,
      });
    }
    const row = deptHeadcount.get(key);
    row.employees += 1;
    if (emp.userId?.role === 'manager') row.managers += 1;
    if (!emp.phone || !emp.designation || !emp.departmentId) row.incomplete += 1;
    if (emp.designation) row.designations.add(emp.designation);
  }

  for (const row of completedRows) {
    const emp = empById.get(String(row.employeeId?._id || row.employeeId));
    const key = String(emp?.departmentId?._id || row.employeeId?.departmentId || 'unassigned');
    const bucket = deptHeadcount.get(key);
    if (!bucket) continue;
    bucket.hours += Number(row.workHours) || 0;
    bucket.overtime += Number(row.overtimeHours) || 0;
    bucket.completedDays += 1;
  }

  for (const leave of leaves) {
    const emp = empById.get(String(leave.employeeId));
    const key = String(emp?.departmentId?._id || 'unassigned');
    const bucket = deptHeadcount.get(key);
    if (!bucket) continue;
    if (leave.status === 'pending') bucket.pendingLeaves += 1;
    if (leave.status === 'approved') {
      bucket.approvedLeaves += 1;
      bucket.approvedLeaveDays += Number(leave.days) || 0;
    }
  }

  const managerMap = new Map();
  for (const emp of scopedEmployees) {
    if (emp.userId?.role === 'manager') {
      managerMap.set(emp._id.toString(), {
        employeeId: emp._id,
        name: emp.name,
        code: emp.employeeId,
        department: emp.departmentId?.name || '—',
        teamSize: 0,
      });
    }
  }
  for (const emp of scopedEmployees) {
    const mgrId = emp.managerId?._id ? String(emp.managerId._id) : '';
    if (mgrId && managerMap.has(mgrId)) managerMap.get(mgrId).teamSize += 1;
  }

  const incompleteProfiles = scopedEmployees.filter((emp) => (
    !emp.phone || !emp.designation || !emp.departmentId
  )).map((emp) => ({
    employeeId: emp._id,
    name: emp.name,
    code: emp.employeeId,
    missing: [
      !emp.phone ? 'phone' : null,
      !emp.designation ? 'designation' : null,
      !emp.departmentId ? 'department' : null,
    ].filter(Boolean),
  }));

  const activityLogs = await AuditLog.find({
    timestamp: { $gte: start, $lte: end },
  })
    .select('action entity actorName actorRole timestamp')
    .sort({ timestamp: -1 })
    .limit(40);

  const performanceRows = scopedEmployees
    .map((emp) => {
      const perf = emp.performance || {};
      const scores = [perf.taskCompletion, perf.monthlyAttendance, perf.workQuality, perf.aptitude]
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n) && n > 0);
      const avg = scores.length
        ? Math.round((scores.reduce((sum, n) => sum + n, 0) / scores.length) * 10) / 10
        : null;
      return {
        employeeId: emp._id,
        name: emp.name,
        code: emp.employeeId,
        department: emp.departmentId?.name || '—',
        average: avg,
      };
    })
    .filter((row) => row.average != null)
    .sort((a, b) => b.average - a.average)
    .slice(0, 12);

  return {
    filters: {
      rangePreset: rangePreset || 'this_month',
      from: start.toISOString(),
      to: end.toISOString(),
      departmentId: departmentId || '',
    },
    tabs: ['employee', 'attendance', 'leave', 'working_hours', 'department', 'manager', 'activity', 'performance'],
    overview: {
      present: pct(counts.present),
      absent: pct(counts.absent),
      onLeave: pct(counts.on_leave),
      late: pct(counts.late),
    },
    departmentAttendance: [...departmentStats.values()]
      .map((row) => ({
        label: row.label,
        percent: row.total ? Math.round((row.attended / row.total) * 100) : 0,
        present: row.present || 0,
        late: row.late || 0,
        halfDay: row.halfDay || 0,
        onLeave: row.onLeave || 0,
        absent: row.absent || 0,
      }))
      .sort((a, b) => b.percent - a.percent),
    topAttendanceIssues: topIssues,
    departments: departments.map((dept) => ({ _id: dept._id, name: dept.name })),
    workingDaySlots,
    employeeReport: {
      total: scopedEmployees.length,
      managers: scopedEmployees.filter((emp) => emp.userId?.role === 'manager').length,
      employees: scopedEmployees.filter((emp) => emp.userId?.role !== 'manager').length,
      incomplete: incompleteProfiles.length,
      rows: scopedEmployees.slice(0, 40).map((emp) => ({
        employeeId: emp._id,
        name: emp.name,
        code: emp.employeeId,
        role: emp.userId?.role || 'employee',
        department: emp.departmentId?.name || '—',
        designation: emp.designation || '—',
        manager: emp.managerId?.name || '—',
      })),
      incompleteProfiles,
    },
    leaveReport: {
      byStatus: Object.entries(leaveByStatus).map(([label, value]) => ({ label, value })),
      byType: Object.entries(leaveByType).map(([label, value]) => ({ label, value })),
      pending: leaveByStatus.pending,
      approvedDays: approvedLeaveDays,
      total: leaves.length,
    },
    workingHoursReport: {
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      avgHours: completedRows.length ? Math.round((totalHours / completedRows.length) * 100) / 100 : 0,
      lowHours: workingHoursRows.filter((row) => row.avg > 0 && row.avg < 6).length,
      rows: workingHoursRows.slice(0, 20),
    },
    departmentReport: (() => {
      const workforce = scopedEmployees.length || 1;
      const sharePct = (value) => Math.round((value / workforce) * 100);
      const mixPct = (value, total) => (total ? Math.round((value / total) * 100) : 0);
      const rows = [...deptHeadcount.values()].map((row) => {
        const att = departmentStats.get(row.id)
          || [...departmentStats.values()].find((d) => d.label === row.label);
        const totalSlots = att?.total || 0;
        return {
          id: row.id,
          label: row.label,
          employees: row.employees,
          managers: row.managers,
          staff: Math.max(0, row.employees - row.managers),
          sharePercent: sharePct(row.employees),
          incomplete: row.incomplete,
          designations: [...row.designations].sort((a, b) => a.localeCompare(b)),
          attendancePercent: totalSlots ? Math.round((att.attended / totalSlots) * 100) : 0,
          presentDays: att?.present || 0,
          lateDays: att?.late || 0,
          halfDayDays: att?.halfDay || 0,
          leaveDays: att?.onLeave || 0,
          absentDays: att?.absent || 0,
          presentPercent: mixPct(att?.present, totalSlots),
          latePercent: mixPct(att?.late, totalSlots),
          halfDayPercent: mixPct(att?.halfDay, totalSlots),
          leavePercent: mixPct(att?.onLeave, totalSlots),
          absentPercent: mixPct(att?.absent, totalSlots),
          hours: Math.round(row.hours * 100) / 100,
          overtime: Math.round(row.overtime * 100) / 100,
          avgHours: row.completedDays ? Math.round((row.hours / row.completedDays) * 100) / 100 : 0,
          pendingLeaves: row.pendingLeaves,
          approvedLeaves: row.approvedLeaves,
          approvedLeaveDays: Math.round(row.approvedLeaveDays * 100) / 100,
        };
      }).sort((a, b) => b.employees - a.employees || a.label.localeCompare(b.label));

      const lowestAttendance = [...rows].sort((a, b) => a.attendancePercent - b.attendancePercent)[0] || null;
      return {
        summary: {
          departments: rows.length,
          people: scopedEmployees.length,
          largest: rows[0]?.label || '—',
          lowestAttendance: lowestAttendance?.label || '—',
          lowestAttendancePercent: lowestAttendance?.attendancePercent ?? 0,
          unassigned: rows.find((row) => row.id === 'unassigned')?.employees || 0,
        },
        rows,
      };
    })(),
    managerReport: [...managerMap.values()].sort((a, b) => b.teamSize - a.teamSize),
    activityReport: activityLogs.map((log) => ({
      action: log.action,
      entity: log.entity,
      actor: log.actorName || '—',
      role: log.actorRole || '',
      timestamp: log.timestamp,
    })),
    performanceReport: performanceRows,
  };
}

async function classifyTodayAttendance(employeeIds) {
  const today = startOfDay();
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const ids = (employeeIds || []).map((id) => id.toString());

  if (!ids.length) {
    return { loginRows: [], absentRows: [], onLeaveRows: [], absentToday: 0, onLeaveToday: 0 };
  }

  const [employees, records, leaves] = await Promise.all([
    Employee.find({
      _id: { $in: ids },
      employmentStatus: { $ne: 'inactive' },
    })
      .select('name employeeId userId employmentStatus')
      .populate('userId', 'role'),
    Attendance.find({ date: today, employeeId: { $in: ids } })
      .populate({
        path: 'employeeId',
        select: 'name employeeId userId',
        populate: { path: 'userId', select: 'role' },
      })
      .sort({ checkIn: -1 }),
    Leave.find({
      employeeId: { $in: ids },
      status: 'approved',
      startDate: { $lte: endOfToday },
      endDate: { $gte: today },
    }).select('employeeId type voidedDates'),
  ]);

  const recordByEmp = new Map(
    records.map((row) => [String(row.employeeId?._id || row.employeeId), row])
  );
  const leaveByEmp = new Map(
    leaves.map((row) => [String(row.employeeId), row])
  );

  const loginRows = [];
  const absentRows = [];
  const onLeaveRows = [];

  for (const emp of employees) {
    if (emp.userId?.role === 'admin') continue;
    const rec = recordByEmp.get(emp._id.toString());
    const leave = leaveByEmp.get(emp._id.toString());
    const workedToday = Boolean(rec?.checkIn && ['present', 'late', 'half_day'].includes(rec.status));
    const leaveStillCounts = Boolean(leave) && !isLeaveDayVoided(leave, today);
    const onLeave = !workedToday && (rec?.status === 'on_leave' || leaveStillCounts);

    if (onLeave) {
      onLeaveRows.push(
        rec
          ? { ...serializeAttendanceRow(rec), status: 'on_leave', notes: leave?.type ? `${leave.type} leave` : rec.notes }
          : {
            _id: `leave-${emp._id}`,
            date: today,
            checkIn: null,
            checkOut: null,
            workHours: 0,
            overtimeHours: 0,
            status: 'on_leave',
            notes: leave?.type ? `${leave.type} leave` : 'On leave',
            employeeId: emp,
          }
      );
      continue;
    }

    if (rec && ['present', 'late', 'half_day'].includes(rec.status) && rec.checkIn) {
      loginRows.push(serializeAttendanceRow(rec));
      continue;
    }

    if (!isWeekend(today)) {
      absentRows.push({
        _id: rec?._id || `absent-${emp._id}`,
        date: today,
        checkIn: rec?.checkIn || null,
        checkOut: rec?.checkOut || null,
        workHours: rec?.workHours || 0,
        overtimeHours: rec?.overtimeHours || 0,
        status: 'absent',
        notes: rec?.notes || 'No login today',
        employeeId: rec?.employeeId || emp,
      });
    }
  }

  return {
    loginRows,
    absentRows,
    onLeaveRows,
    absentToday: absentRows.length,
    onLeaveToday: onLeaveRows.length,
  };
}

function serializeAlertPerson(emp, extra = {}) {
  return {
    id: emp?._id || extra.id,
    label: emp?.name || extra.label || 'Employee',
    href: emp?._id ? `/employees/${emp._id}` : extra.href || '',
    meta: extra.meta || emp?.employeeId || '',
  };
}

async function buildAdminAlerts({ classified, adminProfileIds }) {
  const [pendingLeaves, pendingHires, incomplete] = await Promise.all([
    Leave.find({ status: 'pending' })
      .populate('employeeId', 'name employeeId')
      .sort({ createdAt: -1 })
      .limit(8),
    HireRequest.find({ status: 'pending' }).select('name employeeId').sort({ createdAt: -1 }).limit(8),
    Employee.find({
      employmentStatus: { $ne: 'inactive' },
      ...(adminProfileIds.length ? { _id: { $nin: adminProfileIds } } : {}),
      $or: [
        { phone: { $in: ['', null] } },
        { designation: { $in: ['', null] } },
        { departmentId: null },
      ],
    })
      .select('name employeeId phone designation departmentId')
      .limit(8),
  ]);

  const pendingLeaveCount = await Leave.countDocuments({ status: 'pending' });
  const pendingHireCount = await HireRequest.countDocuments({ status: 'pending' });
  const incompleteCount = await Employee.countDocuments({
    employmentStatus: { $ne: 'inactive' },
    ...(adminProfileIds.length ? { _id: { $nin: adminProfileIds } } : {}),
    $or: [
      { phone: { $in: ['', null] } },
      { designation: { $in: ['', null] } },
      { departmentId: null },
    ],
  });

  const missingCheckout = classified.loginRows.filter((row) => row.checkIn && !row.checkOut);
  const late = classified.loginRows.filter((row) => row.status === 'late');
  const lowHours = classified.loginRows.filter((row) => (
    row.status === 'half_day' || (row.checkOut && (Number(row.workHours) || 0) < 6)
  ));

  const alerts = [
    {
      id: 'pending-leaves',
      kind: 'leave',
      title: 'Pending leave requests',
      count: pendingLeaveCount,
      href: '/leaves',
      items: pendingLeaves.map((row) => serializeAlertPerson(row.employeeId, {
        meta: `${row.type} · ${row.days}d`,
        href: '/leaves',
      })),
    },
    {
      id: 'missing-checkin',
      kind: 'attendance',
      title: 'Missing check-ins today',
      count: classified.absentRows.length,
      href: '/attendance',
      items: classified.absentRows.slice(0, 8).map((row) => serializeAlertPerson(row.employeeId, { href: '/attendance' })),
    },
    {
      id: 'missing-checkout',
      kind: 'attendance',
      title: 'Missing check-outs',
      count: missingCheckout.length,
      href: '/attendance',
      items: missingCheckout.slice(0, 8).map((row) => serializeAlertPerson(row.employeeId, { href: '/attendance', meta: 'Still logged in' })),
    },
    {
      id: 'late',
      kind: 'attendance',
      title: 'Late arrivals today',
      count: late.length,
      href: '/attendance',
      items: late.slice(0, 8).map((row) => serializeAlertPerson(row.employeeId, { href: '/attendance' })),
    },
    {
      id: 'low-hours',
      kind: 'attendance',
      title: 'Low working hours',
      count: lowHours.length,
      href: '/attendance',
      items: lowHours.slice(0, 8).map((row) => serializeAlertPerson(row.employeeId, {
        href: '/attendance',
        meta: `${Number(row.workHours || 0).toFixed(1)}h`,
      })),
    },
    {
      id: 'incomplete-profiles',
      kind: 'employee',
      title: 'Incomplete profiles',
      count: incompleteCount,
      href: '/employees',
      items: incomplete.map((emp) => serializeAlertPerson(emp, {
        meta: [
          !emp.phone ? 'phone' : null,
          !emp.designation ? 'role' : null,
          !emp.departmentId ? 'dept' : null,
        ].filter(Boolean).join(', '),
      })),
    },
    {
      id: 'hire-requests',
      kind: 'hire',
      title: 'Pending hire requests',
      count: pendingHireCount,
      href: '/hire-requests',
      items: pendingHires.map((row) => ({
        id: row._id,
        label: row.name,
        href: `/hire-requests/${row._id}`,
        meta: row.employeeId,
      })),
    },
  ].filter((alert) => alert.count > 0);

  return alerts;
}

export async function getDashboard(req, res) {
  const role = req.user.role;

  if (role === 'admin') {
    const adminUserIds = await User.find({ role: 'admin' }).select('_id');
    const adminProfileIds = (
      await Employee.find({ userId: { $in: adminUserIds.map((u) => u._id) } }).select('_id')
    ).map((e) => e._id);

    const nonAdminFilter = adminProfileIds.length
      ? { _id: { $nin: adminProfileIds } }
      : {};

    const today = startOfDay();
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    const todayLeaveMatch = {
      startDate: { $lte: endOfToday },
      endDate: { $gte: today },
    };

    const [
      employees,
      managers,
      departments,
      pendingLeaves,
      approvedLeaves,
      presentToday,
      leaveByStatusRaw,
      attendanceTodayRaw,
      inactiveEmployees,
      openTasks,
      activeNonAdminTotal,
      workforceEmployees,
    ] = await Promise.all([
      User.countDocuments({ role: 'employee', status: 'active' }),
      User.countDocuments({ role: 'manager', status: 'active' }),
      Department.countDocuments({ status: 'active' }),
      Leave.countDocuments({ ...todayLeaveMatch, status: 'pending' }),
      Leave.countDocuments({ ...todayLeaveMatch, status: 'approved' }),
      Attendance.countDocuments({
        date: startOfDay(),
        status: { $in: ['present', 'late', 'half_day'] },
        ...(adminProfileIds.length ? { employeeId: { $nin: adminProfileIds } } : {}),
      }),
      Leave.aggregate([
        { $match: todayLeaveMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        {
          $match: {
            date: startOfDay(),
            ...(adminProfileIds.length ? { employeeId: { $nin: adminProfileIds } } : {}),
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Employee.countDocuments({ employmentStatus: 'inactive', ...nonAdminFilter }),
      Task.countDocuments({ status: { $in: ['assigned', 'in_progress'] } }),
      User.countDocuments({ role: { $in: ['employee', 'manager'] }, status: 'active' }),
      Employee.find(nonAdminFilter).select('_id'),
    ]);

    const classified = await classifyTodayAttendance(workforceEmployees.map((e) => e._id));
    const alerts = await buildAdminAlerts({ classified, adminProfileIds });

    const leaveStatusOrder = ['pending', 'approved', 'rejected', 'cancelled'];
    const leaveMap = Object.fromEntries(
      leaveByStatusRaw.map((row) => [row._id || 'unknown', row.count])
    );
    const leaveByStatus = leaveStatusOrder.map((status) => ({
      label: status,
      value: leaveMap[status] || 0,
    }));

    const attendanceStatusOrder = ['present', 'late', 'half_day', 'on_leave', 'absent'];
    const attendanceMap = Object.fromEntries(
      attendanceTodayRaw.map((row) => [row._id || 'unknown', row.count])
    );
    const attendanceToday = attendanceStatusOrder.map((status) => ({
      label: status === 'present' ? 'full day' : status.replace('_', ' '),
      value: attendanceMap[status] || 0,
      key: status,
    }));

    const visibleLogins = classified.loginRows;
    const stillLoggedIn = visibleLogins.filter((row) => row.checkIn && !row.checkOut).length;
    const loggedOut = visibleLogins.filter((row) => row.checkOut).length;
    const markedToday = attendanceToday.reduce((sum, row) => sum + row.value, 0);
    const attendanceSummary = summarizeAttendanceRows(visibleLogins);

    return success(res, {
      role,
      stats: {
        employees,
        managers,
        departments,
        pendingLeaves,
        approvedLeaves,
        presentToday,
        inactiveEmployees,
        openTasks,
        absentToday: classified.absentToday,
        onLeaveToday: classified.onLeaveToday,
        ...attendanceSummary,
      },
      charts: {
        workforce: [
          { label: 'Employees', value: employees },
          { label: 'Managers', value: managers },
          { label: 'Inactive', value: inactiveEmployees },
        ],
        leaveByStatus,
        attendanceToday,
        attendanceMeta: {
          workforce: activeNonAdminTotal,
          markedToday,
          stillLoggedIn,
          loggedOut,
          presentRate: activeNonAdminTotal
            ? Math.round((presentToday / activeNonAdminTotal) * 100)
            : 0,
          ...attendanceSummary,
        },
      },
      todayLogins: visibleLogins,
      todayAbsent: classified.absentRows,
      todayOnLeave: classified.onLeaveRows,
      alerts,
    });
  }

  if (role === 'manager') {
    const team = await Employee.find({ managerId: req.user.employeeProfile }).select('_id');
    const teamIds = team.map((t) => t._id);
    const [teamSize, pendingLeaves, presentToday, myTasks, myAttendance, classified, me] = await Promise.all([
      teamIds.length,
      Leave.countDocuments({ employeeId: { $in: teamIds }, status: 'pending' }),
      Attendance.countDocuments({
        employeeId: { $in: teamIds },
        date: startOfDay(),
        status: { $in: ['present', 'late', 'half_day'] },
      }),
      Task.find({
        assignedTo: req.user.employeeProfile,
        status: { $in: ['assigned', 'in_progress'] },
      }).sort({ deadline: 1, assignedAt: -1 }),
      Attendance.findOne({ employeeId: req.user.employeeProfile, date: startOfDay() }),
      classifyTodayAttendance(teamIds),
      Employee.findById(req.user.employeeProfile)
        .select('name employeeId designation departmentId managerId')
        .populate('departmentId', 'name')
        .populate('managerId', 'name employeeId'),
    ]);

    const attendanceSummary = summarizeAttendanceRows(classified.loginRows);
    const teamPresentRate = teamIds.length
      ? Math.round((presentToday / teamIds.length) * 100)
      : 0;

    return success(res, {
      role,
      stats: {
        teamSize,
        pendingLeaves,
        presentToday,
        absentToday: classified.absentToday,
        onLeaveToday: classified.onLeaveToday,
        presentRate: teamPresentRate,
        openTasks: myTasks.length,
        ...attendanceSummary,
      },
      attendanceToday: [
        { label: 'full day', value: attendanceSummary.fullDayToday, key: 'present' },
        { label: 'late', value: attendanceSummary.lateToday, key: 'late' },
        { label: 'half day', value: attendanceSummary.halfDayToday, key: 'half_day' },
        { label: 'on leave', value: classified.onLeaveToday, key: 'on_leave' },
        { label: 'absent', value: classified.absentToday, key: 'absent' },
      ],
      tasks: myTasks,
      todayLogins: classified.loginRows,
      todayAbsent: classified.absentRows,
      todayOnLeave: classified.onLeaveRows,
      myAttendance,
      profile: me,
    });
  }

  const employee = await Employee.findById(req.user.employeeProfile)
    .populate('departmentId', 'name')
    .populate('managerId', 'name employeeId');
  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const [myLeavesPending, todayAttendance, assignedTasks, recentLeaves, monthAttendance] = await Promise.all([
    Leave.countDocuments({ employeeId: req.user.employeeProfile, status: 'pending' }),
    Attendance.findOne({ employeeId: req.user.employeeProfile, date: today }),
    Task.find({
      assignedTo: req.user.employeeProfile,
      status: { $in: ['assigned', 'in_progress'] },
    })
      .populate('assignedBy', 'email employeeId')
      .sort({ deadline: 1, assignedAt: -1 }),
    Leave.find({
      employeeId: req.user.employeeProfile,
      $or: [{ status: 'pending' }, { decisionAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }],
    })
      .populate({
        path: 'approvedBy',
        select: 'email role employeeProfile',
        populate: { path: 'employeeProfile', select: 'name' },
      })
      .sort({ updatedAt: -1 })
      .limit(5),
    Attendance.find({
      employeeId: req.user.employeeProfile,
      date: { $gte: monthStart, $lte: monthEnd },
    }).select('overtimeHours'),
  ]);

  const overtimeHoursThisMonth = Math.round(
    monthAttendance.reduce((sum, row) => sum + (Number(row.overtimeHours) || 0), 0) * 100
  ) / 100;

  return success(res, {
    role,
    stats: {
      leaveBalance: employee?.leaveBalance || {},
      pendingLeaves: myLeavesPending,
      todayAttendance,
      overtimeHoursThisMonth,
      department: employee?.departmentId || null,
      manager: employee?.managerId || null,
      openTasks: assignedTasks.length,
    },
    profile: employee,
    tasks: assignedTasks,
    recentLeaves,
  });
}

export async function getReports(req, res) {
  if (req.user.role === 'admin') {
    const report = await buildAdminAttendanceReport({
      departmentId: req.query.departmentId,
      rangePreset: req.query.range || 'this_month',
      from: req.query.from,
      to: req.query.to,
    });
    return success(res, report);
  }

  if (req.user.role === 'manager') {
    const team = await Employee.find({ managerId: req.user.employeeProfile }).select('_id');
    const teamIds = team.map((t) => t._id);
    const leaveByStatus = await Leave.aggregate([
      { $match: { employeeId: { $in: teamIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const attendanceByStatus = await Attendance.aggregate([
      { $match: { employeeId: { $in: teamIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return success(res, { leaveByStatus, attendanceByStatus, teamSize: teamIds.length });
  }

  const leaveByStatus = await Leave.aggregate([
    { $match: { employeeId: req.user.employeeProfile } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return success(res, { leaveByStatus });
}
