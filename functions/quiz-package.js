/**
 * 解析與驗證題本匯入 zip(規格見 .claude/skills/quiz-from-book/references/schema.md)。
 *
 *   <quiz_id>.zip
 *   ├── <quiz_id>.json : { format_version, meta, questions }
 *   └── images/*       : 題目用圖
 *
 * 這裡只處理純資料,不碰 Firestore/Storage;寫入由 index.js 的 importQuizZip 負責。
 */

const { unzipSync } = require('fflate');

const ZIP_MAX_BYTES = 20 * 1024 * 1024;
const UNZIPPED_MAX_BYTES = 40 * 1024 * 1024;
const JSON_MAX_BYTES = 900 * 1024;
const IMAGE_MAX_BYTES = 900 * 1024;
const MAX_FILES = 200;
const QUIZ_ID_RE = /^[\p{L}\p{N}_-]{1,100}$/u;
const IMAGE_REF_RE = /^images\/[A-Za-z0-9_.-]+$/;
const IMAGE_EXTENSIONS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const PART_TYPES = ['choice', 'multi', 'cloze', 'short_answer'];

const fail = (error, details = []) => ({ ok: false, error, details });
const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;

function sniffImageType(bytes) {
  const has = (offset, signature) => signature.every((value, index) => bytes[offset + index] === value);
  if (has(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (has(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (has(0, [0x52, 0x49, 0x46, 0x46]) && has(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

// 解壓前先用 zip 宣告的原始大小過濾;超過限制的檔案不會被解開。
function readZip(buffer) {
  const details = [];
  let fileCount = 0;
  let declaredTotal = 0;
  let jsonName = '';
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buffer), {
      filter(file) {
        const { name, originalSize } = file;
        if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').pop() === '.DS_Store') return false;
        fileCount += 1;
        declaredTotal += originalSize;
        const parts = name.split('/');
        if (name.includes('\\') || parts.some((part) => part === '..' || part === '')) {
          details.push(`不允許的路徑:${name}`);
          return false;
        }
        if (parts.length === 1 && name.toLowerCase().endsWith('.json')) {
          if (jsonName) details.push(`根目錄只能有一個 JSON:${jsonName}、${name}`);
          jsonName = name;
          if (originalSize > JSON_MAX_BYTES) {
            details.push(`${name} 超過 ${JSON_MAX_BYTES} bytes`);
            return false;
          }
          return true;
        }
        const extension = name.split('.').pop().toLowerCase();
        if (parts.length !== 2 || parts[0] !== 'images' || !IMAGE_EXTENSIONS[extension]) {
          details.push(`不允許的檔案:${name}`);
          return false;
        }
        if (originalSize > IMAGE_MAX_BYTES) {
          details.push(`${name} 超過 ${IMAGE_MAX_BYTES} bytes`);
          return false;
        }
        return true;
      },
    });
  } catch (error) {
    return fail('BAD_ZIP', [String(error?.message || error)]);
  }
  if (fileCount > MAX_FILES) details.push(`檔案數超過 ${MAX_FILES}`);
  if (declaredTotal > UNZIPPED_MAX_BYTES) details.push(`解壓後總大小超過 ${UNZIPPED_MAX_BYTES} bytes`);
  if (!jsonName) details.push('zip 根目錄缺少 <quiz_id>.json');
  if (details.length) return fail('INVALID_QUIZ_PACKAGE', details);

  const images = new Map();
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === jsonName) continue;
    const contentType = sniffImageType(bytes);
    if (bytes.length > IMAGE_MAX_BYTES) details.push(`${name} 超過 ${IMAGE_MAX_BYTES} bytes`);
    if (contentType !== IMAGE_EXTENSIONS[name.split('.').pop().toLowerCase()]) {
      details.push(`${name} 的內容與副檔名不符`);
    }
    images.set(name, { buffer: Buffer.from(bytes), contentType });
  }
  if (details.length) return fail('INVALID_QUIZ_PACKAGE', details);
  return { ok: true, jsonName, jsonText: Buffer.from(entries[jsonName]).toString('utf8'), images };
}

function validateMeta(meta, jsonName, errors) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    errors.push('meta 必須是物件');
    return null;
  }
  const quizId = typeof meta.quiz_id === 'string' ? meta.quiz_id.trim() : '';
  const title = typeof meta.title === 'string' ? meta.title.trim() : '';
  const kind = meta.kind ?? 'exam';
  const limit = meta.time_limit_minutes ?? null;
  if (!QUIZ_ID_RE.test(quizId)) errors.push('meta.quiz_id 只能用文字、數字、底線與連字號');
  else if (jsonName !== `${quizId}.json`) errors.push(`JSON 檔名必須是 ${quizId}.json,目前是 ${jsonName}`);
  if (!title) errors.push('meta.title 不能留空');
  if (kind !== 'exam' && kind !== 'homework') errors.push('meta.kind 必須是 exam 或 homework');
  if (limit !== null && !isPositiveNumber(limit)) errors.push('meta.time_limit_minutes 必須是 null 或大於 0 的數字');
  return {
    quiz_id: quizId,
    title,
    topic: String(meta.topic || '').trim(),
    description: String(meta.description || '').trim(),
    kind,
    time_limit_minutes: limit,
  };
}

