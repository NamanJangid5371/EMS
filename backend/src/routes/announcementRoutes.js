import { Router } from 'express';
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  announcementValidators,
} from '../controllers/announcementController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.get('/', listAnnouncements);
router.post('/', authorize('admin', 'manager'), announcementValidators, validate, createAnnouncement);
router.delete('/:id', authorize('admin'), deleteAnnouncement);

export default router;
