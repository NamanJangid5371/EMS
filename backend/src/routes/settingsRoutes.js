import { Router } from 'express';
import { getSettings, updateSettings, settingsValidators } from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate, authorize('admin'));
router.get('/', getSettings);
router.put('/', settingsValidators, validate, updateSettings);

export default router;
