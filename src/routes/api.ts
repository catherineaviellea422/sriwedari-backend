import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ServerDB } from '../database/server-db';
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  getSessionFromReq,
  requireAuth,
} from '../security/session';
import { OrderItem, CostumeItem, EventItem, TicketItem, ReviewItem, CouponItem, UserItem, Role } from '../types';

export const apiRouter = Router();

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({ success: false, error: 'Email dan kata sandi wajib diisi.' });
    }

    const users = ServerDB.getUsers();
    let user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    // Support quick aliases
    if (!user) {
      if (['admin', 'admin@sriwedari.id', 'admin@galerisriwedari.id'].includes(cleanEmail)) {
        user = users.find((u) => u.role === 'admin');
      } else if (['tamu', 'user', 'tamu@sriwedari.id'].includes(cleanEmail)) {
        user = users.find((u) => u.role === 'user');
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Kredensial tidak cocok. Pengguna dengan email ini tidak terdaftar.',
      });
    }

    if (role && role === 'admin' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak. Akun ini tidak memiliki hak wewenang Kurator / Administrator.',
      });
    }

    const isMatch = await verifyPassword(cleanPassword, user.password || '');
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Kata sandi tidak sesuai.' });
    }

    // Auto-migrate plaintext if needed
    if (user.password && !user.password.startsWith('pbkdf2:')) {
      const hashed = await hashPassword(cleanPassword);
      user.password = hashed;
      ServerDB.saveUser(user);
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Akun dinonaktifkan oleh administrator.' });
    }

    const token = await createSessionToken(user);
    const safeUser = { ...user };
    delete safeUser.password;

    res.cookie('sriwedari_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    ServerDB.logAudit('UPDATE_SETTINGS', `Sesi login untuk ${user.email} (${user.role.toUpperCase()})`, 'info', user.name, user.role === 'admin' ? 'Admin' : 'User');

    return res.json({
      success: true,
      user: safeUser,
      token,
      message: `Sugeng rawuh, ${user.name}! Sesi berhasil dibuat.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({ success: false, error: 'Nama lengkap, email, dan kata sandi wajib diisi.' });
    }

    const users = ServerDB.getUsers();
    if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, error: 'Alamat email sudah terdaftar.' });
    }

    const hashedPassword = await hashPassword(cleanPassword);
    const assignedRole: Role = role === 'admin' ? 'admin' : 'user';

    const newUser: UserItem = {
      id: `usr-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      phone: (phone || '').trim(),
      role: assignedRole,
      status: 'active',
      points: 0,
      registeredAt: new Date().toISOString().split('T')[0],
      password: hashedPassword,
    };

    ServerDB.saveUser(newUser);
    const token = await createSessionToken(newUser);
    const safeUser = { ...newUser };
    delete safeUser.password;

    res.cookie('sriwedari_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      user: safeUser,
      token,
      message: 'Registrasi berhasil! Akun Anda aktif.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Belum ada sesi aktif.' });
  }

  const user = ServerDB.getUserById(session.id);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ success: false, error: 'Sesi tidak lagi valid.' });
  }

  const safeUser = { ...user };
  delete safeUser.password;
  return res.json({ success: true, user: safeUser });
});

apiRouter.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('sriwedari_session', { path: '/' });
  return res.json({ success: true, message: 'Sesi logout berhasil.' });
});

// ==========================================
// 2. ORDERS / SEWA BUSANA
// ==========================================
apiRouter.get('/orders', async (req: Request, res: Response) => {
  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Sesi diperlukan untuk melihat daftar pesanan.' });
  }

  const orders = ServerDB.getOrders();
  if (session.role === 'admin') {
    return res.json({ success: true, data: orders });
  }
  const userOrders = orders.filter((o) => o.userName === session.name || o.userEmail?.toLowerCase() === session.email.toLowerCase());
  return res.json({ success: true, data: userOrders });
});

apiRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const session = await getSessionFromReq(req);
    const orderData = {
      ...body,
      userEmail: session?.email || body.userEmail || '',
      userName: session?.name || body.userName || 'Penyewa',
      userPhone: body.userPhone || '081234567890',
    };
    const newOrder = ServerDB.createOrder(orderData);
    return res.status(201).json({ success: true, data: newOrder });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.patch('/orders', async (req: Request, res: Response) => {
  try {
    const { orderId, status, paymentProof, qcStatus, refundAmount, deductionNote } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId wajib diisi.' });
    }

    const session = await getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Sesi diperlukan untuk memperbarui pesanan.' });
    }

    if (qcStatus !== undefined) {
      if (session.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Hanya kurator admin yang berwenang melakukan inspeksi QC.' });
      }
      ServerDB.updateOrderQc(orderId, qcStatus, refundAmount || 0, deductionNote);
      return res.json({ success: true, message: 'QC pesanan berhasil diperbarui.' });
    }

    if (status) {
      if (session.role !== 'admin' && status !== 'Dibatalkan') {
        return res.status(403).json({ success: false, error: 'Hanya admin yang dapat menyetujui atau mengubah status pesanan.' });
      }
      ServerDB.updateOrderStatus(orderId, status);
    }

    if (paymentProof) {
      ServerDB.attachPaymentProof(orderId, paymentProof);
    }

    return res.json({ success: true, message: 'Pesanan berhasil diperbarui.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. TICKETS / PENTAS WAYANG & POS GATE
// ==========================================
apiRouter.get('/tickets', async (req: Request, res: Response) => {
  const eventId = req.query.eventId as string;
  if (eventId) {
    const bookedSeats = ServerDB.getBookedSeats(eventId);
    return res.json({ success: true, eventId, bookedSeats });
  }

  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Sesi diperlukan untuk melihat tiket.' });
  }

  const allTickets = ServerDB.getTickets();
  if (session.role === 'admin') {
    return res.json({ success: true, data: allTickets });
  }
  const userTickets = allTickets.filter((t) => t.userName === session.name || (session as any).phone === t.userPhone);
  return res.json({ success: true, data: userTickets });
});

apiRouter.post('/tickets', async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    const body = req.body;
    const bookingPayload = {
      ...body,
      userName: session?.name || body.userName || 'Penonton',
      userPhone: body.userPhone || '081234567890',
    };
    const result = ServerDB.bookTicketAtomic(bookingPayload);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.patch('/tickets', requireAuth('admin'), async (req: Request, res: Response) => {
  try {
    const { ticketCode } = req.body;
    if (!ticketCode) {
      return res.status(400).json({ success: false, error: 'ticketCode wajib disertakan.' });
    }
    const result = ServerDB.validateGateTicket(ticketCode);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. COSTUMES / INVENTARIS BUSANA
// ==========================================
apiRouter.get('/costumes', (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (id) {
    const item = ServerDB.getCostumeById(id);
    if (!item) return res.status(404).json({ success: false, error: 'Busana tidak ditemukan.' });
    return res.json({ success: true, data: item });
  }
  return res.json({ success: true, data: ServerDB.getCostumes() });
});

apiRouter.post('/costumes', requireAuth('admin'), (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.name || !body.price) {
      return res.status(400).json({ success: false, error: 'Nama busana dan harga wajib diisi.' });
    }
    const saved = ServerDB.saveCostume(body);
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/costumes', requireAuth('admin'), (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id busana wajib diisi.' });
  const ok = ServerDB.deleteCostume(id);
  return res.json({ success: ok });
});

// ==========================================
// 5. GALLERIES / ARSIP SENI BUDAYA
// ==========================================
apiRouter.get('/galleries', (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (id) {
    const item = ServerDB.getGalleryById(id);
    if (!item) return res.status(404).json({ success: false, error: 'Karya seni tidak ditemukan.' });
    return res.json({ success: true, data: item });
  }
  return res.json({ success: true, data: ServerDB.getGalleries() });
});

apiRouter.post('/galleries', requireAuth('admin'), (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.title) {
      return res.status(400).json({ success: false, error: 'Judul karya wajib diisi.' });
    }
    const saved = ServerDB.saveGallery(body);
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.patch('/galleries', (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'id karya wajib diisi.' });
  const resLike = ServerDB.toggleLike(id);
  return res.json({ success: true, isLiked: resLike.isLiked, likes: resLike.likes });
});

apiRouter.delete('/galleries', requireAuth('admin'), (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id karya wajib disertakan.' });
  const ok = ServerDB.deleteGallery(id);
  return res.json({ success: ok });
});

// ==========================================
// 6. EVENTS / JADWAL PENTAS
// ==========================================
apiRouter.get('/events', (_req: Request, res: Response) => {
  return res.json({ success: true, data: ServerDB.getEvents() });
});

apiRouter.post('/events', requireAuth('admin'), (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.title || !body.date) {
      return res.status(400).json({ success: false, error: 'Judul pentas dan tanggal wajib diisi.' });
    }
    const saved = ServerDB.saveEvent(body);
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/events', requireAuth('admin'), (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id pentas wajib disertakan.' });
  const ok = ServerDB.deleteEvent(id);
  return res.json({ success: ok });
});

