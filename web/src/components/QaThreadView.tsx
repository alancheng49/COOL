import MarkdownMath from '@/components/MarkdownMath';
import { fmtPostTime } from '@/pages/admin/Posts';
import type { QaMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GraduationCap, UserRound } from 'lucide-react';

/** 提問討論串的訊息列表(師生共用) */
export default function QaThreadView({ messages }: { messages: QaMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => {
        const isTeacher = m.role === 'admin';
        return (
          <div
            key={i}
            className={cn(
              'rounded-lg border p-3',
              isTeacher ? 'border-primary/40 bg-primary/5' : 'bg-card'
            )}
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              {isTeacher ? <GraduationCap className="h-3.5 w-3.5 text-primary" /> : <UserRound className="h-3.5 w-3.5" />}
              <span className={cn('font-semibold', isTeacher && 'text-primary')}>
                {m.sender}{isTeacher ? '（老師）' : ''}
              </span>
              <span>{fmtPostTime(m.created_at)}</span>
            </div>
            <MarkdownMath md={m.content} className="text-sm" />
          </div>
        );
      })}
    </div>
  );
}
