import { useState } from 'react';
import { Input } from '@/components/ui/input';

/** 輸入中保留原始字串（才打得出 0.5），離開欄位或按 Enter 才寫回；不合法的值還原 */
export default function PointsInput({ value, onCommit, label, className }: { value: number; onCommit: (points: number) => void; label: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const points = Math.round(Number(text) * 100) / 100;
    if (Number.isFinite(points) && points > 0 && points !== value) onCommit(points);
    setText(null);
  };
  return (
    <Input
      inputMode="decimal"
      aria-label={label}
      className={className}
      value={text ?? String(value)}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
  );
}
