import type { AdminQuizDraft, Question } from './types';
import { fromQuestion } from './quiz-editor';

type AnswerKey = NonNullable<Parameters<typeof fromQuestion>[1]> & { q_index: number };

interface PublishedDetail {
  meta: {
    quiz_id: string;
    title: string;
    topic?: string;
    description?: string;
    time_limit_minutes?: number | null;
    total_points?: number;
    pdf_mode?: boolean;
    pdf_url?: string;
    pdf_path?: string;
  };
  questions: Question[] | { questions: Question[] } | null;
  keys: AnswerKey[];
}

function copyIdentity(quizId: string, title: string, suffix: string) {
  const id = `${quizId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}_copy_${suffix}`;
  return {
    quiz_id: id,
    quiz_version: 1,
    title: `${title || quizId}（副本）`,
    file: `questions/${id}.json`,
    source_quiz_id: '',
    source_quiz_version: 1,
    source_file: '',
    is_active: true,
  };
}

export function publishedQuizCopy(detail: PublishedDetail, suffix: string) {
  const questions = Array.isArray(detail.questions) ? detail.questions : detail.questions?.questions;
  if (!Array.isArray(questions) || !questions.length) throw new Error('原考卷題目無法讀取，無法建立副本。');
  if (!Array.isArray(detail.keys)) throw new Error('原考卷配分與答案無法讀取。');
  const keys = new Map(detail.keys.map((key) => [Number(key.q_index), key]));
  if (questions.some((_, index) => !keys.has(index))) throw new Error('原考卷的答案或配分不完整，請先修正原考卷。');
  const editor = questions.map((question, index) => fromQuestion(question, keys.get(index)));
  const meta = detail.meta;
  return {
    ...copyIdentity(meta.quiz_id, meta.title, suffix),
    topic: meta.topic || '',
    description: meta.description || '',
    time_limit_value: meta.time_limit_minutes == null ? '' : String(meta.time_limit_minutes),
    total_points: editor.reduce((total, question) => total + question.points, 0),
    score_helper_total: String(meta.total_points || 100),
    pdf_mode: !!meta.pdf_mode,
    pdf_url: meta.pdf_url || '',
    pdf_path: meta.pdf_path || '',
    editor_json: JSON.stringify(editor),
  };
}

export function draftQuizCopy(draft: AdminQuizDraft & { editor: unknown[] }, suffix: string) {
  if (!Array.isArray(draft.editor)) throw new Error('草稿內容無法讀取，無法建立副本。');
  return {
    ...copyIdentity(draft.quiz_id, draft.title, suffix),
    topic: draft.topic || '',
    description: draft.description || '',
    time_limit_value: draft.time_limit_value,
    total_points: draft.total_points,
    score_helper_total: draft.score_helper_total || '100',
    pdf_mode: !!draft.pdf_mode,
    pdf_url: draft.pdf_url || '',
    pdf_path: draft.pdf_path || '',
    editor_json: JSON.stringify(draft.editor),
  };
}
