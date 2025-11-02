// js/editor.page.js
import { requireLogin, clearSession } from './state.js';
import { BUILD_VERSION } from './config.js';
import { renderAllMath } from './katex.js';
import { upsertQuiz, upsertAnswerKeys } from './api.js';

const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

// 預設 cloze 選項（按一下快速新增一組）
const DEFAULT_CLOZE_SET = ["0","1","2","3","4","5","6","7","8","9","$-$","$\\pm$"];

// ======（沿用 quiz 結果頁）題幹與 cloze 格式化 ======
function renderStemHTML(q, idx){
  const disp = (q.display_type || 'text').toLowerCase();
  const isCloze = (q?.question_type || '').toLowerCase() === 'cloze';
  const clozeStem = [
    q.question_content ? `<div class="q-stem-main">${q.question_content}</div>` : '',
    q.cloze_template   ? `<div class="q-stem-cloze" style="margin-top:6px;">${q.cloze_template}</div>` : ''
  ].join('');
  const textStem = isCloze ? (clozeStem || '') : (q.question_content || '');

  if (disp === 'image') {
    const img = `<img src="${q.question_content}" alt="題目圖片 ${idx+1}" style="width:80%;max-width:280px;margin:10px 0;border-radius:4px;">`
    return isCloze ? `${img}${q.cloze_template ? `<div class="q-stem-cloze" style="margin-top:6px;">${q.cloze_template}</div>` : ''}` : img;
  }
  if (q.question_image) {
    return `
      <div class="q-row">
        <div class="q-text"><p><strong>題目：</strong>${textStem}</p></div>
        <div class="q-media"><img src="${q.question_image}" alt="題目圖片 ${idx+1}" /></div>
      </div>`;
  }
  return `<p><strong>題目：</strong>${textStem}</p>`;
}

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

// ====== 預覽：把草稿題目以「錯題分析」格式顯示 ======
function buildPreviewHtml(draft){
  if (!Array.isArray(draft) || draft.length===0) {
    return '<p class="muted">尚無題目可預覽。</p>';
  }
  const rows = draft.map((q, i) => {
    const stem = renderStemHTML(q, i);
    const qtype = (q?.question_type || '').toLowerCase();
    if (qtype === 'choice') {
      const opts = Array.isArray(q.options) ? q.options.map(o=>`<li>${o}</li>`).join('') : '';
      const correctIdx = (q.options||[]).findIndex(o => o === q.answer);
      const corr = (correctIdx >= 0) ? q.options[correctIdx] : (q.answer || '（未提供正解）');
      return `<li>
        ${stem}
        <div><strong>選項：</strong><ul style="margin:6px 0 0 18px;">${opts}</ul></div>
        <p><strong>（預覽）正確答案：</strong><span style="color:#28a745;">${corr}</span></p>
      </li>`;
    } else if (qtype === 'cloze') {
      const sets = Array.isArray(q.cloze_options) ? q.cloze_options : [];
      const setsHtml = sets.map((set, k)=>`<div class="cloze-blank"><div class="label">(${k+1}):</div><div class="cloze-options">${(set||[]).map(t=>`<div class="cloze-option">${t}</div>`).join('')}</div></div>`).join('');
      const corr = Array.isArray(q.cloze_answer_indices) ? formatClozePicks(q, q.cloze_answer_indices, '（未提供正解）') : '（未提供正解）';
      return `<li>
        ${stem}
        ${setsHtml}
        <p style="margin-top:6px;"><strong>（預覽）正確答案：</strong><span style="color:#28a745;">${corr}</span></p>
      </li>`;
    } else {
      return `<li>${stem}<p class="bad">未知題型：${q?.question_type}</p></li>`;
    }
  });
  return `<div class="results-body" style="max-height:calc(88vh - 120px);overflow:auto;padding:8px 0 12px;">
    <ul id="wrong-answers-list">${rows.join('')}</ul>
  </div>`;
}

// ====== Access control ======
window.addEventListener('DOMContentLoaded', () => {
  let s;
  try { s = requireLogin(); } catch { return; }
  if ((s.role||'').toLowerCase() !== 'admin') {
    alert('只有管理員可以使用題目 JSON 產生器。');
    location.replace(`account.html?v=${BUILD_VERSION}`);
    return;
  }
  boot();
});

