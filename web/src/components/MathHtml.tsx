import { useEffect, useMemo, useState } from 'react';
import { clozeBlankLabel } from '@/lib/cloze';

declare global {
  interface Window {
    katex?: {
      renderToString: (tex: string, opts?: Record<string, unknown>) => string;
    };
  }
}

const KATEX_OPTS = {
  throwOnError: false,
  strict: false,
  macros: { '\\degree': '^{\\circ}' },
};

const CLOZE_BLANK_RE = /\((\d+)\)/g;

function clozeBlankHtml(index: string): string {
  return `<span class="cloze-blank-marker" role="img" aria-label="第 ${index} 格">${clozeBlankLabel(index)}</span>`;
}

function renderTextClozeBlanks(html: string): string {
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => part.startsWith('<') ? part : part.replace(CLOZE_BLANK_RE, (_, index) => clozeBlankHtml(index)))
    .join('');
}

function renderMathClozeBlanks(tex: string): string {
  return tex.replace(CLOZE_BLANK_RE, (_, index) =>
    `\\htmlClass{cloze-blank-marker}{\\boxed{\\mathsf{${index}}}}`
  );
}

/**
 * 把字串中的 $...$ / $$...$$ 直接轉成 KaTeX HTML（字串階段處理，
 * 不在 React 管理的 DOM 上做原地替換，避免切題/重新渲染時公式漏渲染）。
 */
function renderLatex(html: string, highlightClozeBlanks: boolean): string {
  const k = window.katex;
  if (!k) return highlightClozeBlanks ? renderTextClozeBlanks(html) : html;

  const mathPattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let output = '';
  let cursor = 0;
  for (const match of html.matchAll(mathPattern)) {
    const offset = match.index ?? 0;
    const plain = html.slice(cursor, offset);
    output += highlightClozeBlanks ? renderTextClozeBlanks(plain) : plain;

    const displayMode = match[1] !== undefined;
    const rawTex = match[1] ?? match[2];
    const tex = highlightClozeBlanks ? renderMathClozeBlanks(rawTex) : rawTex;
    const options = highlightClozeBlanks
      ? {
          ...KATEX_OPTS,
          displayMode,
          trust: (context: { command?: string; class?: string }) =>
            context.command === '\\htmlClass' && context.class === 'cloze-blank-marker',
        }
      : { ...KATEX_OPTS, displayMode };
    try {
      const math = k.renderToString(tex, options);
      output += `<span class="${displayMode ? 'display-math-scroll' : 'inline-math-spacing'}">${math}</span>`;
    } catch {
      output += match[0];
    }
    cursor = offset + match[0].length;
  }
  const tail = html.slice(cursor);
  output += highlightClozeBlanks ? renderTextClozeBlanks(tail) : tail;
  return output;
}

// KaTeX 由 CDN 載入，首次可能還沒好；好了之後通知所有 MathHtml 重新渲染
let katexReady = typeof window !== 'undefined' && !!window.katex;
const waiters = new Set<() => void>();
if (!katexReady && typeof window !== 'undefined') {
  const t = setInterval(() => {
    if (window.katex) {
      katexReady = true;
      clearInterval(t);
      waiters.forEach((fn) => fn());
      waiters.clear();
    }
  }, 60);
  setTimeout(() => clearInterval(t), 15000);
}

/** 渲染含 $...$ LaTeX 的 HTML 字串；填充題可另外醒目標示 (1)、(2)…空格。 */
export default function MathHtml({
  html,
  className,
  highlightClozeBlanks = false,
}: {
  html: string;
  className?: string;
  highlightClozeBlanks?: boolean;
}) {
  const [tick, force] = useState(0);

  useEffect(() => {
    if (katexReady) return;
    const fn = () => force((n) => n + 1);
    waiters.add(fn);
    return () => {
      waiters.delete(fn);
    };
  }, []);

  const rendered = useMemo(() => {
    // tick 只負責在 KaTeX CDN 載入後強制重新計算。
    void tick;
    return renderLatex(html, highlightClozeBlanks);
  }, [html, highlightClozeBlanks, tick]);

  return <div className={`math-content ${className || ''}`} dangerouslySetInnerHTML={{ __html: rendered }} />;
}
