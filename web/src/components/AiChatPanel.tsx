import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { aiTutorAsk, aiTutorCancel, aiTutorStatus, aiTutorThread, type AiThreadTarget, type AiTutorMessage, type AiTutorModel, type AiTutorPending } from '@/lib/api';
import { AI_IMAGE_MAX_COUNT, AI_IMAGE_SEND_LIMIT, attachmentUrl, prepareAiImage, type AiAttachment } from '@/lib/ai-images';
import type { PdfRegion } from '@/lib/types';
import MarkdownMath from './MarkdownMath';
import { cropPdfRegion } from './PdfViewer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ImagePlus, Loader2, Send, Square, X } from 'lucide-react';

const MAX_CHARS = 1000;
const POLL_MS = 2500;
const IMAGE_ONLY_QUESTION = '請看這張圖片。';
const ERRORS: Record<string, string> = {
  AI_NOT_CONFIGURED: 'AI 家教尚未設定完成，請通知老師。',
  AI_DAILY_LIMIT: '今天的提問次數用完了，明天再來問。',
  AI_MODEL_NO_VISION: '這個模型看不到題目圖片，請換一個模型。',
  AI_MODEL_UNAVAILABLE: '這個模型目前無法使用，請換一個模型。',
  AI_BUSY: '這個模型目前太忙，請過一分鐘再試，或換一個模型。',
  AI_JOB_RUNNING: '上一個問題還在處理中，請等它完成或先停止。',
  AI_TIMEOUT: '這個模型回答太慢，請再試一次，或換一個模型。',
  AI_QUESTION_UNAVAILABLE: '這題目前無法提問，可能還在等待老師批改。',
  AI_IMAGES_TOO_LARGE: '這次的圖片合計超過 2MB，請移除幾張再送出。',
  AI_IMAGE_INVALID: '只能傳 JPG、PNG 或 WebP 圖片，一次最多 4 張。',
};

function fmtElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

interface Props {
  target: AiThreadTarget;
  getPdf?: () => Promise<{ url: string; region: PdfRegion } | null>; // PDF 模式的題目，提問時截圖給 AI
  suggestions: string[];
  model: string; // 'auto' 或指定的模型 id
  onModelChange: (model: string) => void;
  messages: AiTutorMessage[];
  onMessagesChange: (messages: AiTutorMessage[]) => void;
  onThreadChange?: () => void; // 對話有新內容或狀態改變，歷史列表要更新
}

