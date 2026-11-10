#!/usr/bin/env python3
"""把 draft.json 與裁切圖轉成可上傳的考卷 zip。

用法：
  python3 build_quiz.py draft.json --images images --out dist [--split-points 100] [--check]

--split-points N  題本沒有標配分時使用：把 N 分平均分給各題，題組再平均分給小題，
                  會覆蓋 draft 內的 points。
--check           只轉換與驗證，不產生 zip。

draft 的格式見 references/schema.md。驗證失敗時列出所有錯誤並以非 0 結束。
"""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

IMAGE_MAX_BYTES = 900 * 1024
JSON_MAX_BYTES = 900 * 1024
ZIP_MAX_BYTES = 20 * 1024 * 1024
MAX_FILES = 200
QUIZ_ID_RE = re.compile(r"^[\w-]{1,100}$")
IMAGE_REF_RE = re.compile(r"^images/[A-Za-z0-9_.-]+$")
PLACEHOLDER_RE = re.compile(r"\((\d+)\)")
ANSWER_STATUSES = {"book", "ai", "placeholder"}
PART_TYPES = {"choice", "multi", "cloze", "short_answer"}
QUESTION_TYPES = PART_TYPES | {"group"}
DRAFT_ONLY_FIELDS = {"answer_status", "low_confidence", "source_label"}

DIGITS = [str(digit) for digit in range(10)]
CLOZE_PRESETS = {
    "digits": DIGITS + ["$-$", "$\\pm$"],
    "digits_pi": DIGITS + ["$-$", "$\\pi$"],
    "compare": [">", "=", "<"],
}


def normalize_token(value):
    return re.sub(r"[\s$]", "", str(value))


def split_points(total, count):
    units = round(total * 100)
    base, remainder = divmod(units, count)
    return [(base + (1 if index < remainder else 0)) / 100 for index in range(count)]


