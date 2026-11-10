# draft.json 規格

`draft.json` 由模型撰寫，`build_quiz.py` 會轉成正式的 `<quiz_id>.json`。

```jsonc
{
  "meta": {
    "quiz_id": "circle_1018",      // 必填，文字、數字、底線、連字號，也是 zip 內 JSON 的檔名
    "title": "圓與扇形",            // 必填
    "topic": "圓",                 // 選填，後台分類用
    "description": "",             // 選填
    "kind": "exam",                // exam 或 homework，預設 exam
    "time_limit_minutes": null     // null 表示不限時
  },
  "questions": [ /* 見下方 */ ]
}
```

## 每題共有欄位

| 欄位 | 說明 |
| --- | --- |
| `question_type` | `choice`、`multi`、`cloze`、`short_answer`、`group` |
| `question_content` | 題目文字，數學式用 `$...$`，換行用 `<br>`；中文和全形標點放在算式外，例如 `$L$：$x-y=k$` |
| `question_image` | 選填，`images/<檔名>` |
| `points` | 配分，大於 0；用 `--split-points` 時可省略 |
| `explanation` | 選填，詳解，只能放在整題，不能放在小題 |
| `answer_status` | `book`、`ai`、`placeholder`；`choice`、`multi`、`cloze` 必填，題組寫在各小題 |
| `source_label` | 選填但建議填，原題號與頁碼，只用於回報 |
| `low_confidence` | 選填，沒把握的原因，只用於回報 |
| `display_type` | 省略（預設 `text`）；無法轉錄時才用 `image`，此時 `question_content` 改放圖片路徑 |

## 題型對應

| 題本題型 | `question_type` |
| --- | --- |
| 單選 | `choice` |
| 多選、多重選擇 | `multi` |
| 有明確答案的填充、選填 | `cloze` |
| 計算、證明、作圖、申論（老師批改） | `short_answer` |
| 同一題幹底下的多個小題 | `group` |

## choice

`answer` 必須逐字等於其中一個選項。選項不要包含 `(A)` 這類標號，系統會自己加。

```json
{
  "question_type": "choice",
  "question_content": "點 $A(2,-2)$ 在圓內、圓上或圓外？",
  "options": ["圓內", "圓上", "圓外"],
  "answer": "圓外",
  "answer_status": "book",
  "points": 5,
  "source_label": "第 5 題 p.2"
}
```

選項是圖片時，`options` 留空字串、`option_images` 放路徑，沒有圖的位置放 `null`，長度要與 `options` 相同。腳本會把空選項填成 `(A)`、`(B)`，所以 `answer` 要寫對應的 `(B)`。

```json
{
  "question_type": "choice",
  "question_content": "下列何者為 $y=x^2$ 的圖形？",
  "options": ["", ""],
  "option_images": ["images/q07_a.png", "images/q07_b.png"],
  "answer": "(B)",
  "answer_status": "book",
  "points": 5
}
```

## multi

`multi_answers` 列出所有正解的選項文字。

```json
{
  "question_type": "multi",
  "question_content": "下列哪些是質數？",
  "options": ["2", "4", "7", "9"],
  "multi_answers": ["2", "7"],
  "answer_status": "book",
  "points": 8
}
```

## cloze

學生在每個空格從選項中點選。**每個數字或符號各佔一格**，空格從 `(1)` 起連續編號，每個編號只出現一次。

| 欄位 | 說明 |
| --- | --- |
| `cloze_template` | 空格寫 `(1)`、`(2)`…，可放在 LaTeX 內 |
| `cloze_options` | 預設名稱（所有空格共用），或每格一項的陣列（每項是預設名稱或自訂選項） |
| `cloze_answers` | 每格的正解，依空格順序 |

預設名稱：

| 名稱 | 選項 |
| --- | --- |
| `digits` | `0`～`9`、`$-$`、`$\pm$` |
| `digits_pi` | `0`～`9`、`$-$`、`$\pi$` |
| `compare` | `>`、`=`、`<` |

```json
{
  "question_type": "cloze",
  "question_content": "若 $\\theta=30\\degree$，半徑為 $2$，令扇形面積為 $A$、周長為 $S$，求 $A+S$。",
  "cloze_template": "$A+S=\\dfrac{(1)}{(2)}\\pi+(3)$（請化到最簡）",
  "cloze_options": "digits",
  "cloze_answers": ["2", "3", "4"],
  "answer_status": "ai",
  "points": 6,
  "question_image": "images/q03_fig1.png"
}
```

拆格方式：

- 多位數：`12` → `(1)(2)`，答案 `["1", "2"]`。
- 負數：`-3` → `(1)(2)`，答案 `["-", "3"]`（`-` 會對應到 `$-$`）。
- 分數：`\dfrac{(1)}{(2)}`；帶根號：`(1)\sqrt{(2)}`。有其他填法時要在模板後加（請化到最簡）。
- 係數為 `1` 也要挖空並填 `1`，不要省略或寫死，避免洩漏答案：`2x+y` 挖成 `(1)x+(2)y`，答案 `2, 1`。
- 同一份題目的格式要依題本的答案形式決定，格數不足以表達答案時要加格，不可把答案改掉。
- 模板文字裡不可出現其他 `(數字)`，否則會被當成空格；需要時改寫，例如 `第 1 小題`。

