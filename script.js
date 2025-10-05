// === 後端 WebApp URL ===
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyTnaCOBxIdYBvMgQl3lVmJ54iVhlKFY6k0l1LRQxOPRAXE-SSqv4chae2V21s_aiHt/exec';

// 交卷時間紀錄
let quizStartedAtISO = null;

// ==========================
// KaTeX：安全渲染
// ==========================
const katexReady = new Promise((resolve) => {
  if (window.renderMathInElement) return resolve();
  window.addEventListener("DOMContentLoaded", () => {
    const auto = document.getElementById("katex-auto-render");
    if (auto) auto.addEventListener("load", () => resolve(), { once: true });
  });
  (function check(){ if (window.renderMathInElement) return resolve(); setTimeout(check, 50);} )();
});

async function renderAllMath(root = document.body) {
  await katexReady;
  await new Promise(requestAnimationFrame);
  if (!window.renderMathInElement) return;
  window.renderMathInElement(root, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
}

// ==========================
// DOM
// ==========================
const loginContainer   = document.getElementById('login-container');
const pickerContainer  = document.getElementById('picker-container');
const quizContainer    = document.getElementById('quiz-container');
const resultsContainer = document.getElementById('results-container');

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');

const quizSelect    = document.getElementById('quiz-select');
const startQuizBtn  = document.getElementById('start-quiz-btn');
const logoutBtn     = document.getElementById('logout-btn');
const pickerError   = document.getElementById('picker-error');

const questionContent   = document.getElementById('question-content');
const optionsContainer  = document.getElementById('options-container');
const nextBtn           = document.getElementById('next-btn');
const prevBtn           = document.getElementById('prev-btn');

const submitBtn         = document.getElementById('submit-btn');
const submitBtnMobile   = document.getElementById('submit-btn-mobile');

const scoreEl           = document.getElementById('score');
const wrongAnswersList  = document.getElementById('wrong-answers-list');
const restartBtn        = document.getElementById('restart-btn');
const backToPickerBtn   = document.getElementById('back-to-picker-btn');

const questionListEl    = document.getElementById('question-list');
const quizTimerEl       = document.getElementById('quiz-timer'); // ← 計時器顯示節點

// ==========================
// 狀態
// ==========================
let quizData = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let currentUser = null;

let selectedQuizId = null;
let selectedQuizFile = null;
let currentQuizId = null;
let currentQuizVersion = 1;

// 計時器狀態
let timeLimitSec = null;   // null/0 = 不限時
let deadlineAtMs = null;
let timerId = null;
let autoSubmitted = false;

// 登入忙碌
let loginAbortController = null;
let loginBusy = false;
let loginSlowHintTimer = null;
let suppressLoginError = false;

function setLoginBusy(busy) {
  loginBusy = busy;
  if (!loginBtn.dataset.idleText) {
    loginBtn.dataset.idleText = loginBtn.textContent || '登入';
  }
  loginBtn.textContent = busy ? '登入中…' : loginBtn.dataset.idleText;
  loginBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
  loginBtn.disabled = busy;
  usernameInput.disabled = busy;
  passwordInput.disabled = busy;
  loginBtn.classList.toggle('is-busy', busy);
}

// ==========================
// 計時器：控制
// ==========================
function clearTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  deadlineAtMs = null;
  autoSubmitted = false;
  if (quizTimerEl) {
    quizTimerEl.textContent = '';
    quizTimerEl.classList.remove('danger');
    quizTimerEl.style.display = 'none';
  }
}

