import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { PdfRegion } from '@/lib/types';
import { fitPdfRegion, validPdfRegion } from '@/lib/pdf-region';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Minus, Plus, Maximize, LocateFixed, Scan } from 'lucide-react';

/**
 * PDF 檢視器(pdf.js,CDN 載入,不增加 bundle)。
 * 功能:換頁、縮放、框選題目與定位;範圍座標使用頁面比例。
 */

const PDFJS_VER = '3.11.174'; // 最後一個 UMD 版本
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.js`;
const WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.js`;

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (src: string) => { promise: Promise<PdfDoc>; destroy?: () => Promise<void> };
    };
  }
}
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}
interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void };
}

let pdfjsLoading: Promise<void> | null = null;
function loadPdfjs(): Promise<void> {
  if (window.pdfjsLib) return Promise.resolve();
  if (!pdfjsLoading) {
    pdfjsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onload = () => {
        window.pdfjsLib!.GlobalWorkerOptions.workerSrc = WORKER_URL;
        resolve();
      };
      s.onerror = () => { pdfjsLoading = null; s.remove(); reject(new Error('pdf.js 載入失敗')); };
      document.head.appendChild(s);
    });
  }
  return pdfjsLoading;
}

const CROP_TARGET_WIDTH = 1400; // 截圖寬度,足以辨識題本小字
const CROP_MAX_PAGE_PX = 4096; // 手機瀏覽器的 canvas 尺寸上限
const CROP_MAX_BASE64 = 1200 * 1024; // 後端上限 900KB,Base64 約多 1/3
const crops = new Map<string, Promise<string>>();

async function renderPdfCrop(url: string, region: PdfRegion): Promise<string> {
  await loadPdfjs();
  const task = window.pdfjsLib!.getDocument(url);
  try {
    const doc = await task.promise;
    const page = await doc.getPage(region.page);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(CROP_TARGET_WIDTH / (base.width * region.width), CROP_MAX_PAGE_PX / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const full = document.createElement('canvas');
    full.width = Math.ceil(viewport.width);
    full.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: full.getContext('2d')!, viewport }).promise;
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(full.width * region.width));
    crop.height = Math.max(1, Math.round(full.height * region.height));
    crop.getContext('2d')!.drawImage(full, full.width * region.x, full.height * region.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    let data = '';
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      data = crop.toDataURL('image/jpeg', quality).split(',')[1];
      if (data.length <= CROP_MAX_BASE64) break;
    }
    return data;
  } finally {
    void task.destroy?.().catch(() => {});
  }
}

/** 把題目範圍截成 JPEG(Base64,不含 data: 前綴);同一題只畫一次 */
export function cropPdfRegion(url: string, region: PdfRegion): Promise<string> {
  const key = `${url}|${JSON.stringify(region)}`;
  let crop = crops.get(key);
  if (!crop) {
    crop = renderPdfCrop(url, region);
    crops.set(key, crop);
    crop.catch(() => crops.delete(key));
  }
  return crop;
}

interface Props {
  url: string;
  className?: string;
  region?: PdfRegion;
  focusKey?: number | string;
  onRegionChange?: (region: PdfRegion) => void;
}

