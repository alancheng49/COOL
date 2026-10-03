import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, X } from 'lucide-react';
import { backdropClose } from '@/lib/utils';

// MathLive:視覺化數學輸入(像工程計算機),輸出 LaTeX。只在打開視窗時才載入。
const MATHLIVE_SRC = 'https://cdn.jsdelivr.net/npm/mathlive@0.110.0/mathlive.min.js';
let mathlivePromise: Promise<void> | null = null;

function loadMathLive(): Promise<void> {
  if (!mathlivePromise) {
    mathlivePromise = new Promise((resolve, reject) => {
      if (customElements.get('math-field')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = MATHLIVE_SRC;
      s.onload = () => resolve();
      s.onerror = () => { mathlivePromise = null; reject(new Error('LOAD_FAILED')); };
      document.head.appendChild(s);
    });
  }
  return mathlivePromise;
}

/**
 * 數學輸入器彈窗:像計算機一樣點選分數、根號、次方等按鈕,
 * 自動產生 LaTeX,選「插入」放進文字框。
 */
export default function MathInputDialog({
  onInsert,
  onClose,
}: {
  onInsert: (snippet: string) => void;
  onClose: () => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLElement & { value: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [latex, setLatex] = useState('');

  useEffect(() => {
    let alive = true;
    loadMathLive()
      .then(() => {
        if (!alive || !holderRef.current) return;
        const el = document.createElement('math-field') as HTMLElement & { value: string };
        el.style.display = 'block';
        el.style.width = '100%';
        el.style.fontSize = '1.3rem';
        el.style.padding = '8px';
        el.style.borderRadius = '6px';
        el.style.border = '1px solid hsl(var(--border))';
        el.style.background = 'hsl(var(--card))';
        el.style.color = 'hsl(var(--card-foreground))';
        el.addEventListener('input', () => setLatex(el.value));
        holderRef.current.innerHTML = '';
        holderRef.current.appendChild(el);
        fieldRef.current = el;
        setState('ready');
        setTimeout(() => el.focus(), 50);
      })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, []);

  const insert = (block: boolean) => {
    const v = (fieldRef.current?.value || latex).trim();
    if (!v) return;
    onInsert(block ? `\n$$${v}$$\n` : `$${v}$`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" {...backdropClose(onClose)}>
      <Card className="max-h-[90dvh] w-full max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-3 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold">數學輸入器</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          {state === 'loading' && (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />載入數學鍵盤中…
            </p>
          )}
          {state === 'error' && (
            <p className="py-6 text-sm text-destructive">
              數學輸入器載入失敗（可能是網路問題）。可以改用外部工具如 latexlive.com 產生後貼上。
            </p>
          )}

          <div ref={holderRef} className={state === 'ready' ? '' : 'hidden'} />

          {state === 'ready' && (
            <>
              <p className="text-xs text-muted-foreground">
                直接點欄位輸入，或按欄位右側的鍵盤圖示打開「計算機式」面板點選分數、根號、次方等符號；
                也可以打字（例：輸入 <code className="rounded bg-secondary px-1">/</code> 會自動變分數、
                <code className="rounded bg-secondary px-1">sqrt</code> 變根號）。完成後按插入。
              </p>
              <div className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                LaTeX：{latex || '（尚未輸入）'}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => insert(true)} disabled={!latex.trim()}>插入獨立一行</Button>
                <Button onClick={() => insert(false)} disabled={!latex.trim()}>插入行內</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
