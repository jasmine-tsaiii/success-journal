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
  assert.equal(await page.textContent('#current-date-text'), '2026.10.01');
  assert.equal(await page.textContent('#current-week'), 'Thu · 週四');
  assert.equal(await page.textContent('#issue-no'), 'No.274');
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
  assert.equal(await todayCell.evaluate((el) => el.style.getPropertyValue('--dot')), '#6F9478'); // 心輪綠
  await page.click('#prev-month');
  const yCell = page.locator('.cal-cell[data-date="2026-09-30"]');
  assert.equal(await yCell.evaluate((el) => el.style.getPropertyValue('--dot')), '#BF9B43'); // 太陽神經叢輪黃
  await yCell.click();
  assert.match(await page.textContent('#day-detail'), /完成一份報告/);
  await shot(page, '02-calendar');

  // 從回顧編輯過去的某天
  await page.click('#edit-day');
  assert.equal(await page.textContent('#current-date-text'), '2026.09.30');
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
  assert.equal(await page.textContent('#view-today .mast-title'), '成功日記');
  assert.ok(await page.evaluate(() => document.fonts.check("500 16px 'SJ Serif'", '成功')), '離線時內建字型也要能載入');
  assert.equal(await page.inputValue('#item-0'), '離線也能寫');
  assert.ok((await page.textContent('#chakra-name')).length > 0);
  await context.close();
});

/* ---------- 願景板 ---------- */

async function makePhotos(page) {
  const specs = [
    ['beach.png', 600, 400, ['#9ec9e8', '#f6e3c5']],
    ['flower.png', 400, 600, ['#f2c4d4', '#c9b6e3']],
    ['forest.png', 500, 500, ['#a9cfa9', '#f8f4ee']],
  ];
  const out = [];
  for (const [name, w, h, [c1, c2]] of specs) {
    const dataUrl = await page.evaluate(
      ({ w, h, c1, c2 }) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(w * 0.7, h * 0.3, Math.min(w, h) * 0.15, 0, Math.PI * 2);
        ctx.fill();
        return c.toDataURL('image/png');
      },
      { w, h, c1, c2 },
    );
    out.push({ name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  }
  return out;
}

const boxOf = (page, sel) => page.locator(sel).first().evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width }));
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

const boardsInStorage = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.boards.v1')));

