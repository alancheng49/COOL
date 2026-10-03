/**
 * 建立/更新單一使用者(密碼會 bcrypt 雜湊)。
 *
 * 在 functions/ 目錄執行:
 *   node scripts/create-user.js <account> <password> [display_name] [role]
 * 例:
 *   node scripts/create-user.js teacher01 s3cret 王老師 admin
 */

const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const [account, password, display_name, role] = process.argv.slice(2);
if (!account || !password) {
  console.error('用法: node scripts/create-user.js <account> <password> [display_name] [role]');
  process.exit(1);
}

(async () => {
  await db.collection('users').doc(account).set(
    {
      password_hash: bcrypt.hashSync(password, 10),
      display_name: display_name || account,
      role: role || 'student',
      is_active: true,
    },
    { merge: true }
  );
  console.log(`✅ 使用者 ${account}(${role || 'student'})已建立/更新`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
