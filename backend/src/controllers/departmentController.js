import { body } from 'express-validator';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import { success, fail } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';

export const departmentValidators = [
  body('name').isString().trim().notEmpty().withMessage('Department name is required'),
];

export async function listDepartments(req, res) {
  const items = await Department.find()
    .populate('managerId', 'name employeeId')
    .sort({ name: 1 });
  return success(res, items);
}

export async function getDepartment(req, res) {
  const dept = await Department.findById(req.params.id).populate('managerId', 'name employeeId email designation');
  if (!dept) return fail(res, 'Department not found', 404);

  const members = await Employee.find({ departmentId: dept._id })
    .populate('userId', 'role status')
    .populate('managerId', 'name employeeId')
    .sort({ name: 1 });

  return success(res, { department: dept, members });
}

export async function createDepartment(req, res) {
  const dept = await Department.create({
    name: req.body.name,
    description: req.body.description || '',
    managerId: req.body.managerId || null,
    status: req.body.status || 'active',
  });

  await writeAudit({
    userId: req.user._id,
    action: 'create_department',
    entity: 'department',
    entityId: dept._id.toString(),
  });

  return success(res, dept, 'Department created', 201);
}

export async function updateDepartment(req, res) {
  const dept = await Department.findById(req.params.id);
  if (!dept) return fail(res, 'Department not found', 404);

  ['name', 'description', 'managerId', 'status'].forEach((key) => {
    if (req.body[key] !== undefined) dept[key] = req.body[key];
  });
  await dept.save();

  await writeAudit({
    userId: req.user._id,
    action: 'update_department',
    entity: 'department',
    entityId: dept._id.toString(),
  });

  const populated = await Department.findById(dept._id).populate('managerId', 'name employeeId');
  return success(res, populated, 'Department updated');
}
