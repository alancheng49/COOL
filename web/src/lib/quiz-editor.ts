import type { PdfRegion, Question } from './types';
import { validPdfRegion } from './pdf-region';

/** 編輯器內部的題目型別(cloze 每格 tokens 用字串編輯） */
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
  blanks: { tokens: string; correct: number }[];
}

export interface EditSub {
  content: string; // 小題敘述
  points: number; // 小題配分
  template: string; // 答案樣式
  blanks: { tokens: string; correct: number }[];
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
// 填充題固定選項組：0~9、-、±
export const CLOZE_TOKENS = '0|1|2|3|4|5|6|7|8|9|-|$\\pm$';

export const emptySub = (): EditSub => ({
  content: '', points: 1, template: '', blanks: [{ tokens: CLOZE_TOKENS, correct: 0 }],
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
  blanks: question_type === 'cloze' ? [{ tokens: CLOZE_TOKENS, correct: 0 }] : [],
});

export const emptyGroup = (): EditQ => ({
  question_type: 'group', question_content: '', question_image: '', options: [], option_images: [],
  correct_index: 0, correct_multi: [], use_subs: false, subs: [], points: 1, explanation: '', group_parts: [emptyPart()],
});

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
    blanks: Array.isArray(value.blanks) ? value.blanks : base.blanks,
  };
}

function normalizeDraftSub(value: Partial<EditSub>): EditSub {
  const base = emptySub();
  return {
    ...base,
    ...value,
    blanks: Array.isArray(value.blanks) ? value.blanks : base.blanks,
  };
}

export function normalizeDraftQuestion(value: Partial<EditQ>): EditQ {
  const type = ['choice', 'cloze', 'multi', 'short_answer', 'group'].includes(String(value.question_type))
    ? value.question_type as EditQ['question_type']
    : 'choice';
  const base = type === 'cloze' ? emptyCloze()
    : type === 'multi' ? emptyMulti()
      : type === 'short_answer' ? emptyShort()
        : type === 'group' ? emptyGroup()
          : emptyChoice();
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

export function setQuestionPoints(question: EditQ, points: number): EditQ {
  if (question.question_type === 'group' && question.group_parts.length) {
    const parts = splitPoints(points, question.group_parts.length);
    return { ...question, points, group_parts: question.group_parts.map((part, index) => ({ ...part, points: parts[index] })) };
  }
  if (question.question_type === 'cloze' && question.use_subs && question.subs.length) {
    const parts = splitPoints(points, question.subs.length);
    return { ...question, points, subs: question.subs.map((sub, index) => ({ ...sub, points: parts[index] })) };
  }
  return { ...question, points };
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
        blanks: (q.cloze_options || []).map((set, i) => ({ tokens: set.join('|'), correct: corr[i] ?? 0 })),
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
    blanks: (part.cloze_options || []).map((set, index) => ({ tokens: set.join('|'), correct: key?.correct_indices?.[index] ?? part.cloze_answer_indices?.[index] ?? 0 })),
  };
}

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
        cloze_options: (sub?.blanks || []).map((b) => b.tokens.split('|').map((s) => s.trim()).filter((s) => s !== '')),
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
        cloze_options: sub.blanks.map((b) => b.tokens.split('|').map((s) => s.trim()).filter((s) => s !== '')),
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
  if (part.question_type === 'cloze') return { ...base, cloze_template: part.template, cloze_options: part.blanks.map((blank) => blank.tokens.split('|').map((value) => value.trim()).filter(Boolean)), cloze_answer_indices: part.blanks.map((blank) => blank.correct) };
  return { ...base, options: part.options, option_images: part.option_images.map((value) => value || null), ...(part.question_type === 'multi' ? { correct_answer_indices: [...part.correct_multi].sort((a, b) => a - b) } : { answer: part.options[part.correct_index] }) };
}
