import { Request, Response } from 'express';
import { ServerDB } from '../db';

export function listEvents(scope: 'user' | 'admin') {
  return (_req: Request, res: Response) => {
    return res.json({ success: true, data: ServerDB.getEvents(scope) });
  };
}

export function saveEvent(req: Request, res: Response) {
  if (!req.body.title || !req.body.date) {
    return res.status(400).json({ success: false, error: 'Judul pentas dan tanggal wajib diisi.' });
  }
  return res.status(201).json({ success: true, data: ServerDB.saveEvent(req.body) });
}

export function deleteEvent(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id pentas wajib disertakan.' });
  return res.json({ success: ServerDB.deleteEvent(id) });
}
