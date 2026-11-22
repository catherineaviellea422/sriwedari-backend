import { CouponItem, OrderItem } from '../types/models';

export function mapWebhookStatus(transactionStatus: string): OrderItem['status'] {
  if (['settlement', 'capture', 'success'].includes(transactionStatus)) {
    return 'Dikonfirmasi';
  }
  if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
    return 'Dibatalkan';
  }
  return 'Menunggu';
}

export function evaluateCouponDiscount(
  coupons: CouponItem[],
  code: string,
  totalAmount: number
): { valid: boolean; discount: number; message: string; coupon?: CouponItem } {
  const match = coupons.find(
    (c) => c.code.toUpperCase() === code.trim().toUpperCase() && c.isActive
  );
  if (!match) {
    return { valid: false, discount: 0, message: 'Kode kupon tidak valid atau sudah tidak aktif!' };
  }
  if (match.expiresAt && new Date(match.expiresAt).getTime() < Date.now()) {
    return { valid: false, discount: 0, message: 'Masa berlaku kode kupon telah habis.' };
  }
  if (match.maxUses > 0 && match.usedCount >= match.maxUses) {
    return { valid: false, discount: 0, message: 'Kuota pemakaian kode kupon ini sudah penuh.' };
  }
  if (totalAmount < match.minOrder) {
    return {
      valid: false,
      discount: 0,
      message: `Minimal transaksi untuk kupon ini adalah Rp ${match.minOrder.toLocaleString('id-ID')}`,
    };
  }

  const discount =
    match.type === 'PERCENTAGE'
      ? Math.round((totalAmount * match.value) / 100)
      : match.value;

  return {
    valid: true,
    discount,
    message: `Kupon ${match.code} berhasil diterapkan! Diskon: Rp ${discount.toLocaleString('id-ID')}`,
    coupon: match,
  };
}
