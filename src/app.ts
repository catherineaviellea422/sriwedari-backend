import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import { UPLOADS_DIR } from './lib/upload';
import { apiRateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);

  app.use('/uploads', express.static(UPLOADS_DIR));

  app.get('/', (_req, res) => {
    res.json({
      status: 'online',
      service: 'Galeri Sriwedari - Backend & Database API Server',
      version: '2.0.0',
      dbDriver: env.DB_DRIVER,
      databases: {
        userDb: 'data/sriwedari-user-db.json',
        adminDb: 'data/sriwedari-admin-db.json',
        mysqlSchema: 'sql/schema.sql',
      },
      namespaces: {
        user: '/api/user/*',
        admin: '/api/admin/*',
        legacy: '/api/*',
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      dbDriver: env.DB_DRIVER,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', apiRateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
