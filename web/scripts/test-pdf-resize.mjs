import assert from 'node:assert/strict';
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium, webkit } = await import(option('playwright', 'playwright'));
const base = option('url', 'http://127.0.0.1:5175');
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = option('engine', 'chromium');
const browser = engine === 'webkit' ? await webkit.launch({ executablePath: option('executable', undefined) }) : await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error(e.message); });
// Exercise the real viewer and browser layout with a deterministic, delayed PDF
// renderer, so failed tests cannot be attributed to a CDN or PDF download.
await page.route('**/__pdf_resize_test', (route) => route.fulfill({ contentType: 'text/html', body: `
<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div>
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
const { default: React } = await import('/node_modules/.vite/deps/react.js');
const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
await import('/src/index.css');
const { default: PdfViewer } = await import('/src/components/PdfViewer.tsx');
window.renders = 0;
window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage: async () => ({
  getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
  render: ({ canvasContext, viewport }) => {
    window.renders++;
    let timer, reject;
    const promise = new Promise((resolve, fail) => {
      reject = fail;
      timer = setTimeout(() => { canvasContext.fillStyle = 'white'; canvasContext.fillRect(0, 0, viewport.width, viewport.height); resolve(); }, 25);
    });
    return { promise, cancel: () => { clearTimeout(timer); reject(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })); } };
  }
}) }) }) };
const root = createRoot(document.getElementById('root'));
window.showCase = (region, width = 600, height = 700) => root.render(React.createElement('div', { style: { width, height } }, React.createElement(PdfViewer, { url: 'fixture.pdf', region, focusKey: JSON.stringify(region), className: 'h-full' })));
window.showCase({ page: 1, x: 0, y: 0, width: 1, height: 1 });
</script></body></html>` }));
try {
  await page.goto(`${base}/__pdf_resize_test`);
  await page.waitForFunction(() => window.showCase);
  // Force non-overlay scrollbars even on macOS test hosts.
  await page.addStyleTag({ content: '::-webkit-scrollbar { width: 16px; height: 16px; } ::-webkit-scrollbar-thumb { background: #888; }' });
  await page.waitForTimeout(200);
  const critical = await page.evaluate(() => {
    const scroller = document.querySelector('[data-pdf-page]').parentElement;
    const scaleAtHorizontalEdge = (scroller.offsetWidth - 16 - 24) / 600;
    return { page: 1, x: 0, y: 0, width: .5, height: (scroller.offsetHeight - 48 - 8) / (800 * scaleAtHorizontalEdge) };
  });
  await page.evaluate((region) => window.showCase(region), critical);
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => window.renders);
  await page.waitForTimeout(400);
  const last = await page.evaluate(() => ({ renders: window.renders, visible: getComputedStyle(document.querySelector('[data-pdf-page]')).visibility }));
  assert(first === last.renders && last.visible === 'visible', `scrollbar threshold does not settle: ${JSON.stringify({ critical, first, last })}`);
  const fractions = [.04, .5, .9, .94, .95, .96, .97, .98, 1];
  let cases = 0;
  for (const width of [360, 600]) {
    for (const fraction of fractions) {
      for (const heightFraction of [.1, .9, .96, 1]) {
        const region = { page: 1, x: 0, y: 0, width: fraction, height: heightFraction };
        await page.evaluate(({ region, width }) => window.showCase(region, width, 700), { region, width });
        await page.waitForTimeout(180);
        const before = await page.evaluate(() => window.renders);
        await page.waitForTimeout(180);
        const result = await page.evaluate(() => {
          const sheet = document.querySelector('[data-pdf-page]');
          return { renders: window.renders, visible: getComputedStyle(sheet).visibility, width: sheet.parentElement.clientWidth, height: sheet.parentElement.clientHeight, scale: document.querySelector('canvas').style.width };
        });
        assert(result.visible === 'visible' && result.renders === before, `unstable ${engine}: ${JSON.stringify({ width, region, before, result })}`);
        cases++;
      }
    }
  }
  const resizeRegion = { page: 1, x: .1, y: .3, width: .7, height: .2 };
  await page.evaluate((region) => window.showCase(region, 600, 700), resizeRegion);
  await page.waitForTimeout(200);
  const wide = await page.locator('canvas').evaluate((el) => parseFloat(el.style.width));
  // Same question, only the external container changes size.
  await page.evaluate((region) => window.showCase(region, 360, 700), resizeRegion);
  await page.waitForTimeout(200);
  const narrow = await page.locator('canvas').evaluate((el) => parseFloat(el.style.width));
  assert(narrow < wide, 'real container resize still updates focus scale');
  await page.getByRole('button', { name: '放大 PDF', exact: true }).click();
  await page.waitForTimeout(200);
  const zoomed = await page.locator('canvas').evaluate((el) => parseFloat(el.style.width));
  const afterZoom = await page.evaluate(() => window.renders);
  await page.waitForTimeout(300);
  assert(zoomed > narrow, 'manual zoom is applied');
  assert.equal(await page.evaluate(() => window.renders), afterZoom, 'scrollbars must not reset manual zoom');
  console.log(`PASS ${engine}: scrollbar threshold, ${cases} region/viewport combinations, container resize and manual zoom`);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
