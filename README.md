# COOL

COOL 是提供教師出題、派遣與批改，以及學生線上作答的數學測驗平台。

## 技術架構

- 前端：TypeScript、React、Vite、Tailwind CSS 與 Radix UI，採用單頁應用程式架構，支援手機與電腦。
- 後端：JavaScript、Node.js 22 與 Firebase Cloud Functions，透過 HTTP API 處理帳號、考卷、作答與評分。
- 雲端服務：Firebase Hosting、Cloud Firestore 與 Cloud Storage；KaTeX 渲染數學公式，排程函式處理逾時交卷。

## 功能

- 支援單選、多選、填充、簡答與混合題組，以及 LaTeX、圖片和 PDF 題本。
- 考卷依主題分類，支援草稿、複製、題目預覽、配分工具與單份題目匯入。
- 支援定時開放、作答次數限制、截止時間、自動儲存與限時自動交卷。
- 整合自動評分、人工批改、成績紀錄、詳解、題目提問與通知。
- 圖片以 SHA-256 比對內容，提供重用與同名圖片處理流程。

## 專案結構

```text
web/                 React 前端與 UI 測試
functions/           Firebase API、排程與維運腳本
questions/           題目 JSON 與題目圖片
scripts/             單份題目匯入工具
firebase.json        Hosting 與 Functions 配置
firestore.rules      Firestore 存取規則
firestore.indexes.json
DEPLOY.md            部署與維護說明
TO-DO.md             開發待辦
```

## 開發與部署

需要 Node.js 22，以及已登入的 Firebase CLI。

```bash
cd web
npm ci
npm run dev
```

Vite 提供前端開發伺服器。完整登入、作答與資料操作需要可用的 Firebase 後端；開發伺服器目前未配置 `/api` 代理。

```bash
cd functions
npm ci
```

`.firebaserc` 保存 Firebase 專案別名，部署到自己的環境前請先確認目標專案。郵件通知的設定名稱可參考 `functions/.env.example`，實際設定放在本機的 `functions/.env`。

從專案根目錄建置與部署：

```bash
npm --prefix web run build
firebase deploy
```

詳細流程與維運指令見 [DEPLOY.md](DEPLOY.md)。

## 檢查

```bash
npm --prefix web run build
npm --prefix web run lint
node --check functions/index.js
node --test web/scripts/test-quiz-copy.mjs
node --test functions/scripts/test-copy-pdf.cjs
```

`web/scripts/test-mobile-ui.mjs` 使用 Playwright 與模擬 API 資料驗證響應式排版，需另行準備 Playwright 和測試瀏覽器。

本 repository 包含目前系統的原始碼，不包含歷史 legacy 原始碼、套件安裝目錄、編譯產物、帳號資料庫、環境密鑰或服務帳戶憑證。