function boot(){
  // Nav
  $('#back-to-account').addEventListener('click', ()=> location.href = `account.html?v=${BUILD_VERSION}`);
  $('#logout').addEventListener('click', ()=> { clearSession(); location.href = `login.html?v=${BUILD_VERSION}`; });

  // Defaults
  const fn = $('#file-name');
  if (!fn.value.trim()) {
    const now = new Date();
    const pad = n=>String(n).padStart(2,'0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    fn.value = `questions/new-${stamp}.json`;
  }

  // Form visibility rules
  const qtype = $('#qtype');
  const display = $('#display');
  qtype.addEventListener('change', syncFormVisibility);
  display.addEventListener('change', syncFormVisibility);
  syncFormVisibility();

  // Cloze options builder
  $('#add-set').addEventListener('click', ()=> { clozeSets.push([]); renderSets(); });
  const addDefaultBtn = document.getElementById('add-default-set');
  if (addDefaultBtn) addDefaultBtn.addEventListener('click', ()=> { clozeSets.push(Array.from(DEFAULT_CLOZE_SET)); renderSets(); });

  // Form actions
  $('#add-to-draft').addEventListener('click', addToDraft);
  $('#reset-form').addEventListener('click', resetForm);

  // Output actions
  $('#preview-questions').addEventListener('click', openPreviewModal);
  $('#preview').addEventListener('click', updatePreview);
  $('#copy').addEventListener('click', copyPreview);
  $('#download').addEventListener('click', downloadJson);
  $('#clear-draft').addEventListener('click', clearDraft);

  // === 上傳到 Sheets ===
  $('#btn-upload-all')?.addEventListener('click', uploadAll);
  $('#btn-upload-meta')?.addEventListener('click', uploadMeta);
  $('#btn-upload-keys')?.addEventListener('click', uploadKeys);

  // 匯入 JSON（從本機檔案）
  document.getElementById('import-json')?.addEventListener('click', () =>
    document.getElementById('import-file').click()
  );
  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      // 支援純陣列或 { questions:[...] }
      const arr = Array.isArray(parsed) ? parsed
                : (Array.isArray(parsed?.questions) ? parsed.questions : null);
      if (!arr) throw new Error('格式錯誤：需為題目物件的陣列，或 {questions:[...]}');

      // 直接灌進 editor 的草稿清單
      draft = arr;
      clozeSets = [];
      renderDraft();
      updatePreview();
      alert('匯入成功：' + arr.length + ' 題');
    } catch (err) {
      alert('匯入失敗：' + (err?.message || err));
    } finally {
      e.target.value = '';
    }
  });

  // 題目預覽（以 quiz 的錯題分析視覺呈現題幹 + 正解）
  const pqOpen  = document.getElementById('preview-questions');
  const pqModal = document.getElementById('previewQ-modal');
  const pqBack  = document.getElementById('previewQ-backdrop');
  const pqClose = document.getElementById('previewQ-close');
  const pqBody  = document.getElementById('previewQ-content');
  function openPQ(){ pqBack.classList.add('show'); pqModal.classList.add('show'); }
  function closePQ(){ pqModal.classList.remove('show'); pqBack.classList.remove('show'); }
  function renderQuestionsPreview(){
    const html = buildPreviewHtml(draft);
    pqBody.innerHTML = html;
    try { import('./katex.js').then(mod => mod.renderAllMath(pqBody)); } catch {}
  }
  pqOpen?.addEventListener('click', ()=>{ if (!draft.length){ pqBody.innerHTML = '<p class="muted">尚無題目可預覽，請先加入至少一題。</p>'; openPQ(); return;} renderQuestionsPreview(); openPQ(); });
  pqClose?.addEventListener('click', closePQ);
  pqBack?.addEventListener('click', closePQ);

  renderDraft();
  // 預覽視窗關閉
  document.getElementById('preview-close')?.addEventListener('click', closePreviewModal);
  document.getElementById('preview-backdrop')?.addEventListener('click', closePreviewModal);
}

