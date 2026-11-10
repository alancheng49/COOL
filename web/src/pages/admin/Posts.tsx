import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { backdropClose } from '@/lib/utils';
import AssignHoverCard from '@/components/AssignHoverCard';
import {
  adminDeletePost, adminDeleteTag, adminListPosts, adminListUsers, adminUpsertPost, uploadFile,
} from '@/lib/api';
import type { PostAttachment, PostItem, TagDef, UserItem } from '@/lib/types';
import MarkdownMath from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Trash2, Paperclip, X, Plus, Eye, Send, Power, HelpCircle, RefreshCw } from 'lucide-react';

// 公告內容字體:英文一律 Arial
export const POST_FONT = { fontFamily: "Arial, 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif" };

export const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);
export const fmtPostTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function TagChip({ name, tags, onRemove }: { name: string; tags: TagDef[]; onRemove?: () => void }) {
  const color = tags.find((t) => t.name === name)?.color || '#2d8b8b';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-80 hover:opacity-100">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** 公告閱讀畫面(學生視角;管理端預覽與學生端共用) */
export function PostReader({ post, tags }: { post: PostItem; tags: TagDef[] }) {
  return (
    <div style={POST_FONT}>
      <h2 className="text-2xl font-bold">{post.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {post.author || '老師'}・發佈於 {fmtPostTime(post.created_at)}
      </p>
      {post.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {post.tags.map((t) => <TagChip key={t} name={t} tags={tags} />)}
        </div>
      )}
      <hr className="my-4 border-border" />
      <MarkdownMath md={post.content} />
      {post.attachments.length > 0 && (
        <div className="mt-6 space-y-1.5 border-t border-border pt-4">
          <p className="text-sm font-semibold">附件下載</p>
          {post.attachments.map((a) => (
            <a
              key={a.path}
              href={a.url}
              target="_blank"
              rel="noopener"
              className="flex max-w-xl items-center gap-2 rounded border border-border bg-secondary/40 px-3 py-2 text-sm transition-colors hover:border-primary/50"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{a.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtSize(a.size)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPosts() {
  const [items, setItems] = useState<PostItem[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PostItem | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<PostItem | null>(null);
  const [assignFor, setAssignFor] = useState<PostItem | null>(null);
  const [msg, setMsg] = useState('');

  const reload = () => {
    setLoading(true);
    adminListPosts().then((r) => {
      if (r?.ok) {
        setItems(r.items || []);
        setTags(r.tags || []);
      }
      setLoading(false);
    });
  };
  useEffect(reload, []);

  const togglePublished = async (p: PostItem) => {
    setMsg('');
    const r = await adminUpsertPost({ ...p, published: !p.published, new_tags: [] });
    if (r?.ok) reload();
    else setMsg(`更新失敗：${r?.error || '未知錯誤'}`);
  };

  const del = async (p: PostItem) => {
    if (!confirm(`確定刪除「${p.title}」？附件也會一併刪除。`)) return;
    const r = await adminDeletePost(p.id);
    if (r?.ok) reload();
    else setMsg(`刪除失敗：${r?.error || '未知錯誤'}`);
  };

  if (editing) {
    return (
      <PostEditor
        post={editing === 'new' ? null : editing}
        tags={tags}
        onTagsChanged={reload}
        onDone={(changed) => {
          setEditing(null);
          if (changed) reload();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">公告管理</h2>
        </div>
        <Button onClick={() => setEditing('new')}>+ 發布公告</Button>
      </div>

      {msg && <p className="mb-3 text-sm text-destructive">{msg}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">還沒有任何公告，點右上角「發布公告」開始。</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">標題</th>
                <th className="px-3 py-2.5 font-medium">標籤</th>
                <th className="px-3 py-2.5 font-medium">狀態</th>
                <th className="px-3 py-2.5 font-medium">對象</th>
                <th className="px-3 py-2.5 font-medium">發佈時間</th>
                <th className="px-3 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {p.title}
                    {p.attachments.length > 0 && <Paperclip className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" />}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {p.tags.map((t) => <TagChip key={t} name={t} tags={tags} />)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={p.published ? 'default' : 'secondary'} className={p.published ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                      {p.published ? '發布中' : '已停用'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <AssignHoverCard accounts={p.accounts} audience={p.audience} label={p.audience === 'all' ? '所有學生' : `${p.accounts.length} 人`} />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtPostTime(p.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="學生視角預覽" onClick={() => setPreviewing(p)}><Eye className="h-4 w-4" /></IconBtn>
                      <IconBtn title="派遣對象" onClick={() => setAssignFor(p)}><Send className="h-4 w-4" /></IconBtn>
                      <IconBtn title="編輯" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></IconBtn>
                      <IconBtn title={p.published ? '停用' : '重新發布'} onClick={() => togglePublished(p)}><Power className="h-4 w-4" /></IconBtn>
                      <IconBtn title="刪除" danger onClick={() => del(p)}><Trash2 className="h-4 w-4" /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 學生視角預覽 */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" {...backdropClose(() => setPreviewing(null))}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPreviewing(null)}><X className="h-4 w-4" /></Button>
            </div>
            <PostReader post={previewing} tags={tags} />
          </div>
        </div>
      )}

      {assignFor && (
        <AssignPostDialog
          post={assignFor}
          onClose={(changed) => {
            setAssignFor(null);
            if (changed) reload();
          }}
        />
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

// ===== 派遣對話框(與題目管理邏輯一致) =====
function AssignPostDialog({ post, onClose }: { post: PostItem; onClose: (changed: boolean) => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(post.accounts));
  const [students, setStudents] = useState<UserItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    adminListUsers().then((r) => {
      if (r?.ok) {
        const list = (r.items || []).filter((u: UserItem) => u.role !== 'admin' && u.is_active);
        setStudents(list);
        // 舊資料的「全部學生」→ 轉成全勾
        if (post.audience === 'all') setChecked(new Set(list.map((u: UserItem) => u.account)));
      }
    });
  }, [post.audience]);

  const save = async () => {
    if (checked.size === 0) { setMsg('至少勾選一位學生'); return; }
    setBusy(true);
    const r = await adminUpsertPost({
      ...post,
      audience: 'selected',
      accounts: [...checked],
      new_tags: [],
    });
    setBusy(false);
    if (r?.ok) onClose(true);
    else setMsg(`儲存失敗：${r?.error || '未知錯誤'}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" {...backdropClose(() => onClose(false))}>
      <Card className="flex max-h-[85vh] w-full max-w-md flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 py-5">
          <div>
            <h3 className="font-serif text-lg font-bold">派遣「{post.title}」</h3>
          </div>
          <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">已選 {checked.size} / {students.length} 位</span>
                <div className="flex gap-2">
                  <button className="text-primary hover:underline" onClick={() => setChecked(new Set(students.map((u) => u.account)))}>全選</button>
                  <button className="text-primary hover:underline" onClick={() => setChecked(new Set())}>全不選</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded border border-border p-2">
                {students.map((u) => (
                  <label key={u.account} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary">
                    <Checkbox
                      checked={checked.has(u.account)}
                      onCheckedChange={() => setChecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(u.account)) next.delete(u.account);
                        else next.add(u.account);
                        return next;
                      })}
                    />
                    {u.display_name} <span className="text-xs text-muted-foreground">({u.account})</span>
                  </label>
                ))}
              </div>
          </>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onClose(false)}>取消</Button>
            <Button onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== 編輯器(全寬:左編輯右預覽,設定列橫向排列) =====
function PostEditor({ post, tags: globalTags, onTagsChanged, onDone }: {
  post: PostItem | null;
  tags: TagDef[];
  onTagsChanged: () => void;
  onDone: (changed: boolean) => void;
}) {
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [selTags, setSelTags] = useState<string[]>(post?.tags || []);
  const [newTags, setNewTags] = useState<TagDef[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#2d8b8b');
  const [attachments, setAttachments] = useState<PostAttachment[]>(post?.attachments || []);
  const [accounts, setAccounts] = useState<Set<string>>(new Set(post?.accounts || []));
  const [students, setStudents] = useState<UserItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showMdHelp, setShowMdHelp] = useState(false);
  // 手動預覽:按「更新預覽」才把左側內容渲染到右側
  const [previewTitle, setPreviewTitle] = useState(post?.title || '');
  const [previewMd, setPreviewMd] = useState(post?.content || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => [...globalTags, ...newTags], [globalTags, newTags]);

  useEffect(() => {
    adminListUsers().then((r) => {
      if (r?.ok) {
        const list = (r.items || []).filter((u: UserItem) => u.role !== 'admin' && u.is_active);
        setStudents(list);
        // 新公告、或舊資料的「全部學生」→ 預設全勾
        if (!post || post.audience === 'all') setAccounts(new Set(list.map((u: UserItem) => u.account)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNewTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    if (allTags.some((t) => t.name === name)) {
      setSelTags((prev) => (prev.includes(name) ? prev : [...prev, name]));
    } else {
      setNewTags((prev) => [...prev, { name, color: newTagColor }]);
      setSelTags((prev) => [...prev, name]);
    }
    setNewTagName('');
  };

  const deleteGlobalTag = async (name: string) => {
    if (!confirm(`刪除標籤「${name}」？所有公告上的這個標籤都會被移除。`)) return;
    const r = await adminDeleteTag(name);
    if (r?.ok) {
      setSelTags((prev) => prev.filter((t) => t !== name));
      onTagsChanged();
    } else {
      setMsg(`刪除標籤失敗：${r?.error || '未知錯誤'}`);
    }
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setMsg('附件超過 15MB'); return; }
    setFileBusy(true);
    setMsg('');
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('讀檔失敗'));
        r.readAsDataURL(f);
      });
      const r = await uploadFile(f.name, b64, f.type || 'application/octet-stream');
      if (r?.ok) setAttachments((prev) => [...prev, { name: r.name, path: r.path, url: r.url, size: r.size }]);
      else setMsg(`附件上傳失敗：${r?.error || '連線錯誤'}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '附件上傳失敗');
    } finally {
      setFileBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!title.trim()) { setMsg('請填標題'); return; }
    if (accounts.size === 0) { setMsg('至少要勾選一位學生'); return; }
    setBusy(true);
    setMsg('');
    const r = await adminUpsertPost({
      id: post?.id,
      title: title.trim(),
      content,
      tags: selTags,
      new_tags: newTags,
      attachments,
      audience: 'selected',
      accounts: [...accounts],
      published: post ? post.published : true,
    });
    setBusy(false);
    if (r?.ok) onDone(true);
    else setMsg(`儲存失敗：${r?.error || '未知錯誤'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold">{post ? '編輯公告' : '發布公告'}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onDone(false)}>取消</Button>
          <Button onClick={save} disabled={busy}>{busy ? '儲存中…' : post ? '儲存變更' : '發布'}</Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0">標題</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-xl" />
      </div>

      {/* 內文 + 手動預覽:左右各半、等高 */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Label>內文</Label>
            <button
              type="button"
              title="Markdown 語法說明"
              onClick={() => setShowMdHelp(true)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[55vh] flex-1 resize-y font-mono text-sm"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label>預覽</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                setPreviewTitle(title);
                setPreviewMd(content);
              }}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />更新預覽
            </Button>
          </div>
          <PreviewPane title={previewTitle} md={previewMd} selTags={selTags} allTags={allTags} />
        </div>
      </div>

      {showMdHelp && <MdHelpModal onClose={() => setShowMdHelp(false)} />}

      {/* 設定列:標籤 / 附件 / 對象 橫向三欄 */}
      <div className="grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-3">
        {/* 標籤 */}
        <div className="space-y-2">
          <Label>標籤</Label>
          <div className="flex flex-wrap gap-1.5">
            {selTags.map((t) => (
              <TagChip key={t} name={t} tags={allTags} onRemove={() => setSelTags((prev) => prev.filter((x) => x !== t))} />
            ))}
            {selTags.length === 0 && <span className="text-xs text-muted-foreground">尚未選擇</span>}
          </div>
          {allTags.filter((t) => !selTags.includes(t.name)).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.filter((t) => !selTags.includes(t.name)).map((t) => (
                <span key={t.name} className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs"
                  style={{ borderColor: t.color, color: t.color }}>
                  <button type="button" onClick={() => setSelTags((prev) => [...prev, t.name])} className="hover:underline">
                    + {t.name}
                  </button>
                  {globalTags.some((g) => g.name === t.name) && (
                    <button type="button" title="刪除此全域標籤" onClick={() => deleteGlobalTag(t.name)} className="opacity-60 hover:opacity-100">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Input className="h-8 w-32" value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNewTag()} />
            <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)}
              className="h-8 w-9 cursor-pointer rounded border border-border bg-card" title="標籤顏色" />
            <Button type="button" variant="outline" size="sm" onClick={addNewTag}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 附件 */}
        <div className="space-y-2">
          <Label>附件（單檔 15MB）</Label>
          {attachments.map((a) => (
            <div key={a.path} className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-sm">
              <span className="min-w-0 truncate">
                <Paperclip className="mr-1 inline h-3.5 w-3.5" />
                {a.name} <span className="text-xs text-muted-foreground">({fmtSize(a.size)})</span>
              </span>
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.path !== a.path))}
                className="shrink-0 text-destructive"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={fileBusy} onClick={() => fileRef.current?.click()}>
            <Paperclip className="mr-1 h-4 w-4" />{fileBusy ? '上傳中…' : '上傳附件'}
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>

        {/* 對象 */}
        <div className="space-y-2">
          <Label>發布對象</Label>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">已選 {accounts.size} / {students.length} 位</span>
            <div className="flex gap-2">
              <button type="button" className="text-primary hover:underline" onClick={() => setAccounts(new Set(students.map((u) => u.account)))}>全選</button>
              <button type="button" className="text-primary hover:underline" onClick={() => setAccounts(new Set())}>全不選</button>
            </div>
          </div>
          {(
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border border-border p-2">
              {students.map((u) => (
                <label key={u.account} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary">
                  <Checkbox
                    checked={accounts.has(u.account)}
                    onCheckedChange={() => setAccounts((prev) => {
                      const next = new Set(prev);
                      if (next.has(u.account)) next.delete(u.account);
                      else next.add(u.account);
                      return next;
                    })}
                  />
                  {u.display_name} <span className="text-xs text-muted-foreground">({u.account})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}
    </div>
  );
}

// ===== Markdown 語法說明 =====
export function MdHelpModal({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['# 大標題', '一個 # 是最大的標題'],
    ['## 小標題', '兩個 # 是次級標題'],
    ['### 子標題', '三個 # 是子標題'],
    ['**粗體**', '前後兩個星號'],
    ['*斜體*', '前後一個星號'],
    ['__底線__', '前後兩個底線'],
    ['~~刪除線~~', '前後兩個波浪號'],
    ['`程式碼`', '前後反引號'],
    ['- 項目', '減號開頭是無序清單'],
    ['1. 項目', '數字加點是有序清單'],
    ['> 引言', '大於號開頭是引言'],
    ['---', '三個減號是水平分隔線'],
    ['[顯示文字](https://...)', '超連結'],
    ['![說明](圖片網址)', '嵌入圖片'],
    ['@[youtube](影片網址)', '嵌入 YouTube 影片,需單獨一行'],
    ['| 欄1 | 欄2 |', '表格:第一行是標題列,第二行用 |---|---| 分隔,之後每行一列'],
    ['$a^2+b^2$', '行內數學式(LaTeX)'],
    ['$$\\frac{a}{b}$$', '獨立行數學式(LaTeX)'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" {...backdropClose(onClose)}>
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="min-h-0 flex-1 overflow-y-auto py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold">Markdown 語法說明</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">輸入</th>
                <th className="py-1.5 font-medium">效果</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([syntax, desc]) => (
                <tr key={syntax} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-3 align-top">
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{syntax}</code>
                  </td>
                  <td className="py-1.5 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            空一行代表換段。表格範例:第一行「| 名稱 | 分數 |」、第二行「|---|---|」、之後每行一筆資料。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// 預覽面板:memo 隔離,只有「更新預覽」或標籤選取變動時才重新渲染,
// 打字不會觸發任何預覽端的 DOM 變動(避免 iframe/圖片重載造成閃爍與捲動跳動)。
const PreviewPane = memo(function PreviewPane({
  title, md, selTags, allTags,
}: {
  title: string;
  md: string;
  selTags: string[];
  allTags: TagDef[];
}) {
  return (
    <div className="min-h-[55vh] flex-1 overflow-y-auto rounded-md border border-border bg-card px-4 py-3" style={POST_FONT}>
      {md || title ? (
        <>
          <h3 className="mb-1 text-xl font-bold">{title || '（標題）'}</h3>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {selTags.map((t) => <TagChip key={t} name={t} tags={allTags} />)}
          </div>
          <MarkdownMath md={md} className="text-sm" />
        </>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">按右上角「更新預覽」查看渲染結果。</p>
      )}
    </div>
  );
});
