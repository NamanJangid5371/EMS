import Notification from '../models/Notification.js';
import { success, fail } from '../utils/apiResponse.js';

export async function listNotifications(req, res) {
  const limitNum = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const filter = { recipientUserId: req.user._id };
  if (unreadOnly) filter.read = false;

  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limitNum),
    Notification.countDocuments({ recipientUserId: req.user._id, read: false }),
  ]);

  return success(res, { items, unread });
}

export async function markNotificationRead(req, res) {
  const item = await Notification.findOne({
    _id: req.params.id,
    recipientUserId: req.user._id,
  });
  if (!item) return fail(res, 'Notification not found', 404);

  if (!item.read) {
    item.read = true;
    item.readAt = new Date();
    await item.save();
  }

  const unread = await Notification.countDocuments({ recipientUserId: req.user._id, read: false });
  return success(res, { item, unread }, 'Marked as read');
}

export async function markAllNotificationsRead(req, res) {
  await Notification.updateMany(
    { recipientUserId: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return success(res, { unread: 0 }, 'All notifications marked as read');
}
