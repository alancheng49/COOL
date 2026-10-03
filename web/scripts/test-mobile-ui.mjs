import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against a local Vite server. All API calls and question files are mocked.
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium, webkit } = await import(option('playwright', 'playwright'));
const base = option('url', 'http://127.0.0.1:5175');
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only local servers are allowed');
const output = option('output', '/tmp/homework-mobile-ui');
await mkdir(output, { recursive: true });
const browser = option('engine', 'chromium') === 'webkit'
  ? await webkit.launch({ executablePath: option('executable', undefined), timeout: 30000 })
  : await chromium.launch({ channel: 'chrome', headless: true });
const longTitle = '數學綜合練習：二次函數與根式分數的跨行排版測試';
const tall = String.raw`\dfrac{\sqrt{1+\dfrac{x^2}{y+1}}}{\dfrac{1}{x}+\sqrt{y^2+1}}`;
const long = Array.from({ length: 15 }, (_, index) => `a_{${index}}x^{${index}}`).join('+');
const matrix = String.raw`\begin{pmatrix}1 & \dfrac{1}{2} \\ \sqrt{3} & 4 \\ 5 & 6\end{pmatrix}`;
const sum = String.raw`\displaystyle\sum_{k=1}^{n}\frac{1}{k^2}+\int_0^1 x^2\,dx`;
const stem = `已知下列式子，求其值。<br>第一行包含 $${tall}$ 的數學式。<br><span data-testid="next-line">下一行文字不能被公式遮住。</span><br>長公式 $${long}$。<br>獨立公式 $$${tall}+${long}$$ 結束。<br>矩陣 $${matrix}$。<br>求和與積分 $${sum}$。<br>最後一行。`;
const questions = [
  { question_type: 'choice', points: 20, question_content: stem, options: [`$${tall}$`, `$${long}$`, '$1$', '$0$'], answer: 'A' },
  { question_type: 'cloze', points: 20, question_content: '填入適當答案。', cloze_template: String.raw`$\sqrt{\dfrac{(1)}{(2)}}$`, cloze_options: [['1', '2', '-'], ['0', '3', String.raw`$\sqrt{2}$`]], cloze_answer_indices: [0, 1] },
  { question_type: 'group', points: 30, question_content: stem, group_questions: [
    { question_type: 'cloze', points: 10, content: `求 $${tall}$。`, cloze_template: '$(1)$', cloze_options: [['1', '2']], cloze_answer_indices: [0] },
    { question_type: 'short_answer', points: 20, content: '請寫出完整推導過程。' },
  ] },
  { question_type: 'short_answer', points: 30, question_content: `請證明 $$${tall}$$ 並說明。` },
];
const quiz = { id: 'mobile_fixture', version: 1, name: longTitle, file: 'questions/mobile_fixture.json', time_limit_minutes: 100, topic: '113北模與非常長的主題名稱', description: `說明 $${tall}$\n\n下一段文字。\n\n$$${long}$$` };
const meta = { ...quiz, quiz_id: quiz.id, quiz_version: 1, title: quiz.name, total_points: 100, is_active: true, assigned_count: 1, assigned_accounts: ['student'], scheduled_count: 1 };
const keys = questions.map((question, index) => ({ q_index: index, type: question.question_type, points: question.points, correct_index: 0, correct_indices: [0, 1], explanation: quiz.description, subs: question.group_questions?.map((part) => ({ type: part.question_type, points: part.points, correct_indices: [0], pending: part.question_type === 'short_answer' })) }));
const attempt = { attempt_id: 'mobile_attempt', account: 'student', display_name: '測試學生姓名', quiz_id: quiz.id, quiz_version: 1, score: null, max_score: 100, server_received_at: '2026-09-10T01:00:00Z', duration_sec: 180, grading_status: 'pending' };
const users = [{ account: 'student', display_name: '測試學生名稱很長的情況', role: 'student', is_active: true }];
const errors = [];
const reports = [];