function startTimer(seconds) {
  if (!quizTimerEl) return;
  if (!seconds || seconds <= 0) { // 不限時
    clearTimer();
    return;
  }
  timeLimitSec = seconds;
  deadlineAtMs = new Date(quizStartedAtISO).getTime() + seconds * 1000;
  autoSubmitted = false;

  quizTimerEl.style.display = 'inline-flex';

  const fmt = (s) => {
    const m = Math.floor(s / 60), ss = s % 60;
    return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const tick = () => {
    const remain = Math.max(0, Math.ceil((deadlineAtMs - Date.now()) / 1000));
    quizTimerEl.textContent = fmt(remain);
    if (remain <= 30) quizTimerEl.classList.add('danger');
    if (remain <= 0 && !autoSubmitted) {
      autoSubmitted = true;
      disableInteractions();
      showResults();        // 強制繳交
    }
  };

  tick();
  timerId = setInterval(tick, 250);
}

function disableInteractions() {
  // 避免到時重複點擊
  [nextBtn, prevBtn, submitBtn, submitBtnMobile].forEach(btn => { if (btn) btn.disabled = true; });
  document.querySelectorAll('.option').forEach(el => el.style.pointerEvents = 'none');
}

// ==========================
// 登入
// ==========================
loginBtn.addEventListener('click', async () => {
  if (loginBusy) return;

  suppressLoginError = false;
  if (loginSlowHintTimer) { clearTimeout(loginSlowHintTimer); loginSlowHintTimer = null; }

  loginError.textContent = '';
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    loginError.textContent = '請輸入帳號與密碼';
    return;
  }

  setLoginBusy(true);
  try { loginAbortController?.abort(); } catch(_) {}
  loginAbortController = new AbortController();

  loginSlowHintTimer = setTimeout(() => {
    if (!loginError.textContent) loginError.textContent = '正在連線伺服器（第一次可能較慢）…';
  }, 1500);

  try {
    const res = await fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'auth', account: username, password }),
      signal: loginAbortController.signal
    });
    const data = await res.json().catch(() => null);

    if (!data || !data.ok) {
      loginError.textContent = `登入失敗：${data && data.error ? data.error : '未知錯誤'}`;
      return;
    }

    currentUser = {
      account: data.account,
      display_name: data.display_name,
      role: data.role,
      quizzes: data.quizzes || []
    };
    selectedQuizId = selectedQuizFile = null;
    currentQuizId = null;
    currentQuizVersion = 1;

    loginContainer.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    quizContainer.classList.add('hidden');
    showQuizPicker();

  } catch (err) {
    if (err?.name !== 'AbortError') {
      loginError.textContent = '登入服務暫時無法使用，請稍後再試';
      console.error(err);
    }
  } finally {
    clearTimeout(loginSlowHintTimer);
    loginSlowHintTimer = null;
    setLoginBusy(false);
    loginAbortController = null;
  }
});

// 題庫選擇
function showQuizPicker(forceShow = false) {
  quizSelect.innerHTML = '';
  pickerError.textContent = '';

  const quizzes = currentUser?.quizzes ?? [];
  if (quizzes.length === 0) {
    pickerError.textContent = '此帳號尚未配置題庫，請聯絡老師或管理員。';
    pickerContainer.classList.remove('hidden');
    return;
  }

  quizzes.forEach((q, i) => {
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.dataset.file = q.file;
    opt.textContent = `${q.id} ─ ${q.name}`;
    if (i === 0) opt.selected = true;
    quizSelect.appendChild(opt);
  });

  if (quizzes.length === 1 && !forceShow) {
    const q0 = quizzes[0];
    selectedQuizId   = q0.id;
    selectedQuizFile = q0.file;
    currentQuizId    = q0.id;
    currentQuizVersion = q0.version || 1;
    pickerContainer.classList.add('hidden');
    startQuiz(selectedQuizFile);
  } else {
    selectedQuizId   = quizSelect.value;
    selectedQuizFile = quizSelect.selectedOptions[0].dataset.file;
    pickerContainer.classList.remove('hidden');
  }
}

quizSelect.addEventListener('change', () => {
  selectedQuizId   = quizSelect.value;
  selectedQuizFile = quizSelect.selectedOptions[0].dataset.file;
});

startQuizBtn.addEventListener('click', () => {
  if (!selectedQuizFile || !selectedQuizId) {
    pickerError.textContent = '請先選擇題庫！';
    return;
  }
  currentQuizId = selectedQuizId;
  const picked = currentUser?.quizzes?.find(q => q.id === selectedQuizId);
  if (picked?.version) currentQuizVersion = picked.version;

  // 讀取 time_limit_minutes → 秒數
  const tlm = (picked && typeof picked.time_limit_minutes === 'number') ? picked.time_limit_minutes : null;
  timeLimitSec = tlm && tlm > 0 ? tlm * 60 : null;

  pickerContainer.classList.add('hidden');
  startQuiz(selectedQuizFile);
});

// 登出
logoutBtn.addEventListener('click', () => {
  suppressLoginError = true;
  try { loginAbortController?.abort(); } catch(_) {}
  if (loginSlowHintTimer) { clearTimeout(loginSlowHintTimer); loginSlowHintTimer = null; }
  setLoginBusy(false);
  loginError.textContent = '';

  clearTimer();

  currentUser = null;
  selectedQuizFile = selectedQuizId = null;
  currentQuizId = null; currentQuizVersion = 1;
  usernameInput.value = ''; passwordInput.value = '';

  pickerContainer.classList.add('hidden');
  quizContainer.classList.add('hidden');
  resultsContainer.classList.add('hidden');
  loginContainer.classList.remove('hidden');
});

