import { Router } from 'express';
import { getDashboard, getReports } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', getDashboard);
router.get('/reports', getReports);

export default router;
