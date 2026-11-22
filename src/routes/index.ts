import { Router } from 'express';
import authRoutes from './auth.routes';
import busanaRoutes from './busana.routes';
import galeriRoutes from './galeri.routes';
import jadwalRoutes from './jadwal.routes';
import ordersRoutes from './orders.routes';
import ticketsRoutes from './tickets.routes';
import reviewsRoutes from './reviews.routes';
import paymentsRoutes from './payments.routes';
import uploadRoutes from './upload.routes';
import userRoutes from './user.routes';
import adminRoutes from './admin.routes';

import { deleteCategory, listCategories, saveCategory } from '../controllers/galeri.controller';
import { listCoupons, validateCoupon } from '../controllers/payments.controller';
import {
  createStockMovement,
  getAdminSync,
  getAnalytics,
  getAuditLogs,
  listStockMovements,
  listUsers,
  resetDatabase,
  saveSettings,
  saveUser,
} from '../controllers/admin.controller';
import { getLegacySync, getPublicSettings } from '../controllers/user.controller';
import { requireRole } from '../middleware/requireRole';

export const apiRouter = Router();

// 1. Dual Namespace Routes (/api/user/* & /api/admin/*)
apiRouter.use('/user', userRoutes);
apiRouter.use('/admin', adminRoutes);

// 2. Domain Routes (/api/*)
apiRouter.use('/auth', authRoutes);
apiRouter.use('/costumes', busanaRoutes);
apiRouter.use('/galleries', galeriRoutes);
apiRouter.use('/events', jadwalRoutes);
apiRouter.use('/orders', ordersRoutes);
apiRouter.use('/tickets', ticketsRoutes);
apiRouter.use('/reviews', reviewsRoutes);
apiRouter.use('/payments', paymentsRoutes);
apiRouter.use('/upload', uploadRoutes);

// 3. Direct Legacy Endpoints (/api/categories, /api/coupons, /api/sync, /api/analytics, dll.)
apiRouter.get('/categories', listCategories('user'));
apiRouter.post('/categories', requireRole('admin'), saveCategory);
apiRouter.delete('/categories', requireRole('admin'), deleteCategory);

apiRouter.get('/coupons', requireRole('admin'), listCoupons);
apiRouter.post('/coupons', validateCoupon);

apiRouter.get('/stock-movements', requireRole('admin'), listStockMovements);
apiRouter.post('/stock-movements', requireRole('admin'), createStockMovement);

apiRouter.get('/analytics', requireRole('admin'), getAnalytics);
apiRouter.get('/audit', requireRole('admin'), getAuditLogs);

apiRouter.get('/users', requireRole('admin'), listUsers);
apiRouter.post('/users', requireRole('admin'), saveUser);

apiRouter.get('/settings', getPublicSettings);
apiRouter.post('/settings', requireRole('admin'), saveSettings);
apiRouter.put('/settings', requireRole('admin'), resetDatabase);

apiRouter.get('/sync', getLegacySync);
apiRouter.get('/sync/admin', requireRole('admin'), getAdminSync);
