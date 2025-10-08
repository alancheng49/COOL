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