// ==========================
// 開始測驗
// ==========================
async function startQuiz(quizFile) {
  if (!currentUser) { alert('請先登入！'); return; }
  if (!quizFile) { alert('請先選擇題庫！'); return; }

  try {
    const url = `${quizFile}?v=${window.BUILD_VERSION || Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`無法讀取題庫檔案：${quizFile}`);

    quizData = await response.json();
    quizStartedAtISO = new Date().toISOString();
    currentQuestionIndex = 0;
    userAnswers = Array(quizData.length).fill(undefined);

    resultsContainer.classList.add('hidden');
    quizContainer.classList.remove('hidden');

    renderSidebar();
    displayQuestion();

    // 啟用計時器（有設定才顯示）
    clearTimer();
    startTimer(timeLimitSec);

  } catch (err) {
    alert(err.message);
    quizContainer.classList.add('hidden');
    pickerContainer.classList.remove('hidden');
  }
}

// ==========================
// 題目顯示 & 選項
// ==========================
function displayQuestion() {
  questionContent.innerHTML = '';
  optionsContainer.innerHTML = '';

  const q = quizData[currentQuestionIndex];

  if (q.question_image && q.question_type !== 'image') {
    const row = document.createElement('div'); row.className='q-row';
    const text = document.createElement('div'); text.className='q-text';
    const h2 = document.createElement('h2'); h2.innerHTML = q.question_content; text.appendChild(h2);
    const media = document.createElement('div'); media.className='q-media';
    const img = document.createElement('img'); img.src = q.question_image; img.alt = `題目圖片 ${currentQuestionIndex+1}`;
    media.appendChild(img);
    row.appendChild(text); row.appendChild(media);
    questionContent.appendChild(row);
  } else if (q.question_type === 'image') {
    const img = document.createElement('img');
    img.src = q.question_content;
    img.alt = `題目圖片 ${currentQuestionIndex+1}`;
    questionContent.appendChild(img);
  } else {
    const title = document.createElement('h2');
    title.innerHTML = q.question_content;
    questionContent.appendChild(title);
  }

  q.options.forEach((opt, idx) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.innerHTML = opt;
    if (userAnswers[currentQuestionIndex] === idx) div.classList.add('selected');
    div.addEventListener('click', () => selectOption(div, idx));
    optionsContainer.appendChild(div);
  });

  renderAllMath(questionContent);
  renderAllMath(optionsContainer);

  updateSidebarClasses();

  nextBtn.textContent = (currentQuestionIndex === quizData.length - 1) ? '到最後了' : '下一題';
}

function selectOption(optionDiv, selectedIndex) {
  document.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
  optionDiv.classList.add('selected');
  userAnswers[currentQuestionIndex] = selectedIndex;
  markAnswered(currentQuestionIndex, true);
  updateSidebarClasses();
}

// ==========================
// 側邊欄：渲染與狀態
// ==========================
function renderSidebar() {
  questionListEl.innerHTML = '';
  quizData.forEach((_, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-item';
    btn.dataset.index = i;
    btn.textContent = `第 ${i+1} 題`;
    if (userAnswers[i] !== undefined) btn.classList.add('answered');
    if (i === currentQuestionIndex) btn.classList.add('current');
    btn.addEventListener('click', () => goToQuestion(i));
    li.appendChild(btn);
    questionListEl.appendChild(li);
  });
}

function updateSidebarClasses() {
  const buttons = questionListEl.querySelectorAll('.q-item');
  buttons.forEach(btn => {
    const i = Number(btn.dataset.index);
    btn.classList.toggle('current', i === currentQuestionIndex);
    btn.classList.toggle('answered', userAnswers[i] !== undefined);
  });
}

function markAnswered(index, answered) {
  const btn = questionListEl.querySelector(`.q-item[data-index="${index}"]`);
  if (btn) btn.classList.toggle('answered', !!answered);
}

function goToQuestion(i) {
  currentQuestionIndex = i;
  displayQuestion();
}

// 上/下一題
prevBtn.addEventListener('click', () => {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    displayQuestion();
  }
});
nextBtn.addEventListener('click', () => {
  if (currentQuestionIndex < quizData.length - 1) {
    currentQuestionIndex++;
    displayQuestion();
  }
});

// ==========================
// 繳交（隨時）
// ==========================
submitBtn.addEventListener('click', trySubmit);
submitBtnMobile.addEventListener('click', trySubmit);

function trySubmit() {
  const unanswered = userAnswers.reduce((n,v)=> n + (v===undefined?1:0), 0);
  if (unanswered > 0) {
    const ok = confirm(`還有 ${unanswered} 題未作答，確定要繳交嗎？`);
    if (!ok) return;
  }
  showResults();
}

// ==========================
// 送成績
// ==========================
function buildServerAnswers() {
  return userAnswers.map((selIdx, qIdx) => ({
    q_index: qIdx, selected_index: selIdx
  }));
}

async function submitAttemptToSheet() {
  const payload = {
    account: currentUser?.account || 'unknown',
    quiz_id: currentQuizId || selectedQuizId || 'unknown',
    quiz_version: currentQuizVersion,
    answers: buildServerAnswers(),
    client_started_at: quizStartedAtISO || new Date().toISOString(),
    client_submitted_at: new Date().toISOString(),
    user_agent: navigator.userAgent
  };

  const statusEl = document.getElementById('submit-status');
  if (statusEl) statusEl.textContent = '正在上傳成績到老師的試算表...';

  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (data && data.ok) {
    if (statusEl) statusEl.textContent = `成績已送出（伺服端計分：${data.score}/${data.max_score}）`;
  } else {
    const msg = data && data.error ? data.error : `HTTP ${res.status}`;
    if (statusEl) statusEl.textContent = `成績上傳失敗：${msg}（稍後可再試）`;
  }
  return data;
}

// ==========================
// 結果
// ==========================
function showResults() {
  // 停掉計時器，避免在結果畫面還繼續跑
  clearTimer();

  quizContainer.classList.add('hidden');
  resultsContainer.classList.remove('hidden');

  let score = 0;
  wrongAnswersList.innerHTML = '';

  quizData.forEach((q, idx) => {
    const sel = userAnswers[idx];
    const correctIdx = q.options.findIndex(o => o === q.answer);
    const isCorrect = (sel === correctIdx);

    if (isCorrect) { score++; return; }

    const hasSideImage = q.question_image && q.question_type !== 'image';
    const qHTML = hasSideImage
      ? `
        <div class="q-row">
          <div class="q-text"><p><strong>題目：</strong>${q.question_content}</p></div>
          <div class="q-media"><img src="${q.question_image}" alt="題目圖片 ${idx+1}" /></div>
        </div>`
      : (q.question_type === 'image'
         ? `<img src="${q.question_content}" alt="題目圖片 ${idx+1}" style="width:80%;max-width:250px;margin:10px 0;border-radius:4px;">`
         : `<p><strong>題目：</strong>${q.question_content}</p>`);

    const yourA = (sel != null && q.options[sel] != null) ? q.options[sel] : '<em>（未作答）</em>';
    const corrA = (correctIdx != null && correctIdx >= 0) ? q.options[correctIdx] : (q.answer || '<em>（未設定正解）</em>');

    const li = document.createElement('li');
    li.innerHTML = `
      ${qHTML}
      <p><strong>你的答案：</strong><span style="color:#d33;">${yourA}</span></p>
      <p><strong>正確答案：</strong><span style="color:#28a745;">${corrA}</span></p>`;
    wrongAnswersList.appendChild(li);
  });

  const pct = (score / quizData.length) * 100;
  scoreEl.textContent = `你的分數：${pct.toFixed(1)} 分 (答對 ${score} / ${quizData.length} 題)`;

  submitAttemptToSheet().then(data => {
    if (data && data.ok) {
      const pctSrv = (data.score / data.max_score) * 100;
      scoreEl.textContent = `你的分數：${pctSrv.toFixed(1)} 分 (答對 ${data.score} / ${data.max_score} 題)`;
    }
  });

  renderAllMath(resultsContainer);
}

// 重新測驗 / 返回選單
restartBtn.addEventListener('click', () => {
  if (!selectedQuizFile) {
    resultsContainer.classList.add('hidden');
    pickerContainer.classList.remove('hidden');
    return;
  }
  startQuiz(selectedQuizFile);
});
backToPickerBtn.addEventListener('click', () => {
  resultsContainer.classList.add('hidden');
  quizContainer.classList.add('hidden');
  showQuizPicker(true);
});

// 初始渲染（若登入頁有公式）
window.addEventListener('DOMContentLoaded', () => {
  renderAllMath(document.body);
  const el = document.getElementById('build-version');
  if (el) el.textContent = `${window.BUILD_VERSION || 'dev'}`;
});

// ping 後端（暖機）
window.addEventListener('load', () => {
  fetch(WEBAPP_URL, { method: 'GET', cache: 'no-store' }).catch(() => {});
});