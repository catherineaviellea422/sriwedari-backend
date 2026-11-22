import mysql, { Pool } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../logger';

let pool: Pool | null = null;

export function getMysqlPool(): Pool {
  if (pool) return pool;

  if (env.DATABASE_URL) {
    pool = mysql.createPool(env.DATABASE_URL);
  } else {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      multipleStatements: true,
    });
  }
  return pool;
}

export async function testMysqlConnection(): Promise<boolean> {
  try {
    const conn = await getMysqlPool().getConnection();
    await conn.ping();
    conn.release();
    logger.info(`Koneksi MySQL aktif (${env.DATABASE_URL ? 'DATABASE_URL' : `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`})`);
    return true;
  } catch (err) {
    logger.warn('Koneksi MySQL tidak tersedia saat ini', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function ensureMysqlSchema(): Promise<boolean> {
  try {
    const schemaPath = path.join(process.cwd(), 'sql', 'schema.sql');
    if (!fs.existsSync(schemaPath)) return false;
    const sqlContent = fs.readFileSync(schemaPath, 'utf-8');
    await getMysqlPool().query(sqlContent);
    logger.info('Skema relasional MySQL (13 tabel) berhasil diverifikasi.');
    return true;
  } catch (err) {
    logger.error('Gagal menerapkan skema MySQL', err instanceof Error ? err.message : err);
    return false;
  }
}
