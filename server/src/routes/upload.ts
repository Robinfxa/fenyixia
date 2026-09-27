import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const uploadRoute = new Hono();

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

