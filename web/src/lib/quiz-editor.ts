import type { PdfRegion, Question } from './types';
import { validPdfRegion } from './pdf-region';

/** 編輯器內部的題目型別 */
export interface EditQ {
  pdf_region?: PdfRegion;
  question_type: 'choice' | 'cloze' | 'multi' | 'short_answer' | 'group';
  question_content: string;
  question_image: string;
  options: string[];
  option_images: string[];
  correct_index: number;
  correct_multi: number[]; // multi 題：所有正解選項索引
  use_subs: boolean; // 填充題是否使用小題（否 = 傳統單一填充，用 subs[0]）
  subs: EditSub[]; // 填充題小題
  points: number;
  explanation: string; // 詳解（Markdown + LaTeX，選填）
  group_parts: EditPart[];
}

export interface EditPart {
  question_type: 'choice' | 'cloze' | 'multi' | 'short_answer';
  content: string;
  image: string;
  points: number;
  options: string[];
  option_images: string[];
  correct_index: number;
  correct_multi: number[];
  template: string;
  blanks: EditBlank[];
}

/** 填充題的一格：tokens 是學生可選的內容（支援 LaTeX），correct 是正解索引 */
export interface EditBlank {
  tokens: string[];
  correct: number;
}

export interface EditSub {
  content: string; // 小題敘述
  points: number; // 小題配分
  template: string; // 答案樣式
  blanks: EditBlank[];
}

export const emptyChoice = (): EditQ => ({
  question_type: 'choice', question_content: '', question_image: '',
  options: ['', '', '', ''], correct_index: 0, correct_multi: [],
  option_images: ['', '', '', ''], use_subs: false, subs: [], points: 1, explanation: '', group_parts: [],
});
export const emptyMulti = (): EditQ => ({
  question_type: 'multi', question_content: '', question_image: '',
  options: ['', '', '', '', ''], correct_index: 0, correct_multi: [],
  option_images: ['', '', '', '', ''], use_subs: false, subs: [], points: 1, explanation: '', group_parts: [],
});
// 數字格的固定選項組：0~9、-、±
const NUMBER_TOKENS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '$\\pm$'];

export const emptyBlank = (): EditBlank => ({ tokens: [...NUMBER_TOKENS], correct: 0 });

/** 開頭為 0~9 視為數字格（舊題目末端符號略有不同，例如 $\\pi$），其餘為自訂選項 */
export const isNumberBlank = (blank: EditBlank) => blank.tokens.slice(0, 10).join() === NUMBER_TOKENS.slice(0, 10).join();

export function blankProblem(blank: EditBlank) {
  if (blank.tokens.length < 2) return '選項不足';
  if (blank.tokens.some((token) => token.trim() === '')) return '有空白選項';
  if (blank.correct >= blank.tokens.length) return '正解超出範圍';
  return '';
}

export const emptySub = (): EditSub => ({
  content: '', points: 1, template: '', blanks: [emptyBlank()],
});

export const emptyCloze = (): EditQ => ({
  question_type: 'cloze', question_content: '', question_image: '',
  options: [], option_images: [], correct_index: 0, correct_multi: [],
  use_subs: false, subs: [emptySub()], points: 1, explanation: '', group_parts: [],
});

export const emptyShort = (): EditQ => ({
  question_type: 'short_answer', question_content: '', question_image: '', options: [], option_images: [],
  correct_index: 0, correct_multi: [], use_subs: false, subs: [], points: 1, explanation: '', group_parts: [],
});

export const emptyPart = (question_type: EditPart['question_type'] = 'choice'): EditPart => ({
  question_type, content: '', image: '', points: 1,
  options: question_type === 'choice' || question_type === 'multi' ? ['', '', '', ''] : [],
  option_images: question_type === 'choice' || question_type === 'multi' ? ['', '', '', ''] : [],
  correct_index: 0, correct_multi: [], template: '',
  blanks: question_type === 'cloze' ? [emptyBlank()] : [],
});

export const emptyGroup = (): EditQ => ({
  question_type: 'group', question_content: '', question_image: '', options: [], option_images: [],
  correct_index: 0, correct_multi: [], use_subs: false, subs: [], points: 1, explanation: '', group_parts: [emptyPart()],
});

// 舊草稿的 tokens 是以 | 分隔的字串
function normalizeBlank(value: { tokens: string | string[]; correct: number }): EditBlank {
  const tokens = Array.isArray(value.tokens) ? value.tokens : String(value.tokens ?? '').split('|').map((token) => token.trim()).filter((token) => token !== '');
  return { tokens, correct: Number(value.correct) || 0 };
}

