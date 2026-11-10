import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { aiThreadDelete, aiThreadList, aiThreadRename, fetchQuestions, historyDetail, type AiThreadSummary, type AiThreadTarget, type AiTutorMessage } from '@/lib/api';
import { validPdfRegion } from '@/lib/pdf-region';
import { cn } from '@/lib/utils';
import AiChatPanel from '@/components/AiChatPanel';
import { fmtPostTime } from '@/pages/admin/Posts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileQuestion, Loader2, MessageSquare, PanelLeft, Pencil, Plus, Trash2 } from 'lucide-react';

const LIST_POLL_MS = 5000;
const TITLE_MAX_CHARS = 60; // 與後端一致
const SUGGESTIONS = ['我想複習一個觀念，可以怎麼開始？', '可以幫我出一題練習題嗎？', '考試前要怎麼規劃複習？'];

const newChatId = () => `chat_${crypto.randomUUID().replace(/-/g, '')}`;

const targetOf = (item: AiThreadSummary): AiThreadTarget => (item.attempt_id != null ? { attempt_id: item.attempt_id, q_index: item.q_index! } : { thread_id: item.id });

// 從提問區繼續題目對話時，重新取得 PDF 題本的題目範圍
async function questionPdf(attemptId: string, qIndex: number) {
  const detail = await historyDetail(attemptId);
  const url = detail?.ok ? detail.quiz_meta?.pdf_url : '';
  if (!url) return null;
  const questions = await fetchQuestions(detail.quiz_meta.file);
  const region = validPdfRegion(questions?.[qIndex]?.pdf_region);
  return region ? { url, region } : null;
}

/** 提問區的 AI 對話：左側歷史列表，右側對話，可隨時切換並接著問 */
export default function AiChat() {
  const [items, setItems] = useState<AiThreadSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState(() => location.hash.split('/qa/ai/')[1] || newChatId());
  const [threads, setThreads] = useState<Record<string, AiTutorMessage[]>>({});
  const [model, setModel] = useState('auto');
  const [showList, setShowList] = useState(false); // 手機版一次只顯示列表或對話
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const renameDone = useRef(false); // 按 Enter 或 Esc 後輸入框移除時還會觸發 blur，不要重複處理

  const reload = useCallback(() => {
    void aiThreadList().then((r) => { if (r?.ok) setItems(r.items || []); }).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  useEffect(reload, [reload]);

  const active = items.find((item) => item.id === activeId);
  const isQuestion = active?.attempt_id != null;
  const canOpen = !!active || activeId.startsWith('chat_');
  const running = items.some((item) => item.status === 'running');

  useEffect(() => {
    if (loaded && !canOpen) setActiveId(newChatId()); // 網址上的題目對話已被清除
  }, [loaded, canOpen]);

  useEffect(() => {
    if (active) history.replaceState(null, '', `#/qa/ai/${activeId}`); // 重新整理後回到同一段對話
  }, [active, activeId]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(reload, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, reload]);

  const open = (id: string) => {
    setActiveId(id);
    setShowList(false);
  };
  const startNew = () => {
    history.replaceState(null, '', '#/qa/ai');
    open(newChatId());
  };

  const startRename = (item: AiThreadSummary) => {
    renameDone.current = false;
    setRenaming({ id: item.id, title: item.title });
  };
  const commitRename = async (item: AiThreadSummary) => {
    if (renameDone.current || !renaming) return;
    renameDone.current = true;
    const title = renaming.title.trim();
    setRenaming(null);
    if (!title || title === item.title) return;
    setItems((all) => all.map((row) => (row.id === item.id ? { ...row, title } : row)));
    const response = await aiThreadRename(targetOf(item), title).catch(() => null);
    if (!response?.ok) alert('改標題失敗，請稍後再試。');
    reload();
  };
  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>, item: AiThreadSummary) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) void commitRename(item);
    if (event.key === 'Escape') {
      renameDone.current = true;
      setRenaming(null);
    }
  };

  const remove = async (item: AiThreadSummary) => {
    if (!confirm(`確定刪除「${item.title}」？\n整段對話與圖片會一併刪除，無法復原。`)) return;
    const response = await aiThreadDelete(targetOf(item)).catch(() => null);
    if (!response?.ok) {
      alert('刪除失敗，請稍後再試。');
      return;
    }
    setItems((all) => all.filter((row) => row.id !== item.id));
    if (item.id === activeId) startNew();
    reload();
  };

  const target = active ? targetOf(active) : { thread_id: activeId };

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[30rem] overflow-hidden rounded-lg border border-border bg-card">
      <aside className={cn('w-full shrink-0 flex-col border-r border-border md:flex md:w-64', showList ? 'flex' : 'hidden')}>
        <div className="p-3">
          <Button variant="outline" className="w-full" onClick={startNew}><Plus className="mr-1 h-4 w-4" />新對話</Button>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {loaded && items.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">還沒有對話</p>}
          {items.map((item) => {
            const Icon = item.attempt_id != null ? FileQuestion : MessageSquare;
            if (renaming?.id === item.id) {
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-md bg-secondary px-2 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    autoFocus
                    aria-label="對話標題"
                    maxLength={TITLE_MAX_CHARS}
                    value={renaming.title}
                    onChange={(event) => setRenaming({ id: item.id, title: event.target.value })}
                    onKeyDown={(event) => onRenameKey(event, item)}
                    onBlur={() => void commitRename(item)}
                    className="h-8 text-sm"
                  />
                </div>
              );
            }
            return (
              <div key={item.id} className={cn('group flex items-start rounded-md transition-colors', item.id === activeId ? 'bg-secondary' : 'hover:bg-secondary/50')}>
                <button
                  aria-current={item.id === activeId ? 'page' : undefined}
                  onClick={() => open(item.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtPostTime(item.updated_at)}
                      {item.status === 'failed' && <span className="text-destructive"> · 未完成</span>}
                    </span>
                  </span>
                  {item.status === 'running' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-label="處理中" />}
                </button>
                <div className="flex shrink-0 py-1.5 pr-1 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                  <button type="button" aria-label={`改標題：${item.title}`} title="改標題" onClick={() => startRename(item)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label={`刪除：${item.title}`} title="刪除" onClick={() => void remove(item)} className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col md:flex', showList ? 'hidden' : 'flex')}>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" aria-label="對話紀錄" onClick={() => setShowList(true)}>
            <PanelLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h3 className="truncate font-serif font-bold">{active?.title || '新對話'}</h3>
            <p className="text-xs text-muted-foreground">
              {isQuestion ? 'AI 已經看過這題、你的答案和正解，可以直接問。' : 'AI 看不到你的考卷；想問特定題目，請把題目打出來或傳圖片，或到作答紀錄的該題按「問 AI」。'}
            </p>
          </div>
        </div>
        {loaded && canOpen ? (
          <AiChatPanel
            key={activeId}
            target={target}
            getPdf={isQuestion ? () => questionPdf(active.attempt_id!, active.q_index!) : undefined}
            suggestions={SUGGESTIONS}
            model={model}
            onModelChange={setModel}
            messages={threads[activeId] || []}
            onMessagesChange={(messages) => setThreads((all) => ({ ...all, [activeId]: messages }))}
            onThreadChange={reload}
          />
        ) : (
          <p className="p-5 text-sm text-muted-foreground">載入中…</p>
        )}
      </section>
    </div>
  );
}
