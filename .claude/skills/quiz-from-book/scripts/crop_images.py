#!/usr/bin/env python3
"""依 crops.json 從頁面 PNG 裁出題目用圖。

用法：
  python3 crop_images.py crops.json --pages pages --out images

crops.json：
  [{"name": "q03_fig1", "page": 3, "bbox": [0.12, 0.40, 0.55, 0.62]}]

bbox 是 [左, 上, 右, 下]，以頁面寬高為 1 的比例。預設會去除四周白邊；
加 "trim": false 可保留原框；圖混入淡黃、米色的背景浮水印時加 "remove_watermark": true。輸出優先用 PNG，超過 900 KB 才改用 JPEG 壓縮，
實際檔名會印出來，draft.json 必須引用印出的檔名。
"""

import argparse
import io
import json
import re
from pathlib import Path

from PIL import Image, ImageChops

IMAGE_MAX_BYTES = 900 * 1024
TRIM_PADDING = 12
JPEG_ATTEMPTS = [(1600, 85), (1400, 80), (1200, 75), (1000, 70), (800, 65)]


def trim_white(image):
    background = Image.new("RGB", image.size, (255, 255, 255))
    diff = ImageChops.difference(image, background).convert("L").point(lambda value: 255 if value > 24 else 0)
    box = diff.getbbox()
    if not box:
        return image
    left, top, right, bottom = box
    return image.crop((
        max(0, left - TRIM_PADDING),
        max(0, top - TRIM_PADDING),
        min(image.width, right + TRIM_PADDING),
        min(image.height, bottom + TRIM_PADDING),
    ))


def remove_watermark(image):
    """把淡黃、米色的底紋塗白；粉紅等 G 值較低的著色區域不受影響。"""
    red, green, _ = image.split()
    light_red = red.point(lambda value: 255 if value >= 235 else 0)
    light_green = green.point(lambda value: 255 if value >= 225 else 0)
    cleaned = image.copy()
    cleaned.paste((255, 255, 255), mask=ImageChops.multiply(light_red, light_green))
    return cleaned


def encode(image):
    """回傳 (副檔名, bytes)；PNG 太大時才縮圖轉 JPEG。"""
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    if buffer.tell() <= IMAGE_MAX_BYTES:
        return ".png", buffer.getvalue()
    for max_side, quality in JPEG_ATTEMPTS:
        attempt = image.copy()
        attempt.thumbnail((max_side, max_side))
        buffer = io.BytesIO()
        attempt.save(buffer, "JPEG", quality=quality)
        if buffer.tell() <= IMAGE_MAX_BYTES:
            return ".jpg", buffer.getvalue()
    raise ValueError("壓縮後仍超過 900 KB，請縮小裁切範圍")


def main():
    parser = argparse.ArgumentParser(description="裁切題目用圖")
    parser.add_argument("crops", type=Path)
    parser.add_argument("--pages", type=Path, default=Path("pages"))
    parser.add_argument("--out", type=Path, default=Path("images"))
    args = parser.parse_args()

    crops = json.loads(args.crops.read_text(encoding="utf-8"))
    if not isinstance(crops, list):
        raise SystemExit("crops.json 必須是陣列")
    args.out.mkdir(parents=True, exist_ok=True)

    errors = []
    seen = set()
    for index, crop in enumerate(crops):
        label = f"crops[{index}]"
        try:
            name = str(crop["name"])
            if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
                raise ValueError("name 只能用英數字、底線與連字號，且不含副檔名")
            if name in seen:
                raise ValueError(f"name 重複：{name}")
            seen.add(name)
            x0, y0, x1, y1 = (float(value) for value in crop["bbox"])
            if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
                raise ValueError(f"bbox 必須在 0~1 之間且左上小於右下：{crop['bbox']}")
            page_path = args.pages / f"page-{int(crop['page']):03d}.png"
            if not page_path.exists():
                raise ValueError(f"找不到頁面：{page_path}")
            with Image.open(page_path) as page:
                page = page.convert("RGB")
                box = (round(x0 * page.width), round(y0 * page.height), round(x1 * page.width), round(y1 * page.height))
                image = page.crop(box)
            if crop.get("remove_watermark"):
                image = remove_watermark(image)
            if crop.get("trim", True):
                image = trim_white(image)
            extension, data = encode(image)
            for stale in args.out.glob(f"{name}.*"):
                stale.unlink()
            (args.out / f"{name}{extension}").write_bytes(data)
            print(f"images/{name}{extension}  {image.width}x{image.height}  {len(data) / 1024:.1f} KB")
        except (KeyError, TypeError, ValueError) as error:
            errors.append(f"{label}：{error}")

    if errors:
        raise SystemExit("裁切失敗：\n" + "\n".join(f"  - {error}" for error in errors))


if __name__ == "__main__":
    main()
