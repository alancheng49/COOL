const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../index.js'), 'utf8');
const start = source.indexOf('async function adminDeleteQuiz(payload) {');
const end = source.indexOf('\n// ===== Admin:', start);
assert.ok(start >= 0 && end > start);

async function deleteOriginal({ publishedUses, draftUses }) {
  let deleted = false;
  let draftChecked = false;
  const batch = { delete() {}, async commit() {} };
  const db = {
    batch: () => batch,
    collection(name) {
      const query = {
        doc() { return query; },
        where(field, operator, value) {
          if (name === 'quiz_drafts') {
            assert.equal(field, 'pdf_path');
            assert.equal(operator, '==');
            assert.equal(value, 'pdfs/shared.pdf');
            draftChecked = true;
          }
          return query;
        },
        limit() { return query; },
        async get() {
          return {
            exists: true,
            empty: name === 'quiz_drafts' ? !draftUses : !publishedUses,
            docs: [],
            size: 0,
            data: () => ({ file: 'questions/original.json', pdf_path: 'pdfs/shared.pdf' }),
          };
        },
      };
      return query;
    },
  };
  const context = {
    db, console,
    quizDocId: () => 'original_v1',
    questionDocId: (path) => path,
    admin: { storage: () => ({ bucket: () => ({ file: () => ({ delete: async () => { deleted = true; } }) }) }) },
  };
  const remove = vm.runInNewContext(`${source.slice(start, end)}\nadminDeleteQuiz`, context);
  const result = await remove({ quiz_id: 'original', quiz_version: 1, delete_file: true });
  return { deleted, result, draftChecked };
}

test('deleting original preserves PDF used only by a copied draft', async () => {
  const { deleted, result, draftChecked } = await deleteOriginal({ publishedUses: false, draftUses: true });
  assert.equal(draftChecked, true);
  assert.equal(deleted, false);
  assert.equal(result.pdf_deleted, false);
});

test('deleting original preserves PDF used by another published quiz', async () => {
  assert.equal((await deleteOriginal({ publishedUses: true, draftUses: false })).deleted, false);
});

test('PDF cleanup still works when neither drafts nor published quizzes use it', async () => {
  const { deleted, result } = await deleteOriginal({ publishedUses: false, draftUses: false });
  assert.equal(deleted, true);
  assert.equal(result.pdf_deleted, true);
});
