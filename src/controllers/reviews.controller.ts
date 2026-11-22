import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { getSessionFromReq } from '../middleware/auth';

export function listUserReviews(req: Request, res: Response) {
  const targetId = req.query.targetId as string | undefined;
  return res.json({ success: true, data: ServerDB.getReviews(targetId, 'user') });
}

export function listAdminReviews(req: Request, res: Response) {
  const targetId = req.query.targetId as string | undefined;
  return res.json({ success: true, data: ServerDB.getReviews(targetId, 'admin') });
}

export async function listReviewsLegacy(req: Request, res: Response) {
  const targetId = req.query.targetId as string | undefined;
  const session = await getSessionFromReq(req);
  if (session && session.role === 'admin') {
    return res.json({ success: true, data: ServerDB.getReviews(targetId, 'admin') });
  }
  return res.json({ success: true, data: ServerDB.getReviews(targetId, 'user') });
}

export async function createReview(req: Request, res: Response) {
  try {
    const session = req.user || (await getSessionFromReq(req));
    const saved = ServerDB.addReview({
      ...req.body,
      userName: session?.name || req.body.userName || 'Pengunjung Budaya',
    });
    return res.status(201).json({ success: true, data: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal mengirim ulasan.';
    return res.status(500).json({ success: false, error: message });
  }
}

export function moderateReview(req: Request, res: Response) {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ success: false, error: 'id dan status wajib disertakan.' });
  const updated = ServerDB.updateReviewStatus(id, status);
  return res.json({ success: !!updated, data: updated });
}

export function deleteReview(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id ulasan wajib disertakan.' });
  return res.json({ success: ServerDB.deleteReview(id) });
}
