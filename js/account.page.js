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