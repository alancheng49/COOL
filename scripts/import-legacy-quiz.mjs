#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const QUESTIONS_DIR = join(PROJECT_ROOT, 'questions');
const IMAGE_MAX_BYTES = 900 * 1024;
const DEFAULT_API = 'https://cool-sys.web.app/api';

const HELP = `
一次匯入一份舊題目 JSON（包含本機圖片）。

用法：
  node scripts/import-legacy-quiz.mjs <questions/檔名.json> [選項]

必要參數：
  <questions/檔名.json>       本次唯一要匯入的題目檔

選項：
  --quiz-id <識別碼>          預設為 JSON 檔名（不含副檔名）
  --title <考卷標題>          預設為 JSON 檔名（不含副檔名）
  --topic <主題>              預設為「舊題庫」
  --description <說明>        預設留空
  --total-points <總分>       預設每題 1 分
  --time-limit <分鐘>         預設不限制時間
  --api <API 網址>            預設 ${DEFAULT_API}
  --dry-run                   只驗證、列出計畫，不登入或上傳
  --skip-invalid-images       移除找不到的非必要圖片欄位
  --overwrite                 允許更新同識別碼、同版本的既有考卷
  --yes                       不詢問最後確認
  --help                      顯示說明

登入方式：
  預設執行時互動輸入管理員帳號與密碼。也可設定環境變數：
  QUIZ_ADMIN_ACCOUNT、QUIZ_ADMIN_PASSWORD，或直接提供 QUIZ_SESSION_TOKEN。

範例：
  node scripts/import-legacy-quiz.mjs questions/1010_circle.json --dry-run
  node scripts/import-legacy-quiz.mjs questions/1010_circle.json \\
    --quiz-id circle_1010 --title "圓與扇形" --topic "圓" --total-points 100
`;

function parseArgs(argv) {
  const valueOptions = new Set([
    'quiz-id', 'title', 'topic', 'description', 'total-points', 'time-limit', 'api',
  ]);
  const boolOptions = new Set([
    'dry-run', 'skip-invalid-images', 'overwrite', 'yes', 'help',
  ]);
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    if (boolOptions.has(rawKey)) {
      if (inlineValue !== undefined) throw new Error(`--${rawKey} 不接受值`);
      options[rawKey] = true;
      continue;
    }
    if (!valueOptions.has(rawKey)) throw new Error(`未知選項：--${rawKey}`);
    const value = inlineValue !== undefined ? inlineValue : argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${rawKey} 需要一個值`);
    options[rawKey] = value;
  }

  if (options.help) return { options, input: null };
  if (positional.length !== 1) {
    throw new Error(`每次必須且只能指定一份 JSON；目前收到 ${positional.length} 份`);
  }
  return { options, input: positional[0] };
}

function parsePositiveNumber(value, label, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label}必須是大於 0 的數字`);
  return parsed;
}

function normalizeApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`API 網址格式不正確：${value}`);
  }
  if (!url.pathname || url.pathname === '/') url.pathname = '/api';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function ensureInputPath(input) {
  const fullPath = resolve(process.cwd(), input);
  const withinQuestions = relative(QUESTIONS_DIR, fullPath);
  if (withinQuestions.startsWith('..') || isAbsolute(withinQuestions)) {
    throw new Error(`題目檔必須位於 ${QUESTIONS_DIR}`);
  }
  if (extname(fullPath).toLowerCase() !== '.json') throw new Error('題目檔必須是 .json');
  if (!existsSync(fullPath)) throw new Error(`找不到題目檔：${fullPath}`);
  return fullPath;
}

