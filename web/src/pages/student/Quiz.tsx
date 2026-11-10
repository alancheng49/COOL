import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/App';
import { adminQuizDetail, fetchQuestions, getDraft, saveDraft, startQuiz, submitAttempt } from '@/lib/api';
import type { GroupAnswerValue, KeyInfo, Question, ServerAnswer, ServerPartAnswer, ShortAnswerValue, SubQuestion, UserAnswer } from '@/lib/types';
import QuestionStem from '@/components/QuestionStem';
import AnswerArea from '@/components/AnswerArea';
import ReviewList from '@/components/ReviewList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlarmClock, ChevronLeft, ChevronRight, CloudUpload, Check, HelpCircle } from 'lucide-react';
import HelpModal from '@/components/HelpModal';
import PdfViewer from '@/components/PdfViewer';

const ERR_MSG: Record<string, string> = {
  TIME_LIMIT_EXCEEDED: '作答時間已到，系統會以最後儲存的答案交卷；請回作答紀錄查看。',
  ATTEMPT_LIMIT_REACHED: '作答次數已達上限。',
  PAST_DUE: '已超過截止時間。',
  NOT_ASSIGNED: '此測驗未指派給你。',
  ASSIGNMENT_NOT_STARTED: '這份測驗尚未開放。',
  QUIZ_INACTIVE: '此測驗已被老師關閉。',
  UNAUTHENTICATED: '登入已過期，請重新登入。',
};

