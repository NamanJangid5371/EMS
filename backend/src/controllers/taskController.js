import { body } from 'express-validator';
import Task from '../models/Task.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { notifyAdminsAndManager, notifyEmployeeUser } from '../utils/notify.js';

export const createTaskValidators = [
  body('projectName').isString().trim().notEmpty().withMessage('Project name is required'),
  body('title').isString().trim().notEmpty().withMessage('Task is required'),
  body('deadline').isISO8601().withMessage('Valid deadline is required'),
  body('assignedTo').isString().notEmpty().withMessage('Assignee is required'),
];

async function getAssigneeWithRole(employeeId) {
  const employee = await Employee.findById(employeeId);
  if (!employee) return null;
  const user = await User.findById(employee.userId).select('role status');
  return { employee, user };
}

export async function listTasks(req, res) {
  const filter = {};

  if (req.user.role === 'employee') {
    filter.assignedTo = req.user.employeeProfile;
  } else if (req.user.role === 'manager') {
    const team = await Employee.find({ managerId: req.user.employeeProfile }).select('_id');
    const teamIds = team.map((t) => t._id);
    // Manager sees own tasks (from admin) + tasks assigned to their employees
    filter.assignedTo = { $in: [...teamIds, req.user.employeeProfile] };
  }

  if (req.query.status) filter.status = req.query.status;
  if (req.query.assignedTo) {
    if (req.user.role === 'manager') {
      const targetId = req.query.assignedTo;
      const isSelf = targetId === req.user.employeeProfile?.toString();
      if (!isSelf) {
        const employee = await Employee.findById(targetId);
        if (!employee || employee.managerId?.toString() !== req.user.employeeProfile.toString()) {
          return fail(res, 'Forbidden', 403);
        }
      }
    }
    filter.assignedTo = req.query.assignedTo;
  }

  if (req.query.scope === 'team' && req.user.role === 'manager') {
    const team = await Employee.find({ managerId: req.user.employeeProfile }).select('_id');
    filter.assignedTo = { $in: team.map((t) => t._id) };
  }

  if (req.query.scope === 'mine') {
    filter.assignedTo = req.user.employeeProfile;
  }

  const items = await Task.find(filter)
    .populate({
      path: 'assignedTo',
      select: 'name employeeId designation userId',
      populate: { path: 'userId', select: 'role' },
    })
    .populate('assignedBy', 'email employeeId role')
    .sort({ deadline: 1, assignedAt: -1 });

  return success(res, items);
}

export async function createTask(req, res) {
  const { projectName, title, description, deadline, assignedTo } = req.body;
  const assignee = await getAssigneeWithRole(assignedTo);

  if (!assignee) return fail(res, 'Assignee not found', 404);
  if (!assignee.user || !['manager', 'employee'].includes(assignee.user.role)) {
    return fail(res, 'Tasks can only be assigned to managers or employees', 400);
  }
  if (assignee.user.status !== 'active') {
    return fail(res, 'Cannot assign task to an inactive account', 400);
  }

  if (req.user.role === 'manager') {
    // Manager may assign only to employees who report to them
    if (assignee.user.role !== 'employee') {
      return fail(res, 'Managers can only assign tasks to their employees', 403);
    }
    if (
      !assignee.employee.managerId ||
      assignee.employee.managerId.toString() !== req.user.employeeProfile.toString()
    ) {
      return fail(res, 'You can only assign tasks to employees under you', 403);
    }
  }

  // Admin can assign to any manager or employee (validated above)

  const task = await Task.create({
    projectName,
    title,
    description: description || '',
    deadline,
    assignedAt: new Date(),
    assignedTo,
    assignedBy: req.user._id,
    status: 'assigned',
  });

  await writeAudit({
    userId: req.user._id,
    action: 'assign_task',
    entity: 'task',
    entityId: task._id.toString(),
    meta: {
      projectName,
      title,
      assignedTo,
      assigneeRole: assignee.user.role,
    },
  });

  const populated = await Task.findById(task._id)
    .populate('assignedTo', 'name employeeId')
    .populate('assignedBy', 'email employeeId role');

  try {
    const due = new Date(deadline).toLocaleDateString();
    await notifyEmployeeUser(assignee.employee._id, {
      title: 'New task assigned',
      message: `${projectName}: ${title} is due ${due}.`,
      type: 'task',
      link: assignee.user.role === 'manager' ? '/tasks' : '/',
      entity: 'task',
      entityId: task._id,
    });
    await notifyAdminsAndManager({
      managerEmployeeId: assignee.user.role === 'employee' ? assignee.employee.managerId : null,
      actorUserId: req.user._id,
      title: 'Task assigned',
      message: `${assignee.employee.name} was assigned "${title}" (${projectName}).`,
      type: 'task',
      link: '/tasks',
      entity: 'task',
      entityId: task._id,
    });
  } catch (err) {
    console.error('Task assignment notification failed:', err.message);
  }

  return success(res, populated, 'Task assigned', 201);
}

export async function updateTaskStatus(req, res) {
  const { status } = req.body;
  if (!['assigned', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    return fail(res, 'Invalid status', 400);
  }

  const task = await Task.findById(req.params.id);
  if (!task) return fail(res, 'Task not found', 404);

  const isOwnTask = task.assignedTo.toString() === req.user.employeeProfile?.toString();

  if (req.user.role === 'employee') {
    if (!isOwnTask) return fail(res, 'Forbidden', 403);
    if (!['assigned', 'in_progress', 'completed'].includes(status)) {
      return fail(res, 'Invalid status for employee', 400);
    }
  }

  if (req.user.role === 'manager') {
    if (!isOwnTask) {
      const employee = await Employee.findById(task.assignedTo);
      if (!employee || employee.managerId?.toString() !== req.user.employeeProfile.toString()) {
        return fail(res, 'Forbidden', 403);
      }
    }
  }

  task.status = status;
  if (status === 'completed') {
    const note = String(req.body.completionNote ?? req.body.note ?? '').trim();
    task.completionNote = note;
    task.completedAt = new Date();
  }
  await task.save();

  const populated = await Task.findById(task._id)
    .populate('assignedTo', 'name employeeId')
    .populate('assignedBy', 'email employeeId role');

  if (status === 'completed') {
    try {
      const assigneeEmp = await Employee.findById(task.assignedTo).select('name managerId');
      await notifyAdminsAndManager({
        managerEmployeeId: assigneeEmp?.managerId,
        actorUserId: req.user._id,
        title: 'Task completed',
        message: `${assigneeEmp?.name || 'Someone'} completed "${task.title}".`,
        type: 'task',
        link: '/tasks',
        entity: 'task',
        entityId: task._id,
      });
    } catch (err) {
      console.error('Task completion notification failed:', err.message);
    }
  }

  return success(res, populated, 'Task updated');
}

export async function deleteTask(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) return fail(res, 'Task not found', 404);

  if (req.user.role === 'manager') {
    const employee = await Employee.findById(task.assignedTo);
    const isOwnTask = task.assignedTo.toString() === req.user.employeeProfile?.toString();
    if (!isOwnTask) {
      if (!employee || employee.managerId?.toString() !== req.user.employeeProfile.toString()) {
        return fail(res, 'Forbidden', 403);
      }
    }
  }

  await Task.findByIdAndDelete(task._id);
  await writeAudit({
    userId: req.user._id,
    action: 'delete_task',
    entity: 'task',
    entityId: req.params.id,
  });

  return success(res, null, 'Task removed');
}
