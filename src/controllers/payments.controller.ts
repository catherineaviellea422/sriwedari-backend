import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { mapWebhookStatus } from '../lib/payment';

export function listCoupons(_req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getCoupons('admin') });
}

export function saveCoupon(req: Request, res: Response) {
  if (!req.body.code) return res.status(400).json({ success: false, error: 'Kode kupon wajib diisi.' });
  return res.status(201).json({ success: true, data: ServerDB.saveCoupon(req.body) });
}

export function deleteCoupon(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id kupon wajib disertakan.' });
  return res.json({ success: ServerDB.deleteCoupon(id) });
}

export function validateCoupon(req: Request, res: Response) {
  const { code, totalAmount } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'Kode kupon wajib diisi.' });
  const result = ServerDB.validateCoupon(code, totalAmount || 0);
  if (!result.valid) return res.status(400).json({ success: false, error: result.message });
  return res.json({
    success: true,
    coupon: result.coupon,
    discountAmount: result.discount,
    message: result.message,
  });
}

export function handleWebhook(req: Request, res: Response) {
  try {
    const { orderId, transactionStatus, paymentType } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId wajib diisi.' });

    const newStatus = mapWebhookStatus(transactionStatus);
    ServerDB.updateOrderStatus(orderId, newStatus);
    ServerDB.logAudit(
      'VERIFY_PAYMENT',
      `Webhook payment: ${orderId} -> ${newStatus} (${paymentType || 'QRIS'})`,
      'info'
    );

    return res.json({
      success: true,
      message: `Status pesanan ${orderId} diubah menjadi ${newStatus}`,
      orderId,
      status: newStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memproses webhook.';
    return res.status(500).json({ success: false, error: message });
  }
}
