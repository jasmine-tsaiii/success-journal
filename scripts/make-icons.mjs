// 由 app/icons/icon.svg 產生 PWA 所需的 PNG 圖示。
// 用法：node scripts/make-icons.mjs（需要 Playwright 與 Chromium）

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'app', 'icons');
const svg = await readFile(join(iconsDir, 'icon.svg'), 'utf8');

const outputs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  // 圖案都在中心 80% 的安全區域內，可直接作為 maskable 圖示
  ['icon-maskable-512.png', 512],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`,
  );
  await page.screenshot({ path: join(iconsDir, name), omitBackground: false });
  console.log(`✓ ${name}`);
}
await browser.close();