// 走訪一題(含小題)的所有圖片欄位;replace 回傳值會寫回欄位。
function mapImageRefs(question, replace) {
  const visit = (part) => {
    if (part.display_type === 'image' && part.question_content) part.question_content = replace(part.question_content);
    if (part.question_image) part.question_image = replace(part.question_image);
    if (Array.isArray(part.option_images)) {
      part.option_images = part.option_images.map((value) => (value ? replace(value) : value));
    }
  };
  visit(question);
  if (Array.isArray(question.group_questions)) question.group_questions.forEach(visit);
}

function validateOptions(part, label, errors) {
  const { options, option_images: optionImages } = part;
  if (!Array.isArray(options) || options.length < 2) {
    errors.push(`${label} 選項不足`);
    return false;
  }
  if (optionImages !== undefined && (!Array.isArray(optionImages) || optionImages.length !== options.length)) {
    errors.push(`${label} option_images 長度必須等於 options`);
    return false;
  }
  if (options.some((option) => typeof option !== 'string' || !option.trim())) {
    errors.push(`${label} 選項必須是非空字串`);
    return false;
  }
  return true;
}

function validateCloze(part, label, errors) {
  const template = part.cloze_template;
  const options = part.cloze_options;
  const answers = part.cloze_answer_indices;
  if (typeof template !== 'string' || !template.trim()) {
    errors.push(`${label} 缺少 cloze_template`);
    return null;
  }
  if (!Array.isArray(options) || !options.length || !Array.isArray(answers)) {
    errors.push(`${label} 缺少 cloze_options 或 cloze_answer_indices`);
    return null;
  }
  const numbers = [...template.matchAll(/\((\d+)\)/g)].map((match) => Number(match[1]));
  if (numbers.some((number, index) => number !== index + 1)) {
    errors.push(`${label} 空格必須依序為 (1)、(2)…且不可重複`);
    return null;
  }
  if (numbers.length !== options.length || answers.length !== options.length) {
    errors.push(`${label} 空格 ${numbers.length} 個、選項 ${options.length} 組、答案 ${answers.length} 個,數量必須相同`);
    return null;
  }
  for (let index = 0; index < options.length; index += 1) {
    if (!Array.isArray(options[index]) || options[index].length < 2 || options[index].some((token) => typeof token !== 'string')) {
      errors.push(`${label} 第 ${index + 1} 格選項不足`);
      return null;
    }
    if (!isIndex(answers[index], options[index].length)) {
      errors.push(`${label} 第 ${index + 1} 格答案索引超出範圍`);
      return null;
    }
  }
  return answers;
}

// 回傳該題或小題的答案鍵欄位;驗證失敗時回傳 null,錯誤累積在 errors。
function keyForPart(part, type, label, errors) {
  if (type === 'short_answer') return {};
  if (type === 'cloze') {
    const correct = validateCloze(part, label, errors);
    return correct && { correct_indices: correct };
  }
  if (!validateOptions(part, label, errors)) return null;
  if (type === 'choice') {
    const matches = part.options.filter((option) => option === part.answer).length;
    if (matches !== 1) {
      errors.push(`${label} 的 answer 必須對應到唯一選項`);
      return null;
    }
    return { correct_index: part.options.indexOf(part.answer) };
  }
  const correct = part.correct_answer_indices;
  if (!Array.isArray(correct) || !correct.length || correct.some((value) => !isIndex(value, part.options.length)) || new Set(correct).size !== correct.length) {
    errors.push(`${label} 的 correct_answer_indices 不正確`);
    return null;
  }
  return { correct_indices: [...correct].sort((a, b) => a - b), option_count: part.options.length };
}

function validateCommon(part, label, errors) {
  if (part.display_type !== undefined && part.display_type !== 'text' && part.display_type !== 'image') {
    errors.push(`${label} display_type 不正確`);
  }
  if (part.sub_questions !== undefined) errors.push(`${label} 不支援 sub_questions,多小題請用 group`);
  if (part.question_content !== undefined && typeof part.question_content !== 'string') {
    errors.push(`${label} question_content 必須是字串`);
  } else if (!String(part.question_content || '').trim() && !part.question_image && !part.cloze_template) {
    errors.push(`${label} 沒有內容也沒有圖片`);
  }
  if (!isPositiveNumber(part.points)) errors.push(`${label} points 必須大於 0`);
}

