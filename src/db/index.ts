import fs from 'fs';
import path from 'path';
import {
  GalleryItem,
  CategoryItem,
  CostumeItem,
  OrderItem,
  EventItem,
  TicketItem,
  UserItem,
  CouponItem,
  AuditLogItem,
  ReviewItem,
  SettingsItem,
  StockMovementItem,
  WishlistItem,
  PasswordResetRequest,
  AnalyticsSnapshotItem,
  UserDBState,
  AdminDBState,
  Role,
  SessionPayload,
} from '../types/models';
import {
  INITIAL_GALLERIES,
  INITIAL_CATEGORIES,
  INITIAL_COSTUMES,
  INITIAL_ORDERS,
  INITIAL_EVENTS,
  INITIAL_TICKETS,
  INITIAL_USERS,
  INITIAL_COUPONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SETTINGS,
  INITIAL_REVIEWS,
} from './seed-data';
import { adjustStockForOrder } from '../lib/stock';
import { computeHoldExpiresAt, formatShortTimestamp, formatTimestamp, isExpiredIso } from '../lib/dates';
import { evaluateCouponDiscount } from '../lib/payment';
import { logger } from '../logger';
import { env } from '../config/env';
import {
  closeMysqlPool,
  ensureMysqlDatabaseAndSchema,
  hasMysqlData,
  loadAllFromMysql,
  queueMysqlSync,
} from './mysql';

export interface ServerDBState {
  galleries: GalleryItem[];
  categories: CategoryItem[];
  costumes: CostumeItem[];
  orders: OrderItem[];
  events: EventItem[];
  tickets: TicketItem[];
  users: UserItem[];
  coupons: CouponItem[];
  auditLogs: AuditLogItem[];
  reviews: ReviewItem[];
  settings: SettingsItem;
  stockMovements?: StockMovementItem[];
  wishlists?: WishlistItem[];
}

export interface AnalyticsSummary {
  totalRevenue: number;
  revenueRental: number;
  revenueTickets: number;
  escrowDeposit: number;
  qcDeductions: number;
  paymentChannels: {
    QRIS: number;
    VA: number;
    Tunai: number;
  };
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  totalUsers: number;
  totalTicketsSold: number;
  gateCheckinCount: number;
  occupancyRate: number;
  totalCostumes: number;
  totalGalleries: number;
  totalEvents: number;
  topGalleries: GalleryItem[];
  recentActivities: AuditLogItem[];
  weeklyVisitors: AnalyticsSnapshotItem[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const USER_DB_FILE = path.join(DATA_DIR, 'sriwedari-user-db.json');
const ADMIN_DB_FILE = path.join(DATA_DIR, 'sriwedari-admin-db.json');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'sriwedari-db.json');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function buildInitialWeeklySnapshots(): AnalyticsSnapshotItem[] {
  const days = 7;
  const result: AnalyticsSnapshotItem[] = [];
  const baseVisitors = [110, 145, 132, 198, 240, 215, 268];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const idx = days - 1 - i;
    result.push({
      date: dateStr,
      visitors: baseVisitors[idx] ?? 150,
      revenue: (baseVisitors[idx] ?? 150) * 12500,
      ordersCount: 2 + (idx % 4),
      ticketsCount: 8 + idx * 3,
    });
  }
  return result;
}

function buildInitialUserDB(): UserDBState {
  const userAccounts = clone(INITIAL_USERS).filter((u) => u.role === 'user');
  const defaultWishlist: WishlistItem[] = [
    {
      id: 'wl-seed-1',
      userId: 'usr-user-1',
      targetId: 'gal-3',
      targetType: 'gallery',
      createdAt: '2026-10-24 10:00:00',
    },
    {
      id: 'wl-seed-2',
      userId: 'usr-user-1',
      targetId: 'costume-gandrung',
      targetType: 'costume',
      createdAt: '2026-10-24 10:05:00',
    },
  ];

  return {
    schemaVersion: 1,
    userAccounts,
    wishlists: defaultWishlist,
    userLikes: [],
    userOrders: clone(INITIAL_ORDERS),
    userTickets: clone(INITIAL_TICKETS),
    publicGalleries: clone(INITIAL_GALLERIES),
    publicCategories: clone(INITIAL_CATEGORIES),
    publicCostumes: clone(INITIAL_COSTUMES),
    publicEvents: clone(INITIAL_EVENTS),
    publicReviews: clone(INITIAL_REVIEWS).filter((r) => r.status !== 'disembunyikan'),
    publicSettings: clone(INITIAL_SETTINGS),
    activeCoupons: clone(INITIAL_COUPONS).filter((c) => c.isActive),
    passwordResets: [],
  };
}

function buildInitialAdminDB(): AdminDBState {
  const allUsers = clone(INITIAL_USERS);
  const adminAccounts = allUsers.filter((u) => u.role === 'admin');
  const managedUsers = allUsers.filter((u) => u.role === 'user');

  return {
    schemaVersion: 1,
    adminAccounts,
    managedUsers,
    masterGalleries: clone(INITIAL_GALLERIES),
    masterCategories: clone(INITIAL_CATEGORIES),
    masterCostumes: clone(INITIAL_COSTUMES),
    stockMovements: [],
    masterOrders: clone(INITIAL_ORDERS),
    masterEvents: clone(INITIAL_EVENTS),
    masterTickets: clone(INITIAL_TICKETS),
    masterCoupons: clone(INITIAL_COUPONS),
    moderationReviews: clone(INITIAL_REVIEWS),
    auditLogs: clone(INITIAL_AUDIT_LOGS),
    systemSettings: clone(INITIAL_SETTINGS),
    analyticsSnapshots: buildInitialWeeklySnapshots(),
  };
}

function atomicWriteJson(filePath: string, data: unknown): void {
  ensureDirectories();
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, filePath);
}

