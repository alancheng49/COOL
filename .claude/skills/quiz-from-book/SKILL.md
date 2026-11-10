---
name: quiz-from-book
description: 把題本、考卷、講義（電子檔 PDF、掃描檔或照片）轉成 COOL 線上考卷的匯入 zip，內含 quiz_id.json 與裁切好的 images/。會抓出題型、題目內容、選項、答案、配分和需要裁切的圖片。當使用者提到題本轉考卷、題目轉 JSON、產生考卷 zip、把 PDF 匯入 COOL，或上傳題本要建立考卷時使用。
---

# 題本轉 COOL 考卷

產出一個可在 COOL 後台「匯入題本 zip」上傳的檔案：

```
<quiz_id>.zip
├── <quiz_id>.json
└── images/
```

動手寫 draft 前，先讀 [references/schema.md](references/schema.md)。

原則：**模型負責看懂內容，索引、選項表和打包交給腳本**。不要手寫 zip，也不要手算選項索引。答案和配分會影響學生成績，寧可標記待確認，也不要默默猜。

## 流程

工作目錄下建立 `pages/`、`images/`、`draft.json`、`crops.json`。`scripts/` 指本 skill 資料夾內的腳本。

### 1. 確認範圍與考卷資訊

確認要轉換的頁碼。標題、主題、類型（`exam`／`homework`）、限時能從題本推斷就推斷，推斷不了才問使用者。

**`quiz_id` 一律由模型先取好，不要反問使用者**（使用者已指定時除外）。規則：

- 只用小寫英文、數字、底線，格式為 `<來源>_<學期或年份>_<範圍>_<主題>`，例如 `yongchun_113a_mid2_line_circle`（永春高中 113 上第二次期中考，直線與圓）。
- 從題本的標題、檔名、頁首取得來源與主題；資訊不足時省略該段，至少保留主題，例如 `line_circle_practice`。
- 開始處理時就在訊息中告知取好的 `quiz_id`；最後回報時再列一次，使用者可要求更改。
- 後台若回 `QUIZ_ID_EXISTS` 或 `QUESTION_FILE_EXISTS`，在結尾加 `_2`、`_3` 重新打包。

順便留意使用者是否要求缺答案時改放佔位答案，或指定了總分。

### 2. 渲染頁面

```bash
python3 scripts/render_pages.py 題本.pdf --out pages --pages 1-12
```

缺套件時執行 `pip install pymupdf pillow`。**一律以 `page-NNN.png` 為閱讀來源**，因為 PDF 文字層的數學式常常是壞的；有 `page-NNN.txt` 時只用來核對數字。

### 3. 分批抽題

每次讀 2～4 頁，讀完就寫進 `draft.json`，不要等全部讀完才寫。

- 題目跨頁時要接起來；每題用 `source_label` 記原題號與頁碼，例如 `"第 12 題 p.3"`。
- 大題說明（例如「第 3～5 題為題組」）要併進題目內容，不可遺漏。
- 看不清或沒把握的內容，在 `low_confidence` 寫明原因，不要自己補完。
- 寫 JSON 時 LaTeX 的反斜線要跳脫：`"$\\frac{1}{2}$"`。

題型對應見 schema.md。

### 4. 裁切圖片

只裁題目需要的幾何圖、圖表、照片；能用文字或 LaTeX 表達的公式與表格不要裁。

1. 看 `page-NNN.grid.png`，依格線讀出 `[左, 上, 右, 下]`（比例 0～1），寫入 `crops.json`：
   ```json
   [{ "name": "q03_fig1", "page": 3, "bbox": [0.12, 0.40, 0.55, 0.62] }]
   ```
2. 執行 `python3 scripts/crop_images.py crops.json --pages pages --out images`。
3. **逐張打開裁好的圖檢查**。切到圖、混入題目文字或其他題的圖，就調整 bbox 重裁。腳本會去除白邊，所以 bbox 可以略大，但不能框到別的內容。混入淡色背景浮水印時，在該項加 `"remove_watermark": true` 重裁。
4. draft 內引用腳本印出的實際檔名（副檔名可能是 `.jpg`）。

### 5. 配對答案

依題號配對題本的答案區或書末解答，標 `answer_status: "book"`。有解析就精簡後放進 `explanation`（Markdown + LaTeX），沒有就省略。

題本沒有答案時：

- **預設**：自己解題，標 `answer_status: "ai"`。解不出或沒把握就照填最可能的答案，另加 `low_confidence`。
- **使用者要求佔位時**：省略答案欄位，標 `answer_status: "placeholder"`，腳本會填第一個選項。

`short_answer` 由老師批改，不需要答案。

### 6. 配分

- 題本有標示：照標示寫 `points`；每題配分不同時要逐題填。
- 題本沒有標示：不用寫 `points`，打包時加 `--split-points 100`（使用者指定總分時用指定值）。
- 題組的 `points` 必須等於小題加總。

### 7. 驗證與打包

```bash
python3 scripts/build_quiz.py draft.json --images images --out dist --check
```

有錯就全部修好再重跑。通過後，**先對照原頁面逐題核對一次**，重點看：

- 題號有沒有漏或重複，題數是否與題本相符。
- 數字、正負號、次方、分數上下、根號範圍。
- 選項內容與正解是否對應，填充題每一格的答案是否正確。
- **填充題的答案是否唯一**：逐題想有沒有另一組填法也符合模板且數學上正確（同乘倍數、未約分、未化簡根式、解的順序、前導零）。有就依 schema.md 的「答案必須唯一」改模板，並在回報時列出改寫過的題目。
- 圖片是否掛在正確的題目上。

核對完拿掉 `--check` 產生 zip。

### 8. 回報

把 zip 交給使用者（claude.ai 上要提供下載），並列出 `build_quiz.py` 印出的資訊：

- 題數、總分、圖片數，配分是題本標示還是平均分配。
- **AI 推算答案**和**佔位答案**的題號，提醒發布前要逐題確認。
- 低信心題目與原因。

最後說明上傳方式：後台「題目管理 → 匯入題本 zip」。匯入後考卷是未啟用狀態，需在編輯器檢查後再啟用。
