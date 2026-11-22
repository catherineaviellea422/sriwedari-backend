import fs from 'fs';
import path from 'path';
import multer from 'multer';

export const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'png';
    const cleanExt = ext === 'jpeg' ? 'jpg' : ext;
    const rawPrefix = (req.body?.prefix as string) || 'upload';
    const cleanPrefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'upload';
    const filename = `${cleanPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${cleanExt}`;
    cb(null, filename);
  },
});

export const uploadImageMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format berkas harus berupa gambar (JPG, PNG, WebP, GIF)'));
    }
  },
});
