import { useState } from 'react';
import MathHtml from './MathHtml';
import { clozeBlankLabel } from '@/lib/cloze';
import type { GroupAnswerValue, Question, ShortAnswerValue, SubQuestion, UserAnswer } from '@/lib/types';
import { cn } from '@/lib/utils';
import ShortAnswerInput from './ShortAnswerInput';

interface Props {
  q: Question;
  value: UserAnswer;
  onChange: (v: UserAnswer) => void;
  disabled?: boolean;
}

/** 作答區：choice 單選 / cloze 逐格選 token */
export default function AnswerArea({ q, value, onChange, disabled }: Props) {
  const type = (q.question_type || '').toLowerCase();

  if (type === 'choice') {
    return (
      <div className="space-y-2">
        {(q.options || []).map((opt, k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(k)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors',
              value === k
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border bg-card hover:border-primary/50',
              disabled && 'cursor-default opacity-70'
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                value === k ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
              )}
            >
              {String.fromCharCode(65 + k)}
            </span>
            <MathHtml html={opt} className="min-w-0 flex-1" />
            {q.option_images?.[k] && <img src={q.option_images[k] || ''} alt={`選項 ${String.fromCharCode(65 + k)}`} className="max-h-32 max-w-[45%] object-contain" />}
          </button>
        ))}
      </div>
    );
  }

  if (type === 'multi') {
    const sel = new Set((Array.isArray(value) ? value : []).filter((v): v is number => v != null));
    const toggle = (k: number) => {
      const next = new Set(sel);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      onChange([...next].sort((a, b) => a - b));
    };
    return (
      <div className="space-y-2">
        {(q.options || []).map((opt, k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => toggle(k)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors',
              sel.has(k)
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border bg-card hover:border-primary/50',
              disabled && 'cursor-default opacity-70'
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-semibold',
                sel.has(k) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
              )}
            >
              {sel.has(k) ? '✓' : String.fromCharCode(65 + k)}
            </span>
            <MathHtml html={opt} className="min-w-0 flex-1" />
            {q.option_images?.[k] && <img src={q.option_images[k] || ''} alt={`選項 ${String.fromCharCode(65 + k)}`} className="max-h-32 max-w-[45%] object-contain" />}
          </button>
        ))}
      </div>
    );
  }

  if (type === 'cloze') {
    // 小題制:大題敘述固定(在 QuestionStem),這裡切換小題內容與作答區
    if (Array.isArray(q.sub_questions) && q.sub_questions.length) {
      return <SubCloze q={q} value={value} onChange={onChange} disabled={disabled} />;
    }
    // 舊格式:單一填充
    const arr = Array.isArray(value) ? (value as (number | undefined)[]) : [];
    return (
      <ClozeBlanks
        template={q.cloze_template}
        sets={q.cloze_options || []}
        arr={arr}
        onPick={(blankIdx, tokenIdx) => {
          const sets = q.cloze_options || [];
          const next = Array.isArray(value) ? [...(value as (number | undefined)[])] : new Array(sets.length).fill(undefined);
          next[blankIdx] = tokenIdx;
          onChange(next);
        }}
        disabled={disabled}
      />
    );
  }

  if (type === 'short_answer') {
    const answer = value && !Array.isArray(value) && typeof value === 'object' && 'text' in value
      ? value as ShortAnswerValue
      : { text: '', images: [] };
    return <ShortAnswerInput value={answer} onChange={onChange} disabled={disabled} />;
  }

  if (type === 'group') {
    const parts = q.group_questions || [];
    const answer = value && !Array.isArray(value) && typeof value === 'object' && 'parts' in value
      ? value as GroupAnswerValue
      : { parts: [] };
    return <QuestionGroup parts={parts} value={answer} onChange={onChange} disabled={disabled} />;
  }

  return <p className="text-destructive">未知題型：{q.question_type}</p>;
}

function partAsQuestion(part: SubQuestion): Question {
  return {
    ...part,
    question_type: part.question_type || 'cloze',
    question_content: part.question_content ?? part.content,
  };
}

