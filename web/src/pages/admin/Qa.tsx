import { useEffect, useMemo, useState } from 'react';
import { adminQuizDetail, qaList, qaDetail, qaReply, qaDeleteThread, pingUnread, type QaThread, type QaImage } from '@/lib/api';
import type { Question } from '@/lib/types';
import QaComposer from '@/components/QaComposer';
import QaThreadView from '@/components/QaThreadView';
import QuestionStem from '@/components/QuestionStem';
import AnswerArea from '@/components/AnswerArea';
import { StatusChip } from '@/pages/student/Qa';
import { fmtPostTime } from '@/pages/admin/Posts';
import UserHoverCard from '@/components/UserHoverCard';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Inbox, Loader2, Trash2, X } from 'lucide-react';

type Tab = 'waiting' | 'answered';

export default function AdminQa() {
  const [items, setItems] = useState<QaThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('waiting');
  const [thread, setThread] = useState<QaThread | null>(null);
  const [err, setErr] = useState('');
  const [sourceQuestion, setSourceQuestion] = useState<Question | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);

  const reload = () => {
    qaList().then((r) => {
      if (r?.ok) setItems(r.items || []);
      setLoading(false);
    });
  };
  useEffect(reload, []);

  const grouped = useMemo(
    () => ({
      waiting: items.filter((t) => t.status === 'waiting'),
      answered: items.filter((t) => t.status === 'answered'),
    }),
    [items]
  );

  const openThread = async (id: string) => {
    setSourceQuestion(null);
    setSourceError('');
    setSourceOpen(false);
    const r = await qaDetail(id);
    if (r?.ok) {
      setThread(r.thread);
      reload();
    }
  };

  const openSourceQuestion = async () => {
    if (!thread?.context) return;
    if (sourceQuestion) {
      setSourceOpen(true);
      return;
    }
    setSourceOpen(true);
    setSourceLoading(true);
    setSourceError('');
    const result = await adminQuizDetail(thread.context.quiz_id, thread.context.quiz_version);
    const question = result?.ok && Array.isArray(result.questions)
      ? result.questions[thread.context.question_index] as Question | undefined
      : undefined;
    if (question) setSourceQuestion(question);
    else setSourceError(result?.ok ? '找不到這一題，題目可能已被修改或移除。' : `題目載入失敗：${result?.error || '連線錯誤'}`);
    setSourceLoading(false);
  };

  const reply = async (content: string, images: QaImage[]): Promise<boolean> => {
    if (!thread) return false;
    const r = await qaReply({ thread_id: thread.id, content, images });
    if (r?.ok) {
      await openThread(thread.id);
      pingUnread();
      return true;
    }
    setErr(r?.error === 'IMAGES_TOO_LARGE' ? '圖片超出這串提問的 2MB 額度' : (r?.error || '送出失敗'));
    return false;
  };

  const del = async (t: QaThread) => {
    if (!confirm(`確定刪除「${t.display_name}」的提問「${t.title}」？\n整串對話與圖片會一併刪除，無法復原。`)) return;
    const r = await qaDeleteThread(t.id);
    if (r?.ok) {
      if (thread?.id === t.id) setThread(null);
      reload();
    }
  };

  // ---- 討論串 ----
  if (thread) {
    return (
      <div className="mx-auto max-w-3xl">
        <button onClick={() => setThread(null)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />回提問列表
        </button>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-serif text-xl font-bold">{thread.title}</h2>
          <StatusChip status={thread.status} />
        </div>
        {thread.context && (
          <p className="mb-2 text-sm text-muted-foreground">
            來源：
            <button type="button" onClick={() => void openSourceQuestion()} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
              {thread.context.quiz_title || thread.context.quiz_id}{thread.context.quiz_version !== 1 ? `（舊版 v${thread.context.quiz_version}）` : ''}・第 {thread.context.question_index + 1} 題
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </p>
        )}
        <p className="mb-4 text-sm text-muted-foreground">
          提問者：<UserHoverCard account={thread.account} /> · {fmtPostTime(thread.created_at)}
        </p>
        {sourceOpen && (
          <section className="mb-5 border-y border-border py-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-serif font-bold">第 {thread.context!.question_index + 1} 題</h3>
              <button type="button" title="收起題目" aria-label="收起題目" onClick={() => setSourceOpen(false)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            {sourceLoading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />載入題目中…</p>
            ) : sourceError ? (
              <p className="py-4 text-sm text-destructive">{sourceError}</p>
            ) : sourceQuestion ? (
              <div className="space-y-5">
                <QuestionStem q={sourceQuestion} index={thread.context!.question_index} />
                <AnswerArea q={sourceQuestion} value={undefined} onChange={() => {}} disabled />
              </div>
            ) : null}
          </section>
        )}
        <QaThreadView messages={thread.messages || []} />
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-sm font-semibold">回覆學生</p>
          {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
          <QaComposer budgetUsed={thread.images_bytes} submitLabel="送出回覆" onSubmit={reply} placeholder="回覆內容，支援 Markdown 與 LaTeX（$...$），格式同公告。" />
        </div>
      </div>
    );
  }

  // ---- 列表(兩個標籤頁) ----
  const shown = grouped[tab];
  return (
    <div>
      <div className="mb-4">
        <h2 className="font-serif text-xl font-bold">提問管理</h2>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {([['waiting', '未回覆'], ['answered', '已回覆']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'relative -mb-px rounded-t-md px-4 py-2 text-sm transition-colors',
              tab === k ? 'border border-b-card bg-card font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            <span className={cn('ml-1.5 rounded-full px-1.5 text-xs', k === 'waiting' && grouped.waiting.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
              {grouped[k].length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-muted-foreground">載入中…</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p>{tab === 'waiting' ? '目前沒有待回覆的提問。' : '還沒有已回覆的提問。'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((t) => (
            <Card key={t.id} className="cursor-pointer transition-colors hover:bg-secondary/50" onClick={() => void openThread(t.id)}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" title="有新訊息" />}
                    <p className="truncate font-semibold">{t.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                    <UserHoverCard account={t.account} /> · {t.message_count} 則訊息 · 最後更新 {fmtPostTime(t.updated_at)}
                  </p>
                </div>
                <button
                  title="刪除整串提問"
                  onClick={(e) => { e.stopPropagation(); void del(t); }}
                  className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
