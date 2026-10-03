import { useEffect, useState } from 'react';
import { adminDeleteUser, adminListUsers, adminRenameUser, adminUpsertUser } from '@/lib/api';
import type { UserItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2, UserX, UserCheck } from 'lucide-react';
import { useSession } from '@/App';
import { backdropClose } from '@/lib/utils';

export default function AdminUsers() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editFor, setEditFor] = useState<UserItem | null>(null);
  const { session } = useSession();

  const reload = () => {
    setLoading(true);
    adminListUsers().then((r) => {
      if (r?.ok) setItems(r.items || []);
      setLoading(false);
    });
  };
  useEffect(reload, []);

  const delUser = async (u: UserItem) => {
    if (!confirm(`確定刪除帳號「${u.display_name}（${u.account}）」？\n該學生的所有作答紀錄、最佳成績、草稿與派遣都會一併刪除，無法復原。`)) return;
    if (!confirm('再次確認:真的要永久刪除嗎?')) return;
    const r = await adminDeleteUser(u.account);
    if (r?.ok) reload();
    else setMsg(r?.error === 'CANNOT_DELETE_SELF' ? '不能刪除自己目前登入的帳號' : (r?.error || '刪除失敗'));
  };

  const toggleActive = async (u: UserItem) => {
    setMsg('');
    const r = await adminUpsertUser({ account: u.account, is_active: !u.is_active });
    if (r?.ok) reload();
    else setMsg(r?.error || '更新失敗');
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold">帳號管理</h2>
          <p className="text-sm text-muted-foreground">建立學生帳號、重設密碼、停用帳號。</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 新增帳號</Button>
      </div>

      {msg && <p className="mb-3 text-sm text-destructive">{msg}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="block w-full text-sm md:table">
            <thead className="sr-only md:not-sr-only md:table-header-group">
              <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">帳號</th>
                <th className="px-3 py-2.5 font-medium">名稱</th>
                <th className="px-3 py-2.5 font-medium">角色</th>
                <th className="px-3 py-2.5 font-medium">狀態</th>
                <th className="px-3 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {items.map((u) => (
                <tr key={u.account} className="grid grid-cols-2 gap-2 border-b border-border/60 p-4 last:border-0 md:table-row md:p-0">
                  <td className="col-span-2 min-w-0 break-all font-medium md:px-4 md:py-2.5">{u.account}</td>
                  <td className="col-span-2 min-w-0 md:px-3 md:py-2.5">
                    {u.display_name}
                    {u.note && (
                      <p className="max-w-[220px] truncate text-xs text-muted-foreground" title={u.note}>{u.note}</p>
                    )}
                  </td>
                  <td className="md:px-3 md:py-2.5">
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role === 'admin' ? '管理員' : '學生'}</Badge>
                  </td>
                  <td className="md:px-3 md:py-2.5">
                    <Badge variant={u.is_active ? 'default' : 'destructive'} className={u.is_active ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                      {u.is_active ? '啟用' : '停用'}
                    </Badge>
                  </td>
                  <td className="col-span-2 border-t pt-1 md:border-0 md:px-3 md:py-2.5">
                    <div className="flex justify-end gap-1">
                      <button title="編輯（帳號 / 名稱 / 密碼）" aria-label="編輯帳號" onClick={() => setEditFor(u)} className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:h-7 md:w-7">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        title={u.is_active ? '停用帳號' : '重新啟用'}
                        onClick={() => toggleActive(u)}
                        aria-label={u.is_active ? '停用帳號' : '重新啟用'}
                        className={`flex h-11 w-11 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${u.is_active ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                      >
                        {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      <button
                        title={u.account === session?.account ? '不能刪除自己' : '刪除帳號（連同所有紀錄）'}
                        disabled={u.account === session?.account}
                        onClick={() => delUser(u)}
                        aria-label="刪除帳號"
                        className="flex h-11 w-11 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30 md:h-7 md:w-7"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <UserDialog onClose={(changed) => { setShowCreate(false); if (changed) reload(); }} />}
      {editFor && <EditDialog user={editFor} onClose={(changed) => { setEditFor(null); if (changed) reload(); }} />}
    </div>
  );
}

function UserDialog({ onClose }: { onClose: (changed: boolean) => void }) {
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    if (!account.trim() || !password) { setMsg('帳號與密碼必填'); return; }
    setBusy(true);
    const r = await adminUpsertUser({ account: account.trim(), password, display_name: name.trim() || account.trim(), role, is_active: true });
    setBusy(false);
    if (r?.ok) onClose(true);
    else setMsg(r?.error || '建立失敗');
  };

  return (
    <Modal onClose={() => onClose(false)}>
      <h3 className="font-serif text-lg font-bold">新增帳號</h3>
      <div className="space-y-3">
        <div className="space-y-1"><Label>帳號</Label><Input value={account} onChange={(e) => setAccount(e.target.value)} /></div>
        <div className="space-y-1"><Label>顯示名稱</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label>初始密碼</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>角色</Label>
          <select className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">學生</option>
            <option value="admin">管理員</option>
          </select>
        </div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onClose(false)}>取消</Button>
        <Button onClick={save} disabled={busy}>{busy ? '建立中…' : '建立'}</Button>
      </div>
    </Modal>
  );
}

function EditDialog({ user, onClose }: { user: UserItem; onClose: (changed: boolean) => void }) {
  const [account, setAccount] = useState(user.account);
  const [name, setName] = useState(user.display_name);
  const [password, setPassword] = useState('');
  const [note, setNote] = useState(user.note || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    const newAcc = account.trim();
    if (!newAcc) { setMsg('帳號不可為空'); return; }
    if (newAcc !== user.account && !confirm(`確定把帳號「${user.account}」改名為「${newAcc}」？\n所有歷史紀錄會一併轉移，該學生所有裝置需以新帳號重新登入。`)) return;
    setBusy(true);
    setMsg('');
    const r = await adminRenameUser({
      account: user.account,
      new_account: newAcc !== user.account ? newAcc : undefined,
      display_name: name.trim() || undefined,
      password: password || undefined,
      note,
    });
    setBusy(false);
    if (r?.ok) onClose(true);
    else setMsg(r?.error === 'ACCOUNT_EXISTS' ? '新帳號名稱已被使用' : (r?.error || '儲存失敗'));
  };

  return (
    <Modal onClose={() => onClose(false)}>
      <h3 className="font-serif text-lg font-bold">編輯帳號：{user.display_name}（{user.account}）</h3>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>帳號</Label>
          <Input value={account} onChange={(e) => setAccount(e.target.value)} />
          {account.trim() !== user.account && (
            <p className="text-xs text-amber-700">改帳號會轉移所有歷史紀錄，並使該學生原本的登入失效。</p>
          )}
        </div>
        <div className="space-y-1"><Label>顯示名稱</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label>新密碼（留空 = 不變更）</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>備註（僅老師可見）</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="例：三年二班 15 號 王小明，數學需加強"
            className="w-full rounded-md border border-input bg-card p-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onClose(false)}>取消</Button>
        <Button onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存'}</Button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" {...backdropClose(onClose)}>
      <Card className="max-h-[90dvh] w-full max-w-sm overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 py-5">{children}</CardContent>
      </Card>
    </div>
  );
}
