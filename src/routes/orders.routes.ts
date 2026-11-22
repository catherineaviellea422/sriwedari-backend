import { Router } from 'express';
import { createOrder, listOrdersLegacy, updateOrder } from '../controllers/orders.controller';

const router = Router();

router.get('/', listOrdersLegacy);
router.post('/', createOrder);
router.patch('/', updateOrder);

export default router;
