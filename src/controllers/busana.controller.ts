import { Request, Response } from 'express';
import { ServerDB } from '../db';

export function listCostumes(scope: 'user' | 'admin') {
  return (req: Request, res: Response) => {
    const id = req.query.id as string;
    if (id) {
      const item = ServerDB.getCostumeById(id, scope);
      if (!item) return res.status(404).json({ success: false, error: 'Busana tidak ditemukan.' });
      return res.json({ success: true, data: item });
    }
    return res.json({ success: true, data: ServerDB.getCostumes(scope) });
  };
}

export function saveCostume(req: Request, res: Response) {
  if (!req.body.name || !req.body.price) {
    return res.status(400).json({ success: false, error: 'Nama busana dan harga wajib diisi.' });
  }
  return res.status(201).json({ success: true, data: ServerDB.saveCostume(req.body) });
}

export function deleteCostume(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id busana wajib diisi.' });
  return res.json({ success: ServerDB.deleteCostume(id) });
}
