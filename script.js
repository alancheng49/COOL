// === 設定：你的 Apps Script Web App URL ===
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyTnaCOBxIdYBvMgQl3lVmJ54iVhlKFY6k0l1LRQxOPRAXE-SSqv4chae2V21s_aiHt/exec';

// 交卷時間紀錄
let quizStartedAtISO = null;
// ==========================
//  KaTeX：安全渲染工具
// ==========================
const katexReady = new Promise((resolve) => {
  if (window.renderMathInElement) return resolve();

  window.addEventListener("DOMContentLoaded", () => {
    const auto = document.getElementById("katex-auto-render");
    if (auto) auto.addEventListener("load", () => resolve(), { once: true });
  });

  (function check() {
    if (window.renderMathInElement) return resolve();
    setTimeout(check, 50);
  })();
});

async function renderAllMath(root = document.body) {
  await katexReady;
  await new Promise(requestAnimationFrame);
  window.renderMathInElement(root, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
}

// ==========================
//  DOM 元素
// ==========================
const loginContainer   = document.getElementById('login-container');
const pickerContainer  = document.getElementById('picker-container');   // 新增：題庫選擇區
const quizContainer    = document.getElementById('quiz-container');
const resultsContainer = document.getElementById('results-container');

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('login-btn');
const loginError    = document.getElementById('login-error');

const quizSelect    = document.getElementById('quiz-select');           // 新增
const startQuizBtn  = document.getElementById('start-quiz-btn');        // 新增
const logoutBtn     = document.getElementById('logout-btn');            // 新增
const pickerError   = document.getElementById('picker-error');          // 新增

const questionContent   = document.getElementById('question-content');
const optionsContainer  = document.getElementById('options-container');
const nextBtn           = document.getElementById('next-btn');

const scoreEl           = document.getElementById('score');
const wrongAnswersList  = document.getElementById('wrong-answers-list');
const restartBtn        = document.getElementById('restart-btn');
const backToPickerBtn = document.getElementById('back-to-picker-btn'); // 新增


// ==========================
//  測驗狀態
// ==========================
let quizData = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let currentUser = null;

let selectedQuizId = null;     // 選單目前選到的 quiz id（如 'problem2'）
let selectedQuizFile = null;   // 選單目前選到的題庫檔
let currentQuizId = null;      // 這次「正在作答」的 quiz id
let currentQuizVersion = 1;    // 版本，先固定 1；之後要升版再調

// 登入忙碌與請求控制
let loginAbortController = null;
let loginBusy = false;
let suppressLoginError = false;
let loginSlowHintTimer = null;

function setLoginBusy(busy) {
  loginBusy = busy;

  // 首次記錄原始文字
  if (!loginBtn.dataset.idleText) {
    loginBtn.dataset.idleText = loginBtn.textContent || '登入';
  }

  // 文字 & ARIA
  loginBtn.textContent = busy ? '登入中…' : loginBtn.dataset.idleText;
  loginBtn.setAttribute('aria-busy', busy ? 'true' : 'false');

  // 關鍵：真的不可點
  loginBtn.disabled = busy;

  // 同步鎖定帳號/密碼輸入框，避免登入中被修改
  usernameInput.disabled = busy;
  passwordInput.disabled = busy;

  // 提供一個 class 給樣式用（可選）
  loginBtn.classList.toggle('is-busy', busy);
}

// ==========================
//  登入
// ==========================
loginBtn.addEventListener('click', async () => {
  if (loginBusy) return;

  suppressLoginError = false;                 // 取消先前登出時設的抑制
  if (loginSlowHintTimer) {                   // 清掉上一次殘留的提示計時器
    clearTimeout(loginSlowHintTimer);
    loginSlowHintTimer = null;
  }

  loginError.textContent = '';

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    loginError.textContent = '請輸入帳號與密碼';
    return;
  }

  setLoginBusy(true);
  try { loginAbortController?.abort(); } catch (_) {}
  loginAbortController = new AbortController();

  // 慢速提示（建議 >= 1200ms 比較不突兀）
  loginSlowHintTimer = setTimeout(() => {
    if (!loginError.textContent) {
      loginError.textContent = '正在連線伺服器（第一次可能較慢）…';
    }
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
      // 這次我們已在開頭把 suppressLoginError 重置為 false，
      // 所以會正常顯示「登入失敗」而不是卡在「正在連線伺服器」
      loginError.textContent = `登入失敗：${data && data.error ? data.error : '未知錯誤'}`;
      return;
    }

    currentUser = {
      account: data.account,
      display_name: data.display_name,
      role: data.role,
      quizzes: data.quizzes || []
    };
    selectedQuizId = null;
    selectedQuizFile = null;
    currentQuizId = null;
    currentQuizVersion = 1;

    loginContainer.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    quizContainer.classList.add('hidden');
    showQuizPicker();

  } catch (err) {
    if (err && err.name === 'AbortError') {
      // 登出中止，不顯示多餘訊息
    } else {
      loginError.textContent = '登入服務暫時無法使用，請稍後再試';
      console.error(err);
    }
  } finally {
    clearTimeout(loginSlowHintTimer);
    loginSlowHintTimer = null;
    setLoginBusy(false);
    loginAbortController = null;
    // 不必在這裡再改 suppressLoginError，交給下次點登入時重置即可
  }
});

