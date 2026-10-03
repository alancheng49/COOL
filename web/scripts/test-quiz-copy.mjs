import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual TypeScript conversion code without a browser or Firebase writes.
const loaded = new Map();
function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (path) => load(path.replace('./', '')) });
  loaded.set(name, exports);
  return exports;
}
const { publishedQuizCopy, draftQuizCopy } = load('quiz-copy');
const { toQuestion } = load('quiz-editor');
const plain = (value) => JSON.parse(JSON.stringify(value));
const image = 'questions/images/uploads/shared.png';

function fixture() {
  return {
    meta: { quiz_id: 'exam', title: 'Exam', topic: 'Topic', description: 'Instructions', time_limit_minutes: 30, pdf_mode: true, pdf_url: 'https://example.test/exam.pdf', pdf_path: 'pdfs/exam.pdf', file: 'questions/exam.json' },
    assignments: [{ account: 'student' }],
    questions: [
      { question_type: 'choice', display_type: 'image', question_content: image, options: ['a', 'b'], option_images: [image, null], answer: 'a' },
      { question_type: 'multi', question_content: 'Multi', options: ['a', 'b', 'c'], correct_answer_indices: [0] },
      { question_type: 'cloze', question_content: 'Cloze', cloze_template: '(1)', cloze_options: [['0', '1']], cloze_answer_indices: [0] },
      { question_type: 'short_answer', question_content: 'Explain', question_image: image },
      { question_type: 'group', question_content: 'Group', group_questions: [
        { question_type: 'choice', question_content: 'Part', options: ['a', 'b'], option_images: [image, null] },
        { question_type: 'cloze', cloze_template: '(1)', cloze_options: [['0', '1']] },
        { question_type: 'short_answer', question_content: 'Why', question_image: image },
      ] },
    ],
    keys: [
      { q_index: 0, type: 'choice', points: 4, correct: 1, explanation: 'Solution' },
      { q_index: 1, type: 'multi', points: 5, correct_indices: [0, 2] },
      { q_index: 2, type: 'cloze', points: 6, correct_indices: [1] },
      { q_index: 3, type: 'short_answer', points: 7 },
      { q_index: 4, type: 'group', points: 10, subs: [
        { type: 'choice', points: 3, correct: 1 },
        { type: 'cloze', points: 2.5, correct_indices: [1] },
        { type: 'short_answer', points: 4.5 },
      ] },
    ],
  };
}

test('published copies have independent identity and retain settings without assignments', () => {
  const source = fixture();
  const before = JSON.stringify(source);
  const copy = publishedQuizCopy(source, '123');
  assert.equal(copy.quiz_id, 'exam_copy_123');
  assert.equal(copy.quiz_version, 1);
  assert.equal(copy.source_quiz_id, '');
  assert.equal(copy.source_file, '');
  assert.notEqual(copy.file, source.meta.file);
  assert.equal(copy.topic, 'Topic');
  assert.equal(copy.description, 'Instructions');
  assert.equal(copy.time_limit_value, '30');
  assert.equal(copy.pdf_path, source.meta.pdf_path);
  assert.equal(copy.total_points, 32);
  assert.equal('assignments' in copy, false);
  const editor = JSON.parse(copy.editor_json);
  editor[0].options[0] = 'Changed';
  assert.equal(JSON.stringify(source), before);
});

test('all question types retain authoritative answers, scores, explanations and images', () => {
  const editor = JSON.parse(publishedQuizCopy(fixture(), '123').editor_json);
  const questions = plain(editor.map(toQuestion));
  assert.equal(questions[0].question_image, image);
  assert.equal(questions[0].question_content, '');
  assert.equal(questions[0].answer, 'b');
  assert.equal(questions[0].option_images[0], image);
  assert.equal(editor[0].explanation, 'Solution');
  assert.deepEqual(questions[1].correct_answer_indices, [0, 2]);
  assert.deepEqual(questions[2].cloze_answer_indices, [1]);
  assert.equal(questions[3].question_image, image);
  assert.equal(questions[4].group_questions[0].answer, 'b');
  assert.equal(questions[4].group_questions[0].option_images[0], image);
  assert.deepEqual(questions[4].group_questions[1].cloze_answer_indices, [1]);
  assert.equal(questions[4].group_questions[2].points, 4.5);
  assert.equal(questions[4].group_questions[2].question_image, image);
});

test('wrapped legacy JSON and nested cloze preserve subquestion scoring', () => {
  const source = fixture();
  source.questions = { questions: [{ question_type: 'cloze', sub_questions: [{ content: 'Part', points: 99, cloze_template: '(1)', cloze_options: [['a', 'b']] }] }] };
  source.keys = [{ q_index: 0, points: 2.5, subs: [{ points: 2.5, correct_indices: [1] }] }];
  const editor = JSON.parse(publishedQuizCopy(source, '123').editor_json);
  assert.equal(editor[0].points, 2.5);
  assert.equal(editor[0].group_parts[0].blanks[0].correct, 1);
});

test('unfinished drafts are copied verbatim and detached from their original published quiz', () => {
  const draft = { draft_id: 'old', quiz_id: 'exam', title: 'Draft', source_quiz_id: 'original', source_file: 'questions/original.json', file: 'questions/original.json', time_limit_value: '', editor: [{ question_type: 'choice', options: [''], points: 0, question_image: image }] };
  const copy = draftQuizCopy(draft, '123');
  assert.deepEqual(JSON.parse(copy.editor_json), draft.editor);
  assert.equal('draft_id' in copy, false);
  assert.equal(copy.source_quiz_id, '');
  assert.notEqual(copy.file, draft.file);
});

test('unreadable published questions and incomplete answer keys fail before saving a copy', () => {
  assert.throws(() => publishedQuizCopy({ ...fixture(), questions: null }, '123'));
  assert.throws(() => publishedQuizCopy({ ...fixture(), keys: [] }, '123'));
});
