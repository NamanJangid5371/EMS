import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import Leave from '../models/Leave.js';
import Holiday from '../models/Holiday.js';

/** Standard shift: 10:00 – 19:00 (9 hours), with a 30-minute buffer */
export const WORK_START_HOUR = 10;
export const WORK_END_HOUR = 19;
export const BUFFER_MINUTES = 30;
export const STANDARD_HOURS = 9;
export const HALF_DAY_HOURS = 6;

export function startOfDay(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function atHourOnDate(baseDate, hour, minute = 0) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function roundHours(value) {
  return Math.round(value * 100) / 100;
}

function isWeekend(date) {
  const day = startOfDay(date).getDay();
  return day === 0 || day === 6;
}

export function isLeaveDayVoided(leave, date) {
  const key = startOfDay(date).getTime();
  return (leave.voidedDates || []).some((value) => startOfDay(value).getTime() === key);
}

/**
 * If the person logs in on an approved leave day, that day is present
 * and is not counted as leave (balance is restored for that day).
 */
export async function voidLeaveDayIfWorked(employeeId, day = new Date()) {
  if (!employeeId) return { voided: false };
  const today = startOfDay(day);
  if (isWeekend(today)) return { voided: false };

  const covering = await Leave.findOne({
    employeeId,
    status: 'approved',
    startDate: { $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
    endDate: { $gte: today },
  });
  if (!covering) return { voided: false };

  const start = startOfDay(covering.startDate).getTime();
  const end = startOfDay(covering.endDate).getTime();
  if (today.getTime() < start || today.getTime() > end) return { voided: false };
  if (isLeaveDayVoided(covering, today)) return { voided: false, already: true };

  const holidays = await Holiday.find({}).select('date');
  const holidayKeys = new Set(holidays.map((h) => startOfDay(h.date).getTime()));
  if (holidayKeys.has(today.getTime())) return { voided: false };

  covering.voidedDates = [...(covering.voidedDates || []), today];
  covering.days = Math.max(0, Number(covering.days) || 0) - 1;
  await covering.save();

  const employee = await Employee.findById(employeeId);
  if (employee) {
    if (covering.type !== 'unpaid' && employee.leaveBalance?.[covering.type] !== undefined) {
      employee.leaveBalance[covering.type] += 1;
    }
    if (employee.employmentStatus === 'on_leave') {
      employee.employmentStatus = 'active';
    }
    await employee.save();
  }

  return { voided: true, leave: covering };
}

/**
 * Standard office: 10:00–19:00 (9 hours).
 * 30-minute buffer: login at or before 10:30 is on time (not late).
 * Work of 9h–9h30m has no overtime; extra beyond 9h + 30m is overtime.
 */
export function evaluateAttendance(checkIn, checkOut) {
  if (!checkIn) {
    return { status: 'absent', workHours: 0, overtimeHours: 0 };
  }

  const login = new Date(checkIn);
  const day = startOfDay(login);
  const workStart = atHourOnDate(day, WORK_START_HOUR);
  const standardPlusBufferHours = STANDARD_HOURS + BUFFER_MINUTES / 60;

  // Late only when login is after the buffer window (e.g. after 10:30).
  // Login before/at grace end, or before office start, is never late.
  const delayMinutes = (login.getTime() - workStart.getTime()) / (60 * 1000);
  const isLateLogin = delayMinutes > BUFFER_MINUTES;

  if (!checkOut) {
    return {
      status: isLateLogin ? 'late' : 'present',
      workHours: 0,
      overtimeHours: 0,
    };
  }

  const logout = new Date(checkOut);
  const workHours = roundHours(Math.max(0, (logout - login) / (1000 * 60 * 60)));
  const overtimeHours = workHours > standardPlusBufferHours
    ? roundHours(workHours - STANDARD_HOURS)
    : 0;

  let status;
  if (workHours < HALF_DAY_HOURS) {
    status = 'half_day';
  } else if (isLateLogin) {
    status = 'late';
  } else {
    status = 'present';
  }

  return { status, workHours, overtimeHours };
}

export async function recordEmployeeLogin(employeeProfileId) {
  if (!employeeProfileId) return null;

  const voided = await voidLeaveDayIfWorked(employeeProfileId);

  const today = startOfDay();
  const now = new Date();
  let record = await Attendance.findOne({
    employeeId: employeeProfileId,
    date: today,
  });

  const cameInOnLeave = Boolean(voided.voided || voided.already || record?.status === 'on_leave');
  const presentNote = cameInOnLeave
    ? 'Logged in on a leave day — counted as present; this day is not leave'
    : 'Auto check-in on login';

  if (!record) {
    const evaluated = evaluateAttendance(now, null);
    record = await Attendance.create({
      employeeId: employeeProfileId,
      date: today,
      status: evaluated.status,
      checkIn: now,
      checkOut: null,
      workHours: 0,
      overtimeHours: 0,
      notes: presentNote,
    });
    return record;
  }

  if (!record.checkIn) {
    record.checkIn = now;
  }

  const evaluated = evaluateAttendance(record.checkIn, record.checkOut);
  record.status = evaluated.status;
  record.workHours = evaluated.workHours;
  record.overtimeHours = evaluated.overtimeHours;
  record.notes = presentNote;
  await record.save();

  return record;
}

export async function recordEmployeeLogout(employeeProfileId) {
  if (!employeeProfileId) return null;

  const today = startOfDay();
  const now = new Date();
  let record = await Attendance.findOne({
    employeeId: employeeProfileId,
    date: today,
  });

  if (!record) {
    const evaluated = evaluateAttendance(now, now);
    record = await Attendance.create({
      employeeId: employeeProfileId,
      date: today,
      status: evaluated.status,
      checkIn: now,
      checkOut: now,
      workHours: evaluated.workHours,
      overtimeHours: evaluated.overtimeHours,
      notes: 'Auto check-out on logout (no prior check-in)',
    });
    return record;
  }

  const checkIn = record.checkIn || now;
  record.checkIn = checkIn;
  record.checkOut = now;
  const evaluated = evaluateAttendance(checkIn, now);
  record.status = evaluated.status;
  record.workHours = evaluated.workHours;
  record.overtimeHours = evaluated.overtimeHours;
  record.notes = 'Auto check-out on logout';
  await record.save();
  return record;
}

/** Fix wrongly marked late rows that were still inside the login buffer. */
export async function repairBufferedLateStatuses(day = new Date()) {
  const date = startOfDay(day);
  const rows = await Attendance.find({
    date,
    status: 'late',
    checkIn: { $ne: null },
  });

  let fixed = 0;
  for (const row of rows) {
    if (row.status === 'on_leave') continue;
    const evaluated = evaluateAttendance(row.checkIn, row.checkOut);
    if (evaluated.status === row.status
      && evaluated.workHours === row.workHours
      && evaluated.overtimeHours === row.overtimeHours) {
      continue;
    }
    row.status = evaluated.status;
    row.workHours = evaluated.workHours;
    row.overtimeHours = evaluated.overtimeHours;
    await row.save();
    fixed += 1;
  }
  return fixed;
}

/** Persist past weekday no-shows as absent so profiles keep a lasting record. */
export async function materializePastAbsences(employeeId, joiningDate) {
  if (!employeeId) return { created: 0 };

  const today = startOfDay();
  const start = startOfDay(joiningDate || new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  if (start.getTime() >= today.getTime()) return { created: 0 };

  const [records, holidays, leaves] = await Promise.all([
    Attendance.find({
      employeeId,
      date: { $gte: start, $lt: today },
    }).select('date status'),
    Holiday.find({
      date: { $gte: start, $lt: today },
    }).select('date'),
    Leave.find({
      employeeId,
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: start },
    }).select('startDate endDate voidedDates'),
  ]);

  const existing = new Set(records.map((row) => startOfDay(row.date).getTime()));
  const holidayKeys = new Set(holidays.map((row) => startOfDay(row.date).getTime()));
  const toCreate = [];

  for (let cursor = new Date(start); cursor.getTime() < today.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    const day = startOfDay(cursor);
    const key = day.getTime();
    if (isWeekend(day) || holidayKeys.has(key) || existing.has(key)) continue;

    const coveredByLeave = leaves.some((leave) => {
      const from = startOfDay(leave.startDate).getTime();
      const to = startOfDay(leave.endDate).getTime();
      return key >= from && key <= to && !isLeaveDayVoided(leave, day);
    });
    if (coveredByLeave) continue;

    toCreate.push({
      employeeId,
      date: day,
      status: 'absent',
      checkIn: null,
      checkOut: null,
      workHours: 0,
      overtimeHours: 0,
      notes: 'Absent — no login',
    });
  }

  if (!toCreate.length) return { created: 0 };
  try {
    await Attendance.insertMany(toCreate, { ordered: false });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  return { created: toCreate.length };
}
