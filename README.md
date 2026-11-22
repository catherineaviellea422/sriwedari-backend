# 🏛️ Galeri Sriwedari - Backend & Database Server (v2.0)

Server backend mandiri (Express + TypeScript) dengan arsitektur modular (**Routes &rarr; Middleware &rarr; Controllers &rarr; Lib / DB &rarr; Jobs**) dan dukungan **Dual-Database Store** serta skema relasional **MySQL** (`sql/schema.sql`).

---

## 📂 Struktur Direktori

```text
sriwedari-backend/
├── scripts/
│   └── check-db.ts             # Cek kesehatan isi database & ping MySQL
├── sql/
│   └── schema.sql              # Skema relasional MySQL (13 tabel berelasi Foreign Key)
├── src/
│   ├── config/
│   │   ├── cors.ts             # Whitelist CORS (Next.js & Flutter)
│   │   └── env.ts              # Konfigurasi environment variables
│   ├── controllers/            # Business logic handlers terpisah per fitur
│   │   ├── admin.controller.ts
│   │   ├── auth.controller.ts
│   │   ├── busana.controller.ts
│   │   ├── galeri.controller.ts
│   │   ├── jadwal.controller.ts
│   │   ├── orders.controller.ts
│   │   ├── payments.controller.ts
│   │   ├── reviews.controller.ts
│   │   ├── tickets.controller.ts
│   │   ├── upload.controller.ts
│   │   └── user.controller.ts
│   ├── db/
│   │   ├── index.ts            # Database Service (Dual-DB & Bridge Sync)
│   │   ├── mysql.ts            # Connection Pool MySQL (mysql2/promise)
│   │   └── seed-data.ts        # Data awal bawaan sistem
│   ├── jobs/
│   │   └── orderStatusJob.ts   # Cron job aktif (node-cron) lepas stok order kedaluwarsa
│   ├── lib/                    # Helper modular
│   │   ├── crypto.ts           # PBKDF2 SHA-256 & HMAC session token
│   │   ├── dates.ts            # Format tanggal & holdExpiresAt
│   │   ├── fileSignature.ts    # Validasi magic bytes gambar
│   │   ├── payment.ts          # Evaluasi kupon & mapping webhook
│   │   ├── stock.ts            # Mutasi stok & ledger stock_movements
│   │   └── upload.ts           # Konfigurasi Multer ke public/uploads
│   ├── middleware/
│   │   ├── auth.ts             # Verifikasi Cookie & Bearer Token
│   │   ├── errorHandler.ts     # Global JSON error & 404 formatter
│   │   ├── rateLimiter.ts      # Pembatas spam request
│   │   ├── requestLogger.ts    # Log HTTP request
│   │   └── requireRole.ts      # Proteksi peran admin/user
│   ├── routes/                 # Router per domain + index.ts
│   ├── types/
│   │   ├── express.d.ts        # Custom Express.Request.user typing
│   │   └── models.ts           # Interface skema entitas data
│   ├── app.ts                  # Setup Express app & routing
│   ├── logger.ts               # Structured console logger
│   └── server.ts               # Entry point (listen port & start cron job)
├── tests/
│   └── api.test.ts             # Automated integration test suite
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 💻 Menjalankan Backend & Tes

```bash
npm install
npm run dev       # Jalankan server di http://localhost:5000
npm run db:check  # Cek jumlah data & koneksi database
npm test          # Jalankan automated integration tests
npm run build     # Kompilasi TypeScript ke dist/
```

---

## 🗄️ Menghubungkan ke MySQL (Tanpa Perlu XAMPP Lokal)

Jika tidak ingin install XAMPP di laptop, Anda bisa memakai **MySQL Cloud Gratis** (seperti Aiven Free MySQL atau TiDB Cloud Serverless), lalu:
1. Salin `.env.example` menjadi `.env`.
2. Ubah `DB_DRIVER=mysql` dan isi `DATABASE_URL="mysql://user:pass@host:port/sriwedari_db"`.
3. Buka **Extension MySQL** di IDE Anda dan jalankan file [`sql/schema.sql`](./sql/schema.sql) (atau biarkan server otomatis menjalankannya saat startup).
