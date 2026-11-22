import { ServerDB } from '../src/db';
import { env } from '../src/config/env';
import { testMysqlConnection } from '../src/db/mysql';

async function main() {
  ServerDB.initialize();
  const state = ServerDB.getFullState();

  console.log('=== CHECK DATABASE GALERI SRIWEDARI ===');
  console.log('Active Driver :', env.DB_DRIVER);
  console.log('Users         :', state.users.length);
  console.log('Costumes      :', state.costumes.length);
  console.log('Galleries     :', state.galleries.length);
  console.log('Events        :', state.events.length);
  console.log('Orders        :', state.orders.length);
  console.log('Tickets       :', state.tickets.length);

  if (env.DB_DRIVER === 'mysql') {
    const ok = await testMysqlConnection();
    console.log('MySQL Ping    :', ok ? 'TERHUBUNG' : 'GAGAL');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
