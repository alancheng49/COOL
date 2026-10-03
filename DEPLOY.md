# 部署與維護指南

## 架構(2026-07 改版後)

- **前端**:React SPA(原始碼在 `/web`,建置產物在 `/web/dist`),由 Firebase Hosting 提供
- **後端**:Cloud Functions(`/functions/index.js`,Node.js 22,region `asia-east1`)
- **資料**:Firestore(users / quizzes / answer_keys / assignments / attempts / bests / questions / images / drafts / quiz_drafts / sessions),題目圖片本體存 Cloud Storage
- 此 repository 僅包含目前系統,歷史 legacy 原始碼未納入

Hosting rewrite:`/api`、`/questions/*.json` 與 `/questions/images/**` 導到 Functions,其餘路徑回 `index.html`(SPA)。專案內建的靜態題圖仍會隨 Hosting 部署。

## 部署

```bash
# 後端 + 前端 + 規則一次部署(在專案根目錄)
firebase deploy
```

若改了前端原始碼(/web/src),先重新建置再部署:

```bash
cd web
npm install        # 第一次需要
npm run build      # 產出 web/dist(會自動複製 questions/images)
cd ..
firebase deploy --only hosting
```

只改後端:`firebase deploy --only functions`。

## 權限與功能總覽

**admin**(管理員,登入後進管理介面)
- 題目管理:所有測驗(含未啟用)列表、啟用/停用、編輯、刪除(連 keys 與派遣一併刪)
- 複製考卷:操作欄雙頁圖示會建立獨立草稿並開啟編輯器；有草稿時複製草稿，否則複製正式版。副本使用新識別碼和題目檔案，保留主題、說明、配分、詳解及限時，不複製派遣與成績。圖片/PDF 共用既有資產；副本需要不同圖片時選「兩者皆保留」，不要使用會更新所有引用的「取代既有圖片」。PDF 被其他正式考卷或草稿使用時不會隨原考卷刪除。
- 新增題目:網頁編輯器,支援單選/填充、LaTeX、附圖、配分、限時,儲存即生效
- 圖片上傳:編輯器「上傳圖片」按鈕直接上傳(前端自動壓縮至 ≤1200px/≤850KB,圖片本體存 Cloud Storage,Firestore 保存 SHA-256、檔名與路徑等 metadata,經 `/questions/images/**` 供圖,不需重新部署)。相同內容會提示重用；同名異圖可選擇使用既有、取代或兩者皆保留。舊版 Firestore Base64 圖片會繼續正常顯示，首次使用新版上傳器時自動補齊索引資料。
- 派遣:對每份測驗勾選學生(可全選)、設定作答次數上限與截止時間
- 成績總覽:全部學生每次作答、依測驗/學生篩選、點列看每題詳情、匯出 CSV
- 帳號管理:新增帳號、重設密碼、停用/啟用

**student**(學生)
- 只看得到「已派遣且啟用中」的測驗(ENFORCE_ASSIGNMENTS=true)
- 限時測驗有倒數計時,時間到自動交卷;超過截止時間/次數上限無法作答
- 作答過程自動存草稿(Firestore),中離再進入可續答(剩餘時間重新計算)
- 交卷後立即看到伺服端計分與每題檢討;「作答紀錄」可回顧每份測驗
- 題目 JSON 由伺服器動態提供並**剝除正解欄位**,無法從原始檔看到答案

## 常用維運

- 建帳號(網頁):管理介面 → 帳號管理。(腳本備用:`cd functions && node scripts/create-user.js <帳號> <密碼> <名稱> <角色>`)
- 匯入舊資料:見 `functions/scripts/import-sheets.js` / `import-questions.js` 開頭註解
- 行為開關:`functions/index.js` 的 `CONFIG`(ENFORCE_ASSIGNMENTS、時限誤差、session 效期等),改完 `firebase deploy --only functions`
- Firestore 索引:`firestore.indexes.json`,首次部署後若查詢報錯提示缺索引,依錯誤訊息連結建立即可

## 疑難排解

- 學生登入後看不到測驗:確認該測驗「啟用中」且已派遣給該學生
- 交卷回 `TIME_LIMIT_EXCEEDED`:超過限時(含 10 秒寬限)
- `UNAUTHENTICATED`:session 逾期(12 小時),重新登入
- 題目載入失敗:題目檔不在 Firestore(用編輯器重存,或跑 import-questions.js)
