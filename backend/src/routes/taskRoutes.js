import { Router } from 'express';
import {
  listTasks,
  createTask,
  updateTaskStatus,
  deleteTask,
  createTaskValidators,
} from '../controllers/taskController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('admin', 'manager', 'employee'), listTasks);
router.post('/', authorize('admin', 'manager'), createTaskValidators, validate, createTask);
router.patch('/:id/status', authorize('admin', 'manager', 'employee'), updateTaskStatus);
router.delete('/:id', authorize('admin', 'manager'), deleteTask);

export default router;
