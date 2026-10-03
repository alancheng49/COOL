import { useEffect, useRef, useState } from 'react';
import { useSession, useHashRoute } from '@/App';
import { isAdmin } from '@/lib/session';
import { unreadStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import LoginModal from '@/components/LoginModal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  BookOpenCheck, History, LayoutList, LogOut, LogIn, BarChart3, Users, FilePen, Menu, User, Megaphone,
  MessageCircleQuestion, Settings,
} from 'lucide-react';

type BadgeKey = 'qa' | 'posts';
interface NavItem { hash: string; label: string; icon: typeof Menu; badge?: BadgeKey }

const studentNav: NavItem[] = [
  { hash: '/', label: '我的測驗', icon: BookOpenCheck },
  { hash: '/history', label: '作答紀錄', icon: History },
  { hash: '/posts', label: '公告', icon: Megaphone, badge: 'posts' },
  { hash: '/qa', label: '提問', icon: MessageCircleQuestion, badge: 'qa' },
  { hash: '/settings', label: '設定', icon: Settings },
];
const adminNav: NavItem[] = [
  { hash: '/admin', label: '題目管理', icon: LayoutList },
  { hash: '/admin/editor', label: '新增題目', icon: FilePen },
  { hash: '/admin/results', label: '成績總覽', icon: BarChart3 },
  { hash: '/admin/posts', label: '公告管理', icon: Megaphone },
  { hash: '/admin/qa', label: '提問管理', icon: MessageCircleQuestion, badge: 'qa' },
  { hash: '/admin/users', label: '帳號管理', icon: Users },
  { hash: '/settings', label: '設定', icon: Settings },
];

const SIDEBAR_KEY = 'hw.sidebar';

