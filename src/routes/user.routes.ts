import { Router } from 'express';
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPassword,
} from '../controllers/auth.controller';
import { listCostumes } from '../controllers/busana.controller';
import { listCategories, listGalleries, toggleLike } from '../controllers/galeri.controller';
import { listEvents } from '../controllers/jadwal.controller';
import { createOrder, listUserOrders, updateOrder } from '../controllers/orders.controller';
import { bookTicket, getTicketsOrSeats } from '../controllers/tickets.controller';
import { validateCoupon } from '../controllers/payments.controller';
import { createReview, listUserReviews } from '../controllers/reviews.controller';
import {
  addWishlist,
  getProfile,
  getPublicSettings,
  getUserSync,
  getWishlist,
  removeWishlist,
  updateProfile,
} from '../controllers/user.controller';
import { requireRole } from '../middleware/requireRole';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Auth
router.post('/auth/login', authRateLimiter, (req, res) => login(req, res, 'user'));
router.post('/auth/register', authRateLimiter, register);
router.get('/auth/me', (req, res) => me(req, res, 'user'));
router.post('/auth/logout', logout);
router.post('/auth/forgot-password', authRateLimiter, forgotPassword);
router.post('/auth/reset-password', authRateLimiter, resetPassword);

// Public Catalog
router.get('/galleries', listGalleries('user'));
router.patch('/galleries/like', toggleLike);
router.get('/categories', listCategories('user'));
router.get('/costumes', listCostumes('user'));
router.get('/events', listEvents('user'));
router.get('/reviews', listUserReviews);
router.get('/settings', getPublicSettings);
router.post('/coupons/validate', validateCoupon);

// Authenticated User Actions
router.get('/orders', requireRole('user'), listUserOrders);
router.post('/orders', requireRole('user'), createOrder);
router.patch('/orders', requireRole('user'), updateOrder);

router.get('/tickets', getTicketsOrSeats('user'));
router.post('/tickets', requireRole('user'), bookTicket);

router.post('/reviews', requireRole('user'), createReview);

router.get('/wishlist', requireRole('user'), getWishlist);
router.post('/wishlist', requireRole('user'), addWishlist);
router.delete('/wishlist', requireRole('user'), removeWishlist);

router.get('/profile', requireRole('user'), getProfile);
router.patch('/profile', requireRole('user'), updateProfile);

router.get('/sync', getUserSync);

export default router;
