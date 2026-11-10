import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/App';
import { historyList, startQuiz } from '@/lib/api';
import type { AttemptItem } from '@/lib/types';
import MarkdownMath from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
import { CalendarClock, ChevronLeft, Clock, RotateCcw } from 'lucide-react';

function formatDue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('zh-TW', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function QuizInfoPage({ routeKey }: { routeKey: string }) {
  const { session } = useSession();
  const [, , quizIdRaw, versionRaw] = routeKey.split('/');
  const quizId = decodeURIComponent(quizIdRaw || '');
  const version = Number(versionRaw || 1);
  const quiz = useMemo(
    () => session?.quizzes.find((item) => item.id === quizId && item.version === version),
    [session, quizId, version]
  );
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    let active = true;
    historyList('all').then((response) => {
      if (active && response?.ok) setAttempts(response.items || []);
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!quiz) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <BackButton />
        <div className="py-20 text-center">
          <h2 className="font-serif text-xl font-bold">找不到這份考卷</h2>
          <p className="mt-2 text-sm text-muted-foreground">考卷可能已被取消指派或關閉。</p>
        </div>
      </div>
    );
  }

  const used = attempts.filter((attempt) => attempt.quiz_id === quiz.id && attempt.quiz_version === quiz.version).length;
  const limit = quiz.attempt_limit ?? null;
  const notOpen = quiz.available_at ? new Date(quiz.available_at).getTime() > now : false;
  const overdue = quiz.due_at ? new Date(quiz.due_at).getTime() < now : false;
  const noMore = limit != null && limit > 0 && used >= limit;
  const available = formatDue(quiz.available_at);
  const due = formatDue(quiz.due_at);
  const disabled = notOpen || loading || overdue || noMore;
  const buttonText = notOpen ? '尚未開放' : loading ? '確認作答資格中…' : overdue ? '已超過截止時間' : noMore ? '作答次數已用完' : starting ? '準備作答中…' : '開始作答';

  const begin = async () => {
    setStarting(true);
    setStartError('');
    const response = await startQuiz(quiz.id, quiz.version);
    setStarting(false);
    if (response?.ok && !response.auto_submitted) {
      location.hash = `/quiz/${encodeURIComponent(quiz.id)}/${quiz.version}`;
      return;
    }
    if (response?.auto_submitted) {
      location.hash = '/history';
      return;
    }
    const messages: Record<string, string> = {
      ASSIGNMENT_NOT_STARTED: '這份測驗尚未開放。',
      PAST_DUE: '已超過截止時間。',
      ATTEMPT_LIMIT_REACHED: '作答次數已用完。',
      NOT_ASSIGNED: '這份測驗已取消派遣。',
      QUIZ_INACTIVE: '這份測驗已關閉。',
    };
    setStartError(messages[response?.error] || '無法開始作答，請稍後再試。');
  };

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <div className="mb-8"><BackButton /></div>

      <header className="border-b border-border pb-6">
        <p className="mb-2 text-sm font-medium text-primary">說明</p>
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">{quiz.name}</h1>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{quiz.time_limit_minutes > 0 ? `限時 ${quiz.time_limit_minutes} 分鐘` : '不限時'}</span>
          {available && <span className={`flex items-center gap-1.5 ${notOpen ? 'text-primary' : ''}`}><CalendarClock className="h-4 w-4" />開放 {available}</span>}
          {due && <span className={`flex items-center gap-1.5 ${overdue ? 'text-destructive' : ''}`}><CalendarClock className="h-4 w-4" />截止 {due}</span>}
          {limit != null && limit > 0 && <span className="flex items-center gap-1.5"><RotateCcw className="h-4 w-4" />已作答 {used} / {limit} 次</span>}
        </div>
      </header>

      <section className="min-h-48 py-8">
        {quiz.description
          ? <MarkdownMath md={quiz.description} className="leading-7" />
          : <p className="text-sm text-muted-foreground">無說明</p>}
      </section>

      <div className="border-t border-border pt-6">
        <p className="mb-5 text-sm leading-6 text-muted-foreground">
          有限時的測驗從按下開始後立即計時。離開頁面不會暫停，時間到會使用最後儲存的答案自動交卷。
        </p>
        {startError && <p className="mb-3 text-sm text-destructive">{startError}</p>}
        <Button size="lg" className="w-full sm:w-auto sm:min-w-44" disabled={disabled || starting} onClick={() => void begin()}>
          {buttonText}
        </Button>
      </div>
    </div>
  );
}

function BackButton() {
  return (
    <button type="button" title="返回測驗列表" aria-label="返回測驗列表" onClick={() => (location.hash = '/')} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:h-9 md:w-9">
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}
