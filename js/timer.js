import { state } from './state.js';
import { renderAllMath } from './katex.js';

export function clearTimer() {
  const t = document.getElementById('quiz-timer');
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
  state.deadlineAtMs = null;
  state.autoSubmitted = false;
  if (t){ t.textContent=''; t.classList.remove('danger'); t.style.display='none'; }
}

export function disableInteractions() {
  ['next-btn','prev-btn','submit-btn','submit-btn-mobile']
    .map(id => document.getElementById(id))
    .filter(Boolean)
    .forEach(btn => btn.disabled = true);
  document.querySelectorAll('.option').forEach(el => el.style.pointerEvents = 'none');
}

export function startTimer(seconds, onTimeout) {
  const t = document.getElementById('quiz-timer');
  if (!t || !seconds || seconds <= 0) { clearTimer(); return; }

  state.timeLimitSec = seconds;
  state.deadlineAtMs = new Date(state.quizStartedAtISO).getTime() + seconds*1000;
  state.autoSubmitted = false;
  t.style.display = 'inline-flex';

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const tick = () => {
    const remain = Math.max(0, Math.ceil((state.deadlineAtMs - Date.now())/1000));
    t.textContent = fmt(remain);
    if (remain <= 30) t.classList.add('danger');
    if (remain <= 0 && !state.autoSubmitted) {
      state.autoSubmitted = true;
      clearInterval(state.timerId);
      disableInteractions();
      onTimeout && onTimeout();
    }
  };

  tick();
  state.timerId = setInterval(tick, 250);
}