test('願景板：預設封面、點照片格加照片、版型、色調、文字、素材、調整、復原、存成桌布、備份還原', async () => {
  const { context, page, errors } = await newPage();

  // 第一次進來：直接開一張預設的封面願景板
  await page.click('#tab-dreams');
  assert.equal(await page.isVisible('#board-editor'), true);
  assert.equal(await page.inputValue('#board-title'), '我的願景板');
  assert.equal(await page.getAttribute('#board-stage', 'data-palette'), 'rose');
  assert.equal(await page.locator('#board-stage .empty-slot').count(), 1);
  assert.match(await page.textContent('#board-stage'), /2027 的我/);

  // 點空白照片格 → 開啟相簿，一次選 3 張：1 張進格子，2 張放旁邊
  const photos = await makePhotos(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#board-stage .empty-slot')]);
  await chooser.setFiles(photos);
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('#board-stage .type-photo img')];
    return imgs.length === 3 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
  assert.equal(await page.locator('#board-stage .empty-slot').count(), 0);
  assert.match(await page.textContent('#toast'), /右下角/);

  // 換成格狀版型：3 張照片都進格子
  await page.click('.tool[data-panel="template"]');
  await page.click('.template-btn[data-template="grid"]');
  let board = (await boardsInStorage(page))[0];
  assert.equal(board.template, 'grid');
  assert.equal(board.items.filter((i) => i.type === 'photo' && i.tpl && i.imageId).length, 3);
  assert.equal(await page.locator('#board-stage .empty-slot').count(), 3);
  await shot(page, '10-board-grid');

  // 色調：深色星夜
  await page.click('.tool[data-panel="palette"]');
  assert.equal(await page.locator('#palette-light .palette-btn').count(), 6);
  assert.equal(await page.locator('#palette-dark .palette-btn').count(), 4);
  await page.click('.palette-btn[data-palette="starry"]');
  assert.equal(await page.getAttribute('#board-stage', 'data-palette'), 'starry');
  assert.equal(await page.locator('#board-stage .board-stars').count(), 1);

  // 回到封面，加上文字（英文斜體）與素材
  await page.click('.tool[data-panel="template"]');
  await page.click('.template-btn[data-template="cover"]');
  await page.click('.tool[data-panel="text"]');
  await page.click('#word-ideas .chip >> text=good things are coming');
  await page.click('#text-add');
  assert.equal(await page.locator('#board-stage .style-en', { hasText: 'good things are coming' }).count(), 1);
  await page.click('.tool[data-panel="sticker"]');
  await page.click('.sticker-btn[data-sticker="leaf"]');
  await page.click('.sticker-btn[data-sticker="stamp-ring"]');
  assert.equal(await page.locator('#board-stage .type-sticker').count(), 4); // 版型的膠帶、印章 + 2

  // 編輯標題
  await page.locator('#board-stage').scrollIntoViewIfNeeded();
  await page.click('#board-stage .board-item[data-id] >> text=2027 的我');
  await page.click('#sel-edit');
  await page.fill('#text-input', '溫柔的一年');
  await page.click('#text-add');
  board = (await boardsInStorage(page))[0];
  const title = board.items.find((i) => i.role === 'title');
  assert.equal(title.text, '溫柔的一年');
  assert.equal(title.edited, true);

  // 拖曳移動
  const leaf = page.locator('#board-stage .type-sticker').last();
  const id = await leaf.getAttribute('data-id');
  await page.locator('#board-stage').scrollIntoViewIfNeeded();
  const lb = await leaf.boundingBox();
  const start = (await boardsInStorage(page))[0].items.find((i) => i.id === id);
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width / 2 - 40, lb.y + lb.height / 2 - 30, { steps: 5 });
  await page.mouse.up();
  const moved = (await boardsInStorage(page))[0].items.find((i) => i.id === id);
  assert.ok(moved.x < start.x - 50 && moved.y < start.y - 40, '拖曳後位置要改變並儲存');

  // 放大、刪除與復原
  await page.click('#selection-bar [data-act="bigger"]');
  assert.ok((await boardsInStorage(page))[0].items.find((i) => i.id === id).w > moved.w);
  const count = await page.locator('#board-stage .board-item').count();
  await page.click('#selection-bar [data-act="delete"]');
  assert.equal(await page.locator('#board-stage .board-item').count(), count - 1);
  await page.click('#board-undo');
  assert.equal(await page.locator('#board-stage .board-item').count(), count);

  // 換照片：選取封面照片 → 換照片
  await page.click('#board-stage .board-item.type-photo >> nth=0', { position: { x: 20, y: 20 } });
  assert.equal(await page.textContent('#sel-photo'), '換照片');

  await page.fill('#board-title', '2027 的我');
  await page.click('#board-stage', { position: { x: 3, y: 3 } });
  await shot(page, '11-board-editor');

  // 存成桌布
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#board-export')]);
  assert.match(dl.suggestedFilename(), /^vision-board-20261001\.png$/);
  const png = await readFile(await dl.path());
  assert.deepEqual(pngSize(png), [1080, 1920]);
  if (SCREENSHOT_DIR) await import('node:fs/promises').then((fs) => fs.writeFile(join(SCREENSHOT_DIR, '12-wallpaper.png'), png));

  // 重新整理後仍在（照片存在 IndexedDB）
  await page.reload();
  await page.click('#tab-dreams');
  assert.equal(await page.textContent('.board-card-title'), '2027 的我');
  await page.click('#new-board');
  assert.equal(await page.inputValue('#board-title'), '我的願景板 2');
  await page.click('#board-back');
  assert.equal(await page.locator('.board-card').count(), 2);
  await page.click('.board-card:has(.board-card-title:text-is("2027 的我"))');
  await page.waitForFunction(() => [...document.querySelectorAll('#board-stage .type-photo img')].every((i) => i.naturalWidth > 0));

  // 備份（含照片）→ 清空 → 還原
  await page.click('#tab-data');
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
  const backup = JSON.parse(await readFile(await jsonDl.path(), 'utf8'));
  assert.equal(backup.version, 2);
  assert.equal(backup.boards.length, 2);
  assert.equal(Object.keys(backup.images).length, 3);

  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('success-journal');
      req.onsuccess = req.onerror = req.onblocked = r;
    });
  });
  await page.reload();
  page.once('dialog', (d) => d.accept());
  await page.click('#tab-data');
  await page.setInputFiles('#import-file', await jsonDl.path());
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('2 個願景板'));
  await page.click('#tab-dreams');
  await page.click('.board-card:has(.board-card-title:text-is("2027 的我"))');
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('#board-stage .type-photo img')];
    return imgs.length === 3 && imgs.every((i) => i.naturalWidth > 0);
  });
  assert.equal(await page.getAttribute('#board-stage', 'data-palette'), 'starry');

  // 刪除兩個願景板後，照片也清掉
  for (let i = 0; i < 2; i++) {
    if (await page.isVisible('#boards-list')) await page.click('.board-card >> nth=0');
    page.once('dialog', (d) => d.accept());
    await page.click('#board-delete');
  }
  assert.equal(await page.locator('.board-card').count(), 0);
  const countImages = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('success-journal', 1);
          req.onsuccess = () => {
            const r = req.result.transaction('images').objectStore('images').count();
            r.onsuccess = () => resolve(r.result);
          };
        }),
    );
  let imagesLeft = await countImages();
  for (let i = 0; i < 20 && imagesLeft > 0; i++) {
    await page.waitForTimeout(100);
    imagesLeft = await countImages();
  }
  assert.equal(imagesLeft, 0, '刪除願景板後，沒用到的照片也要清掉');

  assert.deepEqual(errors, []);
  await context.close();
});

