import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { hashPassword } from '../lib/crypto';

export function getAnalytics(_req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getAnalytics() });
}

export function listStockMovements(req: Request, res: Response) {
  const costumeId = req.query.costumeId as string | undefined;
  return res.json({ success: true, data: ServerDB.getStockMovements(costumeId) });
}

export function createStockMovement(req: Request, res: Response) {
  const movement = ServerDB.recordStockMovement({ ...req.body, actorName: req.user!.name });
  return res.status(201).json({ success: true, data: movement });
}

export function listUsers(_req: Request, res: Response) {
  const users = ServerDB.getUsers().map((u) => {
    const safe = { ...u };
    delete safe.password;
    return safe;
  });
  return res.json({ success: true, data: users });
}

export async function saveUser(req: Request, res: Response) {
  const body = { ...req.body };
  if (body.password && !body.password.startsWith('pbkdf2:')) {
    body.password = await hashPassword(body.password);
  }
  const saved = ServerDB.saveUser(body);
  const safe = { ...saved };
  delete safe.password;
  return res.status(201).json({ success: true, data: safe });
}

export function deleteUser(req: Request, res: Response) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ success: false, error: 'id pengguna wajib disertakan.' });
  return res.json({ success: ServerDB.deleteUser(id) });
}

export function getAuditLogs(req: Request, res: Response) {
  if (req.query.format === 'csv') {
    const csv = ServerDB.exportAuditLogsCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sriwedari-audit.csv"');
    return res.send(csv);
  }
  return res.json({ success: true, data: ServerDB.getAuditLogs() });
}

export function getAdminSettings(_req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getSettings('admin') });
}

export function saveSettings(req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.saveSettings(req.body) });
}

export function resetDatabase(_req: Request, res: Response) {
  ServerDB.resetDB();
  return res.json({ success: true, message: 'Database User & Admin berhasil direset ke state bawaan.' });
}

export function getAdminSync(_req: Request, res: Response) {
  return res.json({ success: true, data: ServerDB.getFullState() });
}
