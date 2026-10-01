// 產生社群分享預覽圖 app/og-image.png（1200 × 630），使用 app/fonts 內建字型。
// 用法：node scripts/make-og.mjs（需要 Playwright 與 Chromium）

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'app', 'og-image.png');
const font = async (name) => (await readFile(join(root, 'app', 'fonts', name))).toString('base64');

const [s500, s700, l500, l500i] = await Promise.all(
  ['noto-serif-tc-500.woff2', 'noto-serif-tc-700.woff2', 'cormorant-500.woff2', 'cormorant-500-italic.woff2'].map(font),
);

const BG = '#F3EBDF';
const INK = '#2E2520';
const ROSE = { block: '#E3D1CC', accent: '#94706B' };
const SAGE = '#6F9478';
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 0.12 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'S'; src: url(data:font/woff2;base64,${s500}); font-weight: 500; }
  @font-face { font-family: 'S'; src: url(data:font/woff2;base64,${s700}); font-weight: 700; }
  @font-face { font-family: 'L'; src: url(data:font/woff2;base64,${l500}); }
  @font-face { font-family: 'L'; src: url(data:font/woff2;base64,${l500i}); font-style: italic; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: ${BG}; color: ${INK}; font-family: 'S', serif; font-weight: 500; }
  body::after { content: ''; position: absolute; inset: 0; background-image: ${GRAIN}; mix-blend-mode: multiply; opacity: .7; }
  .caps { font-family: 'L', serif; text-transform: uppercase; letter-spacing: .28em; }
  .it { font-family: 'L', serif; font-style: italic; }
  .left { position: absolute; left: 84px; top: 58px; width: 600px; }
  .mast { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid ${INK}; padding-bottom: 14px; }
  h1 { font-weight: 700; font-size: 80px; letter-spacing: .2em; line-height: 1.1; white-space: nowrap; }
  .meta { font-size: 15px; text-align: right; line-height: 1.7; }
  .sub { font-size: 27px; letter-spacing: .16em; margin-top: 22px; }
  .card { position: relative; margin-top: 40px; background: color-mix(in srgb, ${SAGE} 24%, ${BG}); padding: 30px 30px 24px; }
  .tape { position: absolute; left: 50%; top: -14px; width: 120px; height: 28px; margin-left: -60px; background: rgba(214,186,150,.75); transform: rotate(-2deg); }
  .lab { font-size: 14px; color: #A85A38; font-weight: 600; }
  .aff { font-size: 30px; letter-spacing: .06em; line-height: 1.6; margin-top: 6px; }
  .wins { margin-top: 14px; font-size: 22px; line-height: 1.95; letter-spacing: .06em; }
  .wins b { font-family: 'L', serif; font-weight: 500; color: #A85A38; font-size: 24px; margin-right: 18px; }
  .board { position: absolute; right: 86px; top: 46px; width: 302px; height: 537px; background: ${BG}; overflow: hidden; box-shadow: 0 26px 50px -26px rgba(50,35,25,.6); transform: rotate(2.5deg); }
  .band { position: absolute; left: 0; right: 0; top: 0; height: 212px; background: ${ROSE.block}; }
  .photo { position: absolute; left: 35px; right: 35px; top: 48px; height: 252px; box-shadow: 0 12px 22px -12px rgba(40,28,20,.6);
           background: linear-gradient(180deg,#cfd9df 0%,#e8e2d6 50%,#8fa9b5 52%,#b9c7c9 74%,#e5d8c3 76%,#d8c4a8 100%); }
  .sun { position: absolute; right: 50px; top: 60px; width: 46px; height: 46px; border-radius: 50%; background: rgba(255,250,235,.9); }
  .btape { position: absolute; left: 50%; top: 40px; width: 72px; height: 16px; margin-left: -36px; background: rgba(255,250,240,.65); transform: rotate(-3deg); }
  .k { position: absolute; top: 18px; font-size: 8px; }
  .title { position: absolute; left: 20px; top: 322px; font-size: 36px; letter-spacing: .1em; }
  .en { position: absolute; left: 22px; top: 374px; font-size: 11px; letter-spacing: .14em; color: ${ROSE.accent}; }
  .rule { position: absolute; left: 20px; top: 404px; width: 38px; height: 3px; background: ${ROSE.accent}; }
  .li { position: absolute; left: 20px; top: 420px; font-size: 11px; line-height: 2.2; letter-spacing: .08em; }
  .li b { font-family: 'L', serif; color: ${ROSE.accent}; margin-right: 8px; font-weight: 500; }
  .stamp { position: absolute; right: 16px; bottom: 16px; width: 74px; height: 74px; border-radius: 50%; background: ${ROSE.accent}; color: ${BG};
           display: grid; place-items: center; font-weight: 700; font-size: 22px; transform: rotate(-8deg); }
</style></head>
<body>
  <div class="left">
    <div class="mast"><h1>成功日記</h1><p class="meta caps">Vision<br>&amp; Wins</p></div>
    <p class="sub">看見願景，也看見每天小小的成功</p>
    <div class="card">
      <span class="tape"></span>
      <p class="lab caps">Three Little Wins</p>
      <div class="wins">
        <p><b>01</b>準時起床，喝一杯溫水</p>
        <p><b>02</b>對自己說聲謝謝</p>
        <p><b>03</b>往願景走了一小步</p>
      </div>
    </div>
  </div>
  <div class="board">
    <div class="band"></div>
    <p class="k caps" style="left:20px">Vision Board</p>
    <p class="k caps" style="right:20px">No.01 — 2027</p>
    <div class="photo"><span class="sun"></span></div>
    <span class="btape"></span>
    <p class="title">2027 的我</p>
    <p class="en it">a warm, abundant year</p>
    <span class="rule"></span>
    <div class="li"><p><b>01</b>去一直想去的地方</p><p><b>02</b>好好吃早餐</p><p><b>03</b>溫柔而堅定地生活</p></div>
    <div class="stamp">願</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(`✓ ${out}`);
