import { Router } from 'express';
import {
  listAttendance,
  getAttendanceCalendar,
  markAttendance,
  upsertAttendance,
  markAttendanceValidators,
} from '../controllers/attendanceController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'manager', 'employee'), listAttendance);
router.get('/calendar', authorize('admin', 'manager', 'employee'), getAttendanceCalendar);
router.post('/mark', authorize('employee', 'manager'), markAttendanceValidators, validate, markAttendance);
router.post('/upsert', authorize('admin', 'manager'), upsertAttendance);

export default router;