function loadQuestions(inputPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch (error) {
    throw new Error(`JSON 無法解析：${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('題目 JSON 必須是非空陣列');
  }
  return structuredClone(parsed);
}

function splitPoints(total, count) {
  if (count <= 0) return [];
  const units = Math.round(total * 100);
  const base = Math.floor(units / count);
  const remainder = units - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

function normalizeLegacyQuestions(questions) {
  const warnings = [];

  const visit = (question, label) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return;
    const type = String(question.question_type || '').toLowerCase();
    if (type === 'cloze' && Array.isArray(question.cloze_options) && Array.isArray(question.cloze_answer_indices)) {
      const placeholders = [...String(question.cloze_template || '').matchAll(/\((\d+)\)/g)]
        .map((match) => Number(match[1]));
      const expected = placeholders.length ? Math.max(...placeholders) : 0;
      const answerCount = question.cloze_answer_indices.length;
      if (expected === answerCount && question.cloze_options.length > expected) {
        const removed = question.cloze_options.length - expected;
        question.cloze_options = question.cloze_options.slice(0, expected);
        warnings.push(`${label}：依答案樣式移除 ${removed} 組多餘的 cloze_options（只調整上傳副本）`);
      }
    }
    (question.group_questions || []).forEach((part, index) => visit(part, `${label} 小題 ${index + 1}`));
    (question.sub_questions || []).forEach((part, index) => visit(part, `${label} 填充小題 ${index + 1}`));
  };

  questions.forEach((question, index) => visit(question, `第 ${index + 1} 題`));
  return warnings;
}

function resolveLocalImage(imagePath, jsonDir) {
  const clean = imagePath.replace(/^\/+/, '');
  const candidates = [
    resolve(PROJECT_ROOT, clean),
    resolve(jsonDir, imagePath),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
}

function mimeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function prepareImage(filePath) {
  const original = readFileSync(filePath);
  if (original.length <= IMAGE_MAX_BYTES) {
    return { buffer: original, contentType: mimeFor(filePath), uploadName: basename(filePath), compressed: false };
  }

  const ext = extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg'].includes(ext) || process.platform !== 'darwin') {
    throw new Error(
      `圖片超過 900 KB，且無法自動壓縮：${filePath}（${formatBytes(original.length)}）`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'legacy-quiz-image-'));
  try {
    const attempts = [
      [1600, 82], [1400, 78], [1200, 74], [1000, 70], [800, 65],
    ];
    for (let i = 0; i < attempts.length; i += 1) {
      const [maxDimension, quality] = attempts[i];
      const output = join(tempDir, `compressed-${i}.jpg`);
      try {
        execFileSync('/usr/bin/sips', [
          '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality),
          '-Z', String(maxDimension), filePath, '--out', output,
        ], { stdio: 'ignore' });
      } catch {
        continue;
      }
      if (!existsSync(output)) continue;
      const buffer = readFileSync(output);
      if (buffer.length > 0 && buffer.length <= IMAGE_MAX_BYTES) {
        return {
          buffer,
          contentType: 'image/jpeg',
          uploadName: `${basename(filePath, ext)}.jpg`,
          compressed: true,
          originalBytes: original.length,
        };
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  throw new Error(`圖片自動壓縮後仍超過 900 KB：${filePath}`);
}

function collectImages(questions, inputPath, skipInvalid) {
  const images = new Map();
  const warnings = [];
  const jsonDir = dirname(inputPath);

  const addReference = (container, key, label, required = false) => {
    const value = container?.[key];
    if (typeof value !== 'string' || !value.trim()) return;
    if (/^https?:\/\//i.test(value) || /^questions\/images\/uploads\//.test(value.replace(/^\/+/, ''))) {
      return;
    }
    const localPath = resolveLocalImage(value.trim(), jsonDir);
    if (!localPath) {
      if (skipInvalid && !required) {
        warnings.push(`${label}：已略過無效圖片欄位「${value}」`);
        delete container[key];
        return;
      }
      throw new Error(`${label} 找不到圖片：${value}`);
    }
    if (!images.has(value)) {
      images.set(value, { original: value, localPath, references: [] });
    }
    images.get(value).references.push((uploadedPath) => { container[key] = uploadedPath; });
  };

  const visit = (question, label) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      throw new Error(`${label} 必須是物件`);
    }
    addReference(question, 'question_image', `${label} question_image`);
    if (question.display_type === 'image') {
      addReference(question, 'question_content', `${label} question_content`, true);
    }
    if (Array.isArray(question.option_images)) {
      question.option_images.forEach((value, index) => {
        if (typeof value !== 'string' || !value.trim()) return;
        const holder = { value };
        addReference(holder, 'value', `${label} option_images[${index}]`);
        question.option_images[index] = holder.value;
        const entry = images.get(value);
        if (entry) {
          entry.references.pop();
          entry.references.push((uploadedPath) => { question.option_images[index] = uploadedPath; });
        } else if (!holder.value) {
          question.option_images[index] = null;
        }
      });
    }
    (question.group_questions || []).forEach((part, index) => visit(part, `${label} 小題 ${index + 1}`));
    (question.sub_questions || []).forEach((part, index) => visit(part, `${label} 填充小題 ${index + 1}`));
  };

  questions.forEach((question, index) => visit(question, `第 ${index + 1} 題`));
  for (const image of images.values()) image.prepared = prepareImage(image.localPath);
  return { images, warnings };
}

function integerArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} 必須是陣列`);
  return value.map((item, index) => {
    const number = Number(item);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${label}[${index}] 必須是非負整數`);
    return number;
  });
}

function keyForPart(part, label, points) {
  const type = String(part.question_type || 'choice').toLowerCase();
  if (type === 'short_answer') return { type, points };
  if (type === 'choice') {
    if (!Array.isArray(part.options) || part.options.length < 2) throw new Error(`${label} 選項不足`);
    const correct = part.options.findIndex((option) => option === part.answer);
    if (correct < 0) throw new Error(`${label} 的 answer 不在 options 內`);
    return { type, points, correct_index: correct };
  }
  if (type === 'multi') {
    if (!Array.isArray(part.options) || part.options.length < 2) throw new Error(`${label} 選項不足`);
    const correct = integerArray(part.correct_answer_indices, `${label} correct_answer_indices`);
    if (!correct.length || correct.some((index) => index >= part.options.length)) {
      throw new Error(`${label} 的複選答案索引超出選項範圍`);
    }
    return { type, points, correct_indices: correct, option_count: part.options.length };
  }
  if (type === 'cloze') {
    if (!Array.isArray(part.cloze_options) || !part.cloze_options.length) {
      throw new Error(`${label} 缺少 cloze_options`);
    }
    const correct = integerArray(part.cloze_answer_indices, `${label} cloze_answer_indices`);
    if (correct.length !== part.cloze_options.length) throw new Error(`${label} 的填充答案數量與空格數不一致`);
    correct.forEach((answerIndex, index) => {
      if (!Array.isArray(part.cloze_options[index]) || answerIndex >= part.cloze_options[index].length) {
        throw new Error(`${label} 第 ${index + 1} 格答案索引超出選項範圍`);
      }
    });
    return { type, points, correct_indices: correct };
  }
  throw new Error(`${label} 使用不支援的題型：${type}`);
}

function buildKeys(questions, totalPoints) {
  const questionPoints = splitPoints(totalPoints, questions.length);
  if (questionPoints.some((points) => points <= 0)) {
    throw new Error('總分太小，平均後會產生 0 分題目；請提高 --total-points');
  }
  return questions.map((question, index) => {
    const type = String(question.question_type || 'choice').toLowerCase();
    const label = `第 ${index + 1} 題`;
    const points = questionPoints[index];
    const explanation = String(question.explanation || '').trim();
    const extra = explanation ? { explanation } : {};

    if (type === 'group') {
      if (!Array.isArray(question.group_questions) || !question.group_questions.length) {
        throw new Error(`${label} 題組缺少 group_questions`);
      }
      const partPoints = splitPoints(points, question.group_questions.length);
      if (partPoints.some((partPointsValue) => partPointsValue <= 0)) {
        throw new Error(`${label} 配分太小，平均後會產生 0 分小題`);
      }
      const subs = question.group_questions.map((part, partIndex) => {
        part.points = partPoints[partIndex];
        return keyForPart(part, `${label} 小題 ${partIndex + 1}`, partPoints[partIndex]);
      });
      return { q_index: index, question_type: 'group', points, subs, ...extra };
    }

    if (type === 'cloze' && Array.isArray(question.sub_questions) && question.sub_questions.length) {
      const partPoints = splitPoints(points, question.sub_questions.length);
      if (partPoints.some((partPointsValue) => partPointsValue <= 0)) {
        throw new Error(`${label} 配分太小，平均後會產生 0 分填充小題`);
      }
      const subs = question.sub_questions.map((part, partIndex) => {
        part.points = partPoints[partIndex];
        return keyForPart({ ...part, question_type: 'cloze' }, `${label} 填充小題 ${partIndex + 1}`, partPoints[partIndex]);
      });
      return { q_index: index, question_type: 'cloze', points, subs, ...extra };
    }

    return {
      q_index: index,
      question_type: type,
      ...keyForPart(question, label, points),
      ...extra,
    };
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function postApi(apiUrl, payload) {
  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`無法連線到 API：${error.message}`);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(`API 回傳無效內容（HTTP ${response.status}）`);
  return result;
}

async function getApi(apiUrl, token, params) {
  const url = new URL(apiUrl);
  url.searchParams.set('token', token);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    throw new Error(`無法連線到 API：${error.message}`);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(`API 回傳無效內容（HTTP ${response.status}）`);
  return result;
}

async function promptVisible(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(message) {
  if (!process.stdin.isTTY) throw new Error('非互動環境請設定 QUIZ_ADMIN_PASSWORD');
  process.stdout.write(message);
  return new Promise((resolvePromise, rejectPromise) => {
    let value = '';
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) rejectPromise(error);
      else resolvePromise(value);
    };
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u0003') {
          finish(new Error('已取消'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function getAdminToken(apiUrl) {
  if (process.env.QUIZ_SESSION_TOKEN) return process.env.QUIZ_SESSION_TOKEN.trim();
  const account = (process.env.QUIZ_ADMIN_ACCOUNT || await promptVisible('管理員帳號：')).trim();
  const password = process.env.QUIZ_ADMIN_PASSWORD || await promptHidden('管理員密碼：');
  if (!account || !password) throw new Error('管理員帳號與密碼不能留空');
  const result = await postApi(apiUrl, { action: 'auth', account, password });
  if (!result?.ok) throw new Error(`登入失敗：${result?.error || '未知錯誤'}`);
  if (String(result.role || '').toLowerCase() !== 'admin') throw new Error('此帳號不是管理員');
  return result.token;
}

function assertOk(result, step) {
  if (!result?.ok) throw new Error(`${step}失敗：${result?.error || '未知錯誤'}`);
  return result;
}

async function main() {
  const { options, input } = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const inputPath = ensureInputPath(input);
  const stem = basename(inputPath, extname(inputPath));
  const quizId = String(options['quiz-id'] || stem).trim();
  const title = String(options.title || stem).trim();
  const topic = String(options.topic || '舊題庫').trim();
  const description = String(options.description || '').trim();
  const timeLimit = options['time-limit'] === undefined
    ? null
    : parsePositiveNumber(options['time-limit'], '作答時間', null);
  if (!quizId) throw new Error('考卷識別碼不能留空');
  if (!title) throw new Error('考卷標題不能留空');

  const questions = loadQuestions(inputPath);
  const totalPoints = parsePositiveNumber(options['total-points'], '總分', questions.length);
  const normalizationWarnings = normalizeLegacyQuestions(questions);
  const keys = buildKeys(questions, totalPoints);
  const imageResult = collectImages(questions, inputPath, !!options['skip-invalid-images']);
  const images = imageResult.images;
  const warnings = [...normalizationWarnings, ...imageResult.warnings];
  const apiUrl = normalizeApiUrl(options.api || process.env.QUIZ_API_URL || DEFAULT_API);
  const questionFile = `questions/${quizId}.json`;

  console.log('\n匯入計畫');
  console.log(`  來源：${inputPath}`);
  console.log(`  識別碼：${quizId}`);
  console.log(`  標題：${title}`);
  console.log(`  主題：${topic || '未分類'}`);
  console.log(`  題數：${questions.length}`);
  console.log(`  總分：${totalPoints}`);
  console.log(`  限時：${timeLimit == null ? '不限' : `${timeLimit} 分鐘`}`);
  console.log(`  圖片：${images.size} 張`);
  for (const image of images.values()) {
    const prepared = image.prepared;
    const size = prepared.compressed
      ? `${formatBytes(prepared.originalBytes)} -> ${formatBytes(prepared.buffer.length)}（暫存壓縮）`
      : formatBytes(prepared.buffer.length);
    console.log(`    - ${image.original}：${size}`);
  }
  warnings.forEach((warning) => console.warn(`  警告：${warning}`));
  console.log('  狀態：未啟用（匯入後請先到題目編輯器檢查）');

  if (options['dry-run']) {
    console.log('\nDry-run 完成，沒有登入、上傳或修改任何檔案。');
    return;
  }

  if (!options.yes) {
    const answer = (await promptVisible('\n確定只匯入以上這一份考卷？輸入 yes 繼續：')).toLowerCase();
    if (answer !== 'yes') {
      console.log('已取消，沒有上傳。');
      return;
    }
  }

  const token = await getAdminToken(apiUrl);
  const existingResult = assertOk(
    await getApi(apiUrl, token, { action: 'admin_list_quizzes' }),
    '檢查既有考卷',
  );
  const sameId = (existingResult.items || []).filter((item) => String(item.quiz_id) === quizId);
  const existing = sameId.find(
    (item) => String(item.quiz_id) === quizId && Number(item.quiz_version) === 1,
  );
  if (sameId.length && !existing) {
    throw new Error(`識別碼 ${quizId} 已被其他版本使用；請改用另一個 --quiz-id`);
  }
  if (existing && !options.overwrite) {
    throw new Error(`識別碼 ${quizId} 已存在；若確定要更新，請加上 --overwrite`);
  }

  let imageIndex = 0;
  for (const image of images.values()) {
    imageIndex += 1;
    console.log(`[${imageIndex}/${images.size}] 上傳圖片：${image.original}`);
    const result = assertOk(await postApi(apiUrl, {
      action: 'upload_image',
      session_token: token,
      file_name: image.prepared.uploadName,
      content_type: image.prepared.contentType,
      data_base64: image.prepared.buffer.toString('base64'),
    }), '圖片上傳');
    if (!result.path) throw new Error(`圖片上傳失敗：API 未回傳圖片路徑（${image.original}）`);
    image.references.forEach((setUploadedPath) => setUploadedPath(result.path));
  }

  console.log('上傳題目內容...');
  assertOk(await postApi(apiUrl, {
    action: 'upsert_questions',
    session_token: token,
    file_path: questionFile,
    content: JSON.stringify(questions, null, 2),
  }), '題目內容上傳');

  console.log('建立考卷資料...');
  assertOk(await postApi(apiUrl, {
    action: 'upsert_quiz',
    session_token: token,
    quiz_id: quizId,
    quiz_version: 1,
    title,
    topic,
    description,
    total_points: totalPoints,
    is_active: false,
    file: questionFile,
    time_limit_minutes: timeLimit,
  }), '考卷資料建立');

  console.log('建立答案與配分...');
  assertOk(await postApi(apiUrl, {
    action: 'upsert_answer_keys',
    session_token: token,
    quiz_id: quizId,
    quiz_version: 1,
    keys,
  }), '答案鍵建立');

  const detail = assertOk(
    await getApi(apiUrl, token, { action: 'admin_quiz_detail', quiz_id: quizId, quiz_version: 1 }),
    '匯入後驗證',
  );
  const storedQuestions = Array.isArray(detail.questions) ? detail.questions.length : null;
  if (storedQuestions !== null && storedQuestions !== questions.length) {
    throw new Error(`匯入後驗證失敗：預期 ${questions.length} 題，後端回傳 ${storedQuestions} 題`);
  }
  if (!Array.isArray(detail.keys) || detail.keys.length !== keys.length) {
    throw new Error(`匯入後驗證失敗：預期 ${keys.length} 組答案鍵，後端回傳 ${detail.keys?.length ?? 0} 組`);
  }

  console.log(`\n完成：${title}（${quizId}）已匯入並保持未啟用。`);
  console.log('請到「題目管理 -> 編輯」檢查內容與配分，確認後再啟用。');
}

main().catch((error) => {
  console.error(`\n錯誤：${error.message}`);
  process.exitCode = 1;
});
