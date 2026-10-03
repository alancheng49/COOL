import { useEffect, useRef, useState } from 'react';
import { adminListUsers } from '@/lib/api';
import { IdCard } from 'lucide-react';

interface UserInfo { account: string; display_name: string; note?: string }

/**
 * 學生名片(管理員專用):顯示帳號,游標移上去浮出小名片
 * (帳號 / 顯示名稱 / 老師備註)。資料來自 adminListUsers 快取,不會重複打 API。
 * 名片用 position:fixed 定位,不會被表格的 overflow 容器夾住或撐出捲軸。
 */
export default function UserHoverCard({ account }: { account: string }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null); // null = 不顯示
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let alive = true;
    void adminListUsers().then((r) => {
      if (alive && r?.ok) {
        const u = (r.items || []).find((x: UserInfo) => x.account === account);
        if (u) setUser(u);
      }
    });
    return () => { alive = false; };
  }, [account]);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 貼齊觸發文字下緣;太靠近視窗底部就往上開
    const up = rect.bottom + 180 > window.innerHeight;
    setPos({ x: Math.min(rect.left, window.innerWidth - 240), y: up ? rect.top : rect.bottom, up });
  };

  return (
    <span className="inline-block" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      <span ref={triggerRef} className="cursor-help font-medium underline decoration-dotted underline-offset-2">
        {account}
      </span>
      {pos && (
        <span
          className="pointer-events-none fixed z-50 w-56 rounded-lg border border-border bg-popover p-3 text-left shadow-lg"
          style={pos.up
            ? { left: pos.x, bottom: window.innerHeight - pos.y + 4 }
            : { left: pos.x, top: pos.y + 4 }}
        >
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <IdCard className="h-3.5 w-3.5" />學生資訊
          </span>
          <span className="block text-sm font-semibold text-popover-foreground">{user?.display_name || '—'}</span>
          <span className="block text-xs text-muted-foreground">帳號：{account}</span>
          <span className="mt-1.5 block border-t border-border pt-1.5 text-xs">
            {user?.note
              ? <span className="whitespace-pre-wrap text-popover-foreground">{user.note}</span>
              : <span className="text-muted-foreground">（沒有備註）</span>}
          </span>
        </span>
      )}
    </span>
  );
}
