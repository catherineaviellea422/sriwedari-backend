import fs from 'fs';
import { Request, Response } from 'express';
import { uploadImageMiddleware } from '../lib/upload';
import { hasValidImageSignature } from '../lib/fileSignature';
import { getSessionFromReq } from '../middleware/auth';

export async function handleUpload(req: Request, res: Response) {
  const session = req.user || (await getSessionFromReq(req));
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Sesi autentikasi diperlukan untuk mengunggah berkas.',
    });
  }

  uploadImageMiddleware.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengunggah berkas.';
      return res.status(400).json({ success: false, error: message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada berkas yang diunggah.' });
    }

    if (!hasValidImageSignature(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(400).json({
        success: false,
        error: 'Isi berkas bukan file gambar yang sah (signature ditolak).',
      });
    }

    const publicUrl = `/uploads/${req.file.filename}`;
    return res.json({
      success: true,
      url: publicUrl,
      filename: req.file.filename,
      size: req.file.size,
      message: 'Berkas berhasil disimpan ke penyimpanan server.',
    });
  });
}
