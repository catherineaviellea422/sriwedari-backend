import { Router } from 'express';
import {
  createReview,
  deleteReview,
  listReviewsLegacy,
  moderateReview,
} from '../controllers/reviews.controller';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/', listReviewsLegacy);
router.post('/', createReview);
router.patch('/', requireRole('admin'), moderateReview);
router.delete('/', requireRole('admin'), deleteReview);

export default router;
