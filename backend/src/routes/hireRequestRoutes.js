import { Router } from 'express';
import {
  listHireRequests,
  getHireRequest,
  createHireRequest,
  updateHireRequestStatus,
  createHireRequestValidators,
} from '../controllers/hireRequestController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'manager'), listHireRequests);
router.get('/:id', authorize('admin', 'manager'), getHireRequest);
router.post('/', authorize('manager'), createHireRequestValidators, validate, createHireRequest);
router.put('/:id/status', authorize('admin'), updateHireRequestStatus);

export default router;
