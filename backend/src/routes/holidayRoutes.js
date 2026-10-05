import { Router } from 'express';
import {
  listHolidays,
  createHoliday,
  deleteHoliday,
  holidayValidators,
} from '../controllers/holidayController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'manager', 'employee'), listHolidays);
router.post('/', authorize('admin'), holidayValidators, validate, createHoliday);
router.delete('/:id', authorize('admin'), deleteHoliday);

export default router;
