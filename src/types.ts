export type Role = 'admin' | 'user';

export interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: 'active' | 'inactive';
  avatar?: string;
  points: number;
  registeredAt: string;
  password?: string;
  passwordChangedAt?: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  categoryName: string;
  type: 'foto' | 'video';
  date: string;
  description: string;
  image: string;
  views: number;
  likes: number;
  isLiked?: boolean;
  origin: string;
  costumeId?: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  count: number;
}

export interface CostumeItem {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  reviewCount?: number;
  stock: number;
  sizes: string[];
  sizeStocks?: Record<string, number>;
  image: string;
  description: string;
  origin?: string;
}

export interface OrderCostumeSelection {
  id: string;
  name: string;
  price: number;
  days: number;
  size: string;
}

export interface OrderItem {
  id: string;
  userName: string;
  userPhone: string;
  userEmail: string;
  costumeId: string;
  costumeName: string;
  costumes?: OrderCostumeSelection[];
  startDate: string;
  duration: number;
  totalPrice: number;
  depositFee: number;
  discountAmount?: number;
  couponCode?: string;
  status: 'Menunggu' | 'Dikonfirmasi' | 'Sedang Disewa' | 'Selesai' | 'Dibatalkan' | 'Kedaluwarsa';
  paymentMethod: 'QRIS' | 'VA' | 'Tunai';
  paymentProof?: string;
  qcStatus?: 'Pending' | 'Grade A' | 'Grade B' | 'Grade C' | 'Grade D';
  refundAmount?: number;
  deductionNote?: string;
  createdAt: string;
  holdExpiresAt?: string;
  completedAt?: string;
  refundStatus?: 'tidak_ada' | 'menunggu' | 'selesai';
  cancelReason?: string;
}

export interface EventItem {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  price: number;
  quota: number;
  booked: number;
  image: string;
  description: string;
  zonePrices?: {
    VIP: number;
    REGULER: number;
    BALKON: number;
  };
}

export interface TicketItem {
  id: string;
  eventId: string;
  eventTitle: string;
  userName: string;
  userPhone: string;
  quantity: number;
  seats: string[];
  zone: string;
  totalPrice: number;
  status: 'Aktif' | 'Check-in' | 'Kedaluwarsa';
  bookingCode: string;
  createdAt: string;
}

export interface CouponItem {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt: string;
  description?: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  action: 'VERIFY_PAYMENT' | 'QC_RETURN' | 'GATE_CHECKIN' | 'CREATE_ORDER' | 'BOOK_TICKET' | 'DELETE_USER' | 'UPDATE_SETTINGS' | 'RESET_DB';
  actorName: string;
  actorRole: string;
  details: string;
  ipAddress: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ReviewItem {
  id: string;
  targetId: string;
  targetType: 'costume' | 'gallery';
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  verified: boolean;
  status?: 'tampil' | 'disembunyikan';
}

export interface SettingsItem {
  galleryName: string;
  tagline: string;
  openHours: string;
  location: string;
  phone: string;
  email: string;
  depositFee: number;
  terms: string;
  notifications: boolean;
  holdDurationMinutes?: number;
  refundWindowDays?: number;
  lowStockThreshold?: number;
  whatsappAdminNumber?: string;
}

export interface StockMovementItem {
  id: string;
  costumeId: string;
  costumeName: string;
  size: string;
  delta: number;
  stockAfter: number;
  reason: 'barang_masuk' | 'disewa' | 'dikembalikan' | 'rusak_hilang' | 'koreksi';
  note?: string;
  actorName: string;
  orderId?: string;
  createdAt: string;
}
