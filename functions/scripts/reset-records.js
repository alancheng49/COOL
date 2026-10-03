/**
 * 清空所有作答相關紀錄（attempts / bests / drafts），題目、帳號、派遣不受影響。
 * 用於測試階段結束、正式啟用前歸零。
 *
 * 在 functions/ 目錄執行：
 *   GCLOUD_PROJECT=cool-sys node scripts/reset-records.js           # 只會列出將刪除的數量（乾跑）
 *   GCLOUD_PROJECT=cool-sys node scripts/reset-records.js --yes     # 真正刪除
 *
 * 認證同其他腳本：先 `gcloud auth application-default login`，
 * 或 GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json。
 */

const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const TARGETS = ['attempts', 'bests', 'drafts'];
const confirmed = process.argv.includes('--yes');

async function wipe(name) {
  const snap = await db.collection(name).get();
  console.log(`${name}: ${snap.size} 筆`);
  if (!confirmed || snap.empty) return;
  // 分批刪除（batch 上限 500）
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  ✅ 已清空 ${name}`);
}

(async () => {
  for (const name of TARGETS) await wipe(name);
  if (!confirmed) {
    console.log('\n以上為乾跑結果，確認無誤後加上 --yes 執行真正刪除：');
    console.log('  GCLOUD_PROJECT=cool-sys node scripts/reset-records.js --yes');
  } else {
    console.log('\n全部完成 🎉 作答紀錄已歸零。');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
