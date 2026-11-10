import { useState } from 'react';
import { auth, warmCache } from '@/lib/api';
import { invalidate } from '@/lib/cache';
import { saveSession } from '@/lib/session';
import { useSession } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function Login() {
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
      };
      invalidate(); // 清掉前一位使用者的快取
      saveSession(s);
      setSession(s);
      warmCache(data.role); // 背景預載常用資料
      location.hash = (data.role || '').toLowerCase() === 'admin' ? '/admin' : '/';
    } catch {
      clearTimeout(slow);
      setErr('登入服務暫時無法使用，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-primary font-serif text-2xl font-bold text-primary-foreground">
            測
          </div>
          <h1 className="font-serif text-2xl font-bold">COOL</h1>
        </div>
        <Card>
          <CardHeader className="pb-2" />
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="account">帳號</Label>
              <Input
                id="account"
                value={account}
                autoComplete="username"
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
    </div>
  );
}