function syncFormVisibility(){
  const isChoice = $('#qtype').value === 'choice';
  const isCloze  = $('#qtype').value === 'cloze';
  const disp     = $('#display').value;

  $('#choice-fields').classList.toggle('hidden', !isChoice);
  $('#cloze-fields').classList.toggle('hidden', !isCloze);
  // question_image 僅在 display=text 顯示
  $('#row-qimg').classList.toggle('hidden', disp !== 'text');
}

// ====== Internal draft storage ======
let draft = [];               // array of question objects
let clozeSets = [];           // array of arrays (strings)

function resetForm(){
  $('#qtype').value = 'choice';
  $('#display').value = 'text';
  $('#qcontent').value = '';
  $('#qimg').value = '';
  $('#opt-json').value = '';
  $('#ans').value = '';
  $('#tmpl').value = '';
  $('#ans-idx').value = '';
  clozeSets = [];
  renderSets();
  syncFormVisibility();
  $('#form-error').textContent = '';
}

function addToDraft(){
  $('#form-error').textContent = '';
  try {
    const q = buildQuestionFromForm();
    draft.push(q);
    renderDraft();
    resetForm();
  } catch (e) {
    $('#form-error').textContent = e.message || String(e);
  }
}

function buildQuestionFromForm(){
  const type = $('#qtype').value;
  const disp = $('#display').value;
  const content = ($('#qcontent').value || '').trim();
  if (!content) throw new Error('請填寫 question_content');
  const qimg = ($('#qimg').value || '').trim();

  if (type === 'choice') {
    const options = parseArrayOfStrings($('#opt-json').value);
    if (!options.length) throw new Error('請提供 options（至少 1 個）');
    const ans = ($('#ans').value || '').trim();
    if (!ans) throw new Error('請填寫 answer（需與 options 其中一個相同）');
    if (!options.includes(ans)) {
      console.warn('[editor] answer 不在 options 裡：', ans, options);
    }
    const q = {
      question_type: 'choice',
      display_type: disp,
      question_content: content,
      options,
      answer: ans
    };
    if (disp === 'text' && qimg) q.question_image = qimg;
    return q;
  }

  if (type === 'cloze') {
    const tmpl = ($('#tmpl').value || '').trim();
    if (!tmpl) throw new Error('請填寫 cloze_template');
    if (!clozeSets.length) throw new Error('請新增至少一組 cloze_options');
    const idxRaw = ($('#ans-idx').value || '').trim();
    const indices = idxRaw ? idxRaw.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!Number.isNaN(n)) : [];
    if (!indices.length) console.warn('[editor] cloze_answer_indices 為空');

    const q = {
      question_type: 'cloze',
      display_type: disp,
      question_content: content,
      cloze_template: tmpl,
      cloze_options: clozeSets.map(set => Array.from(set)),
      cloze_answer_indices: indices
    };
    if (disp === 'text' && qimg) q.question_image = qimg;
    return q;
  }

  throw new Error('未知的 question_type');
}

function parseArrayOfStrings(input){
  const s = (input||'').trim();
  if (!s) return [];
  // 首先嘗試 JSON.parse
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(x=>String(x));
  } catch {}
  // 退而求其次：用逗號分隔
  return s.split(',').map(t => t.trim()).filter(t => t.length).map(String);
}

// ====== Cloze option-sets UI ======
function renderSets(){
  const host = $('#sets');
  host.innerHTML = '';
  clozeSets.forEach((set, i) => {
    const row = document.createElement('div');
    row.className = 'card q-row';

    const left = document.createElement('div');
    const lab = document.createElement('div');
    lab.className = 'q-row-title';
    lab.textContent = `第 ${i+1} 組（對應 ( ${i+1} ) ）`;
    const inp = document.createElement('textarea');
    inp.placeholder = '用逗號分隔，例如：0,1,2,3,4,5,6,7,8,9,$-$,$\\pi$';
    inp.value = set.join(', ');
    inp.addEventListener('input', () => {
      clozeSets[i] = parseArrayOfStrings(inp.value);
    });
    left.appendChild(lab);
    left.appendChild(inp);

    const right = document.createElement('div');
    right.className = 'row-wrap nowrap';
    const mkBtn = (txt, cls, on)=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = txt;
      b.className = 'btn-small ' + (cls||'');
      b.addEventListener('click', on);
      return b;
    };
    right.appendChild(mkBtn('複製', '', () => { clozeSets.splice(i+1, 0, Array.from(clozeSets[i])); renderSets(); }));
    right.appendChild(mkBtn('上移', '', () => { if (i>0){ const t=clozeSets[i-1]; clozeSets[i-1]=clozeSets[i]; clozeSets[i]=t; renderSets(); } }));
    right.appendChild(mkBtn('下移', '', () => { if (i<clozeSets.length-1){ const t=clozeSets[i+1]; clozeSets[i+1]=clozeSets[i]; clozeSets[i]=t; renderSets(); } }));
    right.appendChild(mkBtn('刪除', 'danger', () => { clozeSets.splice(i,1); renderSets(); }));

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  });
}