// ==========================
//  顯示題庫選擇
// ==========================
function showQuizPicker(forceShow = false) {
  quizSelect.innerHTML = '';
  pickerError.textContent = '';

  const quizzes = currentUser?.quizzes ?? [];
  if (quizzes.length === 0) {
    pickerError.textContent = '此帳號尚未配置題庫，請聯絡老師或管理員。';
    pickerContainer.classList.remove('hidden');
    return;
  }

  // 產生選項（value = id, data-file = 檔名）
  quizzes.forEach((q, idx) => {
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.dataset.file = q.file;
    opt.textContent = `${q.id} ─ ${q.name}`;
    if (idx === 0) opt.selected = true;
    quizSelect.appendChild(opt);
  });

  if (quizzes.length === 1 && !forceShow) {
    // 自動開考：把 id / file 都設好，並鎖定 currentQuizId
    selectedQuizId   = quizzes[0].id;
    selectedQuizFile = quizzes[0].file;
    currentQuizId    = selectedQuizId;
    currentQuizVersion = quizzes[0].version || 1;
    pickerContainer.classList.add('hidden');
    startQuiz(selectedQuizFile);
  } else {
    // 顯示選單：從目前選項讀出 id 與 file
    selectedQuizId   = quizSelect.value;
    selectedQuizFile = quizSelect.selectedOptions[0].dataset.file;
    pickerContainer.classList.remove('hidden');
  }
}

// 監聽選單變更
quizSelect.addEventListener('change', () => {
  selectedQuizId   = quizSelect.value;
  selectedQuizFile = quizSelect.selectedOptions[0].dataset.file;
});

// 點「開始測驗」
startQuizBtn.addEventListener('click', () => {
  if (!selectedQuizFile || !selectedQuizId) {
    pickerError.textContent = '請先選擇題庫！';
    return;
  }
  currentQuizId = selectedQuizId;   // ← 關鍵：鎖定這次作答要上傳的 quiz_id

  const picked = currentUser?.quizzes?.find(q => q.id === selectedQuizId);
  if (picked && picked.version) currentQuizVersion = picked.version;

  pickerContainer.classList.add('hidden');
  startQuiz(selectedQuizFile);
});

// 登出：回到登入畫面
logoutBtn.addEventListener('click', () => {
  suppressLoginError = true;
  try { loginAbortController?.abort(); } catch (_) {}

  // 清掉「正在連線伺服器…」的計時器
  if (loginSlowHintTimer) {
    clearTimeout(loginSlowHintTimer);
    loginSlowHintTimer = null;
  }

  // 復原按鈕 & 清除紅字
  setLoginBusy(false);
  loginError.textContent = '';

  currentUser = null;
  selectedQuizFile = null;
  selectedQuizId = null;
  currentQuizId = null;
  currentQuizVersion = 1;
  usernameInput.value = '';
  passwordInput.value = '';

  pickerContainer.classList.add('hidden');
  quizContainer.classList.add('hidden');
  resultsContainer.classList.add('hidden');
  loginContainer.classList.remove('hidden');
});

