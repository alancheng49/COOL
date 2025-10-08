// js/history.page.js
import { requireLogin } from './state.js';
import { fetchHistoryList, fetchAttemptDetail } from './api.js';
import { renderAllMath } from './katex.js';

// ==== 小工具 ====
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pctStr(score, max) {
  if (!max) return '0%';
  return `${Math.round((score * 1000) / max) / 10}%`;
}

// 與 results.js 一致的題幹渲染
function renderStemHTML(q, idx){
  const disp = (q?.display_type || 'text').toLowerCase();
  const isCloze = (q?.question_type || '').toLowerCase() === 'cloze';
  const textStem = isCloze ? (q?.cloze_template || q?.question_content || '')
                           : (q?.question_content || '');

  if (disp === 'image') {
    return `<img src="${q.question_content}" alt="題目圖片 ${idx+1}" style="width:80%;max-width:280px;margin:10px 0;border-radius:4px;">`;
  }
  if (q?.question_image) {
    return `
      <div class="q-row">
        <div class="q-text"><p><strong>題目：</strong>${textStem}</p></div>
        <div class="q-media"><img src="${q.question_image}" alt="題目圖片 ${idx+1}" /></div>
      </div>`;
  }
  return `<p><strong>題目：</strong>${textStem}</p>`;
}

// 與 results.js 一致的 cloze 文字轉換
function formatClozePicks(q, idxArr, fallback){
  const sets = Array.isArray(q?.cloze_options) ? q.cloze_options : [];
  const hasAny = Array.isArray(idxArr) && idxArr.some(v => v !== undefined && v !== null);
  if (!hasAny) return `<em>${fallback}</em>`;

  const tokens = (idxArr || []).map((i, blankIdx) => {
    const set = sets[blankIdx] || [];
    return (i != null && set[i] != null) ? set[i] : '<span class="cloze-empty">∅</span>';
  });
  return tokens.join(', ');
}

// ===== 清單（左欄）渲染 =====
// 需求：best 的卡片視覺與 all 完全一致（時間 | 分數 | 重看）
function renderList(el, items, mode) {
  if (!items?.length) { el.innerHTML = '<p style="color:#666;margin:12px 0;">沒有紀錄。</p>'; return; }

  const rows = items.map(it => {
    const title = it.title || it.quiz_id || '(未命名)';
    if (mode === 'best') {
      const when  = it.server_updated_at || it.client_submitted_at || it.submitted_at || it.best_client_submitted_at || '';
      const score = `${it.best_score}/${it.best_max}（${pctStr(it.best_score, it.best_max)}）`;
      const ver   = typeof it.quiz_version !== 'undefined' ? ` v${it.quiz_version}` : '';
      return `
      <div class="card hist-row" data-attempt="${it.attempt_id}" tabindex="0">
        <div><strong>${title}</strong><small>${ver}</small></div>
        <div class="row gap8" style="margin-top:4px;color:#666;">
          <div>${fmtTime(when)}</div>
          <div class="spacer"></div>
          <div>${score}</div>
          <button class="secondary">重看</button>
        </div>
      </div>`;
    } else {
      const when  = it.client_submitted_at || it.client_started_at || '';
      const score = `${it.score}/${it.max_score}（${pctStr(it.score, it.max_score)}）`;
      const ver   = typeof it.quiz_version !== 'undefined' ? ` v${it.quiz_version}` : '';
      return `
      <div class="card hist-row" data-attempt="${it.attempt_id}" tabindex="0">
        <div><strong>${title}</strong><small>${ver}</small></div>
        <div class="row gap8" style="margin-top:4px;color:#666;">
          <div>${fmtTime(when)}</div>
          <div class="spacer"></div>
          <div>${score}</div>
          <button class="secondary">重看</button>
        </div>
      </div>`;
    }
  });

  el.innerHTML = rows.join('');
  // 讓整卡可點
  el.querySelectorAll('.hist-row').forEach(r => {
    r.addEventListener('click', () => openDetail(r.dataset.attempt));
    r.addEventListener('keypress', (e)=>{ if(e.key==='Enter'||e.key===' ') openDetail(r.dataset.attempt); });
  });
}

// ===== 詳細（右欄） =====
async function openDetail(attempt_id) {
  const detail = document.getElementById('detail');
  detail.innerHTML = '<p style="color:#666;">載入中…</p>';

  const d = await fetchAttemptDetail(attempt_id);
  if (!d?.ok) { detail.innerHTML = `<p class="error-message">讀取失敗：${d?.error||'未知錯誤'}</p>`; return; }

  // 讀題檔（如仍在）
  let quizData = null;
  if (d.quiz_meta?.file) {
    try {
      const url = d.quiz_meta.file.startsWith('./') || d.quiz_meta.file.startsWith('/') || d.quiz_meta.file.startsWith('http')
        ? `${d.quiz_meta.file}?v=${window.BUILD_VERSION||Date.now()}`
        : `./${d.quiz_meta.file}?v=${window.BUILD_VERSION||Date.now()}`;
      const res = await fetch(url, { cache:'no-store' });
      if (!res.ok) throw new Error(`讀題檔失敗(${res.status})`);
      const text = await res.text();
      let parsed = JSON.parse(text);
      quizData = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : null);
    } catch {
      quizData = null;
    }
  }

  detail.innerHTML = renderAttemptHtml(d, quizData);
  await new Promise(requestAnimationFrame);
  renderAllMath(detail);
}