function QuestionGroup({ parts, value, onChange, disabled }: {
  parts: SubQuestion[];
  value: GroupAnswerValue;
  onChange: (value: UserAnswer) => void;
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const part = parts[Math.min(current, parts.length - 1)];
  if (!part) return <p className="text-muted-foreground">此題組尚無小題。</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {parts.map((item, index) => (
          <button key={index} type="button" aria-pressed={index === current} onClick={() => setCurrent(index)} className={cn('min-h-11 rounded-md border px-3 py-1.5 text-sm md:min-h-0', index === current ? 'border-primary bg-primary text-primary-foreground' : value.parts[index] !== undefined ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-border bg-card')}>
            ({index + 1}){item.points ? ` ${item.points}分` : ''}
          </button>
        ))}
      </div>
      {(part.question_content || part.content || part.question_image) && <div className="rounded-md bg-secondary/40 p-3"><QuestionPartStem part={part} /></div>}
      <AnswerArea
        q={partAsQuestion(part)}
        value={value.parts[current]}
        disabled={disabled}
        onChange={(nextPart) => {
          const next = [...value.parts];
          next[current] = nextPart;
          onChange({ parts: next });
        }}
      />
    </div>
  );
}

function QuestionPartStem({ part }: { part: SubQuestion }) {
  return <div className="space-y-2">{(part.question_content || part.content) && <MathHtml html={part.question_content || part.content || ''} />}{part.question_image && <img src={part.question_image} alt="小題附圖" className="max-h-64 max-w-full object-contain" />}</div>;
}

/** 填充題的空格作答區（單一小題共用） */
function ClozeBlanks({
  template, sets, arr, onPick, disabled,
}: {
  template?: string;
  sets: string[][];
  arr: (number | undefined)[];
  onPick: (blankIdx: number, tokenIdx: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {template && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">答案樣式</p>
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
            <MathHtml html={template} className="text-lg" highlightClozeBlanks />
          </div>
        </div>
      )}
      {sets.map((choices, blankIdx) => (
        <div key={blankIdx} className="flex flex-wrap items-center gap-2">
          <span className="cloze-answer-label shrink-0" role="img" aria-label={`第 ${blankIdx + 1} 格`}>
            {clozeBlankLabel(blankIdx + 1)}
          </span>
          {choices.map((tokenHtml, tokenIdx) => (
            <button
              key={tokenIdx}
              type="button"
              disabled={disabled}
              onClick={() => onPick(blankIdx, tokenIdx)}
              className={cn(
                'min-h-11 min-w-11 max-w-full rounded border px-2.5 py-1.5 text-sm transition-colors md:min-h-0 md:min-w-9',
                arr[blankIdx] === tokenIdx
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:border-primary/50',
                disabled && 'cursor-default opacity-70'
              )}
            >
              <MathHtml html={tokenHtml} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 填充題小題制:小題切換頁籤 + 小題內容 + 該小題作答區 */
function SubCloze({ q, value, onChange, disabled }: Props) {
  const subs = q.sub_questions || [];
  const [cur, setCur] = useState(0);
  const nested: (number | undefined)[][] = Array.isArray(value)
    ? (value as (number | undefined)[][])
    : subs.map(() => []);

  const subAnswered = (si: number) => {
    const sets = subs[si]?.cloze_options || [];
    const a = nested[si];
    return Array.isArray(a) && sets.length > 0 && sets.every((_, bi) => a[bi] !== undefined && a[bi] !== null);
  };

  const sub = subs[Math.min(cur, subs.length - 1)];
  const subArr = Array.isArray(nested[cur]) ? nested[cur] : [];

  return (
    <div className="space-y-4">
      {/* 小題頁籤 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {subs.map((s, si) => (
          <button
            key={si}
            type="button"
            onClick={() => setCur(si)}
            className={cn(
              'min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors md:min-h-0',
              si === cur
                ? 'border-primary bg-primary text-primary-foreground'
                : subAnswered(si)
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                  : 'border-border bg-card hover:border-primary/50'
            )}
          >
            ({si + 1}){s.points ? <span className="ml-1 text-xs opacity-70">{s.points}分</span> : null}
          </button>
        ))}
      </div>

      {/* 小題內容 */}
      {sub?.content && (
        <div className="rounded-md bg-secondary/50 px-4 py-3">
          <MathHtml html={sub.content} className="leading-relaxed" />
        </div>
      )}

      {/* 小題作答 */}
      <ClozeBlanks
        template={sub?.cloze_template}
        sets={sub?.cloze_options || []}
        arr={subArr}
        onPick={(blankIdx, tokenIdx) => {
          const next = subs.map((s, si) => {
            const cur2 = Array.isArray(nested[si]) ? [...nested[si]] : new Array((s.cloze_options || []).length).fill(undefined);
            return cur2;
          });
          next[cur][blankIdx] = tokenIdx;
          onChange(next);
        }}
        disabled={disabled}
      />
    </div>
  );
}
