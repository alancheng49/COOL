import type { AiTutorMessage } from '@/lib/api';
import type { PdfRegion } from '@/lib/types';
import AiChatPanel from './AiChatPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles, X } from 'lucide-react';

const SUGGESTIONS = ['為什麼正確答案是這個？', '請一步一步教我怎麼解', '這題考的是什麼觀念？'];

interface Props {
  attemptId: string;
  questionIndex: number;
  pdfUrl?: string;
  pdfRegion?: PdfRegion;
  model: string; // 'auto' 或指定的模型 id
  onModelChange: (model: string) => void;
  messages: AiTutorMessage[];
  onMessagesChange: (messages: AiTutorMessage[]) => void;
  onClose: () => void;
}

/** 檢討頁的 AI 家教視窗 */
export default function AiTutorDialog({ attemptId, questionIndex, pdfUrl, pdfRegion, model, onModelChange, messages, onMessagesChange, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <Card className="flex h-[min(680px,85vh)] w-full max-w-xl flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <h3 className="flex items-center gap-1.5 font-serif text-lg font-bold">
              <Sparkles className="h-4 w-4 text-primary" />第 {questionIndex + 1} 題：問 AI
            </h3>
            <p className="text-xs text-muted-foreground">AI 已經看過這題、你的答案和正解，可以直接問。</p>
          </div>
          <Button variant="ghost" size="sm" aria-label="關閉" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <AiChatPanel
          target={{ attempt_id: attemptId, q_index: questionIndex }}
          getPdf={pdfUrl && pdfRegion ? async () => ({ url: pdfUrl, region: pdfRegion }) : undefined}
          suggestions={SUGGESTIONS}
          model={model}
          onModelChange={onModelChange}
          messages={messages}
          onMessagesChange={onMessagesChange}
        />
      </Card>
    </div>
  );
}
