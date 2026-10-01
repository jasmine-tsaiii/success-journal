// 產生社群分享預覽圖 app/og-image.png（1200 × 630）。
// 用法：node scripts/make-og.mjs（需要 Playwright、Chromium 與網路，用來載入思源宋體；字型只用於產生圖片，不會放進 App）

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'app', 'og-image.png');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600&family=Cormorant+Garamond:ital,wght@1,500&display=block">
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: 'Noto Serif TC', serif; color: #4a4250;
    background:
      radial-gradient(circle at 8% 0%, rgba(217,205,234,0.95), transparent 55%),
      radial-gradient(circle at 100% 100%, rgba(243,214,223,0.95), transparent 55%),
      radial-gradient(circle at 75% 10%, rgba(236,226,244,0.8), transparent 45%),
      #f8f4ee;
  }
  .en { font-family: 'Cormorant Garamond', serif; font-style: italic; letter-spacing: 0.28em; text-transform: uppercase; color: #9a86b8; }
  .left { position: absolute; left: 92px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .left .en { font-size: 22px; margin-bottom: 18px; }
  h1 { font-weight: 500; font-size: 92px; letter-spacing: 0.24em; line-height: 1.15; }
  .sub { font-size: 30px; letter-spacing: 0.12em; color: #5d5463; margin-top: 26px; line-height: 1.6; }
  .tags { display: flex; gap: 14px; margin-top: 40px; }
  .tag { font-size: 21px; letter-spacing: 0.1em; padding: 9px 22px; border-radius: 999px; background: rgba(255,253,249,0.75); border: 1px solid rgba(154,134,184,0.35); color: #6c6274; }
  .dots { display: flex; gap: 10px; margin-top: 42px; }
  .dots i { width: 12px; height: 12px; border-radius: 50%; display: block; }

  .board { position: absolute; right: 70px; top: 50px; width: 400px; height: 530px; }
  .card { position: absolute; background: #fffdf9; box-shadow: 0 18px 40px -16px rgba(90,70,110,0.45); }
  .photo { padding: 12px; }
  .photo div { width: 100%; height: 100%; }
  .p1 { width: 210px; height: 250px; left: 0; top: 18px; transform: rotate(-7deg); }
  .p1 div { background: linear-gradient(160deg, #c9daf0 0%, #e6dcf3 55%, #f6d9c8 100%); }
  .p2 { width: 230px; height: 200px; left: 160px; top: 0; transform: rotate(5deg); }
  .p2 div { background: linear-gradient(170deg, #f3c9d6, #d9c3ea); }
  .p3 { width: 200px; height: 220px; left: 190px; top: 250px; transform: rotate(-4deg); }
  .p3 div { background: linear-gradient(200deg, #cfe5cf, #f6efd8); }
  .sun { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.75); }
  .note { left: 10px; top: 300px; width: 230px; padding: 22px 24px; transform: rotate(3deg); border-radius: 10px; }
  .note .en { font-size: 13px; letter-spacing: 0.2em; margin-bottom: 8px; }
  .note p { white-space: nowrap; font-size: 19px; line-height: 1.75; letter-spacing: 0.06em; color: #5d5463; }
  .note p span { color: #a985c6; margin-right: 8px; font-family: 'Cormorant Garamond', serif; font-style: italic; }
  .quote { left: 120px; top: 205px; padding: 16px 26px; border-radius: 12px; transform: rotate(-3deg);
           background: linear-gradient(120deg, #e6daf3, #f7dce5); font-size: 22px; letter-spacing: 0.1em; white-space: nowrap; }
  .sticker { position: absolute; }
</style></head>
<body>
  <div class="left">
    <p class="en">Vision Board · Success Journal</p>
    <h1>成功日記</h1>
    <p class="sub">看見夢想，<br>也看見每天小小的成功</p>
    <div class="tags"><span class="tag">願景板拼貼</span><span class="tag">每日三件小成功</span></div>
    <div class="dots">
      <i style="background:#C96B6B"></i><i style="background:#DA9563"></i><i style="background:#D9B44A"></i><i style="background:#7FB08C"></i><i style="background:#6F9FC8"></i><i style="background:#7A7CBF"></i><i style="background:#A985C6"></i>
    </div>
  </div>

  <div class="board">
    <div class="card photo p1"><div></div><span class="sun" style="width:44px;height:44px;left:120px;top:44px"></span></div>
    <div class="card photo p2"><div></div><span class="sun" style="width:36px;height:36px;left:150px;top:36px"></span></div>
    <div class="card photo p3"><div></div><span class="sun" style="width:40px;height:40px;left:110px;top:40px"></span></div>
    <div class="card note">
      <p class="en">Three Little Wins</p>
      <p><span>1.</span>早起喝一杯溫水</p>
      <p><span>2.</span>對自己說謝謝</p>
      <p><span>3.</span>往夢想走一小步</p>
    </div>
    <div class="card quote">我正在靠近夢想</div>
    <svg class="sticker" style="left:360px;top:180px;width:64px" viewBox="0 0 100 100"><path d="M50 6 C54 34 66 46 94 50 C66 54 54 66 50 94 C46 66 34 54 6 50 C34 46 46 34 50 6Z" fill="#C9B6E3"/></svg>
    <svg class="sticker" style="left:-30px;top:-10px;width:46px" viewBox="0 0 100 100"><path d="M50 6 C54 34 66 46 94 50 C66 54 54 66 50 94 C46 66 34 54 6 50 C34 46 46 34 50 6Z" fill="#EFC3D3"/></svg>
    <svg class="sticker" style="left:330px;top:465px;width:56px;transform:rotate(12deg)" viewBox="0 0 100 100"><path d="M50 88 C20 66 8 50 8 33 C8 19 19 10 31 10 C40 10 46 15 50 22 C54 15 60 10 69 10 C81 10 92 19 92 33 C92 50 80 66 50 88Z" fill="#EFB7C8"/></svg>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const ok = await page.evaluate(() => document.fonts.check('500 92px "Noto Serif TC"', '成功日記'));
if (!ok) throw new Error('思源宋體載入失敗，請確認網路連線');
await page.screenshot({ path: out });
await browser.close();
console.log(`✓ ${out}`);
