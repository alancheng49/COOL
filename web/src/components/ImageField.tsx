import { useRef, useState } from 'react';
import { uploadImage } from '@/lib/api';
import type { ImageUploadDecision, ImageUploadResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ImageCollisionDialog, { type ImageCollisionState } from '@/components/ImageCollisionDialog';
import { ImageUp } from 'lucide-react';

const MAX_DIM = 1200; // 最長邊縮到 1200px
const TARGET_BYTES = 850 * 1024; // 伺服器上限 900KB，壓縮目標留餘裕

/** 讀檔 → 用 canvas 縮圖/壓縮 → 回傳 base64（不含 data: 前綴）與 content type */
async function compressImage(file: File): Promise<{ b64: string; type: string }> {
  // 小的 png/jpeg/gif/webp 直接用原檔
  if (file.size <= TARGET_BYTES && /^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
    const b64 = await fileToB64(file);
    return { b64, type: file.type };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('無法讀取圖片'));
      el.src = url;
    });

    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 逐步降品質直到夠小
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      const b64 = dataUrl.split(',')[1];
      if (b64.length * 0.75 <= TARGET_BYTES) return { b64, type: 'image/jpeg' };
    }
    throw new Error('圖片壓縮後仍過大，請先裁切或縮小再上傳');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('讀檔失敗'));
    r.readAsDataURL(file);
  });
}

interface Props {
  value: string;
  onChange: (path: string) => void;
}

/** 附圖欄位：可直接填路徑，或按鈕上傳（自動壓縮），含預覽 */
export default function ImageField({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [collision, setCollision] = useState<(ImageCollisionState & { b64: string; type: string }) | null>(null);
  const [collisionErr, setCollisionErr] = useState('');

  const finishUpload = (response: ImageUploadResponse | null) => {
    if (response?.ok && response.path) {
      onChange(response.path);
      setCollision(null);
      setCollisionErr('');
      return true;
    }
    const message = response?.error === 'IMAGE_TOO_LARGE'
      ? '圖片過大，請縮小後再試'
      : `上傳失敗：${response?.error || '連線錯誤'}`;
    if (collision) setCollisionErr(message);
    else setErr(message);
    return false;
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    if (!file.type.startsWith('image/')) {
      setErr('請選擇圖片檔');
      return;
    }
    setBusy(true);
    try {
      const { b64, type } = await compressImage(file);
      const r = await uploadImage(file.name, b64, type, { interactive: true });
      if (r?.ok && r.requires_choice && r.candidates?.length) {
        setCollision({
          fileName: file.name,
          previewUrl: `data:${type};base64,${b64}`,
          candidates: r.candidates,
          b64,
          type,
        });
        setCollisionErr('');
      } else {
        finishUpload(r);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const resolveCollision = async (decision: ImageUploadDecision, existingPath: string) => {
    if (!collision || decision === 'check') return;
    const selected = collision.candidates.find((candidate) => candidate.path === existingPath);
    if (decision === 'replace' && selected && !window.confirm(
      selected.reference_count > 0
        ? `確定取代這張圖片？系統會同步更新 ${selected.reference_count} 處引用，再刪除舊圖片。`
        : '確定取代這張圖片？舊圖片將從資料庫與儲存空間刪除。',
    )) return;

    setBusy(true);
    setCollisionErr('');
    try {
      const r = await uploadImage(collision.fileName, collision.b64, collision.type, {
        interactive: true,
        decision,
        existing_path: existingPath,
      });
      finishUpload(r);
    } catch (e) {
      setCollisionErr(e instanceof Error ? e.message : '處理圖片失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImageUp className="mr-1 h-4 w-4" />
          {busy ? '上傳中…' : '上傳圖片'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {value && (
        <img
          src={value.startsWith('/') ? value : `/${value}`}
          alt="附圖預覽"
          className="max-h-40 max-w-full rounded border border-border"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          onLoad={(e) => ((e.target as HTMLImageElement).style.display = '')}
        />
      )}
      <ImageCollisionDialog
        value={collision}
        busy={busy}
        error={collisionErr}
        onCancel={() => {
          setCollision(null);
          setCollisionErr('');
        }}
        onDecision={resolveCollision}
      />
    </div>
  );
}