// ==========================================
// 7. CATEGORIES / RUMPUN SENI
// ==========================================
apiRouter.get('/categories', (_req: Request, res: Response) => {
  return res.json({ success: true, data: ServerDB.getCategories() });
});

apiRouter.post('/categories', requireAuth('admin'), (req: Request, res: Response) => {
  const body = req.body;
  if (!body.name) return res.status(400).json({ success: false, error: 'Nama kategori wajib diisi.' });
  const saved = ServerDB.saveCategory(body);
  return res.status(201).json({ success: true, data: saved });
});

apiRouter.delete('/categories', requireAuth('admin'), (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id kategori wajib disertakan.' });
  const ok = ServerDB.deleteCategory(id);
  return res.json({ success: ok });
});

// ==========================================
// 8. COUPONS / DISKON
// ==========================================
apiRouter.get('/coupons', requireAuth('admin'), (_req: Request, res: Response) => {
  return res.json({ success: true, data: ServerDB.getCoupons() });
});

apiRouter.post('/coupons', (req: Request, res: Response) => {
  const { code, totalAmount } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Kode kupon wajib diisi.' });

  const result = ServerDB.validateCoupon(code, totalAmount || 0);
  if (!result.valid) {
    return res.status(400).json({ success: false, error: result.message });
  }

  return res.json({ success: true, coupon: result.coupon, discountAmount: result.discount });
});

// ==========================================
// 9. REVIEWS / MODERASI ULASAN
// ==========================================
apiRouter.get('/reviews', async (req: Request, res: Response) => {
  const targetId = req.query.targetId as string | undefined;
  const session = await getSessionFromReq(req);
  const reviews = ServerDB.getReviews(targetId);

  if (session && session.role === 'admin') {
    return res.json({ success: true, data: reviews });
  }
  const publicReviews = reviews.filter((r) => r.status !== 'disembunyikan');
  return res.json({ success: true, data: publicReviews });
});

apiRouter.post('/reviews', async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    const body = req.body;
    const reviewData = {
      ...body,
      userName: session?.name || body.userName || 'Pengunjung Budaya',
    };
    const saved = ServerDB.addReview(reviewData);
    return res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.patch('/reviews', requireAuth('admin'), (req: Request, res: Response) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ success: false, error: 'id dan status wajib disertakan.' });
  const updated = ServerDB.updateReviewStatus(id, status);
  return res.json({ success: !!updated });
});

apiRouter.delete('/reviews', requireAuth('admin'), (req: Request, res: Response) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id ulasan wajib disertakan.' });
  const ok = ServerDB.deleteReview(id);
  return res.json({ success: ok });
});

// ==========================================
// 10. STOCK MOVEMENTS / BUKU BESAR MUTASI
// ==========================================
apiRouter.get('/stock-movements', requireAuth('admin'), (req: Request, res: Response) => {
  const costumeId = req.query.costumeId as string | undefined;
  const movements = ServerDB.getStockMovements(costumeId);
  return res.json({ success: true, data: movements });
});

