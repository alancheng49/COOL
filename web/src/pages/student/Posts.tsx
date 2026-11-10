import { useEffect, useMemo, useState } from 'react';
import { postsList, unreadStatus, markPostRead } from '@/lib/api';
import type { PostItem, TagDef } from '@/lib/types';
import { TagChip, PostReader, fmtPostTime } from '@/pages/admin/Posts';
import { Card, CardContent } from '@/components/ui/card';
import { Paperclip, ChevronLeft } from 'lucide-react';

export default function StudentPosts() {
  const [items, setItems] = useState<PostItem[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string[]>([]); // 選中的標籤
  const [open, setOpen] = useState<PostItem | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    postsList().then((r) => {
      if (r?.ok) {
        setItems(r.items || []);
        setTags(r.tags || []);
      }
      setLoading(false);
    });
    unreadStatus().then((r) => {
      if (r?.ok) setUnreadIds(new Set<string>(r.unread_post_ids || []));
    });
  }, []);

  const openPost = (p: PostItem) => {
    setOpen(p);
    if (unreadIds.has(p.id)) {
      setUnreadIds((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
      void markPostRead(p.id); // 標為已讀,側欄紅點同步更新
    }
  };

  // 只顯示實際被使用的標籤
  const usedTags = useMemo(() => {
    const used = new Set(items.flatMap((p) => p.tags));
    return tags.filter((t) => used.has(t.name));
  }, [items, tags]);

  const shown = useMemo(
    () => (filter.length === 0 ? items : items.filter((p) => filter.every((t) => p.tags.includes(t)))),
    [items, filter]
  );

  // 閱讀模式:直接在頁面呈現,不加外框
  if (open) {
    return (
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => setOpen(null)}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />回公告列表
        </button>
        <PostReader post={open} tags={tags} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-serif text-xl font-bold">公告</h2>
      </div>

      {/* 標籤搜尋 */}
      {usedTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">標籤篩選：</span>
          {usedTags.map((t) => {
            const on = filter.includes(t.name);
            return (
              <button
                key={t.name}
                onClick={() => setFilter((prev) => (on ? prev.filter((x) => x !== t.name) : [...prev, t.name]))}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all"
                style={on
                  ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                  : { borderColor: t.color, color: t.color }}
              >
                {t.name}
              </button>
            );
          })}
          {filter.length > 0 && (
            <button onClick={() => setFilter([])} className="text-xs text-muted-foreground underline">
              清除
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {items.length === 0 ? '目前沒有公告。' : '沒有符合標籤的公告。'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => openPost(p)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {unreadIds.has(p.id) && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" title="未讀" />}
                  <span className="font-medium">{p.title}</span>
                  {p.tags.map((t) => <TagChip key={t} name={t} tags={tags} />)}
                  {p.attachments.length > 0 && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.author || '老師'}・{fmtPostTime(p.created_at)}
                </p>
              </div>
              <span className="shrink-0 text-xs text-primary">閱讀</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
