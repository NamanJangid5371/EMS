import { body } from 'express-validator';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { startOfDay } from '../services/attendanceService.js';
import { notifyLeaveRequest } from '../utils/leaveNotification.js';
import { notifyLeaveDecision } from '../utils/hrEmails.js';
import { createNotifications, notifyAdminsAndManager } from '../utils/notify.js';
import { verifyLeaveEmailToken } from '../utils/leaveEmailToken.js';
import config from '../config/index.js';
import User from '../models/User.js';

/** Office is closed Sat/Sun — these days never count toward leave. */
function isOfficeOffDay(date) {
  const day = startOfDay(date).getDay();
  return day === 0 || day === 6;
}

/** Working weekdays in the leave range (excludes Saturday, Sunday, and holidays). */
function eachLeaveDay(startDate, endDate, holidayKeys = new Set()) {
  const days = [];
  const cursor = startOfDay(startDate);
  const last = startOfDay(endDate);
  while (cursor <= last) {
    const key = startOfDay(cursor).getTime();
    if (!isOfficeOffDay(cursor) && !holidayKeys.has(key)) {
      days.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

async function getHolidayKeySet() {
  const holidays = await Holiday.find({}).select('date');
  return new Set(holidays.map((h) => startOfDay(h.date).getTime()));
}

function populateLeave(query) {
  return query
    .populate({
      path: 'employeeId',
      select: 'name employeeId userId',
      populate: { path: 'userId', select: 'role' },
    })
    .populate({
      path: 'approvedBy',
      select: 'email employeeId role employeeProfile',
      populate: { path: 'employeeProfile', select: 'name' },
    })
    .populate({
      path: 'previousDecision.approvedBy',
      select: 'email role employeeProfile',
      populate: { path: 'employeeProfile', select: 'name' },
    });
}

async function applyApprovedLeaveToEmployee(leave) {
  const employee = await Employee.findById(leave.employeeId);
  if (!employee) return;

  const holidayKeys = await getHolidayKeySet();
  const today = startOfDay();
  const leaveDays = eachLeaveDay(leave.startDate, leave.endDate, holidayKeys);
  const voidedKeys = new Set((leave.voidedDates || []).map((d) => startOfDay(d).getTime()));

  for (const date of leaveDays) {
    const day = startOfDay(date);
    const existing = await Attendance.findOne({ employeeId: employee._id, date: day });
    if (existing?.checkIn) {
      voidedKeys.add(day.getTime());
      continue;
    }
    await Attendance.findOneAndUpdate(
      { employeeId: employee._id, date: day },
      {
        $set: {
          status: 'on_leave',
          checkIn: null,
          checkOut: null,
          workHours: 0,
          overtimeHours: 0,
          notes: `Approved ${leave.type} leave`,
        },
      },
      { upsert: true, new: true }
    );
  }

  leave.voidedDates = [...voidedKeys].map((key) => new Date(key));
  const counted = leaveDays.filter((day) => !voidedKeys.has(startOfDay(day).getTime())).length;
  leave.days = counted;
  await leave.save();

  if (leave.type !== 'unpaid' && employee.leaveBalance?.[leave.type] !== undefined) {
    employee.leaveBalance[leave.type] = Math.max(0, employee.leaveBalance[leave.type] - counted);
  }

  const coversTodayAsLeave = leaveDays.some((day) => {
    const key = startOfDay(day).getTime();
    return key === today.getTime() && !voidedKeys.has(key);
  });
  if (coversTodayAsLeave && employee.employmentStatus === 'active') {
    employee.employmentStatus = 'on_leave';
  } else if (!coversTodayAsLeave && employee.employmentStatus === 'on_leave') {
    employee.employmentStatus = 'active';
  }
  await employee.save();

  // Never keep leave marks on office off days (Sat/Sun) inside the range.
  const cursor = startOfDay(leave.startDate);
  const last = startOfDay(leave.endDate);
  const weekendCleanups = [];
  while (cursor <= last) {
    if (isOfficeOffDay(cursor) || holidayKeys.has(startOfDay(cursor).getTime())) {
      weekendCleanups.push(
        Attendance.deleteOne({
          employeeId: employee._id,
          date: new Date(cursor),
          status: 'on_leave',
        })
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  await Promise.all(weekendCleanups);
}

async function reverseApprovedLeaveFromEmployee(leave) {
  const employee = await Employee.findById(leave.employeeId);
  if (!employee) return;

  if (leave.type !== 'unpaid' && employee.leaveBalance?.[leave.type] !== undefined) {
    employee.leaveBalance[leave.type] += Number(leave.days) || 0;
  }

  const holidayKeys = await getHolidayKeySet();
  const leaveDays = eachLeaveDay(leave.startDate, leave.endDate, holidayKeys);
  const otherApproved = await Leave.find({
    _id: { $ne: leave._id },
    employeeId: employee._id,
    status: 'approved',
  }).select('startDate endDate');

  const coveredByOther = new Set();
  otherApproved.forEach((other) => {
    eachLeaveDay(other.startDate, other.endDate, holidayKeys).forEach((day) => {
      coveredByOther.add(startOfDay(day).getTime());
    });
  });

  await Promise.all(
    leaveDays
      .filter((date) => !coveredByOther.has(startOfDay(date).getTime()))
      .map((date) =>
        Attendance.deleteOne({
          employeeId: employee._id,
          date: startOfDay(date),
          status: 'on_leave',
        })
      )
  );

  const today = startOfDay();
  const thisLeaveCoversToday = leaveDays.some((day) => startOfDay(day).getTime() === today.getTime());
  if (
    thisLeaveCoversToday
    && employee.employmentStatus === 'on_leave'
    && !coveredByOther.has(today.getTime())
  ) {
    employee.employmentStatus = 'active';
  }

  await employee.save();
}

async function dayCount(start, end) {
  const holidayKeys = await getHolidayKeySet();
  return eachLeaveDay(start, end, holidayKeys).length;
}

async function applyLeaveDecision(leave, { status, note, actorUser, via = 'portal', override = false }) {
  const previousStatus = leave.status;
  if (previousStatus === status) {
    return { ok: false, status: 400, message: `Leave is already ${status}` };
  }
  if (previousStatus === 'cancelled') {
    return { ok: false, status: 400, message: 'Cancelled leave cannot be updated' };
  }
  if (previousStatus !== 'pending' && !override) {
    return { ok: false, status: 400, message: 'Leave already processed' };
  }

  let nextDays = leave.days;
  if (status === 'approved') {
    nextDays = await dayCount(leave.startDate, leave.endDate);
    if (nextDays < 1) {
      return { ok: false, status: 400, message: 'Leave covers only Saturday/Sunday/holidays (office off days); nothing to approve' };
    }
  }

  if (override) {
    leave.previousDecision = {
      status: previousStatus,
      approvedBy: leave.approvedBy,
      decisionNote: leave.decisionNote,
      decisionAt: leave.decisionAt,
    };
  }

  if (previousStatus === 'approved' && status !== 'approved') {
    await reverseApprovedLeaveFromEmployee(leave);
  }

  leave.status = status;
  leave.approvedBy = actorUser._id;
  leave.decisionAt = new Date();
  leave.decisionNote = note;
  if (status === 'approved') {
    leave.days = nextDays;
  }

  await leave.save();

  if (status === 'approved' && previousStatus !== 'approved') {
    await applyApprovedLeaveToEmployee(leave);
  }

  await writeAudit({
    userId: actorUser._id,
    action: override ? `leave_override_${status}` : `leave_${status}`,
    entity: 'leave',
    entityId: leave._id.toString(),
    meta: {
      employeeId: leave.employeeId.toString(),
      decidedBy: actorUser.role,
      via,
      override,
      previousStatus,
    },
  });

  const employee = await Employee.findById(leave.employeeId).select('name email userId managerId');
  const overridePrefix = override ? 'Admin overrode the previous decision. ' : '';
  if (employee?.userId) {
    await createNotifications({
      recipientUserIds: [employee.userId],
      title: override ? `Leave ${status} (admin override)` : `Leave ${status}`,
      message: `${overridePrefix}Your ${leave.type} leave was ${status}${note ? `: ${note}` : '.'}`,
      type: 'approval',
      link: '/leaves',
      entity: 'leave',
      entityId: leave._id,
    });
  }
  try {
    await notifyAdminsAndManager({
      managerEmployeeId: employee?.managerId,
      actorUserId: actorUser._id,
      title: override
        ? `Leave override · ${employee?.name || 'Employee'}`
        : `Leave ${status} · ${employee?.name || 'Employee'}`,
      message: override
        ? `Admin changed ${employee?.name || 'an employee'}'s ${leave.type} leave from ${previousStatus} to ${status}${note ? `: ${note}` : '.'}`
        : `${employee?.name || 'An employee'}'s ${leave.type} leave was ${status}${note ? `: ${note}` : '.'}`,
      type: 'leave',
      link: '/leaves',
      entity: 'leave',
      entityId: leave._id,
    });
  } catch (err) {
    console.error('Leave decision in-app notification failed:', err.message);
  }
  try {
    await notifyLeaveDecision(leave, employee || leave.employeeId, status, note);
  } catch (err) {
    console.error('Leave decision email failed:', err.message);
  }

  return { ok: true, employee };
}

function decisionPage({ title, message, tone = 'ok', form = null }) {
  const accent = tone === 'error' ? '#b42318' : tone === 'warn' ? '#b54708' : '#0f6b4c';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;background:#f3f6f4;font-family:'Segoe UI',Arial,sans-serif;color:#14241c;">
  <div style="max-width:560px;margin:48px auto;background:#fff;border:1px solid #d5e0d9;border-radius:16px;overflow:hidden;">
    <div style="background:#0d3b2c;color:#e8f5ef;padding:20px 24px;border-top:4px solid ${accent};">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Appinop EMS</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px;">${title}</div>
    </div>
    <div style="padding:24px;font-size:15px;line-height:1.6;color:#14241c;">
      <p style="margin:0 0 16px;">${message}</p>
      ${form || ''}
    </div>
    <div style="padding:12px 24px;background:#f7fbf9;color:#5c6f64;font-size:12px;">Leave decision · Appinop Employee Management System</div>
  </div>
</body>
</html>`;
}

function escapePage(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function showLeaveEmailAction(req, res) {
  try {
    const payload = verifyLeaveEmailToken(req.query.token);
  if (!payload) {
    return res.status(400).send(decisionPage({
      title: 'Link expired',
      message: 'This email link is invalid or has expired. Open the manager portal to decide the leave.',
      tone: 'error',
    }));
  }

  const leave = await Leave.findById(payload.leaveId)
    .populate({ path: 'employeeId', select: 'name employeeId managerId', populate: { path: 'userId', select: 'role' } });
  if (!leave) {
    return res.status(404).send(decisionPage({
      title: 'Leave not found',
      message: 'This leave request is no longer available.',
      tone: 'error',
    }));
  }
  if (leave.status !== 'pending') {
    return res.send(decisionPage({
      title: 'Already decided',
      message: `This leave was already ${escapePage(leave.status)}.`,
      tone: 'warn',
    }));
  }

  const action = payload.action === 'reject' ? 'reject' : 'approve';
  const applicant = leave.employeeId?.name || 'the employee';
  const form = `
    <form method="post" action="${escapePage(`${config.apiPublicUrl}/api/leaves/email-action`)}">
      <input type="hidden" name="token" value="${escapePage(req.query.token)}"/>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-weight:600;margin-bottom:6px;">Comment ${action === 'reject' ? '(required)' : '(optional)'}</label>
        <textarea name="decisionNote" rows="4" style="width:100%;box-sizing:border-box;border:1px solid #d5e0d9;border-radius:10px;padding:10px 12px;font:inherit;" ${action === 'reject' ? 'required' : ''} placeholder="${action === 'reject' ? 'Reason for rejection' : 'Optional note for the employee'}">${action === 'approve' ? 'Approved from email' : ''}</textarea>
      </div>
      <button type="submit" style="border:0;border-radius:10px;padding:12px 18px;background:${action === 'reject' ? '#b42318' : '#0f6b4c'};color:#fff;font-weight:700;cursor:pointer;">
        Confirm ${action}
      </button>
    </form>`;

  return res.send(decisionPage({
    title: action === 'reject' ? 'Reject leave' : 'Approve leave',
    message: `Confirm you want to <strong>${action}</strong> ${escapePage(applicant)}'s leave request.`,
    form,
  }));
  } catch (err) {
    console.error('Leave email preview failed:', err);
    return res.status(500).send(decisionPage({
      title: 'Something went wrong',
      message: 'This leave link could not be opened. Use the manager portal instead.',
      tone: 'error',
    }));
  }
}

export async function submitLeaveEmailAction(req, res) {
  try {
    const payload = verifyLeaveEmailToken(req.body.token || req.query.token);
  if (!payload) {
    return res.status(400).send(decisionPage({
      title: 'Link expired',
      message: 'This email link is invalid or has expired. Open the manager portal to decide the leave.',
      tone: 'error',
    }));
  }

  const status = payload.action === 'reject' ? 'rejected' : 'approved';
  const note = String(req.body.decisionNote || '').trim() || (status === 'approved' ? 'Approved from email' : '');
  if (status === 'rejected' && !note) {
    return res.status(400).send(decisionPage({
      title: 'Comment required',
      message: 'Add a rejection reason, then try the email link again.',
      tone: 'error',
    }));
  }

  const actorUser = await User.findById(payload.managerUserId);
  if (!actorUser || actorUser.role !== 'manager' || actorUser.status !== 'active') {
    return res.status(403).send(decisionPage({
      title: 'Not allowed',
      message: 'Only the assigned manager can use this email link.',
      tone: 'error',
    }));
  }

  const leave = await Leave.findById(payload.leaveId);
  if (!leave) {
    return res.status(404).send(decisionPage({
      title: 'Leave not found',
      message: 'This leave request is no longer available.',
      tone: 'error',
    }));
  }
  if (leave.status !== 'pending') {
    return res.send(decisionPage({
      title: 'Already decided',
      message: `This leave was already ${escapePage(leave.status)}.`,
      tone: 'warn',
    }));
  }

  const employee = await Employee.findById(leave.employeeId).populate('userId', 'role');
  if (!employee?.managerId || employee.managerId.toString() !== String(actorUser.employeeProfile)) {
    return res.status(403).send(decisionPage({
      title: 'Not allowed',
      message: 'This leave is not assigned to your team.',
      tone: 'error',
    }));
  }
  if (employee.userId?.role === 'manager') {
    return res.status(403).send(decisionPage({
      title: 'Admin approval needed',
      message: 'Manager leave requests must be approved by an admin.',
      tone: 'error',
    }));
  }

  const result = await applyLeaveDecision(leave, { status, note, actorUser, via: 'email' });
  if (!result.ok) {
    return res.status(result.status).send(decisionPage({
      title: 'Could not update leave',
      message: escapePage(result.message),
      tone: 'error',
    }));
  }

  return res.send(decisionPage({
    title: status === 'approved' ? 'Leave approved' : 'Leave rejected',
    message: `${escapePage(employee.name)}'s leave has been <strong>${status}</strong>. The employee will be notified.`,
  }));
  } catch (err) {
    console.error('Leave email action failed:', err);
    return res.status(500).send(decisionPage({
      title: 'Something went wrong',
      message: 'The leave action could not be completed. Try again from the manager portal.',
      tone: 'error',
    }));
  }
}

/**
 * Fix leave.days / balances / weekend attendance that previously counted Sat/Sun.
 */
export async function repairWeekendLeaveAccounting() {
  let leaveFixed = 0;
  let balanceRefunded = 0;
  let attendanceCleared = 0;

  const leaves = await Leave.find({ status: { $in: ['approved', 'pending'] } });
  for (const leave of leaves) {
    const correctDays = await dayCount(leave.startDate, leave.endDate);
    const previousDays = Number(leave.days) || 0;
    const overDeducted = previousDays - correctDays;

    if (leave.status === 'approved' && leave.type !== 'unpaid' && overDeducted > 0) {
      const employee = await Employee.findById(leave.employeeId);
      if (employee?.leaveBalance?.[leave.type] !== undefined) {
        employee.leaveBalance[leave.type] += overDeducted;
        await employee.save();
        balanceRefunded += overDeducted;
      }
    }

    if (previousDays !== correctDays) {
      leave.days = correctDays;
      await leave.save();
      leaveFixed += 1;
    }
  }

  const onLeaveRows = await Attendance.find({ status: 'on_leave' }).select('_id date');
  for (const row of onLeaveRows) {
    if (isOfficeOffDay(row.date)) {
      await Attendance.deleteOne({ _id: row._id });
      attendanceCleared += 1;
    }
  }

  return { leaveFixed, balanceRefunded, attendanceCleared };
}

export const applyLeaveValidators = [
  body('type').isIn(['annual', 'sick', 'casual', 'unpaid']),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('reason').isString().trim().notEmpty(),
];

export async function listLeaves(req, res) {
  const { status, page = 1, limit = 20, mine, history } = req.query;
  const filter = {};

  if (req.user.role === 'employee') {
    filter.employeeId = req.user.employeeProfile;
  } else if (req.user.role === 'manager') {
    if (mine === '1' || mine === 'true') {
      filter.employeeId = req.user.employeeProfile;
    } else {
      const team = await Employee.find({ managerId: req.user.employeeProfile }).select('_id');
      filter.employeeId = { $in: team.map((t) => t._id) };
    }
  }

  if (status) filter.status = status;
  if (req.query.employeeId) {
    if (req.user.role === 'admin') {
      filter.employeeId = req.query.employeeId;
    } else if (req.user.role === 'manager') {
      const employee = await Employee.findById(req.query.employeeId);
      const managerEmpId = req.user.employeeProfile?.toString();
      const isSelf = Boolean(managerEmpId && employee && employee._id.toString() === managerEmpId);
      const ownsTeamMember = Boolean(
        managerEmpId && employee?.managerId && employee.managerId.toString() === managerEmpId
      );
      if (!employee || (!isSelf && !ownsTeamMember)) {
        return fail(res, 'Forbidden', 403);
      }
      filter.employeeId = req.query.employeeId;
    }
  }

  // Leaves inbox: keep pending + decisions from the last 24 hours.
  // history=1 (profiles) returns full leave records.
  const includeHistory = history === '1' || history === 'true';
  if (!includeHistory) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    filter.$or = [{ status: 'pending' }, { decisionAt: { $gte: cutoff } }];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const total = await Leave.countDocuments(filter);
  const items = await populateLeave(
    Leave.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
  );

  return success(res, {
    items,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 0,
  });
}

export async function applyLeave(req, res) {
  if (!req.user.employeeProfile) return fail(res, 'No employee profile linked', 400);

  const days = await dayCount(req.body.startDate, req.body.endDate);
  if (days < 1) {
    return fail(res, 'Selected dates fall only on Saturday/Sunday/holidays (office off days). Leave is not required.', 400);
  }

  const employee = await Employee.findById(req.user.employeeProfile)
    .populate('departmentId', 'name')
    .populate('managerId', 'name email notificationEmail employeeId');
  if (!employee) return fail(res, 'Employee profile not found', 404);

  if (req.body.type !== 'unpaid') {
    const balance = employee.leaveBalance?.[req.body.type] ?? 0;
    if (balance < days) {
      return fail(res, `Insufficient ${req.body.type} leave balance`, 400);
    }
  }

  const leave = await Leave.create({
    employeeId: employee._id,
    type: req.body.type,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    reason: req.body.reason,
    days,
    status: 'pending',
  });

  let notification = { sent: false };
  try {
    notification = await notifyLeaveRequest(leave, employee, { role: req.user.role });
  } catch (err) {
    console.error('Leave notification failed:', err.message);
  }

  try {
    const recipientIds = [];
    const admins = await User.find({ role: 'admin', status: 'active' }).select('_id');
    admins.forEach((admin) => recipientIds.push(admin._id));
    if (employee.managerId?.userId || employee.managerId) {
      const manager = await Employee.findById(employee.managerId._id || employee.managerId).select('userId');
      if (manager?.userId) recipientIds.push(manager.userId);
    }
    await createNotifications({
      recipientUserIds: recipientIds,
      title: `Leave request · ${employee.name}`,
      message: `${employee.name} applied for ${leave.type} leave (${leave.days} day(s)).`,
      type: 'leave',
      link: '/leaves',
      entity: 'leave',
      entityId: leave._id,
    });
  } catch (err) {
    console.error('Leave in-app notification failed:', err.message);
  }

  const notified = Boolean(notification?.sent);
  let message;
  if (notified) {
    const viaEthereal = notification?.provider === 'ethereal';
    const preview = notification?.previewUrl ? ` Preview: ${notification.previewUrl}` : '';
    if (req.user.role === 'manager') {
      message = viaEthereal
        ? `Leave request submitted. Email sent to Admin (test inbox).${preview}`
        : 'Leave request submitted. Admin has been notified by email.';
    } else {
      message = viaEthereal
        ? `Leave request submitted. Email sent to your manager and admin (test inbox).${preview}`
        : 'Leave request submitted. Your manager and admin have been notified by email.';
    }
  } else if (notification?.reason === 'smtp_not_configured') {
    message = 'Leave request submitted and is pending review. Email was not sent because SMTP is not configured on the server.';
  } else if (notification?.reason === 'smtp_auth_failed' || notification?.reason === 'smtp_verify_failed') {
    message = 'Leave request submitted and is pending review. Email failed: check EMAIL_USER and Gmail App Password in backend/.env.';
  } else if (notification?.reason === 'no_recipients') {
    message = 'Leave request submitted and is pending review. Email was not sent because no admin/manager email was found.';
  } else {
    message = 'Leave request submitted and is pending review. Email notification could not be sent right now.';
  }

  return success(res, { leave, notification }, message, 201);
}

export async function updateLeaveStatus(req, res) {
  const { status, decisionNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return fail(res, 'Status must be approved or rejected', 400);
  }

  const note = String(decisionNote || '').trim();
  if (!note) {
    return fail(res, 'A comment is required when approving or rejecting leave', 400);
  }

  const leave = await Leave.findById(req.params.id);
  if (!leave) return fail(res, 'Leave request not found', 404);
  if (leave.status === 'cancelled') return fail(res, 'Cancelled leave cannot be updated', 400);

  let override = false;
  if (leave.status !== 'pending') {
    if (req.user.role !== 'admin') {
      return fail(res, 'Leave already processed', 400);
    }
    if (!['approved', 'rejected'].includes(leave.status)) {
      return fail(res, 'Leave already processed', 400);
    }
    if (leave.status === status) {
      return fail(res, `Leave is already ${status}`, 400);
    }

    const decidedBy = leave.approvedBy
      ? await User.findById(leave.approvedBy).select('role')
      : null;
    if (decidedBy?.role !== 'manager' && !leave.previousDecision?.status) {
      return fail(res, 'Admin can only override a manager decision', 400);
    }

    const employee = await Employee.findById(leave.employeeId).populate('userId', 'role');
    if (employee?.userId?.role === 'manager') {
      return fail(res, 'Manager leave is already an admin decision', 400);
    }
    override = true;
  } else if (req.user.role === 'manager') {
    if (
      req.user.employeeProfile &&
      leave.employeeId.toString() === req.user.employeeProfile.toString()
    ) {
      return fail(res, 'Your leave request must be approved by an admin', 403);
    }

    const employee = await Employee.findById(leave.employeeId).populate('userId', 'role');
    if (!employee || !employee.managerId || employee.managerId.toString() !== req.user.employeeProfile.toString()) {
      return fail(res, 'Forbidden', 403);
    }
    if (employee.userId?.role === 'manager') {
      return fail(res, 'Manager leave requests must be approved by an admin', 403);
    }
  }

  const result = await applyLeaveDecision(leave, {
    status,
    note,
    actorUser: req.user,
    via: 'portal',
    override,
  });
  if (!result.ok) {
    return fail(res, result.message, result.status);
  }

  const populated = await populateLeave(Leave.findById(leave._id));

  return success(res, populated, override ? `Leave ${status} (overrode manager decision)` : `Leave ${status}`);
}
