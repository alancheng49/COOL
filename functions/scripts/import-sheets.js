/**
 * 把 Google Sheets 匯出的 CSV 匯入 Firestore。
 *
 * 使用方式:
 *   1. 在 Google Sheets 把每個工作表「檔案 → 下載 → CSV」,存到一個資料夾,檔名須為:
 *      users.csv, quizzes.csv, answer_keys.csv, assignments.csv
 *      (attempts.csv, bests.csv 為選擇性,若想保留歷史紀錄也可匯入)
 *   2. 在 functions/ 目錄執行:
 *      node scripts/import-sheets.js <CSV資料夾路徑>
 *
 * 認證(擇一):
 *   - firebase emulators 測試: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/import-sheets.js ./data
 *   - 正式環境: 先 `gcloud auth application-default login`,
 *     或 GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json node scripts/import-sheets.js ./data
 *     並設定 GCLOUD_PROJECT=<你的專案ID>
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node scripts/import-sheets.js <CSV資料夾路徑>');
  process.exit(1);
}

const quizDocId = (q, v) => `${q}_v${Number(v)}`;
const bestDocId = (a, q, v) => `${a}__${q}_v${Number(v)}`;

function readCsv(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return null;
  const rows = parse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  console.log(`讀取 ${name}: ${rows.length} 列`);
  return rows;
}

const isTrue = (v) => String(v).toLowerCase() === 'true';
const numOrNull = (v) => { const n = Number(v); return v === '' || v == null || isNaN(n) ? null : n; };

async function commitAll(writes) {
  // Firestore batch 上限 500
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data);
    await batch.commit();
  }
}

(async () => {
  // users
  const users = readCsv('users.csv');
  if (users) {
    const writes = [];
    for (const r of users) {
      if (!r.account) continue;
      writes.push([
        db.collection('users').doc(String(r.account)),
        {
          password_hash: bcrypt.hashSync(String(r.password ?? ''), 10),
          display_name: r.display_name || String(r.account),
          role: r.role || 'student',
          is_active: isTrue(r.is_active),
        },
      ]);
    }
    await commitAll(writes);
    console.log(`✅ users: ${writes.length}(密碼已 bcrypt 雜湊)`);
  }

  // quizzes
  const quizzes = readCsv('quizzes.csv');
  if (quizzes) {
    const writes = quizzes
      .filter((r) => r.quiz_id)
      .map((r) => [
        db.collection('quizzes').doc(quizDocId(r.quiz_id, r.quiz_version || 1)),
        {
          quiz_id: String(r.quiz_id),
          quiz_version: Number(r.quiz_version || 1),
          title: r.title || String(r.quiz_id),
          total_points: numOrNull(r.total_points) || 0,
          is_active: isTrue(r.is_active),
          file: r.file || '',
          time_limit_minutes: numOrNull(r.time_limit_minutes),
        },
      ]);
    await commitAll(writes);
    console.log(`✅ quizzes: ${writes.length}`);
  }

  // answer_keys → 依 (quiz_id, version) 聚合成一份文件
  const keys = readCsv('answer_keys.csv');
  if (keys) {
    const grouped = new Map();
    for (const r of keys) {
      if (!r.quiz_id) continue;
      const id = quizDocId(r.quiz_id, r.quiz_version || 1);
      if (!grouped.has(id)) {
        grouped.set(id, { quiz_id: String(r.quiz_id), quiz_version: Number(r.quiz_version || 1), keys: [] });
      }
      const type = String(r.question_type || 'choice').toLowerCase();
      const points = numOrNull(r.points) ?? 1;
      const q_index = Number(r.q_index);
      if (type === 'cloze') {
        let arr = [];
        try { arr = JSON.parse(r.correct_indices_json || '[]'); } catch {}
        grouped.get(id).keys.push({ q_index, type: 'cloze', correct_indices: arr, points });
      } else {
        // 相容兩種欄名: correct_option_index / correct_option_i
        const correct = Number(r.correct_option_index ?? r.correct_option_i);
        grouped.get(id).keys.push({ q_index, type: 'choice', correct, points });
      }
    }
    const writes = [...grouped.entries()].map(([id, data]) => [
      db.collection('answer_keys').doc(id),
      { ...data, updated_at: new Date().toISOString() },
    ]);
    await commitAll(writes);
    console.log(`✅ answer_keys: ${writes.length} 份試卷`);
  }

  // assignments
  const asgs = readCsv('assignments.csv');
  if (asgs) {
    const writes = asgs
      .filter((r) => r.account && r.quiz_id)
      .map((r) => [
        db.collection('assignments').doc(`${r.account}__${quizDocId(r.quiz_id, r.quiz_version || 1)}`),
        {
          account: String(r.account),
          quiz_id: String(r.quiz_id),
          quiz_version: Number(r.quiz_version || 1),
          attempt_limit: numOrNull(r.attempt_limit),
          due_at: r.due_at ? new Date(r.due_at).toISOString() : null,
          token: r.token || '',
        },
      ]);
    await commitAll(writes);
    console.log(`✅ assignments: ${writes.length}`);
  }

  // attempts(選擇性)
  const attempts = readCsv('attempts.csv');
  if (attempts) {
    const writes = attempts
      .filter((r) => r.attempt_id)
      .map((r) => [
        db.collection('attempts').doc(String(r.attempt_id)),
        {
          attempt_id: String(r.attempt_id),
          account: String(r.account),
          quiz_id: String(r.quiz_id),
          quiz_version: Number(r.quiz_version || 1),
          score: numOrNull(r.score) || 0,
          max_score: numOrNull(r.max_score) || 0,
          answers_json: r.answers_json || '[]',
          client_started_at: r.client_started_at || '',
          client_submitted_at: r.client_submitted_at || '',
          server_received_at: r.server_received_at || '',
          duration_sec: numOrNull(r.duration_sec),
          user_agent: r.user_agent || '',
          meta: r.meta || '',
        },
      ]);
    await commitAll(writes);
    console.log(`✅ attempts: ${writes.length}`);
  }

  // bests(選擇性)
  const bests = readCsv('bests.csv');
  if (bests) {
    const writes = bests
      .filter((r) => r.account && r.quiz_id)
      .map((r) => [
        db.collection('bests').doc(bestDocId(r.account, r.quiz_id, r.quiz_version || 1)),
        {
          account: String(r.account),
          quiz_id: String(r.quiz_id),
          quiz_version: Number(r.quiz_version || 1),
          best_score: numOrNull(r.best_score) || 0,
          best_max: numOrNull(r.best_max) || 0,
          attempt_id: r.attempt_id || '',
          server_updated_at: r.server_updated_at || '',
        },
      ]);
    await commitAll(writes);
    console.log(`✅ bests: ${writes.length}`);
  }

  console.log('全部完成 🎉');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
