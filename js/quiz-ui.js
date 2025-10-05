import { state } from './state.js';
import { renderAllMath } from './katex.js';

export function renderSidebar() {
  const list = document.getElementById('question-list');
  list.innerHTML = '';
  state.quizData.forEach((_, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-item';
    btn.dataset.index = i;
    btn.textContent = `第 ${i+1} 題`;
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
  state.currentQuestionIndex = i;
  displayQuestion();
}

export function displayQuestion() {
  const q = state.quizData[state.currentQuestionIndex];
  const questionContent  = document.getElementById('question-content');
  const optionsContainer = document.getElementById('options-container');

  questionContent.innerHTML = '';
  optionsContainer.innerHTML = '';

  if (q.question_image && q.question_type !== 'image') {
    const row = document.createElement('div'); row.className='q-row';
    const text = document.createElement('div'); text.className='q-text';
    const h2 = document.createElement('h2'); h2.innerHTML = q.question_content; text.appendChild(h2);
    const media = document.createElement('div'); media.className='q-media';
    const img = document.createElement('img'); img.src = q.question_image; img.alt = `題目圖片 ${state.currentQuestionIndex+1}`;
    media.appendChild(img);
    row.appendChild(text); row.appendChild(media);
    questionContent.appendChild(row);
  } else if (q.question_type === 'image') {
    const img = document.createElement('img');
    img.src = q.question_content;
    img.alt = `題目圖片 ${state.currentQuestionIndex+1}`;
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
    if (state.userAnswers[state.currentQuestionIndex] === idx) div.classList.add('selected');
    div.addEventListener('click', () => selectOption(div, idx));
    optionsContainer.appendChild(div);
  });

  renderAllMath(questionContent);
  renderAllMath(optionsContainer);
  updateSidebarClasses();

  const nextBtn = document.getElementById('next-btn');
  nextBtn.textContent = (state.currentQuestionIndex === state.quizData.length - 1) ? '到最後了' : '下一題';
}

function selectOption(optionDiv, selectedIndex) {
  document.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
  optionDiv.classList.add('selected');
  state.userAnswers[state.currentQuestionIndex] = selectedIndex;
  updateSidebarClasses();
}