import { useEffect, useMemo, useState } from 'react';
import AssignHoverCard from '@/components/AssignHoverCard';
import {
  adminAssign, adminDeleteQuiz, adminDeleteQuizDraft, adminListQuizzes, adminListUsers, adminQuizDetail, adminQuizDraftDetail, adminUpsertQuizDraft, adminUnassign, adminUpdateTopic, upsertQuiz,
} from '@/lib/api';
import { draftQuizCopy, publishedQuizCopy } from '@/lib/quiz-copy';
import type { AdminQuizDraft, AdminQuizItem, UserItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Copy, Eye, LoaderCircle, Pencil, Power, Send, Trash2, X } from 'lucide-react';

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ManagedQuizRow {
  key: string;
  quiz_id: string;
  quiz_version: number;
  title: string;
  topic: string;
  published?: AdminQuizItem;
  draft?: AdminQuizDraft;
}

const quizKey = (quizId: string, version: number) => `${quizId}@@${version}`;

export default function AdminQuizzes() {
  const [items, setItems] = useState<AdminQuizItem[]>([]);
  const [drafts, setDrafts] = useState<AdminQuizDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [assignFor, setAssignFor] = useState<AdminQuizItem | null>(null);
  const [search, setSearch] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicBusy, setTopicBusy] = useState(false);
  const [copyingKey, setCopyingKey] = useState('');

  const showError = (text: string) => {
    setMsg(text);
    setMsgError(true);
  };
  const showSuccess = (text: string) => {
    setMsg(text);
    setMsgError(false);
  };

  const reload = () => {
    setLoading(true);
    adminListQuizzes().then((r) => {
      if (r?.ok) {
        setItems(r.items || []);
        setDrafts(r.drafts || []);
      }
      setLoading(false);
    });
  };
  useEffect(reload, []);

  const copyQuiz = async (quiz: ManagedQuizRow) => {
    if (copyingKey) return;
    setCopyingKey(quiz.key);
    setMsg('');
    try {
      const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      let payload;
      if (quiz.draft) {
        const response = await adminQuizDraftDetail(quiz.draft.draft_id);
        if (!response?.ok) throw new Error('無法讀取原草稿，請稍後重試。');
        payload = draftQuizCopy(response.draft, suffix);
      } else {
        const response = await adminQuizDetail(quiz.quiz_id, quiz.quiz_version);
        if (!response?.ok) throw new Error('無法讀取原考卷，請稍後重試。');
        payload = publishedQuizCopy(response, suffix);
      }
      const result = await adminUpsertQuizDraft(payload);
      if (!result?.ok || !result.draft_id) {
        throw new Error(result?.error === 'DRAFT_TOO_LARGE'
          ? '考卷內容超過草稿大小上限，無法複製。'
          : `副本儲存失敗：${result?.error || '連線錯誤'}`);
      }
      location.hash = `/admin/editor/draft/${encodeURIComponent(result.draft_id)}`;
    } catch (error) {
      showError(error instanceof Error ? error.message : '複製失敗，請稍後重試。');
    } finally {
      setCopyingKey('');
    }
  };

  const toggleActive = async (q: AdminQuizItem) => {
    setMsg('');
    setMsgError(false);
    const r = await upsertQuiz({
      quiz_id: q.quiz_id, quiz_version: q.quiz_version, title: q.title,
      total_points: q.total_points, is_active: !q.is_active, file: q.file,
      time_limit_minutes: q.time_limit_minutes, topic: q.topic || '',
    });
    if (r?.ok) reload();
    else showError(`更新失敗：${r?.error || '未知錯誤'}`);
  };

  const managedRows = useMemo(() => {
    const draftsBySource = new Map<string, AdminQuizDraft>();
    drafts.forEach((draft) => {
      if (draft.source_quiz_id) draftsBySource.set(quizKey(draft.source_quiz_id, draft.source_quiz_version), draft);
    });
    const usedDraftIds = new Set<string>();
    const rows: ManagedQuizRow[] = items.map((published) => {
      const draft = draftsBySource.get(quizKey(published.quiz_id, published.quiz_version));
      if (draft) usedDraftIds.add(draft.draft_id);
      return {
        key: draft ? `draft:${draft.draft_id}` : `published:${quizKey(published.quiz_id, published.quiz_version)}`,
        quiz_id: draft?.quiz_id || published.quiz_id,
        quiz_version: draft?.quiz_version || published.quiz_version,
        title: draft?.title || published.title,
        topic: (draft?.topic ?? published.topic ?? '').trim(),
        published,
        draft,
      };
    });
    drafts.forEach((draft) => {
      if (usedDraftIds.has(draft.draft_id)) return;
      rows.push({
        key: `draft:${draft.draft_id}`,
        quiz_id: draft.quiz_id,
        quiz_version: draft.quiz_version,
        title: draft.title,
        topic: draft.topic?.trim() || '',
        draft,
      });
    });
    return rows;
  }, [items, drafts]);

  const groups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = managedRows.filter((item) => !keyword || [item.title, item.quiz_id, item.topic].some((value) => value.toLowerCase().includes(keyword)));
    const map = new Map<string, ManagedQuizRow[]>();
    filtered.forEach((item) => {
      map.set(item.topic, [...(map.get(item.topic) || []), item]);
    });
    return [...map.entries()]
      .sort(([a], [b]) => !a ? 1 : !b ? -1 : a.localeCompare(b, 'zh-TW'))
      .map(([topic, quizzes]) => ({ topic, label: topic || '未分類', quizzes: quizzes.sort((a, b) => a.title.localeCompare(b.title, 'zh-TW')) }));
  }, [managedRows, search]);

  const del = async (q: AdminQuizItem) => {
    if (!confirm(`確定刪除「${q.title}」${q.quiz_version !== 1 ? `(舊版 v${q.quiz_version})` : ''}?\n將一併刪除答案與所有派遣紀錄。`)) return;
    const delFile = confirm('是否連題目 JSON 檔一起刪除？\n（若其他版本共用同一檔，請按取消）');
    const r = await adminDeleteQuiz(q.quiz_id, q.quiz_version, delFile);
    if (r?.ok) reload();
    else showError(`刪除失敗：${r?.error || '未知錯誤'}`);
  };

  const delDraft = async (draft: AdminQuizDraft) => {
    const suffix = draft.source_quiz_id ? '\n目前正式考卷與學生資料不會受到影響。' : '\n這份草稿尚未發佈，刪除後無法復原。';
    if (!confirm(`確定刪除草稿「${draft.title}」？${suffix}`)) return;
    const result = await adminDeleteQuizDraft(draft.draft_id);
    if (result?.ok) {
      showSuccess(`已刪除「${draft.title}」的草稿。`);
      reload();
    } else {
      showError(`草稿刪除失敗：${result?.error || '未知錯誤'}`);
    }
  };

  const beginRenameTopic = (topic: string) => {
    setEditingTopic(topic);
    setTopicName(topic);
    setMsg('');
    setMsgError(false);
  };

  const renameTopic = async () => {
    if (!editingTopic) return;
    const next = topicName.trim();
    if (!next) {
      showError('主題名稱不能留空；若要移除主題，請使用刪除按鈕。');
      return;
    }
    if (next === editingTopic) {
      setEditingTopic(null);
      return;
    }
    const willMerge = managedRows.some((item) => item.topic === next);
    if (willMerge && !confirm(`「${next}」已存在。要將「${editingTopic}」的考卷合併到這個主題嗎？`)) return;

    setTopicBusy(true);
    const result = await adminUpdateTopic(editingTopic, next);
    setTopicBusy(false);
    if (!result?.ok) {
      showError(`主題重新命名失敗：${result?.error || '未知錯誤'}`);
      return;
    }
    setEditingTopic(null);
    showSuccess(willMerge ? `已將主題合併至「${next}」。` : `已將主題重新命名為「${next}」。`);
    reload();
  };

  const deleteTopic = async (topic: string, count: number) => {
    if (!confirm(`確定刪除主題「${topic}」？\n其中 ${count} 份考卷會移至「未分類」，考卷、派遣與成績都會保留。`)) return;
    setTopicBusy(true);
    const result = await adminUpdateTopic(topic, '');
    setTopicBusy(false);
    if (!result?.ok) {
      showError(`主題刪除失敗：${result?.error || '未知錯誤'}`);
      return;
    }
    if (editingTopic === topic) setEditingTopic(null);
    showSuccess(`已刪除主題「${topic}」，${result.updated ?? count} 份考卷已移至「未分類」。`);
    reload();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold">題目管理</h2>
          <p className="text-sm text-muted-foreground">考卷依主題分組；每份考卷使用獨立識別碼。</p>
        </div>
        <div className="flex w-full min-w-0 gap-2 sm:w-auto">
          <Input aria-label="搜尋考卷" className="min-w-0 flex-1 sm:w-56" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋主題、標題或識別碼" />
          <Button className="shrink-0" onClick={() => (location.hash = '/admin/editor')}>+ 新增考卷</Button>
        </div>
      </div>

      {msg && <p className={`mb-3 text-sm ${msgError ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>{msg}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
      ) : managedRows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">還沒有任何考卷，點右上角「新增考卷」開始。</CardContent></Card>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">找不到符合搜尋條件的考卷。</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ topic, label, quizzes }) => (
            <section key={topic || '__uncategorized__'}>
              <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
                {editingTopic === topic ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Input
                      autoFocus
                      className="h-8 max-w-sm"
                      maxLength={120}
                      value={topicName}
                      onChange={(event) => setTopicName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                        if (event.key === 'Enter') void renameTopic();
                        if (event.key === 'Escape') setEditingTopic(null);
                      }}
                      aria-label="新的主題名稱"
                    />
                    <Button size="icon" className="h-8 w-8" onClick={() => void renameTopic()} disabled={topicBusy} title="儲存主題名稱">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingTopic(null)} disabled={topicBusy} title="取消重新命名">
                      <X className="h-4 w-4" />
                    </Button>
                    <span className="hidden sm:inline"><TopicCount quizzes={quizzes} /></span>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                    <h3 className="truncate font-serif text-lg font-bold" title={label}>{label}</h3>
                    <TopicCount quizzes={quizzes} />
                  </div>
                )}
                {topic && editingTopic !== topic && (
                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn title={`重新命名「${topic}」`} onClick={() => beginRenameTopic(topic)} disabled={topicBusy}>
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn title={`刪除主題「${topic}」`} onClick={() => void deleteTopic(topic, quizzes.length)} danger disabled={topicBusy}>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                )}
              </div>
              <QuizTable
                quizzes={quizzes}
                copyingKey={copyingKey}
                onCopy={(q) => void copyQuiz(q)}
                onPreview={(q) => q.published && (location.hash = `/quiz/${encodeURIComponent(q.published.quiz_id)}/${q.published.quiz_version}/preview`)}
                onAssign={(q) => q.published && setAssignFor(q.published)}
                onEdit={(q) => {
                  location.hash = q.draft
                    ? `/admin/editor/draft/${encodeURIComponent(q.draft.draft_id)}`
                    : `/admin/editor/${encodeURIComponent(q.quiz_id)}/${q.quiz_version}`;
                }}
                onToggle={(q) => q.published && void toggleActive(q.published)}
                onDelete={(q) => q.draft ? void delDraft(q.draft) : q.published && void del(q.published)}
              />
            </section>
          ))}
        </div>
      )}

      {assignFor && <AssignDialog quiz={assignFor} onClose={(changed) => { setAssignFor(null); if (changed) reload(); }} />}
    </div>
  );
}

function TopicCount({ quizzes }: { quizzes: ManagedQuizRow[] }) {
  const draftCount = quizzes.filter((quiz) => quiz.draft).length;
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {quizzes.length} 份考卷{draftCount ? ` · ${draftCount} 份草稿` : ''}
    </span>
  );
}

function QuizTable({ quizzes, copyingKey, onCopy, onPreview, onAssign, onEdit, onToggle, onDelete }: {
  quizzes: ManagedQuizRow[];
  copyingKey: string;
  onCopy: (quiz: ManagedQuizRow) => void;
  onPreview: (quiz: ManagedQuizRow) => void;
  onAssign: (quiz: ManagedQuizRow) => void;
  onEdit: (quiz: ManagedQuizRow) => void;
  onToggle: (quiz: ManagedQuizRow) => void;
  onDelete: (quiz: ManagedQuizRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="block w-full table-fixed text-sm xl:table xl:min-w-[900px]">
        <colgroup className="hidden xl:table-column-group">
          <col className="w-[20%]" />
          <col className="w-[21%]" />
          <col className="w-[13%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[24%]" />
        </colgroup>
        <thead className="sr-only xl:not-sr-only xl:table-header-group"><tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground"><th className="px-4 py-2.5 font-medium">考卷標題</th><th className="px-3 py-2.5 font-medium">識別碼</th><th className="px-3 py-2.5 font-medium">狀態</th><th className="px-3 py-2.5 font-medium">已派遣</th><th className="px-3 py-2.5 font-medium">限時</th><th className="px-3 py-2.5 text-right font-medium">操作</th></tr></thead>
        <tbody className="block xl:table-row-group">{quizzes.map((quiz) => {
          const published = quiz.published;
          const timeLimit = quiz.draft
            ? quiz.draft.time_limit_value.trim()
            : published?.time_limit_minutes ? String(published.time_limit_minutes) : '';
          return (
          <tr key={quiz.key} className="grid grid-cols-3 gap-x-2 gap-y-3 border-b border-border/60 p-3 last:border-0 xl:table-row xl:p-0">
            <td className="col-span-3 min-w-0 font-medium xl:px-4 xl:py-2.5"><span className="block break-words xl:truncate" title={quiz.title}>{quiz.title}</span></td>
            <td className="col-span-3 min-w-0 text-muted-foreground xl:px-3 xl:py-2.5"><div className="flex min-w-0 items-center"><span className="min-w-0 truncate" title={quiz.quiz_id}>{quiz.quiz_id}</span>{quiz.quiz_version !== 1 && <span className="ml-1.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px]">舊版 v{quiz.quiz_version}</span>}</div></td>
            <td className="min-w-0 xl:px-3 xl:py-2.5">
              <span className="mb-1 block text-xs text-muted-foreground xl:hidden">狀態</span>
              {quiz.draft ? (
                <div className="flex flex-col items-start gap-1">
                  <Badge variant="secondary" className="border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">草稿</Badge>
                  <span className="max-w-full truncate text-[11px] text-muted-foreground" title={published ? `正式版${published.is_active ? '啟用中' : '未啟用'}` : '尚未發佈'}>
                    {published ? `正式版${published.is_active ? '啟用中' : '未啟用'}` : '尚未發佈'}
                  </span>
                </div>
              ) : (
                <Badge variant={published?.is_active ? 'default' : 'secondary'} className={published?.is_active ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>{published?.is_active ? '啟用中' : '未啟用'}</Badge>
              )}
            </td>
            <td className="min-w-0 xl:px-3 xl:py-2.5">
              <span className="mb-1 block text-xs text-muted-foreground xl:hidden">已派遣</span>
              {published ? <div className="flex flex-col items-start gap-0.5"><AssignHoverCard accounts={published.assigned_accounts || []} label={`${published.assigned_count} 人`} />{!!published.scheduled_count && <span className="text-[11px] text-primary">{published.scheduled_count} 人待開放</span>}</div> : <span className="text-muted-foreground">-</span>}
            </td>
            <td className="min-w-0 xl:px-3 xl:py-2.5"><span className="mb-1 block text-xs text-muted-foreground xl:hidden">限時</span>{timeLimit ? `${timeLimit} 分` : '不限'}</td>
            <td className="col-span-3 min-w-0 border-t pt-1 xl:border-0 xl:px-3 xl:py-2.5">
              <div className="flex justify-between xl:justify-end xl:gap-1">
                <IconBtn title={published ? '學生視角預覽正式版' : '尚未發佈，無法預覽'} onClick={() => onPreview(quiz)} disabled={!published}><Eye className="h-4 w-4" /></IconBtn>
                <IconBtn title={published ? '派遣正式版給學生' : '尚未發佈，無法派遣'} onClick={() => onAssign(quiz)} disabled={!published}><Send className="h-4 w-4" /></IconBtn>
                <IconBtn title={quiz.draft ? '繼續編輯草稿' : '編輯考卷'} onClick={() => onEdit(quiz)}><Pencil className="h-4 w-4" /></IconBtn>
                <IconBtn title={quiz.draft ? '複製草稿為新考卷' : '複製考卷'} onClick={() => onCopy(quiz)} disabled={!!copyingKey}>
                  {copyingKey === quiz.key ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                </IconBtn>
                <IconBtn title={published ? (published.is_active ? '停用正式版' : '啟用正式版') : '尚未發佈'} onClick={() => onToggle(quiz)} disabled={!published}><Power className="h-4 w-4" /></IconBtn>
                <IconBtn title={quiz.draft ? '刪除草稿' : '刪除考卷'} danger onClick={() => onDelete(quiz)}><Trash2 className="h-4 w-4" /></IconBtn>
              </div>
            </td>
          </tr>
        );})}</tbody>
      </table>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger, disabled }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-50 xl:h-7 xl:w-7 ${danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

// ===== 派遣對話框（批次） =====
function AssignDialog({ quiz, onClose }: { quiz: AdminQuizItem; onClose: (changed: boolean) => void }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState('');
  const [hasDue, setHasDue] = useState(false);
  const [due, setDue] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [availableAt, setAvailableAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    Promise.all([adminListUsers(), adminQuizDetail(quiz.quiz_id, quiz.quiz_version)]).then(([u, d]) => {
      if (u?.ok) setUsers((u.items || []).filter((x: UserItem) => x.role !== 'admin' && x.is_active));
      if (d?.ok) {
        const set = new Set<string>((d.assignments || []).map((a: { account: string }) => a.account));
        setAssigned(set);
        setChecked(new Set(set));
        const first = (d.assignments || [])[0];
        if (first?.attempt_limit != null) setLimit(String(first.attempt_limit));
        if (first?.due_at) {
          setHasDue(true);
          setDue(toDateTimeLocal(first.due_at));
        }
        if (first?.available_at) {
          setScheduled(true);
          setAvailableAt(toDateTimeLocal(first.available_at));
        }
      }
      setLoaded(true);
    });
  }, [quiz]);

  const toggle = (acc: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(acc)) next.delete(acc);
      else next.add(acc);
      return next;
    });
  };

  const save = async () => {
    if (scheduled && !availableAt) {
      setMsg('請選擇派遣生效時間。');
      return;
    }
    if (hasDue && !due) {
      setMsg('請選擇截止時間。');
      return;
    }
    const availableIso = scheduled ? new Date(availableAt).toISOString() : null;
    const dueIso = hasDue ? new Date(due).toISOString() : null;
    if (availableIso && dueIso && new Date(dueIso) <= new Date(availableIso)) {
      setMsg('截止時間必須晚於派遣生效時間。');
      return;
    }
    setBusy(true);
    setMsg('');
    const toAdd = [...checked];
    const toRemove = [...assigned].filter((a) => !checked.has(a));
    let ok = true;
    if (toAdd.length) {
      const r = await adminAssign({
        quiz_id: quiz.quiz_id, quiz_version: quiz.quiz_version, accounts: toAdd,
        attempt_limit: limit.trim() === '' ? null : Number(limit),
        due_at: dueIso,
        available_at: availableIso,
      });
      ok = ok && !!r?.ok;
    }
    if (toRemove.length) {
      const r = await adminUnassign(quiz.quiz_id, quiz.quiz_version, toRemove);
      ok = ok && !!r?.ok;
    }
    setBusy(false);
    if (ok) {
      setChanged(true);
      onClose(true);
    } else setMsg('儲存時發生錯誤，請確認時間設定後重試。');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-y-auto">
        <CardContent className="flex flex-col gap-4 px-4 py-5 sm:px-6">
          <div>
            <h3 className="font-serif text-lg font-bold">派遣「{quiz.title}」</h3>
            <p className="text-sm text-muted-foreground">勾選要指派的學生；取消勾選會移除派遣。</p>
          </div>

          <div className="space-y-1">
              <Label>作答次數上限</Label>
              <Input placeholder="留空=不限" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`space-y-3 rounded border p-3 ${scheduled ? 'border-primary/50 bg-primary/[0.04]' : 'border-border'}`}>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={scheduled} onCheckedChange={(checked) => setScheduled(!!checked)} />
                定時派遣
              </label>
              {scheduled && (
                <div className="space-y-1">
                  <Label>派遣生效時間</Label>
                  <Input type="datetime-local" value={availableAt} onChange={(event) => setAvailableAt(event.target.value)} />
                  <p className="text-xs text-muted-foreground">時間到之前無法開始作答。</p>
                </div>
              )}
            </div>

            <div className={`space-y-3 rounded border p-3 ${hasDue ? 'border-primary/50 bg-primary/[0.04]' : 'border-border'}`}>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={hasDue} onCheckedChange={(checked) => setHasDue(!!checked)} />
                設定截止時間
              </label>
              {hasDue && (
                <div className="space-y-1">
                  <Label>截止時間</Label>
                  <Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} />
                  <p className="text-xs text-muted-foreground">超過這個時間後無法開始或繼續作答。</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">已選 {checked.size} / {users.length} 位學生</span>
            <div className="flex gap-2">
              <button className="text-primary hover:underline" onClick={() => setChecked(new Set(users.map((u) => u.account)))}>全選</button>
              <button className="text-primary hover:underline" onClick={() => setChecked(new Set())}>全不選</button>
            </div>
          </div>

          <div className="max-h-60 shrink-0 space-y-1 overflow-y-auto rounded border border-border p-2">
            {!loaded ? (
              <p className="py-4 text-center text-sm text-muted-foreground">載入中…</p>
            ) : users.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">沒有可派遣的學生帳號，請先到「帳號管理」新增。</p>
            ) : (
              users.map((u) => (
                <label key={u.account} className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary">
                  <Checkbox checked={checked.has(u.account)} onCheckedChange={() => toggle(u.account)} />
                  <span className="min-w-0 break-all text-sm">{u.display_name}</span>
                  <span className="min-w-0 break-all text-xs text-muted-foreground">({u.account})</span>
                  {assigned.has(u.account) && <Badge variant="secondary" className="ml-auto text-[10px]">已派遣</Badge>}
                </label>
              ))
            )}
          </div>

          {msg && <p className="text-sm text-destructive">{msg}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onClose(changed)}>取消</Button>
            <Button onClick={save} disabled={busy || !loaded}>{busy ? '儲存中…' : '儲存派遣'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
