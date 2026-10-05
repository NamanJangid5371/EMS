import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

async function resolveActor(userId) {
  if (!userId) return {};
  const user = await User.findById(userId).select('email employeeId role employeeProfile');
  if (!user) return {};

  const employee = user.employeeProfile
    ? await Employee.findById(user.employeeProfile).populate('departmentId', 'name')
    : await Employee.findOne({ userId: user._id }).populate('departmentId', 'name');

  const department = employee?.departmentId;
  return {
    name: employee?.name || '',
    email: user.email || '',
    employeeId: user.employeeId || employee?.employeeId || '',
    role: user.role || '',
    departmentId: department?._id || null,
    departmentName: department?.name || '',
  };
}

export async function writeAudit({ userId, action, entity, entityId, meta }) {
  try {
    const actor = await resolveActor(userId);
    await AuditLog.create({
      userId,
      action,
      entity,
      entityId,
      meta: { ...(meta || {}), actor },
      actorName: actor.name || '',
      actorEmployeeId: actor.employeeId || '',
      actorRole: actor.role || '',
      actorDepartmentId: actor.departmentId || null,
      actorDepartmentName: actor.departmentName || '',
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
