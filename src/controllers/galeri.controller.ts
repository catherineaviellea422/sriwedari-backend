import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { getSessionFromReq } from '../middleware/auth';

export function listGalleries(scope: 'user' | 'admin') {
  return (req: Request, res: Response) => {
    const id = req.query.id as string;
    if (id) {
      const item = ServerDB.getGalleryById(id, scope);
      if (!item) return res.status(404).json({ success: false, error: 'Karya seni tidak ditemukan.' });
      return res.json({ success: true, data: item });
    }
    return res.json({ success: true, data: ServerDB.getGalleries(scope) });
  };
}

export function saveGallery(req: Request, res: Response) {
  if (!req.body.title) return res.status(400).json({ success: false, error: 'Judul karya wajib diisi.' });
  return res.status(201).json({ success: true, data: ServerDB.saveGallery(req.body) });
}

export function deleteGallery(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id karya wajib disertakan.' });
  return res.json({ success: ServerDB.deleteGallery(id) });
}

export async function toggleLike(req: Request, res: Response) {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'id karya wajib diisi.' });
  const session = await getSessionFromReq(req);
  const resLike = ServerDB.toggleLike(id, session?.id);
  return res.json({ success: true, isLiked: resLike.isLiked, likes: resLike.likes });
}

export function listCategories(scope: 'user' | 'admin') {
  return (_req: Request, res: Response) => {
    return res.json({ success: true, data: ServerDB.getCategories(scope) });
  };
}

export function saveCategory(req: Request, res: Response) {
  if (!req.body.name) return res.status(400).json({ success: false, error: 'Nama kategori wajib diisi.' });
  return res.status(201).json({ success: true, data: ServerDB.saveCategory(req.body) });
}

export function deleteCategory(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id kategori wajib disertakan.' });
  return res.json({ success: ServerDB.deleteCategory(id) });
}
