import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { aiTutorAsk, aiTutorCancel, aiTutorStatus, aiTutorThread, type AiTutorMessage, type AiTutorModel, type AiTutorPending } from '@/lib/api';
import type { PdfRegion } from '@/lib/types';
import MarkdownMath from './MarkdownMath';
import { cropPdfRegion } from './PdfViewer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Sparkles, Square, X } from 'lucide-react';

const MAX_CHARS = 1000;
const POLL_MS = 2500;
const SUGGESTIONS = ['為什麼正確答案是這個？', '請一步一步教我怎麼解', '這題考的是什麼觀念？'];
const ERRORS: Record<string, string> = {
  AI_NOT_CONFIGURED: 'AI 家教尚未設定完成，請通知老師。',
  AI_DAILY_LIMIT: '今天可用的額度用完了，可以換其他模型，或明天再來問。',
  AI_MODEL_NO_VISION: '這個模型看不到題目圖片，請換一個模型。',
  AI_MODEL_UNAVAILABLE: '這個模型目前無法使用，請換一個模型。',
  AI_BUSY: '這個模型目前太忙，請過一分鐘再試，或換一個模型。',
  AI_JOB_RUNNING: '上一個問題還在處理中，請等它完成或先停止。',
  AI_TIMEOUT: '這個模型回答太慢，請再試一次，或換一個模型。',
  AI_QUESTION_UNAVAILABLE: '這題目前無法提問，可能還在等待老師批改。',
};

function fmtElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

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

/** 檢討頁的 AI 家教對話；由後端背景處理並存檔，關掉視窗也不影響，30 天未更新自動刪除 */
export default function AiTutorDialog({ attemptId, questionIndex, pdfUrl, pdfRegion, model, onModelChange, messages, onMessagesChange, onClose }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<AiTutorModel[]>([]);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];
  const busy = lastMessage?.role === 'user';
  const [now, setNow] = useState(() => Date.now());
  const selected = models.some((item) => item.id === model) ? model : 'auto';

  const refreshModels = () => aiTutorStatus().then((response) => { if (response?.ok) setModels(response.models); }).catch(() => {});
  const errorText = (code?: string) => (code && ERRORS[code]) || 'AI 暫時無法回答，請稍後再試，或換一個模型。';

  const applyThread = (saved: AiTutorMessage[], pending: AiTutorPending | null) => {
    if (pending?.status === 'running') {
      onMessagesChange([...saved, { role: 'user', text: pending.question, sent_at: Date.parse(pending.created_at) }]);
      return;
    }
    onMessagesChange(saved);
    if (pending?.status === 'failed') {
      setInput((current) => current || pending.question);
      setError(errorText(pending.error));
      void aiTutorCancel(attemptId, questionIndex).catch(() => {}); // 學生看過了，清掉失敗紀錄
    }
  };

  const loadThread = () => aiTutorThread(attemptId, questionIndex)
    .then((response) => { if (response?.ok) applyThread(response.messages || [], response.pending); })
    .catch(() => {});

  useEffect(() => {
    void loadThread().finally(() => setThreadLoaded(true));
    // 開啟視窗時載入一次，回覆可能在視窗關閉期間完成
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!busy) void refreshModels();
  }, [busy]);

  useEffect(() => {
    if (!busy || submitting) return;
    const timer = window.setInterval(() => void loadThread(), POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, submitting]);

  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy || !threadLoaded) return;
    setError('');
    setInput('');
    onMessagesChange([...messages, { role: 'user', text: question, sent_at: Date.now() }]);
    setSubmitting(true);
    // 截圖失敗仍可提問，AI 會請學生描述題目
    const pdfCrop = pdfUrl && pdfRegion ? await cropPdfRegion(pdfUrl, pdfRegion).catch(() => undefined) : undefined;
    const response = await aiTutorAsk({ attempt_id: attemptId, q_index: questionIndex, question, pdf_crop: pdfCrop, model: selected }).catch(() => null);
    setSubmitting(false);
    if (response?.ok) return; // 後端處理中，由輪詢取得回覆
    onMessagesChange(messages);
    setInput(question);
    setError(errorText(response?.error));
    if (response?.error === 'AI_JOB_RUNNING') void loadThread();
  };

  const stop = async () => {
    const question = lastMessage?.text || '';
    setStopping(true);
    const response = await aiTutorCancel(attemptId, questionIndex).catch(() => null);
    if (response?.cancelled) setInput((current) => current || question);
    await loadThread();
    setStopping(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 注音/倉頡選字時的 Enter 不送出；Safari 選字的 Enter 沒有 isComposing，要看 keyCode 229
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      void send(input);
    }
  };

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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!threadLoaded && <p className="text-sm text-muted-foreground">載入對話中…</p>}
          {threadLoaded && messages.length === 0 && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">不知道從哪裡問起？試試：</p>
              {SUGGESTIONS.map((suggestion) => (
                <Button key={suggestion} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left text-sm" onClick={() => void send(suggestion)}>
                  {suggestion}
                </Button>
              ))}
            </div>
          )}
          {messages.map((message, index) => message.role === 'user' ? (
            <div key={index} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              {message.text}
            </div>
          ) : (
            <div key={index} className="max-w-full rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <MarkdownMath md={message.text} className="text-sm" />
              {message.model_label && <p className="mt-1.5 text-[11px] text-muted-foreground">由 {message.model_label} 回答</p>}
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />AI 思考中…（已處理 {fmtElapsed(now - (lastMessage?.sent_at ?? now))}）可以關閉視窗，回覆會自動存檔。
            </p>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-2 border-t border-border px-5 py-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">模型</span>
            <select
              value={selected}
              onChange={(event) => onModelChange(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm text-foreground"
            >
              <option value="auto">自動（額度用完換下一個）</option>
              {models.map((item) => (
                <option key={item.id} value={item.id} disabled={item.remaining <= 0}>
                  {item.label}（今天剩 {item.remaining} 次{item.vision ? '' : '・不能看圖'}）
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_CHARS}
              rows={2}
              placeholder="輸入你的問題（Enter 送出，Shift+Enter 換行）"
              aria-label="輸入問題"
              className="min-h-0 resize-none"
            />
            {busy ? (
              <Button size="icon" variant="outline" aria-label="停止" title="停止這次提問" disabled={submitting || stopping} onClick={() => void stop()}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" aria-label="送出" disabled={!threadLoaded || !input.trim()} onClick={() => void send(input)}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            AI 可能出錯，重要觀念請向老師確認。問題會傳送給所選模型的服務商處理，請勿輸入個人資料。對話超過 30 天未更新會自動刪除。
          </p>
        </div>
      </Card>
    </div>
  );
}
