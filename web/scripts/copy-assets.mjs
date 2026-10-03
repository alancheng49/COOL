// 建置後把題目圖片複製進 dist,讓 Firebase Hosting 靜態提供
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, '..', 'questions', 'images');
const dst = join(root, 'dist', 'questions', 'images');
if (existsSync(src)) {
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('copied questions/images -> dist/questions/images');
} else {
  console.log('no questions/images folder, skip');
}