function renderAttemptHtml(d, quizData) {
  const a = d.attempt;
  const pct = pctStr(a.score, a.max_score);

  let wrongHtml = '';
  if (!quizData) {
    wrongHtml = `<p class="error-message">題庫檔案不存在或已被移除，無法顯示錯題分析。</p>`;
  } else {
    const rows = [];
    for (let i=0; i<quizData.length; i++) {
      const q = quizData[i];
      const ans = a.answers.find(x => Number(x.q_index)===i);

      let your = '（未作答）';
      let correct = '';
      let isCorrect = false;

      const qtype = (q?.question_type||'').toLowerCase();

      if (qtype === 'choice') {
        const sel = ans?.selected_index;
        const correctIdx = (q.options||[]).findIndex(o => o === q.answer);
        your    = (sel!=null && q.options?.[sel]!=null) ? q.options[sel] : your;
        correct = (correctIdx!=null && correctIdx>=0) ? (q.options?.[correctIdx] ?? '') : (q.answer ?? '');
        isCorrect = (sel === correctIdx);

      } else if (qtype === 'cloze') {
        // 你的作答（索引陣列）
        const picked = Array.isArray(ans?.selected_indices)
          ? ans.selected_indices
          : Array.isArray(ans?.blanks)
            ? ans.blanks
            : Array.isArray(ans?.values)
              ? ans.values
              : [];

        // 正確答案（索引陣列）— 支援多個欄位名稱
        let corrArr = null;
        if (Array.isArray(q?.cloze_answer_indices)) corrArr = q.cloze_answer_indices;
        else if (Array.isArray(q?.cloze_correct))    corrArr = q.cloze_correct;
        else if (Array.isArray(q?.answer))           corrArr = q.answer;
        else if (Array.isArray(q?.correct))          corrArr = q.correct;

        your    = picked.length ? formatClozePicks(q, picked, '（未作答）') : '（未作答）';
        correct = Array.isArray(corrArr) ? formatClozePicks(q, corrArr, '（未提供正解）') : '（未提供正解）';

        isCorrect = Array.isArray(corrArr)
          && picked.length === corrArr.length
          && picked.every((v, k) => v === corrArr[k]);

      } else {
        your = '（未知題型）';
      }

      if (!isCorrect) {
        const stem = renderStemHTML(q, i);
        rows.push(`<li>
          ${stem}
          <p><strong>你的答案：</strong><span style="color:#d33;">${your}</span></p>
          <p><strong>正確答案：</strong><span style="color:#28a745;">${correct || '（未提供正解）'}</span></p>
        </li>`);
      }
    }
    wrongHtml = rows.length ? `<ul id="wrong-answers-list">${rows.join('')}</ul>` : `<p style="color:#2d7;">全對！</p>`;
  }

  return `
    <div class="results-head">
      <h2>${d.quiz_meta?.title || a.quiz_id}（v${a.quiz_version}）</h2>
      <p>成績：<strong>${pct}</strong>（${a.score}/${a.max_score}）</p>
      <p style="color:#666;">作答：${a.client_started_at || ''} → ${a.client_submitted_at || ''}</p>
    </div>
    <div class="results-body" style="max-height:calc(100dvh - 220px);overflow:auto;padding:8px 0 12px;">
      <h3>錯題分析：</h3>
      ${wrongHtml}
    </div>
  `;
}

// --- init ---
window.addEventListener('DOMContentLoaded', async ()=>{
  requireLogin();

  // 右欄預設空狀態
  const detail = document.getElementById('detail');
  if (detail && !detail.innerHTML.trim()) {
    detail.innerHTML = `<div class="empty-state"><div class="empty-title">錯題分析</div><p class="empty-desc">請從左側挑選一筆作答紀錄，這裡將顯示詳情與錯題分析。</p></div>`;
  }

  const listEl = document.getElementById('list');
  const tabBest = document.getElementById('tab-best');
  const tabAll  = document.getElementById('tab-all');
  document.getElementById('back').addEventListener('click', ()=> history.length>1 ? history.back() : location.href='account.html');

  async function load(scope){
    listEl.innerHTML = '讀取中…';
    const data = await fetchHistoryList(scope);
    if (!data?.ok) { listEl.innerHTML = `<p class="error-message">讀取失敗：${data?.error||'未知錯誤'}</p>`; return; }
    renderList(listEl, data.items, scope);
  }

  tabBest.addEventListener('click', ()=>{ tabBest.classList.remove('secondary'); tabAll.classList.add('secondary'); load('best'); });
  tabAll .addEventListener('click', ()=>{ tabAll.classList.remove('secondary'); tabBest.classList.add('secondary'); load('all'); });
  tabBest.click(); // 預設載入「最佳成績」
});