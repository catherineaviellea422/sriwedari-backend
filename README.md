# 🏛️ Galeri Sriwedari - Backend & Database Server

Repositori ini adalah **server backend mandiri (Dedicated Backend API & Database Service)** untuk ekosistem aplikasi kebudayaan **Galeri Sriwedari**.

---

## 🚀 Fitur Backend
* **RESTful API**: Layanan API lengkap untuk Autentikasi Pengguna, Pemesanan Sewa Busana Adat, Pembelian Tiket Pentas Wayang, Manajemen Inventaris, Moderasi Ulasan, dan Scanner Loket Gerbang.
* **Database Persisten**: Mengelola database transaksi dan koleksi budaya tersimpan di `data/sriwedari-db.json` (auto-seed saat peluncuran awal).
* **Ledger Mutasi Stok (*Stock Movements*)**: Audit pencatatan penambahan, penyewaan, pengembalian (QC), dan koreksi stok busana adat.
* **Otomasi Batas Waktu Reservasi (*Hold Expiry*)**: Pelepasan stok busana secara otomatis jika pesanan sewa tidak dibayar/dikonfirmasi tepat waktu.
* **Sistem Keamanan**: Enkripsi password menggunakan **PBKDF2 SHA-256 (100.000 iterasi + salt)** dan verifikasi sesi berbasis HMAC.
* **Unggah Berkas**: Penyimpanan foto arsip budaya & slip bukti transfer via endpoint `/api/upload` hingga 10 MB.
* **Dukungan CORS Penuh**: Kompatibel dengan frontend Next.js yang berjalan di `http://localhost:3000`.

---

## 📂 Struktur Direktori

```
sriwedari-backend/
├── src/
│   ├── database/
│   │   ├── server-db.ts       # Service manipulasi database & logika bisnis
│   │   └── seed-data.ts       # Data awal bawaan sistem
│   ├── security/
│   │   └── session.ts         # Enkripsi PBKDF2 & Express RBAC Middleware
│   ├── routes/
│   │   └── api.ts             # Seluruh endpoint API terpadu
│   ├── types.ts               # Skema & kontrak antarmuka TypeScript
│   └── server.ts              # Entrypoint server Express
├── data/
│   ├── sriwedari-db.json      # File database lokal (gitignored)
│   └── sriwedari-db.example.json # Template contoh
├── public/
│   └── uploads/               # Berkas gambar statis
├── package.json
├── tsconfig.json
└── README.md
```

---

## 💻 Cara Menjalankan Server Backend

### 1. Masuk ke Folder Proyek
```bash
cd sriwedari-backend
```

### 2. Pasang Dependencies
```bash
npm install
```

### 3. Jalankan Server Pengembangan
```bash
npm run dev
```

Server akan aktif di:
* **Base URL**: `http://localhost:5000`
* **API Route**: `http://localhost:5000/api`
* **Health Check**: `http://localhost:5000/health`

---

## 🔗 Endpoint Utama

| Metode | Endpoint | Deskripsi | Hak Akses |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Masuk akun (User / Admin) | Publik |
| `POST` | `/api/auth/register` | Pendaftaran pengguna baru | Publik |
| `GET` | `/api/orders` | Daftar pesanan sewa busana | Pengguna / Admin |
| `POST` | `/api/orders` | Buat reservasi sewa baru | Pengguna |
| `PATCH` | `/api/orders` | Verifikasi slip bayar / QC Retur | Admin / Pengguna |
| `GET` | `/api/tickets` | Data tiket & kursi terisi | Publik / Pengguna |
| `PATCH` | `/api/tickets` | Validasi tiket loket (Check-In) | Admin |
| `GET` | `/api/costumes` | Daftar inventaris busana adat | Publik |
| `GET` | `/api/galleries` | Katalog arsip karya seni budaya | Publik |
| `GET` | `/api/stock-movements` | Buku besar audit pergerakan stok | Admin |
| `GET` | `/api/analytics` | Ringkasan metrik dashboard omset | Admin |
| `POST` | `/api/upload` | Unggah foto lokal (JPG/PNG/WebP) | Terautentikasi |

---

## 📤 Cara Push ke Repositori GitHub Baru

Jika Anda ingin membuat repositori baru di GitHub untuk backend ini:

```bash
git init
git add .
git commit -m "feat: initial commit for standalone sriwedari backend & database server"
git branch -M main
git remote add origin https://github.com/catherineaviellea422/sriwedari-backend.git
git push -u origin main
```

