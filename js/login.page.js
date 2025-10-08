// js/login.page.js
import { WEBAPP_URL } from './config.js';
import { auth } from './api.js';
import { saveSession, clearSession } from './state.js';

const $ = (s)=>document.querySelector(s);
const btn = $('#login-btn');
const err = $('#login-error');
const user = $('#username');
const pass = $('#password');

let slowHintTimer = null;

function setBusy(busy){
  btn.disabled = busy;
  user.disabled = busy;
  pass.disabled = busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (!btn.dataset.idleText) btn.dataset.idleText = btn.textContent || '登入';
  btn.textContent = busy ? '登入中…' : btn.dataset.idleText;
}

async function doLogin(){
  err.textContent = '';

  const account  = user.value.trim();
  const password = pass.value;
  if (!account || !password){
    err.textContent = '請輸入帳號與密碼';
    return;
  }

  setBusy(true);

  // 慢速提示：1.2 秒後還沒回應才顯示
  clearTimeout(slowHintTimer);
  slowHintTimer = setTimeout(() => {
    if (!err.textContent) err.textContent = '正在連線伺服器（第一次可能較慢）…';
  }, 1200);

  try {
    const data = await auth(account, password); // 呼叫 api.js
    if (!data?.ok) {
      err.textContent = `登入失敗：${data?.error || '未知錯誤'}`;
      return;
    }

    // 存 session（帳號 & 可做題庫）
    saveSession({
      account: data.account,
      display_name: data.display_name,
      role: data.role,
      quizzes: data.quizzes || []
    });

    // 導向題庫選擇
    location.href = `account.html?v=${window.BUILD_VERSION}`;
  } catch(e){
    console.error(e);
    err.textContent = '登入服務暫時無法使用，請稍後再試';
  } finally {
    clearTimeout(slowHintTimer);
    slowHintTimer = null;
    // 成功的情況下會跳頁，不會看到復原；失敗才需要復原
    setBusy(false);
  }
}

btn.addEventListener('click', doLogin);

// 支援 Enter 送出
[user, pass].forEach(inp => {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
});