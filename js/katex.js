// 等 KaTeX auto-render 載好
export const katexReady = new Promise((resolve) => {
  if (window.renderMathInElement) return resolve();
  window.addEventListener("DOMContentLoaded", () => {
    const auto = document.getElementById("katex-auto-render");
    if (auto) auto.addEventListener("load", () => resolve(), { once: true });
  });
  (function check(){ if (window.renderMathInElement) return resolve(); setTimeout(check, 50);} )();
});

export async function renderAllMath(root = document.body) {
  await katexReady;
  await new Promise(requestAnimationFrame);
  if (!window.renderMathInElement) return;
  window.renderMathInElement(root, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
}