function buildKey(question, index, errors) {
  const label = `第 ${index + 1} 題`;
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    errors.push(`${label} 必須是物件`);
    return null;
  }
  const type = question.question_type;
  validateCommon(question, label, errors);
  if (question.explanation !== undefined && typeof question.explanation !== 'string') errors.push(`${label} explanation 必須是字串`);
  const explanation = String(question.explanation || '').trim();
  const extra = explanation ? { explanation } : {};

  if (type === 'group') {
    const parts = question.group_questions;
    if (!Array.isArray(parts) || !parts.length) {
      errors.push(`${label} 題組缺少 group_questions`);
      return null;
    }
    let total = 0;
    const subs = parts.map((part, partIndex) => {
      const partLabel = `${label} 小題 ${partIndex + 1}`;
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        errors.push(`${partLabel} 必須是物件`);
        return null;
      }
      if (!PART_TYPES.includes(part.question_type)) {
        errors.push(`${partLabel} 使用不支援的題型:${part.question_type}`);
        return null;
      }
      if (part.explanation !== undefined) errors.push(`${partLabel} 詳解只能寫在整題`);
      validateCommon(part, partLabel, errors);
      total += Number(part.points) || 0;
      const fields = keyForPart(part, part.question_type, partLabel, errors);
      return fields && { type: part.question_type, points: part.points, ...fields };
    });
    if (Math.abs(total - Number(question.points)) > 1e-6) errors.push(`${label} 小題配分加總(${total})不等於題組配分(${question.points})`);
    return subs.includes(null) ? null : { q_index: index, question_type: 'group', points: question.points, subs, ...extra };
  }

  if (!PART_TYPES.includes(type)) {
    errors.push(`${label} 使用不支援的題型:${type}`);
    return null;
  }
  const fields = keyForPart(question, type, label, errors);
  return fields && { q_index: index, question_type: type, points: question.points, ...fields, ...extra };
}

/** 解析 zip;成功時回傳可直接寫入的 meta、questions(仍是 zip 內的圖片路徑)、keys、images。 */
function parseQuizPackage(buffer) {
  if (!buffer?.length) return fail('EMPTY_ZIP');
  if (buffer.length > ZIP_MAX_BYTES) return fail('ZIP_TOO_LARGE', [`zip 上限 ${ZIP_MAX_BYTES} bytes`]);
  const zip = readZip(buffer);
  if (!zip.ok) return zip;

  let pkg;
  try {
    pkg = JSON.parse(zip.jsonText);
  } catch (error) {
    return fail('INVALID_QUIZ_PACKAGE', [`JSON 無法解析:${error.message}`]);
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return fail('INVALID_QUIZ_PACKAGE', ['JSON 外層必須是 {format_version, meta, questions}']);

  const errors = [];
  if (pkg.format_version !== 1) errors.push(`不支援的 format_version:${pkg.format_version}`);
  const meta = validateMeta(pkg.meta, zip.jsonName, errors);
  const questions = pkg.questions;
  if (!Array.isArray(questions) || !questions.length) {
    errors.push('questions 必須是非空陣列');
    return fail('INVALID_QUIZ_PACKAGE', errors);
  }

  const keys = questions.map((question, index) => buildKey(question, index, errors));

  const referenced = new Set();
  questions.forEach((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return;
    if (Array.isArray(question.group_questions) && question.group_questions.some((part) => !part || typeof part !== 'object')) return;
    mapImageRefs(question, (value) => {
      if (typeof value !== 'string' || !IMAGE_REF_RE.test(value)) errors.push(`第 ${index + 1} 題圖片路徑不正確:${value}`);
      else if (!zip.images.has(value)) errors.push(`第 ${index + 1} 題引用的圖片不存在:${value}`);
      else referenced.add(value);
      return value;
    });
  });
  if (errors.length) return fail('INVALID_QUIZ_PACKAGE', errors);

  const images = new Map([...zip.images].filter(([name]) => referenced.has(name)));
  const warnings = [...zip.images.keys()].filter((name) => !referenced.has(name)).map((name) => `未被引用的圖片已略過:${name}`);
  const totalPoints = Math.round(keys.reduce((sum, key) => sum + key.points, 0) * 100) / 100;
  // 詳解只進答案鍵,不進題目檔;題目檔會被學生端讀取。
  const cleanQuestions = questions.map(({ explanation: _explanation, ...question }) => ({ display_type: 'text', ...question }));
  return { ok: true, meta, questions: cleanQuestions, keys, images, total_points: totalPoints, warnings };
}

module.exports = { parseQuizPackage, mapImageRefs, ZIP_MAX_BYTES };