function normalizeDraftPart(value: Partial<EditPart>): EditPart {
  const type = ['choice', 'cloze', 'multi', 'short_answer'].includes(String(value.question_type))
    ? value.question_type as EditPart['question_type']
    : 'choice';
  const base = emptyPart(type);
  return {
    ...base,
    ...value,
    question_type: type,
    options: Array.isArray(value.options) ? value.options : base.options,
    option_images: Array.isArray(value.option_images) ? value.option_images : base.option_images,
    correct_multi: Array.isArray(value.correct_multi) ? value.correct_multi : [],
    blanks: Array.isArray(value.blanks) ? value.blanks.map(normalizeBlank) : base.blanks,
  };
}

function normalizeDraftSub(value: Partial<EditSub>): EditSub {
  const base = emptySub();
  return {
    ...base,
    ...value,
    blanks: Array.isArray(value.blanks) ? value.blanks.map(normalizeBlank) : base.blanks,
  };
}

export const QUESTION_TYPES = ['choice', 'multi', 'cloze', 'short_answer', 'group'] as const;

export const QUESTION_TYPE_LABELS: Record<EditQ['question_type'], string> = {
  choice: '單選', multi: '多選', cloze: '填充', short_answer: '簡答', group: '題組',
};

const emptyQuestion = (type: EditQ['question_type']): EditQ => (
  type === 'cloze' ? emptyCloze()
    : type === 'multi' ? emptyMulti()
      : type === 'short_answer' ? emptyShort()
        : type === 'group' ? emptyGroup()
          : emptyChoice()
);

export function normalizeDraftQuestion(value: Partial<EditQ>): EditQ {
  const type = ['choice', 'cloze', 'multi', 'short_answer', 'group'].includes(String(value.question_type))
    ? value.question_type as EditQ['question_type']
    : 'choice';
  const base = emptyQuestion(type);
  return {
    ...base,
    ...value,
    pdf_region: validPdfRegion(value.pdf_region),
    question_type: type,
    options: Array.isArray(value.options) ? value.options : base.options,
    option_images: Array.isArray(value.option_images) ? value.option_images : base.option_images,
    correct_multi: Array.isArray(value.correct_multi) ? value.correct_multi : [],
    subs: Array.isArray(value.subs) ? value.subs.map(normalizeDraftSub) : base.subs,
    group_parts: Array.isArray(value.group_parts) ? value.group_parts.map(normalizeDraftPart) : base.group_parts,
  };
}

