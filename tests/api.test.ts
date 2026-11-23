import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app';
import { ServerDB } from '../src/db';

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  await ServerDB.connectAndVerify();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

test.after(async () => {
  await ServerDB.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('GET /health mengembalikan status healthy', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, 'healthy');
});

test('GET /api/costumes mengembalikan daftar busana adat', async () => {
  const res = await fetch(`${baseUrl}/api/costumes`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; data: unknown[] };
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0);
});

test('GET /api/admin/analytics ditolak (401) tanpa login admin', async () => {
  const res = await fetch(`${baseUrl}/api/admin/analytics`);
  assert.equal(res.status, 401);
});

test('POST /api/auth/login admin berhasil dan bisa akses /api/admin/analytics', async () => {
  const loginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sriwedari.id', password: 'rahasia123' }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = (await loginRes.json()) as { success: boolean; token: string };
  assert.equal(loginData.success, true);
  assert.ok(loginData.token);

  const analyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  assert.equal(analyticsRes.status, 200);
  const analyticsBody = (await analyticsRes.json()) as { success: boolean; data: { totalCostumes: number } };
  assert.equal(analyticsBody.success, true);
  assert.ok(analyticsBody.data.totalCostumes > 0);
});
