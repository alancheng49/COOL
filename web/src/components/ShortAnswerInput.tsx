import { useRef, useState } from 'react';
import type { ShortAnswerValue } from '@/lib/types';
import { qaUploadImage } from '@/lib/api';
import MarkdownMath from './MarkdownMath';
import MathInputDialog from './MathInputDialog';
import { Button } from './ui/button';
import { Eye, ImagePlus, Sigma, X } from 'lucide-react';

const MAX_IMAGES_BYTES = 2 * 1024 * 1024;

export default function ShortAnswerInput({ value, onChange, disabled }: {
  value: ShortAnswerValue;
  onChange: (value: ShortAnswerValue) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const insert = (snippet: string) => {
    const at = textarea.current?.selectionStart ?? value.text.length;
    onChange({ ...value, text: value.text.slice(0, at) + snippet + value.text.slice(at) });
  };

  const upload = async (picked?: File) => {
    if (!picked) return;
    const used = value.images.reduce((sum, image) => sum + image.size, 0);
    if (!picked.type.startsWith('image/')) { setError('只能上傳圖片檔'); return; }
    if (used + picked.size > MAX_IMAGES_BYTES) { setError('本題圖片總大小不可超過 2MB'); return; }
    setBusy(true);
    setError('');
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('讀取圖片失敗'));
      reader.readAsDataURL(picked);
    }).catch(() => '');
    const result = b64 ? await qaUploadImage(picked.name, b64, picked.type) : null;
    setBusy(false);
    if (!result?.ok) { setError(result?.error || '圖片上傳失敗'); return; }
    onChange({ ...value, images: [...value.images, { url: result.url, path: result.path, size: result.size }] });
  };

  return (
    <div className="space-y-3">
      <textarea
        ref={textarea}
        rows={8}
        value={value.text}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
        placeholder="輸入答案，支援 Markdown 與 $LaTeX$。也可以只上傳作答圖片。"
        className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-70"
      />
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => file.current?.click()}>
          <ImagePlus className="mr-1 h-4 w-4" />{busy ? '上傳中…' : '上傳圖片'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setShowMath(true)}>
          <Sigma className="mr-1 h-4 w-4" />數學輸入器
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setPreview((current) => !current)}>
          <Eye className="mr-1 h-4 w-4" />{preview ? '關閉預覽' : '預覽'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!!value.images.length && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {value.images.map((image, index) => (
            <div key={image.path || image.url} className="relative rounded-md border bg-card p-1">
              <img src={image.url} alt={`作答圖片 ${index + 1}`} className="h-28 w-full object-contain" />
              {!disabled && <button type="button" title="移除圖片" className="absolute right-1 top-1 rounded bg-background/90 p-1" onClick={() => onChange({ ...value, images: value.images.filter((_, i) => i !== index) })}><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
      {preview && <div className="rounded-md border bg-card p-3">{value.text.trim() ? <MarkdownMath md={value.text} /> : <p className="text-sm text-muted-foreground">（沒有文字內容）</p>}</div>}
      {showMath && <MathInputDialog onInsert={insert} onClose={() => setShowMath(false)} />}
    </div>
  );
}
