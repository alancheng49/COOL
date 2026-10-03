import { useEffect, useMemo, useState } from 'react';
import { adminGradeAttempt, adminListQuizzes, adminResults, fetchQuestions, historyDetail } from '@/lib/api';
import type { AdminQuizItem, AttemptItem, KeyInfo, Question, ServerAnswer } from '@/lib/types';
import ReviewList, { type ManualGradeTarget } from '@/components/ReviewList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Download, X } from 'lucide-react';
import { backdropClose } from '@/lib/utils';
import UserHoverCard from '@/components/UserHoverCard';

interface Detail {
  attempt: AttemptItem & { answers: ServerAnswer[]; duration_sec?: number | null; account: string };
  quiz_meta: { title: string; file: string; pdf_url?: string };
  keys: KeyInfo[];
  questions: Question[] | null;
}

export default function AdminResults() {
  const [quizzes, setQuizzes] = useState<AdminQuizItem[]>([]);
  const [quizFilter, setQuizFilter] = useState(''); // "quiz_id@@version"
  const [accFilter, setAccFilter] = useState('');
  const [items, setItems] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    adminListQuizzes().then((r) => r?.ok && setQuizzes(r.items || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const [qid, ver] = quizFilter ? quizFilter.split('@@') : ['', ''];
    adminResults({ quiz_id: qid || undefined, quiz_version: ver ? Number(ver) : undefined, account: accFilter || undefined }).then((r) => {
      if (r?.ok) setItems(r.items || []);
      setLoading(false);
    });
  }, [quizFilter, accFilter]);

  const accounts = useMemo(() => {
    const set = new Map<string, string>();
    items.forEach((a) => set.set(a.account!, a.display_name || a.account!));
    return [...set.entries()];
  }, [items]);

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

  const exportCsv = () => {
    const header = ['account', 'display_name', 'quiz_id', 'quiz_version', 'score', 'max_score', 'percent', 'duration_sec', 'submitted_at'];
    const rows = items.map((a) => [
      a.account, a.display_name, a.quiz_id, a.quiz_version, a.score, a.max_score,
      a.score == null ? '' : a.max_score ? ((a.score / a.max_score) * 100).toFixed(1) : '0',
      a.duration_sec ?? '', a.server_received_at,
    ]);
    const csv = '﻿' + [header, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `results_${quizFilter ? quizFilter.replace('@@', '_v') : 'all'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fmtTime = (iso: string) =>
    iso ? new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold">成績總覽</h2>
          <p className="text-sm text-muted-foreground">所有學生的每次作答紀錄，點列可看每題詳情。</p>
        </div>
        <div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <select
            aria-label="篩選測驗"
            className="h-11 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm sm:w-48 md:h-9"
            value={quizFilter}
            onChange={(e) => setQuizFilter(e.target.value)}
          >
            <option value="">全部測驗</option>
            {quizzes.map((q) => (
              <option key={`${q.quiz_id}_${q.quiz_version}`} value={`${q.quiz_id}@@${q.quiz_version}`}>
                {q.title}{q.quiz_version !== 1 ? `（舊版 v${q.quiz_version}）` : ''}
              </option>
            ))}
          </select>
          <select
            aria-label="篩選學生"
            className="h-11 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm sm:w-40 md:h-9"
            value={accFilter}
            onChange={(e) => setAccFilter(e.target.value)}
          >
            <option value="">全部學生</option>
            {accounts.map(([acc, name]) => (
              <option key={acc} value={acc}>{name}({acc})</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length}>
            <Download className="mr-1 h-4 w-4" />匯出 CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">沒有符合條件的作答紀錄。</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <div className="divide-y divide-border md:hidden">
            {items.map((attempt) => (
              <button key={attempt.attempt_id} type="button" onClick={() => void openDetail(attempt.attempt_id)} className="block w-full space-y-2 p-4 text-left transition-colors hover:bg-secondary/40">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words font-semibold">{attempt.display_name || attempt.account}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-primary">{attempt.grading_status === 'pending' || attempt.score == null ? '待批改' : `${attempt.score}/${attempt.max_score}`}</span>
                </div>
                <p className="truncate text-sm" title={attempt.quiz_id}>{quizzes.find((quiz) => quiz.quiz_id === attempt.quiz_id && quiz.quiz_version === attempt.quiz_version)?.title || attempt.quiz_id}{attempt.quiz_version !== 1 ? `（舊版 v${attempt.quiz_version}）` : ''}</p>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{fmtTime(attempt.server_received_at)}</span>
                  <span>用時 {attempt.duration_sec != null ? `${Math.floor(attempt.duration_sec / 60)}:${String(attempt.duration_sec % 60).padStart(2, '0')}` : '未記錄'}{attempt.score != null && attempt.grading_status !== 'pending' ? ` · ${attempt.max_score ? ((attempt.score / attempt.max_score) * 100).toFixed(0) : 0}%` : ''}</span>
                </div>
              </button>
            ))}
          </div>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">學生</th>
                <th className="px-3 py-2.5 font-medium">測驗</th>
                <th className="px-3 py-2.5 font-medium">分數</th>
                <th className="px-3 py-2.5 font-medium">得分率</th>
                <th className="px-3 py-2.5 font-medium">用時</th>
                <th className="px-3 py-2.5 font-medium">交卷時間</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.attempt_id}
                  onClick={() => openDetail(a.attempt_id)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <UserHoverCard account={a.account || ''} />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{a.quiz_id}{a.quiz_version !== 1 ? `（舊版 v${a.quiz_version}）` : ''}</td>
                  <td className="px-3 py-2.5 font-semibold">{a.grading_status === 'pending' || a.score == null ? '待批改' : `${a.score}/${a.max_score}`}</td>
                  <td className="px-3 py-2.5">{a.score == null ? '—' : `${a.max_score ? ((a.score / a.max_score) * 100).toFixed(0) : 0}%`}</td>
                  <td className="px-3 py-2.5">{a.duration_sec != null ? `${Math.floor(a.duration_sec / 60)}:${String(a.duration_sec % 60).padStart(2, '0')}` : '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtTime(a.server_received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 詳情抽屜 */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" {...backdropClose(() => setDetail(null))}>
          <div className="h-full w-full max-w-2xl overflow-y-auto overscroll-contain bg-background p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
            ) : detail ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-lg font-bold">{detail.quiz_meta.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {detail.attempt.account}・{fmtTime(detail.attempt.server_received_at)}・
                      <span className="font-semibold text-primary">{detail.attempt.grading_status === 'pending' || detail.attempt.score == null ? '等待批改' : `${detail.attempt.score}/${detail.attempt.max_score} 分`}</span>
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDetail(null)}><X className="h-4 w-4" /></Button>
                </div>
                {detail.quiz_meta.pdf_url && (
                  <a href={detail.quiz_meta.pdf_url} target="_blank" rel="noopener" className="mb-3 inline-block text-sm text-primary underline">
                    開啟題本 PDF
                  </a>
                )}
                {detail.attempt.grading_status === 'pending'
                  ? <ManualGradingReview detail={detail} onSaved={(score) => { setItems((current) => current.map((item) => item.attempt_id === detail.attempt.attempt_id ? { ...item, score, grading_status: 'graded' } : item)); void openDetail(detail.attempt.attempt_id); }} />
                  : <ReviewList questions={detail.questions} answers={detail.attempt.answers} keys={detail.keys} />}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ManualGradingReview({ detail, onSaved }: { detail: Detail; onSaved: (score: number) => void }) {
  const manual = detail.keys.flatMap((key) => key.type === 'short_answer'
    ? [{ id: `${key.q_index}`, q_index: key.q_index, max: key.points, sub_index: null as number | null }]
    : key.type === 'group' ? (key.subs || []).flatMap((sub, subIndex) => sub.type === 'short_answer' ? [{ id: `${key.q_index}.${subIndex}`, q_index: key.q_index, max: sub.points, sub_index: subIndex }] : []) : []);
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(manual.map((item) => [item.id, ''])));
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const remaining = manual.filter((item) => scores[item.id] === '').length;

  const save = async () => {
    if (manual.some((item) => scores[item.id] === '' || Number(scores[item.id]) < 0 || Number(scores[item.id]) > item.max)) { setMessage('請填完所有簡答題分數，且不可超過配分。'); return; }
    const grouped = new Map<number, { q_index: number; earned?: number; feedback?: string; sub_grades?: { sub_index: number; earned: number; feedback: string }[] }>();
    manual.forEach((item) => {
      const grade = grouped.get(item.q_index) || { q_index: item.q_index };
      if (item.sub_index == null) { grade.earned = Number(scores[item.id]); grade.feedback = feedback[item.id] || ''; }
      else { grade.sub_grades = [...(grade.sub_grades || []), { sub_index: item.sub_index, earned: Number(scores[item.id]), feedback: feedback[item.id] || '' }]; }
      grouped.set(item.q_index, grade);
    });
    setBusy(true); setMessage('');
    const result = await adminGradeAttempt(detail.attempt.attempt_id, [...grouped.values()]);
    setBusy(false);
    if (!result?.ok) { setMessage(result?.error === 'INCOMPLETE_GRADES' ? '尚有簡答小題未評分。' : `儲存失敗：${result?.error || '連線錯誤'}`); return; }
    onSaved(Number(result.score) || 0);
  };

  const gradeControl = (target: ManualGradeTarget) => (
    <div className="border-t border-primary/20 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-primary">本題人工評分</span>
        <span className="text-xs text-muted-foreground">配分 {target.max} 分</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <label className="space-y-1 text-xs font-medium">
          得分
          <div className="flex items-center gap-1 text-sm">
            <Input
              type="number"
              min={0}
              max={target.max}
              step="0.01"
              value={scores[target.id] || ''}
              onChange={(event) => { setScores((current) => ({ ...current, [target.id]: event.target.value })); setMessage(''); }}
            />
            <span className="shrink-0">/ {target.max}</span>
          </div>
        </label>
        <label className="space-y-1 text-xs font-medium">
          給學生的回饋（選填）
          <Textarea rows={2} value={feedback[target.id] || ''} onChange={(event) => setFeedback((current) => ({ ...current, [target.id]: event.target.value }))} />
        </label>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 border-b border-border pb-3">
        <h4 className="font-serif font-bold">待批改題目</h4>
        <p className="text-xs text-muted-foreground">請在各簡答題的學生作答下方評分。</p>
      </div>
      <ReviewList questions={detail.questions} answers={detail.attempt.answers} keys={detail.keys} renderManualGrade={gradeControl} />
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
        <div>
          <p className="text-sm font-medium">{remaining > 0 ? `尚有 ${remaining} 題未評分` : '所有簡答題已完成評分'}</p>
          <p className="text-xs text-muted-foreground">公布後學生才會看到總成績與回饋。</p>
        </div>
        <Button onClick={save} disabled={busy || remaining > 0}>{busy ? '儲存中…' : '完成批改並公布成績'}</Button>
      </div>
      {message && <p className="mt-2 text-sm text-destructive">{message}</p>}
    </div>
  );
}
