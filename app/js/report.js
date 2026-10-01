// 年度回顧報告：把一年的成功整理成一張 1080×1920 的雜誌風長圖（Plus 功能）。

import { LATIN, SERIF, ensureFonts } from './board-render.js';

const W = 1080;
const H = 1920;
const M = 72; // 左右留白
const C = {
  bg: '#F3EBDF',
  paper: '#FAF5EC',
  ink: '#2E2520',
  ink2: '#4E4239',
  muted: '#74655A',
  rule: '#D6C8B6',
  accent: '#A85A38',
};

function text(ctx, str, x, y, { font, color = C.ink, ls = 0, align = 'left' }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const width = [...str].reduce((w, ch) => w + ctx.measureText(ch).width + ls, 0) - ls;
  let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  for (const ch of str) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
  return width;
}

function fit(ctx, str, font, maxW) {
  ctx.font = font;
  if (ctx.measureText(str).width <= maxW) return str;
  const chars = [...str];
  while (chars.length && ctx.measureText(`${chars.join('')}⋯`).width > maxW) chars.pop();
  return `${chars.join('')}⋯`;
}

function rule(ctx, y, h = 3, color = C.ink, x0 = M, x1 = W - M) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, x1 - x0, h);
}

/** 只有右端圓角的橫條（資料端圓角） */
function bar(ctx, x, y, w, h, color) {
  const r = Math.min(8, h / 2, w);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

/** 只有上端圓角的直條 */
function column(ctx, x, y, w, h, color) {
  if (h <= 0) return;
  const r = Math.min(8, w / 2, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function grain(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d');
  const img = g.createImageData(220, 220);
  let s = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    img.data[i] = 70;
    img.data[i + 1] = 60;
    img.data[i + 2] = 50;
    img.data[i + 3] = (s / 2147483647) * 26;
  }
  g.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(c, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

export async function renderYearReport(s) {
  await ensureFonts(`${s.picks.map((p) => p.text).join('')}${s.tags.map((t) => t.tag).join('')}這一年的小成功件數記錄天數最長連續最常見每月三件看見願景也看見每天小小的成功還沒有`);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 刊頭
  text(ctx, 'SUCCESS JOURNAL', M, 104, { font: `500 26px ${LATIN}`, ls: 7 });
  text(ctx, 'YEAR IN REVIEW', W - M, 104, { font: `500 26px ${LATIN}`, ls: 7, align: 'right' });
  rule(ctx, 132);
  text(ctx, String(s.year), M - 6, 352, { font: `500 230px ${LATIN}`, ls: 4 });
  text(ctx, '這一年的小成功', M, 452, { font: `700 58px ${SERIF}`, ls: 8 });

  // 三個數字
  const stats = [
    [s.total, '成功件數'],
    [s.days, '記錄天數'],
    [s.longest, '最長連續天數'],
  ];
  const colW = (W - M * 2) / 3;
  rule(ctx, 520, 2, C.rule);
  stats.forEach(([n, label], i) => {
    const cx = M + colW * i + colW / 2;
    text(ctx, String(n), cx, 680, { font: `500 130px ${LATIN}`, align: 'center' });
    text(ctx, label, cx, 744, { font: `500 32px ${SERIF}`, color: C.ink2, ls: 4, align: 'center' });
    if (i) rule(ctx, 560, 210, C.rule, M + colW * i - 1, M + colW * i + 1);
  });
  rule(ctx, 800, 2, C.rule);

  // 最常見的成功（標籤）
  text(ctx, 'MOST OFTEN', M, 884, { font: `600 26px ${LATIN}`, color: C.accent, ls: 7 });
  text(ctx, '最常見的成功', M, 944, { font: `700 42px ${SERIF}`, ls: 5 });
  if (s.tags.length) {
    const max = Math.max(...s.tags.map((t) => t.count));
    const barX = 330;
    const barMax = W - M - 120 - barX;
    s.tags.forEach((t, i) => {
      const y = 1010 + i * 64;
      text(ctx, fit(ctx, `#${t.tag}`, `500 34px ${SERIF}`, barX - M - 20), M, y + 30, { font: `500 34px ${SERIF}` });
      bar(ctx, barX, y + 4, Math.max(6, (t.count / max) * barMax), 30, C.accent);
      text(ctx, String(t.count), W - M, y + 32, { font: `500 38px ${LATIN}`, color: C.ink2, align: 'right' });
    });
  } else {
    text(ctx, '今年還沒有幫成功加上標籤。', M, 1040, { font: `500 32px ${SERIF}`, color: C.muted });
  }

  // 每月件數
  const chartTop = 1380;
  text(ctx, 'MONTH BY MONTH', M, chartTop, { font: `600 26px ${LATIN}`, color: C.accent, ls: 7 });
  const base = chartTop + 210;
  const slot = (W - M * 2) / 12;
  const maxM = Math.max(1, ...s.months);
  s.months.forEach((n, i) => {
    const h = (n / maxM) * 160;
    column(ctx, M + slot * i + slot * 0.22, base - h, slot * 0.56, h, n ? C.accent : C.rule);
    text(ctx, String(i + 1), M + slot * i + slot / 2, base + 38, { font: `500 26px ${LATIN}`, color: C.muted, align: 'center' });
  });
  rule(ctx, base, 2, C.ink);

  // 三件小成功
  const winsTop = 1690;
  text(ctx, 'LITTLE WINS', M, winsTop, { font: `600 26px ${LATIN}`, color: C.accent, ls: 7 });
  if (s.picks.length) {
    s.picks.forEach((p, i) => {
      const y = winsTop + 54 + i * 44;
      text(ctx, p.date.slice(5).replace('-', '.'), M, y, { font: `500 28px ${LATIN}`, color: C.accent });
      text(ctx, fit(ctx, p.text.split('\n')[0], `500 30px ${SERIF}`, W - M * 2 - 110), M + 110, y, { font: `500 30px ${SERIF}` });
    });
  } else {
    text(ctx, '這一年還沒有紀錄。', M, winsTop + 54, { font: `500 30px ${SERIF}`, color: C.muted });
  }

  text(ctx, '看見願景，也看見每天小小的成功', W / 2, H - 34, { font: `500 24px ${SERIF}`, color: C.muted, ls: 4, align: 'center' });
  grain(ctx);
  return canvas;
}

/** 存成圖片：手機開分享選單（可存到相簿），電腦直接下載 */
export async function saveCanvas(canvas, filename, title) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
