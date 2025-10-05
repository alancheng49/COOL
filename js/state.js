// 共用狀態
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

// DOM 參考（由 main.js 在 DOMContentLoaded 後填入）
export const dom = {};