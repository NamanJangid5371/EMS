import { Router } from 'express';
import {
  login,
  loginValidators,
  changePassword,
  changePasswordValidators,
  me,
  logout,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/login', loginValidators, validate, login);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePasswordValidators, validate, changePassword);

export default router;
