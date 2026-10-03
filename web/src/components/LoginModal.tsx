import { useState } from 'react';
import { auth, warmCache } from '@/lib/api';
import { invalidate } from '@/lib/cache';
import { saveSession } from '@/lib/session';
import { useSession } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { X } from 'lucide-react';
import { backdropClose } from '@/lib/utils';

/** 登入彈出視窗 */
export default function LoginModal({ onClose }: { onClose: () => void }) {
  const { setSession } = useSession();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const doLogin = async () => {
    if (!account.trim() || !password) {
      setErr('請輸入帳號與密碼');
      return;
    }
    setBusy(true);
    setErr('');
    const slow = setTimeout(() => setErr('正在連線伺服器（第一次可能較慢）…'), 1500);
    try {
      const data = await auth(account.trim(), password);
      clearTimeout(slow);
      if (!data?.ok) {
        setErr(
          data?.error === 'BAD_CREDENTIALS_OR_INACTIVE'
            ? '帳號或密碼錯誤，或帳號已停用'
            : `登入失敗：${data?.error || '未知錯誤'}`
        );
        return;
      }
      const s = {
        token: data.token,
        account: data.account,
        display_name: data.display_name,
        role: data.role,
        quizzes: data.quizzes || [],
        expires_at: data.expires_at,
      };
      invalidate();
      saveSession(s);
      setSession(s);
      warmCache(data.role);
      onClose();
      location.hash = (data.role || '').toLowerCase() === 'admin' ? '/admin' : '/';
    } catch {
      clearTimeout(slow);
      setErr('登入服務暫時無法使用，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" {...backdropClose(onClose)}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 py-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <img src="/favicon-32.png" alt="系統圖示" className="h-9 w-9 rounded" />
              <div>
                <h3 className="font-serif text-lg font-bold leading-tight">登入</h3>
                <p className="text-xs text-muted-foreground">請使用老師提供的帳號</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account">帳號</Label>
            <Input
              id="account"
              value={account}
              autoComplete="username"
              autoFocus
              disabled={busy}
              onChange={(e) => setAccount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密碼</Label>
            <Input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full" onClick={doLogin} disabled={busy}>
            {busy ? '登入中…' : '登入'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
