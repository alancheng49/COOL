import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium } = await import(option('playwright', 'playwright'));
const base = option('url', 'http://127.0.0.1:5175');
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = option('output', '/tmp/homework-pdf-ui');
await mkdir(output, { recursive: true });
// A real two-page PDF, rendered through the app's actual PDF.js loader/worker.
function pdfFixture() {
  const text = 'BT /F1 22 Tf 60 600 Td (PDF question region test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((v) => `${String(v).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
const questions = [
  { question_type: 'choice', points: 1, options: ['A', 'B'], answer: 'A', pdf_region: { page: 1, x: .1, y: .65, width: .7, height: .18 } },
  { question_type: 'choice', points: 1, options: ['A', 'B'], answer: 'A', pdf_region: { page: 2, x: .55, y: .1, width: .4, height: .25 } },
  { question_type: 'choice', points: 1, options: ['A', 'B'], answer: 'A' },
];
const quiz = { id: 'pdf_fixture', version: 1, name: 'PDF 範圍測試', file: 'questions/pdf_fixture.json', time_limit_minutes: 0, pdf_mode: true, pdf_url: `${base}/fixture.pdf` };
const meta = { ...quiz, quiz_id: quiz.id, quiz_version: 1, title: quiz.name, is_active: true };
const keys = questions.map((q, q_index) => ({ q_index, type: q.question_type, points: 1, correct: 0 }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const writes = [];
async function createPage(width, role) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width < 768 ? 2 : 1, hasTouch: width < 768, isMobile: width < 768 });
  await context.addInitScript(({ role, quiz }) => localStorage.setItem('hw.session', JSON.stringify({ token: 'local-only', account: role, role, display_name: '測試', quizzes: [quiz], expires_at: '2099-01-01T00:00:00Z' })), { role, quiz });
  await context.route('**/fixture.pdf', (route) => route.fulfill({ contentType: 'application/pdf', body: pdfFixture() }));
  await context.route('**/questions/pdf_fixture.json*', (route) => route.fulfill({ json: questions }));
  await context.route((url) => url.pathname === '/api', async (route) => {
    const req = route.request();
    const payload = req.method() === 'POST' ? JSON.parse(req.postData() || '{}') : Object.fromEntries(new URL(req.url()).searchParams);
    writes.push(payload);
    const replies = {
      admin_list_quizzes: { items: [meta], drafts: [] },
      admin_quiz_detail: { meta, keys, questions, assignments: [] },
      list_quizzes: { items: [quiz] },
      start_quiz: { started_at: new Date().toISOString(), question_points: keys },
      get_draft: { draft: null },
      admin_upsert_quiz_draft: { draft_id: 'test-draft' },
    };
    await route.fulfill({ json: { ok: true, server_time: new Date().toISOString(), ...(replies[payload.action] || {}) } });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { page, context };
}
async function ready(page, number) {
  await page.waitForFunction((number) => {
    const el = document.querySelector('[data-pdf-page]');
    return el?.dataset.pdfPage === String(number) && getComputedStyle(el).visibility === 'visible';
  }, number).catch(async (error) => { console.log(await page.locator('body').innerText()); console.log(errors); await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); throw error; });
}
async function contained(page) {
  const geometry = await page.locator('[data-pdf-region]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = el.closest('[data-pdf-page]').parentElement.getBoundingClientRect();
    return { left: r.left - s.left, top: r.top - s.top, right: s.right - r.right, bottom: s.bottom - r.bottom, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert(Object.values(geometry).slice(0, 4).every((v) => v >= -2), JSON.stringify(geometry));
  assert(geometry.overflow <= 1, JSON.stringify(geometry));
  assert(await page.evaluate(() => document.documentElement.scrollWidth) <= page.viewportSize().width + 1);
}
try {
  for (const width of [1440, 390]) {
    const { page, context } = await createPage(width, 'student');
    await page.goto(`${base}/#/quiz/pdf_fixture/1`);
    await ready(page, 1);
    await contained(page);
    await page.getByRole('button', { name: 'PDF 下一頁', exact: true }).click();
    await ready(page, 2);
    await page.getByRole('button', { name: '回到題目', exact: true }).click();
    await ready(page, 1);
    await contained(page);
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    await ready(page, 2);
    await contained(page);
    await page.getByRole('button', { name: '放大 PDF', exact: true }).click();
    await ready(page, 2);
    await page.locator('[data-pdf-page]').evaluate((el) => { el.parentElement.scrollTop = 10000; el.parentElement.scrollLeft = 0; });
    await page.getByRole('button', { name: '回到題目', exact: true }).click();
    await ready(page, 2);
    await contained(page);
    // Burst updates exercise render cancellation; only the final question may win.
    await page.evaluate(() => {
      const button = (label) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === label);
      button('上一題').click(); button('下一題').click(); button('上一題').click();
    });
    await ready(page, 1);
    await contained(page);
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    await ready(page, 2);
    await page.screenshot({ path: `${output}/student-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '下一題', exact: true }).click();
    await ready(page, 2); // Unmapped legacy question preserves page.
    assert.equal(await page.getByRole('button', { name: '回到題目', exact: true }).count(), 0);
    await context.close();
    console.log(`PASS student navigation / return / legacy / layout at ${width}px`);
  }
  for (const width of [1440, 390]) {
  const { page, context } = await createPage(width, 'admin');
  await page.goto(`${base}/#/admin/editor/pdf_fixture/1`);
  await ready(page, 1);
  await page.getByLabel('框選題目', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '適合寬度', exact: true }).click();
  await ready(page, 1);
  await page.getByRole('button', { name: '框選範圍', exact: true }).click();
  const rect = await page.locator('[data-pdf-page]').boundingBox();
  if (width < 768) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width * .8, y: rect.y + 160 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + rect.width * .15, y: rect.y + 30 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
  await page.mouse.move(rect.x + rect.width * .8, rect.y + 160);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .15, rect.y + 30, { steps: 10 });
  await page.mouse.up();
  }
  await page.getByText('已設定：PDF 第 1 頁', { exact: true }).last().waitFor();
  await ready(page, 1);
  await contained(page);
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click();
  await page.waitForTimeout(300);
  const saved = writes.findLast((w) => w.action === 'admin_upsert_quiz_draft');
  assert(saved, 'draft request exists');
  const editor = JSON.parse(saved.editor_json);
  assert.equal(editor[2].pdf_region.page, 1);
  assert(Math.abs(editor[2].pdf_region.width - .65) < .01);
  assert.deepEqual(editor[0].pdf_region, questions[0].pdf_region);
  await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
  await context.close();
  console.log(`PASS editor reverse-direction ${width < 768 ? 'touch' : 'mouse'} selection and draft persistence at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
