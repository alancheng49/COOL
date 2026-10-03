import { useEffect, useMemo, useState } from 'react';
import type { ImageUploadCandidate, ImageUploadDecision } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Copy, FileImage, Files, Replace } from 'lucide-react';

export interface ImageCollisionState {
  fileName: string;
  previewUrl: string;
  candidates: ImageUploadCandidate[];
}

interface Props {
  value: ImageCollisionState | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDecision: (decision: ImageUploadDecision, existingPath: string) => void;
}

function imageUrl(path: string) {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return '大小未知';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 100 * 1024 ? 1 : 0)} KB`;
}

export default function ImageCollisionDialog({ value, busy, error, onCancel, onDecision }: Props) {
  const [selectedPath, setSelectedPath] = useState('');

  useEffect(() => {
    if (!value) return;
    const preferred = value.candidates.find((candidate) => candidate.same_content) || value.candidates[0];
    setSelectedPath(preferred?.path || '');
  }, [value]);

  const selected = useMemo(
    () => value?.candidates.find((candidate) => candidate.path === selectedPath) || value?.candidates[0],
    [selectedPath, value],
  );
  const exactMatch = !!value?.candidates.some((candidate) => candidate.same_content);

  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exactMatch ? '找到相同圖片' : '檔名已經存在'}</DialogTitle>
          <DialogDescription>
            {exactMatch
              ? '系統比對到內容完全相同的圖片，可直接使用既有圖片，避免重複占用空間。'
              : '新圖片與資料庫中的圖片同名但內容不同，請確認預覽後選擇處理方式。'}
          </DialogDescription>
        </DialogHeader>

        {value && selected && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileImage className="h-4 w-4 text-primary" />
                  新圖片
                </div>
                <div className="flex h-56 items-center justify-center overflow-hidden rounded-md border bg-muted/20 p-3">
                  <img src={value.previewUrl} alt={`新圖片 ${value.fileName}`} className="max-h-full max-w-full object-contain" />
                </div>
                <p className="truncate text-sm text-muted-foreground" title={value.fileName}>{value.fileName}</p>
              </section>

              <section className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Copy className="h-4 w-4 text-primary" />
                  資料庫中的圖片
                </div>
                <div className="flex h-56 items-center justify-center overflow-hidden rounded-md border bg-muted/20 p-3">
                  <img src={imageUrl(selected.path)} alt={`既有圖片 ${selected.original_name}`} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={selected.original_name}>
                    {selected.original_name}
                  </p>
                  <Badge variant={selected.same_content ? 'default' : 'outline'} className="shrink-0">
                    {selected.same_content ? '內容相同' : '僅檔名相同'}
                  </Badge>
                </div>
              </section>
            </div>

            {value.candidates.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">選擇要處理的既有圖片</p>
                <RadioGroup value={selected.path} onValueChange={setSelectedPath} className="max-h-44 overflow-y-auto rounded-md border p-1">
                  {value.candidates.map((candidate) => (
                    <label
                      key={candidate.path}
                      className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 hover:bg-muted/60"
                    >
                      <RadioGroupItem value={candidate.path} />
                      <img src={imageUrl(candidate.path)} alt="" className="h-10 w-14 shrink-0 rounded border object-contain" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm" title={candidate.original_name}>{candidate.original_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {candidate.same_content ? '內容完全相同' : '檔名相同、內容不同'} · {formatBytes(candidate.size)}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">
                {selected.reference_count > 0
                  ? `目前有 ${selected.reference_count} 處題目引用這張圖片`
                  : '目前沒有考卷或草稿引用這張圖片'}
              </p>
              {selected.references.length > 0 && (
                <p
                  className="mt-1 truncate text-xs text-muted-foreground"
                  title={selected.references.map((item) => item.label).join('、')}
                >
                  {selected.references.map((item) => item.label).join('、')}
                </p>
              )}
              {!selected.same_content && selected.reference_count > 0 && (
                <p className="mt-2 text-xs text-destructive">
                  選擇取代時，系統會先將這些引用改為新圖片，再刪除舊圖片。
                </p>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:flex-wrap">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>取消</Button>
          <Button type="button" variant="outline" disabled={busy || !selected} onClick={() => selected && onDecision('keep_both', selected.path)}>
            <Files />
            兩者皆保留
          </Button>
          {!selected?.same_content && (
            <Button type="button" variant="destructive" disabled={busy || !selected} onClick={() => selected && onDecision('replace', selected.path)}>
              <Replace />
              取代既有圖片
            </Button>
          )}
          <Button type="button" disabled={busy || !selected} onClick={() => selected && onDecision('reuse', selected.path)}>
            <Copy />
            {busy ? '處理中…' : '使用既有圖片'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
