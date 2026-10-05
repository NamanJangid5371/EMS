import { Router } from 'express';
import {
  listUsers,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  resetUserPasswordValidators,
} from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate, authorize('admin'));
router.get('/', listUsers);
router.patch('/:id/status', updateUserStatus);
router.patch('/:id/password', resetUserPasswordValidators, validate, resetUserPassword);
router.delete('/:id', deleteUser);

export default router;
