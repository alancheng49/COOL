import { requireLogin, getSession, clearSession } from './state.js';

window.addEventListener('DOMContentLoaded', ()=>{
  const s = requireLogin();
  document.getElementById('who').textContent = s.display_name || s.account || '';

  document.getElementById('to-quiz').addEventListener('click', ()=>{
    location.href = `picker.html?v=${window.BUILD_VERSION}`;
  });
  document.getElementById('to-history').addEventListener('click', ()=>{
    location.href = `history.html?v=${window.BUILD_VERSION}`;
  });
  document.getElementById('logout').addEventListener('click', ()=>{
    clearSession();
    location.href = `login.html?v=${window.BUILD_VERSION}`;
  });
});

// --- Help (如何使用) ---
(function setupHelp(){
  const btn = document.getElementById('help-btn');
  const modal = document.getElementById('help-modal');
  const closeBtn = document.getElementById('help-close');
  const backdrop = document.getElementById('help-backdrop');
  const content = document.getElementById('help-content');
  if (!btn || !modal || !closeBtn || !backdrop || !content) return;

  let loaded = false;

  const mdToHtml = (md) => {
    // 超輕量轉換：標題 / 清單 / 粗斜體 / 連結 / 段落
    let html = md
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
      .replace(/(\n<li>.*<\/li>)+/gms, (m)=>`<ul>${m.replace(/\n/g,'')}</ul>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+?)`/g, '<code>$1</code>')
      .replace(/$begin:math:display$([^$end:math:display$]+)\]$begin:math:text$([^)]+)$end:math:text$/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 簡單段落分割
    html = html.split(/\n{2,}/).map(b=>{
      if (/^<h\d|^<ul|^<pre|^<p|^<blockquote|^<table|^<img/.test(b.trim())) return b;
      return `<p>${b.replace(/\n/g,'<br>')}</p>`;
    }).join('\n');

    return html;
  };

  function open(){
    backdrop.classList.add('show');
    modal.classList.add('show');
  }
  function close(){
    modal.classList.remove('show');
    backdrop.classList.remove('show');
  }

  btn.addEventListener('click', async ()=>{
    open();
    if (loaded) return;
    try{
      const res = await fetch('./help.md?ts=' + Date.now(), { cache:'no-store' });
      if (!res.ok) throw new Error(res.status);
      const text = await res.text();
      content.innerHTML = mdToHtml(text);
    }catch(e){
      content.innerHTML = `<p class="error-message">讀取 help.md 失敗：${e?.message||e}</p>`;
    }
    loaded = true;
  });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
})();