// js/picker.page.js
import { requireLogin, saveCurrentQuiz, clearSession } from './state.js';

const $ = (s) => document.querySelector(s);
const select  = $('#quiz-select');
const errorEl = $('#picker-error');

(function init () {
  // 這裡會自動導去 login.html（requireLogin 內部會 replace）
  let sess;
  try {
    sess = requireLogin();  // 會回傳 session 物件
  } catch {
    return;                 // 已導走，不再往下跑
  }

  const quizzes = sess.quizzes || [];
  if (quizzes.length === 0) {
    errorEl.textContent = '此帳號尚未配置題庫，請聯絡老師或管理員。';
  }

  // 塞選單
  select.innerHTML = '';
  quizzes.forEach((q, i) => {
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.textContent = `${q.id} — ${q.name}`;
    opt.dataset.file    = q.file || '';
    opt.dataset.version = q.version || 1;
    opt.dataset.tlm     = q.time_limit_minutes ?? '';
    if (i === 0) opt.selected = true;
    select.appendChild(opt);
  });
})();

$('#start-quiz-btn').addEventListener('click', () => {
  const opt = select.selectedOptions[0];
  if (!opt) { errorEl.textContent = '請先選擇題庫'; return; }

  const ok = confirm(
    '即將開始測驗。\n\n提醒：開始後若中途關閉頁面、返回或重新整理，將視同未完成，成績可能記錄為未繳交或 0 分（依教師設定）。\n\n確認要開始嗎？'
  );
  if (!ok) return;

  // 存本次要作答的題庫資訊，給 quiz.html 讀
  saveCurrentQuiz({
    id:   opt.value,
    name: opt.textContent,
    file: opt.dataset.file,
    version: Number(opt.dataset.version || 1),
    time_limit_minutes: Number(opt.dataset.tlm || 0) || null
  });

  location.href = `quiz.html?v=v2.0.0-b3 || Date.now()}`;
});

$('#logout-btn').addEventListener('click', () => {
  clearSession();
  location.href = `login.html?v=v2.0.0-b3 || Date.now()}`;
});

document.getElementById('back-to-account-btn')?.addEventListener('click', () => {
  location.href = `account.html?v=${window.BUILD_VERSION}`;
});

// === Admin override: show ALL quizzes, bypassing assignments filter ===
import { getSession } from './state.js';
import { listQuizzes } from './api.js';

(async function adminOverrideShowAllQuizzes(){
  try{
    const sess = (typeof getSession === 'function') ? getSession() : null;
    if (!sess || !sess.role || String(sess.role).toLowerCase() !== 'admin') return;

    // Fetch all quizzes from backend
    const resp = await listQuizzes().catch(()=>null);
    if (!resp || !resp.ok || !Array.isArray(resp.items)) return;

    const all = resp.items
      .filter(q => q && q.quiz_id)  // normalize
      .map(q => ({
        id: q.quiz_id,
        name: q.title || q.quiz_id,
        file: q.file || '',
        version: Number(q.quiz_version || q.version || 1),
        time_limit_minutes: (q.time_limit_minutes != null ? Number(q.time_limit_minutes) : null)
      }));

    const sel = document.getElementById('quiz-select');
    if (!sel) return;

    // De-duplicate by id-version combo, prefer the entry from "all"
    const keyOf = (o)=> `${o.id}__${o.version}`;
    const current = Array.from(sel.querySelectorAll('option')).map(opt => ({
      id: opt.value,
      name: opt.textContent || opt.value,
      file: opt.dataset.file || '',
      version: Number(opt.dataset.version || 1),
      time_limit_minutes: (opt.dataset.tlm ? Number(opt.dataset.tlm) : null)
    }));

    const mergedMap = new Map();
    for (const q of current) mergedMap.set(keyOf(q), q);
    for (const q of all)     mergedMap.set(keyOf(q), q); // overwrite with admin-all

    const merged = Array.from(mergedMap.values())
      .sort((a,b)=> String(a.id).localeCompare(String(b.id)) || (a.version - b.version));

    // Rebuild <select>
    sel.innerHTML = '';
    merged.forEach((q, i) => {
      const opt = document.createElement('option');
      opt.value = q.id;
      opt.textContent = `${q.id} — ${q.name}${q.version ? (' v'+q.version) : ''}`;
      opt.dataset.file    = q.file || '';
      opt.dataset.version = q.version || 1;
      if (q.time_limit_minutes != null) opt.dataset.tlm = String(q.time_limit_minutes);
      if (i === 0) opt.selected = true;
      sel.appendChild(opt);
    });

    // 讓管理員一眼看出狀態
    const errEl = document.getElementById('picker-error');
    if (errEl) {
      const tag = document.createElement('div');
      tag.style.fontSize = '12px';
      tag.style.opacity = '0.8';
      tag.textContent = `（管理員模式：顯示全部題庫，共 ${merged.length} 筆）`;
      errEl.replaceChildren(tag);
    }
  }catch(e){
    // 靜默失敗，不影響一般流程
    console.warn('[adminOverrideShowAllQuizzes] failed:', e);
  }
})();
