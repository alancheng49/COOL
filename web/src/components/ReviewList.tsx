import { useState, type ReactNode } from 'react';
import MathHtml from './MathHtml';
import MarkdownMath from './MarkdownMath';
import QuestionStem from './QuestionStem';
import type { KeyInfo, Question, ServerAnswer, ServerPartAnswer, SubQuestion } from '@/lib/types';
import { qaCreate, type AiTutorMessage } from '@/lib/api';
import AiTutorDialog from './AiTutorDialog';
import QaComposer from './QaComposer';
import { validPdfRegion } from '@/lib/pdf-region';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, CircleHelp, Sparkles, X } from 'lucide-react';

interface Props {
  questions: Question[] | null; // 可能已被伺服器剝除 answer 欄位
  answers: ServerAnswer[];
  keys: KeyInfo[]; // 伺服器回傳的正解
  quizContext?: { quiz_id: string; quiz_version: number; quiz_title: string };
  attemptId?: string; // 有值時顯示「問 AI」
  pdfUrl?: string; // PDF 模式的題本,問 AI 時截取題目範圍
  renderManualGrade?: (target: ManualGradeTarget) => ReactNode;
}

export interface ManualGradeTarget {
  id: string;
  q_index: number;
  sub_index: number | null;
  max: number;
}

function fmtClozeSets(sets: string[][], idxArr: (number | null | undefined)[] | undefined): string {
  if (!idxArr || !idxArr.some((v) => v != null)) return '<em>（未作答）</em>';
  return idxArr
    .map((i, b) => (i != null && sets[b]?.[i] != null ? sets[b][i] : '<span style="opacity:.5">∅</span>'))
    .join(', ');
}

function fmtCloze(q: Question | undefined, idxArr: (number | null | undefined)[] | undefined): string {
  return fmtClozeSets(q?.cloze_options || [], idxArr);
}

function fmtChoice(q: Question | undefined, idx: number | null | undefined): string {
  if (idx == null) return '<em>（未作答）</em>';
  const opt = q?.options?.[idx];
  return opt != null ? `${String.fromCharCode(65 + idx)}. ${opt}` : `選項 ${idx + 1}`;
}

function fmtMulti(q: Question | undefined, idxArr: number[] | undefined): string {
  if (!idxArr || !idxArr.length) return '<em>（未作答）</em>';
  return [...idxArr]
    .sort((a, b) => a - b)
    .map((i) => {
      const opt = q?.options?.[i];
      return opt != null ? `${String.fromCharCode(65 + i)}. ${opt}` : `選項 ${i + 1}`;
    })
    .join('；'); // 全形分號
}

// 多選題計分：max(x - (x/n)*2m, 0),m = 判錯選項數；未作答 0 分
function multiEarned(k: KeyInfo, sel: number[]): number {
  const corr = (k.correct_indices || []).map(Number);
  const n = k.option_count || corr.length || 1;
  if (!sel.length) return 0;
  const selSet = new Set(sel);
  const corrSet = new Set(corr);
  let m = 0;
  for (let oi = 0; oi < n; oi++) if (selSet.has(oi) !== corrSet.has(oi)) m++;
  return Math.round(Math.max(k.points - (k.points / n) * 2 * m, 0) * 100) / 100;
}

