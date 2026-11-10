#!/usr/bin/env python3
"""把題本（PDF、圖片或圖片資料夾）轉成頁面 PNG，供模型閱讀與定位裁切範圍。

用法：
  python3 render_pages.py <題本.pdf|圖片|資料夾> --out pages [--pages 1-5,8] [--dpi 200]

輸出（頁碼一律是原檔的頁碼，從 1 起算）：
  pages/page-003.png        給 crop_images.py 使用的乾淨頁面
  pages/page-003.grid.png   疊上 0~1 座標格線的頁面，用來讀 bbox
  pages/page-003.txt        電子檔的文字層（掃描檔沒有），用來核對數字
  pages/pages.json          每頁的檔名、尺寸與是否有文字層
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}


def parse_ranges(spec, last_page):
    if not spec:
        return list(range(1, last_page + 1))
    pages = set()
    for chunk in spec.split(","):
        start, _, end = chunk.strip().partition("-")
        first = int(start)
        last = int(end) if end else first
        if first < 1 or last > last_page or first > last:
            raise SystemExit(f"頁碼範圍不正確：{chunk}（共 {last_page} 頁）")
        pages.update(range(first, last + 1))
    return sorted(pages)


def render_pdf_pymupdf(pdf, pages_spec, dpi, out):
    import pymupdf

    doc = pymupdf.open(pdf)
    texts = {}
    numbers = parse_ranges(pages_spec, doc.page_count)
    for number in numbers:
        page = doc[number - 1]
        page.get_pixmap(dpi=dpi).save(out / f"page-{number:03d}.png")
        texts[number] = page.get_text()
    return numbers, texts


def render_pdf_poppler(pdf, pages_spec, dpi, out):
    if not shutil.which("pdftoppm") or not shutil.which("pdfinfo"):
        raise SystemExit("需要 PyMuPDF（pip install pymupdf）或 poppler（pdftoppm、pdfinfo）")
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    last_page = next(int(line.split()[1]) for line in info.splitlines() if line.startswith("Pages:"))
    numbers = parse_ranges(pages_spec, last_page)
    texts = {}
    with tempfile.TemporaryDirectory() as tmp:
        for number in numbers:
            prefix = Path(tmp) / f"p{number}"
            subprocess.run(
                ["pdftoppm", "-r", str(dpi), "-f", str(number), "-l", str(number), "-png", str(pdf), str(prefix)],
                check=True,
            )
            shutil.move(str(next(Path(tmp).glob(f"p{number}-*.png"))), out / f"page-{number:03d}.png")
            if shutil.which("pdftotext"):
                texts[number] = subprocess.run(
                    ["pdftotext", "-f", str(number), "-l", str(number), "-layout", str(pdf), "-"],
                    capture_output=True, text=True, check=True,
                ).stdout
    return numbers, texts


def render_images(files, pages_spec, out):
    numbers = parse_ranges(pages_spec, len(files))
    for number in numbers:
        with Image.open(files[number - 1]) as image:
            ImageOps.exif_transpose(image).convert("RGB").save(out / f"page-{number:03d}.png")
    return numbers, {}


def draw_grid(source, target):
    with Image.open(source) as image:
        canvas = image.convert("RGB")
    draw = ImageDraw.Draw(canvas)
    width, height = canvas.size
    font_size = max(14, width // 60)
    for step in range(1, 20):
        major = step % 2 == 0
        colour = (220, 40, 40) if major else (245, 170, 170)
        x, y = width * step / 20, height * step / 20
        draw.line([(x, 0), (x, height)], fill=colour, width=2 if major else 1)
        draw.line([(0, y), (width, y)], fill=colour, width=2 if major else 1)
        if major:
            label = f"{step / 20:.1f}"
            draw.text((x + 3, 3), label, fill=(200, 0, 0), font_size=font_size)
            draw.text((3, y + 3), label, fill=(200, 0, 0), font_size=font_size)
    canvas.save(target)


def main():
    parser = argparse.ArgumentParser(description="把題本轉成頁面 PNG")
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, default=Path("pages"))
    parser.add_argument("--pages", help="例如 1-5,8；省略表示全部")
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"找不到：{args.input}")
    args.out.mkdir(parents=True, exist_ok=True)

    if args.input.is_dir():
        files = sorted(path for path in args.input.iterdir() if path.suffix.lower() in IMAGE_EXTS)
        if not files:
            raise SystemExit(f"資料夾內沒有圖片：{args.input}")
        numbers, texts = render_images(files, args.pages, args.out)
    elif args.input.suffix.lower() == ".pdf":
        try:
            numbers, texts = render_pdf_pymupdf(args.input, args.pages, args.dpi, args.out)
        except ImportError:
            numbers, texts = render_pdf_poppler(args.input, args.pages, args.dpi, args.out)
    elif args.input.suffix.lower() in IMAGE_EXTS:
        numbers, texts = render_images([args.input], args.pages, args.out)
    else:
        raise SystemExit(f"不支援的檔案類型：{args.input.suffix}")

    manifest = []
    for number in numbers:
        png = args.out / f"page-{number:03d}.png"
        draw_grid(png, args.out / f"page-{number:03d}.grid.png")
        text = (texts.get(number) or "").strip()
        if text:
            (args.out / f"page-{number:03d}.txt").write_text(text, encoding="utf-8")
        with Image.open(png) as image:
            width, height = image.size
        manifest.append({"page": number, "file": png.name, "width": width, "height": height, "has_text_layer": bool(text)})

    (args.out / "pages.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    with_text = sum(item["has_text_layer"] for item in manifest)
    print(f"已輸出 {len(manifest)} 頁到 {args.out}（{with_text} 頁有文字層）")


if __name__ == "__main__":
    sys.exit(main())
