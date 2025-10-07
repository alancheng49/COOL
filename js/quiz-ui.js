// js/quiz-ui.js
import { state } from './state.js';
import { renderAllMath } from './katex.js';
import { BUILD_VERSION } from './config.js';

function isChoice(q){ return (q?.question_type||'').toLowerCase()==='choice'; }
function isCloze(q){  return (q?.question_type||'').toLowerCase()==='cloze'; }
function disp(q){     return (q?.display_type||'text').toLowerCase(); }


// function assetUrl(src) {
//   if (!src) return '';
//   // 已是絕對網址或以 / 開頭就直接用（再加 cache-bust）
//   if (/^https?:\/\//.test(src) || src.startsWith('/')) {
//     return `${src}${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD_VERSION)}`;
//   }
//   // 取出目前這份題庫 JSON 的資料夾當作基準
//   const base = (state.selectedQuizFile || '').replace(/\/[^/]*$/, '/'); // e.g. "questions/"
//   const full = base + src; // e.g. "questions/" + "questions_a/IMG_0426.JPG"
//   return `${full}?v=${encodeURIComponent(BUILD_VERSION)}`;
// }

// 題目清單（側欄）
export function renderSidebar() {
  const list = document.getElementById('question-list');
  list.innerHTML = '';
  (state.quizData||[]).forEach((_, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-item';
    btn.dataset.index = i;
    btn.textContent = `第 ${i + 1} 題`;
    if (answered(i)) btn.classList.add('answered');
    if (i === state.currentQuestionIndex) btn.classList.add('current');
    btn.addEventListener('click', () => goToQuestion(i));
    li.appendChild(btn);
    list.appendChild(li);
  });
}
export function updateSidebarClasses() {
  const buttons = document.querySelectorAll('#question-list .q-item');
  buttons.forEach(btn => {
    const i = Number(btn.dataset.index);
    btn.classList.toggle('current', i === state.currentQuestionIndex);
    btn.classList.toggle('answered', answered(i));
  });
}
function answered(i){
  const ans = state.userAnswers[i];
  if (Array.isArray(ans)) return ans.every(v => v !== undefined);
  return ans !== undefined;
}
export function goToQuestion(i) {
  if (!Array.isArray(state.quizData)) return;
  if (i < 0 || i >= state.quizData.length) return;
  state.currentQuestionIndex = i;
  displayQuestion();
}

// 主畫面：題幹 + 作答區
export function displayQuestion() {
  const qc = document.getElementById('question-content');
  const oc = document.getElementById('options-container');
  qc.innerHTML = ''; oc.innerHTML = '';

  const data = state.quizData || [];
  const idx  = state.currentQuestionIndex ?? 0;
  if (!Array.isArray(data) || data.length===0) { qc.innerHTML = `<p class="error-message">題庫為空</p>`; return; }
  if (idx<0 || idx>=data.length){ qc.innerHTML = `<p class="error-message">題號越界</p>`; return; }

  const q = data[idx];

  // 題幹（依 display_type）
  if (disp(q)==='image') {
    const img = document.createElement('img');
    img.src = q.question_content;
    img.alt = `題目圖片 ${idx+1}`;
    qc.appendChild(img);
  } else if (q.question_image) {
    const row = document.createElement('div'); row.className='q-row';
    const text = document.createElement('div'); text.className='q-text';
    const h2 = document.createElement('h2'); h2.innerHTML = q.question_content || '(無題目內容)';
    text.appendChild(h2);
    const media = document.createElement('div'); media.className='q-media';
    const img = document.createElement('img'); img.src = q.question_image; img.alt = `題目圖片 ${idx+1}`;
    media.appendChild(img);
    row.appendChild(text); row.appendChild(media);
    qc.appendChild(row);
  } else {
    const title = document.createElement('h2');
    title.innerHTML = q.question_content || '(無題目內容)';
    qc.appendChild(title);
  }

  // 作答區（依 question_type）
  if (isChoice(q)) renderChoice(oc, q, idx);
  else if (isCloze(q)) renderCloze(oc, q, idx);
  else {
    oc.innerHTML = `<p class="error-message">未知題型：${q?.question_type}</p>`;
  }

  renderAllMath(qc);
  renderAllMath(oc);
  updateSidebarClasses();

  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) nextBtn.textContent = (idx === data.length - 1) ? '到最後了' : '下一題';
}

// --- 單選 ---
function renderChoice(oc, q, idx){
  (q?.options||[]).forEach((opt, k) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.innerHTML = opt;
    if (state.userAnswers[idx] === k) div.classList.add('selected');
    div.addEventListener('click', () => {
      document.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      state.userAnswers[idx] = k;
      updateSidebarClasses();
    });
    oc.appendChild(div);
  });
}

// --- Cloze 多欄位 ---
function renderCloze(oc, q, idx){
  // 題幹的模板也顯示在作答區頂部，方便對照
  if (q.cloze_template){
    const p = document.createElement('p');
    p.style.margin = '6px 0 12px';
    p.innerHTML = q.cloze_template;
    oc.appendChild(p);
  }
  const opts = Array.isArray(q.cloze_options) ? q.cloze_options : [];
  if (!Array.isArray(state.userAnswers[idx])) {
    state.userAnswers[idx] = new Array(opts.length).fill(undefined);
  }

  opts.forEach((choices, blankIdx) => {
    const wrap = document.createElement('div');
    wrap.className = 'cloze-blank';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `(${blankIdx+1}):`;
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.className = 'cloze-options';

    choices.forEach((token, tokenIdx) => {
      const b = document.createElement('div');
      b.className = 'cloze-option';
      b.innerHTML = token;
      if (state.userAnswers[idx][blankIdx] === tokenIdx) b.classList.add('selected');
      b.addEventListener('click', () => {
        // 同一格只能選一個
        row.querySelectorAll('.cloze-option').forEach(el => el.classList.remove('selected'));
        b.classList.add('selected');
        state.userAnswers[idx][blankIdx] = tokenIdx;
        updateSidebarClasses();
      });
      row.appendChild(b);
    });

    wrap.appendChild(row);
    oc.appendChild(wrap);
  });
}