export default function PdfViewer({ url, className, region, focusKey, onRegionChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [view, setView] = useState<{ page: number; scale: number; region?: PdfRegion; revision: number }>({ page: 1, scale: 1, revision: 0 });
  const { page, scale } = view;
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [draft, setDraft] = useState<PdfRegion>();
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [returnCount, setReturnCount] = useState(0);
  const initializedDoc = useRef<PdfDoc | null>(null);
  const navigationId = useRef(0);
  const target = validPdfRegion(region);
  const targetKey = JSON.stringify(target);

  useEffect(() => {
    let alive = true;
    let task: ReturnType<NonNullable<Window['pdfjsLib']>['getDocument']> | undefined;
    setDoc(null);
    setReady(false);
    setErr('');
    loadPdfjs().then(() => {
      if (!alive) return;
      task = window.pdfjsLib!.getDocument(url);
      return task.promise;
    }).then((d) => {
      if (alive && d) setDoc(d);
    }).catch((e) => { if (alive) setErr(e?.message || 'PDF 載入失敗'); });
    return () => { alive = false; void task?.destroy?.().catch(() => {}); };
  }, [url]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    // Observe the non-scrolling frame. Measuring the scroller's client size
    // creates a feedback loop near overflow thresholds: zoom adds a scrollbar,
    // its smaller client size reduces zoom, and the scrollbar disappears again.
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A question change or explicit return restores its page, zoom and scroll position.
  useEffect(() => {
    setSelecting(false);
    setDraft(undefined);
    drag.current = null;
  }, [doc, targetKey, focusKey]);

  useEffect(() => {
    if (!doc || !size.width || !size.height) return;
    let alive = true;
    const focus = validPdfRegion(JSON.parse(targetKey || 'null'));
    const usable = focus && focus.page <= doc.numPages ? focus : undefined;
    // Unmapped legacy questions retain the reader's current location.
    if (!usable && initializedDoc.current === doc) return;
    const nextPage = usable?.page || 1;
    const requestId = ++navigationId.current;
    setReady(false);
    doc.getPage(nextPage).then((p) => {
      if (!alive || requestId !== navigationId.current) return;
      initializedDoc.current = doc;
      const viewport = p.getViewport({ scale: 1 });
      const nextScale = usable
        ? fitPdfRegion(usable, viewport.width, viewport.height, size.width, size.height)
        : Math.max(0.05, Math.min(3, ((scrollRef.current?.clientWidth || size.width) - 24) / viewport.width));
      setView((v) => ({ page: nextPage, scale: nextScale, region: usable, revision: v.revision + 1 }));
    }).catch((e) => { if (alive) setErr(e?.message || 'PDF 定位失敗'); });
    return () => { alive = false; };
  }, [doc, targetKey, focusKey, returnCount, size.width, size.height]);

  useEffect(() => {
    if (!doc) return;
    let alive = true;
    let task: ReturnType<PdfPage['render']> | undefined;
    setReady(false);
    setErr('');
    doc.getPage(page).then(async (p) => {
      if (!alive) return;
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: scale * dpr });
      // Render offscreen so cancelled/slow renders cannot overwrite a newer question.
      const buffer = document.createElement('canvas');
      buffer.width = Math.ceil(viewport.width);
      buffer.height = Math.ceil(viewport.height);
      task = p.render({ canvasContext: buffer.getContext('2d')!, viewport });
      await task.promise;
      const canvas = canvasRef.current;
      if (!alive || !canvas) return;
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      canvas.getContext('2d')!.drawImage(buffer, 0, 0);
      const scroller = scrollRef.current;
      const sheet = pageRef.current;
      if (scroller && sheet && view.region) {
        const r = view.region;
        const sheetRect = sheet.getBoundingClientRect();
        const scrollRect = scroller.getBoundingClientRect();
        scroller.scrollLeft += sheetRect.left - scrollRect.left + (r.x + r.width / 2) * sheetRect.width - scroller.clientWidth / 2;
        scroller.scrollTop += sheetRect.top - scrollRect.top + (r.y + r.height / 2) * sheetRect.height - scroller.clientHeight / 2;
      } else if (scroller && !view.region) {
        scroller.scrollTo({ top: 0, left: 0 });
      }
      setReady(true);
    }).catch((e) => { if (alive && e?.name !== 'RenderingCancelledException') setErr(e?.message || 'PDF 頁面載入失敗'); });
    return () => { alive = false; task?.cancel(); };
  }, [doc, view, page, scale]);

  const navigate = (nextPage: number, nextScale = scale) => {
    navigationId.current++;
    setReady(false);
    setDraft(undefined);
    drag.current = null;
    setView((v) => ({ page: nextPage, scale: nextScale, revision: v.revision + 1 }));
  };
  const fitWidth = () => {
    const width = pageRef.current?.getBoundingClientRect().width;
    if (width) navigate(page, Math.max(0.05, Math.min(3, ((scrollRef.current?.clientWidth || size.width) - 24) / (width / scale))));
  };
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const selection = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    const end = point(event);
    return { page, x: Math.min(drag.current.x, end.x), y: Math.min(drag.current.y, end.y), width: Math.abs(end.x - drag.current.x), height: Math.abs(end.y - drag.current.y) };
  };
  const marked = draft || (target?.page === page ? target : undefined);

  return (
    <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card ${className || ''}`}>
      {/* 工具列 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-border bg-secondary/60 px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="md:h-7 md:w-7" title="PDF 上一頁" aria-label="PDF 上一頁" disabled={!doc || page <= 1} onClick={() => navigate(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-14 text-center text-xs tabular-nums">
            {doc ? `${page} / ${doc.numPages}` : '—'}
          </span>
          <Button variant="ghost" size="icon" className="md:h-7 md:w-7" title="PDF 下一頁" aria-label="PDF 下一頁" disabled={!doc || page >= (doc?.numPages || 1)} onClick={() => navigate(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="md:h-7 md:w-7" title="縮小 PDF" aria-label="縮小 PDF" disabled={!doc} onClick={() => navigate(page, Math.max(0.05, scale - 0.2))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-10 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="md:h-7 md:w-7" title="放大 PDF" aria-label="放大 PDF" disabled={!doc} onClick={() => navigate(page, Math.min(3, scale + 0.2))}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="md:h-7 md:w-7" title="適合寬度" aria-label="適合寬度" disabled={!doc} onClick={fitWidth}>
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {(target || onRegionChange) && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1.5">
        {target && <Button type="button" size="sm" variant="outline" disabled={!doc || target.page > doc.numPages} onClick={() => { setReady(false); setReturnCount((n) => n + 1); }}><LocateFixed className="mr-1 h-4 w-4" />回到題目</Button>}
        {onRegionChange && <Button type="button" size="sm" variant={selecting ? 'default' : 'outline'} disabled={!ready} onClick={() => { setSelecting((v) => !v); setDraft(undefined); }}><Scan className="mr-1 h-4 w-4" />{selecting ? '取消框選' : '框選範圍'}</Button>}
        {onRegionChange && <span className="text-xs text-muted-foreground">按「框選範圍」後，在 PDF 上拖曳；支援滑鼠與觸控。</span>}
        {target && doc && target.page > doc.numPages && <span className="text-xs text-destructive">指定頁碼不存在，請重新框選。</span>}
      </div>}
      {/* 頁面 */}
      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={scrollRef} className="absolute inset-0 overflow-auto bg-slate-200/70 p-3">
        {err && <p role="alert" className="py-3 text-center text-sm text-destructive">{err}</p>}
        {!doc && !err && <p className="py-10 text-center text-sm text-muted-foreground">題本載入中…</p>}
        {doc && <>
          {!ready && !err && <p role="status" className="absolute left-3 top-3 text-xs text-muted-foreground">頁面載入中…</p>}
          <div ref={pageRef} data-pdf-page={page} className="relative mx-auto w-fit" style={{ visibility: ready ? 'visible' : 'hidden' }}>
            <canvas ref={canvasRef} className="block shadow" />
            <div
              aria-label="PDF 題目範圍"
              className="absolute inset-0"
              style={{ pointerEvents: selecting ? 'auto' : 'none', touchAction: selecting ? 'none' : 'auto', cursor: selecting ? 'crosshair' : 'auto' }}
              onPointerDown={(event) => {
                if (!selecting || !ready || event.button !== 0 || drag.current) return;
                event.preventDefault();
                drag.current = { ...point(event), pointer: event.pointerId };
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraft(undefined);
              }}
              onPointerMove={(event) => { const r = selection(event); if (r) setDraft(r); }}
              onPointerUp={(event) => {
                const r = selection(event);
                if (!r) return;
                drag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
                setDraft(undefined);
                const rect = event.currentTarget.getBoundingClientRect();
                if (r.width * rect.width < 8 || r.height * rect.height < 8) return;
                setSelecting(false);
                onRegionChange?.(r);
              }}
              onPointerCancel={() => { drag.current = null; setDraft(undefined); }}
              onLostPointerCapture={() => { drag.current = null; setDraft(undefined); }}
            >
              {marked && <div data-pdf-region className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/10" style={{ left: `${marked.x * 100}%`, top: `${marked.y * 100}%`, width: `${marked.width * 100}%`, height: `${marked.height * 100}%` }} />}
            </div>
          </div>
        </>}
      </div>
      </div>
    </div>
  );
}
