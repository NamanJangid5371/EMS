import { Router } from 'express';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', listNotifications);
router.post('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export default router;
