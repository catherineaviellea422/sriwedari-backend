import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { apiRouter } from './routes/api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ==========================================
// MIDDLEWARES
// ==========================================
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching origin
      if (!origin || origin === CORS_ORIGIN || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true); // Dev permissive
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads (/uploads/...)
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// ==========================================
// HEALTH CHECK & ROOT
// ==========================================
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    service: 'Galeri Sriwedari Backend & Database API Server',
    version: '1.0.0',
    port: PORT,
    endpoints: '/api/*',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// API ROUTES MOUNT
// ==========================================
app.use('/api', apiRouter);

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`
  ======================================================
  🏛️  GALERI SRIWEDARI - BACKEND & DATABASE SERVER
  ======================================================
  ✓ Server berjalan di : http://localhost:${PORT}
  ✓ API Endpoints     : http://localhost:${PORT}/api
  ✓ Static Uploads    : http://localhost:${PORT}/uploads
  ✓ CORS Origin       : ${CORS_ORIGIN}
  ======================================================
  `);
});

export default app;