export class DatabaseBridgeService {
  static syncCatalogToUserDb(adminDb: AdminDBState, userDb: UserDBState): void {
    const likedGalleryIds = new Set(userDb.userLikes.map((l) => l.galleryId));
    userDb.publicGalleries = clone(adminDb.masterGalleries).map((g) => ({
      ...g,
      isLiked: g.isLiked || likedGalleryIds.has(g.id),
    }));
    userDb.publicCategories = clone(adminDb.masterCategories);
    userDb.publicCostumes = clone(adminDb.masterCostumes);
    userDb.publicEvents = clone(adminDb.masterEvents);
    userDb.publicReviews = clone(adminDb.moderationReviews).filter(
      (r) => r.status !== 'disembunyikan'
    );
    userDb.activeCoupons = clone(adminDb.masterCoupons).filter((c) => c.isActive);
    userDb.publicSettings = clone(adminDb.systemSettings);
  }

  static syncOrderToUserDb(order: OrderItem, userDb: UserDBState): void {
    const idx = userDb.userOrders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      userDb.userOrders[idx] = clone(order);
    } else {
      userDb.userOrders.unshift(clone(order));
    }
  }

  static syncOrderToAdminDb(order: OrderItem, adminDb: AdminDBState): void {
    const idx = adminDb.masterOrders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      adminDb.masterOrders[idx] = clone(order);
    } else {
      adminDb.masterOrders.unshift(clone(order));
    }
  }

  static syncTicketToUserDb(ticket: TicketItem, userDb: UserDBState): void {
    const idx = userDb.userTickets.findIndex((t) => t.id === ticket.id);
    if (idx >= 0) {
      userDb.userTickets[idx] = clone(ticket);
    } else {
      userDb.userTickets.unshift(clone(ticket));
    }
  }

  static syncUsersToAdminDirectory(userDb: UserDBState, adminDb: AdminDBState): void {
    adminDb.managedUsers = clone(userDb.userAccounts).map((u) => {
      const safe = { ...u };
      delete safe.password;
      return safe;
    });
  }

  static syncUserToUserDb(user: UserItem, userDb: UserDBState): void {
    if (user.role !== 'user') return;
    const idx = userDb.userAccounts.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      userDb.userAccounts[idx] = { ...userDb.userAccounts[idx], ...clone(user) };
    } else {
      userDb.userAccounts.push(clone(user));
    }
  }
}

class ServerDatabaseService {
  private initialized = false;
  private isHydrating = false;

  async connectAndVerify(): Promise<void> {
    this.initialize();
    if (env.DB_DRIVER === 'mysql') {
      const ready = await ensureMysqlDatabaseAndSchema();
      if (ready) {
        const populated = await hasMysqlData();
        if (!populated) {
          logger.info('Database MySQL masih kosong — melakukan seeding otomatis ke 13 tabel...');
          await queueMysqlSync(this.loadAdminDBRaw(), this.loadUserDB());
          logger.info('Seeding awal ke MySQL sriwedari_db selesai!');
        } else {
          this.isHydrating = true;
          try {
            const remote = await loadAllFromMysql();
            const adminDb = this.loadAdminDBRaw();
            const userDb = this.loadUserDB();

            adminDb.adminAccounts = remote.users.filter((u) => u.role === 'admin');
            userDb.userAccounts = remote.users.filter((u) => u.role === 'user');
            DatabaseBridgeService.syncUsersToAdminDirectory(userDb, adminDb);

            adminDb.masterCategories = remote.categories;
            adminDb.masterCostumes = remote.costumes;
            adminDb.masterGalleries = remote.galleries;
            adminDb.masterEvents = remote.events;
            adminDb.masterOrders = remote.orders;
            userDb.userOrders = clone(remote.orders);
            adminDb.masterTickets = remote.tickets;
            userDb.userTickets = clone(remote.tickets);
            adminDb.stockMovements = remote.stockMovements;
            adminDb.masterCoupons = remote.coupons;
            adminDb.moderationReviews = remote.reviews;
            userDb.wishlists = remote.wishlists;
            adminDb.auditLogs = remote.auditLogs;
            if (remote.settings) adminDb.systemSettings = remote.settings;

            DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
            atomicWriteJson(ADMIN_DB_FILE, adminDb);
            atomicWriteJson(USER_DB_FILE, userDb);
            logger.info('Data berhasil dimuat dari MySQL sriwedari_db.');
          } finally {
            this.isHydrating = false;
          }
        }
      } else {
        logger.warn('MySQL belum aktif. Tetap melayani dengan penyimpanan lokal Dual-JSON agar server tidak error.');
      }
    } else {
      logger.info('Database Driver: Dual-JSON Store (sriwedari-user-db.json & sriwedari-admin-db.json)');
    }
  }

  async close(): Promise<void> {
    await closeMysqlPool();
  }

  initialize(): void {
    ensureDirectories();
    const hasUserDb = fs.existsSync(USER_DB_FILE);
    const hasAdminDb = fs.existsSync(ADMIN_DB_FILE);

    if (hasUserDb && hasAdminDb) {
      this.initialized = true;
      return;
    }

    if (fs.existsSync(LEGACY_DB_FILE)) {
      try {
        const raw = fs.readFileSync(LEGACY_DB_FILE, 'utf-8');
        const legacy = JSON.parse(raw) as Partial<ServerDBState>;
        const userDb = buildInitialUserDB();
        const adminDb = buildInitialAdminDB();

        const allUsers = legacy.users ?? INITIAL_USERS;
        adminDb.adminAccounts = clone(allUsers.filter((u) => u.role === 'admin'));
        userDb.userAccounts = clone(allUsers.filter((u) => u.role === 'user'));
        DatabaseBridgeService.syncUsersToAdminDirectory(userDb, adminDb);

        if (legacy.galleries) adminDb.masterGalleries = clone(legacy.galleries);
        if (legacy.categories) adminDb.masterCategories = clone(legacy.categories);
        if (legacy.costumes) adminDb.masterCostumes = clone(legacy.costumes);
        if (legacy.orders) {
          adminDb.masterOrders = clone(legacy.orders);
          userDb.userOrders = clone(legacy.orders);
        }
        if (legacy.events) adminDb.masterEvents = clone(legacy.events);
        if (legacy.tickets) {
          adminDb.masterTickets = clone(legacy.tickets);
          userDb.userTickets = clone(legacy.tickets);
        }
        if (legacy.coupons) adminDb.masterCoupons = clone(legacy.coupons);
        if (legacy.reviews) adminDb.moderationReviews = clone(legacy.reviews);
        if (legacy.auditLogs) adminDb.auditLogs = clone(legacy.auditLogs);
        if (legacy.settings) adminDb.systemSettings = clone(legacy.settings);
        if (legacy.stockMovements) adminDb.stockMovements = clone(legacy.stockMovements);
        if (legacy.wishlists) userDb.wishlists = clone(legacy.wishlists);

        DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
        atomicWriteJson(USER_DB_FILE, userDb);
        atomicWriteJson(ADMIN_DB_FILE, adminDb);
        this.initialized = true;
        return;
      } catch (err) {
        logger.error('Gagal migrasi legacy DB, menggunakan seed awal Dual-DB', err);
      }
    }

    const userDb = buildInitialUserDB();
    const adminDb = buildInitialAdminDB();
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    atomicWriteJson(USER_DB_FILE, userDb);
    atomicWriteJson(ADMIN_DB_FILE, adminDb);
    this.initialized = true;
  }

