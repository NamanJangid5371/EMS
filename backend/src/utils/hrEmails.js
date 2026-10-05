import Employee from '../models/Employee.js';
import User from '../models/User.js';
import config from '../config/index.js';
import { sendMail } from './mailer.js';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    : '—';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function wrapEmail(title, bodyHtml) {
  return `
  <div style="margin:0;padding:0;background:#f3f6f4;font-family:'Segoe UI',Arial,sans-serif;color:#14241c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #d5e0d9;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#0d3b2c;color:#e8f5ef;padding:22px 28px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">Appinop EMS</div>
                <div style="font-size:22px;font-weight:700;margin-top:6px;">${escapeHtml(title)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.6;">${bodyHtml}</td>
            </tr>
            <tr>
              <td style="padding:14px 28px;background:#f7fbf9;color:#5c6f64;font-size:12px;">
                Automated notification · Appinop Employee Management System
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

export async function notifyLeaveDecision(leave, employee, status, decisionNote = '') {
  try {
    const populated = await Employee.findById(employee._id || employee)
      .select('name email notificationEmail employeeId userId')
      .populate('userId', 'email role');
    const to = populated?.notificationEmail || populated?.email || populated?.userId?.email;
    if (!to) return { sent: false, reason: 'no_recipients' };

    const subject = `Leave ${labelize(status)} · ${labelize(leave.type)} · ${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`;
    const portalBase = populated.userId?.role === 'manager'
      ? (config.managerPortalUrl || 'http://127.0.0.1:3001')
      : (config.employeePortalUrl || 'http://127.0.0.1:3002');
    const portalUrl = `${portalBase}/leaves`;
    const text = [
      `Your ${labelize(leave.type)} leave request has been ${status}.`,
      `Dates: ${formatDate(leave.startDate)} – ${formatDate(leave.endDate)} (${leave.days} day(s))`,
      decisionNote ? `Note: ${decisionNote}` : '',
      `View leave: ${portalUrl}`,
    ].filter(Boolean).join('\n');

    const html = wrapEmail(`Leave ${labelize(status)}`, `
      <p>Hi ${escapeHtml(populated.name)},</p>
      <p>Your <strong>${escapeHtml(labelize(leave.type))}</strong> leave request has been <strong>${escapeHtml(status)}</strong>.</p>
      <p>Dates: ${escapeHtml(formatDate(leave.startDate))} – ${escapeHtml(formatDate(leave.endDate))} (${leave.days} day(s))</p>
      ${decisionNote ? `<p>Note: ${escapeHtml(decisionNote)}</p>` : ''}
      <p><a href="${portalUrl}" style="display:inline-block;background:#0f6b4c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Open leave inbox</a></p>
    `);

    return sendMail({ to, subject, text, html });
  } catch (err) {
    console.error('[hr-mail] Leave decision email failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

export async function sendWelcomeEmail(employee, { password, role = 'employee' } = {}) {
  try {
    const to = employee.email;
    if (!to) return { sent: false, reason: 'no_recipients' };

    const portalUrl = role === 'manager'
      ? (config.managerPortalUrl || 'http://127.0.0.1:3001')
      : (config.employeePortalUrl || 'http://127.0.0.1:3002');
    const subject = `Welcome to Appinop EMS · ${employee.name}`;
    const text = [
      `Welcome ${employee.name},`,
      '',
      'Your employee account is ready.',
      `Employee ID: ${employee.employeeId}`,
      `Email: ${employee.email}`,
      password ? `Temporary password: ${password}` : 'Ask your admin for the login password.',
      `Portal: ${portalUrl}`,
    ].join('\n');

    const html = wrapEmail('Welcome to Appinop', `
      <p>Hi ${escapeHtml(employee.name)},</p>
      <p>Your employee account is ready. Use these details to sign in:</p>
      <p>
        Employee ID: <strong>${escapeHtml(employee.employeeId)}</strong><br/>
        Email: <strong>${escapeHtml(employee.email)}</strong><br/>
        ${password ? `Temporary password: <strong>${escapeHtml(password)}</strong>` : 'Ask your admin for the login password.'}
      </p>
      <p><a href="${portalUrl}/" style="display:inline-block;background:#0f6b4c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Open portal</a></p>
    `);

    return sendMail({ to, subject, text, html });
  } catch (err) {
    console.error('[hr-mail] Welcome email failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

export async function sendAutoCheckoutNotice(employee, { checkOut, workHours } = {}) {
  try {
    const populated = await Employee.findById(employee._id || employee)
      .select('name email notificationEmail userId')
      .populate('userId', 'email');
    const to = populated?.notificationEmail || populated?.email || populated?.userId?.email;
    if (!to) return { sent: false, reason: 'no_recipients' };

    const when = checkOut
      ? new Date(checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '19:00';
    const hours = Number(workHours) ? `${Number(workHours).toFixed(2)}h` : 'office hours';
    const portalUrl = `${config.employeePortalUrl || 'http://127.0.0.1:3002'}/attendance`;
    const subject = 'Attendance closed · you did not log out';
    const text = `Hi ${populated.name}, you did not log out of the portal. Your attendance was closed at ${when} (${hours}). You do not need to close the tab — the system records the day at office close (19:00). ${portalUrl}`;
    const html = wrapEmail('Attendance auto-closed', `
      <p>Hi ${escapeHtml(populated.name)},</p>
      <p>You did not log out of the portal. Appinop EMS closed your attendance at <strong>${escapeHtml(when)}</strong> (${escapeHtml(hours)}) so your hours are still recorded.</p>
      <p>You do not need to close the browser tab. If you forget logout, the system checks you out at office close (19:00).</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#0f6b4c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">View attendance</a></p>
    `);
    return sendMail({ to, subject, text, html });
  } catch (err) {
    console.error('[hr-mail] Auto checkout email failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

export async function sendMissingCheckoutReminder(employee) {
  try {
    const populated = await Employee.findById(employee._id || employee)
      .select('name email notificationEmail userId')
      .populate('userId', 'email');
    const to = populated?.notificationEmail || populated?.email || populated?.userId?.email;
    if (!to) return { sent: false, reason: 'no_recipients' };

    const portalUrl = `${config.employeePortalUrl || 'http://127.0.0.1:3002'}/attendance`;
    const subject = 'Reminder · Check out before you leave';
    const text = `Hi ${populated.name}, you still appear checked in today. Please log out or use Check out so your working hours are recorded. ${portalUrl}`;
    const html = wrapEmail('Missing checkout', `
      <p>Hi ${escapeHtml(populated.name)},</p>
      <p>You still appear checked in today. Please log out or use <strong>Check out</strong> so your working hours are recorded.</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#0f6b4c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Open attendance</a></p>
    `);
    return sendMail({ to, subject, text, html });
  } catch (err) {
    console.error('[hr-mail] Missing checkout email failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

export async function resolveAdminUserIds() {
  const admins = await User.find({ role: 'admin', status: 'active' }).select('_id');
  return admins.map((admin) => admin._id);
}
