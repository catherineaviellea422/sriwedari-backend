-- ============================================================================
-- GALERI SRIWEDARI - RELATIONAL DATABASE SCHEMA (MySQL 8 / MariaDB)
-- Jalankan file ini via Extension MySQL di IDE, phpMyAdmin, atau CLI `mysql`
-- ============================================================================

CREATE DATABASE IF NOT EXISTS sriwedari_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sriwedari_db;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  avatar TEXT NULL,
  points INT NOT NULL DEFAULT 0,
  registered_at VARCHAR(32) NOT NULL,
  password VARCHAR(255) NULL,
  password_changed_at VARCHAR(40) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  icon VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  item_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS costumes (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL,
  price INT NOT NULL,
  rating DECIMAL(3, 2) NOT NULL DEFAULT 5.00,
  review_count INT NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  sizes JSON NOT NULL,
  size_stocks JSON NULL,
  image TEXT NOT NULL,
  description TEXT NOT NULL,
  origin VARCHAR(120) NULL
);

CREATE TABLE IF NOT EXISTS galleries (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL,
  category_name VARCHAR(120) NOT NULL,
  type ENUM('foto', 'video') NOT NULL DEFAULT 'foto',
  event_date VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  image TEXT NOT NULL,
  views INT NOT NULL DEFAULT 0,
  likes INT NOT NULL DEFAULT 0,
  origin VARCHAR(120) NOT NULL,
  costume_id VARCHAR(64) NULL,
  CONSTRAINT fk_gallery_costume FOREIGN KEY (costume_id) REFERENCES costumes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  event_date VARCHAR(32) NOT NULL,
  event_time VARCHAR(40) NOT NULL,
  location VARCHAR(180) NOT NULL,
  price INT NOT NULL,
  quota INT NOT NULL,
  booked INT NOT NULL DEFAULT 0,
  image TEXT NOT NULL,
  description TEXT NOT NULL,
  zone_prices JSON NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  user_name VARCHAR(150) NOT NULL,
  user_phone VARCHAR(40) NOT NULL,
  user_email VARCHAR(191) NOT NULL,
  costume_id VARCHAR(64) NULL,
  costume_name VARCHAR(180) NOT NULL,
  costumes_json JSON NULL,
  start_date VARCHAR(32) NOT NULL,
  duration INT NOT NULL DEFAULT 1,
  total_price INT NOT NULL,
  deposit_fee INT NOT NULL DEFAULT 0,
  discount_amount INT NOT NULL DEFAULT 0,
  coupon_code VARCHAR(64) NULL,
  status ENUM('Menunggu', 'Dikonfirmasi', 'Sedang Disewa', 'Selesai', 'Dibatalkan', 'Kedaluwarsa') NOT NULL DEFAULT 'Menunggu',
  payment_method ENUM('QRIS', 'VA', 'Tunai') NOT NULL DEFAULT 'QRIS',
  payment_proof TEXT NULL,
  qc_status ENUM('Pending', 'Grade A', 'Grade B', 'Grade C', 'Grade D') NULL,
  refund_amount INT NULL,
  deduction_note TEXT NULL,
  hold_expires_at VARCHAR(40) NULL,
  completed_at VARCHAR(40) NULL,
  refund_status ENUM('tidak_ada', 'menunggu', 'selesai') DEFAULT 'tidak_ada',
  cancel_reason TEXT NULL,
  created_at VARCHAR(32) NOT NULL,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_costume FOREIGN KEY (costume_id) REFERENCES costumes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(64) PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  event_title VARCHAR(180) NOT NULL,
  user_id VARCHAR(64) NULL,
  user_name VARCHAR(150) NOT NULL,
  user_phone VARCHAR(40) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  seats JSON NOT NULL,
  zone VARCHAR(64) NOT NULL,
  total_price INT NOT NULL,
  status ENUM('Aktif', 'Check-in', 'Kedaluwarsa') NOT NULL DEFAULT 'Aktif',
  booking_code VARCHAR(40) NOT NULL UNIQUE,
  created_at VARCHAR(32) NOT NULL,
  CONSTRAINT fk_tickets_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id VARCHAR(64) PRIMARY KEY,
  costume_id VARCHAR(64) NOT NULL,
  costume_name VARCHAR(180) NOT NULL,
  size VARCHAR(32) NOT NULL DEFAULT 'All Size',
  delta INT NOT NULL,
  stock_after INT NOT NULL,
  reason ENUM('barang_masuk', 'disewa', 'dikembalikan', 'rusak_hilang', 'koreksi') NOT NULL,
  note TEXT NULL,
  actor_name VARCHAR(150) NOT NULL,
  order_id VARCHAR(64) NULL,
  created_at VARCHAR(32) NOT NULL,
  CONSTRAINT fk_sm_costume FOREIGN KEY (costume_id) REFERENCES costumes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  type ENUM('PERCENTAGE', 'FIXED') NOT NULL,
  value INT NOT NULL,
  min_order INT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 0,
  used_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at VARCHAR(40) NOT NULL,
  description TEXT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(64) PRIMARY KEY,
  target_id VARCHAR(64) NOT NULL,
  target_type ENUM('costume', 'gallery') NOT NULL,
  user_name VARCHAR(150) NOT NULL,
  rating INT NOT NULL,
  comment TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('tampil', 'disembunyikan') NOT NULL DEFAULT 'tampil',
  created_at VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS wishlists (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  target_type ENUM('gallery', 'costume') NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  timestamp VARCHAR(32) NOT NULL,
  action VARCHAR(64) NOT NULL,
  actor_name VARCHAR(150) NOT NULL,
  actor_role VARCHAR(64) NOT NULL,
  details TEXT NOT NULL,
  ip_address VARCHAR(80) NOT NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'info'
);

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  gallery_name VARCHAR(180) NOT NULL,
  tagline VARCHAR(255) NOT NULL,
  open_hours VARCHAR(120) NOT NULL,
  location VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(191) NOT NULL,
  deposit_fee INT NOT NULL DEFAULT 100000,
  terms TEXT NOT NULL,
  notifications BOOLEAN NOT NULL DEFAULT TRUE,
  hold_duration_minutes INT NOT NULL DEFAULT 1440,
  refund_window_days INT NOT NULL DEFAULT 3,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  whatsapp_admin_number VARCHAR(40) NULL
);
