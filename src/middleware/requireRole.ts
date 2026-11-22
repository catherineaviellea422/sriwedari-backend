import { Request, Response, NextFunction } from 'express';
import { Role } from '../types/models';
import { getSessionFromReq } from './auth';

export function requireRole(requiredRole?: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = req.user || (await getSessionFromReq(req));
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Akses ditolak. Sesi autentikasi diperlukan.',
      });
    }

    req.user = session;

    if (requiredRole && session.role !== requiredRole && session.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak. Anda tidak memiliki wewenang untuk tindakan ini.',
      });
    }

    next();
  };
}