/** AI 家教對話內容；由後端背景處理並存檔，離開也不影響，30 天未更新自動刪除 */
export default function AiChatPanel({ target, getPdf, suggestions, model, onModelChange, messages, onMessagesChange, onThreadChange }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<AiTutorModel[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [preparing, setPreparing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSent = useRef<AiAttachment[]>([]); // 失敗或停止時放回附件
  const lastMessage = messages[messages.length - 1];
  const busy = lastMessage?.role === 'user';
  const [now, setNow] = useState(() => Date.now());
  const selected = models.some((item) => item.id === model) ? model : 'auto';

  const refreshModels = () => aiTutorStatus().then((response) => { if (response?.ok) { setModels(response.models); setRemaining(response.remaining); } }).catch(() => {});
  const errorText = (code?: string) => (code && ERRORS[code]) || 'AI 暫時無法回答，請稍後再試，或換一個模型。';
  const restoreAttachments = () => setAttachments((current) => (current.length ? current : lastSent.current));

  const applyThread = (saved: AiTutorMessage[], pending: AiTutorPending | null) => {
    if (pending?.status === 'running') {
      onMessagesChange([...saved, { role: 'user', text: pending.question, images: pending.images, sent_at: Date.parse(pending.created_at) }]);
      return;
    }
    onMessagesChange(saved);
    if (pending?.status === 'failed') {
      setInput((current) => current || pending.question);
      restoreAttachments();
      setError(errorText(pending.error));
      void aiTutorCancel(target).catch(() => {}).finally(() => onThreadChange?.()); // 學生看過了，清掉失敗紀錄
    }
  };

  const loadThread = () => aiTutorThread(target)
    .then((response) => { if (response?.ok) applyThread(response.messages || [], response.pending); })
    .catch(() => {});

  useEffect(() => {
    void loadThread().finally(() => setThreadLoaded(true));
    // 開啟視窗時載入一次，回覆可能在視窗關閉期間完成
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!busy) void refreshModels();
    if (!busy && threadLoaded) onThreadChange?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async (text: string) => {
    const sending = attachments;
    const question = text.trim() || (sending.length ? IMAGE_ONLY_QUESTION : '');
    if (!question || busy || !threadLoaded || preparing) return;
    setError('');
    setInput('');
    setAttachments([]);
    lastSent.current = sending;
    onMessagesChange([...messages, { role: 'user', text: question, images: sending.map((a) => ({ url: attachmentUrl(a) })), sent_at: Date.now() }]);
    setSubmitting(true);
    // 截圖失敗仍可提問，AI 會請學生描述題目
    const pdf = await getPdf?.().catch(() => null);
    const pdfCrop = pdf ? await cropPdfRegion(pdf.url, pdf.region).catch(() => undefined) : undefined;
    const images = sending.length ? sending.map((a) => ({ data_base64: a.data })) : undefined;
    const response = await aiTutorAsk({ ...target, question, pdf_crop: pdfCrop, images, model: selected }).catch(() => null);
    setSubmitting(false);
    if (response?.ok) { // 後端處理中，由輪詢取得回覆
      onThreadChange?.();
      return;
    }
    onMessagesChange(messages);
    setInput(text.trim());
    setAttachments(sending);
    setError(errorText(response?.error));
    if (response?.error === 'AI_JOB_RUNNING') void loadThread();
  };

  const stop = async () => {
    const question = lastMessage?.text || '';
    setStopping(true);
    const response = await aiTutorCancel(target).catch(() => null);
    if (response?.cancelled) {
      setInput((current) => current || (question === IMAGE_ONLY_QUESTION ? '' : question));
      restoreAttachments();
    }
    await loadThread();
    setStopping(false);
  };

  const addFiles = async (files: File[]) => {
    setError('');
    setPreparing(true);
    let next = attachments;
    for (const file of files) {
      if (next.length >= AI_IMAGE_MAX_COUNT) {
        setError(`一次最多傳 ${AI_IMAGE_MAX_COUNT} 張圖片。`);
        break;
      }
      const used = next.reduce((sum, a) => sum + a.size, 0);
      const prepared = file.type.startsWith('image/') ? await prepareAiImage(file, AI_IMAGE_SEND_LIMIT - used).catch(() => null) : null;
      if (!prepared) {
        setError('圖片無法讀取，或這次的圖片已達 2MB 上限。');
        break;
      }
      next = [...next, prepared];
    }
    setAttachments(next);
    setPreparing(false);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 注音/倉頡選字時的 Enter 不送出；Safari 選字的 Enter 沒有 isComposing，要看 keyCode 229
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {!threadLoaded && <p className="text-sm text-muted-foreground">載入對話中…</p>}
        {threadLoaded && messages.length === 0 && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">不知道從哪裡問起？試試：</p>
            {suggestions.map((suggestion) => (
              <Button key={suggestion} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left text-sm" onClick={() => void send(suggestion)}>
                {suggestion}
              </Button>
            ))}
          </div>
        )}
        {messages.map((message, index) => message.role === 'user' ? (
          <div key={index} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            {!!message.images?.length && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {message.images.map((image, imageIndex) => (
                  <a key={imageIndex} href={image.url} target="_blank" rel="noopener">
                    <img src={image.url} alt="附加的圖片" className="max-h-40 max-w-full rounded" />
                  </a>
                ))}
              </div>
            )}
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
            <Loader2 className="h-4 w-4 animate-spin" />AI 思考中…（已處理 {fmtElapsed(now - (lastMessage?.sent_at ?? now))}）
          </p>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </div>

      <div className="space-y-2 border-t border-border px-5 py-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">模型</span>
          <select
            value={selected}
            onChange={(event) => onModelChange(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm text-foreground"
          >
            <option value="auto">自動（忙碌時換下一個）</option>
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}{item.vision ? '' : '（不能看圖）'}
              </option>
            ))}
          </select>
          {remaining != null && <span className="shrink-0">今天剩 {remaining} 次</span>}
        </label>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <div key={index} className="relative">
                <img src={attachmentUrl(attachment)} alt={`待送出的圖片 ${index + 1}`} className="h-14 w-14 rounded border border-border object-cover" />
                <button
                  type="button"
                  aria-label={`移除圖片 ${index + 1}`}
                  onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <Button size="icon" variant="outline" className="shrink-0" aria-label="附加圖片" title="附加圖片（單次合計 2MB，也可以直接貼上）" disabled={preparing} onClick={() => fileRef.current?.click()}>
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </Button>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
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
            <Button size="icon" aria-label="送出" disabled={!threadLoaded || preparing || (!input.trim() && !attachments.length)} onClick={() => void send(input)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          AI 可能出錯，重要觀念請向老師確認。問題會傳送給所選模型的服務商處理，請勿輸入個人資料。對話超過 30 天未更新會自動刪除。
        </p>
      </div>
    </div>
  );
}
