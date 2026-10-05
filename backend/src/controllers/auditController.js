import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Leave from '../models/Leave.js';
import Task from '../models/Task.js';
import Department from '../models/Department.js';
import { success } from '../utils/apiResponse.js';

function asId(value) {
  if (!value) return '';
  const id = value._id || value;
  return mongoose.isValidObjectId(id) ? String(id) : '';
}

function text(value) {
  return String(value || '').trim().toLowerCase();
}

function labelize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function actorFromLog(log) {
  const snapshot = log.meta?.actor || {};
  const user = log.userId && typeof log.userId === 'object' ? log.userId : null;
  const profile = user?.employeeProfile && typeof user.employeeProfile === 'object'
    ? user.employeeProfile
    : null;
  const department = profile?.departmentId && typeof profile.departmentId === 'object'
    ? profile.departmentId
    : null;

  return {
    userId: asId(user) || asId(log.userId),
    name: log.actorName || snapshot.name || profile?.name || '',
    email: user?.email || snapshot.email || '',
    employeeId: log.actorEmployeeId || snapshot.employeeId || user?.employeeId || profile?.employeeId || '',
    role: log.actorRole || snapshot.role || user?.role || '',
    employeeProfileId: asId(profile),
    departmentId: asId(log.actorDepartmentId) || asId(snapshot.departmentId) || asId(department),
    departmentName: log.actorDepartmentName || snapshot.departmentName || department?.name || '',
  };
}

function targetFromMaps(log, maps) {
  const entityId = asId(log.entityId) || String(log.entityId || '');
  const meta = log.meta || {};

  if (log.entity === 'employee') {
    const employee = maps.employees.get(entityId);
    return {
      kind: 'employee',
      id: asId(employee?._id) || entityId,
      name: employee?.name || meta.name || '',
      employeeId: employee?.employeeId || meta.employeeId || '',
      departmentName: employee?.departmentId?.name || meta.departmentName || '',
      extra: meta.role ? labelize(meta.role) : '',
    };
  }

  if (log.entity === 'user') {
    const user = maps.users.get(entityId);
    const profile = user?.employeeProfile;
    return {
      kind: profile?._id ? 'employee' : 'user',
      id: asId(profile?._id) || entityId,
      name: profile?.name || meta.email || user?.email || '',
      employeeId: profile?.employeeId || user?.employeeId || meta.employeeId || '',
      departmentName: profile?.departmentId?.name || '',
      extra: labelize(meta.role || user?.role || meta.status || ''),
    };
  }

  if (log.entity === 'leave') {
    const leave = maps.leaves.get(entityId);
    const employee = leave?.employeeId;
    const fallbackId = asId(meta.employeeId);
    const fallback = maps.employees.get(fallbackId);
    return {
      kind: 'employee',
      id: asId(employee?._id) || asId(fallback?._id) || fallbackId,
      name: employee?.name || fallback?.name || '',
      employeeId: employee?.employeeId || fallback?.employeeId || '',
      departmentName: employee?.departmentId?.name || fallback?.departmentId?.name || '',
      extra: leave?.type ? `${labelize(leave.type)} leave` : '',
    };
  }

  if (log.entity === 'task') {
    const task = maps.tasks.get(entityId);
    const assignee = task?.assignedTo;
    const fallbackId = asId(meta.assignedTo);
    const fallback = maps.employees.get(fallbackId);
    return {
      kind: 'employee',
      id: asId(assignee?._id) || asId(fallback?._id) || fallbackId,
      name: assignee?.name || fallback?.name || meta.title || '',
      employeeId: assignee?.employeeId || fallback?.employeeId || '',
      departmentName: assignee?.departmentId?.name || fallback?.departmentId?.name || '',
      extra: [meta.projectName || task?.projectName, meta.title || task?.title].filter(Boolean).join(' · '),
    };
  }

  if (log.entity === 'department') {
    const department = maps.departments.get(entityId);
    return {
      kind: 'department',
      id: entityId,
      name: department?.name || '',
      employeeId: '',
      departmentName: department?.name || '',
      extra: '',
    };
  }

  if (log.entity === 'announcement') {
    return {
      kind: 'announcement',
      id: entityId,
      name: meta.title || 'Announcement',
      employeeId: '',
      departmentName: '',
      extra: '',
    };
  }

  if (log.entity === 'holiday') {
    return {
      kind: 'holiday',
      id: entityId,
      name: meta.name || 'Holiday',
      employeeId: '',
      departmentName: '',
      extra: meta.date ? new Date(meta.date).toLocaleDateString() : '',
    };
  }

  return {
    kind: log.entity || 'record',
    id: entityId,
    name: meta.name || meta.title || meta.email || '',
    employeeId: meta.employeeId || '',
    departmentName: meta.departmentName || '',
    extra: '',
  };
}

