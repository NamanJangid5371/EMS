import Attendance from '../models/Attendance.js';
import AppSettings from '../models/AppSettings.js';
import { startOfDay } from '../services/attendanceService.js';
import { sendMissingCheckoutReminder } from './hrEmails.js';
import { notifyEmployeeUser } from './notify.js';

export async function maybeSendMissingCheckoutReminders() {
  const now = new Date();

  if (now.getHours() < 19) {
    return { skipped: true, reason: 'before_close' };
  }

  let settings = await AppSettings.findOne({ key: 'default' });
  if (!settings) settings = await AppSettings.create({ key: 'default' });

  const todayKey = startOfDay(now).toISOString().slice(0, 10);
  if (settings.lastMissingCheckoutReminderDate === todayKey) {
    return { skipped: true, reason: 'already_sent' };
  }

  const today = startOfDay(now);
  const open = await Attendance.find({
    date: today,
    checkIn: { $ne: null },
    checkOut: null,
    status: { $in: ['present', 'late', 'half_day'] },
  }).populate('employeeId', 'name email userId');

  let sent = 0;
  for (const row of open) {
    if (!row.employeeId) continue;
    await sendMissingCheckoutReminder(row.employeeId);
    await notifyEmployeeUser(row.employeeId, {
      title: 'Missing checkout',
      message: 'You still appear checked in. Please log out or check out so your hours are recorded.',
      type: 'attendance',
      link: '/attendance',
      entity: 'attendance',
      entityId: row._id,
    });
    sent += 1;
  }

  settings.lastMissingCheckoutReminderDate = todayKey;
  await settings.save();
  return { skipped: false, sent };
}