export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useSession();
  const [route, go] = useHashRoute();
  const [open, setOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== '0');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [unread, setUnread] = useState<{ qa: number; posts: number }>({ qa: 0, posts: 0 });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0');
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const change = () => { setDesktop(query.matches); setMobileOpen(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => setMobileOpen(false), [route]);

  // 未讀紅點:登入後抓一次(結果快取 60 秒),切頁與資料變動時再確認
  useEffect(() => {
    if (!session) {
      setUnread({ qa: 0, posts: 0 });
      return;
    }
    let alive = true;
    const refresh = () => {
      void unreadStatus().then((r) => {
        if (alive && r?.ok) setUnread({ qa: Number(r.qa_unread) || 0, posts: Number(r.posts_unread) || 0 });
      });
    };
    refresh();
    window.addEventListener('hw:unread-refresh', refresh);
    window.addEventListener('hashchange', refresh);
    return () => {
      alive = false;
      window.removeEventListener('hw:unread-refresh', refresh);
      window.removeEventListener('hashchange', refresh);
    };
  }, [session]);

  const totalUnread = unread.qa + unread.posts;

  const nav = session ? (isAdmin(session) ? adminNav : studentNav) : [];
  const active = (h: string) =>
    h === '/' || h === '/admin'
      ? route === h || (h === '/admin' && route === '/admin/')
      : route.startsWith(h);

  const navigation = (
    <div className="flex h-full min-h-0 flex-col py-3">
      <nav className="flex-1 space-y-1 overflow-y-auto px-2" aria-label="主要導覽">
        {nav.map(({ hash, label, icon: Icon, badge }) => {
          const count = badge ? unread[badge] : 0;
          return (
            <button key={hash} onClick={() => { go(hash); setMobileOpen(false); }}
              aria-current={active(hash) ? 'page' : undefined}
              className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors',
                active(hash) ? 'bg-[#2d8b8b] font-semibold text-white' : 'text-[#a8dadc] hover:bg-white/10 hover:text-white')}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{count > 99 ? '99+' : count}</span>}
            </button>
          );
        })}
        {!session && <p className="px-3 py-2 text-xs text-[#a8dadc]/70">登入後即可使用各項功能。</p>}
      </nav>
      {session && <div className="border-t border-white/10 px-2 pt-2">
        <button onClick={() => { setMobileOpen(false); logout(); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-[#a8dadc] transition-colors hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4 shrink-0" />登出
        </button>
      </div>}
    </div>
  );

  const menuOpen = desktop ? open : mobileOpen;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {/* 頂欄（深海藍） */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 bg-[#1a2332] px-3 text-[#f1faee] shadow-md">
        <button
          ref={menuRef}
          type="button"
          title={menuOpen ? '關閉選單' : '開啟選單'}
          aria-label={menuOpen ? '關閉選單' : '開啟選單'}
          aria-expanded={menuOpen}
          onClick={() => desktop ? setOpen((v) => !v) : setMobileOpen((v) => !v)}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
          {/* 側欄收合時,未讀通知記號顯示在漢堡鈕上 */}
          {!menuOpen && totalUnread > 0 && (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[#1a2332] bg-red-500" />
          )}
        </button>

        {/* 常駐帳號區（未登入 → 登入按鈕） */}
        {session ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2d8b8b]">
              <User className="h-5 w-5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{session.display_name}</p>
              <p className="text-[11px] text-[#a8dadc]">{isAdmin(session) ? '管理員' : '學生'}</p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/10"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <LogIn className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold">登入</span>
          </button>
        )}

        <div className="mx-auto" />
        <Clock />
      </header>

      <div className="min-h-0 flex-1">
        {/* 側邊欄:固定在視窗左側,不隨頁面捲動 */}
        <aside
          inert={!open}
          className={cn(
            'fixed bottom-0 left-0 top-14 z-30 hidden w-56 bg-[#22304a] text-[#dbe7ea] transition-transform duration-200 lg:block',
            open ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {navigation}
        </aside>

        <Sheet open={mobileOpen && !desktop} onOpenChange={setMobileOpen}>
          <SheetContent side="left" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); menuRef.current?.focus(); }} className="flex w-[min(18rem,85vw)] flex-col gap-0 bg-[#22304a] p-0 pb-[env(safe-area-inset-bottom)] text-[#dbe7ea]">
            <SheetTitle className="border-b border-white/10 px-5 py-5 text-left text-[#dbe7ea]">選單</SheetTitle>
            <div className="min-h-0 flex-1">{navigation}</div>
          </SheetContent>
        </Sheet>

        {/* 主內容(側欄開啟時讓出寬度) */}
        <main className={cn('min-w-0 break-words transition-[margin] duration-200', open ? 'lg:ml-56' : 'ml-0')}>
          <div className="mx-auto max-w-6xl px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
            {session ? children : <Welcome onLogin={() => setShowLogin(true)} />}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * 數位時鐘:頁面載入時向後端對一次時間（單一請求），
 * 之後用本地時間 + 偏移量每秒更新，不重複打網路。
 */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let offset = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;

    const start = () => {
      if (!alive) return;
      setNow(new Date(Date.now() + offset));
      timer = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    };

    fetch('/api', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.server_time) {
          const t = new Date(d.server_time).getTime();
          if (!isNaN(t)) offset = t - Date.now();
        }
      })
      .catch(() => {}) // 對時失敗就用本地時間
      .finally(start);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (!now) return <div className="w-24" />;

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="shrink-0 pr-1 text-right leading-tight">
      <p className="font-mono text-base font-semibold tabular-nums sm:text-lg">
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </p>
      <p className="text-[11px] text-[#a8dadc]">
        {now.getFullYear()}/{pad(now.getMonth() + 1)}/{pad(now.getDate())}
      </p>
    </div>
  );
}

/** 未登入時的歡迎頁 */
function Welcome({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <img src="/apple-touch-icon.png" alt="系統圖示" className="h-24 w-24 rounded-2xl shadow-md" />
      <div>
        <h1 className="font-serif text-3xl font-bold">COOL</h1>
        <p className="mt-2 text-muted-foreground">作答指定測驗、查看成績與詳解，請先登入。</p>
      </div>
      <Button size="lg" onClick={onLogin}>
        <LogIn className="mr-2 h-4 w-4" />登入
      </Button>
    </div>
  );
}
