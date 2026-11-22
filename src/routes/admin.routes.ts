import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller';
import {
  createStockMovement,
  deleteUser,
  getAdminSettings,
  getAdminSync,
  getAnalytics,
  getAuditLogs,
  listStockMovements,
  listUsers,
  resetDatabase,
  saveSettings,
  saveUser,
} from '../controllers/admin.controller';
import { deleteCostume, listCostumes, saveCostume } from '../controllers/busana.controller';
import {
  deleteCategory,
  deleteGallery,
  listCategories,
  listGalleries,
  saveCategory,
  saveGallery,
} from '../controllers/galeri.controller';
import { deleteEvent, listEvents, saveEvent } from '../controllers/jadwal.controller';
import { listAdminOrders, updateOrder } from '../controllers/orders.controller';
import { bookTicket, gateCheckin, getTicketsOrSeats } from '../controllers/tickets.controller';
import { deleteCoupon, listCoupons, saveCoupon } from '../controllers/payments.controller';
import { deleteReview, listAdminReviews, moderateReview } from '../controllers/reviews.controller';
import { requireRole } from '../middleware/requireRole';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Admin Auth
router.post('/auth/login', authRateLimiter, (req, res) => login(req, res, 'admin'));
router.get('/auth/me', (req, res) => me(req, res, 'admin'));
router.post('/auth/logout', logout);

// All routes below require admin role
router.use(requireRole('admin'));

router.get('/analytics', getAnalytics);
router.get('/audit', getAuditLogs);
router.get('/sync', getAdminSync);

router.get('/galleries', listGalleries('admin'));
router.post('/galleries', saveGallery);
router.delete('/galleries', deleteGallery);

router.get('/categories', listCategories('admin'));
router.post('/categories', saveCategory);
router.delete('/categories', deleteCategory);

router.get('/costumes', listCostumes('admin'));
router.post('/costumes', saveCostume);
router.delete('/costumes', deleteCostume);

router.get('/stock-movements', listStockMovements);
router.post('/stock-movements', createStockMovement);

router.get('/orders', listAdminOrders);
router.patch('/orders', updateOrder);

router.get('/events', listEvents('admin'));
router.post('/events', saveEvent);
router.delete('/events', deleteEvent);

router.get('/tickets', getTicketsOrSeats('admin'));
router.post('/tickets', bookTicket);
router.patch('/tickets', gateCheckin);

router.get('/coupons', listCoupons);
router.post('/coupons', saveCoupon);
router.delete('/coupons', deleteCoupon);

router.get('/reviews', listAdminReviews);
router.patch('/reviews', moderateReview);
router.delete('/reviews', deleteReview);

router.get('/users', listUsers);
router.post('/users', saveUser);
router.delete('/users', deleteUser);

router.get('/settings', getAdminSettings);
router.post('/settings', saveSettings);
router.put('/settings', resetDatabase);

export default router;
