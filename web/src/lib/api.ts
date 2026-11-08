import { getSession, clearSession } from './session';
import { cached, invalidate } from './cache';
import type { ImageUploadDecision, ImageUploadResponse, Question, QuizInfo, ServerAnswer } from './types';

const BASE = '/api';

function token(): string {
  return getSession()?.token || '';
}

function requireLiveToken(): string {
  const s = getSession();
  if (!s?.token) {
    clearSession();
    location.hash = '/';
    location.reload();
    throw new Error('UNAUTHENTICATED');
  }
  if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) {
    clearSession();
    location.hash = '/';
    location.reload();
    throw new Error('UNAUTHENTICATED');
  }
  return s.token;
}

// token 過期(30 天）→ 清掉記住的登入並回登入頁
function handleExpired<T extends { error?: string } | null>(r: T): T {
  if (r && r.error === 'UNAUTHENTICATED' && token()) {
    clearSession();
    location.hash = '/';
    location.reload();
  }
  return r;
}

async function post(payload: Record<string, unknown>) {
  let sessionToken = '';
  try { sessionToken = requireLiveToken(); } catch { return { ok: false, error: 'UNAUTHENTICATED' }; }
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // 簡單請求，避免 CORS preflight
    body: JSON.stringify({ session_token: sessionToken, ...payload }),
  });
  return handleExpired(await res.json().catch(() => null));
}

async function get(params: Record<string, string | number | undefined>) {
  let sessionToken = '';
  try { sessionToken = requireLiveToken(); } catch { return { ok: false, error: 'UNAUTHENTICATED' }; }
  const url = new URL(BASE, location.origin);
  url.searchParams.set('token', sessionToken);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { cache: 'no-store' });
  return handleExpired(await res.json().catch(() => null));
}

// ===== 共用 =====
export const auth = (account: string, password: string) =>
  fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'auth', account, password }),
  }).then((r) => r.json()).catch(() => null);