// ====== Draft list & export ======
function renderDraft(){
  $('#count').textContent = String(draft.length);
  const list = $('#draft-list');
  const empty = $('#empty-draft');
  list.innerHTML = '';
  empty.style.display = draft.length ? 'none' : 'block';

  draft.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'card';

    const title = document.createElement('div');
    title.innerHTML = `<div class="q-row-title">#${i+1} — ${q.question_type}｜${q.display_type}</div>`;
    const meta = document.createElement('div');
    meta.className = 'q-row-meta';
    const main = (q.question_content || '').replace(/\s+/g,' ').slice(0,50);
    meta.textContent = main ? `「${main}${(q.question_content||'').length>50?'…':''}」` : '(無題幹)';
    item.appendChild(title);
    item.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'row-wrap';
    const mk = (txt, cls, on)=>{
      const b = document.createElement('button');
      b.className = 'btn-small ' + (cls||'');
      b.textContent = txt;
      b.addEventListener('click', on);
      return b;
    };
    actions.appendChild(mk('上移', '', () => { if (i>0){ const t=draft[i-1]; draft[i-1]=draft[i]; draft[i]=t; renderDraft(); } }));
    actions.appendChild(mk('下移', '', () => { if (i<draft.length-1){ const t=draft[i+1]; draft[i+1]=draft[i]; draft[i]=t; renderDraft(); } }));
    actions.appendChild(mk('編輯', '', () => editItem(i)));
    actions.appendChild(mk('刪除', 'danger', () => { draft.splice(i,1); renderDraft(); }));

    item.appendChild(actions);
    list.appendChild(item);
  });
}