非數字的空格用自訂選項：

```json
{
  "question_type": "cloze",
  "question_content": "判斷點與圓的關係：",
  "cloze_template": "在圓內：$\\overline{OA}\\ (1)\\ r$<br>在圓外：$\\overline{OA}\\ (2)\\ r$",
  "cloze_options": ["compare", [">", "=", "<"]],
  "cloze_answers": ["<", ">"],
  "answer_status": "book",
  "points": 4
}
```

### 答案必須唯一

自動計分只認一組答案。每題定稿前都要自問：**有沒有另一組填法也符合模板，而且數學上正確？** 有就必須改模板。答案不必照抄題本，可以改寫成等價形式，但要確認改寫前後相等。

| 情況 | 會出問題的挖法 | 做法 |
| --- | --- | --- |
| 方程式可同乘倍數 | `2x+4y=3` 挖成 `(1)x+(2)y=(3)`，`(2,4,3)`、`(4,8,6)` 都對 | 固定一個非 0 的係數或常數：`$(1)x+(2)y=3$` |
| 分數可約分或擴分 | `3/17` 挖成兩層，`6/34` 也符合 | 在模板後註明（請化到最簡），不要寫死分子或分母 |
| 根式可改寫 | `4√2` 挖成 `(1)\sqrt{(2)}`，`2√8` 也符合 | 在模板後註明（請化到最簡），不要寫死根號內外的數字 |
| 多個解沒有順序 | `x=1` 或 `3`，兩格可對調 | 註明「由小到大」，或固定其中一個解 |
| 因式、項可交換 | `(x+1)(x+2)` 兩個因式可對調 | 註明順序，例如 `(x+a)(x+b)`，其中 `a<b` |
| 負號位置不固定 | 分子、分母都有符號位置 | 負號獨立一格放在分數前：`$(1)\dfrac{(2)}{(3)}$`，且註明分母為正 |
| 格數多於位數 | 答案 `7` 開兩格，`07` 也符合 | 格數剛好等於答案位數 |

**先枚舉，真的有其他填法才處理。** 格數或模板已經限制住答案時，就全部挖空，不用固定也不用加提示。例如：

- `2x+3y=9` 挖成 `(1)x+(2)y=(3)`：同乘 2 後常數 `18` 放不進一格，答案唯一。
- `\dfrac{2x+y}{7}` 挖成 `\dfrac{(1)x+(2)y}{(3)}`，答案 `2, 1, 7`：同乘 2 後分母 `14` 放不進一格，答案唯一。
- `\dfrac{7}{9}` 挖成 `\dfrac{(1)}{(2)}`：擴分後放不進一格，答案唯一。

確定有其他填法時，**分數和根式優先加「化到最簡」等提示字樣**，不要為了唯一而寫死答案的一部分。例如機率題挖成 `\dfrac{(1)}{2}` 會洩漏分母，題目就太簡單了。

方程式這類有倍數問題的，才優先固定一個係數或常數；固定後仍不唯一，或會洩漏解題關鍵時，改在模板或題目補上條件。

## short_answer

```json
{
  "question_type": "short_answer",
  "question_content": "試證明圓周角為同弧所對圓心角的一半。",
  "points": 10
}
```

## group

題幹放在外層，`group_questions` 是小題。小題可混用 `choice`、`multi`、`cloze`、`short_answer`，**不可**巢狀題組。小題的 `points` 加總要等於外層 `points`。不要使用 `sub_questions`。

```json
{
  "question_type": "group",
  "question_content": "袋中有 $3$ 紅球、$2$ 白球，依序取出兩球。",
  "points": 10,
  "group_questions": [
    {
      "question_type": "cloze",
      "question_content": "兩球皆紅的機率為",
      "cloze_template": "$\\dfrac{(1)}{(2)(3)}$（請化到最簡）",
      "cloze_options": "digits",
      "cloze_answers": ["3", "1", "0"],
      "answer_status": "book",
      "points": 5
    },
    {
      "question_type": "short_answer",
      "question_content": "寫出第二球為白球機率的計算過程。",
      "points": 5
    }
  ]
}
```

## 驗證規則

`build_quiz.py` 和後端都會檢查下列項目，任一不符就無法匯入：

- 題目要有內容或圖片；選項至少兩個且不可空白（圖片選項除外）。
- `answer`、`multi_answers`、`cloze_answers` 都要對應到選項。
- `cloze_template` 的空格依序編號，數量等於 `cloze_options` 組數。
- `points` 大於 0，題組小題加總相符。
- 引用的圖片都存在，格式為 PNG、JPEG、WebP，每張不超過 900 KB。
- JSON 不超過 900 KB，zip 不超過 20 MB，檔案數不超過 200。
- 同一個 `quiz_id` 已存在時，後端會拒絕匯入。