/** 每題作答檢討（交卷後 / 歷史詳情 / 管理端皆共用） */
export default function ReviewList({ questions, answers, keys, quizContext, attemptId, pdfUrl, renderManualGrade }: Props) {
  const sorted = [...keys].sort((a, b) => a.q_index - b.q_index);
  const [explainFor, setExplainFor] = useState<KeyInfo | null>(null);
  const [askFor, setAskFor] = useState<KeyInfo | null>(null);
  const [aiFor, setAiFor] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState('auto');
  const [aiThreads, setAiThreads] = useState<Record<string, AiTutorMessage[]>>({});
  const aiThreadKey = `${attemptId}:${aiFor}`;
  return (
    <div className="space-y-4">
      {aiFor != null && attemptId && (
        <AiTutorDialog
          attemptId={attemptId}
          questionIndex={aiFor}
          pdfUrl={pdfUrl}
          pdfRegion={validPdfRegion(questions?.[aiFor]?.pdf_region)}
          model={aiModel}
          onModelChange={setAiModel}
          messages={aiThreads[aiThreadKey] || []}
          onMessagesChange={(messages) => setAiThreads((threads) => ({ ...threads, [aiThreadKey]: messages }))}
          onClose={() => setAiFor(null)}
        />
      )}
      {explainFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setExplainFor(null)}
        >
          <Card className="flex max-h-[85vh] w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
            <CardContent className="min-h-0 flex-1 overflow-y-auto py-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-serif text-lg font-bold">第 {explainFor.q_index + 1} 題詳解</h3>
                <Button variant="ghost" size="sm" onClick={() => setExplainFor(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <MarkdownMath md={explainFor.explanation || ''} className="text-sm" />
            </CardContent>
          </Card>
        </div>
      )}
      {askFor && quizContext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setAskFor(null)}>
          <Card className="w-full max-w-xl" onClick={(event) => event.stopPropagation()}>
            <CardContent className="space-y-3 py-5">
              <div className="flex items-center justify-between">
                <div><h3 className="font-serif text-lg font-bold">第 {askFor.q_index + 1} 題：我不會</h3><p className="text-xs text-muted-foreground">送出後會出現在提問區，老師可直接看到測驗與題號。</p></div>
                <Button variant="ghost" size="sm" onClick={() => setAskFor(null)}><X className="h-4 w-4" /></Button>
              </div>
              <QaComposer budgetUsed={0} submitLabel="送出提問" onSubmit={async (content, images) => {
                const response = await qaCreate({ title: `${quizContext.quiz_title}・第 ${askFor.q_index + 1} 題`, content, images, context: { ...quizContext, question_index: askFor.q_index } });
                if (response?.ok) { setAskFor(null); return true; }
                return false;
              }} />
            </CardContent>
          </Card>
        </div>
      )}
      {sorted.map((k) => {
        const q = questions?.[k.q_index];
        const ans = answers.find((a) => a.q_index === k.q_index);
        const isCloze = k.type === 'cloze';
        const isMulti = k.type === 'multi';
        const isShort = k.type === 'short_answer';
        const isGroup = k.type === 'group';

        const isSubCloze = isCloze && Array.isArray(k.subs) && k.subs.length > 0;

        const multiSel = isMulti
          ? ((ans?.selected_indices || []).filter((v) => v != null) as number[]).map(Number)
          : [];
        // 各小題結果(伺服器沒回 earned 時,前端以正解比對計算)
        const subResults = isSubCloze
          ? (k.subs || []).map((sub, si) => {
              const got = (ans?.sub_answers || [])[si];
              const ok = sub.correct ?? (JSON.stringify((got || []).map((v) => (v == null ? null : Number(v)))) === JSON.stringify(sub.correct_indices));
              return { ...sub, correct: ok, earned: sub.earned ?? (ok ? sub.points : 0) };
            })
          : [];
        const earned = isShort || isGroup
          ? (k.earned ?? 0)
          : isMulti
          ? (k.earned ?? multiEarned(k, multiSel))
          : isSubCloze
            ? (k.earned ?? subResults.reduce((sum, sub) => sum + sub.earned, 0))
            : undefined;

        const correct = isShort || isGroup
          ? !!k.correct
          : isMulti
          ? earned === k.points
          : isSubCloze
            ? earned === k.points
            : (k.correct ??
            (isCloze
              ? JSON.stringify(ans?.selected_indices ?? null) === JSON.stringify(k.correct_indices)
              : ans?.selected_index != null && Number(ans.selected_index) === k.correct_index));

        const yourHtml = isMulti
          ? fmtMulti(q, multiSel)
          : isCloze
            ? fmtCloze(q, ans?.selected_indices)
            : isShort || isGroup ? '' : fmtChoice(q, ans?.selected_index);
        const corrHtml = isMulti
          ? fmtMulti(q, k.correct_indices)
          : isCloze
            ? fmtCloze(q, k.correct_indices)
            : isShort || isGroup ? '' : fmtChoice(q, k.correct_index);

        const partial = (isMulti || isSubCloze) && !correct && (earned || 0) > 0;

        return (
          <div
            key={k.q_index}
            className={cn(
              'rounded-lg border bg-card p-4',
              k.grading_status === 'pending' ? 'border-border' : correct ? 'border-emerald-300' : partial ? 'border-amber-300' : 'border-red-300'
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="shrink-0 font-semibold">
                第 {k.q_index + 1} 題
                {isMulti && <span className="ml-1.5 text-xs font-normal text-muted-foreground">（多選）</span>}
              </span>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <Badge
                  variant={correct ? 'default' : 'destructive'}
                  className={cn('order-last', correct ? 'bg-emerald-600 hover:bg-emerald-600' : partial ? 'bg-amber-500 hover:bg-amber-500' : '')}
                >
                  {k.grading_status === 'pending' ? '待批改' : `${isMulti || isSubCloze || isShort || isGroup ? earned : correct ? k.points : 0} / ${k.points} 分`}
                </Badge>
                {k.explanation && (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setExplainFor(k)}>
                    <BookOpen className="mr-1 h-3.5 w-3.5" />查看詳解
                  </Button>
                )}
                {attemptId && (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAiFor(k.q_index)}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />問 AI
                  </Button>
                )}
                {quizContext && (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAskFor(k)}>
                    <CircleHelp className="mr-1 h-3.5 w-3.5" />我不會
                  </Button>
                )}
              </div>
            </div>
            {q ? (
              <div className="mb-3 space-y-2">
                <QuestionStem q={q} index={k.q_index} />
                {isCloze && q.cloze_template && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">答案樣式</p>
                    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
                      <MathHtml html={q.cloze_template} highlightClozeBlanks />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">（題目檔已不存在，僅顯示作答索引）</p>
            )}
            {isShort ? (
              <div className="space-y-3">
                <ShortReview answer={ans} feedback={(k as KeyInfo & { feedback?: string }).feedback} />
                {renderManualGrade?.({ id: `${k.q_index}`, q_index: k.q_index, sub_index: null, max: k.points })}
              </div>
            ) : isGroup ? (
              <GroupReview question={q} answer={ans} keyInfo={k} qIndex={k.q_index} renderManualGrade={renderManualGrade} />
            ) : isSubCloze ? (
              <div className="space-y-3">
                {subResults.map((sub, si) => {
                  const subQ = q?.sub_questions?.[si];
                  const got = (ans?.sub_answers || [])[si];
                  return (
                    <div
                      key={si}
                      className={cn(
                        'rounded-md border px-3 py-2.5',
                        sub.correct ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'
                      )}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold">（{si + 1}）</span>
                        <span className={cn('shrink-0 text-xs font-semibold', sub.correct ? 'text-emerald-700' : 'text-red-700')}>
                          {sub.earned} / {sub.points} 分
                        </span>
                      </div>
                      {subQ?.content && <MathHtml html={subQ.content} className="mb-1.5 text-sm" />}
                      {subQ?.cloze_template && (
                        <div className="mb-1.5 rounded border border-dashed border-primary/30 bg-primary/5 px-2.5 py-1.5 text-sm">
                          <MathHtml html={subQ.cloze_template} highlightClozeBlanks />
                        </div>
                      )}
                      <div className="grid gap-0.5 text-sm">
                        <div className="flex gap-2">
                          <span className="shrink-0 font-medium text-red-700">你的答案：</span>
                          <MathHtml html={fmtClozeSets(subQ?.cloze_options || [], got)} />
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 font-medium text-emerald-700">正確答案：</span>
                          <MathHtml html={fmtClozeSets(subQ?.cloze_options || [], sub.correct_indices)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-1 text-sm">
                <div className="flex gap-2">
                  <span className="shrink-0 font-medium text-red-700">你的答案：</span>
                  <MathHtml html={yourHtml} />
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0 font-medium text-emerald-700">正確答案：</span>
                  <MathHtml html={corrHtml} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShortReview({ answer, feedback }: { answer?: ServerAnswer; feedback?: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-secondary/40 p-3">{answer?.short_text ? <MarkdownMath md={answer.short_text} /> : <p className="text-sm text-muted-foreground">（未輸入文字）</p>}</div>
      {!!answer?.short_images?.length && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{answer.short_images.map((image) => <a key={image.path || image.url} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt="作答圖片" className="h-32 w-full rounded border object-contain" /></a>)}</div>}
      {feedback && <div className="text-sm"><span className="font-medium">老師回饋：</span><MarkdownMath md={feedback} /></div>}
    </div>
  );
}

function GroupReview({ question, answer, keyInfo, qIndex, renderManualGrade }: { question?: Question; answer?: ServerAnswer; keyInfo: KeyInfo; qIndex: number; renderManualGrade?: (target: ManualGradeTarget) => ReactNode }) {
  const parts = question?.group_questions || [];
  return <div className="space-y-3">{(keyInfo.subs || []).map((key, index) => <PartReview key={index} part={parts[index]} answer={answer?.group_answers?.[index]} keyInfo={key} index={index} qIndex={qIndex} renderManualGrade={renderManualGrade} />)}</div>;
}

function PartReview({ part, answer, keyInfo, index, qIndex, renderManualGrade }: { part?: SubQuestion; answer?: ServerPartAnswer; keyInfo: NonNullable<KeyInfo['subs']>[number]; index: number; qIndex: number; renderManualGrade?: (target: ManualGradeTarget) => ReactNode }) {
  const type = keyInfo.type || part?.question_type || 'cloze';
  const earned = keyInfo.earned ?? 0;
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex justify-between text-sm font-semibold"><span>（{index + 1}）</span><span>{keyInfo.pending ? '待批改' : `${earned} / ${keyInfo.points} 分`}</span></div>
      {(part?.question_content || part?.content) && <MathHtml html={part.question_content || part.content || ''} className="mb-2" />}
      {type === 'short_answer' ? <div className="space-y-3"><ShortReview answer={{ q_index: index, short_text: answer?.short_text, short_images: answer?.short_images }} feedback={keyInfo.feedback} />{renderManualGrade?.({ id: `${qIndex}.${index}`, q_index: qIndex, sub_index: index, max: keyInfo.points })}</div> : (
        <div className="text-sm"><span className="font-medium">你的答案：</span><MathHtml html={type === 'choice' ? fmtChoice(part as Question, answer?.selected_index) : type === 'multi' ? fmtMulti(part as Question, (answer?.selected_indices || []).filter((v): v is number => v != null)) : fmtClozeSets(part?.cloze_options || [], answer?.selected_indices)} /></div>
      )}
    </div>
  );
}
