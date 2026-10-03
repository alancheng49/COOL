import { useEffect, useState } from 'react';
import { qaList, qaDetail, qaCreate, qaReply, pingUnread, type QaThread, type QaImage } from '@/lib/api';
import QaComposer from '@/components/QaComposer';
import QaThreadView from '@/components/QaThreadView';
import { fmtPostTime } from '@/pages/admin/Posts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, MessageCircleQuestion, Plus } from 'lucide-react';

export function StatusChip({ status }: { status: 'answered' | 'waiting' }) {
  return status === 'answered' ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">已回覆</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">未回覆</span>
  );
}

export default function StudentQa() {
  const [items, setItems] = useState<QaThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'new' | 'thread'>('list');
  const [thread, setThread] = useState<QaThread | null>(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');

  const reload = () => {
    qaList().then((r) => {
      if (r?.ok) setItems(r.items || []);
      setLoading(false);
    });
  };
  useEffect(reload, []);

  const openThread = async (id: string) => {
    const r = await qaDetail(id);
    if (r?.ok) {
      setThread(r.thread);
      setView('thread');
      reload(); // 未讀點已清掉
    }
  };

  const create = async (content: string, images: QaImage[]): Promise<boolean> => {
    if (!title.trim()) { setErr('請輸入提問標題'); return false; }
    setErr('');
    const r = await qaCreate({ title: title.trim(), content, images });
    if (r?.ok) {
      setTitle('');
      setView('list');
      reload();
      pingUnread();
      return true;
    }
    setErr(r?.error || '送出失敗');
    return false;
  };

  const reply = async (content: string, images: QaImage[]): Promise<boolean> => {
    if (!thread) return false;
    const r = await qaReply({ thread_id: thread.id, content, images });
    if (r?.ok) {
      await openThread(thread.id); // 重新載入討論串
      return true;
    }
    setErr(r?.error === 'IMAGES_TOO_LARGE' ? '圖片超出這串提問的 2MB 額度' : (r?.error || '送出失敗'));
    return false;
  };

  // ---- 討論串 ----
  if (view === 'thread' && thread) {
    return (
      <div className="mx-auto max-w-3xl">
        <button onClick={() => { setView('list'); setThread(null); }} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />回提問列表
        </button>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-serif text-xl font-bold">{thread.title}</h2>
          {thread.context && <p className="text-sm text-primary">來源：{thread.context.quiz_title || thread.context.quiz_id}{thread.context.quiz_version !== 1 ? `（舊版 v${thread.context.quiz_version}）` : ''}・第 {thread.context.question_index + 1} 題</p>}
          <StatusChip status={thread.status} />
        </div>
        <QaThreadView messages={thread.messages || []} />
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-sm font-semibold">追問 / 補充</p>
          {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
          <QaComposer budgetUsed={thread.images_bytes} submitLabel="送出追問" onSubmit={reply} />
        </div>
      </div>
    );
  }

  // ---- 新增提問 ----
  if (view === 'new') {
    return (
      <div className="mx-auto max-w-3xl">
        <button onClick={() => setView('list')} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />回提問列表
        </button>
        <h2 className="mb-4 font-serif text-xl font-bold">新增提問</h2>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="提問標題（例：第 3 題的第二小題怎麼列式？）" />
          <p className="text-xs text-muted-foreground">
            不會打數學式沒關係——按下方「數學輸入器」，就能像計算機一樣點選分數、根號、次方，系統會自動轉成數學式。
          </p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <QaComposer budgetUsed={0} submitLabel="送出提問" onSubmit={create} />
        </div>
      </div>
    );
  }

  // ---- 列表 ----
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">提問</h2>
          <p className="text-sm text-muted-foreground">向老師提出問題，收到回覆後可以繼續追問。</p>
        </div>
        <Button onClick={() => { setErr(''); setView('new'); }}>
          <Plus className="mr-1 h-4 w-4" />新增提問
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-muted-foreground">載入中…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <MessageCircleQuestion className="h-8 w-8" />
          <p>還沒有提問，點右上角「新增提問」開始。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Card key={t.id} className="cursor-pointer transition-colors hover:bg-secondary/50" onClick={() => void openThread(t.id)}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" title="有未讀回覆" />}
                    <p className="truncate font-semibold">{t.title}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.message_count} 則訊息 · 最後更新 {fmtPostTime(t.updated_at)}
                  </p>
                </div>
                <StatusChip status={t.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
