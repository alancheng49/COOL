import { useEffect, useState } from 'react';
import { fetchQuestions, historyDetail, historyList } from '@/lib/api';
import type { AttemptItem, BestItem, KeyInfo, Question, ServerAnswer } from '@/lib/types';
import ReviewList from '@/components/ReviewList';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Scope = 'best' | 'all';

interface Detail {
  attempt: AttemptItem & { answers: ServerAnswer[]; duration_sec?: number | null };
  quiz_meta: { title: string; file: string; pdf_url?: string };
  keys: KeyInfo[];
  questions: Question[] | null;
}

export default function HistoryPage() {
  const [scope, setScope] = useState<Scope>('best');
  const [bests, setBests] = useState<BestItem[]>([]);
  const [alls, setAlls] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    historyList(scope).then((r) => {
      if (r?.ok) {
        if (scope === 'best') setBests(r.items || []);
        else setAlls(r.items || []);
      }
      setLoading(false);
    });
  }, [scope]);

  const openDetail = async (attempt_id: string) => {
    setDetailLoading(true);
    setDetail(null);
    const d = await historyDetail(attempt_id);
    if (d?.ok) {
      const questions = d.quiz_meta?.file ? await fetchQuestions(d.quiz_meta.file) : null;
      setDetail({ attempt: d.attempt, quiz_meta: d.quiz_meta, keys: d.keys || [], questions });
    }
    setDetailLoading(false);
  };

  const fmtTime = (iso: string) =>
    iso ? new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold">作答紀錄</h2>
        </div>
        <div className="flex rounded-md border border-border bg-card p-0.5">
          {(['best', 'all'] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                'rounded px-3 py-1.5 text-sm transition-colors',
                scope === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'best' ? '最佳成績' : '全部紀錄'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        {/* 列表 */}
        <div className="space-y-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
          ) : scope === 'best' ? (
            bests.length === 0 ? (
              <Empty />
            ) : (
              bests.map((b) => (
                <RowCard
                  key={`${b.quiz_id}_${b.quiz_version}`}
                  title={b.title}
                  sub={`更新於 ${fmtTime(b.updated_at)}`}
                  score={`${b.best_score}/${b.best_max}`}
                  onClick={() => b.attempt_id && openDetail(b.attempt_id)}
                />
              ))
            )
          ) : alls.length === 0 ? (
            <Empty />
          ) : (
            alls.map((a) => (
              <RowCard
                key={a.attempt_id}
                title={`${a.quiz_id}${a.quiz_version !== 1 ? `（舊版 v${a.quiz_version}）` : ''}`}
                sub={fmtTime(a.server_received_at)}
                  score={a.grading_status === 'pending' || a.score == null ? '等待批改' : `${a.score}/${a.max_score}`}
                onClick={() => openDetail(a.attempt_id)}
              />
            ))
          )}
        </div>

        {/* 詳情 */}
        <div>
          {detailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">載入詳情中…</p>
          ) : detail ? (
            <div>
              <Card className="mb-4">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <div>
                    <p className="font-serif font-bold">{detail.quiz_meta.title}</p>
                    <p className="text-xs text-muted-foreground">
                      交卷 {fmtTime(detail.attempt.server_received_at)}
                      {detail.attempt.duration_sec != null && `・用時 ${Math.round(detail.attempt.duration_sec / 60)} 分 ${detail.attempt.duration_sec % 60} 秒`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="font-serif text-2xl font-bold text-primary">{detail.attempt.grading_status === 'pending' || detail.attempt.score == null ? '等待批改' : `${detail.attempt.score}/${detail.attempt.max_score}`}</p>
                    {detail.quiz_meta.pdf_url && (
                      <a href={detail.quiz_meta.pdf_url} target="_blank" rel="noopener" className="text-xs text-primary underline">
                        開啟題本 PDF
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
              {detail.attempt.grading_status === 'pending' ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">老師完成簡答題批改後，成績、正解與檢討內容會在這裡公布。</CardContent></Card> : <ReviewList questions={detail.questions} answers={detail.attempt.answers} keys={detail.keys} quizContext={{ quiz_id: detail.attempt.quiz_id, quiz_version: detail.attempt.quiz_version, quiz_title: detail.quiz_meta.title }} attemptId={detail.attempt.attempt_id} pdfUrl={detail.quiz_meta.pdf_url} />}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              ← 點選左側紀錄查看詳情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowCard({ title, sub, score, onClick }: { title: string; sub: string; score: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <span className="shrink-0 font-serif font-bold text-primary">{score}</span>
    </button>
  );
}

function Empty() {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">還沒有任何作答紀錄。</CardContent>
    </Card>
  );
}
