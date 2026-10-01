// 產生 PWA 所需的 PNG 圖示：米色紙底＋圓形印章，中間是明朝體「成」。
// 更換圖示設計時請一併更換檔名（例如 app-icon → app-icon2），手機才會重新抓取，不會沿用舊圖示。
// 用法：node scripts/make-icons.mjs（需要 Playwright 與 Chromium；字型使用 app/fonts 內建字型）

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'app', 'icons');
const font = async (name) => (await readFile(join(root, 'app', 'fonts', name))).toString('base64');

const BG = '#F3EBDF';
const ACCENT = '#94706B'; // 霧粉
const RING = 'SUCCESS JOURNAL · LITTLE WINS · ';

function iconHtml(size, serif700, latin) {
  const r = size * 0.33;
  const c = size / 2;
  const chars = [...RING];
  const ring = chars
    .map((ch, i) => {
      const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * r * 0.8;
      const y = c + Math.sin(a) * r * 0.8;
      return `<text x="${x}" y="${y}" transform="rotate(${(a * 180) / Math.PI + 90} ${x} ${y})" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
    })
    .join('');
  return `<!doctype html><html><head><style>
    @font-face { font-family: 'I Serif'; src: url(data:font/woff2;base64,${serif700}); font-weight: 700; }
    @font-face { font-family: 'I Latin'; src: url(data:font/woff2;base64,${latin}); }
    body { margin: 0; }
  </style></head><body>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="${ACCENT}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.62}" fill="none" stroke="${BG}" stroke-width="${size * 0.004}" opacity="0.7"/>
    <g font-family="'I Latin'" font-size="${size * 0.034}" fill="${BG}">${ring}</g>
    <text x="${c}" y="${c + size * 0.008}" text-anchor="middle" dominant-baseline="central" font-family="'I Serif'" font-weight="700" font-size="${size * 0.26}" fill="${BG}">成</text>
  </svg></body></html>`;
}

const outputs = [
  ['app-icon-192.png', 192],
  ['app-icon-512.png', 512],
  ['app-apple-touch-icon.png', 180],
  // 圖案都在中心 80% 的安全區域內，可直接作為 maskable 圖示
  ['app-icon-maskable-512.png', 512],
  ['app-favicon-64.png', 64],
];

const serif700 = await font('noto-serif-tc-700.woff2');
const latin = await font('cormorant-500.woff2');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconHtml(size, serif700, latin));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(iconsDir, name) });
  console.log(`✓ ${name}`);
}
await browser.close();
