// 端對端測試：以 /success-journal/ 子路徑提供網站（模擬 GitHub Pages），用 Chromium 操作主要功能。
// 用法：npm run test:e2e

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

async function newPage({ date = '2026-10-01T09:00:00', onboarding = false, cloud = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'zh-TW' });
  // 測試中不連到真正的 Google 與 Supabase；需要時改用假的伺服器
  if (cloud) await cloud.attach(context);
  else await context.route(/^https:\/\/(accounts\.google\.com|[a-z0-9]+\.supabase\.co)\//, (route) => route.abort());
  const page = await context.newPage();
  // 除了專門測試新手引導的情況，其餘測試直接略過引導
  if (!onboarding) {
    await page.addInitScript(() => {
      const key = 'success-journal.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) || '{}');
      if (!s.onboarded) localStorage.setItem(key, JSON.stringify({ ...s, onboarded: true }));
    });
  }
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
  assert.match(await page.textContent('.note-card'), /登入儲存資料[\s\S]*Google 帳號登入/);
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

test('新手引導：第一次打開顯示三步驟，完成後不再出現；已有紀錄的人不顯示', async () => {
  const { context, page } = await newPage({ onboarding: true });
  assert.equal(await page.isVisible('#onboarding'), true);
  assert.match(await page.textContent('#onboarding .ob-step:not([hidden]) .ob-title'), /每天寫下三件小成功/);
  await page.click('#ob-next');
  assert.match(await page.textContent('#onboarding .ob-step:not([hidden]) .ob-title'), /把願景放在眼前/);
  await page.click('#ob-next');
  assert.match(await page.textContent('#onboarding .ob-step:not([hidden]) .ob-title'), /登入，日記就不怕弄丟/);
  assert.ok((await page.textContent('#ob-install')).length > 10);
  assert.equal(await page.textContent('#ob-next'), '開始書寫');
  await shot(page, '40-onboarding');
  await page.click('#ob-next');
  assert.equal(await page.isHidden('#onboarding'), true);
  await page.reload();
  assert.equal(await page.isHidden('#onboarding'), true);
  await context.close();

  // 已經有紀錄（例如舊使用者更新版本）→ 不顯示引導
  const second = await newPage({ onboarding: true });
  await second.page.evaluate(() => {
    localStorage.setItem('success-journal.entries.v1', JSON.stringify({ '2026-09-30': { items: ['a', '', ''] } }));
    localStorage.removeItem('success-journal.settings.v1');
  });
  await second.page.reload();
  assert.equal(await second.page.isHidden('#onboarding'), true);
  await second.context.close();
});

test('備份提醒：記錄 3 天後還沒備份會提醒，備份後消失；14 天後再提醒；可延後', async () => {
  const { context, page } = await newPage();
  await page.evaluate(() => {
    const e = (t) => ({ items: [t, '', ''] });
    localStorage.setItem('success-journal.entries.v1', JSON.stringify({ '2026-09-28': e('a'), '2026-09-29': e('b'), '2026-09-30': e('c') }));
  });
  await page.reload();
  assert.equal(await page.isVisible('#backup-nudge'), true);
  assert.match(await page.textContent('#backup-nudge-text'), /記錄了 3 天，還沒有備份過/);
  assert.equal(await page.isHidden('#privacy-note'), true, '同時只顯示一個提醒');
  await shot(page, '41-backup-nudge');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup-now')]);
  assert.match(dl.suggestedFilename(), /^success-journal-backup-20261001\.json$/);
  assert.equal(await page.isHidden('#backup-nudge'), true);
  await page.click('#tab-data');
  assert.equal(await page.textContent('#last-backup'), '上次備份：2026.10.01');

  // 20 天前備份過 → 再提醒；按 × 延後 3 天
  await page.evaluate(() => {
    const k = 'success-journal.settings.v1';
    const s = JSON.parse(localStorage.getItem(k));
    s.lastBackupAt = new Date(Date.now() - 20 * 86400000).toISOString();
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload();
  await page.click('#tab-today');
  assert.match(await page.textContent('#backup-nudge-text'), /已經 20 天了/);
  await page.click('#backup-later');
  assert.equal(await page.isHidden('#backup-nudge'), true);
  await page.reload();
  assert.equal(await page.isHidden('#backup-nudge'), true, '延後期間不再出現');
  await context.close();
});

test('分享今天：有寫內容時出現按鈕，產生 1080×1920 的卡片', async () => {
  const { context, page, errors } = await newPage();
  assert.equal(await page.isHidden('#share-day'), true);
  await page.fill('#item-0', '準時起床，喝了一杯溫水');
  await page.fill('#item-1', '把拖了一週的報告交出去了，主管說寫得很清楚 #工作');
  await page.fill('#item-2', '傍晚和朋友去河邊散步');
  assert.equal(await page.isVisible('#share-day'), true);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#share-day')]);
  assert.equal(dl.suggestedFilename(), 'success-journal-2026-10-01.png');
  const png = await readFile(await dl.path());
  assert.deepEqual(pngSize(png), [1080, 1920]);
  if (SCREENSHOT_DIR) await import('node:fs/promises').then((fs) => fs.writeFile(join(SCREENSHOT_DIR, '42-share-card.png'), png));
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- 會員與雲端同步（假的 Google 登入與 Supabase） ---------- */

function fakeCloud() {
  const docs = new Map(); // `${uid}|${kind}|${key}` → row
  const photos = new Map(); // path → { body, type }
  const users = new Map(); // uid → email
  let tick = Date.parse('2026-10-01T00:00:00Z');
  const nextSyncedAt = () => new Date((tick += 1000)).toISOString().replace('Z', '+00:00');
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-expose-headers': '*',
  };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const uidOf = (req) => (req.headers().authorization || '').replace('Bearer tok:', '');
  const session = (email) => {
    const id = `uid-${email.split('@')[0]}`;
    users.set(id, email);
    return { access_token: `tok:${id}`, refresh_token: `ref:${id}`, expires_in: 3600, user: { id, email, user_metadata: { full_name: 'Amy' } } };
  };

  const gsi = `window.google = { accounts: { id: {
    initialize(o) { window.__gsi = o; },
    renderButton(el) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'fake-gsi'; b.textContent = '使用 Google 帳戶繼續';
      b.onclick = () => window.__gsi.callback({ credential: 'fake:' + (window.__fakeEmail || 'amy@example.com') + ':' + window.__gsi.nonce });
      el.appendChild(b);
    } } } };`;

  async function handle(route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === '/auth/v1/token') {
      const body = req.postDataJSON();
      if (url.searchParams.get('grant_type') === 'id_token') {
        const [, email, hashed] = body.id_token.split(':');
        const expect = createHash('sha256').update(body.nonce).digest('hex');
        if (hashed !== expect) return json(route, 400, { msg: 'nonce mismatch' });
        return json(route, 200, session(email));
      }
      const id = body.refresh_token.replace('ref:', '');
      return users.has(id) ? json(route, 200, session(users.get(id))) : json(route, 400, { msg: 'invalid refresh token' });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    const uid = uidOf(req);
    if (!users.has(uid)) return json(route, 401, { message: 'JWT expired' });
    if (path === '/rest/v1/journal_docs' && req.method() === 'GET') {
      const since = url.searchParams.get('synced_at')?.replace('gt.', '');
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 1000);
      const rows = [...docs.values()]
        .filter((r) => r.user_id === uid && (!since || Date.parse(r.synced_at) > Date.parse(since)))
        .sort((a, b) => Date.parse(a.synced_at) - Date.parse(b.synced_at))
        .slice(offset, offset + limit)
        .map(({ kind, key, data, deleted, updated_at, synced_at }) => ({ kind, key, data, deleted, updated_at, synced_at }));
      return json(route, 200, rows);
    }
    if (path === '/rest/v1/journal_docs' && req.method() === 'POST') {
      const accepted = [];
      for (const r of req.postDataJSON()) {
        if (r.user_id !== uid) return json(route, 403, { message: 'row-level security' });
        const id = `${uid}|${r.kind}|${r.key}`;
        const old = docs.get(id);
        if (old && Date.parse(r.updated_at) < Date.parse(old.updated_at)) continue; // 較舊的版本不覆蓋
        const row = { ...r, updated_at: new Date(r.updated_at).toISOString().replace('Z', '+00:00'), synced_at: nextSyncedAt() };
        docs.set(id, row);
        accepted.push({ kind: row.kind, key: row.key, deleted: row.deleted, updated_at: row.updated_at });
      }
      return json(route, 201, accepted);
    }
    if (path === '/rest/v1/rpc/delete_my_account') {
      for (const id of [...docs.keys()]) if (id.startsWith(`${uid}|`)) docs.delete(id);
      users.delete(uid);
      return json(route, 200, null);
    }
    if (path === '/storage/v1/object/list/photos') {
      const { prefix } = req.postDataJSON();
      return json(route, 200, [...photos.keys()].filter((p) => p.startsWith(`${prefix}/`)).map((p) => ({ name: p.slice(prefix.length + 1), id: p })));
    }
    if (path === '/storage/v1/object/photos' && req.method() === 'DELETE') {
      for (const p of req.postDataJSON().prefixes) photos.delete(p);
      return json(route, 200, []);
    }
    const m = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?photos\/(.+)$/);
    if (m) {
      const p = decodeURIComponent(m[1]);
      if (!p.startsWith(`${uid}/`)) return json(route, 403, { message: 'row-level security' });
      if (req.method() === 'POST') {
        photos.set(p, { body: req.postDataBuffer(), type: req.headers()['content-type'] });
        return json(route, 200, { Key: `photos/${p}` });
      }
      const f = photos.get(p);
      return f ? route.fulfill({ status: 200, headers: { ...cors, 'content-type': f.type }, body: f.body }) : json(route, 400, { error: 'not_found' });
    }
    return json(route, 404, { message: `unexpected ${req.method()} ${path}` });
  }

  return {
    docs,
    photos,
    users,
    async attach(context) {
      await context.route('https://accounts.google.com/gsi/client', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: gsi }));
      await context.route(/^https:\/\/[a-z0-9]+\.supabase\.co\//, handle);
    },
    rows: (uid, kind) => [...docs.values()].filter((r) => r.user_id === uid && (!kind || r.kind === kind)),
  };
}

// 1×1 的 PNG，當作願景板照片
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==';

async function signIn(page) {
  await page.click('#tab-data');
  await page.click('#fake-gsi');
  await page.waitForFunction(() => /上次同步/.test(document.getElementById('cloud-status').textContent), null, { timeout: 15000 });
}

const syncedText = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.entries.v1') || '{}'));

test('會員：Google 登入後同步日記、標籤、願景板與照片；換手機登入就能找回', async () => {
  const server = fakeCloud();
  const a = await newPage({ cloud: server });
  // 手機 A：登入前就有的紀錄、自訂標籤、有照片的願景板
  await a.page.fill('#item-0', '早上喝了一杯溫水');
  await a.page.fill('#item-1', '完成拖了很久的報告');
  await a.page.click('#tab-data');
  assert.equal(await a.page.isVisible('#cloud-panel'), true);
  assert.equal(await a.page.isVisible('#cloud-out'), true);
  await a.page.fill('#tag-add-input', '理財');
  await a.page.click('#tag-add-form button[type=submit]');
  await a.page.evaluate(async (b64) => {
    const { putImage } = await import('./js/images.js');
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    await putImage({ id: 'img-test', blob, width: 1, height: 1 });
    const boards = [{ id: 'b-test', title: '我的願景板', template: 'cover', palette: 'rose', items: [{ id: 'p1', type: 'photo', imageId: 'img-test', x: 0, y: 0, w: 500, h: 500, rot: 0, z: 1 }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    localStorage.setItem('success-journal.boards.v1', JSON.stringify(boards));
  }, TINY_PNG);
  await a.page.reload();
  if (SCREENSHOT_DIR) await a.page.locator('#cloud-panel').screenshot({ path: join(SCREENSHOT_DIR, '50-cloud-signed-out.png') });

  await signIn(a.page);
  assert.equal(await a.page.isVisible('#cloud-in'), true);
  assert.equal(await a.page.textContent('#cloud-email'), 'amy@example.com');
  if (SCREENSHOT_DIR) await a.page.locator('#cloud-panel').screenshot({ path: join(SCREENSHOT_DIR, '51-cloud-signed-in.png') });
  const uid = 'uid-amy';
  assert.equal(server.rows(uid, 'entry').length, 1);
  assert.equal(server.rows(uid, 'entry')[0].data.items[0], '早上喝了一杯溫水');
  assert.equal(server.rows(uid, 'board').length, 1);
  assert.ok(server.rows(uid, 'tags')[0].data.list.includes('理財'));
  assert.ok(server.photos.has(`${uid}/img-test`), '照片已上傳');

  // 登入後不再顯示「資料只存在本機」與備份提醒
  await a.page.click('#tab-today');
  assert.equal(await a.page.isHidden('#privacy-note:not(.muted-by-nudge)'), true);

  // 手機 B：全新的手機，登入同一個帳號
  const b = await newPage({ cloud: server, date: '2026-10-01T10:00:00' });
  assert.equal(await b.page.inputValue('#item-0'), '');
  await signIn(b.page);
  await b.page.click('#tab-today');
  assert.equal(await b.page.inputValue('#item-0'), '早上喝了一杯溫水');
  assert.equal(await b.page.inputValue('#item-1'), '完成拖了很久的報告');
  const bTags = await b.page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.tags.v1')));
  assert.ok(bTags.includes('理財'), '自訂標籤也同步了');
  assert.ok(bTags.includes('工作'));
  const bBoards = await boardsInStorage(b.page);
  assert.equal(bBoards[0].id, 'b-test');
  const hasPhoto = await b.page.evaluate(async () => {
    const { getImage } = await import('./js/images.js');
    const rec = await getImage('img-test');
    return Boolean(rec && rec.blob.size > 0);
  });
  assert.ok(hasPhoto, '照片下載到新手機');

  // 在 B 修改與清空，A 按「立即同步」後跟著更新
  await b.page.fill('#item-0', '早上喝了一杯溫水，還伸展了十分鐘');
  await b.page.fill('#item-1', '');
  await b.page.click('#tab-data');
  await b.page.click('#cloud-sync');
  await b.page.waitForFunction(() => !/同步中/.test(document.getElementById('cloud-status').textContent));
  await b.page.click('#tab-today');
  await b.page.click('#prev-day');
  await b.page.fill('#item-0', '前一天也有小成功');
  await b.page.click('#tab-data');
  await b.page.click('#cloud-sync');
  await b.page.waitForFunction(() => !/同步中/.test(document.getElementById('cloud-status').textContent));
  assert.equal(server.rows(uid, 'entry').length, 2);

  await a.page.click('#tab-data');
  await a.page.click('#cloud-sync');
  await a.page.waitForFunction(() => !/同步中/.test(document.getElementById('cloud-status').textContent));
  const aEntries = await syncedText(a.page);
  assert.equal(aEntries['2026-10-01'].items[0], '早上喝了一杯溫水，還伸展了十分鐘');
  assert.equal(aEntries['2026-10-01'].items[1], '');
  assert.equal(aEntries['2026-09-30'].items[0], '前一天也有小成功');
  await a.page.click('#tab-today');
  assert.equal(await a.page.inputValue('#item-0'), '早上喝了一杯溫水，還伸展了十分鐘');

  // 刪除整天的紀錄也會同步（B 目前停在 9/30）
  await b.page.click('#tab-today');
  assert.equal(await b.page.inputValue('#item-0'), '前一天也有小成功');
  await b.page.fill('#item-0', '');
  await b.page.click('#tab-data');
  await b.page.click('#cloud-sync');
  await b.page.waitForFunction(() => !/同步中/.test(document.getElementById('cloud-status').textContent));
  assert.equal(server.rows(uid, 'entry').find((r) => r.key === '2026-09-30').deleted, true);
  await a.page.click('#tab-data');
  await a.page.click('#cloud-sync');
  await a.page.waitForFunction(() => !/同步中/.test(document.getElementById('cloud-status').textContent));
  assert.equal((await syncedText(a.page))['2026-09-30'], undefined);

  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  await a.context.close();
  await b.context.close();
});

test('會員：寫完會自動同步；登出保留本機資料；刪除帳號清除雲端資料', async () => {
  const server = fakeCloud();
  const { context, page, errors } = await newPage({ cloud: server });
  await signIn(page);
  await page.click('#tab-today');
  await page.fill('#item-0', '自動同步測試');
  await page.locator('#item-0').blur();
  await page.waitForFunction(() => true);
  await page.clock.runFor(4000);
  await page.waitForFunction(() => /上次同步/.test(document.getElementById('cloud-status').textContent) && !/同步中/.test(document.getElementById('cloud-status').textContent));
  await expectEventually(() => server.rows('uid-amy', 'entry').length === 1, '寫完後自動上傳');

  page.on('dialog', (d) => d.accept());
  await page.click('#tab-data');
  await page.click('#cloud-signout');
  await page.waitForSelector('#cloud-out', { state: 'visible' });
  assert.equal((await syncedText(page))['2026-10-01'].items[0], '自動同步測試', '登出後本機資料保留');
  assert.equal(await page.evaluate(() => localStorage.getItem('success-journal.auth.v1')), null);

  await signIn(page);
  await page.click('#cloud-panel summary');
  await page.click('#cloud-delete');
  await page.waitForFunction(() => !document.getElementById('cloud-out').hidden);
  assert.equal(server.rows('uid-amy').length, 0);
  assert.equal(server.users.size, 0);
  assert.equal((await syncedText(page))['2026-10-01'].items[0], '自動同步測試', '刪除帳號後本機資料保留');
  assert.deepEqual(errors, []);
  await context.close();
});

test('隱私權政策頁可以開啟，且不會蓋掉離線用的首頁', async () => {
  const { context, page } = await newPage();
  await page.click('#tab-data');
  await page.click('#cloud-out a[href="privacy.html"]');
  await page.waitForURL(/privacy\.html$/);
  assert.match(await page.textContent('h1'), /隱私權政策/);
  assert.match(await page.textContent('main'), /刪除帳號與雲端資料/);
  await context.close();
});

async function expectEventually(fn, msg, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(msg);
}

test('多寫幾件：寫滿三件後可以「再寫一件」，最多十件，清空的會自動收起', async () => {
  const { context, page, errors } = await newPage();
  assert.equal(await page.isHidden('#add-win'), true);
  await page.fill('#item-0', '一');
  await page.fill('#item-1', '二');
  assert.equal(await page.isHidden('#add-win'), true, '還沒寫到第三件時不出現');
  await page.fill('#item-2', '三');
  assert.equal(await page.isVisible('#add-win'), true);
  await page.click('#add-win');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'item-3');
  assert.equal(await page.textContent('.win-list li:nth-child(4) .win-num'), '04');
  await page.fill('#item-3', '第四件：多走了一站路 #健康');
  await page.click('#add-win');
  await page.fill('#item-4', '第五件');
  await page.locator('#item-4').blur();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.entries.v1'))['2026-10-01']);
  assert.deepEqual(saved.items, ['一', '二', '三', '第四件：多走了一站路 #健康', '第五件']);
  assert.equal(saved.tags.length, 5);
  assert.match(await page.textContent('#entry-title'), /今天的成功小事/);

  // 重新整理後還在；回顧頁算 5 件
  await page.reload();
  assert.equal(await page.inputValue('#item-4'), '第五件');
  await page.click('#tab-calendar');
  assert.equal(await page.textContent('#stat-items'), '5');
  await page.click('#tab-today');

  // 清空第五件後，存檔時收起
  await page.fill('#item-4', '');
  await page.locator('#item-4').blur();
  await page.click('#tab-calendar');
  await page.click('#tab-today');
  assert.equal(await page.locator('.win-list li').count(), 4);

  // 分享卡片照樣產生
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#share-day')]);
  assert.deepEqual(pngSize(await readFile(await dl.path())), [1080, 1920]);

  // 最多十件
  for (let i = 4; i < 10; i++) {
    await page.click('#add-win');
    await page.fill(`#item-${i}`, `第 ${i + 1} 件`);
  }
  assert.equal(await page.isHidden('#add-win'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('稱呼：在設定填寫後出現在今日頁標題與分享卡片', async () => {
  const { context, page, errors } = await newPage();
  await page.click('#tab-data');
  await page.fill('#display-name', '小雨');
  await page.press('#display-name', 'Enter');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('success-journal.settings.v1')).displayName), '小雨');
  await page.click('#tab-today');
  assert.equal(await page.textContent('#entry-title'), '小雨，今天的三件成功小事');
  await page.fill('#item-0', '今天也好好照顧自己');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#share-day')]);
  assert.deepEqual(pngSize(await readFile(await dl.path())), [1080, 1920]);
  await page.reload();
  assert.equal(await page.textContent('#entry-title'), '小雨，今天的三件成功小事');
  await page.click('#tab-data');
  assert.equal(await page.inputValue('#display-name'), '小雨');
  if (SCREENSHOT_DIR) await page.screenshot({ path: join(SCREENSHOT_DIR, '63-settings.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
