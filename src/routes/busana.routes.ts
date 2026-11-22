import { Router } from 'express';
import { deleteCostume, listCostumes, saveCostume } from '../controllers/busana.controller';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/', listCostumes('user'));
router.post('/', requireRole('admin'), saveCostume);
router.delete('/', requireRole('admin'), deleteCostume);

export default router;
