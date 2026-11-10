export const AI_IMAGE_SEND_LIMIT = 2 * 1024 * 1024; // 與後端一致:單次提問的圖片合計 2MB
export const AI_IMAGE_MAX_COUNT = 4;

const DIRECT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SHRINK_TARGET = 1024 * 1024; // 壓縮後的目標大小,留額度給同一次的其他圖片
const MAX_SIDE = 2000;

export interface AiAttachment {
  mime: string;
  data: string; // Base64
  size: number;
}

export const attachmentUrl = (a: AiAttachment) => `data:${a.mime};base64,${a.data}`;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function shrinkToJpeg(file: File, maxBytes: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#fff'; // 透明背景轉 JPEG 會變黑
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (blob && blob.size <= maxBytes) return blob;
    scale *= 0.75;
  }
  return null;
}

/** 放得下就原檔上傳；太大或格式模型讀不了（如 GIF、HEIC）就轉成較小的 JPEG。無法處理時回傳 null */
export async function prepareAiImage(file: File, remaining: number): Promise<AiAttachment | null> {
  if (DIRECT_TYPES.includes(file.type) && file.size <= remaining) {
    return { mime: file.type, data: await toBase64(file), size: file.size };
  }
  if (remaining <= 0) return null;
  const blob = await shrinkToJpeg(file, Math.min(remaining, SHRINK_TARGET)).catch(() => null);
  return blob ? { mime: 'image/jpeg', data: await toBase64(blob), size: blob.size } : null;
}
