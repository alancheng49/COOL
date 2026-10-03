export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'hw.theme';
const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolveDark(pref: ThemePref): boolean {
  return pref === 'dark' || (pref === 'system' && mq().matches);
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.classList.toggle('dark', resolveDark(pref));
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

/** 頁面載入時呼叫一次:套用主題,並在「跟隨系統」時監聽系統切換 */
export function initTheme() {
  applyTheme(getThemePref());
  mq().addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}
