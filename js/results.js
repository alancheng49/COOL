import { state } from './state.js';
import { renderAllMath } from './katex.js';
import { submitAttempt } from './api.js';
import { clearTimer } from './timer.js';

function isChoice(q){ return (q?.question_type||'').toLowerCase()==='choice'; }
function isCloze(q){  return (q?.question_type||'').toLowerCase()==='cloze'; }

// === 送後端的格式：
// choice -> { q_index, selected_index }
// cloze  -> { q_index, selected_indices: [...] }
function buildServerAnswers() {
  return state.quizData.map((q, idx) => {
    if (isCloze(q)) {
      return { q_index: idx, selected_indices: Array.isArray(state.userAnswers[idx]) ? state.userAnswers[idx] : [] };
    } else {
      return { q_index: idx, selected_index: state.userAnswers[idx] };
    }
  });
}

export async function showResults() {
  clearTimer();

  const quizContainer    = document.getElementById('quiz-container');
  const resultsContainer = document.getElementById('results-container');
  const wrongList        = document.getElementById('wrong-answers-list');
  const scoreEl          = document.getElementById('score');

  quizContainer.classList.add('hidden');
  resultsContainer.classList.remove('hidden');
  resultsContainer.scrollTop = 0;

  let score = 0;
  wrongList.innerHTML = '';

  state.quizData.forEach((q, idx) => {
    if (isChoice(q)) {
      const sel = state.userAnswers[idx];
      const correctIdx = (q.options||[]).findIndex(o => o === q.answer);
      const ok = (sel === correctIdx);
      if (ok) { score++; return; }

      const stem = renderStemHTML(q, idx);
      const yourA = (sel != null && q.options?.[sel] != null) ? q.options[sel] : '<em>（未作答）</em>';
      const corrA = (correctIdx != null && correctIdx >= 0) ? q.options[correctIdx] : (q.answer || '<em>（未提供正解）</em>');

      const li = document.createElement('li');
      li.innerHTML = `${stem}
        <p><strong>你的答案：</strong><span style="color:#d33;">${yourA}</span></p>
        <p><strong>正確答案：</strong><span style="color:#28a745;">${corrA}</span></p>`;
      wrongList.appendChild(li);

    } else if (isCloze(q)) {
      const selArr = Array.isArray(state.userAnswers[idx]) ? state.userAnswers[idx] : [];
      const corrArr = Array.isArray(q.cloze_answer_indices) ? q.cloze_answer_indices : null;

      const allRight = (corrArr && corrArr.length === selArr.length && corrArr.every((v,i)=>v===selArr[i]));
      if (allRight) { score++; return; }

      const stem = renderStemHTML(q, idx);
      const your = formatClozePicks(q, selArr, '（未作答）');
      const corr = corrArr ? formatClozePicks(q, corrArr, '（未提供正解）') : '<em>（未提供正解）</em>';

      const li = document.createElement('li');
      li.innerHTML = `${stem}
        <p><strong>你的答案：</strong><span style="color:#d33;">${your}</span></p>
        <p><strong>正確答案：</strong><span style="color:#28a745;">${corr}</span></p>`;
      wrongList.appendChild(li);
    }
  });

  const pct = (score / state.quizData.length) * 100;
  scoreEl.textContent = `你的分數：${pct.toFixed(1)} 分 (答對 ${score} / ${state.quizData.length} 題)`;

  // 先讓瀏覽器完成一次 reflow，再渲染 LaTeX
  await new Promise(requestAnimationFrame);
  renderAllMath(resultsContainer);   // 👈 先渲染公式

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

function renderStemHTML(q, idx){
  const disp = (q.display_type || 'text').toLowerCase();
  const isCloze = (q?.question_type || '').toLowerCase() === 'cloze';
  const textStem = isCloze ? (q.cloze_template || q.question_content || '') 
                           : (q.question_content || '');

  // 純圖題（display_type = image）
  if (disp === 'image') {
    return `<img src="${q.question_content}" alt="題目圖片 ${idx+1}" style="width:80%;max-width:280px;margin:10px 0;border-radius:4px;">`;
  }

  // 文字 + 圖片（含 cloze 的 cloze_template）
  if (q.question_image) {
    return `
      <div class="q-row">
        <div class="q-text"><p><strong>題目：</strong>${textStem}</p></div>
        <div class="q-media"><img src="${q.question_image}" alt="題目圖片 ${idx+1}" /></div>
      </div>`;
  }

  // 純文字（cloze 用 cloze_template；choice 用 question_content）
  return `<p><strong>題目：</strong>${textStem}</p>`;
}

function formatClozePicks(q, idxArr, fallback){
  const sets = Array.isArray(q.cloze_options) ? q.cloze_options : [];

  // 1) 完全沒作答 → 顯示 fallback
  const hasAny = Array.isArray(idxArr) && idxArr.some(v => v !== undefined && v !== null);
  if (!hasAny) return `<em>${fallback}</em>`;

  // 2) 部分作答 → 已選的顯示 token，沒選的顯示 ∅
  const tokens = (idxArr || []).map((i, blankIdx) => {
    const set = sets[blankIdx] || [];
    return (i != null && set[i] != null) ? set[i] : '<span class="cloze-empty">∅</span>';
  });
  return tokens.join(', ');
}