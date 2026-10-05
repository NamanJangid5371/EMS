import { Router } from 'express';
import {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  departmentValidators,
} from '../controllers/departmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', listDepartments);
router.get('/:id', getDepartment);
router.post('/', authorize('admin'), departmentValidators, validate, createDepartment);
router.put('/:id', authorize('admin'), departmentValidators, validate, updateDepartment);

export default router;
