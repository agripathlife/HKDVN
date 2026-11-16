import { ProcessedImageResult } from '../types';

/**
 * Center-crops an image source to 1:1 square, resizes up to maxSize (800px),
 * and iteratively compresses to WebP targeting ~30-50KB.
 */
export async function processProductImageToWebP(
  file: File,
  maxSize = 800,
  targetMaxKB = 48
): Promise<ProcessedImageResult> {
  const originalKB = Math.round((file.size / 1024) * 10) / 10;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể đọc dữ liệu ảnh'));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Không thể mở tệp ảnh'));
    reader.readAsDataURL(file);
  });

  const minSide = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - minSide) / 2);
  const sy = Math.floor((img.height - minSide) / 2);
  const targetSide = Math.min(minSide, maxSize);

  const canvas = document.createElement('canvas');
  canvas.width = targetSide;
  canvas.height = targetSide;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ xử lý ảnh Canvas');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSide, targetSide);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/webp', quality);

  // Fallback for browsers lacking image/webp encoder
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.78);
  } else {
    while (estimateBase64KB(dataUrl) > targetMaxKB && quality > 0.32) {
      quality = Math.max(0.32, quality - 0.1);
      dataUrl = canvas.toDataURL('image/webp', quality);
    }
  }

  const base64 = dataUrl.split(',')[1] || '';
  const compressedKB = Math.round(estimateBase64KB(dataUrl) * 10) / 10;

  return {
    dataUrl,
    base64,
    width: targetSide,
    height: targetSide,
    originalKB,
    compressedKB,
  };
}

function estimateBase64KB(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  const bytes = Math.ceil((base64.length * 3) / 4);
  return bytes / 1024;
}
