import cron, { ScheduledTask } from 'node-cron';
import { ServerDB } from '../db';
import { logger } from '../logger';

let task: ScheduledTask | null = null;

/**
 * Cron job periodik setiap menit untuk mengecek pesanan 'Menunggu'
 * yang sudah melewati batas holdExpiresAt -> ubah ke 'Kedaluwarsa' dan kembalikan stok.
 */
export function startOrderStatusJob(): ScheduledTask {
  if (task) return task;

  task = cron.schedule('* * * * *', () => {
    try {
      ServerDB.expirePendingOrders();
    } catch (err) {
      logger.error('Gagal menjalankan orderStatusJob', err instanceof Error ? err.message : err);
    }
  });

  logger.info('Cron Job [orderStatusJob] aktif (berjalan tiap 1 menit)');
  return task;
}

export function stopOrderStatusJob(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
