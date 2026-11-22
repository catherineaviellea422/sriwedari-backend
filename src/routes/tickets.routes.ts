import { Router } from 'express';
import { bookTicket, gateCheckin, getTicketsOrSeats } from '../controllers/tickets.controller';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/', getTicketsOrSeats('legacy'));
router.post('/', bookTicket);
router.patch('/', requireRole('admin'), gateCheckin);

export default router;
