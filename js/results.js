import { state } from './state.js';
import { renderAllMath } from './katex.js';
import { submitAttempt } from './api.js';
import { clearTimer } from './timer.js';

function buildServerAnswers() {
  return state.userAnswers.map((selIdx, qIdx) => ({
    q_index: qIdx, selected_index: selIdx
  }));
}

export async function showResults() {
  clearTimer();

  const quizContainer    = document.getElementById('quiz-container');
  const resultsContainer = document.getElementById('results-container');
  const wrongList        = document.getElementById('wrong-answers-list');
  const scoreEl          = document.getElementById('score');

  quizContainer.classList.add('hidden');
  resultsContainer.classList.remove('hidden');

  let score = 0;
  wrongList.innerHTML = '';

  state.quizData.forEach((q, idx) => {
    const sel = state.userAnswers[idx];
    const correctIdx = q.options.findIndex(o => o === q.answer);
    const isCorrect = (sel === correctIdx);
    if (isCorrect) { score++; return; }

    const hasSideImage = q.question_image && q.question_type !== 'image';
    const qHTML = hasSideImage
      ? `<div class="q-row"><div class="q-text"><p><strong>題目：</strong>${q.question_content}</p></div><div class="q-media"><img src="${q.question_image}" /></div></div>`
      : (q.question_type === 'image'
          ? `<img src="${q.question_content}" style="width:80%;max-width:250px;margin:10px 0;border-radius:4px;">`
          : `<p><strong>題目：</strong>${q.question_content}</p>`);

    const yourA = (sel != null && q.options[sel] != null) ? q.options[sel] : '<em>（未作答）</em>';
    const corrA = (correctIdx != null && correctIdx >= 0) ? q.options[correctIdx] : (q.answer || '<em>（未設定正解）</em>');

    const li = document.createElement('li');
    li.innerHTML = `${qHTML}
      <p><strong>你的答案：</strong><span style="color:#d33;">${yourA}</span></p>
      <p><strong>正確答案：</strong><span style="color:#28a745;">${corrA}</span></p>`;
    wrongList.appendChild(li);
  });

  const pct = (score / state.quizData.length) * 100;
  scoreEl.textContent = `你的分數：${pct.toFixed(1)} 分 (答對 ${score} / ${state.quizData.length} 題)`;

  // 上傳
  const payload = {
    account: state.user?.account || 'unknown',
    quiz_id: state.currentQuizId || state.selectedQuizId || 'unknown',
    quiz_version: state.currentQuizVersion,
    answers: buildServerAnswers(),
    client_started_at: state.quizStartedAtISO || new Date().toISOString(),
    client_submitted_at: new Date().toISOString(),
    user_agent: navigator.userAgent
  };

  const statusEl = document.getElementById('submit-status');
  if (statusEl) statusEl.textContent = '正在上傳成績到老師的試算表...';

  const data = await submitAttempt(payload);

  if (data && data.ok) {
    if (statusEl) statusEl.textContent = `成績已送出（伺服端計分：${data.score}/${data.max_score}）`;
    const pctSrv = (data.score / data.max_score) * 100;
    scoreEl.textContent = `你的分數：${pctSrv.toFixed(1)} 分 (答對 ${data.score} / ${data.max_score} 題)`;
  } else {
    const msg = data && data.error ? data.error : '上傳失敗';
    if (statusEl) statusEl.textContent = `成績上傳失敗：${msg}（稍後可再試）`;
  }

  renderAllMath(resultsContainer);
}