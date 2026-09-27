/**
 * Utility to validate and automatically compress avatar/user images before upload.
 */

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  dataUrl: string;
}

export const MAX_AVATAR_RAW_SIZE = 10 * 1024 * 1024; // 10MB limit for raw selected image

/**
 * Validates and compresses an image to avatar dimensions (default 400x400)
 * Uses square center-crop and JPEG compression (0.85 quality).
 */
export async function compressAvatar(
  file: File,
  targetSize: number = 400,
  quality: number = 0.85
): Promise<CompressionResult> {
  if (file.size > MAX_AVATAR_RAW_SIZE) {
    throw new Error(`图片大小不能超过 ${(MAX_AVATAR_RAW_SIZE / (1024 * 1024)).toFixed(0)}MB`);
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('请选择有效的图片文件 (JPG, PNG, WebP 等)');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片文件失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('解析图片数据失败'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('无法创建图片压缩画布上下文'));
          }

          // Calculate center crop (cover style)
          const sw = img.width;
          const sh = img.height;
          let sx = 0;
          let sy = 0;
          let sSize = sw;

          if (sw > sh) {
            sSize = sh;
            sx = (sw - sh) / 2;
          } else if (sh > sw) {
            sSize = sw;
            sy = (sh - sw) / 2;
          }

          // Draw cropped & scaled square
          ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, targetSize, targetSize);

          const mimeType = 'image/jpeg';
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error('图片压缩导出失败'));
              }
              const dataUrl = canvas.toDataURL(mimeType, quality);
              resolve({
                blob,
                originalSize: file.size,
                compressedSize: blob.size,
                width: targetSize,
                height: targetSize,
                dataUrl,
              });
            },
            mimeType,
            quality
          );
        } catch (err: any) {
          reject(err);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Format bytes to readable string (e.g. 1.2 MB, 48 KB)
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
