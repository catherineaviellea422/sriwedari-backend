import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../lib/crypto';
import { SessionPayload } from '../types/models';

export async function getSessionFromReq(req: Request): Promise<SessionPayload | null> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token && req.cookies?.sriwedari_session) {
    token = req.cookies.sriwedari_session;
  }

  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/sriwedari_session=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;
  return await verifySessionToken(token);
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Akses ditolak. Sesi autentikasi diperlukan.',
    });
  }
  req.user = session;
  next();
}
