import { Router } from 'express';
import { deleteEvent, listEvents, saveEvent } from '../controllers/jadwal.controller';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/', listEvents('user'));
router.post('/', requireRole('admin'), saveEvent);
router.delete('/', requireRole('admin'), deleteEvent);

export default router;
