import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  message?: string;
}) {
  const windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const max = options?.max ?? env.RATE_LIMIT_MAX;
  const message =
    options?.message ?? 'Terlalu banyak permintaan dalam waktu singkat. Coba lagi sebentar.';
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || now > current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      return res.status(429).json({ success: false, error: message });
    }

    next();
  };
}

export const apiRateLimiter = createRateLimiter();

export const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: 'Terlalu banyak percobaan login/registrasi. Tunggu 1 menit.',
});
