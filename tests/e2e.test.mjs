// 端對端測試：以 /success-journal/ 子路徑提供網站（模擬 GitHub Pages），用 Chromium 操作主要功能。
// 用法：npm run test:e2e

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const BASE = '/success-journal/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR;

let server;
let origin;
let browser;

before(async () => {
  server = http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    let rel = normalize(path.slice(BASE.length));
    if (rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
    if (rel.startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(join(APP_DIR, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function newPage({ date = '2026-10-01T09:00:00' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'zh-TW' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  if (date) await page.clock.install({ time: new Date(date) });
  await page.goto(origin + BASE);
  return { context, page, errors };
}

const shot = async (page, name) => {
  if (SCREENSHOT_DIR) await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
};

test('首頁顯示當日脈輪、引導問題、肯定語與隱私說明', async () => {
  const { context, page, errors } = await newPage();
  assert.equal(await page.title(), '成功日記');
  assert.equal(await page.textContent('#current-date-text'), '2026 年 10 月 1 日（週四）');
  assert.equal(await page.textContent('#chakra-name'), '心輪');
  assert.equal(await page.textContent('#chakra-color-name'), '綠色');
  assert.ok((await page.textContent('#chakra-prompt')).length > 5);
  assert.ok((await page.textContent('#chakra-affirmation')).length > 5);
  assert.match(await page.textContent('.note-card'), /只存在這台裝置[\s\S]*備份/);
  assert.ok(await page.isDisabled('#next-day'), '不能前往未來的日期');
  await shot(page, '01-today');
  assert.deepEqual(errors, []);
  await context.close();
});

test('記錄、自動儲存、編輯過去、月曆回顧、匯出與匯入', async () => {
  const { context, page, errors } = await newPage();

  // 今天寫三件
  await page.fill('#item-0', '準時起床，喝了一杯溫水');
  await page.fill('#item-1', '對同事說了謝謝');
  await page.fill('#item-2', '散步二十分鐘');
  await page.locator('#item-2').blur();
  await page.waitForFunction(() => document.getElementById('save-status').textContent.includes('已儲存'));

  // 重新整理後仍在
  await page.reload();
  assert.equal(await page.inputValue('#item-1'), '對同事說了謝謝');

  // 補寫昨天
  await page.click('#prev-day');
  assert.equal(await page.textContent('#chakra-name'), '太陽神經叢輪');
  assert.equal(await page.isHidden('#go-today'), false);
  await page.fill('#item-0', '完成一份報告');
  await page.locator('#item-0').blur();
  await page.click('#go-today');
  assert.equal(await page.inputValue('#item-0'), '準時起床，喝了一杯溫水');

  // 月曆回顧
  await page.click('#tab-calendar');
  assert.equal(await page.textContent('#stat-streak'), '2');
  assert.equal(await page.textContent('#stat-items'), '4');
  assert.equal(await page.textContent('#stat-days'), '2');
  assert.equal(await page.textContent('#month-title'), '2026 年 10 月');
  const todayCell = page.locator('.cal-cell[data-date="2026-10-01"]');
  assert.match(await todayCell.getAttribute('class'), /recorded/);
  assert.equal(await todayCell.evaluate((el) => el.style.getPropertyValue('--dot')), '#7FB08C'); // 心輪綠
  await page.click('#prev-month');
  const yCell = page.locator('.cal-cell[data-date="2026-09-30"]');
  assert.equal(await yCell.evaluate((el) => el.style.getPropertyValue('--dot')), '#D9B44A'); // 太陽神經叢輪黃
  await yCell.click();
  assert.match(await page.textContent('#day-detail'), /完成一份報告/);
  await shot(page, '02-calendar');

  // 從回顧編輯過去的某天
  await page.click('#edit-day');
  assert.equal(await page.textContent('#current-date-text'), '2026 年 9 月 30 日（週三）');
  await page.fill('#item-1', '早點睡覺');
  await page.locator('#item-1').blur();

  // 匯出 JSON
  await page.click('#tab-data');
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
  assert.match(jsonDl.suggestedFilename(), /^success-journal-backup-20261001\.json$/);
  const backup = JSON.parse(await readFile(await jsonDl.path(), 'utf8'));
  assert.equal(backup.app, 'success-journal');
  assert.deepEqual(Object.keys(backup.entries), ['2026-09-30', '2026-10-01']);
  assert.deepEqual(backup.entries['2026-09-30'].items, ['完成一份報告', '早點睡覺', '']);

  // 匯出文字檔
  const [txtDl] = await Promise.all([page.waitForEvent('download'), page.click('#export-txt')]);
  const txt = await readFile(await txtDl.path(), 'utf8');
  assert.match(txt, /2026 年 10 月 1 日（週四）｜心輪\n {2}1\. 準時起床/);
  await shot(page, '03-backup');

  // 清空後匯入還原
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('#import-file', await jsonDl.path());
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('已匯入 2 天'));
  await page.click('#tab-today');
  assert.equal(await page.inputValue('#item-2'), '散步二十分鐘');
  await page.click('#tab-calendar');
  assert.equal(await page.textContent('#stat-items'), '5');

  // 錯誤檔案不會破壞資料
  await page.click('#tab-data');
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('匯入失敗'));
  await page.click('#tab-calendar');
  assert.equal(await page.textContent('#stat-items'), '5');

  assert.deepEqual(errors, []);
  await context.close();
});

test('清空某天的內容會移除該天紀錄', async () => {
  const { context, page } = await newPage();
  await page.fill('#item-0', '暫時的內容');
  await page.locator('#item-0').blur();
  await page.fill('#item-0', '');
  await page.locator('#item-0').blur();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.entries.v1')));
  assert.deepEqual(stored, {});
  await context.close();
});

test('PWA：manifest、圖示與離線開啟', async () => {
  const { context, page } = await newPage({ date: null });
  const manifest = await (await page.request.get(origin + BASE + 'manifest.webmanifest')).json();
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const res = await page.request.get(origin + BASE + icon.src);
    assert.equal(res.status(), 200, icon.src);
  }

  await page.evaluate(() => navigator.serviceWorker.ready);
  // 等待 SW 控制頁面並完成預先快取
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.fill('#item-0', '離線也能寫');
  await page.locator('#item-0').blur();

  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.textContent('.site-title'), '成功日記');
  assert.equal(await page.inputValue('#item-0'), '離線也能寫');
  assert.ok((await page.textContent('#chakra-name')).length > 0);
  await context.close();
});