export function splitPoints(total: number, count: number) {
  if (count <= 0) return [];
  const units = Math.round(total * 100);
  const base = Math.floor(units / count);
  const remainder = units - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

/** 依現有比例分配總分（最大餘數法，精度 0.01）；現有配分全為 0 時改為平分 */
function scalePoints(total: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) return splitPoints(total, weights.length);
  const units = Math.round(total * 100);
  const exact = weights.map((weight) => (weight / sum) * units);
  const result = exact.map(Math.floor);
  const remainder = units - result.reduce((acc, value) => acc + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - result[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let k = 0; k < remainder; k += 1) result[order[k % order.length].index] += 1;
  return result.map((value) => value / 100);
}

function applyQuestionPoints(question: EditQ, points: number, divide: (total: number, weights: number[]) => number[]): EditQ {
  if (question.question_type === 'group' && question.group_parts.length) {
    const parts = divide(points, question.group_parts.map((part) => Number(part.points) || 0));
    return { ...question, points, group_parts: question.group_parts.map((part, index) => ({ ...part, points: parts[index] })) };
  }
  if (question.question_type === 'cloze' && question.use_subs && question.subs.length) {
    const parts = divide(points, question.subs.map((sub) => Number(sub.points) || 0));
    return { ...question, points, subs: question.subs.map((sub, index) => ({ ...sub, points: parts[index] })) };
  }
  return { ...question, points };
}

/** 設定該題總分，小題一律平分 */
export const setQuestionPoints = (question: EditQ, points: number) =>
  applyQuestionPoints(question, points, (total, weights) => splitPoints(total, weights.length));

/** 設定該題總分，小題維持原比例 */
export const scaleQuestionPoints = (question: EditQ, points: number) => applyQuestionPoints(question, points, scalePoints);

const isOptionType = (type: string) => type === 'choice' || type === 'multi';
const hasContent = (values: string[]) => values.some((value) => value.trim() !== '');

/** 單選/多選互轉時沿用選項，只轉換正解的表示方式 */
const convertCorrect = (item: { correct_index: number; correct_multi: number[] }, type: string) => (
  type === 'multi'
    ? { correct_multi: [item.correct_index] }
    : { correct_index: [...item.correct_multi].sort((a, b) => a - b)[0] ?? 0, correct_multi: [] }
);

const blankHasContent = (blank: EditBlank) => blank.correct !== 0 || (!isNumberBlank(blank) && hasContent(blank.tokens));

const partHasAnswerContent = (part: EditPart) =>
  hasContent([...part.options, ...part.option_images, part.template]) || part.blanks.some(blankHasContent);

/** 切換題型是否會清掉已填的選項或小題內容 */
export function questionTypeChangeDropsContent(question: EditQ, type: EditQ['question_type']) {
  if (question.question_type === type || (isOptionType(question.question_type) && isOptionType(type))) return false;
  if (isOptionType(question.question_type)) return hasContent([...question.options, ...question.option_images]);
  if (question.question_type === 'cloze') return question.subs.some((sub) => hasContent([sub.content, sub.template]) || sub.blanks.some(blankHasContent));
  if (question.question_type === 'group') return question.group_parts.some((part) => hasContent([part.content, part.image]) || partHasAnswerContent(part));
  return false;
}

export function partTypeChangeDropsContent(part: EditPart, type: EditPart['question_type']) {
  if (part.question_type === type || (isOptionType(part.question_type) && isOptionType(type))) return false;
  return partHasAnswerContent(part);
}

/** 單選/多選互轉保留選項，其餘切換清空作答內容；題幹、附圖、配分、詳解與 PDF 範圍都保留 */
export function changeQuestionType(question: EditQ, type: EditQ['question_type']): EditQ {
  if (question.question_type === type) return question;
  if (isOptionType(question.question_type) && isOptionType(type)) return { ...question, question_type: type, ...convertCorrect(question, type) };
  const { question_content, question_image, explanation, pdf_region, points } = question;
  return scaleQuestionPoints({ ...emptyQuestion(type), question_content, question_image, explanation, pdf_region }, points);
}

export function changePartType(part: EditPart, type: EditPart['question_type']): EditPart {
  if (part.question_type === type) return part;
  if (isOptionType(part.question_type) && isOptionType(type)) return { ...part, question_type: type, ...convertCorrect(part, type) };
  return { ...emptyPart(type), content: part.content, image: part.image, points: part.points };
}

export function fromQuestion(q: Question, key?: { type?: string; correct?: number; correct_indices?: number[]; points?: number; explanation?: string; subs?: { type?: string; points: number; correct?: number; correct_indices?: number[] }[] }): EditQ {
  const type = (q.question_type || 'choice').toLowerCase() as EditQ['question_type'];
  const base = {
    pdf_region: validPdfRegion(q.pdf_region),
    question_content: q.display_type === 'image' ? '' : q.question_content || '',
    question_image: q.display_type === 'image' ? q.question_content || q.question_image || '' : q.question_image || '',
    points: key?.points ?? q.points ?? 1,
    explanation: key?.explanation ?? '',
    option_images: (q.option_images || []).map((value) => value || ''),
    group_parts: [] as EditPart[],
  };
  if (type === 'group') {
    const parts = (q.group_questions || []).map((part, index) => partFromQuestion(part, key?.subs?.[index]));
    return { ...base, question_type: 'group', options: [], correct_index: 0, correct_multi: [], use_subs: false, subs: [], group_parts: parts, points: parts.reduce((sum, part) => sum + part.points, 0) || base.points };
  }
  if (type === 'short_answer') {
    return { ...base, question_type: 'short_answer', options: [], correct_index: 0, correct_multi: [], use_subs: false, subs: [], group_parts: [] };
  }
  if (type === 'cloze') {
    // 新格式:小題制
    if (Array.isArray(q.sub_questions) && q.sub_questions.length) {
      const groupParts = q.sub_questions.map((part, index) => partFromQuestion({ ...part, question_type: 'cloze' }, key?.subs?.[index]));
      return { ...base, question_type: 'group', points: groupParts.reduce((sum, part) => sum + part.points, 0) || base.points, options: [], correct_index: 0, correct_multi: [], use_subs: false, subs: [], group_parts: groupParts };
    }
    // 舊格式:轉成單一小題
    const corr = key?.correct_indices ?? q.cloze_answer_indices ?? [];
    return {
      ...base,
      question_type: 'cloze',
      options: [], correct_index: 0, correct_multi: [],
      use_subs: false,
      subs: [{
        content: '',
        points: base.points,
        template: q.cloze_template || '',
        blanks: (q.cloze_options || []).map((set, i) => ({ tokens: [...set], correct: corr[i] ?? 0 })),
      }],
    };
  }
  if (type === 'multi') {
    const corr = (key?.correct_indices ?? q.correct_answer_indices ?? []).map(Number);
    return {
      ...base,
      question_type: 'multi',
      options: q.options && q.options.length ? [...q.options] : ['', ''],
      correct_index: 0, correct_multi: corr,
      use_subs: false, subs: [],
    };
  }
  const idx = key?.correct ?? (q.answer != null ? (q.options || []).findIndex((o) => o === q.answer) : 0);
  return {
    ...base,
    question_type: 'choice',
    options: q.options && q.options.length ? [...q.options] : ['', ''],
    correct_index: Math.max(0, idx), correct_multi: [],
    use_subs: false, subs: [],
  };
}

function partFromQuestion(part: import('@/lib/types').SubQuestion, key?: { type?: string; points?: number; correct?: number; correct_indices?: number[] }): EditPart {
  const type = (part.question_type || 'cloze') as EditPart['question_type'];
  const options = part.options || [];
  const correctIndex = key?.correct ?? (part.answer != null ? options.findIndex((option) => option === part.answer) : 0);
  return {
    question_type: type,
    content: part.question_content || part.content || '', image: part.question_image || '', points: Number(key?.points ?? part.points ?? 1),
    options: [...options], option_images: (part.option_images || []).map((value) => value || ''), correct_index: Math.max(0, correctIndex),
    correct_multi: (key?.correct_indices ?? part.correct_answer_indices ?? []).map(Number), template: part.cloze_template || '',
    blanks: (part.cloze_options || []).map((set, index) => ({ tokens: [...set], correct: key?.correct_indices?.[index] ?? part.cloze_answer_indices?.[index] ?? 0 })),
  };
}

const blankOptions = (blanks: EditBlank[]) => blanks.map((blank) => blank.tokens.map((token) => token.trim()));

export function toQuestion(e: EditQ): Question {
  const base = {
    ...(validPdfRegion(e.pdf_region) ? { pdf_region: e.pdf_region } : {}),
    display_type: 'text' as const,
    question_content: e.question_content,
    points: e.points,
    ...(e.question_image ? { question_image: e.question_image } : {}),
  };
  if (e.question_type === 'short_answer') return { ...base, question_type: 'short_answer' };
  if (e.question_type === 'group') return { ...base, question_type: 'group', group_questions: e.group_parts.map(partToQuestion) };
  if (e.question_type === 'cloze') {
    if (!e.use_subs) {
      // 傳統單一填充（subs[0]）
      const sub = e.subs[0];
      return {
        ...base,
        question_type: 'cloze',
        cloze_template: sub?.template || '',
        cloze_options: blankOptions(sub?.blanks || []),
        cloze_answer_indices: (sub?.blanks || []).map((b) => b.correct),
      };
    }
    return {
      ...base,
      question_type: 'cloze',
      sub_questions: e.subs.map((sub) => ({
        content: sub.content,
        points: sub.points,
        cloze_template: sub.template,
        cloze_options: blankOptions(sub.blanks),
        cloze_answer_indices: sub.blanks.map((b) => b.correct),
      })),
    };
  }
  if (e.question_type === 'multi') {
    return {
      ...base,
      question_type: 'multi',
      options: e.options,
      option_images: e.option_images.map((value) => value || null),
      correct_answer_indices: [...e.correct_multi].sort((a, b) => a - b),
    };
  }
  return {
    ...base,
    question_type: 'choice',
    options: e.options,
    option_images: e.option_images.map((value) => value || null),
    answer: e.options[e.correct_index],
  };
}

function partToQuestion(part: EditPart): import('@/lib/types').SubQuestion {
  const base = { question_type: part.question_type, question_content: part.content, points: part.points, ...(part.image ? { question_image: part.image } : {}) };
  if (part.question_type === 'short_answer') return base;
  if (part.question_type === 'cloze') return { ...base, cloze_template: part.template, cloze_options: blankOptions(part.blanks), cloze_answer_indices: part.blanks.map((blank) => blank.correct) };
  return { ...base, options: part.options, option_images: part.option_images.map((value) => value || null), ...(part.question_type === 'multi' ? { correct_answer_indices: [...part.correct_multi].sort((a, b) => a - b) } : { answer: part.options[part.correct_index] }) };
}