  private checkAndExpireOrders(adminDb: AdminDBState, userDb: UserDBState): number {
    let expiredCount = 0;
    for (const order of adminDb.masterOrders || []) {
      if (order.status === 'Menunggu' && isExpiredIso(order.holdExpiresAt)) {
        order.status = 'Kedaluwarsa';
        order.cancelReason = 'Batas waktu penahanan (hold expiry) telah terlampaui';
        expiredCount += 1;

        DatabaseBridgeService.syncOrderToUserDb(order, userDb);
        adjustStockForOrder(adminDb, order, {
          delta: 1,
          reason: 'koreksi',
          note: `Pelepasan stok otomatis: Pesanan sewa ${order.id} telah kedaluwarsa`,
          actorName: 'Sistem Kedaluwarsa Otomatis',
        });
      }
    }
    if (expiredCount > 0) {
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    }
    return expiredCount;
  }

  expirePendingOrders(): number {
    const adminDb = this.loadAdminDBRaw();
    const userDb = this.loadUserDB();
    const count = this.checkAndExpireOrders(adminDb, userDb);
    if (count > 0) {
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      logger.info(`Cron Job: ${count} pesanan kedaluwarsa otomatis dilepaskan.`);
    }
    return count;
  }

  loadUserDB(): UserDBState {
    if (!this.initialized || !fs.existsSync(USER_DB_FILE)) {
      this.initialize();
    }
    try {
      const raw = fs.readFileSync(USER_DB_FILE, 'utf-8');
      return { ...buildInitialUserDB(), ...(JSON.parse(raw) as Partial<UserDBState>) };
    } catch {
      const fallback = buildInitialUserDB();
      atomicWriteJson(USER_DB_FILE, fallback);
      return fallback;
    }
  }

  saveUserDB(data: UserDBState): void {
    try {
      atomicWriteJson(USER_DB_FILE, data);
      if (!this.isHydrating && env.DB_DRIVER === 'mysql') {
        void queueMysqlSync(this.loadAdminDBRaw(), data);
      }
    } catch (err) {
      logger.error('Error saving user DB', err);
    }
  }

  private loadAdminDBRaw(): AdminDBState {
    if (!this.initialized || !fs.existsSync(ADMIN_DB_FILE)) {
      this.initialize();
    }
    try {
      const raw = fs.readFileSync(ADMIN_DB_FILE, 'utf-8');
      return { ...buildInitialAdminDB(), ...(JSON.parse(raw) as Partial<AdminDBState>) };
    } catch {
      const fallback = buildInitialAdminDB();
      atomicWriteJson(ADMIN_DB_FILE, fallback);
      return fallback;
    }
  }

  loadAdminDB(): AdminDBState {
    const adminDb = this.loadAdminDBRaw();
    const userDb = this.loadUserDB();
    if (this.checkAndExpireOrders(adminDb, userDb) > 0) {
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
    }
    return adminDb;
  }

  saveAdminDB(data: AdminDBState): void {
    try {
      atomicWriteJson(ADMIN_DB_FILE, data);
      if (!this.isHydrating && env.DB_DRIVER === 'mysql') {
        void queueMysqlSync(data, this.loadUserDB());
      }
    } catch (err) {
      logger.error('Error saving admin DB', err);
    }
  }

  // ==========================================
  // GALLERIES & CATEGORIES
  // ==========================================
  getGalleries(scope: 'user' | 'admin' = 'admin'): GalleryItem[] {
    return scope === 'user' ? this.loadUserDB().publicGalleries : this.loadAdminDB().masterGalleries;
  }

  getGalleryById(id: string, scope: 'user' | 'admin' = 'admin'): GalleryItem | undefined {
    return this.getGalleries(scope).find((g) => g.id === id);
  }

