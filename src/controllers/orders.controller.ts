import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { getSessionFromReq } from '../middleware/auth';

export function listUserOrders(req: Request, res: Response) {
  const session = req.user!;
  const orders = ServerDB.getOrders('user').filter(
    (o) =>
      o.userId === session.id ||
      o.userName === session.name ||
      o.userEmail?.toLowerCase() === session.email.toLowerCase()
  );
  return res.json({ success: true, data: orders });
}

export function listAdminOrders(_req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getOrders('admin') });
}

export async function listOrdersLegacy(req: Request, res: Response) {
  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Sesi diperlukan untuk melihat daftar pesanan.' });
  }
  if (session.role === 'admin') {
    return res.json({ success: true, data: ServerDB.getOrders('admin') });
  }
  req.user = session;
  return listUserOrders(req, res);
}

export async function createOrder(req: Request, res: Response) {
  try {
    const session = req.user || (await getSessionFromReq(req));
    const body = req.body;
    const newOrder = ServerDB.createOrder({
      ...body,
      userId: session?.id,
      userEmail: session?.email || body.userEmail || '',
      userName: body.userName || session?.name || 'Penyewa',
      userPhone: body.userPhone || '081234567890',
    });
    return res.status(201).json({ success: true, data: newOrder });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal membuat pesanan.';
    return res.status(500).json({ success: false, error: message });
  }
}

export async function updateOrder(req: Request, res: Response) {
  try {
    const { orderId, status, paymentProof, qcStatus, refundAmount, deductionNote } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId wajib diisi.' });
    }

    const session = req.user || (await getSessionFromReq(req));
    if (!session) {
      return res.status(401).json({ success: false, error: 'Sesi diperlukan untuk memperbarui pesanan.' });
    }

    if (qcStatus !== undefined) {
      if (session.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Hanya kurator admin yang berwenang melakukan inspeksi QC.',
        });
      }
      const updated = ServerDB.updateOrderQc(orderId, qcStatus, refundAmount || 0, deductionNote);
      if (!updated) return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
      return res.json({ success: true, data: updated, message: 'QC pesanan berhasil diperbarui.' });
    }

    const existing = ServerDB.getOrderById(orderId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
    }

    if (session.role !== 'admin') {
      const isOwner =
        existing.userId === session.id ||
        existing.userEmail?.toLowerCase() === session.email.toLowerCase() ||
        existing.userName === session.name;
      if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Anda tidak berhak mengubah pesanan ini.' });
      }
      if (status && status !== 'Dibatalkan') {
        return res.status(403).json({
          success: false,
          error: 'Hanya admin yang dapat menyetujui atau mengubah status pesanan.',
        });
      }
    }

    let updatedOrder = existing;
    if (status) {
      updatedOrder = ServerDB.updateOrderStatus(orderId, status) || existing;
    }
    if (paymentProof) {
      updatedOrder = ServerDB.attachPaymentProof(orderId, paymentProof) || updatedOrder;
    }

    return res.json({ success: true, data: updatedOrder, message: 'Pesanan berhasil diperbarui.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui pesanan.';
    return res.status(500).json({ success: false, error: message });
  }
}