function describeLog(actor, action, target) {
  const who = actor.name || actor.email || 'Someone';
  const what = labelize(action) || 'performed an action';
  if (target?.name) {
    const extra = target.extra ? ` (${target.extra})` : '';
    return `${who} · ${what} · ${target.name}${extra}`;
  }
  return `${who} · ${what}`;
}

async function loadTargetMaps(logs) {
  const employeeIds = new Set();
  const userIds = new Set();
  const leaveIds = new Set();
  const taskIds = new Set();
  const departmentIds = new Set();

  for (const log of logs) {
    const entityId = asId(log.entityId) || String(log.entityId || '');
    if (log.entity === 'employee' && entityId) employeeIds.add(entityId);
    if (log.entity === 'user' && entityId) userIds.add(entityId);
    if (log.entity === 'leave' && entityId) leaveIds.add(entityId);
    if (log.entity === 'task' && entityId) taskIds.add(entityId);
    if (log.entity === 'department' && entityId) departmentIds.add(entityId);
    if (log.meta?.employeeId && asId(log.meta.employeeId)) employeeIds.add(asId(log.meta.employeeId));
    if (log.meta?.assignedTo && asId(log.meta.assignedTo)) employeeIds.add(asId(log.meta.assignedTo));
  }

  const [employees, users, leaves, tasks, departments] = await Promise.all([
    employeeIds.size
      ? Employee.find({ _id: { $in: [...employeeIds] } })
        .select('name employeeId email departmentId')
        .populate('departmentId', 'name')
      : [],
    userIds.size
      ? User.find({ _id: { $in: [...userIds] } })
        .select('email employeeId role employeeProfile')
        .populate({
          path: 'employeeProfile',
          select: 'name employeeId departmentId',
          populate: { path: 'departmentId', select: 'name' },
        })
      : [],
    leaveIds.size
      ? Leave.find({ _id: { $in: [...leaveIds] } })
        .populate({
          path: 'employeeId',
          select: 'name employeeId departmentId',
          populate: { path: 'departmentId', select: 'name' },
        })
      : [],
    taskIds.size
      ? Task.find({ _id: { $in: [...taskIds] } })
        .populate({
          path: 'assignedTo',
          select: 'name employeeId departmentId',
          populate: { path: 'departmentId', select: 'name' },
        })
      : [],
    departmentIds.size
      ? Department.find({ _id: { $in: [...departmentIds] } }).select('name')
      : [],
  ]);

  return {
    employees: new Map(employees.map((item) => [String(item._id), item])),
    users: new Map(users.map((item) => [String(item._id), item])),
    leaves: new Map(leaves.map((item) => [String(item._id), item])),
    tasks: new Map(tasks.map((item) => [String(item._id), item])),
    departments: new Map(departments.map((item) => [String(item._id), item])),
  };
}