// ==========================
//  開始測驗（接受檔名）
// ==========================
async function startQuiz(quizFile) {
  if (!currentUser) {
    alert("請先登入！");
    return;
  }
  if (!quizFile) {
    alert("請先選擇題庫！");
    return;
  }

  try {
    const url = `${quizFile}?v=${window.BUILD_VERSION || Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`無法讀取題庫檔案：${quizFile}`);

    quizData = await response.json();
    quizStartedAtISO = new Date().toISOString();
    currentQuestionIndex = 0;
    userAnswers = [];

    resultsContainer.classList.add('hidden');
    quizContainer.classList.remove('hidden');

    displayQuestion();
  } catch (err) {
    alert(err.message);
    // 若失敗，回到選擇畫面
    quizContainer.classList.add('hidden');
    pickerContainer.classList.remove('hidden');
  }
}

// ==========================
//  顯示題目
// ==========================
function displayQuestion() {
  questionContent.innerHTML = '';
  optionsContainer.innerHTML = '';

  const currentQuestion = quizData[currentQuestionIndex];
  
if (currentQuestion.question_image && currentQuestion.question_type !== 'image') {
  // 文字 + 圖片（70/30）
  const row = document.createElement('div');
  row.className = 'q-row';

  const text = document.createElement('div');
  text.className = 'q-text';
  const h2 = document.createElement('h2');
  h2.innerHTML = currentQuestion.question_content;
  text.appendChild(h2);

  const media = document.createElement('div');
  media.className = 'q-media';
  const img = document.createElement('img');
  img.src = currentQuestion.question_image;
  img.alt = `題目圖片 ${currentQuestionIndex + 1}`;
  media.appendChild(img);

  row.appendChild(text);
  row.appendChild(media);
  questionContent.appendChild(row);
} else if (currentQuestion.question_type === 'image') {
  // 純圖片題（維持原本）
  const img = document.createElement('img');
  img.src = currentQuestion.question_content;
  img.alt = `題目圖片 ${currentQuestionIndex + 1}`;
  questionContent.appendChild(img);
} else {
  // 純文字題（維持原本）
  const title = document.createElement('h2');
  title.innerHTML = currentQuestion.question_content;
  questionContent.appendChild(title);
}

  currentQuestion.options.forEach((option, idx) => {
    const optionDiv = document.createElement('div');
    optionDiv.innerHTML = option;
    optionDiv.classList.add('option');
    optionDiv.addEventListener('click', () => selectOption(optionDiv, idx)); // ← 傳索引
    optionsContainer.appendChild(optionDiv);
  });

  renderAllMath(questionContent);
  renderAllMath(optionsContainer);

  nextBtn.textContent = (currentQuestionIndex === quizData.length - 1) ? '繳交' : '下一題';
}

// ==========================
//  選擇選項
// ==========================
function selectOption(optionDiv, selectedIndex) {
  document.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
  optionDiv.classList.add('selected');
  userAnswers[currentQuestionIndex] = selectedIndex; // ← 存索引（0,1,2,3）
}

// ==========================
//  下一題 / 繳交
// ==========================
nextBtn.addEventListener('click', () => {
  if (userAnswers[currentQuestionIndex] === undefined) {
    alert('請選擇一個答案！');
    return;
  }
  if (currentQuestionIndex < quizData.length - 1) {
    currentQuestionIndex++;
    displayQuestion();
  } else {
    showResults();
  }
});

function buildServerAnswers() {
  // 把使用者的作答索引轉成 [{q_index, selected_index}, ...]
  return userAnswers.map((selIdx, qIdx) => ({
    q_index: qIdx,
    selected_index: selIdx
  }));
}

async function submitAttemptToSheet() {
  const payload = {
    account: currentUser?.account || 'unknown',
    quiz_id: currentQuizId || selectedQuizId || 'unknown',
    quiz_version: currentQuizVersion,
    answers: buildServerAnswers(),      // [{q_index, selected_index}]
    client_started_at: quizStartedAtISO || new Date().toISOString(),
    client_submitted_at: new Date().toISOString(),
    user_agent: navigator.userAgent
  };

  // 顯示上傳中
  const statusEl = document.getElementById('submit-status');
  if (statusEl) statusEl.textContent = '正在上傳成績到老師的試算表...';

  console.log('Submitting payload:', {
  quiz_id: currentQuizId, version: currentQuizVersion, file: selectedQuizFile, answers: buildServerAnswers()
  });

  // 送到 Apps Script（瀏覽器會自動處理 302 轉址，無需特別處理）
  const res = await fetch(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // 簡單請求，避免 CORS 預檢
    body: JSON.stringify(payload)
  });

  // 嘗試讀回應（若部署允許匿名 JSON 回應）
  let data = null;
  try { data = await res.json(); } catch (e) { /* 某些設定可能回不了 JSON */ }

  if (data && data.ok) {
    if (statusEl) statusEl.textContent = `成績已送出（伺服端計分：${data.score}/${data.max_score}）`;
  } else {
    // 失敗時至少提示一下（必要時可加 localStorage 佇列重送）
    const msg = data && data.error ? data.error : `HTTP ${res.status}`;
    if (statusEl) statusEl.textContent = `成績上傳失敗：${msg}（稍後可再試）`;
  }
  return data;
}

// ==========================
//  顯示結果
// ==========================
function showResults() {
  quizContainer.classList.add('hidden');
  resultsContainer.classList.remove('hidden');

  let score = 0;
  wrongAnswersList.innerHTML = '';

  quizData.forEach((question, index) => {
    const selectedIdx = userAnswers[index];                         // 我們存的是索引
    const correctIdx  = question.options.findIndex(opt => opt === question.answer); // 從題庫找正解的索引
    const isCorrect   = (selectedIdx === correctIdx);

    if (isCorrect) {
      score++;
      return; // 答對就不列在錯題表
    }

    // 題目呈現：文字題或圖片題
    const hasSideImage = question.question_image && question.question_type !== 'image';

    const questionDisplayHTML = hasSideImage
        ? `
    <div class="q-row">
      <div class="q-text">
        <p><strong>題目：</strong>${question.question_content}</p>
      </div>
      <div class="q-media">
        <img src="${question.question_image}" alt="題目圖片 ${index + 1}" />
      </div>
    </div>
  `
  : (question.question_type === 'image'
      ? `<img src="${question.question_content}" alt="題目圖片 ${index + 1}" style="width:80%;max-width:250px;margin:10px 0;border-radius:4px;">`
      : `<p><strong>題目：</strong>${question.question_content}</p>`
    );

    // 把索引轉回實際的選項 HTML（含 KaTeX）
    const yourAnswerHTML   = (selectedIdx != null && question.options[selectedIdx] != null)
      ? question.options[selectedIdx]
      : '<em>（未作答）</em>';

    const correctAnswerHTML = (correctIdx != null && correctIdx >= 0)
      ? question.options[correctIdx]   // 用選項內容顯示，比直接印 answer 字串更一致
      : (question.answer || '<em>（未設定正解）</em>');

    const li = document.createElement('li');
    li.innerHTML = `
      ${questionDisplayHTML}
      <p><strong>你的答案：</strong><span style="color: red;">${yourAnswerHTML}</span></p>
      <p><strong>正確答案：</strong><span style="color: green;">${correctAnswerHTML}</span></p>
    `;
    wrongAnswersList.appendChild(li);
  });

  const finalScore = (score / quizData.length) * 100;
  scoreEl.textContent = `你的分數：${finalScore.toFixed(1)} 分 (答對 ${score} / ${quizData.length} 題)`;

  submitAttemptToSheet().then(data => {
  if (data && data.ok) {
    const pct = (data.score / data.max_score) * 100;
    scoreEl.textContent = `你的分數：${pct.toFixed(1)} 分 (答對 ${data.score} / ${data.max_score} 題)`;
  }
  });

  renderAllMath(resultsContainer); // 讓錯題中的 KaTeX 也被渲染
}

// ==========================
//  重新測驗（同一題庫）
// ==========================
restartBtn.addEventListener('click', () => {
  if (!selectedQuizFile) {
    // 理論上不會發生；保底回選擇頁
    resultsContainer.classList.add('hidden');
    pickerContainer.classList.remove('hidden');
    return;
  }
  startQuiz(selectedQuizFile);
});

// 返回選單
backToPickerBtn.addEventListener('click', () => {
  // 隱藏結果與測驗頁
  resultsContainer.classList.add('hidden');
  quizContainer.classList.add('hidden');

  // 回到選單（強制顯示，即使只有一個題庫也不要自動開始）
  showQuizPicker(true);
});

// 首頁載入時渲染（若登入頁有公式）
window.addEventListener('DOMContentLoaded', () => {
  renderAllMath(document.body);
});

// 放在你的 script.js 最後（DOMContentLoaded 附近也可）
window.addEventListener('load', () => {
  fetch(WEBAPP_URL, { method: 'GET', cache: 'no-store' }).catch(() => {});
});

window.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('build-version');
  if (el) el.textContent = `${window.BUILD_VERSION || 'dev'}`;
});