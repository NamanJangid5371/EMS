import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

export async function createNotifications({
  recipientUserIds = [],
  title,
  message,
  type = 'system',
  link = '',
  entity = '',
  entityId = '',
}) {
  const ids = [...new Set(recipientUserIds.map((id) => String(id || '')).filter(Boolean))];
  if (!ids.length || !title || !message) return [];

  try {
    return await Notification.insertMany(
      ids.map((recipientUserId) => ({
        recipientUserId,
        title,
        message,
        type,
        link,
        entity,
        entityId: entityId ? String(entityId) : '',
      }))
    );
  } catch (err) {
    console.error('[notify] Failed to create notifications:', err.message);
    return [];
  }
}

export async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin', status: 'active' }).select('_id');
  return createNotifications({
    ...payload,
    recipientUserIds: admins.map((admin) => admin._id),
  });
}

export async function notifyEmployeeUser(employeeRef, payload) {
  if (!employeeRef) return [];
  const employee = await Employee.findById(employeeRef._id || employeeRef).select('userId');
  if (!employee?.userId) return [];
  return createNotifications({
    ...payload,
    recipientUserIds: [employee.userId],
  });
}

/** Notify active admins and a specific manager, skipping the person who triggered the event. */
export async function notifyAdminsAndManager({
  managerEmployeeId,
  actorUserId,
  managerLink,
  ...payload
}) {
  const actor = actorUserId ? String(actorUserId) : '';

  const admins = await User.find({ role: 'admin', status: 'active' }).select('_id');
  const adminIds = admins.map((admin) => admin._id).filter((id) => String(id) !== actor);
  if (adminIds.length) {
    await createNotifications({
      ...payload,
      recipientUserIds: adminIds,
    });
  }

  if (managerEmployeeId) {
    const manager = await Employee.findById(managerEmployeeId._id || managerEmployeeId).select('userId');
    if (manager?.userId && String(manager.userId) !== actor) {
      await createNotifications({
        ...payload,
        link: managerLink || payload.link || '',
        recipientUserIds: [manager.userId],
      });
    }
  }
}
