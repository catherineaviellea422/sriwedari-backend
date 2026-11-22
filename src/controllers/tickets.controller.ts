import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { getSessionFromReq } from '../middleware/auth';

export function getTicketsOrSeats(scope: 'user' | 'admin' | 'legacy') {
  return async (req: Request, res: Response) => {
    const eventId = req.query.eventId as string;
    if (eventId) {
      return res.json({ success: true, eventId, bookedSeats: ServerDB.getBookedSeats(eventId) });
    }

    if (scope === 'admin') {
      return res.json({ success: true, data: ServerDB.getTickets('admin') });
    }

    const session = req.user || (await getSessionFromReq(req));
    if (!session) {
      return res.status(401).json({ success: false, error: 'Sesi diperlukan untuk melihat tiket.' });
    }

    if (scope === 'legacy' && session.role === 'admin') {
      return res.json({ success: true, data: ServerDB.getTickets('admin') });
    }

    const userTickets = ServerDB.getTickets('user').filter(
      (t) => t.userId === session.id || t.userName === session.name
    );
    return res.json({ success: true, data: userTickets });
  };
}

export async function bookTicket(req: Request, res: Response) {
  try {
    const session = req.user || (await getSessionFromReq(req));
    const body = req.body;
    const result = ServerDB.bookTicketAtomic({
      ...body,
      userId: session?.id,
      userName: body.userName || session?.name || 'Penonton',
      userPhone: body.userPhone || '081234567890',
    });
    if (!result.success) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memesan tiket.';
    return res.status(500).json({ success: false, error: message });
  }
}

export function gateCheckin(req: Request, res: Response) {
  const { ticketCode } = req.body;
  if (!ticketCode) return res.status(400).json({ success: false, error: 'ticketCode wajib disertakan.' });
  const result = ServerDB.validateGateTicket(ticketCode);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
}
