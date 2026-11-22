import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : 'Terjadi kesalahan internal server.';
  logger.error('Unhandled API Error', message);
  res.status(500).json({
    success: false,
    error: message,
  });
}
