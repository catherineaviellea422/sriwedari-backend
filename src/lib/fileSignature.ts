import fs from 'fs';

/**
 * Validasi magic bytes header file gambar (JPG, PNG, WebP, GIF)
 * agar berkas yang disamarkan tidak lolos sebagai unggahan gambar.
 */
export function hasValidImageSignature(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) return false;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    // GIF: GIF87a / GIF89a
    if (buf.subarray(0, 3).toString('ascii') === 'GIF') return true;
    // WEBP: RIFF....WEBP
    if (
      bytesRead >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