def image_kind(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


class Builder:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.images = set()
        self.ai_answers = []
        self.placeholder_answers = []
        self.book_answers = 0
        self.low_confidence = []

    def error(self, label, message):
        self.errors.append(f"{label}：{message}")

    def image_ref(self, value, label):
        if not isinstance(value, str) or not IMAGE_REF_RE.match(value):
            self.error(label, f"圖片必須寫成 images/<檔名>，目前是 {value!r}")
            return
        self.images.add(value)

    def common(self, item, label):
        """處理題目與小題共有的欄位，回傳已轉換的題目。"""
        output = {key: value for key, value in item.items() if key not in DRAFT_ONLY_FIELDS}
        if "sub_questions" in item:
            self.error(label, "不支援 sub_questions，多小題請用 group")
        display = item.get("display_type", "text")
        if display not in ("text", "image"):
            self.error(label, f"display_type 不正確：{display!r}")
        content = item.get("question_content", "")
        if not isinstance(content, str):
            self.error(label, "question_content 必須是字串")
            content = ""
        if display == "image":
            self.image_ref(content, f"{label} question_content")
        elif not content.strip() and not item.get("question_image") and not item.get("cloze_template"):
            self.error(label, "題目沒有內容也沒有圖片")
        elif content.count("$") % 2:
            self.warnings.append(f"{label}：question_content 的 $ 數量是奇數，請檢查 LaTeX")
        if item.get("question_image"):
            self.image_ref(item["question_image"], f"{label} question_image")
        if item.get("low_confidence"):
            self.low_confidence.append(f"{label}：{item['low_confidence']}")
        return output

    def record_status(self, item, label, question_type):
        status = item.get("answer_status")
        if status not in ANSWER_STATUSES:
            self.error(label, f"answer_status 必須是 book、ai 或 placeholder，目前是 {status!r}")
            return status
        if status == "ai":
            self.ai_answers.append(label)
        elif status == "placeholder":
            self.placeholder_answers.append(label)
        else:
            self.book_answers += 1
        return status

    def options(self, item, output, label):
        options = item.get("options")
        if not isinstance(options, list) or len(options) < 2:
            self.error(label, "options 至少要兩個")
            return None
        images = item.get("option_images")
        if images is not None:
            if not isinstance(images, list) or len(images) != len(options):
                self.error(label, "option_images 的長度必須等於 options")
                images = None
            else:
                for index, value in enumerate(images):
                    if value:
                        self.image_ref(value, f"{label} option_images[{index}]")
        filled = []
        for index, option in enumerate(options):
            text = "" if option is None else str(option)
            if not text.strip():
                if images and images[index]:
                    text = f"({chr(65 + index)})"
                else:
                    self.error(label, f"第 {index + 1} 個選項是空的")
            filled.append(text)
        output["options"] = filled
        return filled

    def convert_choice(self, item, output, label, status):
        options = self.options(item, output, label)
        if options is None:
            return
        if status == "placeholder" and item.get("answer") is None:
            output["answer"] = options[0]
            return
        matches = options.count(item.get("answer"))
        if matches != 1:
            self.error(label, f"answer 必須完全等於其中一個選項，目前對到 {matches} 個：{item.get('answer')!r}")

    def convert_multi(self, item, output, label, status):
        options = self.options(item, output, label)
        output.pop("multi_answers", None)
        if options is None:
            return
        answers = item.get("multi_answers")
        if status == "placeholder" and not answers:
            output["correct_answer_indices"] = [0]
            return
        if not isinstance(answers, list) or not answers:
            self.error(label, "multi_answers 至少要一個")
            return
        indices = []
        for answer in answers:
            if options.count(answer) != 1:
                self.error(label, f"multi_answers 必須完全等於其中一個選項：{answer!r}")
            else:
                indices.append(options.index(answer))
        if len(set(indices)) != len(indices):
            self.error(label, "multi_answers 有重複")
        output["correct_answer_indices"] = sorted(indices)

    def convert_cloze(self, item, output, label, status):
        output.pop("cloze_answers", None)
        template = item.get("cloze_template")
        if not isinstance(template, str) or not template.strip():
            self.error(label, "缺少 cloze_template")
            return
        numbers = [int(match) for match in PLACEHOLDER_RE.findall(template)]
        expected = list(range(1, len(numbers) + 1))
        if numbers != expected:
            self.error(label, f"cloze_template 的空格必須依序為 (1)、(2)…且不可重複，目前是 {numbers}")

        raw_options = item.get("cloze_options")
        if isinstance(raw_options, str):
            raw_options = [raw_options] * len(numbers)
        if not isinstance(raw_options, list) or not raw_options:
            self.error(label, "缺少 cloze_options")
            return
        options = []
        for index, entry in enumerate(raw_options):
            if isinstance(entry, str):
                if entry not in CLOZE_PRESETS:
                    self.error(label, f"未知的 cloze_options 預設：{entry}")
                    return
                entry = CLOZE_PRESETS[entry]
            if not isinstance(entry, list) or len(entry) < 2:
                self.error(label, f"第 {index + 1} 格的選項至少要兩個")
                return
            options.append([str(token) for token in entry])
        output["cloze_options"] = options
        if len(options) != len(numbers):
            self.error(label, f"cloze_options 有 {len(options)} 組，但模板有 {len(numbers)} 個空格")
            return

        answers = item.get("cloze_answers")
        if status == "placeholder" and not answers:
            output["cloze_answer_indices"] = [0] * len(options)
            return
        if not isinstance(answers, list) or len(answers) != len(options):
            self.error(label, f"cloze_answers 必須有 {len(options)} 個")
            return
        indices = []
        for index, answer in enumerate(answers):
            tokens = options[index]
            if str(answer) in tokens and tokens.count(str(answer)) == 1:
                indices.append(tokens.index(str(answer)))
                continue
            normalized = [normalize_token(token) for token in tokens]
            if normalized.count(normalize_token(answer)) == 1:
                indices.append(normalized.index(normalize_token(answer)))
            else:
                self.error(label, f"第 {index + 1} 格的答案 {answer!r} 不在選項內")
        output["cloze_answer_indices"] = indices

    def convert_part(self, item, label, in_group):
        if not isinstance(item, dict):
            self.error(label, "必須是物件")
            return {}
        question_type = item.get("question_type")
        if question_type not in (PART_TYPES if in_group else QUESTION_TYPES):
            self.error(label, f"不支援的題型：{question_type!r}")
            return {}
        output = self.common(item, label)
        if in_group and "explanation" in item:
            self.error(label, "詳解只能寫在整題，不能寫在小題")
        if question_type in ("choice", "multi", "cloze"):
            status = self.record_status(item, label, question_type)
            convert = {"choice": self.convert_choice, "multi": self.convert_multi, "cloze": self.convert_cloze}[question_type]
            convert(item, output, label, status)
        return output

    def convert_question(self, item, label, points):
        output = self.convert_part(item, label, in_group=False)
        if not output:
            return output
        output.setdefault("display_type", "text")
        if points is not None:
            output["points"] = points
        if output.get("question_type") != "group":
            return output
        parts = item.get("group_questions")
        if not isinstance(parts, list) or not parts:
            self.error(label, "題組缺少 group_questions")
            return output
        part_points = split_points(points, len(parts)) if points is not None else [None] * len(parts)
        converted = []
        for index, part in enumerate(parts):
            part_label = f"{label} 小題 {index + 1}"
            part_output = self.convert_part(part, part_label, in_group=True)
            if part_points[index] is not None:
                part_output["points"] = part_points[index]
            converted.append(part_output)
        output["group_questions"] = converted
        return output

    def check_points(self, question, label):
        points = question.get("points")
        if not isinstance(points, (int, float)) or isinstance(points, bool) or points <= 0:
            self.error(label, f"points 必須大於 0，目前是 {points!r}")
            return
        if question.get("question_type") != "group":
            return
        total = 0
        for index, part in enumerate(question.get("group_questions", [])):
            part_points = part.get("points")
            if not isinstance(part_points, (int, float)) or isinstance(part_points, bool) or part_points <= 0:
                self.error(f"{label} 小題 {index + 1}", f"points 必須大於 0，目前是 {part_points!r}")
                return
            total += part_points
        if abs(total - points) > 1e-6:
            self.error(label, f"小題配分加總 {round(total, 2)} 不等於題組配分 {points}")

    def check_meta(self, meta):
        if not isinstance(meta, dict):
            self.error("meta", "必須是物件")
            return {}
        quiz_id = meta.get("quiz_id")
        if not isinstance(quiz_id, str) or not QUIZ_ID_RE.match(quiz_id):
            self.error("meta.quiz_id", f"只能用文字、數字、底線與連字號：{quiz_id!r}")
        if not isinstance(meta.get("title"), str) or not meta.get("title", "").strip():
            self.error("meta.title", "不能留空")
        if meta.get("kind", "exam") not in ("exam", "homework"):
            self.error("meta.kind", "必須是 exam 或 homework")
        limit = meta.get("time_limit_minutes")
        if limit is not None and (not isinstance(limit, (int, float)) or isinstance(limit, bool) or limit <= 0):
            self.error("meta.time_limit_minutes", "必須是 null 或大於 0 的數字")
        return {
            "quiz_id": quiz_id,
            "title": meta.get("title"),
            "topic": str(meta.get("topic") or ""),
            "description": str(meta.get("description") or ""),
            "kind": meta.get("kind", "exam"),
            "time_limit_minutes": limit,
        }


def question_label(question, index):
    source = question.get("source_label") if isinstance(question, dict) else None
    return f"第 {index + 1} 題" + (f"（{source}）" if source else "")


def main():
    parser = argparse.ArgumentParser(description="產生考卷 zip")
    parser.add_argument("draft", type=Path)
    parser.add_argument("--images", type=Path, default=Path("images"))
    parser.add_argument("--out", type=Path, default=Path("dist"))
    parser.add_argument("--split-points", type=float)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    try:
        draft = json.loads(args.draft.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"無法讀取 draft：{error}")
    questions = draft.get("questions") if isinstance(draft, dict) else None
    if not isinstance(questions, list) or not questions:
        raise SystemExit("draft 必須有非空的 questions 陣列")
    if args.split_points is not None and args.split_points <= 0:
        raise SystemExit("--split-points 必須大於 0")

    builder = Builder()
    meta = builder.check_meta(draft.get("meta"))
    points = split_points(args.split_points, len(questions)) if args.split_points else [None] * len(questions)
    output_questions = []
    for index, question in enumerate(questions):
        label = question_label(question, index)
        converted = builder.convert_question(question, label, points[index])
        if converted:
            builder.check_points(converted, label)
        output_questions.append(converted)

    payload = {}
    for reference in sorted(builder.images):
        path = args.images / Path(reference).name
        if not path.is_file():
            builder.error(reference, f"找不到圖片：{path}")
            continue
        data = path.read_bytes()
        if len(data) > IMAGE_MAX_BYTES:
            builder.error(reference, f"圖片超過 900 KB（{len(data) / 1024:.0f} KB）")
        expected = {".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp"}.get(path.suffix.lower())
        if expected is None or image_kind(data) != expected:
            builder.error(reference, "只接受副檔名與內容相符的 PNG、JPEG、WebP")
        payload[reference] = data
    if len(payload) + 1 > MAX_FILES:
        builder.error("zip", f"檔案數超過 {MAX_FILES}")

    if args.images.is_dir():
        referenced = {Path(reference).name for reference in builder.images}
        for path in sorted(args.images.iterdir()):
            if path.is_file() and path.name not in referenced and not path.name.startswith("."):
                builder.warnings.append(f"未被引用的圖片不會打包：{path.name}")

    for warning in builder.warnings:
        print(f"警告：{warning}")
    if builder.errors:
        print(f"驗證失敗，共 {len(builder.errors)} 個錯誤：", file=sys.stderr)
        for error in builder.errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    package = {"format_version": 1, "meta": meta, "questions": output_questions}
    json_bytes = json.dumps(package, ensure_ascii=False, indent=2).encode("utf-8")
    if len(json_bytes) > JSON_MAX_BYTES:
        print(f"驗證失敗：JSON 超過 900 KB（{len(json_bytes) / 1024:.0f} KB）", file=sys.stderr)
        return 1

    total = round(sum(question["points"] for question in output_questions), 2)
    target = args.out / f"{meta['quiz_id']}.zip"
    if not args.check:
        args.out.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(f"{meta['quiz_id']}.json", json_bytes)
            for reference, data in payload.items():
                archive.writestr(reference, data)
        if target.stat().st_size > ZIP_MAX_BYTES:
            target.unlink()
            print("驗證失敗：zip 超過 20 MB，請減少或壓縮圖片", file=sys.stderr)
            return 1

    print(f"題數：{len(output_questions)}　總分：{total}　圖片：{len(payload)} 張")
    print(f"配分來源：{'依 --split-points 平均分配' if args.split_points else 'draft 內的 points'}")
    print(f"答案：題本 {builder.book_answers} 項、AI 推算 {len(builder.ai_answers)} 項、佔位 {len(builder.placeholder_answers)} 項")
    for title, items in (("AI 推算答案", builder.ai_answers), ("佔位答案", builder.placeholder_answers), ("低信心", builder.low_confidence)):
        if items:
            print(f"{title}：")
            for item in items:
                print(f"  - {item}")
    print("驗證通過（未產生 zip）" if args.check else f"已產生：{target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