async function createPage(width, role = 'admin', dark = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 1 });
  await context.addInitScript(({ role, quiz, dark }) => {
    localStorage.setItem('hw.session', JSON.stringify({ token: 'local-test-only', account: role, display_name: '手機排版測試使用者長名字', role, quizzes: [quiz], expires_at: '2099-01-01T00:00:00Z' }));
    localStorage.setItem('hw.sidebar', '1');
    localStorage.setItem('hw.theme', dark ? 'dark' : 'light');
  }, { role, quiz, dark });
  await context.route((url) => url.pathname === '/api', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(url.origin, new URL(base).origin);
    const payload = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : Object.fromEntries(url.searchParams);
    const replies = {
      admin_list_quizzes: { items: [meta, { ...meta, quiz_id: 'other', title: '另一份測驗', topic: '其他主題' }], drafts: [{ draft_id: 'local-draft', source_quiz_id: '', source_quiz_version: 1, quiz_id: 'draft', quiz_version: 1, title: '尚未完成的考卷', topic: quiz.topic, time_limit_value: '' }] },
      admin_quiz_detail: { meta, keys, assignments: [] },
      admin_list_users: { items: users },
      admin_results: { items: [attempt] },
      history_list: { items: [attempt] },
      history_detail: { attempt: { ...attempt, answers: questions.map((_, q_index) => ({ q_index, short_text: `我的解答 $${tall}$\n\n下一段文字。`, group_answers: [{ selected_indices: [0] }, { short_text: `答案 $${tall}$。` }] })) }, quiz_meta: { ...meta }, keys },
      list_quizzes: { items: [quiz] },
      profile_status: { mail_enabled: true, email_verified: true, email: 'test@example.test', binding_count: 1 },
      unread_status: { qa_unread: 2, posts_unread: 1 },
      start_quiz: { started_at: new Date().toISOString(), question_points: keys },
      get_draft: { draft: null },
      save_draft: {},
    };
    await route.fulfill({ json: { ok: true, server_time: new Date().toISOString(), ...(replies[payload.action] || {}) } });
  });
  await context.route('**/questions/mobile_fixture.json*', (route) => route.fulfill({ json: questions }));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', (dialog) => dialog.dismiss());
  return { context, page };
}

async function checkLayout(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => ({
    width: innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clippedControls: [...document.querySelectorAll('button,input,select,textarea')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.height && (rect.right > innerWidth + 1 || rect.left < -1) && !element.closest('aside') && !element.closest('table.md\\:table');
    }).map((element) => element.getAttribute('aria-label') || element.textContent?.slice(0, 50)),
  }));
  if (result.scrollWidth > page.viewportSize().width + 1) {
    console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 15).map((element) => ({ tag: element.tagName, cls: element.getAttribute('class'), right: element.getBoundingClientRect().right, position: getComputedStyle(element).position, overflow: getComputedStyle(element).overflow }))));
  }
  assert(result.scrollWidth <= page.viewportSize().width + 1, `${label}: page overflows ${JSON.stringify(result)}`);
  assert.equal(result.clippedControls.length, 0, `${label}: off-screen controls ${JSON.stringify(result)}`);
  reports.push({ label, ...result });
  console.log(`PASS ${label}`);
}

