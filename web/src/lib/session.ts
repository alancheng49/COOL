import type { Session } from './types';

const KEY = 'hw.session';

// 用 localStorage 記住登入狀態：關閉瀏覽器再開啟仍有效，直到手動登出或 token 過期
export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY); // 相容舊版
    const value = raw ? (JSON.parse(raw) as Session) : null;
    if (value?.expires_at && new Date(value.expires_at).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}

export function isAdmin(s: Session | null): boolean {
  return (s?.role || '').toLowerCase() === 'admin';
}
