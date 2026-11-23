import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../logger';
import {
  AdminDBState,
  AuditLogItem,
  CategoryItem,
  CostumeItem,
  CouponItem,
  EventItem,
  GalleryItem,
  OrderItem,
  ReviewItem,
  SettingsItem,
  StockMovementItem,
  TicketItem,
  UserDBState,
  UserItem,
  WishlistItem,
} from '../types/models';

let pool: Pool | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function normalizeHost(host: string): string {
  return host === 'localhost' ? '127.0.0.1' : host;
}

function parseJsonSafe<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function getMysqlPool(): Pool {
  if (pool) return pool;

  if (env.DATABASE_URL) {
    pool = mysql.createPool(env.DATABASE_URL);
  } else {
    pool = mysql.createPool({
      host: normalizeHost(env.DB_HOST),
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      multipleStatements: true,
    });
  }
  return pool;
}

export async function closeMysqlPool(): Promise<void> {
  await writeQueue;
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function ensureMysqlDatabaseAndSchema(): Promise<boolean> {
  try {
    if (!env.DATABASE_URL) {
      const bootstrap = await mysql.createConnection({
        host: normalizeHost(env.DB_HOST),
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        multipleStatements: true,
      });
      await bootstrap.query(
        `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await bootstrap.end();
    }

    const conn = await getMysqlPool().getConnection();
    await conn.ping();
    conn.release();

    const schemaPath = path.join(process.cwd(), 'sql', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const rawSql = fs.readFileSync(schemaPath, 'utf-8');
      // Strip CREATE DATABASE / USE when using pool bound to DB_NAME or cloud DATABASE_URL
      const statements = rawSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && !/^CREATE\s+DATABASE/i.test(s) && !/^USE\s+/i.test(s));

      for (const stmt of statements) {
        await getMysqlPool().query(stmt);
      }
    }

    logger.info(
      `Koneksi MySQL aktif & skema 13 tabel siap (${env.DATABASE_URL ? 'DATABASE_URL' : `${normalizeHost(env.DB_HOST)}:${env.DB_PORT}/${env.DB_NAME}`})`
    );
    return true;
  } catch (err) {
    logger.warn('Koneksi MySQL tidak tersedia saat ini', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function hasMysqlData(): Promise<boolean> {
  try {
    const [rows] = await getMysqlPool().query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM users');
    return Number(rows[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

export async function loadAllFromMysql(): Promise<{
  users: UserItem[];
  categories: CategoryItem[];
  costumes: CostumeItem[];
  galleries: GalleryItem[];
  events: EventItem[];
  orders: OrderItem[];
  tickets: TicketItem[];
  stockMovements: StockMovementItem[];
  coupons: CouponItem[];
  reviews: ReviewItem[];
  wishlists: WishlistItem[];
  auditLogs: AuditLogItem[];
  settings: SettingsItem | null;
}> {
  const p = getMysqlPool();
  const [userRows] = await p.query<RowDataPacket[]>('SELECT * FROM users');
  const [catRows] = await p.query<RowDataPacket[]>('SELECT * FROM categories');
  const [costumeRows] = await p.query<RowDataPacket[]>('SELECT * FROM costumes');
  const [galleryRows] = await p.query<RowDataPacket[]>('SELECT * FROM galleries');
  const [eventRows] = await p.query<RowDataPacket[]>('SELECT * FROM events');
  const [orderRows] = await p.query<RowDataPacket[]>('SELECT * FROM orders ORDER BY created_at DESC');
  const [ticketRows] = await p.query<RowDataPacket[]>('SELECT * FROM tickets ORDER BY created_at DESC');
  const [smRows] = await p.query<RowDataPacket[]>('SELECT * FROM stock_movements ORDER BY created_at DESC');
  const [couponRows] = await p.query<RowDataPacket[]>('SELECT * FROM coupons');
  const [reviewRows] = await p.query<RowDataPacket[]>('SELECT * FROM reviews ORDER BY created_at DESC');
  const [wishlistRows] = await p.query<RowDataPacket[]>('SELECT * FROM wishlists ORDER BY created_at DESC');
  const [auditRows] = await p.query<RowDataPacket[]>('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200');
  const [settingRows] = await p.query<RowDataPacket[]>('SELECT * FROM settings WHERE id = 1');

  const users: UserItem[] = userRows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    status: r.status,
    avatar: r.avatar || undefined,
    points: Number(r.points || 0),
    registeredAt: r.registered_at,
    password: r.password || undefined,
    passwordChangedAt: r.password_changed_at || undefined,
  }));

  const categories: CategoryItem[] = catRows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    description: r.description,
    count: Number(r.item_count || 0),
  }));

  const costumes: CostumeItem[] = costumeRows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    price: Number(r.price),
    rating: Number(r.rating),
    reviewCount: Number(r.review_count || 0),
    stock: Number(r.stock),
    sizes: parseJsonSafe<string[]>(r.sizes, ['All Size']),
    sizeStocks: parseJsonSafe<Record<string, number> | undefined>(r.size_stocks, undefined),
    image: r.image,
    description: r.description,
    origin: r.origin || undefined,
  }));

  const galleries: GalleryItem[] = galleryRows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    categoryName: r.category_name,
    type: r.type,
    date: r.event_date,
    description: r.description,
    image: r.image,
    views: Number(r.views || 0),
    likes: Number(r.likes || 0),
    isLiked: false,
    origin: r.origin,
    costumeId: r.costume_id || undefined,
  }));

  const events: EventItem[] = eventRows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.event_date,
    time: r.event_time,
    location: r.location,
    price: Number(r.price),
    quota: Number(r.quota),
    booked: Number(r.booked || 0),
    image: r.image,
    description: r.description,
    zonePrices: parseJsonSafe(r.zone_prices, undefined),
  }));

  const orders: OrderItem[] = orderRows.map((r) => ({
    id: r.id,
    userId: r.user_id || undefined,
    userName: r.user_name,
    userPhone: r.user_phone,
    userEmail: r.user_email,
    costumeId: r.costume_id || '',
    costumeName: r.costume_name,
    costumes: parseJsonSafe(r.costumes_json, undefined),
    startDate: r.start_date,
    duration: Number(r.duration),
    totalPrice: Number(r.total_price),
    depositFee: Number(r.deposit_fee),
    discountAmount: Number(r.discount_amount || 0),
    couponCode: r.coupon_code || undefined,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentProof: r.payment_proof || undefined,
    qcStatus: r.qc_status || undefined,
    refundAmount: r.refund_amount !== null && r.refund_amount !== undefined ? Number(r.refund_amount) : undefined,
    deductionNote: r.deduction_note || undefined,
    holdExpiresAt: r.hold_expires_at || undefined,
    completedAt: r.completed_at || undefined,
    refundStatus: r.refund_status || undefined,
    cancelReason: r.cancel_reason || undefined,
    createdAt: r.created_at,
  }));

  const tickets: TicketItem[] = ticketRows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventTitle: r.event_title,
    userId: r.user_id || undefined,
    userName: r.user_name,
    userPhone: r.user_phone,
    quantity: Number(r.quantity),
    seats: parseJsonSafe<string[]>(r.seats, []),
    zone: r.zone,
    totalPrice: Number(r.total_price),
    status: r.status,
    bookingCode: r.booking_code,
    createdAt: r.created_at,
  }));

  const stockMovements: StockMovementItem[] = smRows.map((r) => ({
    id: r.id,
    costumeId: r.costume_id,
    costumeName: r.costume_name,
    size: r.size,
    delta: Number(r.delta),
    stockAfter: Number(r.stock_after),
    reason: r.reason,
    note: r.note || undefined,
    actorName: r.actor_name,
    orderId: r.order_id || undefined,
    createdAt: r.created_at,
  }));

  const coupons: CouponItem[] = couponRows.map((r) => ({
    id: r.id,
    code: r.code,
    type: r.type,
    value: Number(r.value),
    minOrder: Number(r.min_order || 0),
    maxUses: Number(r.max_uses || 0),
    usedCount: Number(r.used_count || 0),
    isActive: Boolean(r.is_active),
    expiresAt: r.expires_at,
    description: r.description || undefined,
  }));

  const reviews: ReviewItem[] = reviewRows.map((r) => ({
    id: r.id,
    targetId: r.target_id,
    targetType: r.target_type,
    userName: r.user_name,
    rating: Number(r.rating),
    comment: r.comment,
    verified: Boolean(r.verified),
    status: r.status,
    createdAt: r.created_at,
  }));

  const wishlists: WishlistItem[] = wishlistRows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    targetId: r.target_id,
    targetType: r.target_type,
    createdAt: r.created_at,
  }));

  const auditLogs: AuditLogItem[] = auditRows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    action: r.action,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    details: r.details,
    ipAddress: r.ip_address,
    severity: r.severity,
  }));

  const s = settingRows[0];
  const settings: SettingsItem | null = s
    ? {
        galleryName: s.gallery_name,
        tagline: s.tagline,
        openHours: s.open_hours,
        location: s.location,
        phone: s.phone,
        email: s.email,
        depositFee: Number(s.deposit_fee),
        terms: s.terms,
        notifications: Boolean(s.notifications),
        holdDurationMinutes: Number(s.hold_duration_minutes || 1440),
        refundWindowDays: Number(s.refund_window_days || 3),
        lowStockThreshold: Number(s.low_stock_threshold || 5),
        whatsappAdminNumber: s.whatsapp_admin_number || undefined,
      }
    : null;

  return {
    users,
    categories,
    costumes,
    galleries,
    events,
    orders,
    tickets,
    stockMovements,
    coupons,
    reviews,
    wishlists,
    auditLogs,
    settings,
  };
}

export function queueMysqlSync(adminDb: AdminDBState, userDb: UserDBState): Promise<void> {
  if (env.DB_DRIVER !== 'mysql') return Promise.resolve();

  writeQueue = writeQueue
    .then(async () => {
      const conn = await getMysqlPool().getConnection();
      try {
        await conn.beginTransaction();

        const allUsers = [...adminDb.adminAccounts, ...userDb.userAccounts];
        const validUserIds = new Set(allUsers.map((u) => u.id));
        const validCostumeIds = new Set(adminDb.masterCostumes.map((c) => c.id));
        const validEventIds = new Set(adminDb.masterEvents.map((e) => e.id));
        const validOrderIds = new Set(adminDb.masterOrders.map((o) => o.id));

        // Clear child tables first, then parent tables cleanly inside transaction
        await conn.query('DELETE FROM stock_movements');
        await conn.query('DELETE FROM wishlists');
        await conn.query('DELETE FROM tickets');
        await conn.query('DELETE FROM orders');
        await conn.query('DELETE FROM galleries');
        await conn.query('DELETE FROM reviews');
        await conn.query('DELETE FROM coupons');
        await conn.query('DELETE FROM audit_logs');
        await conn.query('DELETE FROM settings');
        await conn.query('DELETE FROM events');
        await conn.query('DELETE FROM costumes');
        await conn.query('DELETE FROM categories');
        await conn.query('DELETE FROM users');

        for (const u of allUsers) {
          await conn.query(
            `INSERT INTO users (id, name, email, phone, role, status, avatar, points, registered_at, password, password_changed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              u.id,
              u.name,
              u.email,
              u.phone || '',
              u.role,
              u.status || 'active',
              u.avatar || null,
              u.points || 0,
              u.registeredAt || '',
              u.password || null,
              u.passwordChangedAt || null,
            ]
          );
        }

        for (const c of adminDb.masterCategories) {
          await conn.query(
            `INSERT INTO categories (id, name, icon, description, item_count) VALUES (?, ?, ?, ?, ?)`,
            [c.id, c.name, c.icon, c.description, c.count || 0]
          );
        }

        for (const item of adminDb.masterCostumes) {
          await conn.query(
            `INSERT INTO costumes (id, name, category, price, rating, review_count, stock, sizes, size_stocks, image, description, origin)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.name,
              item.category,
              item.price,
              item.rating || 5,
              item.reviewCount || 0,
              item.stock,
              JSON.stringify(item.sizes || ['All Size']),
              item.sizeStocks ? JSON.stringify(item.sizeStocks) : null,
              item.image,
              item.description,
              item.origin || null,
            ]
          );
        }

        for (const g of adminDb.masterGalleries) {
          const cid = g.costumeId && validCostumeIds.has(g.costumeId) ? g.costumeId : null;
          await conn.query(
            `INSERT INTO galleries (id, title, category, category_name, type, event_date, description, image, views, likes, origin, costume_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              g.id,
              g.title,
              g.category,
              g.categoryName,
              g.type || 'foto',
              g.date,
              g.description,
              g.image,
              g.views || 0,
              g.likes || 0,
              g.origin || '',
              cid,
            ]
          );
        }

        for (const e of adminDb.masterEvents) {
          await conn.query(
            `INSERT INTO events (id, title, event_date, event_time, location, price, quota, booked, image, description, zone_prices)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              e.id,
              e.title,
              e.date,
              e.time,
              e.location,
              e.price,
              e.quota,
              e.booked || 0,
              e.image,
              e.description,
              e.zonePrices ? JSON.stringify(e.zonePrices) : null,
            ]
          );
        }

        for (const o of adminDb.masterOrders) {
          const uid = o.userId && validUserIds.has(o.userId) ? o.userId : null;
          const cid = o.costumeId && validCostumeIds.has(o.costumeId) ? o.costumeId : null;
          await conn.query(
            `INSERT INTO orders (id, user_id, user_name, user_phone, user_email, costume_id, costume_name, costumes_json, start_date, duration, total_price, deposit_fee, discount_amount, coupon_code, status, payment_method, payment_proof, qc_status, refund_amount, deduction_note, hold_expires_at, completed_at, refund_status, cancel_reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              o.id,
              uid,
              o.userName,
              o.userPhone,
              o.userEmail || '',
              cid,
              o.costumeName,
              o.costumes ? JSON.stringify(o.costumes) : null,
              o.startDate,
              o.duration || 1,
              o.totalPrice,
              o.depositFee || 0,
              o.discountAmount || 0,
              o.couponCode || null,
              o.status,
              o.paymentMethod || 'QRIS',
              o.paymentProof || null,
              o.qcStatus || null,
              o.refundAmount ?? null,
              o.deductionNote || null,
              o.holdExpiresAt || null,
              o.completedAt || null,
              o.refundStatus || 'tidak_ada',
              o.cancelReason || null,
              o.createdAt,
            ]
          );
        }

        for (const t of adminDb.masterTickets) {
          if (!validEventIds.has(t.eventId)) continue;
          const uid = t.userId && validUserIds.has(t.userId) ? t.userId : null;
          await conn.query(
            `INSERT INTO tickets (id, event_id, event_title, user_id, user_name, user_phone, quantity, seats, zone, total_price, status, booking_code, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              t.id,
              t.eventId,
              t.eventTitle,
              uid,
              t.userName,
              t.userPhone,
              t.quantity || 1,
              JSON.stringify(t.seats || []),
              t.zone,
              t.totalPrice,
              t.status,
              t.bookingCode,
              t.createdAt,
            ]
          );
        }

        for (const sm of adminDb.stockMovements || []) {
          if (!validCostumeIds.has(sm.costumeId)) continue;
          const oid = sm.orderId && validOrderIds.has(sm.orderId) ? sm.orderId : null;
          await conn.query(
            `INSERT INTO stock_movements (id, costume_id, costume_name, size, delta, stock_after, reason, note, actor_name, order_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sm.id,
              sm.costumeId,
              sm.costumeName,
              sm.size || 'All Size',
              sm.delta,
              sm.stockAfter,
              sm.reason,
              sm.note || null,
              sm.actorName,
              oid,
              sm.createdAt,
            ]
          );
        }

        for (const cp of adminDb.masterCoupons) {
          await conn.query(
            `INSERT INTO coupons (id, code, type, value, min_order, max_uses, used_count, is_active, expires_at, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              cp.id,
              cp.code,
              cp.type,
              cp.value,
              cp.minOrder || 0,
              cp.maxUses || 0,
              cp.usedCount || 0,
              cp.isActive ? 1 : 0,
              cp.expiresAt,
              cp.description || null,
            ]
          );
        }

        for (const r of adminDb.moderationReviews) {
          await conn.query(
            `INSERT INTO reviews (id, target_id, target_type, user_name, rating, comment, verified, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              r.id,
              r.targetId,
              r.targetType,
              r.userName,
              r.rating,
              r.comment,
              r.verified ? 1 : 0,
              r.status || 'tampil',
              r.createdAt,
            ]
          );
        }

        for (const w of userDb.wishlists || []) {
          if (!validUserIds.has(w.userId)) continue;
          await conn.query(
            `INSERT INTO wishlists (id, user_id, target_id, target_type, created_at) VALUES (?, ?, ?, ?, ?)`,
            [w.id, w.userId, w.targetId, w.targetType, w.createdAt]
          );
        }

        for (const l of (adminDb.auditLogs || []).slice(0, 200)) {
          await conn.query(
            `INSERT INTO audit_logs (id, timestamp, action, actor_name, actor_role, details, ip_address, severity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [l.id, l.timestamp, l.action, l.actorName, l.actorRole, l.details, l.ipAddress, l.severity]
          );
        }

        const st = adminDb.systemSettings;
        await conn.query(
          `INSERT INTO settings (id, gallery_name, tagline, open_hours, location, phone, email, deposit_fee, terms, notifications, hold_duration_minutes, refund_window_days, low_stock_threshold, whatsapp_admin_number)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            st.galleryName,
            st.tagline,
            st.openHours,
            st.location,
            st.phone,
            st.email,
            st.depositFee,
            st.terms,
            st.notifications ? 1 : 0,
            st.holdDurationMinutes || 1440,
            st.refundWindowDays || 3,
            st.lowStockThreshold || 5,
            st.whatsappAdminNumber || null,
          ]
        );

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        logger.error('Gagal sinkronisasi ke MySQL', err instanceof Error ? err.message : err);
      } finally {
        conn.release();
      }
    })
    .catch((err) => {
      logger.error('Queue MySQL error', err instanceof Error ? err.message : err);
    });

  return writeQueue;
}
