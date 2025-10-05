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
//  使用者資料庫（改為多題庫）
// ==========================
const usersDatabase = [
  {
    account: "test",
    password: "test",
    quizzes: [
      { id: "problem1", name: "Problem 1（經典）", file: "questions_a.json" },
      { id: "problem2", name: "Problem 2（進階）", file: "questions_b.json" }
    ]
  },
  {
    account: "studentB",
    password: "pass456",
    quizzes: [
      { id: "problem1", name: "Problem 1", file: "questions_b.json" } // 自行調整
    ]
  },
  {
    account: "test1",
    password: "test1",
    quizzes: [
      { id: "problem1", name: "Problem 1", file: "questions_a.json" }
    ]
  }
];

// ==========================
//  測驗狀態
// ==========================
let quizData = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let currentUser = null;
let selectedQuizFile = null; // 新增：目前選擇的題庫檔案路徑

// ==========================
//  登入
// ==========================
loginBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  const foundUser = usersDatabase.find(
    (u) => u.account === username && u.password === password
  );

  if (!foundUser) {
    currentUser = null;
    loginError.textContent = '帳號或密碼錯誤！';
    return;
  }

  currentUser = foundUser;
  selectedQuizFile = null; // 重置
  loginError.textContent = '';

  // 顯示「題庫選擇」
  loginContainer.classList.add('hidden');
  resultsContainer.classList.add('hidden');
  quizContainer.classList.add('hidden');

  showQuizPicker();
});

// ==========================
//  顯示題庫選擇
// ==========================
function showQuizPicker(forceShow = false) {
  // 清空選單
  quizSelect.innerHTML = '';
  pickerError.textContent = '';

  const quizzes = currentUser?.quizzes ?? [];

  if (quizzes.length === 0) {
    pickerError.textContent = '此帳號尚未配置題庫，請聯絡老師或管理員。';
    pickerContainer.classList.remove('hidden');
    return;
  }

  // 產生選項
  quizzes.forEach((q, idx) => {
    const opt = document.createElement('option');
    opt.value = q.file;       // 直接存路徑
    opt.textContent = `${q.id} ─ ${q.name}`;
    if (idx === 0) opt.selected = true;
    quizSelect.appendChild(opt);
  });

  // 若只有一套題庫，直接進入測驗
  if (quizzes.length === 1 && !forceShow) {
    selectedQuizFile = quizzes[0].file;
    pickerContainer.classList.add('hidden');
    startQuiz(selectedQuizFile);
  } else {
    selectedQuizFile = quizSelect.value;
    pickerContainer.classList.remove('hidden');
  }
}

// 監聽選單變更
quizSelect.addEventListener('change', () => {
  selectedQuizFile = quizSelect.value;
});

// 點「開始測驗」
startQuizBtn.addEventListener('click', () => {
  if (!selectedQuizFile) {
    pickerError.textContent = '請先選擇題庫！';
    return;
  }
  pickerContainer.classList.add('hidden');
  startQuiz(selectedQuizFile);
});

// 登出：回到登入畫面
logoutBtn.addEventListener('click', () => {
  currentUser = null;
  selectedQuizFile = null;
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
    const response = await fetch(quizFile);
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

  if (currentQuestion.question_type === 'image') {
    const img = document.createElement('img');
    img.src = currentQuestion.question_content;
    img.alt = `題目圖片 ${currentQuestionIndex + 1}`;
    questionContent.appendChild(img);
  } else {
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

function getSelectedQuizId() {
  // 你之前在 showQuizPicker 裡用 quizzes 的 {id, name, file}
  // 這裡從檔名反查 quiz_id（找不到就給個 'unknown'）
  const match = currentUser?.quizzes?.find(q => q.file === selectedQuizFile);
  return match ? match.id : 'unknown';
}

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
    quiz_id: getSelectedQuizId(),       // 例如 'problem1'
    quiz_version: 1,                    // 與 answer_keys 版本一致
    answers: buildServerAnswers(),      // [{q_index, selected_index}]
    client_started_at: quizStartedAtISO || new Date().toISOString(),
    client_submitted_at: new Date().toISOString(),
    user_agent: navigator.userAgent
  };

  // 顯示上傳中
  const statusEl = document.getElementById('submit-status');
  if (statusEl) statusEl.textContent = '正在上傳成績到老師的試算表...';

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
    const questionDisplayHTML =
      question.question_type === 'image'
        ? `<img src="${question.question_content}" alt="題目圖片 ${index + 1}" style="width:80%;max-width:250px;margin:10px 0;border-radius:4px;">`
        : `<p><strong>題目：</strong>${question.question_content}</p>`;

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