const QUESTION_TYPE_LABEL: Record<string, string> = {
  choice: '單選題',
  multi: '多選題',
  cloze: '填充題',
  short_answer: '簡答題',
  group: '題組',
};

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function displayedQuestionPoints(question: Question) {
  const direct = Number(question.points);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parts = question.question_type === 'group' ? question.group_questions : question.sub_questions;
  if (!parts?.length) return null;
  const total = parts.reduce((sum, part) => sum + (Number(part.points) || 0), 0);
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

function toServerAnswers(questions: Question[], answers: UserAnswer[]): ServerAnswer[] {
  return questions.map((q, i) => {
    const t = (q.question_type || '').toLowerCase();
    if (t === 'short_answer') {
      const answer = answers[i] as ShortAnswerValue | undefined;
      return { q_index: i, short_text: answer?.text || '', short_images: answer?.images || [] };
    }
    if (t === 'group') {
      const answer = answers[i] as GroupAnswerValue | undefined;
      return { q_index: i, group_answers: (q.group_questions || []).map((part, partIndex) => toServerPart(part, answer?.parts?.[partIndex])) };
    }
    if (t === 'cloze' && Array.isArray(q.sub_questions) && q.sub_questions.length) {
      const nested = Array.isArray(answers[i]) ? (answers[i] as (number | undefined)[][]) : [];
      return {
        q_index: i,
        sub_answers: q.sub_questions.map((_, si) =>
          (Array.isArray(nested[si]) ? nested[si] : []).map((v) => (v === undefined ? null : v))
        ),
      };
    }
    if (t === 'cloze' || t === 'multi') {
      return { q_index: i, selected_indices: (Array.isArray(answers[i]) ? answers[i] : []) as number[] };
    }
    return { q_index: i, selected_index: answers[i] as number | undefined };
  });
}

function toServerPart(part: SubQuestion, answer: UserAnswer): ServerPartAnswer {
  const type = part.question_type || 'cloze';
  if (type === 'short_answer') {
    const value = answer as ShortAnswerValue | undefined;
    return { short_text: value?.text || '', short_images: value?.images || [] };
  }
  if (type === 'choice') return { selected_index: answer == null ? null : Number(answer) };
  return { selected_indices: (Array.isArray(answer) ? answer : []).map((value) => value === undefined ? null : Number(value)) };
}

function fromServerPart(part: SubQuestion, answer?: ServerPartAnswer): UserAnswer {
  const type = part.question_type || 'cloze';
  if (type === 'short_answer') return { text: answer?.short_text || '', images: answer?.short_images || [] };
  if (type === 'choice') return answer?.selected_index == null ? undefined : answer.selected_index;
  return (answer?.selected_indices || []).map((value) => value == null ? undefined : value);
}

export default function QuizPage({ routeKey }: { routeKey: string }) {
  const { session } = useSession();
  const [, , quizIdRaw, verRaw, previewFlag] = routeKey.split('/');
  const quizId = decodeURIComponent(quizIdRaw || '');
  const version = Number(verRaw || 1);
  // 老師預覽模式：/quiz/:id/:ver/preview（不存草稿、不能交卷、不計時）
  const isPreview = previewFlag === 'preview' && (session?.role || '').toLowerCase() === 'admin';
  const [previewMeta, setPreviewMeta] = useState<{ name: string; file: string; time_limit_minutes: number; pdf_url?: string } | null>(null);
  const sessionMeta = useMemo(
    () => session?.quizzes.find((q) => q.id === quizId && q.version === version),
    [session, quizId, version]
  );
  const quizMeta = sessionMeta || (previewMeta ? { id: quizId, version, ...previewMeta } : undefined);
  const pdfUrl = (quizMeta as { pdf_url?: string } | undefined)?.pdf_url || '';
  const isPdf = !!pdfUrl;

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [cur, setCur] = useState(0);
  const [resumeAsk, setResumeAsk] = useState<null | { answers: ServerAnswer[]; current_index: number }>(null);
  const [remainSec, setRemainSec] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { score: number | null; max: number; keys: KeyInfo[]; answers: ServerAnswer[]; grading_status?: string; auto_submitted?: boolean; attempt_id?: string }>(null);
  const [submitErr, setSubmitErr] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null); // 絕對截止時刻
  const [expired] = useState(false);

  const startedAtRef = useRef(new Date().toISOString());
  const answersRef = useRef<UserAnswer[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const submittedRef = useRef(false);

  // 載入題目 + 草稿（預覽模式：改抓 admin 題目資料，不讀草稿）
  useEffect(() => {
    let alive = true;
    (async () => {
      let file = sessionMeta?.file || '';
      let pointRows: { q_index: number; points: number }[] = [];
      let startResponse: Awaited<ReturnType<typeof startQuiz>> = null;
      if (isPreview) {
        const d = await adminQuizDetail(quizId, version);
        if (!alive) return;
        if (d?.ok) {
          file = d.meta.file;
          pointRows = (d.keys || []).map((key: { q_index: number; points: number }) => ({
            q_index: Number(key.q_index),
            points: Number(key.points),
          }));
          setPreviewMeta({ name: d.meta.title, file: d.meta.file, time_limit_minutes: d.meta.time_limit_minutes || 0, pdf_url: d.meta.pdf_url || '' });
        }
      } else {
        startResponse = await startQuiz(quizId, version);
        if (!alive) return;
        if (!startResponse?.ok) {
          setLoadErr(ERR_MSG[startResponse?.error] || `無法開始作答：${startResponse?.error || '連線錯誤'}`);
          return;
        }
        if (startResponse.auto_submitted && startResponse.result?.ok) {
          setResult({
            score: startResponse.result.score,
            max: startResponse.result.max_score,
            keys: startResponse.result.results || [],
            answers: startResponse.result.answers || [],
            grading_status: startResponse.result.grading_status,
            attempt_id: startResponse.result.attempt_id,
            auto_submitted: true,
          });
        }
        pointRows = Array.isArray(startResponse.question_points) ? startResponse.question_points : [];
        if (startResponse.started_at) startedAtRef.current = startResponse.started_at;
      }
      const [qs, draftRes] = await Promise.all([
        file ? fetchQuestions(file) : Promise.resolve(null),
        isPreview ? Promise.resolve(null) : getDraft(quizId, version),
      ]);
      if (!alive) return;
      if (!qs || !qs.length) {
        setLoadErr('無法載入題目檔，請回上一頁重試或通知老師。');
        return;
      }
      const pointsByIndex = new Map(pointRows.map((row) => [Number(row.q_index), Number(row.points)]));
      const questionsWithPoints = qs.map((question, index) => {
        const authoritativePoints = pointsByIndex.get(index);
        return Number.isFinite(authoritativePoints) && Number(authoritativePoints) > 0
          ? { ...question, points: authoritativePoints }
          : question;
      });
      setQuestions(questionsWithPoints);
      const emptyAnswers = new Array(qs.length).fill(undefined);
      answersRef.current = emptyAnswers;
      setAnswers(emptyAnswers);

      if (draftRes?.auto_submitted && draftRes.result?.ok) {
        setResult({
          score: draftRes.result.score,
          max: draftRes.result.max_score,
          keys: draftRes.result.results || [],
          answers: draftRes.result.answers || [],
          grading_status: draftRes.result.grading_status,
          attempt_id: draftRes.result.attempt_id,
          auto_submitted: true,
        });
        return;
      }

      const d = draftRes?.ok ? draftRes.draft : null;
      const limitSec = (sessionMeta?.time_limit_minutes || 0) * 60;
      const startedIso = d?.started_at || startResponse?.started_at || new Date().toISOString();
      startedAtRef.current = startedIso;

      // 作答時限與派遣截止時間取較早者，中離後仍照常計時。
      if (!isPreview) {
        const deadlines = [];
        if (limitSec > 0) deadlines.push(new Date(startedIso).getTime() + limitSec * 1000);
        const dueAt = sessionMeta?.due_at ? new Date(sessionMeta.due_at).getTime() : NaN;
        if (!Number.isNaN(dueAt)) deadlines.push(dueAt);
        if (deadlines.length) setDeadlineMs(Math.min(...deadlines));
      }

      if (d && Array.isArray(d.answers) && d.answers.some((a: ServerAnswer) =>
        a.selected_index != null ||
        (a.selected_indices || []).some((v: number | null) => v != null) ||
        (a.sub_answers || []).some((sa) => (sa || []).some((v) => v != null))
      )) {
        setResumeAsk({ answers: d.answers, current_index: d.current_index || 0 });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, version]);

  // 計時器（絕對制：截止時刻在第一次開始作答時就決定，中離不暫停）
  useEffect(() => {
    if (!deadlineMs || !questions || isPreview) return;
    setRemainSec(Math.max(0, Math.round((deadlineMs - Date.now()) / 1000)));
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
      setRemainSec(left);
      if (left <= 0) {
        clearInterval(t);
        void doSubmit(true);
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, deadlineMs]);

  // 關閉/重新整理分頁時跳出瀏覽器警告（作答中才啟用）
  useEffect(() => {
    if (isPreview || !questions || result || expired) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // 觸發瀏覽器原生「確定要離開嗎」提示
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isPreview, questions, result, expired]);

  // 自動儲存草稿(debounce)
  const scheduleSave = useCallback(
    (nextAnswers: UserAnswer[], curIdx: number) => {
      if (!questions || submittedRef.current || isPreview) return;
      clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(async () => {
        const r = await saveDraft({
          quiz_id: quizId,
          quiz_version: version,
          answers: toServerAnswers(questions, nextAnswers),
          current_index: curIdx,
          started_at: startedAtRef.current,
        });
        setSaveState(r?.ok ? 'saved' : 'idle');
      }, 1200);
    },
    [questions, quizId, version, isPreview]
  );

  const setAnswer = (v: UserAnswer) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[cur] = v;
      answersRef.current = next;
      scheduleSave(next, cur);
      return next;
    });
  };

  const answered = (i: number) => {
    const a = answers[i];
    const q = questions?.[i];
    // 小題制填充:每個小題的每格都要作答
    if (q && (q.question_type || '').toLowerCase() === 'cloze' && Array.isArray(q.sub_questions) && q.sub_questions.length) {
      const nested = Array.isArray(a) ? (a as (number | undefined)[][]) : [];
      return q.sub_questions.every((sub, si) => {
        const sets = sub.cloze_options || [];
        const sa = nested[si];
        return Array.isArray(sa) && sets.length > 0 && sets.every((_, bi) => sa[bi] !== undefined && sa[bi] !== null);
      });
    }
    if (q?.question_type === 'short_answer') {
      const value = a as ShortAnswerValue | undefined;
      return !!(value?.text.trim() || value?.images.length);
    }
    if (q?.question_type === 'group') {
      const value = a as GroupAnswerValue | undefined;
      return (q.group_questions || []).every((part, index) => {
        const partAnswer = value?.parts?.[index];
        if (part.question_type === 'short_answer') {
          const short = partAnswer as ShortAnswerValue | undefined;
          return !!(short?.text.trim() || short?.images.length);
        }
        if (Array.isArray(partAnswer)) return partAnswer.length > 0 && partAnswer.every((item) => item !== undefined);
        return partAnswer !== undefined;
      });
    }
    if (Array.isArray(a)) return a.length > 0 && a.every((v) => v !== undefined);
    return a !== undefined;
  };

  async function doSubmit(auto = false) {
    if (!questions || submittedRef.current || isPreview) return;
    const un = questions.map((_, i) => i).filter((i) => !answered(i));
    if (!auto && un.length > 0) {
      const okGo = confirm(`還有 ${un.length} 題未作答（第 ${un.map((i) => i + 1).join('、')} 題），確定要交卷嗎？`);
      if (!okGo) return;
    }
    submittedRef.current = true;
    clearTimeout(saveTimer.current);
    setSubmitting(true);
    setSubmitErr('');

    const serverAnswers = toServerAnswers(questions, answersRef.current);
    const res = await submitAttempt({
      account: session!.account,
      quiz_id: quizId,
      quiz_version: version,
      answers: serverAnswers,
      client_started_at: startedAtRef.current,
      client_submitted_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
    });
    setSubmitting(false);

    if (res?.ok) {
      setResult({ score: res.score, max: res.max_score, keys: res.results || [], answers: serverAnswers, grading_status: res.grading_status, attempt_id: res.attempt_id });
    } else {
      submittedRef.current = false;
      setSubmitErr(ERR_MSG[res?.error] || `交卷失敗：${res?.error || '連線錯誤'}，可再試一次。`);
    }
  }

  // ===== 畫面 =====
  if (loadErr) {
    return (
      <Centered>
        <p className="text-destructive">{loadErr}</p>
        <Button variant="outline" onClick={() => (location.hash = '/')}>回測驗列表</Button>
      </Centered>
    );
  }
  if (expired) {
    return (
      <Centered>
        <p className="font-serif text-xl font-bold text-destructive">作答時間已到</p>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          你上次開始作答後未在時限內交卷，本次作答不計分。
          若還有作答次數，可回列表重新開始（計時將重新起算）。
        </p>
        <Button onClick={() => (location.hash = '/')}>回測驗列表</Button>
      </Centered>
    );
  }
  if (!questions) {
    return <Centered><p className="text-muted-foreground">題目載入中…</p></Centered>;
  }

  // 交卷後：成績 + 檢討
  if (result) {
    const pending = result.grading_status === 'pending' || result.score == null;
    const pct = !pending && result.max > 0 ? (((result.score || 0) / result.max) * 100).toFixed(1) : '0';
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Card className="mb-6 border-primary/30">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">{quizMeta?.name || quizId}</p>
              <p className="mt-1 font-serif text-3xl font-bold text-primary">
                {pending ? '等待老師批改' : `${result.score} / ${result.max} 分`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{pending ? '含簡答題的作答在老師完成批改前不公布成績與正解。' : `得分率 ${pct}%`}</p>
              {result.auto_submitted && <p className="mt-1 text-xs text-muted-foreground">作答時間到時，系統已使用最後儲存的答案自動交卷。</p>}
            </CardContent>
          </Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold">作答檢討</h3>
            {isPdf && (
              <a href={pdfUrl} target="_blank" rel="noopener" className="text-sm text-primary underline">
                開啟題本 PDF
              </a>
            )}
          </div>
          {!pending && <ReviewList questions={questions} answers={result.answers} keys={result.keys} quizContext={{ quiz_id: quizId, quiz_version: version, quiz_title: quizMeta?.name || quizId }} attemptId={result.attempt_id} pdfUrl={pdfUrl} />}
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => (location.hash = '/history')}>查看作答紀錄</Button>
            <Button onClick={() => (location.hash = '/')}>回測驗列表</Button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[cur];
  const currentPoints = displayedQuestionPoints(q);
  const currentTypeLabel = QUESTION_TYPE_LABEL[(q.question_type || '').toLowerCase()] || '題目';
  const timeWarn = remainSec != null && remainSec <= 60;

  return (
    <div className="min-h-screen bg-background">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {/* 續答詢問 */}
      {resumeAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-4 py-6">
              <p className="font-medium">偵測到上次未完成的作答進度，要繼續嗎？</p>
              <p className="text-sm text-muted-foreground">
                （注意：計時不會暫停，剩餘時間以你第一次開始作答起算；「重新開始」只清除答案，不會重置時間）
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    const restored: UserAnswer[] = questions.map((qq, i) => {
                      const d = resumeAsk.answers.find((a) => a.q_index === i);
                      if (!d) return undefined;
                      const t = (qq.question_type || '').toLowerCase();
                      if (t === 'short_answer') return { text: d.short_text || '', images: d.short_images || [] };
                      if (t === 'group') return { parts: (qq.group_questions || []).map((part, partIndex) => fromServerPart(part, d.group_answers?.[partIndex])) };
                      if (t === 'cloze' && Array.isArray(qq.sub_questions) && qq.sub_questions.length) {
                        const subs = d.sub_answers || [];
                        return qq.sub_questions.map((_, si) =>
                          (subs[si] || []).map((v) => (v === null ? undefined : v))
                        );
                      }
                      return t === 'cloze' || t === 'multi'
                        ? (d.selected_indices as (number | undefined)[]) ?? undefined
                        : (d.selected_index as number | undefined);
                    });
                    answersRef.current = restored;
                    setAnswers(restored);
                    setCur(Math.min(resumeAsk.current_index, questions.length - 1));
                    setResumeAsk(null);
                  }}
                >
                  繼續上次進度
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setResumeAsk(null)}>
                  重新開始
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 頂欄 */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex w-full flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="truncate font-serif font-bold">{quizMeta?.name || quizId}</p>
            <p className="truncate text-xs text-muted-foreground">
              {session?.display_name}・第 {cur + 1} / {questions.length} 題
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {isPreview && (
              <span className="mr-auto rounded bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground sm:mr-0">
                老師預覽模式
              </span>
            )}
            <span role="status" className="mr-auto flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground sm:mr-0">
              {saveState === 'saving' ? (
                <><CloudUpload className="h-3.5 w-3.5 animate-pulse" />儲存中</>
              ) : saveState === 'saved' ? (
                <><Check className="h-3.5 w-3.5 text-emerald-600" />已儲存</>
              ) : null}
            </span>
            <button
              type="button"
              title="作答說明"
              aria-label="作答說明"
              onClick={() => setShowHelp(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            {remainSec != null && (
              <span
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-sm font-semibold',
                  timeWarn ? 'bg-destructive text-destructive-foreground' : 'bg-secondary'
                )}
              >
                <AlarmClock className="h-4 w-4" />
                {Math.floor(remainSec / 60)}:{String(remainSec % 60).padStart(2, '0')}
              </span>
            )}
            {isPreview ? (
              <Button size="sm" variant="outline" onClick={() => (location.hash = '/admin')}>
                離開預覽
              </Button>
            ) : (
              <Button size="sm" onClick={() => doSubmit(false)} disabled={submitting}>
                {submitting ? '交卷中…' : '交卷'}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className={`mx-auto flex gap-5 px-4 py-5 ${isPdf ? 'max-w-[1700px]' : 'max-w-5xl'}`}>
        {/* 題號側欄 */}
        <aside className="hidden w-40 shrink-0 sm:block">
          <div className="sticky top-20 grid grid-cols-4 gap-1.5">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCur(i)}
                className={cn(
                  'flex h-9 items-center justify-center rounded border text-sm transition-colors',
                  i === cur
                    ? 'border-primary bg-primary text-primary-foreground'
                    : answered(i)
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                      : 'border-border bg-card hover:border-primary/50'
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </aside>

        {/* 題目主體（PDF 模式:左作答右題本） */}
        <div className={`min-w-0 flex-1 ${isPdf ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-2' : ''}`}>
          {isPdf && (
            <div className="order-first min-w-0 lg:order-last lg:sticky lg:top-20">
              <PdfViewer url={pdfUrl} region={q.pdf_region} focusKey={cur} className="h-[45dvh] sm:h-[60vh] lg:h-[calc(100vh-6.5rem)]" />
            </div>
          )}
          <div className="min-w-0">
          {submitErr && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {submitErr}
            </div>
          )}
          <Card>
            <CardContent className="space-y-5 px-4 py-5 sm:px-6">
              <div className="flex min-h-7 items-center justify-between gap-3 border-b border-border/70 pb-3">
                <span className="font-serif text-sm font-bold text-primary">第 {cur + 1} 題</span>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{currentTypeLabel}</span>
                  <span aria-hidden="true" className="h-3.5 w-px bg-border" />
                  <span className="font-semibold tabular-nums text-foreground">
                    {currentPoints == null ? '配分未設定' : `${formatPoints(currentPoints)} 分`}
                  </span>
                </div>
              </div>
              {!(isPdf && !q.question_content && !q.question_image) && <QuestionStem q={q} index={cur} />}
              {isPdf && !q.question_content && (
                <p className="text-sm text-muted-foreground">請對照 PDF 題本第 {cur + 1} 題作答。</p>
              )}
              <AnswerArea key={cur} q={q} value={answers[cur]} onChange={setAnswer} />
            </CardContent>
          </Card>
          <div className="sticky bottom-0 z-20 -mx-4 mt-4 flex items-center justify-between gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
            <Button className="gap-1 px-2 sm:px-4" variant="outline" disabled={cur === 0} onClick={() => setCur((c) => c - 1)}>
              <ChevronLeft className="h-4 w-4" />上一題
            </Button>
            {/* 手機版題號 */}
            <select aria-label="跳至題目" value={cur} onChange={(event) => setCur(Number(event.target.value))} className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-center sm:hidden">
              {questions.map((_, index) => <option key={index} value={index}>第 {index + 1} 題{answered(index) ? ' · 已答' : ''}</option>)}
            </select>
            <Button
              className="gap-1 px-2 sm:px-4"
              variant="outline"
              disabled={cur === questions.length - 1}
              onClick={() => setCur((c) => c + 1)}
            >
              下一題<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      {children}
    </div>
  );
}