async function checkMath(page) {
  await page.locator('.katex').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
    const next = document.querySelector('[data-testid="next-line"]');
    const formula = next?.parentElement?.querySelector('.inline-math-spacing');
    const inline = [...document.querySelectorAll('.inline-math-spacing')];
    const clippedGlyphs = [...document.querySelectorAll('.inline-math-spacing, .display-math-scroll')].flatMap((element) => {
      const box = element.getBoundingClientRect();
      const walker = document.createTreeWalker(element.querySelector('.katex-html'), NodeFilter.SHOW_TEXT);
      const clipped = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.replace(/[\s\u200b]/g, '')) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        const rect = range.getBoundingClientRect();
        if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1) clipped.push({ text: walker.currentNode.textContent, top: rect.top - box.top, bottom: rect.bottom - box.bottom });
      }
      return clipped;
    });
    return {
      nextTop: next?.getBoundingClientRect().top,
      formulaBottom: formula?.getBoundingClientRect().bottom,
      tallHeight: formula?.getBoundingClientRect().height,
      scrollable: inline.filter((element) => element.scrollWidth > element.clientWidth + 1).length,
      clippedGlyphs,
      errors: document.querySelectorAll('.katex-error').length,
    };
  });
  assert(geometry.tallHeight > 40, 'The nested fractions must actually render');
  assert(geometry.formulaBottom <= geometry.nextTop + 1, `Formula overlaps next line: ${JSON.stringify(geometry)}`);
  assert(geometry.scrollable > 0, 'Long formula should scroll locally');
  assert.deepEqual(geometry.clippedGlyphs, [], `Formula glyphs clipped: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.errors, 0, 'KaTeX errors');
  const scrolled = await page.evaluate(() => {
    const element = [...document.querySelectorAll('.inline-math-spacing')].find((item) => item.scrollWidth > item.clientWidth + 1);
    element.scrollLeft = 100;
    const moved = element.scrollLeft > 0;
    element.scrollLeft = 0;
    return moved;
  });
  assert(scrolled, 'Long equations must be scrollable to reveal the remaining content');
  reports.push({ label: 'math-geometry', ...geometry });
}

try {
  for (const width of option('widths', '320,390,768,1280').split(',').map(Number)) {
    if (option('only', '') !== 'quiz') {
    const { context, page } = await createPage(width, 'admin', width === 390);
    await page.goto(`${base}/#/admin`);
    await page.getByRole('button', { name: '複製考卷', exact: true }).first().waitFor();
    await checkLayout(page, `admin-${width}`);
    await page.screenshot({ path: `${output}/admin-${width}.png`, fullPage: true });
    if (width < 1024) {
      const mainBefore = await page.locator('main').boundingBox();
      await page.getByRole('button', { name: '開啟選單', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      const mainAfter = await page.locator('main').boundingBox();
      assert.equal(mainBefore.width, mainAfter.width, 'Opening the mobile menu must not squeeze content');
      await page.getByRole('dialog').getByRole('button', { name: '題目管理', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '派遣正式版給學生', exact: true }).first().click();
      await page.getByText('定時派遣', { exact: true }).click();
      await page.getByText('設定截止時間', { exact: true }).click();
      await checkLayout(page, `assign-${width}`);
      await page.getByRole('button', { name: '儲存派遣', exact: true }).scrollIntoViewIfNeeded();
      assert(await page.getByRole('button', { name: '儲存派遣', exact: true }).isVisible());
      await page.getByRole('button', { name: '取消', exact: true }).click();
    }
    await page.goto(`${base}/#/admin/editor/mobile_fixture/1`);
    await page.getByRole('button', { name: '發佈考卷', exact: true }).waitFor();
    await checkLayout(page, `editor-${width}`);
    await page.getByRole('button', { name: '預覽', exact: true }).click();
    await page.locator('.katex').first().waitFor();
    await checkLayout(page, `editor-preview-${width}`);
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
    await page.goto(`${base}/#/admin/results`);
    await page.getByText('待批改', { exact: true }).filter({ visible: true }).first().waitFor();
    await checkLayout(page, `results-${width}`);
    if (width < 768) {
      await page.getByRole('button', { name: /測試學生姓名.*待批改/ }).click();
      await page.getByText('本題人工評分', { exact: true }).first().waitFor();
      await checkLayout(page, `grading-${width}`);
      await page.screenshot({ path: `${output}/grading-${width}.png`, fullPage: true });
    }
    await page.goto(`${base}/#/admin/users`);
    await page.getByRole('button', { name: '編輯帳號', exact: true }).waitFor();
    await checkLayout(page, `users-${width}`);
    if (width < 768) {
      await page.getByRole('button', { name: '編輯帳號', exact: true }).click();
      await checkLayout(page, `edit-user-${width}`);
    }
    await page.goto(`${base}/#/settings`);
    await page.getByRole('button', { name: '更換信箱', exact: true }).waitFor();
    await checkLayout(page, `settings-${width}`);
    await page.getByRole('button', { name: '更換信箱', exact: true }).click();
    await checkLayout(page, `email-${width}`);
    await context.close();
    }
    const student = await createPage(width, 'student', width === 390);
    await student.page.goto(`${base}/#/`);
    await student.page.getByRole('button', { name: '查看', exact: true }).waitFor();
    await checkLayout(student.page, `home-${width}`);
    await student.page.getByRole('button', { name: '查看', exact: true }).click();
    await student.page.getByRole('button', { name: '開始作答', exact: true }).waitFor();
    await checkLayout(student.page, `quiz-info-${width}`);
    await student.page.getByRole('button', { name: '開始作答', exact: true }).click();
    await student.page.locator('[data-testid="next-line"]').waitFor();
    await student.page.screenshot({ path: `${output}/quiz-${width}.png`, fullPage: true });
    await checkMath(student.page);
    await checkLayout(student.page, `quiz-${width}`);
    await student.page.screenshot({ path: `${output}/quiz-${width}.png`, fullPage: true });
    await student.page.getByRole('button', { name: '作答說明', exact: true }).click();
    await student.page.getByText('題型說明', { exact: true }).waitFor();
    await checkLayout(student.page, `help-${width}`);
    await student.page.getByRole('button', { name: '關閉作答說明', exact: true }).click();
    await student.page.getByRole('button', { name: '下一題', exact: true }).click();
    await student.page.locator('.cloze-blank-marker').first().waitFor();
    await checkLayout(student.page, `cloze-${width}`);
    await student.page.screenshot({ path: `${output}/cloze-${width}.png`, fullPage: true });
    await student.page.getByRole('button', { name: '下一題', exact: true }).click();
    await checkLayout(student.page, `group-${width}`);
    await student.page.getByRole('button', { name: /\(2\).*20分/ }).click();
    await student.page.locator('textarea').fill(`解答 $${tall}$\n\n下一行\n\n$$${long}$$`);
    await student.page.getByRole('button', { name: '預覽', exact: true }).click();
    await checkLayout(student.page, `short-answer-${width}`);
    if (width < 640) {
      await student.page.getByRole('combobox', { name: '跳至題目' }).selectOption('0');
      await student.page.locator('[data-testid="next-line"]').waitFor();
    }
    await student.context.close();
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, checks: reports, errors }, null, 2));
  console.log(`Passed ${reports.length} checks. Screenshots and report: ${output}`);
} finally {
  await browser.close();
}
