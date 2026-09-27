import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const uploadRoute = new Hono();
uploadRoute.use('*', authMiddleware);
uploadRoute.use(
  '*',
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 40,
    message: '上传图片过于频繁，请稍后再试',
  })
);

// Resolve uploads root directory reliably
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

// Ensure upload subdirectories exist
async function ensureDirs() {
  await fs.mkdir(path.join(UPLOADS_DIR, 'receipts'), { recursive: true });
  await fs.mkdir(path.join(UPLOADS_DIR, 'proofs'), { recursive: true });
  await fs.mkdir(path.join(UPLOADS_DIR, 'avatars'), { recursive: true });
}
ensureDirs().catch(console.error);

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

function isValidImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  // WEBP: RIFF....WEBP (52 49 46 46 ... 57 45 42 50)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true;

  return false;
}

async function handleFileUpload(c: any, subDir: 'receipts' | 'proofs' | 'avatars' | '') {
  try {
    const body = await c.req.parseBody();
    const file = body['file'] || body['image'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded or invalid file field' }, 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: '上传图片大小不能超过 10MB' }, 400);
    }

    // Get original extension and validate against image allowlist
    const rawExt = path.extname(file.name).toLowerCase();
    const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : '.jpg';

    if (rawExt && !ALLOWED_EXTS.has(rawExt)) {
      return c.json({ error: '不支持的文件类型，仅支持 JPG、PNG、WEBP、GIF 格式图片' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return c.json({ error: '上传图片大小不能超过 10MB' }, 400);
    }

    if (!isValidImageMagicBytes(buffer)) {
      return c.json({ error: '无效的图片文件：文件内容与图片格式不匹配' }, 400);
    }

    const randomHex = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${randomHex}${ext}`;

    const targetDir = subDir ? path.join(UPLOADS_DIR, subDir) : UPLOADS_DIR;
    await fs.mkdir(targetDir, { recursive: true });

    const filePath = path.join(targetDir, filename);
    await fs.writeFile(filePath, buffer);

    const relativeUrl = subDir ? `/uploads/${subDir}/${filename}` : `/uploads/${filename}`;

    return c.json({
      success: true,
      url: relativeUrl,
      filename,
      size: buffer.length,
      mimeType: file.type || 'image/jpeg'
    });
  } catch (err: any) {
    console.error('File upload error:', err);
    return c.json({ error: 'Upload failed', details: err.message }, 500);
  }
}

// Upload receipt image
uploadRoute.post('/receipt', (c) => handleFileUpload(c, 'receipts'));

// Upload payment proof screenshot
uploadRoute.post('/proof', (c) => handleFileUpload(c, 'proofs'));

// Upload avatar image
uploadRoute.post('/avatar', (c) => handleFileUpload(c, 'avatars'));

// Generic upload
uploadRoute.post('/', (c) => handleFileUpload(c, ''));

