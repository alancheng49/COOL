import { WEBAPP_URL } from './config.js';
import { getSession } from './state.js';

export async function ping() {
  try { await fetch(WEBAPP_URL, { method: 'GET', cache: 'no-store' }); } catch {}
}

export async function auth(account, password, signal) {
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'auth', account, password }),
    signal
  });
  return res.json().catch(()=>null);
}

export async function submitAttempt(payload) {
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
  return res.json().catch(()=>null);
}

export async function fetchHistoryList(scope = 'best') {
  const s = getSession();
  const url = `${WEBAPP_URL}?action=history_list&account=${encodeURIComponent(s.account)}&scope=${encodeURIComponent(scope)}`;
  const res = await fetch(url, { method:'GET', cache:'no-store' });
  return res.json().catch(()=>null);
}

export async function fetchAttemptDetail(attempt_id) {
  const s = getSession();
  const url = `${WEBAPP_URL}?action=history_detail&account=${encodeURIComponent(s.account)}&attempt_id=${encodeURIComponent(attempt_id)}`;
  const res = await fetch(url, { method:'GET', cache:'no-store' });
  return res.json().catch(()=>null);
}

// ===== 預留：上傳 quiz 與 answer keys（Apps Script 端稍後實作） =====
export async function upsertQuiz(meta) {
  // 建議欄位：{ quiz_id, quiz_version, title, total_points, is_active, file, time_limit_minutes }
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'upsert_quiz', ...meta })
  });
  return res.json().catch(()=>null);
}

export async function upsertAnswerKeys(quiz_id, quiz_version, keys) {
  // keys: [{ q_index, correct_index }] 或 [{ q_index, correct_indices: [...] }]
  const payload = { action: 'upsert_answer_keys', quiz_id, quiz_version, keys };
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
  return res.json().catch(()=>null);
}


/** 
 * 預留接口：上傳答案表到試算表的 answer_keys
 * payload 建議格式：
 * {
 *   action: 'upload_answer_keys',
 *   quiz_id, quiz_version,
 *   answer_keys: [
 *     { q_index, correct_index },                 // choice
 *     { q_index, correct_indices: [..] }         // cloze
 *   ]
 * }
 */
export async function uploadAnswerKeys(payload){
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'upload_answer_keys', ...(payload||{}) })
  });
  return res.json().catch(()=>null);
}

/**
 * 預留接口：上傳題庫中繼資料到試算表 quizzes
 * payload 建議格式：
 * { action: 'upload_quiz_meta', quiz_id, quiz_version, title, total_points, is_active, file, time_limit_minutes }
 */
export async function uploadQuizMeta(payload){
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'upload_quiz_meta', ...(payload||{}) })
  });
  return res.json().catch(()=>null);
}

// List all quizzes (admin-only intended). Returns: { ok: true, items: [ { quiz_id, quiz_version, title, file, time_limit_minutes, is_active }, ... ] }
export async function listQuizzes(){
  const url = new URL(WEBAPP_URL);
  url.searchParams.set('action', 'list_quizzes');
  // Some backends might require account for auditing; include if session exists
  try {
    const sess = getSession && getSession();
    if (sess && sess.account) url.searchParams.set('account', sess.account);
  } catch {}
  const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  return res.json().catch(()=>null);
}


export async function syncQuestionsToGitHub(file, content, message) {
  // 後端 GAS 已提供 action: 'github_upsert_questions'
  const payload = { action: 'github_upsert_questions', file, content, message };
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => null);
}