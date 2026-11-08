import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import PointsInput from '@/components/PointsInput';
import { type EditQ, QUESTION_TYPE_LABELS } from '@/lib/quiz-editor';
import { cn } from '@/lib/utils';

const EDGE_SIZE = 32;
const EDGE_SCROLL_SPEED = 8;

function summary(question: EditQ) {
  const stem = question.question_content.trim();
  if (stem) return stem;
  if (question.pdf_region) return `PDF 第 ${question.pdf_region.page} 頁`;
  return question.question_image ? '（圖片題幹）' : '（尚無題幹）';
}

/** 題目清單：拖動把手調整順序、直接改配分、點題目跳到該題 */
export default function QuestionOutline({ questions, onMove, onPointsChange, onJump, className }: {
  questions: EditQ[];
  onMove: (from: number, to: number) => void;
  onPointsChange: (index: number, points: number) => void;
  onJump: (index: number) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const pointerY = useRef(0);
  // slot 是插入位置（0 ~ 題數），放開時才真正移動
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);
  const dragging = !!drag;

  const slotAt = (clientY: number) => {
    const rows = Array.from(listRef.current?.children || []);
    const slot = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return slot === -1 ? rows.length : slot;
  };

  // 拖到清單上下緣時自動捲動，長考卷才拖得到遠處
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const tick = () => {
      const list = listRef.current;
      if (list) {
        const { top, bottom } = list.getBoundingClientRect();
        const delta = pointerY.current < top + EDGE_SIZE ? -EDGE_SCROLL_SPEED : pointerY.current > bottom - EDGE_SIZE ? EDGE_SCROLL_SPEED : 0;
        if (delta) {
          list.scrollTop += delta;
          const slot = slotAt(pointerY.current);
          setDrag((current) => current && { ...current, slot });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  const drop = () => {
    if (drag) onMove(drag.from, drag.slot > drag.from ? drag.slot - 1 : drag.slot);
    setDrag(null);
  };

  const total = Math.round(questions.reduce((sum, question) => sum + Number(question.points || 0), 0) * 100) / 100;
  const showSlot = (slot: number) => !!drag && drag.slot === slot && slot !== drag.from && slot !== drag.from + 1;

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <span className="text-sm font-medium">題目清單</span>
        <span className="text-xs text-muted-foreground">{questions.length} 題 · {total} 分</span>
      </div>
      {questions.length === 0 ? (
        <p className="px-1 py-4 text-center text-xs text-muted-foreground">尚無題目</p>
      ) : (
        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {questions.map((question, index) => (
            <li key={index} className={cn('relative flex items-center gap-1 rounded-md pr-1 hover:bg-secondary/60', drag?.from === index && 'bg-secondary opacity-50')}>
              {showSlot(index) && <div className="absolute inset-x-0 -top-px h-0.5 bg-primary" />}
              {index === questions.length - 1 && showSlot(questions.length) && <div className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
              <button
                type="button"
                title="拖動以調整順序"
                aria-label={`拖動第 ${index + 1} 題`}
                className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing md:h-8"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pointerY.current = event.clientY;
                  setDrag({ from: index, slot: index });
                }}
                onPointerMove={(event) => {
                  if (!drag) return;
                  pointerY.current = event.clientY;
                  const slot = slotAt(event.clientY);
                  setDrag((current) => current && { ...current, slot });
                }}
                onPointerUp={drop}
                onPointerCancel={() => setDrag(null)}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm" onClick={() => onJump(index)}>
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-primary">{index + 1}</span>
                <span className="shrink-0 rounded bg-secondary px-1 text-xs text-muted-foreground">{QUESTION_TYPE_LABELS[question.question_type]}</span>
                <span className="truncate text-xs text-muted-foreground">{summary(question)}</span>
              </button>
              <PointsInput className="h-7 w-12 shrink-0 bg-card px-1 text-center" label={`第 ${index + 1} 題配分`} value={question.points} onCommit={(points) => onPointsChange(index, points)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
