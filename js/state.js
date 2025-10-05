// state.js
// =============== 共享狀態（in-memory） ===============
export const state = {
  user: null,

  quizData: [],
  currentQuestionIndex: 0,
  userAnswers: [],

  selectedQuizId: null,
  selectedQuizFile: null,
  currentQuizId: null,
  currentQuizVersion: 1,

  quizStartedAtISO: null,

  // 計時器
  timeLimitSec: null,      // null/0 = 不限時
  deadlineAtMs: null,
  timerId: null,
  autoSubmitted: false,

  // 登入流程
  loginBusy: false,
  loginAbortController: null,
  loginSlowHintTimer: null,
  suppressLoginError: false,
};

// DOM 參考（載入後由各頁填入）
export const dom = {};

// =============== Session/路由輔助（sessionStorage） ===============
const KEY = 'hw.session';
const CUR = 'hw.currentQuiz';

export function saveSession(data) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
}
export function getSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function clearSession() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(CUR);
}

export function requireLogin(redirect = true) {
  const s = getSession();
  if (!s?.account) {
    if (redirect) {
      // 避免回上一頁再前進造成多條歷史紀錄
      location.replace(`login.html?v=b1.3.0 || Date.now()}`);
    }
    // 阻止後續程式繼續執行
    throw new Error('UNAUTHENTICATED');
  }
  return s;
}

export function saveCurrentQuiz(q) {
  sessionStorage.setItem(CUR, JSON.stringify(q));
}
export function getCurrentQuiz() {
  try {
    const raw = sessionStorage.getItem(CUR);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function clearCurrentQuiz() {
  sessionStorage.removeItem(CUR);
}

// =============== 小工具 ===============
export function hydrateFromSession() {
  // 把 session 的 user 灌到 in-memory state
  const s = getSession();
  state.user = s ? { account: s.account, display_name: s.display_name, role: s.role } : null;
  return s;
}

export function resetState() {
  state.quizData = [];
  state.currentQuestionIndex = 0;
  state.userAnswers = [];

  state.selectedQuizId = null;
  state.selectedQuizFile = null;
  state.currentQuizId = null;
  state.currentQuizVersion = 1;

  state.quizStartedAtISO = null;

  state.timeLimitSec = null;
  state.deadlineAtMs = null;
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.autoSubmitted = false;

  state.loginBusy = false;
  state.loginAbortController = null;
  state.loginSlowHintTimer = null;
  state.suppressLoginError = false;
}

export function logoutAndRedirect() {
  try { if (state.loginAbortController) state.loginAbortController.abort(); } catch {}
  clearSession();
  resetState();
  location.replace(`login.html?v=b1.3.0 || Date.now()}`);
}