// 題目檔：同一 session 內快取 10 分鐘(editor 儲存時會失效）
export function fetchQuestions(file: string): Promise<Question[] | null> {
  if (!file) return Promise.resolve(null);
  return cached(`questions:${file}`, async () => {
    const path = file.startsWith('/') ? file : `/${file}`;
    const res = await fetch(`${path}?token=${encodeURIComponent(token())}&ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.questions)) return data.questions;
    return null;
  }, 10 * 60 * 1000);
}

// ===== 學生 =====
export const submitAttempt = async (p: {
  account: string; quiz_id: string; quiz_version: number;
  answers: ServerAnswer[]; client_started_at: string; client_submitted_at: string;
  user_agent?: string;
}) => {
  const r = await post(p);
  if (r?.ok) {
    invalidate('history:'); // 交卷後成績列表需要重抓
    invalidate('admin:results');
  }
  return r;
};

export const historyList = (scope: 'best' | 'all') =>
  cached(`history:list:${scope}`, () => get({ action: 'history_list', scope }));
export const historyDetail = (attempt_id: string) =>
  cached(`history:detail:${attempt_id}`, () => get({ action: 'history_detail', attempt_id }));
export const listAvailableQuizzes = () =>
  get({ action: 'list_quizzes' }) as Promise<{ ok?: boolean; items?: QuizInfo[]; error?: string } | null>;
export const startQuiz = (quiz_id: string, quiz_version: number) =>
  post({ action: 'start_quiz', quiz_id, quiz_version });
export const saveDraft = (p: { quiz_id: string; quiz_version: number; answers: ServerAnswer[]; current_index: number; started_at?: string }) =>
  post({ action: 'save_draft', ...p });
export const getDraft = (quiz_id: string, quiz_version: number) =>
  get({ action: 'get_draft', quiz_id, quiz_version }); // 草稿要即時，不快取
export const clearDraft = (quiz_id: string, quiz_version: number) =>
  post({ action: 'clear_draft', quiz_id, quiz_version });

// ===== Admin =====
export const adminListQuizzes = () =>
  cached('admin:quizzes', () => get({ action: 'admin_list_quizzes' }));
export const adminQuizDetail = (quiz_id: string, quiz_version: number) =>
  get({ action: 'admin_quiz_detail', quiz_id, quiz_version }); // 編輯前要拿最新，不快取
export const adminQuizDraftDetail = (draft_id: string) =>
  get({ action: 'admin_quiz_draft_detail', draft_id });

export const adminDeleteQuiz = async (quiz_id: string, quiz_version: number, delete_file: boolean) => {
  const r = await post({ action: 'admin_delete_quiz', quiz_id, quiz_version, delete_file });
  if (r?.ok) invalidate('admin:');
  return r;
};
export const adminRenameQuiz = async (old_quiz_id: string, new_quiz_id: string, quiz_version: number, new_quiz_version = 1) => {
  const r = await post({ action: 'admin_rename_quiz', old_quiz_id, new_quiz_id, quiz_version, new_quiz_version });
  if (r?.ok) invalidate();
  return r;
};
export const adminUpdateTopic = async (old_topic: string, new_topic: string) => {
  const r = await post({ action: 'admin_update_topic', old_topic, new_topic });
  if (r?.ok) invalidate('admin:quizzes');
  return r;
};
export const adminUpsertQuizDraft = async (draft: Record<string, unknown>) => {
  const r = await post({ action: 'admin_upsert_quiz_draft', ...draft });
  if (r?.ok) invalidate('admin:quizzes');
  return r;
};
export const adminDeleteQuizDraft = async (draft_id: string) => {
  const r = await post({ action: 'admin_delete_quiz_draft', draft_id });
  if (r?.ok) invalidate('admin:quizzes');
  return r;
};
export const adminAssign = async (p: { quiz_id: string; quiz_version: number; accounts: string[]; attempt_limit?: number | null; due_at?: string | null; available_at?: string | null }) => {
  const r = await post({ action: 'admin_assign', ...p });
  if (r?.ok) invalidate('admin:quizzes');
  return r;
};
export const adminUnassign = async (quiz_id: string, quiz_version: number, accounts: string[]) => {
  const r = await post({ action: 'admin_unassign', quiz_id, quiz_version, accounts });
  if (r?.ok) invalidate('admin:quizzes');
  return r;
};
export const adminListUsers = () =>
  cached('admin:users', () => get({ action: 'admin_list_users' }));
export const adminUpsertUser = async (p: { account: string; password?: string; display_name?: string; role?: string; is_active?: boolean }) => {
  const r = await post({ action: 'admin_upsert_user', ...p });
  if (r?.ok) invalidate('admin:users');
  return r;
};
export const adminRenameUser = async (p: { account: string; new_account?: string; display_name?: string; password?: string; note?: string }) => {
  const r = await post({ action: 'admin_rename_user', ...p });
  if (r?.ok) {
    invalidate(); // 帳號名變動影響成績、公告、派遣等多處,全部重抓
  }
  return r;
};
export const adminDeleteUser = async (account: string) => {
  const r = await post({ action: 'admin_delete_user', account });
  if (r?.ok) invalidate();
  return r;
};
export const adminResults = (p: { quiz_id?: string; quiz_version?: number; account?: string }) =>
  cached(
    `admin:results:${p.quiz_id || ''}@${p.quiz_version || ''}@${p.account || ''}`,
    () => get({ action: 'admin_results', ...p }),
    60 * 1000 // 成績常有新交卷，快取短一點
  );
export const adminGradeAttempt = async (attempt_id: string, grades: unknown[]) => {
  const r = await post({ action: 'admin_grade_attempt', attempt_id, grades });
  if (r?.ok) invalidate();
  return r;
};

export const upsertQuiz = async (meta: Record<string, unknown>) => {
  const r = await post({ action: 'upsert_quiz', ...meta });
  if (r?.ok) invalidate('admin:quizzes');
  return r;
};
export const upsertAnswerKeys = async (quiz_id: string, quiz_version: number, keys: unknown[]) => {
  const r = await post({ action: 'upsert_answer_keys', quiz_id, quiz_version, keys });
  if (r?.ok) invalidate('history:'); // keys 變了，歷史詳情的正解也要重抓
  return r;
};
export const upsertQuestions = async (file_path: string, content: string) => {
  const r = await post({ action: 'upsert_questions', file_path, content });
  if (r?.ok) invalidate(`questions:${file_path}`);
  return r;
};
export const uploadImage = (
  file_name: string,
  data_base64: string,
  content_type: string,
  options: { interactive?: boolean; decision?: ImageUploadDecision; existing_path?: string } = {},
) => post({ action: 'upload_image', file_name, data_base64, content_type, ...options }) as Promise<ImageUploadResponse | null>;
export const uploadPdf = (data_base64: string) => post({ action: 'upload_pdf', data_base64 });
export const uploadFile = (file_name: string, data_base64: string, content_type: string) =>
  post({ action: 'upload_file', file_name, data_base64, content_type });

// ===== 公告/文章 =====
export const postsList = () => cached('posts:list', () => get({ action: 'posts_list' }));
export const adminListPosts = () => cached('admin:posts', () => get({ action: 'admin_list_posts' }));
export const adminUpsertPost = async (p: Record<string, unknown>) => {
  const r = await post({ action: 'admin_upsert_post', ...p });
  if (r?.ok) {
    invalidate('posts:');
    invalidate('admin:posts');
  }
  return r;
};
export const adminDeleteTag = async (name: string) => {
  const r = await post({ action: 'admin_delete_tag', name });
  if (r?.ok) {
    invalidate('posts:');
    invalidate('admin:posts');
  }
  return r;
};
export const adminDeletePost = async (id: string) => {
  const r = await post({ action: 'admin_delete_post', id });
  if (r?.ok) {
    invalidate('posts:');
    invalidate('admin:posts');
  }
  return r;
};

// ===== 個人設定 =====
export const updateProfile = (p: { current_password: string; display_name?: string; new_password?: string }) =>
  post({ action: 'update_profile', ...p });

// ===== 信箱綁定(驗證碼) =====
export interface ProfileStatus { email: string; email_verified: boolean; pending_email: string; mail_enabled: boolean }
export const profileStatus = () =>
  cached('profile:status', () => get({ action: 'profile_status' }), 5 * 60 * 1000);
export const requestEmailCode = (email: string) => post({ action: 'request_email_code', email });
export const verifyEmailCode = async (code: string) => {
  const r = await post({ action: 'verify_email_code', code });
  if (r?.ok) {
    invalidate('profile:');
    window.dispatchEvent(new Event('hw:profile-refresh')); // 通知 App 解除未驗證擋板
  }
  return r;
};

// ===== 提問(師生問答) =====
export interface QaImage { url: string; path: string; size: number }
export interface QaMessage {
  role: 'student' | 'admin';
  account: string;
  sender: string;
  content: string;
  images: QaImage[];
  created_at: string;
}
export interface QaThread {
  id: string;
  account: string;
  display_name: string;
  title: string;
  status: 'answered' | 'waiting';
  unread: boolean;
  message_count: number;
  images_bytes: number;
  created_at: string;
  updated_at: string;
  messages?: QaMessage[];
  context?: QaContext;
}

export interface QaContext {
  quiz_id: string;
  quiz_version: number;
  quiz_title: string;
  question_index: number;
}

// 未讀紅點:資料變動後通知 Shell 重抓
export function pingUnread() {
  invalidate('unread:');
  window.dispatchEvent(new Event('hw:unread-refresh'));
}

// ===== AI 家教 =====
export interface AiTutorMessage {
  role: 'user' | 'model';
  text: string;
  model_label?: string; // AI 回覆時實際使用的模型
  sent_at?: number; // 學生送出的時間，用來顯示已處理多久
}

export interface AiTutorPending {
  status: 'running' | 'failed';
  question: string;
  created_at: string;
  error?: string;
}


export interface AiTutorModel {
  id: string;
  label: string;
  vision: boolean;
  remaining: number;
}

export const aiTutorStatus = () => get({ action: 'ai_tutor_status' });
export const aiTutorThread = (attempt_id: string, q_index: number) => get({ action: 'ai_tutor_thread', attempt_id, q_index });

export const aiTutorAsk = (p: { attempt_id: string; q_index: number; question: string; pdf_crop?: string; model: string }) =>
  post({ action: 'ai_tutor_ask', ...p });

export const aiTutorCancel = (attempt_id: string, q_index: number) => post({ action: 'ai_tutor_cancel', attempt_id, q_index });

export const adminResetAiUsage = (account: string) => post({ action: 'admin_reset_ai_usage', account });

export const qaList = () => cached('qa:list', () => get({ action: 'qa_list' }), 60 * 1000);
export const qaDetail = async (id: string) => {
  const r = await get({ action: 'qa_detail', id });
  if (r?.ok) {
    invalidate('qa:'); // 打開即標已讀,列表的未讀點要更新
    pingUnread();
  }
  return r;
};
export const qaCreate = async (p: { title: string; content: string; images: QaImage[]; context?: QaContext }) => {
  const r = await post({ action: 'qa_create', ...p });
  if (r?.ok) invalidate('qa:');
  return r;
};
export const qaReply = async (p: { thread_id: string; content: string; images: QaImage[] }) => {
  const r = await post({ action: 'qa_reply', ...p });
  if (r?.ok) invalidate('qa:');
  return r;
};
export const qaUploadImage = (file_name: string, data_base64: string, content_type: string) =>
  post({ action: 'qa_upload_image', file_name, data_base64, content_type });
export const qaDeleteThread = async (thread_id: string) => {
  const r = await post({ action: 'qa_delete', thread_id });
  if (r?.ok) {
    invalidate('qa:');
    pingUnread();
  }
  return r;
};

// ===== 未讀通知 =====
export const unreadStatus = () =>
  cached('unread:status', () => get({ action: 'unread_status' }), 60 * 1000);
export const markPostRead = async (post_id: string) => {
  const r = await post({ action: 'mark_post_read', post_id });
  if (r?.ok) pingUnread();
  return r;
};

// ===== 登入時預先載入（在背景填快取，切分頁就不用等） =====
export function warmCache(role: string) {
  if ((role || '').toLowerCase() === 'admin') {
    void adminListQuizzes();
    void adminListUsers();
    void adminResults({});
  } else {
    void historyList('all');
    void historyList('best');
  }
}