function editItem(i){
  const q = draft[i];
  if (!q) return;
  // 導回表單進行編輯（簡單策略：填回表單 + 從清單移除，讓使用者重新加入）
  $('#qtype').value = q.question_type;
  $('#display').value = q.display_type;
  $('#qcontent').value = q.question_content || '';
  $('#qimg').value = q.question_image || '';
  if (q.question_type === 'choice') {
    $('#opt-json').value = JSON.stringify(q.options || [], null, 0);
    $('#ans').value = q.answer || '';
  } else {
    $('#tmpl').value = q.cloze_template || '';
    clozeSets = Array.isArray(q.cloze_options) ? q.cloze_options.map(set => Array.from(set)) : [];
    $('#ans-idx').value = Array.isArray(q.cloze_answer_indices) ? q.cloze_answer_indices.join(',') : '';
    renderSets();
  }
  syncFormVisibility();
  draft.splice(i,1);
  renderDraft();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getOutputArray(){
  return draft.map(q => q);
}

function updatePreview(){
  const out = getOutputArray();
  $('#preview-box').value = JSON.stringify(out, null, 2);
}

async function copyPreview(){
  updatePreview();
  const text = $('#preview-box').value;
  try {
    await navigator.clipboard.writeText(text);
    alert('已複製到剪貼簿！');
  } catch {
    alert('無法存取剪貼簿，請手動複製。');
  }
}

function ensureJsonFilename(s){
  let name = (s||'').trim() || 'questions/new-quiz.json';
  if (!name.endsWith('.json')) name += '.json';
  return name;
}

function downloadJson(){
  const out = getOutputArray();
  const file = ensureJsonFilename($('#file-name').value);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.split('/').pop(); // 實際下載檔名（瀏覽器不會幫你建資料夾）
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function clearDraft(){
  if (!draft.length) return;
  const ok = confirm('確定要清空清單嗎？');
  if (!ok) return;
  draft = [];
  renderDraft();
  updatePreview();
}


function openPreviewModal(){
  const modal = document.getElementById('preview-modal');
  const backdrop = document.getElementById('preview-backdrop');
  const content = document.getElementById('preview-content');
  if (!modal || !backdrop || !content) return;
  content.innerHTML = buildPreviewHtml(draft);
  backdrop.classList.add('show');
  modal.classList.add('show');
  // 渲染 KaTeX
  try { renderAllMath(content); } catch {}
}
function closePreviewModal(){
  const modal = document.getElementById('preview-modal');
  const backdrop = document.getElementById('preview-backdrop');
  if (!modal || !backdrop) return;
  modal.classList.remove('show');
  backdrop.classList.remove('show');
}


function byId(id){ return document.getElementById(id); }
function text(el){ return (el?.value || '').trim(); }
function num(el){ const n = Number((el?.value||'').trim()); return Number.isFinite(n) && n>=0 ? n : null; }

function buildQuizMeta(){
  const quiz_id = text(byId('upload-quiz-id'));
  const quiz_version = Number(text(byId('upload-quiz-version')) || 1);
  if (!quiz_id) throw new Error('請填 quiz_id');
  const file = text(byId('file-name')) || 'questions/quiz.json';
  const title = text(byId('upload-title')) || (file.split('/').pop() || quiz_id);
  const total_points = draft.length || 0;
  const time_limit_minutes = num(byId('upload-tlm'));
  const is_active = !!byId('upload-active')?.checked;
  return { quiz_id, quiz_version, title, total_points, is_active, file, time_limit_minutes };
}

function buildAnswerKeys(quiz_id, quiz_version){
  const keys = draft.map((q, i)=>{
    if ((q?.question_type||'').toLowerCase()==='choice'){
      const idx = (q.options||[]).findIndex(o => o === q.answer);
      return { q_index: i, correct_index: idx };
    } else if ((q?.question_type||'').toLowerCase()==='cloze'){
      const arr = Array.isArray(q.cloze_answer_indices) ? q.cloze_answer_indices : [];
      return { q_index: i, correct_indices: arr };
    }
    return { q_index: i };
  });
  return { quiz_id, quiz_version, keys };
}

async function uploadMeta(){
  const msg = byId('upload-msg'); msg.textContent = '';
  try {
    const meta = buildQuizMeta();
    msg.textContent = '上傳 Quiz Meta 中…';
    const res = await upsertQuiz(meta);
    if (!res?.ok) throw new Error(res?.error || '伺服端回應失敗');
    msg.textContent = '✅ Quiz Meta 已更新至試算表。';
  } catch(e){ msg.textContent = '❌ '+ (e?.message||String(e)); }
}

async function uploadKeys(){
  const msg = byId('upload-msg'); msg.textContent = '';
  try {
    const meta = buildQuizMeta();
    const payload = buildAnswerKeys(meta.quiz_id, meta.quiz_version);
    msg.textContent = '上傳 Answer Keys 中…';
    const res = await upsertAnswerKeys(payload.quiz_id, payload.quiz_version, payload.keys);
    if (!res?.ok) throw new Error(res?.error || '伺服端回應失敗');
    msg.textContent = '✅ Answer Keys 已更新至試算表。';
  } catch(e){ msg.textContent = '❌ '+ (e?.message||String(e)); }
}

async function uploadAll(){
  const msg = byId('upload-msg'); msg.textContent = '';
  try {
    const meta = buildQuizMeta();
    msg.textContent = '上傳 Quiz Meta 中…';
    const r1 = await upsertQuiz(meta);
    if (!r1?.ok) throw new Error(r1?.error || 'Quiz Meta 失敗');
    msg.textContent = 'Quiz Meta 完成，準備上傳 Answer Keys…';
    const payload = buildAnswerKeys(meta.quiz_id, meta.quiz_version);
    const r2 = await upsertAnswerKeys(payload.quiz_id, payload.quiz_version, payload.keys);
    if (!r2?.ok) throw new Error(r2?.error || 'Answer Keys 失敗');
    msg.textContent = '✅ 全部完成：Quiz Meta + Answer Keys 已更新至試算表。';
  } catch(e){ msg.textContent = '❌ '+ (e?.message||String(e)); }
}
