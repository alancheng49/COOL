import MathHtml from './MathHtml';
import type { Question } from '@/lib/types';

/** 題幹：支援 text / image / 文字+附圖（文繞圖） */
export default function QuestionStem({ q, index }: { q: Question; index: number }) {
  const disp = (q.display_type || 'text').toLowerCase();

  if (disp === 'image') {
    return (
      <div>
        <img
          src={q.question_content}
          alt={`題目圖片 ${index + 1}`}
          className="max-w-full rounded border border-border"
        />
        {q.cloze_template && <MathHtml html={q.cloze_template} className="mt-2 text-lg" highlightClozeBlanks />}
      </div>
    );
  }

  if (q.question_image) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <MathHtml html={q.question_content || '（無題目內容）'} className="text-base leading-relaxed sm:text-lg" />
        </div>
        <img
          src={q.question_image.startsWith('/') ? q.question_image : `/${q.question_image}`}
          alt={`題目圖片 ${index + 1}`}
          className="w-full max-w-[260px] shrink-0 rounded border border-border sm:w-[40%]"
        />
      </div>
    );
  }

  return <MathHtml html={q.question_content || '（無題目內容）'} className="text-base leading-relaxed sm:text-lg" />;
}