apiRouter.post('/stock-movements', requireAuth('admin'), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const session = (req as any).user;
    const movement = ServerDB.recordStockMovement({
      ...body,
      actorName: session.name,
    });
    return res.status(201).json({ success: true, data: movement });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 11. ANALYTICS & AUDIT LOGS
// ==========================================
apiRouter.get('/analytics', requireAuth('admin'), (_req: Request, res: Response) => {
  const summary = ServerDB.getAnalytics();
  return res.json({ success: true, data: summary });
});

apiRouter.get('/audit', requireAuth('admin'), (req: Request, res: Response) => {
  const format = req.query.format as string;
  if (format === 'csv') {
    const csv = ServerDB.exportAuditLogsCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sriwedari-audit.csv"');
    return res.send(csv);
  }
  return res.json({ success: true, data: ServerDB.getAuditLogs() });
});

// ==========================================
// 12. USERS MANAGEMENT
// ==========================================
apiRouter.get('/users', requireAuth('admin'), (_req: Request, res: Response) => {
  const users = ServerDB.getUsers().map((u) => {
    const safe = { ...u };
    delete safe.password;
    return safe;
  });
  return res.json({ success: true, data: users });
});

apiRouter.post('/users', requireAuth('admin'), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body.password && !body.password.startsWith('pbkdf2:')) {
      body.password = await hashPassword(body.password);
    }
    const saved = ServerDB.saveUser(body);
    const safe = { ...saved };
    delete safe.password;
    return res.status(201).json({ success: true, data: safe });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 13. SETTINGS & REVENUE
// ==========================================
apiRouter.get('/settings', (_req: Request, res: Response) => {
  return res.json({ success: true, data: ServerDB.getSettings() });
});

apiRouter.post('/settings', requireAuth('admin'), (req: Request, res: Response) => {
  try {
    const updated = ServerDB.saveSettings(req.body);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put('/settings', requireAuth('admin'), (_req: Request, res: Response) => {
  try {
    ServerDB.resetDB();
    return res.json({ success: true, message: 'Database berhasil direset ke state bawaan.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 14. SYNC REALTIME STATE
// ==========================================
apiRouter.get('/sync', async (req: Request, res: Response) => {
  const session = await getSessionFromReq(req);
  const state = ServerDB.getSanitizedStateForUser(session);
  return res.json({ success: true, data: state });
});

// ==========================================
// 15. PAYMENTS WEBHOOK SIMULATION
// ==========================================
apiRouter.post('/payments/webhook', (req: Request, res: Response) => {
  try {
    const { orderId, transactionStatus, paymentType, grossAmount } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId wajib diisi.' });

    let newStatus: OrderItem['status'] = 'Menunggu';
    if (['settlement', 'capture', 'success'].includes(transactionStatus)) {
      newStatus = 'Dikonfirmasi';
    } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
      newStatus = 'Dibatalkan';
    }

    ServerDB.updateOrderStatus(orderId, newStatus);
    ServerDB.logAudit('VERIFY_PAYMENT', `Webhook payment: ${orderId} -> ${newStatus} (${paymentType || 'QRIS'})`, 'info');

    return res.json({
      success: true,
      message: `Status pesanan ${orderId} diubah menjadi ${newStatus}`,
      orderId,
      status: newStatus,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 16. FILE UPLOAD (MULTER)
// ==========================================
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'png';
    const cleanExt = ext === 'jpeg' ? 'jpg' : ext;
    const rawPrefix = (req.body?.prefix as string) || 'upload';
    const cleanPrefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'upload';
    const filename = `${cleanPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format berkas harus berupa gambar (JPG, PNG, WebP, GIF)'));
    }
  },
});

apiRouter.post('/upload', async (req: Request, res: Response) => {
  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Sesi autentikasi diperlukan untuk mengunggah berkas.' });
  }

  upload.single('file')(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Gagal mengunggah berkas.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada berkas yang diunggah.' });
    }

    const publicUrl = `/uploads/${req.file.filename}`;
    return res.json({
      success: true,
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      message: 'Berkas berhasil disimpan ke penyimpanan server.',
    });
  });
});
