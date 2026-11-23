import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { getSessionFromReq } from '../middleware/auth';

export function getWishlist(req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getWishlist(req.user!.id) });
}

export function addWishlist(req: Request, res: Response) {
  const { targetId, targetType } = req.body;
  if (!targetId || !['gallery', 'costume'].includes(targetType)) {
    return res.status(400).json({
      success: false,
      error: 'targetId dan targetType ("gallery" | "costume") wajib diisi.',
    });
  }
  const items = ServerDB.addToWishlist(req.user!.id, targetId, targetType);
  return res.status(201).json({ success: true, data: items });
}

export function removeWishlist(req: Request, res: Response) {
  const targetId = (req.query.targetId as string) || (req.body?.targetId as string);
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'targetId wajib disertakan.' });
  }
  const items = ServerDB.removeFromWishlist(req.user!.id, targetId);
  return res.json({ success: true, data: items });
}

export function getProfile(req: Request, res: Response) {
  const user = ServerDB.getUserById(req.user!.id);
  if (!user) return res.status(404).json({ success: false, error: 'Profil pengguna tidak ditemukan.' });
  const safe = { ...user };
  delete safe.password;
  return res.json({ success: true, data: safe });
}

export function updateProfile(req: Request, res: Response) {
  const existing = ServerDB.getUserById(req.user!.id);
  if (!existing) return res.status(404).json({ success: false, error: 'Profil pengguna tidak ditemukan.' });

  const { name, phone, avatar } = req.body;
  const updated = ServerDB.saveUser({
    ...existing,
    name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
    phone: typeof phone === 'string' ? phone.trim() : existing.phone,
    avatar: typeof avatar === 'string' ? avatar : existing.avatar,
    role: existing.role,
  });
  const safe = { ...updated };
  delete safe.password;
  return res.json({ success: true, data: safe });
}

export function getPublicSettings(_req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getSettings('user') });
}

export async function getUserSync(req: Request, res: Response) {
  const session = await getSessionFromReq(req);
  const state = ServerDB.getSanitizedStateForUser(session?.role === 'user' ? session : null);
  return res.json({ success: true, data: state });
}

export async function getLegacySync(req: Request, res: Response) {
  const session = await getSessionFromReq(req);
  const state = ServerDB.getSanitizedStateForUser(session);
  return res.json({ success: true, data: state });
}
