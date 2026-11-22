import { Router } from 'express';
import {
  deleteGallery,
  listGalleries,
  saveGallery,
  toggleLike,
} from '../controllers/galeri.controller';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/', listGalleries('user'));
router.post('/', requireRole('admin'), saveGallery);
router.patch('/', toggleLike);
router.delete('/', requireRole('admin'), deleteGallery);

export default router;
