import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (path) => load(path.replace('./', '')) });
  modules.set(name, exports);
  return exports;
}
const { validPdfRegion, fitPdfRegion } = load('pdf-region');
const { fromQuestion, toQuestion, normalizeDraftQuestion } = load('quiz-editor');
const { publishedQuizCopy, draftQuizCopy } = load('quiz-copy');
const plain = (value) => JSON.parse(JSON.stringify(value));
const region = { page: 2, x: .15, y: .4, width: .7, height: .2 };

test('regions survive editing, draft reload, publishing, and quiz copies for every question type', () => {
  for (const type of ['choice', 'multi', 'cloze', 'short_answer', 'group']) {
    const question = { question_type: type, pdf_region: region, options: ['a', 'b'], cloze_options: [['1', '2']], group_questions: [{ question_type: 'short_answer' }] };
    const editor = fromQuestion(question);
    assert.deepEqual(plain(toQuestion(normalizeDraftQuestion(plain(editor))).pdf_region), region);
    const copy = publishedQuizCopy({ meta: { quiz_id: 'pdf', title: 'PDF', pdf_mode: true }, questions: [question], keys: [{ q_index: 0, points: 1 }] }, 'copy');
    assert.deepEqual(JSON.parse(copy.editor_json)[0].pdf_region, region);
    const draftCopy = draftQuizCopy({ quiz_id: 'pdf', title: 'PDF', editor: [editor] }, 'copy');
    assert.deepEqual(JSON.parse(draftCopy.editor_json)[0].pdf_region, region);
  }
});

test('legacy and malformed regions are safely ignored', () => {
  for (const bad of [null, {}, { ...region, page: 0 }, { ...region, page: 1.5 }, { ...region, x: -.1 }, { ...region, width: 0 }, { ...region, height: Infinity }, { ...region, y: .95 }, { ...region, x: '0' }]) {
    assert.equal(validPdfRegion(bad), undefined);
    assert.equal('pdf_region' in toQuestion(fromQuestion({ question_type: 'choice', options: ['a'], pdf_region: bad })), false);
  }
});

test('focus scale fits the entire region on desktop and mobile, including tall regions', () => {
  for (const [width, height] of [[800, 700], [320, 250]]) {
    for (const r of [region, { page: 1, x: 0, y: 0, width: 1, height: 1 }]) {
      const scale = fitPdfRegion(r, 600, 800, width, height);
      assert(scale * 600 * r.width <= width - 48 + 1e-8);
      assert(scale * 800 * r.height <= height - 48 + 1e-8);
    }
  }
});
