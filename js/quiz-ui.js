// js/quiz-ui.js
import { state } from './state.js';
import { renderAllMath } from './katex.js';

export function renderSidebar() {
  const list = document.getElementById('question-list');
  list.innerHTML = '';

  const data = state.quizData || [];
  data.forEach((_, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-item';
    btn.dataset.index = i;
    btn.textContent = `第 ${i + 1} 題`;
    if (state.userAnswers[i] !== undefined) btn.classList.add('answered');
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
    btn.classList.toggle('answered', state.userAnswers[i] !== undefined);
  });
}

export function goToQuestion(i) {
  if (!Array.isArray(state.quizData)) return;
  if (i < 0 || i >= state.quizData.length) return;
  state.currentQuestionIndex = i;
  displayQuestion();
}

export function displayQuestion() {
  const qc = document.getElementById('question-content');
  const oc = document.getElementById('options-container');

  qc.innerHTML = '';
  oc.innerHTML = '';

  const data = state.quizData || [];
  const idx  = state.currentQuestionIndex ?? 0;

  // 防呆：題庫未載入或為空
  if (!Array.isArray(data) || data.length === 0) {
    qc.innerHTML = `<p class="error-message">題庫尚未載入或為空，請返回題庫選擇。</p>`;
    return;
  }
  // 防呆：題號越界
  if (idx < 0 || idx >= data.length) {
    qc.innerHTML = `<p class="error-message">題號超出範圍（目前 ${idx + 1} / 共 ${data.length} 題）。</p>`;
    return;
  }

  const q = data[idx];
  // ---- 題幹渲染（文字｜圖文｜純圖） ----
  if (q?.question_image && q?.question_type !== 'image') {
    const row = document.createElement('div'); row.className='q-row';
    const text = document.createElement('div'); text.className='q-text';
    const h2 = document.createElement('h2'); h2.innerHTML = q.question_content; text.appendChild(h2);
    const media = document.createElement('div'); media.className='q-media';
    const img = document.createElement('img'); img.src = q.question_image; img.alt = `題目圖片 ${idx+1}`;
    media.appendChild(img);
    row.appendChild(text); row.appendChild(media);
    qc.appendChild(row);
  } else if (q?.question_type === 'image') {
    const img = document.createElement('img');
    img.src = q.question_content;
    img.alt = `題目圖片 ${idx + 1}`;
    qc.appendChild(img);
  } else {
    const title = document.createElement('h2');
    title.innerHTML = q?.question_content ?? '(無題目內容)';
    qc.appendChild(title);
  }

  // ---- 選項渲染 ----
  (q?.options || []).forEach((opt, optIdx) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.innerHTML = opt;
    if (state.userAnswers[idx] === optIdx) div.classList.add('selected');
    div.addEventListener('click', () => selectOption(div, optIdx));
    oc.appendChild(div);
  });

  renderAllMath(qc);
  renderAllMath(oc);
  updateSidebarClasses();

  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) nextBtn.textContent = (idx === data.length - 1) ? '到最後了' : '下一題';
}

function selectOption(optionDiv, selectedIndex) {
  document.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
  optionDiv.classList.add('selected');
  state.userAnswers[state.currentQuestionIndex] = selectedIndex;
  updateSidebarClasses();
}