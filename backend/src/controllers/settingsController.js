import { body } from 'express-validator';
import { success, fail } from '../utils/apiResponse.js';
import { getAppSettings } from '../utils/leaveNotification.js';

export const settingsValidators = [
  body('leaveNotificationEmail').isEmail().withMessage('A valid notification email is required'),
];

export async function getSettings(req, res) {
  const settings = await getAppSettings();
  return success(res, {
    leaveNotificationEmail: settings.leaveNotificationEmail || '',
  });
}

export async function updateSettings(req, res) {
  const email = String(req.body.leaveNotificationEmail || '').toLowerCase().trim();
  if (!email) return fail(res, 'Notification email is required', 400);
  const settings = await getAppSettings();
  settings.leaveNotificationEmail = email;
  await settings.save();
  return success(res, {
    leaveNotificationEmail: settings.leaveNotificationEmail,
  }, 'Leave notification email updated');
}
