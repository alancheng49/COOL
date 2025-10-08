// js/quiz.page.js
import { BUILD_VERSION } from './config.js';
import { state, requireLogin, getCurrentQuiz, getSession, clearCurrentQuiz } from './state.js';
import { renderAllMath } from './katex.js';
import { startTimer, clearTimer } from './timer.js';
import { renderSidebar, displayQuestion } from './quiz-ui.js';
import { showResults } from './results.js';

// ---- 先檢查登入與是否選題 ----
const sess = requireLogin();           // ← 會自動導回 login.html；同時回傳 session
state.user = sess;                     // ← 關鍵：把使用者塞回全域狀態（避免 account 變 'unknown'）

const picked = getCurrentQuiz();
if (!picked) {
  location.replace(`picker.html?v=${BUILD_VERSION}`);
  throw new Error('未選題，導回題庫選擇');
}

// ---- 啟動 ----
window.addEventListener('DOMContentLoaded', () => {
  const bv = document.getElementById('build-version');
  if (bv) bv.textContent = BUILD_VERSION;
  renderAllMath(document.body);

  bindQuizEvents();   // ← 綁定按鈕事件（包含「繳交 / 重考 / 回到選擇」）
  initQuiz();
});

function bindQuizEvents() {
  // 上/下一題
  document.getElementById('prev-btn')?.addEventListener('click', () => {
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex--;
      displayQuestion();
    }
  });
  document.getElementById('next-btn')?.addEventListener('click', () => {
    if (state.currentQuestionIndex < state.quizData.length - 1) {
      state.currentQuestionIndex++;
      displayQuestion();
    }
  });

  // 隨時繳交（桌機 + 行動）
  const trySubmit = () => {
    const unanswered = state.userAnswers.reduce((n, v) => n + (v === undefined ? 1 : 0), 0);
    if (unanswered > 0) {
      const ok = confirm(`還有 ${unanswered} 題未作答，確定要繳交嗎？`);
      if (!ok) return;
    }
    showResults();  // results.js 會送卷 + 顯示
  };
  document.getElementById('submit-btn')?.addEventListener('click', trySubmit);
  document.getElementById('submit-btn-mobile')?.addEventListener('click', trySubmit);

  // 重新測驗（同一份）
  document.getElementById('restart-btn')?.addEventListener('click', () => {
    // 直接重新載入 quiz.html（保留 currentQuiz）
    clearTimer();
    location.href = `quiz.html?v=${BUILD_VERSION}&t=${Date.now()}`;
  });

  // 回到題庫選擇
  document.getElementById('back-to-picker-btn')?.addEventListener('click', () => {
    clearTimer();
    clearCurrentQuiz(); // ← 清掉目前選題，回 picker 重新選
    location.href = `picker.html?v=${BUILD_VERSION}`;
  });

  document.getElementById('back-to-account-btn')?.addEventListener('click', ()=>{
    location.href = `account.html?v=${BUILD_VERSION}`;
  });
}

async function initQuiz() {
  // 1) 抓題庫
  const url = normalizeFileUrl(picked.file, BUILD_VERSION);
  console.log('[quiz] 將載入題庫：', picked, ' URL=', url);

  let text;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`讀檔失敗(${res.status})：${url}`);
    text = await res.text();
  } catch (e) {
    fail(`無法讀取題庫檔案：${e.message}`);
    return;
  }

  // 2) 解析 JSON（允許 {questions:[...]}）
  let data;
  try { data = JSON.parse(text); }
  catch {
    console.error('[quiz] 題庫不是 JSON，前 400 字：\n', String(text).slice(0,400));
    fail('題庫不是有效 JSON（常見：路徑錯導致回來的是 HTML）。');
    return;
  }
  if (!Array.isArray(data) && Array.isArray(data?.questions)) data = data.questions;
  if (!Array.isArray(data) || data.length === 0) {
    console.error('[quiz] 解析後為空：', data);
    fail('題庫為空或格式錯誤（應該是題目物件的陣列）。');
    return;
  }

  // 3) 寫入共用 state（※ 版本轉數字）
  state.quizData = data;
  state.currentQuestionIndex = 0;
  state.userAnswers = Array(data.length).fill(undefined);
  state.quizStartedAtISO = new Date().toISOString();
  state.selectedQuizId    = picked.id;
  state.selectedQuizFile  = picked.file;
  state.currentQuizId     = picked.id;
  state.currentQuizVersion= Number(picked.version || 1);  // ← 確保是數字！
  state.timeLimitSec = picked.time_limit_minutes ? picked.time_limit_minutes * 60 : null;

  document.getElementById('results-container')?.classList.add('hidden');
  document.getElementById('quiz-container')?.classList.remove('hidden');

  // 4) 渲染
  try {
    renderSidebar();
    displayQuestion();
  } catch (e) {
    console.error('[quiz] render 錯誤：', e);
    fail('渲染題目時發生錯誤，請開 Console 查看。');
    return;
  }

  // 5) 計時器（有設定才開）
  clearTimer();
  const tlm = Number(picked.time_limit_minutes || 0);
  if (tlm > 0) startTimer(tlm * 60, () => showResults());

  console.log('[quiz] 題目數：', data.length);
}

// ---- 小工具 ----
function normalizeFileUrl(file, ver) {
  if (!file) return '';
  const hasPrefix = file.startsWith('./') || file.startsWith('/') || file.startsWith('http');
  const base = hasPrefix ? file : `./${file}`;
  return `${base}?v=${encodeURIComponent(ver)}`;
}
function fail(msg) {
  alert(msg);
  document.getElementById('quiz-container')?.classList.add('hidden');
  document.getElementById('picker-container')?.classList.remove('hidden');
}