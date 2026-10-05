import { Router } from 'express';
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
  deleteEmployee,
  addEmployeeNote,
  getEmployeeActivity,
  addEmployeeDocument,
  updateEmployeeDocument,
  deleteEmployeeDocument,
  getEmployeeLeaveRecord,
  createEmployeeValidators,
  addEmployeeNoteValidators,
} from '../controllers/employeeController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'manager'), listEmployees);
router.get('/:id', authorize('admin', 'manager', 'employee'), getEmployee);
router.get('/:id/activity', authorize('admin', 'manager', 'employee'), getEmployeeActivity);
router.get('/:id/leave-record', authorize('admin', 'manager', 'employee'), getEmployeeLeaveRecord);
router.post('/:id/documents', authorize('admin', 'manager', 'employee'), addEmployeeDocument);
router.put('/:id/documents/:docId', authorize('admin', 'manager', 'employee'), updateEmployeeDocument);
router.delete('/:id/documents/:docId', authorize('admin', 'manager'), deleteEmployeeDocument);
router.post('/', authorize('admin'), createEmployeeValidators, validate, createEmployee);
router.put('/:id', authorize('admin', 'manager', 'employee'), updateEmployee);
router.post('/:id/notes', authorize('admin', 'manager'), addEmployeeNoteValidators, validate, addEmployeeNote);
router.patch('/:id/deactivate', authorize('admin'), deactivateEmployee);
router.patch('/:id/reactivate', authorize('admin'), reactivateEmployee);
router.delete('/:id', authorize('admin'), deleteEmployee);

export default router;
