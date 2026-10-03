import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/App';
import { historyList, listAvailableQuizzes } from '@/lib/api';
import { getSession as getSavedSession, saveSession } from '@/lib/session';
import type { AttemptItem, QuizInfo } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, CalendarClock, RotateCcw } from 'lucide-react';

function fmtDue(due?: string | null) {
  if (!due) return null;
  const d = new Date(due);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StudentHome() {
  const { session, setSession } = useSession();
  const [quizzes, setQuizzes] = useState<QuizInfo[]>(session?.quizzes || []);
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);

  useEffect(() => {
    if (!session?.token) return;
    let active = true;
    const refresh = async () => {
      const response = await listAvailableQuizzes();
      if (!active || !response?.ok || !Array.isArray(response.items)) return;
      setQuizzes(response.items);
      const saved = getSavedSession();
      if (saved?.token === session.token) {
        const next = { ...saved, quizzes: response.items };
        saveSession(next);
        setSession(next);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session?.token, setSession]);

  useEffect(() => {
    historyList('all').then((r) => {
      if (r?.ok) setAttempts(r.items || []);
    });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, QuizInfo[]>();
    quizzes.forEach((quiz) => {
      const topic = quiz.topic?.trim() || '其他考卷';
      map.set(topic, [...(map.get(topic) || []), quiz]);
    });
    return [...map.entries()].sort(([a], [b]) => a === '其他考卷' ? 1 : b === '其他考卷' ? -1 : a.localeCompare(b, 'zh-TW'));
  }, [quizzes]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-serif text-xl font-bold">我的測驗</h2>
        <p className="text-sm text-muted-foreground">以下是老師指派給你的測驗，清單會自動更新。</p>
      </div>

      {quizzes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            目前沒有指派給你的測驗。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-7">
          {groups.map(([topic, topicQuizzes]) => (
            <section key={topic}>
              <h3 className="mb-3 font-serif text-lg font-bold">{topic}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {topicQuizzes.map((quiz) => <QuizCard key={`${quiz.id}_${quiz.version}`} quiz={quiz} attempts={attempts} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizCard({ quiz, attempts }: { quiz: QuizInfo; attempts: AttemptItem[] }) {
  const mine = attempts.filter((attempt) => attempt.quiz_id === quiz.id && attempt.quiz_version === quiz.version);
  const graded = mine.filter((attempt) => attempt.score != null);
  const best = graded.length ? graded.reduce((current, attempt) => ((attempt.score || 0) / (attempt.max_score || 1) > (current.score || 0) / (current.max_score || 1) ? attempt : current)) : null;
  const limit = quiz.attempt_limit ?? null;
  const available = fmtDue(quiz.available_at);
  const notOpen = quiz.available_at ? new Date(quiz.available_at).getTime() > Date.now() : false;
  const due = fmtDue(quiz.due_at);
  const overdue = quiz.due_at ? new Date(quiz.due_at) < new Date() : false;
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="font-serif text-base">{quiz.name}</CardTitle>{best && <Badge variant="secondary" className="shrink-0">最佳 {best.score}/{best.max_score}</Badge>}</div></CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{quiz.time_limit_minutes > 0 ? `限時 ${quiz.time_limit_minutes} 分鐘` : '不限時'}</span>
          {available && <span className={`flex items-center gap-1 ${notOpen ? 'text-primary' : ''}`}><CalendarClock className="h-3.5 w-3.5" />{notOpen ? '開放' : '已開放'} {available}</span>}
          {due && <span className={`flex items-center gap-1 ${overdue ? 'text-destructive' : ''}`}><CalendarClock className="h-3.5 w-3.5" />截止 {due}{overdue ? '（已截止）' : ''}</span>}
          {limit != null && limit > 0 && <span className="flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />已作答 {mine.length}/{limit} 次</span>}
        </div>
        <Button onClick={() => (location.hash = `/quiz-info/${encodeURIComponent(quiz.id)}/${quiz.version}`)}>查看</Button>
      </CardContent>
    </Card>
  );
}
