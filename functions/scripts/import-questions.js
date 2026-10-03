/**
 * 把本地 questions/*.json 題目檔匯入 Firestore 的 questions collection。
 *
 * 在 functions/ 目錄執行:
 *   node scripts/import-questions.js ../questions
 *
 * 認證方式同 import-sheets.js(emulator 或 application-default credentials)。
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const dir = process.argv[2] || path.join(__dirname, '..', '..', 'questions');
const questionDocId = (p) => encodeURIComponent(String(p)).replace(/\./g, '%2E');

(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      JSON.parse(content);
    } catch {
      console.warn(`⚠️ 跳過 ${f}(不是合法 JSON)`);
      continue;
    }
    const p = `questions/${f}`;
    await db.collection('questions').doc(questionDocId(p)).set({
      path: p,
      content,
      updated_at: new Date().toISOString(),
    });
    console.log(`✅ ${p}`);
  }
  console.log(`完成,共 ${files.length} 個檔案。`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
