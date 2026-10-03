import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@/lib/types';
import { getSession, clearSession, isAdmin } from '@/lib/session';
import { invalidate } from '@/lib/cache';
import { profileStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MailWarning } from 'lucide-react';
import StudentHome from '@/pages/student/Home';
import QuizPage from '@/pages/student/Quiz';
import QuizInfoPage from '@/pages/student/QuizInfo';
import HistoryPage from '@/pages/student/History';
import AdminQuizzes from '@/pages/admin/Quizzes';
import AdminEditor from '@/pages/admin/Editor';
import AdminResults from '@/pages/admin/Results';
import AdminUsers from '@/pages/admin/Users';
import AdminPosts from '@/pages/admin/Posts';
import StudentPosts from '@/pages/student/Posts';
import StudentQa from '@/pages/student/Qa';
import AdminQa from '@/pages/admin/Qa';
import SettingsPage from '@/pages/Settings';
import Shell from '@/components/Shell';

interface SessionCtx {
  session: Session | null;
  setSession: (s: Session | null) => void;
  logout: () => void;
}
const Ctx = createContext<SessionCtx>({ session: null, setSession: () => {}, logout: () => {} });
export const useSession = () => useContext(Ctx);

export function useHashRoute(): [string, (h: string) => void] {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const fn = () => setHash(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return [hash, (h: string) => (location.hash = h)];
}

export default function App() {
  const [session, setSessionState] = useState<Session | null>(getSession());
  const [route] = useHashRoute();
  // 學生必須綁定並驗證信箱才能使用系統(寄信服務未設定時不擋)
  const [emailOk, setEmailOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session || isAdmin(session)) {
      setEmailOk(true);
      return;
    }
    let alive = true;
    const check = () => {
      void profileStatus().then((r) => {
        if (!alive) return;
        if (r?.ok) setEmailOk(!r.mail_enabled || !!r.email_verified);
        else setEmailOk(true); // 查不到就不擋,避免整站鎖死
      });
    };
    check();
    window.addEventListener('hw:profile-refresh', check);
    return () => {
      alive = false;
      window.removeEventListener('hw:profile-refresh', check);
    };
  }, [session]);

  const setSession = useCallback((s: Session | null) => setSessionState(s), []);
  const logout = useCallback(() => {
    invalidate();
    clearSession();
    setSessionState(null);
    location.hash = '/';
  }, []);

  const ctx = { session, setSession, logout };

  useEffect(() => {
    if (!session?.expires_at) return;
    const check = () => {
      if (new Date(session.expires_at!).getTime() <= Date.now()) logout();
    };
    const timer = window.setInterval(check, 60_000);
    check();
    return () => window.clearInterval(timer);
  }, [session?.expires_at, logout]);

  // 未登入:主頁面（側邊欄 + 歡迎頁），Shell 內建登入彈窗
  if (!session) {
    return (
      <Ctx.Provider value={ctx}>
        <Shell>{null}</Shell>
      </Ctx.Provider>
    );
  }

  const admin = isAdmin(session);
  let page: React.ReactNode;

  // 未完成信箱驗證的學生:除了「設定」外一律導向綁定提示
  if (!admin && emailOk === false && !route.startsWith('/settings')) {
    return (
      <Ctx.Provider value={ctx}>
        <Shell><EmailGate /></Shell>
      </Ctx.Provider>
    );
  }

  if (route.startsWith('/quiz/')) {
    page = <QuizPage routeKey={route} />;
  } else if (!admin && route.startsWith('/quiz-info/')) {
    page = <QuizInfoPage routeKey={route} />;
  } else if (route.startsWith('/history')) {
    page = <HistoryPage />;
  } else if (route.startsWith('/posts')) {
    page = <StudentPosts />;
  } else if (route.startsWith('/settings')) {
    page = <SettingsPage />;
  } else if (!admin && route.startsWith('/qa')) {
    page = <StudentQa />;
  } else if (admin && route.startsWith('/admin/qa')) {
    page = <AdminQa />;
  } else if (admin && route.startsWith('/admin/editor')) {
    page = <AdminEditor routeKey={route} />;
  } else if (admin && route.startsWith('/admin/results')) {
    page = <AdminResults />;
  } else if (admin && route.startsWith('/admin/users')) {
    page = <AdminUsers />;
  } else if (admin && route.startsWith('/admin/posts')) {
    page = <AdminPosts />;
  } else if (admin && route.startsWith('/admin')) {
    page = <AdminQuizzes />;
  } else {
    page = admin ? <AdminQuizzes /> : <StudentHome />;
  }

  // 作答頁全螢幕，不套側邊欄版面
  if (route.startsWith('/quiz/')) {
    return <Ctx.Provider value={ctx}>{page}</Ctx.Provider>;
  }

  return (
    <Ctx.Provider value={ctx}>
      <Shell>{page}</Shell>
    </Ctx.Provider>
  );
}

/** 學生未綁定信箱時的擋板:指引前往設定完成驗證 */
function EmailGate() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <MailWarning className="h-12 w-12 text-primary" />
      <h2 className="font-serif text-xl font-bold">請先完成信箱綁定</h2>
      <p className="text-sm text-muted-foreground">
        為了接收公告與提問回覆通知，使用系統前需要先綁定並驗證你的 Email。
        到「設定」輸入信箱、收取驗證碼即可完成，只需要做一次。
      </p>
      <Button onClick={() => (location.hash = '/settings')}>前往設定綁定信箱</Button>
    </div>
  );
}
