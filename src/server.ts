import { app } from './app';
import { env } from './config/env';
import { ServerDB } from './db';
import { startOrderStatusJob } from './jobs/orderStatusJob';
import { logger } from './logger';

async function bootstrap() {
  await ServerDB.connectAndVerify();
  startOrderStatusJob();

  app.listen(env.PORT, () => {
    logger.info(`Galeri Sriwedari Backend berjalan di http://localhost:${env.PORT}`);
    console.log(`
  ================================================================
  🏛️  GALERI SRIWEDARI - BACKEND & DATABASE API SERVER (v2.0)
  ================================================================
  ✓ Server berjalan di : http://localhost:${env.PORT}
  ✓ User API           : http://localhost:${env.PORT}/api/user/*
  ✓ Admin API          : http://localhost:${env.PORT}/api/admin/*
  ✓ DB Driver          : ${env.DB_DRIVER.toUpperCase()}
  ✓ Static Uploads     : http://localhost:${env.PORT}/uploads
  ✓ CORS Origin        : ${env.CORS_ORIGIN}
  ================================================================
    `);
  });
}

bootstrap().catch((err) => {
  logger.error('Fatal error saat memulai server', err);
  process.exit(1);
});
