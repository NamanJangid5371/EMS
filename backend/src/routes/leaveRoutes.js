import { Router } from 'express';
import {
  listLeaves,
  applyLeave,
  updateLeaveStatus,
  applyLeaveValidators,
  showLeaveEmailAction,
  submitLeaveEmailAction,
} from '../controllers/leaveController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/email-action', showLeaveEmailAction);
router.post('/email-action', submitLeaveEmailAction);

router.use(authenticate);
router.get('/', authorize('admin', 'manager', 'employee'), listLeaves);
router.post('/', authorize('employee', 'manager'), applyLeaveValidators, validate, applyLeave);
router.put('/:id/status', authorize('admin', 'manager'), updateLeaveStatus);

export default router;
