import { Router } from 'express';
import { getOrgTree, getCompanyCalendar } from '../controllers/orgController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/tree', authorize('admin', 'manager'), getOrgTree);
router.get('/calendar', authorize('admin', 'manager', 'employee'), getCompanyCalendar);

export default router;
