import { useEffect, useState } from 'react';
import { useSession } from '@/App';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme';
import { updateProfile, profileStatus, requestEmailCode, verifyEmailCode } from '@/lib/api';
import { saveSession, isAdmin } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor, Sun, Moon, UserCog, Mail, BadgeCheck, CircleAlert } from 'lucide-react';

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: '跟隨系統', icon: Monitor },
  { value: 'light', label: '淺色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
];

export default function SettingsPage() {
  const { session, setSession } = useSession();
  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  // 帳號設定表單
  const [name, setName] = useState(session?.display_name || '');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pickTheme = (v: ThemePref) => {
    setTheme(v);
    setThemePref(v);
  };

  const save = async () => {
    if (!session) return;
    const nameChanged = name.trim() && name.trim() !== session.display_name;
    if (!nameChanged && !newPw) { setMsg({ ok: false, text: '沒有要變更的內容' }); return; }
    if (!curPw) { setMsg({ ok: false, text: '請輸入目前密碼以驗證身分' }); return; }
    if (newPw && newPw !== newPw2) { setMsg({ ok: false, text: '兩次輸入的新密碼不一致' }); return; }

    setBusy(true);
    setMsg(null);
    const r = await updateProfile({
      current_password: curPw,
      display_name: nameChanged ? name.trim() : undefined,
      new_password: newPw || undefined,
    });
    setBusy(false);
    if (r?.ok) {
      if (r.display_name && r.display_name !== session.display_name) {
        const next = { ...session, display_name: r.display_name };
        saveSession(next);
        setSession(next);
      }
      setCurPw(''); setNewPw(''); setNewPw2('');
      setMsg({ ok: true, text: '已儲存變更' });
    } else {
      setMsg({ ok: false, text: r?.error === 'BAD_CURRENT_PASSWORD' ? '目前密碼不正確' : (r?.error || '儲存失敗') });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-bold">設定</h1>

      {/* 外觀 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">外觀</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => pickTheme(value)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
                  theme === value
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            「跟隨系統」會依你的裝置深淺色設定自動切換。
          </p>
        </CardContent>
      </Card>

      {/* 信箱綁定 */}
      {session && <EmailCard admin={isAdmin(session)} />}

      {/* 帳號 */}
      {session && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-4 w-4" />帳號
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>帳號</Label>
              <Input value={session.account} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">帳號無法自行更改，如有需要請聯絡老師。</p>
            </div>
            <div className="space-y-1">
              <Label>顯示名稱</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>新密碼（不改請留空）</Label>
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-1">
                <Label>確認新密碼</Label>
                <Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <div className="space-y-1 border-t pt-4">
              <Label>目前密碼（任何變更都需要驗證）</Label>
              <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            </div>
            {msg && (
              <p className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{msg.text}</p>
            )}
            <div className="flex justify-end">
              <Button onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存變更'}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** 信箱綁定卡:輸入信箱 → 收驗證碼 → 驗證;更換信箱走同一流程 */
function EmailCard({ admin }: { admin: boolean }) {
  const [status, setStatus] = useState<{ email: string; email_verified: boolean; mail_enabled: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const needsBinding = status !== null && status.mail_enabled && !status.email_verified;

  const load = () => {
    void profileStatus().then((r) => {
      if (r?.ok) setStatus({ email: r.email, email_verified: !!r.email_verified, mail_enabled: !!r.mail_enabled });
    });
  };
  useEffect(load, []);

  // 重寄倒數
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setMsg({ ok: false, text: '信箱格式不正確' }); return; }
    setBusy(true);
    setMsg(null);
    const r = await requestEmailCode(e);
    setBusy(false);
    if (r?.ok) {
      setSent(true);
      setCooldown(60);
      setMsg({ ok: true, text: '驗證碼已寄出，請到信箱收信（也檢查垃圾郵件匣），10 分鐘內有效。' });
    } else {
      setMsg({
        ok: false,
        text: r?.error === 'TOO_FREQUENT' ? '寄送太頻繁，請稍等一分鐘再試'
          : r?.error === 'MAIL_NOT_CONFIGURED' ? '系統尚未設定寄信服務，請聯絡老師'
          : r?.error === 'MAIL_SEND_FAILED' ? '寄信失敗，請確認信箱是否正確'
          : (r?.error || '寄送失敗'),
      });
    }
  };

  const verify = async () => {
    if (!code.trim()) { setMsg({ ok: false, text: '請輸入驗證碼' }); return; }
    setBusy(true);
    setMsg(null);
    const r = await verifyEmailCode(code.trim());
    setBusy(false);
    if (r?.ok) {
      setEditing(false);
      setSent(false);
      setEmail('');
      setCode('');
      setMsg({ ok: true, text: '信箱綁定完成！' });
      load();
    } else {
      setMsg({
        ok: false,
        text: r?.error === 'BAD_CODE' ? '驗證碼不正確'
          : r?.error === 'CODE_EXPIRED' ? '驗證碼已過期，請重新寄送'
          : r?.error === 'TOO_MANY_TRIES' ? '錯誤次數過多，請重新寄送驗證碼'
          : (r?.error || '驗證失敗'),
      });
    }
  };

  return (
    <Card className={needsBinding ? 'border-destructive/70 bg-destructive/[0.04] shadow-[0_0_0_1px_hsl(var(--destructive)/0.18)]' : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-base ${needsBinding ? 'text-destructive' : ''}`}>
          {needsBinding ? <CircleAlert className="h-4 w-4" /> : <Mail className="h-4 w-4" />}信箱通知
          {needsBinding && <span className="rounded bg-destructive/10 px-2 py-1 text-xs font-medium">尚未綁定</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {needsBinding && (
          <p className="text-sm font-medium text-destructive">請先綁定並驗證信箱，完成後才能使用其他功能。</p>
        )}
        <p className="text-xs text-muted-foreground">
          {admin
            ? '綁定後，學生提出新提問或追問時會寄通知信給你。'
            : '綁定後，新公告與老師回覆你的提問時會寄通知信給你。'}
        </p>

        {status?.email_verified && !editing ? (
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="min-w-0 break-all">{status.email}</span>
              <span className="text-xs text-muted-foreground">（已驗證）</span>
            </p>
            <Button className="shrink-0" variant="outline" size="sm" onClick={() => { setEditing(true); setMsg(null); }}>更換信箱</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <Button variant="outline" onClick={sendCode} disabled={busy || cooldown > 0} className="shrink-0">
                {cooldown > 0 ? `重寄（${cooldown}s）` : sent ? '重寄驗證碼' : '寄送驗證碼'}
              </Button>
            </div>
            {sent && (
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 位數驗證碼"
                  inputMode="numeric"
                />
                <Button onClick={verify} disabled={busy} className="shrink-0">驗證</Button>
              </div>
            )}
            {editing && (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setEditing(false); setSent(false); setMsg(null); }}>
                取消更換
              </button>
            )}
          </div>
        )}
        {msg && (
          <p className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{msg.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
