import { useEffect, useMemo, useState } from 'react';

/**
 * 輕量 Markdown + LaTeX 渲染（零依賴）。
 * 支援：# 大標題、## 小標題、### 子標題、**粗體**、*斜體*、__底線__、~~刪除線~~、
 * `程式碼`、- / 1. 清單、> 引言、水平線、[連結](url)、![圖片](url)、
 * | 表格 |、@[youtube](網址) 嵌入影片；$...$ 與 $$...$$ 交給 KaTeX。
 * 流程：先抽出數學式保護 → Markdown → 塞回 KaTeX HTML。
 */

const KATEX_OPTS = { throwOnError: false, macros: { '\\degree': '^{\\circ}' } };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 從各種 YouTube 網址取出影片 ID(容忍 URL 編碼與追蹤參數) */
function youtubeId(url: string): string | null {
  let u = url.trim();
  try {
    // 複製自 Google 搜尋的網址常是編碼過的(%3Fv%3D...)
    for (let i = 0; i < 3 && /%[0-9a-fA-F]{2}/.test(u); i++) u = decodeURIComponent(u);
  } catch {}
  const m =
    u.match(/(?:youtube\.com\/(?:watch\?[^\s]*?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/) ||
    u.match(/[?&]v=([\w-]{11})/);
  return m ? m[1] : null;
}

function youtubeEmbed(url: string): string {
  const id = youtubeId(url);
  if (!id) return `<a href="${url}" target="_blank" rel="noopener" class="text-primary underline">${url}</a>`;
  // 影片由 YouTube 供流,不經過自家伺服器
  return `<div class="my-3 aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-border">
    <iframe class="h-full w-full" src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube 影片"
      frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen loading="lazy"></iframe>
  </div>`;
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+?)`/g, '<code class="rounded bg-secondary px-1 py-0.5 text-[0.9em]">$1</code>')
    .replace(/!\[([^\]]*?)\]\((https?:\/\/[^)\s]+?)\)/g, '<img src="$2" alt="$1" class="my-2 inline-block max-h-96 max-w-full rounded border border-border" loading="lazy" />')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+?)__/g, '<u>$1</u>')
    .replace(/~~([^~]+?)~~/g, '<del>$1</del>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+?)\]\((https?:\/\/[^)\s]+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-primary underline">$1</a>');
}

/** 表格列拆欄:| a | b | → ['a','b'] */
function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}
const isTableSep = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');

function mdToHtml(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n/g, '\n')).split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) {
      out.push(list === 'ul' ? '</ul>' : '</ol>');
      list = null;
    }
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trimEnd();

    // YouTube 嵌入:@[youtube](url)(escapeHtml 不影響此語法)
    const yt = line.match(/^\s*@\[youtube\]\(([^)]+)\)\s*$/i);
    if (yt) {
      closeList();
      out.push(youtubeEmbed(yt[1].trim()));
      continue;
    }

    // 表格:目前行有 |,下一行是分隔線
    if (line.includes('|') && li + 1 < lines.length && isTableSep(lines[li + 1])) {
      closeList();
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = li + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        rows.push(splitRow(lines[j]));
        j++;
      }
      out.push('<div class="my-2 overflow-x-auto"><table class="min-w-[50%] border-collapse text-sm">');
      out.push('<thead><tr>' + header.map((h) => `<th class="border border-border bg-secondary/70 px-3 py-1.5 text-left font-semibold">${inline(h)}</th>`).join('') + '</tr></thead>');
      out.push('<tbody>');
      for (const row of rows) {
        out.push('<tr>' + header.map((_, ci) => `<td class="border border-border px-3 py-1.5">${inline(row[ci] ?? '')}</td>`).join('') + '</tr>');
      }
      out.push('</tbody></table></div>');
      li = j - 1;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.、]\s+(.*)$/);
    const bq = line.match(/^&gt;\s?(.*)$/) || line.match(/^>\s?(.*)$/);

    if (h) {
      closeList();
      const level = h[1].length; // # → h2、## → h3、### → h4
      const cls = level === 1
        ? 'mt-4 mb-2 border-b border-border pb-1 font-serif text-xl font-bold'
        : level === 2
          ? 'mt-3 mb-1.5 font-serif text-lg font-bold'
          : 'mt-2 mb-1 text-base font-bold';
      out.push(`<h${level + 1} class="${cls}">${inline(h[2])}</h${level + 1}>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      closeList();
      out.push('<hr class="my-3 border-border" />');
    } else if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul class="my-1 list-disc pl-5 space-y-0.5">'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol class="my-1 list-decimal pl-5 space-y-0.5">'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else if (bq) {
      closeList();
      out.push(`<blockquote class="my-1 border-l-2 border-primary/40 pl-3 text-muted-foreground">${inline(bq[1])}</blockquote>`);
    } else if (line.trim() === '') {
      closeList();
      out.push('<div class="h-2"></div>');
    } else {
      closeList();
      out.push(`<p class="my-0.5 leading-relaxed">${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

function render(md: string): string {
  const k = window.katex;
  // 1) 抽出數學式,以佔位符保護
  const mathes: string[] = [];
  const protectedMd = md
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      const math = k ? safeKatex(k, tex, true) : escapeHtml(`$$${tex}$$`);
      mathes.push(`<span class="display-math-scroll">${math}</span>`);
      return `KXMATH${mathes.length - 1}HTAMXK`;
    })
    .replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      const math = k ? safeKatex(k, tex, false) : escapeHtml(`$${tex}$`);
      mathes.push(`<span class="inline-math-spacing">${math}</span>`);
      return `KXMATH${mathes.length - 1}HTAMXK`;
    });
  // 2) Markdown → HTML
  let html = mdToHtml(protectedMd);
  // 3) 塞回 KaTeX 結果
  html = html.replace(/KXMATH(\d+)HTAMXK/g, (_, i) => mathes[Number(i)] ?? '');
  return html;
}

function safeKatex(
  k: NonNullable<typeof window.katex>,
  tex: string,
  display: boolean
): string {
  try {
    return k.renderToString(tex, { ...KATEX_OPTS, displayMode: display });
  } catch {
    return escapeHtml(tex);
  }
}

// 等 KaTeX CDN 載入(與 MathHtml 同機制)
export default function MarkdownMath({ md, className }: { md: string; className?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.katex) return;
    const t = setInterval(() => {
      if (window.katex) {
        clearInterval(t);
        setTick((n) => n + 1);
      }
    }, 80);
    const stop = setTimeout(() => clearInterval(t), 15000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => render(md), [md, tick]);
  return <div className={`math-content ${className || ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