  saveGallery(gallery: GalleryItem): GalleryItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const idx = adminDb.masterGalleries.findIndex((g) => g.id === gallery.id);
    if (idx >= 0) {
      adminDb.masterGalleries[idx] = gallery;
    } else {
      if (!gallery.id) gallery.id = 'gal-' + Date.now();
      adminDb.masterGalleries.unshift(gallery);
    }
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('UPDATE_SETTINGS', `Karya galeri "${gallery.title}" disimpan`, 'info', 'Kurator', 'Admin');
    return gallery;
  }

  deleteGallery(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prevLen = adminDb.masterGalleries.length;
    adminDb.masterGalleries = adminDb.masterGalleries.filter((g) => g.id !== id);
    if (adminDb.masterGalleries.length !== prevLen) {
      userDb.wishlists = userDb.wishlists.filter((w) => w.targetId !== id);
      userDb.userLikes = userDb.userLikes.filter((l) => l.galleryId !== id);
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      this.logAudit('UPDATE_SETTINGS', `Karya galeri ID ${id} dihapus`, 'warning', 'Kurator', 'Admin');
      return true;
    }
    return false;
  }

  toggleLike(galleryId: string, userId?: string): { isLiked: boolean; likes: number } {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const masterItem = adminDb.masterGalleries.find((g) => g.id === galleryId);
    if (!masterItem) return { isLiked: false, likes: 0 };

    let nextLiked: boolean;
    if (userId) {
      const likeIdx = userDb.userLikes.findIndex((l) => l.userId === userId && l.galleryId === galleryId);
      if (likeIdx >= 0) {
        userDb.userLikes.splice(likeIdx, 1);
        nextLiked = false;
      } else {
        userDb.userLikes.push({ userId, galleryId, createdAt: formatTimestamp() });
        nextLiked = true;
      }
    } else {
      nextLiked = !masterItem.isLiked;
    }

    masterItem.isLiked = nextLiked;
    masterItem.likes = Math.max(0, (masterItem.likes || 0) + (nextLiked ? 1 : -1));
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    return { isLiked: nextLiked, likes: masterItem.likes };
  }

  getCategories(scope: 'user' | 'admin' = 'admin'): CategoryItem[] {
    return scope === 'user' ? this.loadUserDB().publicCategories : this.loadAdminDB().masterCategories;
  }

  saveCategory(category: CategoryItem): CategoryItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const idx = adminDb.masterCategories.findIndex((c) => c.id === category.id);
    if (idx >= 0) {
      adminDb.masterCategories[idx] = category;
    } else {
      if (!category.id) category.id = 'cat-' + Date.now();
      adminDb.masterCategories.push(category);
    }
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    return category;
  }

  deleteCategory(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prevLen = adminDb.masterCategories.length;
    adminDb.masterCategories = adminDb.masterCategories.filter((c) => c.id !== id);
    if (adminDb.masterCategories.length !== prevLen) {
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      return true;
    }
    return false;
  }

  // ==========================================
  // WISHLIST
  // ==========================================
  getWishlist(userId: string): WishlistItem[] {
    return this.loadUserDB().wishlists.filter((w) => w.userId === userId);
  }

  addToWishlist(userId: string, targetId: string, targetType: 'gallery' | 'costume'): WishlistItem[] {
    const userDb = this.loadUserDB();
    if (!userDb.wishlists.some((w) => w.userId === userId && w.targetId === targetId)) {
      userDb.wishlists.unshift({
        id: `wl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId,
        targetId,
        targetType,
        createdAt: formatTimestamp(),
      });
      this.saveUserDB(userDb);
    }
    return userDb.wishlists.filter((w) => w.userId === userId);
  }

  removeFromWishlist(userId: string, targetId: string): WishlistItem[] {
    const userDb = this.loadUserDB();
    userDb.wishlists = userDb.wishlists.filter((w) => !(w.userId === userId && w.targetId === targetId));
    this.saveUserDB(userDb);
    return userDb.wishlists.filter((w) => w.userId === userId);
  }

  // ==========================================
  // COSTUMES
  // ==========================================
  getCostumes(scope: 'user' | 'admin' = 'admin'): CostumeItem[] {
    return scope === 'user' ? this.loadUserDB().publicCostumes : this.loadAdminDB().masterCostumes;
  }

  getCostumeById(id: string, scope: 'user' | 'admin' = 'admin'): CostumeItem | undefined {
    return this.getCostumes(scope).find((c) => c.id === id);
  }

  saveCostume(costume: CostumeItem): CostumeItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const idx = adminDb.masterCostumes.findIndex((c) => c.id === costume.id);
    if (idx >= 0) {
      adminDb.masterCostumes[idx] = costume;
    } else {
      if (!costume.id) costume.id = 'costume-' + Date.now();
      adminDb.masterCostumes.unshift(costume);
    }
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('UPDATE_SETTINGS', `Busana "${costume.name}" disimpan`, 'info', 'Kurator', 'Admin');
    return costume;
  }

  deleteCostume(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prevLen = adminDb.masterCostumes.length;
    adminDb.masterCostumes = adminDb.masterCostumes.filter((c) => c.id !== id);
    if (adminDb.masterCostumes.length !== prevLen) {
      userDb.wishlists = userDb.wishlists.filter((w) => w.targetId !== id);
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      this.logAudit('UPDATE_SETTINGS', `Busana ID ${id} dihapus dari katalog`, 'warning', 'Kurator', 'Admin');
      return true;
    }
    return false;
  }

  // ==========================================
  // ORDERS, QC & STOCK MOVEMENTS
  // ==========================================
  getOrders(scope: 'user' | 'admin' = 'admin'): OrderItem[] {
    if (scope === 'user') {
      this.loadAdminDB();
      return this.loadUserDB().userOrders;
    }
    return this.loadAdminDB().masterOrders;
  }

  getOrderById(id: string): OrderItem | undefined {
    return this.getOrders('admin').find((o) => o.id === id);
  }

  createOrder(order: Omit<OrderItem, 'id' | 'createdAt'>): OrderItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const newId = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const holdMinutes = adminDb.systemSettings?.holdDurationMinutes || 1440;

    const newOrder: OrderItem = {
      ...order,
      id: newId,
      createdAt: formatShortTimestamp(),
      holdExpiresAt: order.holdExpiresAt || computeHoldExpiresAt(holdMinutes),
      refundStatus: 'tidak_ada',
    };

    DatabaseBridgeService.syncOrderToAdminDb(newOrder, adminDb);
    DatabaseBridgeService.syncOrderToUserDb(newOrder, userDb);

    adjustStockForOrder(adminDb, newOrder, {
      delta: -1,
      reason: 'disewa',
      note: `Pesanan sewa baru ${newId}`,
      actorName: newOrder.userName,
    });

    if (newOrder.couponCode) {
      const coupon = adminDb.masterCoupons.find(
        (c) => c.code.toUpperCase() === newOrder.couponCode!.toUpperCase()
      );
      if (coupon) coupon.usedCount = (coupon.usedCount || 0) + 1;
    }

    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit(
      'CREATE_ORDER',
      `Pesanan sewa ${newId} senilai Rp ${newOrder.totalPrice.toLocaleString('id-ID')} dibuat oleh ${newOrder.userName}`,
      'info',
      newOrder.userName,
      'User'
    );
    return newOrder;
  }

  updateOrderStatus(orderId: string, status: OrderItem['status']): OrderItem | null {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const item = adminDb.masterOrders.find((o) => o.id === orderId);
    if (!item) return null;

    const prev = item.status;
    item.status = status;

    if (
      (status === 'Dibatalkan' || status === 'Kedaluwarsa') &&
      prev !== 'Dibatalkan' &&
      prev !== 'Kedaluwarsa'
    ) {
      adjustStockForOrder(adminDb, item, {
        delta: 1,
        reason: 'koreksi',
        note: `Stok dikembalikan karena status pesanan: ${status}`,
        actorName: 'Admin/Sistem',
      });
    }

    DatabaseBridgeService.syncOrderToUserDb(item, userDb);
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('VERIFY_PAYMENT', `Pesanan ${orderId} diubah status: "${prev}" -> "${status}"`, 'info', 'Admin/Sistem', 'Admin');
    return item;
  }

  updateOrderQc(
    orderId: string,
    qcStatus: OrderItem['qcStatus'],
    refundAmount: number,
    note?: string
  ): OrderItem | null {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const item = adminDb.masterOrders.find((o) => o.id === orderId);
    if (!item) return null;

    item.qcStatus = qcStatus;
    item.refundAmount = refundAmount;
    item.deductionNote = note;
    item.refundStatus = refundAmount > 0 ? 'selesai' : 'tidak_ada';

    if (qcStatus && qcStatus !== 'Pending') {
      item.status = 'Selesai';
      item.completedAt = formatTimestamp();
      adjustStockForOrder(adminDb, item, {
        delta: 1,
        reason: 'dikembalikan',
        note: `Penyewa mengembalikan busana. Lulus QC: ${qcStatus}`,
        actorName: 'Kurator QC',
      });
    }

    DatabaseBridgeService.syncOrderToUserDb(item, userDb);
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit(
      'QC_RETURN',
      `Inspeksi QC untuk pesanan ${orderId}: ${qcStatus}, Refund Deposit Rp ${refundAmount.toLocaleString('id-ID')}. Catatan: ${note || '-'}`,
      'info',
      'Kurator QC',
      'Admin'
    );
    return item;
  }

  attachPaymentProof(orderId: string, proofUrl: string): OrderItem | null {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const item = adminDb.masterOrders.find((o) => o.id === orderId);
    if (!item) return null;

    item.paymentProof = proofUrl;
    DatabaseBridgeService.syncOrderToUserDb(item, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('VERIFY_PAYMENT', `Slip transfer pembayaran diunggah untuk pesanan ${orderId}`, 'info', item.userName, 'User');
    return item;
  }

  getStockMovements(costumeId?: string): StockMovementItem[] {
    const all = this.loadAdminDB().stockMovements || [];
    return costumeId ? all.filter((sm) => sm.costumeId === costumeId) : all;
  }

  recordStockMovement(movement: Omit<StockMovementItem, 'id' | 'createdAt'>): StockMovementItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const newMovement: StockMovementItem = {
      ...movement,
      id: `sm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: formatTimestamp(),
    };
    adminDb.stockMovements.unshift(newMovement);

    const costume = adminDb.masterCostumes.find((c) => c.id === movement.costumeId);
    if (costume) {
      costume.stock = Math.max(0, movement.stockAfter);
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveUserDB(userDb);
    }

    this.saveAdminDB(adminDb);
    return newMovement;
  }

  // ==========================================
  // EVENTS & TICKETS
  // ==========================================
  getEvents(scope: 'user' | 'admin' = 'admin'): EventItem[] {
    return scope === 'user' ? this.loadUserDB().publicEvents : this.loadAdminDB().masterEvents;
  }

  getEventById(id: string, scope: 'user' | 'admin' = 'admin'): EventItem | undefined {
    return this.getEvents(scope).find((e) => e.id === id);
  }

  saveEvent(event: EventItem): EventItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const idx = adminDb.masterEvents.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      adminDb.masterEvents[idx] = event;
    } else {
      if (!event.id) event.id = 'evt-' + Date.now();
      adminDb.masterEvents.unshift(event);
    }
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('UPDATE_SETTINGS', `Jadwal pementasan "${event.title}" disimpan`, 'info', 'Kurator', 'Admin');
    return event;
  }

  deleteEvent(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prevLen = adminDb.masterEvents.length;
    adminDb.masterEvents = adminDb.masterEvents.filter((e) => e.id !== id);
    if (adminDb.masterEvents.length !== prevLen) {
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      this.logAudit('UPDATE_SETTINGS', `Jadwal pementasan ID ${id} dihapus`, 'warning', 'Kurator', 'Admin');
      return true;
    }
    return false;
  }

  getTickets(scope: 'user' | 'admin' = 'admin'): TicketItem[] {
    return scope === 'user' ? this.loadUserDB().userTickets : this.loadAdminDB().masterTickets;
  }

  getTicketById(id: string): TicketItem | undefined {
    return this.getTickets('admin').find((t) => t.id === id);
  }

  getBookedSeats(eventId: string): string[] {
    const tickets = this.getTickets('admin').filter(
      (t) => t.eventId === eventId && t.status !== 'Kedaluwarsa'
    );
    const seats: string[] = [];
    tickets.forEach((t) => {
      if (Array.isArray(t.seats)) seats.push(...t.seats);
    });
    return seats;
  }

  bookTicketAtomic(
    ticket: Omit<TicketItem, 'id' | 'bookingCode' | 'createdAt'>
  ): { success: boolean; ticket?: TicketItem; error?: string } {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();

    const existingBooked = new Set<string>();
    adminDb.masterTickets
      .filter((t) => t.eventId === ticket.eventId && t.status !== 'Kedaluwarsa')
      .forEach((t) => {
        if (Array.isArray(t.seats)) t.seats.forEach((s) => existingBooked.add(s));
      });

    const conflicts = (ticket.seats || []).filter((s) => existingBooked.has(s));
    if (conflicts.length > 0) {
      return {
        success: false,
        error: `Kursi [${conflicts.join(', ')}] telah dipesan oleh penonton lain! Silakan pilih kursi lain.`,
      };
    }

    const newId = `TCK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const bookingCode = 'SWD-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const newTicket: TicketItem = {
      ...ticket,
      id: newId,
      bookingCode,
      createdAt: formatShortTimestamp(),
    };

    adminDb.masterTickets.unshift(newTicket);
    DatabaseBridgeService.syncTicketToUserDb(newTicket, userDb);

    const evt = adminDb.masterEvents.find((e) => e.id === ticket.eventId);
    if (evt) evt.booked = Math.min(evt.quota, (evt.booked || 0) + ticket.quantity);

    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit(
      'BOOK_TICKET',
      `Reservasi tiket ${newTicket.bookingCode} (${ticket.quantity} kursi: ${newTicket.seats.join(', ')}) di acara "${ticket.eventTitle}"`,
      'info',
      ticket.userName,
      'User'
    );
    return { success: true, ticket: newTicket };
  }

  validateGateTicket(codeOrId: string): { success: boolean; message: string; ticket?: TicketItem } {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const clean = codeOrId.trim().toUpperCase();
    const ticket = adminDb.masterTickets.find(
      (t) => t.bookingCode.toUpperCase() === clean || t.id.toUpperCase() === clean
    );

    if (!ticket) {
      return { success: false, message: 'Tiket tidak ditemukan di sistem loket Sriwedari!' };
    }
    if (ticket.status === 'Check-in') {
      return { success: false, message: `Tiket ${ticket.bookingCode} sudah pernah digunakan check-in!`, ticket };
    }
    if (ticket.status === 'Kedaluwarsa') {
      return { success: false, message: `Tiket ${ticket.bookingCode} telah kedaluwarsa!`, ticket };
    }

    ticket.status = 'Check-in';
    DatabaseBridgeService.syncTicketToUserDb(ticket, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit(
      'GATE_CHECKIN',
      `Gate scanner mengonfirmasi masuk tiket ${ticket.bookingCode} (${ticket.userName}, Kursi: ${ticket.seats.join(', ')})`,
      'info',
      'Gate Loket Scanner',
      'Admin'
    );
    return { success: true, message: 'Check-in Berhasil! Silakan masuk pintu pementasan.', ticket };
  }

  // ==========================================
  // USERS & PASSWORD RESET
  // ==========================================
  getUserAccounts(): UserItem[] {
    return this.loadUserDB().userAccounts;
  }

  getAdminAccounts(): UserItem[] {
    return this.loadAdminDB().adminAccounts;
  }

  getUsers(): UserItem[] {
    return [...this.getAdminAccounts(), ...this.getUserAccounts()];
  }

  getUserById(id: string, roleHint?: Role): UserItem | undefined {
    if (roleHint === 'admin') return this.getAdminAccounts().find((u) => u.id === id);
    if (roleHint === 'user') return this.getUserAccounts().find((u) => u.id === id);
    return this.getUsers().find((u) => u.id === id);
  }

  getUserByEmail(email: string, roleHint?: Role): UserItem | undefined {
    const target = email.trim().toLowerCase();
    if (roleHint === 'admin') return this.getAdminAccounts().find((u) => u.email.toLowerCase() === target);
    if (roleHint === 'user') return this.getUserAccounts().find((u) => u.email.toLowerCase() === target);
    return this.getUsers().find((u) => u.email.toLowerCase() === target);
  }

  saveUser(user: UserItem): UserItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    if (!user.id) user.id = (user.role === 'admin' ? 'usr-admin-' : 'usr-') + Date.now();

    if (user.role === 'admin') {
      userDb.userAccounts = userDb.userAccounts.filter((u) => u.id !== user.id);
      const idx = adminDb.adminAccounts.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        adminDb.adminAccounts[idx] = { ...adminDb.adminAccounts[idx], ...user };
      } else {
        adminDb.adminAccounts.push(user);
      }
    } else {
      adminDb.adminAccounts = adminDb.adminAccounts.filter((u) => u.id !== user.id);
      DatabaseBridgeService.syncUserToUserDb(user, userDb);
    }

    DatabaseBridgeService.syncUsersToAdminDirectory(userDb, adminDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    return user;
  }

  deleteUser(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prevAdmin = adminDb.adminAccounts.length;
    const prevUser = userDb.userAccounts.length;

    adminDb.adminAccounts = adminDb.adminAccounts.filter((u) => u.id !== id);
    userDb.userAccounts = userDb.userAccounts.filter((u) => u.id !== id);

    if (adminDb.adminAccounts.length !== prevAdmin || userDb.userAccounts.length !== prevUser) {
      userDb.wishlists = userDb.wishlists.filter((w) => w.userId !== id);
      userDb.userLikes = userDb.userLikes.filter((l) => l.userId !== id);
      DatabaseBridgeService.syncUsersToAdminDirectory(userDb, adminDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      this.logAudit('DELETE_USER', `Pengguna ID ${id} dihapus dari sistem`, 'warning', 'Administrator', 'Admin');
      return true;
    }
    return false;
  }

  requestPasswordReset(
    identifier: string,
    roleHint?: Role
  ): { found: boolean; code?: string; email?: string; message: string } {
    const clean = identifier.trim().toLowerCase();
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();

    let target: UserItem | undefined;
    if (roleHint !== 'admin') {
      target = userDb.userAccounts.find(
        (u) => u.email.toLowerCase() === clean || u.phone.replace(/\s+/g, '') === clean
      );
    }
    if (!target && roleHint !== 'user') {
      target = adminDb.adminAccounts.find(
        (u) => u.email.toLowerCase() === clean || u.phone.replace(/\s+/g, '') === clean
      );
    }

    if (!target) {
      return {
        found: false,
        message: 'Jika akun terdaftar, instruksi pemulihan kata sandi telah dikirimkan.',
      };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const resetReq: PasswordResetRequest = {
      id: 'rst-' + Date.now(),
      identifier: clean,
      userId: target.id,
      role: target.role,
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      used: false,
    };

    userDb.passwordResets = userDb.passwordResets.filter((r) => r.userId !== target!.id);
    userDb.passwordResets.unshift(resetReq);
    this.saveUserDB(userDb);

    return {
      found: true,
      code,
      email: target.email,
      message: `Kode pemulihan berhasil dikirim ke ${target.email}.`,
    };
  }

  confirmPasswordReset(
    identifier: string,
    code: string,
    newPasswordHash: string
  ): { success: boolean; message: string } {
    const clean = identifier.trim().toLowerCase();
    const userDb = this.loadUserDB();
    const adminDb = this.loadAdminDB();

    const resetReq = userDb.passwordResets.find(
      (r) =>
        !r.used &&
        r.code === code.trim() &&
        (r.identifier === clean || r.userId === identifier) &&
        new Date(r.expiresAt).getTime() > Date.now()
    );

    if (!resetReq) {
      return { success: false, message: 'Kode pemulihan tidak valid atau sudah kedaluwarsa.' };
    }

    if (resetReq.role === 'admin') {
      const admin = adminDb.adminAccounts.find((u) => u.id === resetReq.userId);
      if (!admin) return { success: false, message: 'Akun admin tidak ditemukan.' };
      admin.password = newPasswordHash;
      admin.passwordChangedAt = new Date().toISOString();
      this.saveAdminDB(adminDb);
    } else {
      const user = userDb.userAccounts.find((u) => u.id === resetReq.userId);
      if (!user) return { success: false, message: 'Akun pengguna tidak ditemukan.' };
      user.password = newPasswordHash;
      user.passwordChangedAt = new Date().toISOString();
    }

    resetReq.used = true;
    this.saveUserDB(userDb);
    return { success: true, message: 'Kata sandi berhasil diperbarui. Silakan masuk kembali.' };
  }

  // ==========================================
  // COUPONS, SETTINGS, REVIEWS, AUDIT, ANALYTICS
  // ==========================================
  getCoupons(scope: 'user' | 'admin' = 'admin'): CouponItem[] {
    return scope === 'user' ? this.loadUserDB().activeCoupons : this.loadAdminDB().masterCoupons;
  }

  saveCoupon(coupon: CouponItem): CouponItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const idx = adminDb.masterCoupons.findIndex((c) => c.id === coupon.id);
    if (idx >= 0) {
      adminDb.masterCoupons[idx] = coupon;
    } else {
      if (!coupon.id) coupon.id = 'coup-' + Date.now();
      adminDb.masterCoupons.push(coupon);
    }
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    return coupon;
  }

  deleteCoupon(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prevLen = adminDb.masterCoupons.length;
    adminDb.masterCoupons = adminDb.masterCoupons.filter((c) => c.id !== id);
    if (adminDb.masterCoupons.length !== prevLen) {
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      return true;
    }
    return false;
  }

  validateCoupon(code: string, totalAmount: number) {
    return evaluateCouponDiscount(this.getCoupons('user'), code, totalAmount);
  }

  getSettings(scope: 'user' | 'admin' = 'admin'): SettingsItem {
    return scope === 'user' ? this.loadUserDB().publicSettings : this.loadAdminDB().systemSettings;
  }

  saveSettings(settings: SettingsItem): SettingsItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    adminDb.systemSettings = settings;
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('UPDATE_SETTINGS', 'Pengaturan operasional sanggar Sriwedari diperbarui', 'info', 'Administrator', 'Admin');
    return settings;
  }

  resetDB(): ServerDBState {
    const userDb = buildInitialUserDB();
    const adminDb = buildInitialAdminDB();
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('RESET_DB', 'Sistem mengembalikan kedua basis data (User DB & Admin DB) ke kondisi awal pementasan', 'warning', 'Administrator', 'Admin');
    return this.getFullState();
  }

  getReviews(targetId?: string, scope: 'user' | 'admin' = 'admin'): ReviewItem[] {
    const all =
      scope === 'user'
        ? this.loadUserDB().publicReviews || []
        : this.loadAdminDB().moderationReviews || [];
    return targetId ? all.filter((r) => r.targetId === targetId) : all;
  }

  addReview(review: Omit<ReviewItem, 'id' | 'createdAt'>): ReviewItem {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const newReview: ReviewItem = {
      ...review,
      id: 'rev-' + Date.now(),
      status: review.status || 'tampil',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 10),
    };
    adminDb.moderationReviews.unshift(newReview);
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    return newReview;
  }

  updateReviewStatus(id: string, status: 'tampil' | 'disembunyikan'): ReviewItem | null {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const item = adminDb.moderationReviews.find((r) => r.id === id);
    if (!item) return null;
    item.status = status;
    DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
    this.saveAdminDB(adminDb);
    this.saveUserDB(userDb);
    this.logAudit('UPDATE_SETTINGS', `Moderasi ulasan ${id} diubah menjadi "${status}"`, 'info', 'Admin', 'Admin');
    return item;
  }

  deleteReview(id: string): boolean {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const prev = adminDb.moderationReviews.length;
    adminDb.moderationReviews = adminDb.moderationReviews.filter((r) => r.id !== id);
    if (adminDb.moderationReviews.length !== prev) {
      DatabaseBridgeService.syncCatalogToUserDb(adminDb, userDb);
      this.saveAdminDB(adminDb);
      this.saveUserDB(userDb);
      this.logAudit('UPDATE_SETTINGS', `Ulasan ID ${id} dihapus dari sistem`, 'warning', 'Admin', 'Admin');
      return true;
    }
    return false;
  }

  getAuditLogs(): AuditLogItem[] {
    return this.loadAdminDB().auditLogs;
  }

  logAudit(
    action: AuditLogItem['action'],
    details: string,
    severity: AuditLogItem['severity'] = 'info',
    actorName = 'Sistem',
    actorRole = 'Sistem'
  ): void {
    const adminDb = this.loadAdminDB();
    const newLog: AuditLogItem = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: formatTimestamp(),
      action,
      actorName,
      actorRole,
      details,
      ipAddress: '127.0.0.1 (Localhost)',
      severity,
    };
    adminDb.auditLogs.unshift(newLog);
    if (adminDb.auditLogs.length > 200) {
      adminDb.auditLogs = adminDb.auditLogs.slice(0, 200);
    }
    this.saveAdminDB(adminDb);
  }

  exportAuditLogsCsv(): string {
    const logs = this.getAuditLogs();
    const headers = ['ID', 'Waktu', 'Aksi', 'Aktor', 'Peran', 'Rincian', 'IP', 'Tingkat Keparahan'];
    const rows = logs.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.action}"`,
      `"${l.actorName.replace(/"/g, '""')}"`,
      `"${l.actorRole}"`,
      `"${l.details.replace(/"/g, '""')}"`,
      `"${l.ipAddress}"`,
      `"${l.severity}"`,
    ]);
    return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  getAnalytics(): AnalyticsSummary {
    const adminDb = this.loadAdminDB();
    const validOrders = adminDb.masterOrders.filter(
      (o) => o.status === 'Dikonfirmasi' || o.status === 'Sedang Disewa' || o.status === 'Selesai'
    );
    const revenueRental = validOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const validTickets = adminDb.masterTickets.filter(
      (t) => t.status === 'Aktif' || t.status === 'Check-in'
    );
    const revenueTickets = validTickets.reduce((sum, t) => sum + (t.totalPrice || 0), 0);
    const totalRevenue = revenueRental + revenueTickets;

    const escrowDeposit = adminDb.masterOrders
      .filter((o) => o.status === 'Dikonfirmasi' || o.status === 'Sedang Disewa')
      .reduce((sum, o) => sum + (o.depositFee || 0), 0);

    const qcDeductions = adminDb.masterOrders
      .filter((o) => o.status === 'Selesai' && o.depositFee && o.refundAmount !== undefined)
      .reduce((sum, o) => sum + Math.max(0, (o.depositFee || 0) - (o.refundAmount || 0)), 0);

    const paymentChannels = {
      QRIS: validOrders.filter((o) => o.paymentMethod === 'QRIS').reduce((s, o) => s + (o.totalPrice || 0), 0),
      VA: validOrders.filter((o) => o.paymentMethod === 'VA').reduce((s, o) => s + (o.totalPrice || 0), 0),
      Tunai:
        validOrders.filter((o) => o.paymentMethod === 'Tunai').reduce((s, o) => s + (o.totalPrice || 0), 0) +
        revenueTickets,
    };

    const activeOrders = adminDb.masterOrders.filter(
      (o) => o.status === 'Menunggu' || o.status === 'Dikonfirmasi' || o.status === 'Sedang Disewa'
    ).length;
    const completedOrders = adminDb.masterOrders.filter((o) => o.status === 'Selesai').length;
    const totalTicketsSold = validTickets.reduce((sum, t) => sum + (t.quantity || 1), 0);
    const gateCheckinCount = adminDb.masterTickets.filter((t) => t.status === 'Check-in').length;

    const totalEventQuota = adminDb.masterEvents.reduce((sum, e) => sum + (e.quota || 0), 0);
    const totalEventBooked = adminDb.masterEvents.reduce((sum, e) => sum + (e.booked || 0), 0);
    const occupancyRate = totalEventQuota > 0 ? Math.round((totalEventBooked / totalEventQuota) * 100) : 0;

    const topGalleries = [...adminDb.masterGalleries]
      .sort((a, b) => b.views + b.likes * 10 - (a.views + a.likes * 10))
      .slice(0, 5);

    return {
      totalRevenue,
      revenueRental,
      revenueTickets,
      escrowDeposit,
      qcDeductions,
      paymentChannels,
      totalOrders: adminDb.masterOrders.length,
      activeOrders,
      completedOrders,
      totalUsers: adminDb.adminAccounts.length + adminDb.managedUsers.length,
      totalTicketsSold,
      gateCheckinCount,
      occupancyRate,
      totalCostumes: adminDb.masterCostumes.length,
      totalGalleries: adminDb.masterGalleries.length,
      totalEvents: adminDb.masterEvents.length,
      topGalleries,
      recentActivities: adminDb.auditLogs.slice(0, 10),
      weeklyVisitors: adminDb.analyticsSnapshots || buildInitialWeeklySnapshots(),
    };
  }

  getFullState(): ServerDBState {
    const adminDb = this.loadAdminDB();
    const userDb = this.loadUserDB();
    const sanitizedUsers = [...adminDb.adminAccounts, ...userDb.userAccounts].map((u) => {
      const copy = { ...u };
      delete copy.password;
      return copy;
    });
    return {
      galleries: adminDb.masterGalleries,
      categories: adminDb.masterCategories,
      costumes: adminDb.masterCostumes,
      orders: adminDb.masterOrders,
      events: adminDb.masterEvents,
      tickets: adminDb.masterTickets,
      users: sanitizedUsers,
      coupons: adminDb.masterCoupons,
      auditLogs: adminDb.auditLogs,
      reviews: adminDb.moderationReviews,
      settings: adminDb.systemSettings,
      stockMovements: adminDb.stockMovements,
      wishlists: userDb.wishlists,
    };
  }

  getSanitizedStateForUser(session?: SessionPayload | null): ServerDBState {
    if (session && session.role === 'admin') {
      return this.getFullState();
    }

    const userDb = this.loadUserDB();
    if (session && session.role === 'user') {
      const userOrders = (userDb.userOrders || []).filter(
        (o) =>
          o.userId === session.id ||
          o.userEmail?.toLowerCase() === session.email.toLowerCase() ||
          o.userName === session.name
      );
      const userTickets = (userDb.userTickets || []).filter(
        (t) => t.userId === session.id || t.userName === session.name
      );
      const userWishlists = (userDb.wishlists || []).filter((w) => w.userId === session.id);

      return {
        galleries: userDb.publicGalleries || [],
        categories: userDb.publicCategories || [],
        costumes: userDb.publicCostumes || [],
        events: userDb.publicEvents || [],
        reviews: (userDb.publicReviews || []).filter((r) => r.status !== 'disembunyikan'),
        settings: userDb.publicSettings,
        orders: userOrders,
        tickets: userTickets,
        coupons: [],
        users: [],
        auditLogs: [],
        stockMovements: [],
        wishlists: userWishlists,
      };
    }

    return {
      galleries: userDb.publicGalleries || [],
      categories: userDb.publicCategories || [],
      costumes: userDb.publicCostumes || [],
      events: userDb.publicEvents || [],
      reviews: (userDb.publicReviews || []).filter((r) => r.status !== 'disembunyikan'),
      settings: userDb.publicSettings,
      orders: [],
      tickets: [],
      coupons: [],
      users: [],
      auditLogs: [],
      stockMovements: [],
      wishlists: [],
    };
  }
}

export const ServerDB = new ServerDatabaseService();
