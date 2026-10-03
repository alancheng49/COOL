import { useEffect, useRef, useState } from 'react';
import { adminListUsers } from '@/lib/api';
import type { UserItem } from '@/lib/types';
import { Users } from 'lucide-react';

/**
 * 派遣名單名片(管理員專用):顯示派遣摘要文字,游標移上去列出被派遣的學生。
 * 若名單涵蓋所有啟用中的學生(或 audience 為 all),直接顯示「所有學生」。
 * 名片用 position:fixed 定位,不會被表格的 overflow 容器夾住或撐變形。
 */
export default function AssignHoverCard({
  accounts,
  audience,
  label,
}: {
  accounts: string[];
  audience?: 'all' | 'selected';
  label?: string; // 觸發文字;不給就自動產生
}) {
  const [students, setStudents] = useState<UserItem[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null); // null = 不顯示
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let alive = true;
    void adminListUsers().then((r) => {
      if (alive && r?.ok) {
        setStudents((r.items || []).filter((u: UserItem) => u.role.toLowerCase() !== 'admin' && u.is_active));
      }
    });
    return () => { alive = false; };
  }, []);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 貼齊觸發文字下緣;太靠近視窗底部就往上開
    const up = rect.bottom + 230 > window.innerHeight;
    setPos({ x: Math.min(rect.left, window.innerWidth - 260), y: up ? rect.top : rect.bottom, up });
  };

  const accSet = new Set(accounts);
  const assigned = students.filter((u) => accSet.has(u.account));
  const isAll = audience === 'all' || (students.length > 0 && assigned.length === students.length);
  const text = label ?? (audience === 'all' ? '所有學生' : `${accounts.length} 人`);

  return (
    <span className="inline-block" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      <span ref={triggerRef} className="cursor-help underline decoration-dotted underline-offset-2">{text}</span>
      {pos && (
        <span
          className="pointer-events-none fixed z-50 w-60 rounded-lg border border-border bg-popover p-3 text-left shadow-lg"
          style={pos.up
            ? { left: pos.x, bottom: window.innerHeight - pos.y + 4 }
            : { left: pos.x, top: pos.y + 4 }}
        >
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Users className="h-3.5 w-3.5" />派遣對象
          </span>
          {isAll ? (
            <span className="block text-sm font-semibold text-popover-foreground">所有學生</span>
          ) : assigned.length === 0 ? (
            <span className="block text-xs text-muted-foreground">（尚未派遣給任何學生）</span>
          ) : (
            <span className="block max-h-44 overflow-y-auto">
              {assigned.map((u) => (
                <span key={u.account} className="block text-xs leading-5 text-popover-foreground">
                  {u.display_name} <span className="text-muted-foreground">({u.account})</span>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
