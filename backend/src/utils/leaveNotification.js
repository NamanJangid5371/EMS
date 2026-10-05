import User from '../models/User.js';
import Employee from '../models/Employee.js';
import AppSettings from '../models/AppSettings.js';
import config from '../config/index.js';
import { sendMail } from './mailer.js';
import { createLeaveEmailToken, leaveEmailActionUrl } from './leaveEmailToken.js';

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

function addEmail(set, value) {
  const email = String(value || '').trim().toLowerCase();
  if (email && email.includes('@')) set.add(email);
}

export async function getAppSettings() {
  let settings = await AppSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await AppSettings.create({ key: 'default' });
  }
  return settings;
}

async function resolveManagerContact(managerRef) {
  const emails = new Set();
  if (!managerRef) return { emails, userId: null };

  const managerId = managerRef._id || managerRef;
  addEmail(emails, managerRef.email);
  addEmail(emails, managerRef.notificationEmail);

  const manager = await Employee.findById(managerId)
    .select('email notificationEmail userId')
    .populate('userId', 'email role status');
  if (manager) {
    addEmail(emails, manager.email);
    addEmail(emails, manager.notificationEmail);
    addEmail(emails, manager.userId?.email);
  }

  const userId = manager?.userId?.role === 'manager' && manager.userId.status === 'active'
    ? manager.userId._id
    : null;

  return { emails, userId };
}

async function resolveAdminEmails() {
  const emails = new Set();
  const admins = await User.find({ role: 'admin', status: 'active' }).select('email');
  admins.forEach((admin) => addEmail(emails, admin.email));

  const settings = await getAppSettings();
  addEmail(emails, settings.leaveNotificationEmail);
  return emails;
}

function leaveDetailsText(leave, employee) {
  const leaveType = labelize(leave.type);
  const statusLabel = labelize(leave.status || 'pending');
  return [
    `Employee: ${employee.name}`,
    `Employee ID: ${employee.employeeId || '—'}`,
    `Leave type: ${leaveType}`,
    `Start date: ${formatDate(leave.startDate)}`,
    `End date: ${formatDate(leave.endDate)}`,
    `Number of days: ${leave.days}`,
    `Reason: ${leave.reason}`,
    `Status: ${statusLabel}`,
  ].join('\n');
}

function leaveDetailsTable(leave, employee) {
  const leaveType = labelize(leave.type);
  const statusLabel = labelize(leave.status || 'pending');
  return `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;background:#f7fbf9;border:1px solid #d5e0d9;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;width:160px;border-bottom:1px solid #d5e0d9;">Employee</td>
                    <td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #d5e0d9;">${escapeHtml(employee.name)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;border-bottom:1px solid #d5e0d9;">Employee ID</td>
                    <td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #d5e0d9;">${escapeHtml(employee.employeeId || '—')}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;border-bottom:1px solid #d5e0d9;">Leave type</td>
                    <td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #d5e0d9;">${escapeHtml(leaveType)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;border-bottom:1px solid #d5e0d9;">Start date</td>
                    <td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #d5e0d9;">${escapeHtml(formatDate(leave.startDate))}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;border-bottom:1px solid #d5e0d9;">End date</td>
                    <td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #d5e0d9;">${escapeHtml(formatDate(leave.endDate))}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;border-bottom:1px solid #d5e0d9;">Number of days</td>
                    <td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #d5e0d9;">${leave.days}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;border-bottom:1px solid #d5e0d9;vertical-align:top;">Reason</td>
                    <td style="padding:12px 16px;border-bottom:1px solid #d5e0d9;line-height:1.55;">${escapeHtml(leave.reason)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;color:#5c6f64;">Status</td>
                    <td style="padding:12px 16px;font-weight:700;color:#b54708;">${escapeHtml(statusLabel)}</td>
                  </tr>
                </table>`;
}

function wrapLeaveEmail({ intro, tableHtml, buttonsHtml, footerNote }) {
  return `
  <div style="margin:0;padding:0;background:#f3f6f4;font-family:'Segoe UI',Arial,sans-serif;color:#14241c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #d5e0d9;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#0d3b2c;color:#e8f5ef;padding:22px 28px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">Appinop EMS · Leave Desk</div>
                <div style="font-size:22px;font-weight:700;margin-top:6px;">Leave application received</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">${intro}</p>
                ${tableHtml}
                <p style="margin:22px 0 0;">${buttonsHtml}</p>
                ${footerNote ? `<p style="margin:14px 0 0;font-size:12px;color:#5c6f64;">${footerNote}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px;background:#f7fbf9;color:#5c6f64;font-size:12px;">
                Automated leave notification · Appinop Employee Management System
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

function primaryButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#0f6b4c;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;margin-right:8px;margin-bottom:8px;">${label}</a>`;
}

function dangerButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#b42318;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;margin-right:8px;margin-bottom:8px;">${label}</a>`;
}

/**
 * After a leave is saved, notify Admin (profile link) and the assigned Manager
 * (approve/reject from email) for employee applications.
 */
export async function notifyLeaveRequest(leave, employee, options = {}) {
  try {
    const populated = await Employee.findById(employee._id || employee)
      .populate('departmentId', 'name')
      .populate('managerId', 'name email notificationEmail employeeId');

    if (!populated) {
      return { sent: false, reason: 'employee_not_found' };
    }

    const linkedUser = options.role
      ? { role: options.role }
      : await User.findById(populated.userId).select('role');
    const applicantRole = linkedUser?.role || 'employee';

    const adminEmails = await resolveAdminEmails();
    const managerContact = applicantRole === 'employee'
      ? await resolveManagerContact(populated.managerId)
      : { emails: new Set(), userId: null };

    const applicantEmails = new Set();
    addEmail(applicantEmails, populated.email);
    addEmail(applicantEmails, populated.notificationEmail);
    applicantEmails.forEach((email) => {
      adminEmails.delete(email);
      managerContact.emails.delete(email);
    });

    if (!adminEmails.size && !managerContact.emails.size) {
      console.warn('[leave-mail] No admin/manager recipients found');
      return { sent: false, reason: 'no_recipients' };
    }

    const contactEmail = (
      populated.notificationEmail
      || populated.email
      || ''
    ).toLowerCase().trim();
    const replyTo = contactEmail
      ? `"${String(populated.name || '').replace(/"/g, '')}" <${contactEmail}>`
      : undefined;

    const subject = `Leave Application · ${populated.name} (${populated.employeeId || 'N/A'}) · Pending`;
    const tableHtml = leaveDetailsTable(leave, populated);
    const detailsText = leaveDetailsText(leave, populated);
    const profileUrl = `${config.adminPortalUrl}/employees/${populated._id}`;

    let lastResult = { sent: false, reason: 'no_recipients' };

    if (adminEmails.size) {
      lastResult = await sendMail({
        to: [...adminEmails],
        subject,
        replyTo,
        text: [
          'A new leave application requires review.',
          '',
          detailsText,
          '',
          `View applicant profile: ${profileUrl}`,
        ].join('\n'),
        html: wrapLeaveEmail({
          intro: 'A leave application has been submitted. Open the applicant profile in the admin portal to review it. It has <strong>not</strong> been approved automatically.',
          tableHtml,
          buttonsHtml: primaryButton(profileUrl, 'View applicant profile'),
          footerNote: `Applicant profile: ${escapeHtml(profileUrl)}`,
        }),
      });
    }

    if (managerContact.emails.size) {
      const canDecide = Boolean(managerContact.userId);
      const approveUrl = canDecide
        ? leaveEmailActionUrl(createLeaveEmailToken({
          leaveId: leave._id,
          managerUserId: managerContact.userId,
          action: 'approve',
        }))
        : `${config.managerPortalUrl}/leaves`;
      const rejectUrl = canDecide
        ? leaveEmailActionUrl(createLeaveEmailToken({
          leaveId: leave._id,
          managerUserId: managerContact.userId,
          action: 'reject',
        }))
        : `${config.managerPortalUrl}/leaves`;

      lastResult = await sendMail({
        to: [...managerContact.emails],
        subject,
        replyTo,
        text: [
          'A team member submitted a leave application.',
          '',
          detailsText,
          '',
          `Approve leave: ${approveUrl}`,
          `Reject leave: ${rejectUrl}`,
        ].join('\n'),
        html: wrapLeaveEmail({
          intro: 'A team member submitted a leave application. You can approve or reject it from this email. It has <strong>not</strong> been approved automatically.',
          tableHtml,
          buttonsHtml: `${primaryButton(approveUrl, 'Approve leave')}${dangerButton(rejectUrl, 'Reject leave')}`,
          footerNote: canDecide
            ? 'These buttons open a confirmation page. Approve/reject is applied only after you confirm.'
            : `Manager leaves: ${escapeHtml(`${config.managerPortalUrl}/leaves`)}`,
        }),
      });
    }

    return lastResult;
  } catch (err) {
    console.error('[leave-mail] Notification failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}