function compareLogs(a, b, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  let left = '';
  let right = '';

  if (sortBy === 'name') {
    left = text(a.actor?.name || a.actor?.email);
    right = text(b.actor?.name || b.actor?.email);
  } else if (sortBy === 'department') {
    left = text(a.actor?.departmentName);
    right = text(b.actor?.departmentName);
  } else if (sortBy === 'role') {
    left = text(a.actor?.role);
    right = text(b.actor?.role);
  } else if (sortBy === 'action') {
    left = text(a.action);
    right = text(b.action);
  } else if (sortBy === 'entity') {
    left = text(a.target?.name || a.entity);
    right = text(b.target?.name || b.entity);
  } else {
    return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * dir;
  }

  if (left === right) {
    return (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  return left.localeCompare(right) * dir;
}

export async function listAuditLogs(req, res) {
  const {
    q = '',
    action = '',
    entity = '',
    departmentId = '',
    role = '',
    fromDate,
    toDate,
    sortBy = 'timestamp',
    sortOrder = 'desc',
    page = 1,
    limit = 50,
  } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (entity) filter.entity = entity;
  if (fromDate || toDate) {
    filter.timestamp = {};
    if (fromDate) filter.timestamp.$gte = new Date(`${fromDate}T00:00:00.000`);
    if (toDate) filter.timestamp.$lte = new Date(`${toDate}T23:59:59.999`);
  }

  const [rawItems, actions, entities] = await Promise.all([
    AuditLog.find(filter)
      .populate({
        path: 'userId',
        select: 'email employeeId role employeeProfile',
        populate: {
          path: 'employeeProfile',
          select: 'name employeeId email departmentId',
          populate: { path: 'departmentId', select: 'name' },
        },
      })
      .sort({ timestamp: -1 })
      .limit(500),
    AuditLog.distinct('action'),
    AuditLog.distinct('entity'),
  ]);

  const maps = await loadTargetMaps(rawItems);
  const search = text(q);
  const roleFilter = text(role);
  const departmentFilter = asId(departmentId);

  let rows = rawItems.map((log) => {
    const actor = actorFromLog(log);
    const target = targetFromMaps(log, maps);
    return {
      _id: log._id,
      timestamp: log.timestamp,
      action: log.action,
      actionLabel: labelize(log.action),
      entity: log.entity,
      entityLabel: labelize(log.entity),
      entityId: log.entityId || '',
      meta: log.meta || {},
      actor,
      target,
      summary: describeLog(actor, log.action, target),
    };
  });

  if (roleFilter) {
    rows = rows.filter((row) => text(row.actor?.role) === roleFilter);
  }
  if (departmentFilter) {
    rows = rows.filter((row) => row.actor?.departmentId === departmentFilter);
  }
  if (search) {
    rows = rows.filter((row) => {
      const haystack = [
        row.actor?.name,
        row.actor?.email,
        row.actor?.employeeId,
        row.actor?.departmentName,
        row.actor?.role,
        row.action,
        row.actionLabel,
        row.entity,
        row.entityLabel,
        row.target?.name,
        row.target?.employeeId,
        row.target?.departmentName,
        row.target?.extra,
        row.summary,
      ].map(text).join(' ');
      return haystack.includes(search);
    });
  }

  rows.sort((a, b) => compareLogs(a, b, String(sortBy), sortOrder === 'asc' ? 'asc' : 'desc'));

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const total = rows.length;
  const paged = rows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return success(res, {
    items: paged,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 0,
    facets: {
      actions: actions.sort(),
      entities: entities.sort(),
    },
    summary: {
      total,
      uniqueActors: new Set(rows.map((row) => row.actor?.userId || row.actor?.email).filter(Boolean)).size,
      uniqueDepartments: new Set(rows.map((row) => row.actor?.departmentName).filter(Boolean)).size,
      byAction: countBy(rows, (row) => row.actionLabel),
      byDepartment: countBy(rows, (row) => row.actor?.departmentName || 'No department'),
      byEntity: countBy(rows, (row) => row.entityLabel),
    },
  });
}