test('外觀：可以切換深色模式，重新整理後仍保留', async () => {
  const { context, page } = await newPage();
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await bg(), 'rgb(243, 235, 223)');
  await page.click('#tab-data');
  await page.click('.segmented label:has-text("深色")');
  assert.equal(await bg(), 'rgb(29, 34, 56)');
  await page.reload();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await shot(page, '13-today-dark');
  await context.close();
});

test('設定：可以關閉脈輪名稱，只保留色彩與肯定語', async () => {
  const { context, page } = await newPage();
  assert.equal(await page.textContent('#chakra-name'), '心輪');
  await page.click('#tab-data');
  await page.uncheck('#setting-chakra');
  await page.click('#tab-today');
  assert.equal(await page.isHidden('#chakra-name'), true);
  assert.match(await page.textContent('.chakra-tag'), /今日色彩・綠色/);
  assert.ok((await page.textContent('#chakra-affirmation')).length > 5);
  await page.reload();
  assert.equal(await page.isHidden('#chakra-name'), true);
  await context.close();
});

test('標籤：點選、#hashtag、自訂標籤、成功類型統計與每月表格', async () => {
  const { context, page, errors } = await newPage();
  await page.fill('#item-0', '完成提案 #工作');
  await page.fill('#item-1', '傍晚去散步');
  await page.fill('#item-2', '十分鐘冥想');
  await page.locator('#item-2').blur();

  // 平常不顯示「#」，只有正在寫的那一件才出現
  assert.equal(await page.isVisible('#tags-0 .tag-toggle'), false);
  assert.equal(await page.isVisible('#tags-2 .tag-toggle'), true);
  // 第二件：點「#」→ 健康
  await page.click('#item-1');
  await page.click('#tags-1 .tag-toggle');
  await page.click('#tags-1 .tag-picker .tag-chip >> text=健康');
  // 第三件：自訂標籤「冥想」，同時勾選「自我照顧」
  await page.click('#item-2');
  await page.click('#tags-2 .tag-toggle');
  await page.fill('#tags-2 .tag-new input', '#冥想');
  await page.click('#tags-2 .tag-new button');
  await page.click('#tags-2 .tag-picker .tag-chip >> text=自我照顧');
  await page.click('#tags-2 .tag-toggle');
  assert.equal(await page.textContent('#tags-2 .tag-list'), '#冥想 #自我照顧');
  assert.equal(await page.textContent('#tags-1 .tag-list'), '#健康');
  // 點在其他地方：「#」收起，已選標籤仍以小字顯示
  await page.click('.prompt-text');
  assert.equal(await page.isVisible('#tags-2 .tag-toggle'), false);
  assert.equal(await page.isVisible('#tags-2 .tag-list'), true);
  assert.equal(await page.locator('#tags-0 .tag-list').count(), 0, '文字裡的 #標籤 不重複顯示');
  await shot(page, '20-tags-today');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.entries.v1'))['2026-10-01']);
  assert.deepEqual(stored.tags, [[], ['健康'], ['冥想', '自我照顧']]);

  // 昨天也記一筆工作，讓工作成為本月最多
  await page.click('#prev-day');
  await page.fill('#item-0', '回完所有信件');
  await page.click('#item-0');
  await page.click('#tags-0 .tag-toggle');
  await page.click('#tags-0 .tag-picker .tag-chip >> text=工作');

  await page.click('#tab-calendar');
  assert.match(await page.textContent('#tag-hero'), /本月最多的是 #工作：1 件/);
  await page.click('.segmented.period label:has-text("全部")');
  assert.match(await page.textContent('#tag-hero'), /全部最多的是 #工作：2 件，佔 50%/);
  const bars = await page.locator('#tag-bars .tag-bar-label').allTextContents();
  assert.equal(bars[0], '#工作'); // 同件數的順序依語系排序，只檢查第一名與內容
  assert.deepEqual([...bars].sort(), ['#工作', '#冥想', '#健康', '#自我照顧'].sort());
  const firstRow = await page.locator('#tag-table tbody tr').first().locator('th, td').allTextContents();
  assert.deepEqual(firstRow, ['#工作', '–', '–', '1', '1']);
  await shot(page, '21-tags-report');

  // 當日詳情顯示標籤
  await page.click('.cal-cell[data-date="2026-10-01"]');
  assert.match(await page.textContent('#day-detail'), /#冥想 #自我照顧/);

  // 設定頁：新的標籤自動出現，可以移除
  await page.click('#tab-data');
  const manage = await page.locator('#tag-manage .tag-chip').allTextContents();
  assert.ok(manage.some((t) => t.startsWith('#冥想')));
  await page.click('#tag-manage [aria-label="移除標籤 學習"]');
  assert.ok(!(await page.locator('#tag-manage').textContent()).includes('#學習'));

  // 備份含標籤
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
  const backup = JSON.parse(await readFile(await dl.path(), 'utf8'));
  assert.ok(backup.tags.includes('冥想') && !backup.tags.includes('學習'));
  assert.deepEqual(backup.entries['2026-09-30'].tags[0], ['工作']);

  assert.deepEqual(errors, []);
  await context.close();
});

test('隱私提醒：預設收合成一行，按 × 之後 7 天內不再出現', async () => {
  const { context, page } = await newPage();
  assert.equal(await page.isVisible('#privacy-note'), true);
  assert.equal(await page.isVisible('#privacy-note details > p'), false, '預設收合');
  await page.click('#privacy-note summary');
  assert.equal(await page.isVisible('#privacy-note details > p'), true);
  await page.click('#privacy-close');
  assert.equal(await page.isHidden('#privacy-note'), true);
  await page.reload();
  assert.equal(await page.isHidden('#privacy-note'), true, '7 天內不顯示');
  // 模擬 8 天前收起
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('success-journal.settings.v1'));
    s.privacyNoteHiddenAt = new Date(Date.now() - 8 * 86400000).toISOString();
    localStorage.setItem('success-journal.settings.v1', JSON.stringify(s));
  });
  await page.reload();
  assert.equal(await page.isVisible('#privacy-note'), true, '超過 7 天再提醒');
  await context.close();
});
