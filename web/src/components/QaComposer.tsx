import { useRef, useState } from 'react';
import { qaUploadImage, type QaImage } from '@/lib/api';
import MarkdownMath from '@/components/MarkdownMath';
import MathInputDialog from '@/components/MathInputDialog';
import { Button } from '@/components/ui/button';
import { fmtSize, MdHelpModal } from '@/pages/admin/Posts';
import { ImagePlus, Eye, Loader2, HelpCircle, Sigma } from 'lucide-react';

export const QA_IMAGE_BUDGET = 2 * 1024 * 1024; // 與後端一致:每串提問圖片共 2MB

/**
 * 提問/回覆共用的 Markdown 編輯器:
 * 支援 md + LaTeX、圖片上傳(整串共 2MB)、手動更新預覽。
 */
export default function QaComposer({
  budgetUsed,
  placeholder,
  submitLabel,
  onSubmit,
}: {
  budgetUsed: number; // 這串提問已用掉的圖片額度(bytes)
  placeholder?: string;
  submitLabel: string;
  onSubmit: (content: string, images: QaImage[]) => Promise<boolean>; // 回傳 true 表示成功,清空輸入
}) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<QaImage[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 在游標處插入文字
  const insertAtCursor = (snippet: string) => {
    const ta = taRef.current;
    if (ta) {
      const pos = ta.selectionStart ?? content.length;
      setContent(content.slice(0, pos) + snippet + content.slice(pos));
    } else {
      setContent(content + snippet);
    }
  };

  const used = budgetUsed + images.reduce((s, i) => s + i.size, 0);
  const remaining = QA_IMAGE_BUDGET - used;

  const pickImage = async (f: File) => {
    if (!f.type.startsWith('image/')) { setMsg('只能上傳圖片檔'); return; }
    if (f.size > remaining) {
      setMsg(`圖片額度不足:這串提問剩餘 ${fmtSize(Math.max(remaining, 0))}(整串共 2MB）`);
      return;
    }
    setMsg('');
    setUploading(true);
    const b64 = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.readAsDataURL(f);
    });
    const r = await qaUploadImage(f.name, b64, f.type);
    setUploading(false);
    if (!r?.ok) { setMsg(r?.error || '上傳失敗'); return; }
    setImages((arr) => [...arr, { url: r.url, path: r.path, size: r.size }]);
    insertAtCursor(`\n![圖片](${r.url})\n`); // 在游標處插入圖片語法
  };

  const submit = async () => {
    if (!content.trim()) { setMsg('內容不可為空'); return; }
    setBusy(true);
    setMsg('');
    const ok = await onSubmit(content.trim(), images);
    setBusy(false);
    if (ok) {
      setContent('');
      setImages([]);
      setPreview(null);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={taRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder || '支援 Markdown 與 LaTeX（$...$），可上傳圖片。'}
        rows={6}
        className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickImage(f);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={uploading || remaining <= 0} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}
          插入圖片
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowMath(true)} title="像計算機一樣點選輸入數學式">
          <Sigma className="mr-1 h-4 w-4" />數學輸入器
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setPreview(content)}>
          <Eye className="mr-1 h-4 w-4" />更新預覽
        </Button>
        <button
          type="button"
          title="可用語法說明"
          onClick={() => setShowHelp(true)}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">圖片額度剩餘 {fmtSize(Math.max(remaining, 0))}</span>
        <div className="ml-auto">
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? '送出中…' : submitLabel}
          </Button>
        </div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      {preview !== null && (
        <div className="rounded-md border bg-card p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">預覽</p>
          {preview.trim() ? <MarkdownMath md={preview} className="text-sm" /> : <p className="text-sm text-muted-foreground">（沒有內容）</p>}
        </div>
      )}
      {showHelp && <MdHelpModal onClose={() => setShowHelp(false)} />}
      {showMath && <MathInputDialog onInsert={insertAtCursor} onClose={() => setShowMath(false)} />}
    </div>
  );
}
