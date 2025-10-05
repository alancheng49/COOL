import { BUILD_VERSION } from './config.js';
import { state } from './state.js';
import { renderAllMath } from './katex.js';
import { auth, ping } from './api.js';
import { startTimer, clearTimer } from './timer.js';
import { renderSidebar, displayQuestion, updateSidebarClasses, goToQuestion } from './quiz-ui.js';
import { showResults } from './results.js';

// ---- DOM 裝配 ----
window.addEventListener('DOMContentLoaded', () => {
  // 收集所有用到的節點（直接掛回 state 或用 document.getElementById 亦可）
  const ids = [
    'login-container','picker-container','quiz-container','results-container',
    'username','password','login-btn','login-error',
    'quiz-select','start-quiz-btn','logout-btn','picker-error',
    'question-content','options-container','next-btn','prev-btn',
    'submit-btn','submit-btn-mobile','score','wrong-answers-list',
    'restart-btn','back-to-picker-btn','question-list','quiz-timer'
  ];
  ids.forEach(id => state[id.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = document.getElementById(id));

  // 版本角落
  const bv = document.getElementById('build-version');
  if (bv) bv.textContent = BUILD_VERSION;

  renderAllMath(document.body);

  // 綁事件
  bindEvents();
});

// ---- 事件 ----
function bindEvents() {
  const $ = (id) => document.getElementById(id);

  // 登入
  $('login-btn').addEventListener('click', onLogin);

  // 題庫選擇
  $('quiz-select').addEventListener('change', () => {
    state.selectedQuizId   = $('quiz-select').value;
    state.selectedQuizFile = $('quiz-select').selectedOptions[0].dataset.file;
  });
  $('start-quiz-btn').addEventListener('click', startQuizFromPicker);

  // 導覽
  $('prev-btn').addEventListener('click', () => {
    if (state.currentQuestionIndex > 0) { state.currentQuestionIndex--; displayQuestion(); }
  });
  $('next-btn').addEventListener('click', () => {
    if (state.currentQuestionIndex < state.quizData.length - 1) { state.currentQuestionIndex++; displayQuestion(); }
  });

  // 隨時繳交
  const trySubmit = () => {
    const unanswered = state.userAnswers.reduce((n,v)=> n + (v===undefined?1:0), 0);
    if (unanswered > 0 && !confirm(`還有 ${unanswered} 題未作答，確定要繳交嗎？`)) return;
    showResults();
  };
  $('submit-btn').addEventListener('click', trySubmit);
  $('submit-btn-mobile').addEventListener('click', trySubmit);

  // 返回/重考
  $('restart-btn').addEventListener('click', () => {
    if (!state.selectedQuizFile) {
      $('results-container').classList.add('hidden');
      $('picker-container').classList.remove('hidden');
      return;
    }
    startQuiz(state.selectedQuizFile);
  });
  $('back-to-picker-btn').addEventListener('click', () => {
    $('results-container').classList.add('hidden');
    $('quiz-container').classList.add('hidden');
    clearTimer();
    showQuizPicker(true);
  });

  // 登出
  $('logout-btn').addEventListener('click', onLogout);

  // 暖機
  window.addEventListener('load', () => ping());
}

// ---- 登入 / 登出 ----
async function onLogin() {
  if (state.loginBusy) return;

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const loginError = document.getElementById('login-error');
  if (!username || !password) { loginError.textContent = '請輸入帳號與密碼'; return; }

  setLoginBusy(true);
  try { state.loginAbortController?.abort(); } catch {}
  state.loginAbortController = new AbortController();

  state.loginSlowHintTimer = setTimeout(() => {
    if (!loginError.textContent) loginError.textContent = '正在連線伺服器（第一次可能較慢）…';
  }, 1500);

  try {
    const data = await auth(username, password, state.loginAbortController.signal);
    if (!data || !data.ok) {
      loginError.textContent = `登入失敗：${data && data.error ? data.error : '未知錯誤'}`;
      return;
    }
    state.user = {
      account: data.account,
      display_name: data.display_name,
      role: data.role,
      quizzes: data.quizzes || []
    };

    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('quiz-container').classList.add('hidden');

    showQuizPicker();

  } catch (e) {
    if (e?.name !== 'AbortError') {
      loginError.textContent = '登入服務暫時無法使用，請稍後再試';
      console.error(e);
    }
  } finally {
    clearTimeout(state.loginSlowHintTimer); state.loginSlowHintTimer = null;
    setLoginBusy(false);
    state.loginAbortController = null;
  }
}

function onLogout() {
  try { state.loginAbortController?.abort(); } catch {}
  clearTimeout(state.loginSlowHintTimer); state.loginSlowHintTimer = null;
  setLoginBusy(false);
  document.getElementById('login-error').textContent = '';
  clearTimer();

  state.user = null;
  state.selectedQuizFile = state.selectedQuizId = null;
  state.currentQuizId = null; state.currentQuizVersion = 1;
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';

  document.getElementById('picker-container').classList.add('hidden');
  document.getElementById('quiz-container').classList.add('hidden');
  document.getElementById('results-container').classList.add('hidden');
  document.getElementById('login-container').classList.remove('hidden');
}

function setLoginBusy(busy){
  state.loginBusy = busy;
  const btn = document.getElementById('login-btn');
  if (!btn.dataset.idleText) btn.dataset.idleText = btn.textContent || '登入';
  btn.textContent = busy ? '登入中…' : btn.dataset.idleText;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  btn.disabled = busy;
  document.getElementById('username').disabled = busy;
  document.getElementById('password').disabled = busy;
  btn.classList.toggle('is-busy', busy);
}

// ---- 題庫選擇 & 開考 ----
function showQuizPicker(forceShow=false) {
  const sel = document.getElementById('quiz-select');
  const err = document.getElementById('picker-error');
  const box = document.getElementById('picker-container');

  sel.innerHTML = '';
  err.textContent = '';
  const quizzes = state.user?.quizzes ?? [];
  if (quizzes.length === 0) {
    err.textContent = '此帳號尚未配置題庫，請聯絡老師或管理員。';
    box.classList.remove('hidden'); return;
  }

  quizzes.forEach((q, i) => {
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.dataset.file = q.file;
    opt.textContent = `${q.id} ─ ${q.name}`;
    if (i===0) opt.selected = true;
    sel.appendChild(opt);
  });

  if (quizzes.length === 1 && !forceShow) {
    const q0 = quizzes[0];
    state.selectedQuizId   = q0.id;
    state.selectedQuizFile = q0.file;
    state.currentQuizId    = q0.id;
    state.currentQuizVersion = q0.version || 1;
    box.classList.add('hidden');
    startQuiz(q0.file);
  } else {
    state.selectedQuizId   = sel.value;
    state.selectedQuizFile = sel.selectedOptions[0].dataset.file;
    box.classList.remove('hidden');
  }
}

function startQuizFromPicker() {
  const sel = document.getElementById('quiz-select');
  const err = document.getElementById('picker-error');
  if (!sel.value || !sel.selectedOptions[0]) { err.textContent = '請先選擇題庫！'; return; }

  state.selectedQuizId   = sel.value;
  state.selectedQuizFile = sel.selectedOptions[0].dataset.file;
  state.currentQuizId    = state.selectedQuizId;

  const picked = state.user?.quizzes?.find(q => q.id === state.selectedQuizId);
  if (picked?.version) state.currentQuizVersion = picked.version;
  const tlm = (picked && typeof picked.time_limit_minutes === 'number') ? picked.time_limit_minutes : null;
  state.timeLimitSec = tlm && tlm > 0 ? tlm * 60 : null;

  document.getElementById('picker-container').classList.add('hidden');
  startQuiz(state.selectedQuizFile);
}

async function startQuiz(quizFile) {
  if (!state.user) { alert('請先登入！'); return; }
  if (!quizFile)    { alert('請先選擇題庫！'); return; }

  try {
    const url = `${quizFile}?v=${BUILD_VERSION}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`無法讀取題庫檔案：${quizFile}`);

    state.quizData = await res.json();
    state.quizStartedAtISO = new Date().toISOString();
    state.currentQuestionIndex = 0;
    state.userAnswers = Array(state.quizData.length).fill(undefined);

    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('quiz-container').classList.remove('hidden');

    renderSidebar();
    displayQuestion();

    clearTimer();
    startTimer(state.timeLimitSec, () => showResults());

  } catch (e) {
    alert(e.message);
    document.getElementById('quiz-container').classList.add('hidden');
    document.getElementById('picker-container').classList.remove('hidden');
  }
}