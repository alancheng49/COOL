import { WEBAPP_URL } from './config.js';

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