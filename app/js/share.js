// 分享：把今天的三件小成功做成 IG 限時動態尺寸的卡片（1080×1920），以及共用的「存圖／分享檔案」。

import { LATIN, SERIF, ensureFonts } from './board-render.js';
import { wrapText } from './board-core.js';

const W = 1080;
const H = 1920;
const M = 84;
const C = { bg: '#F3EBDF', paper: '#FAF5EC', ink: '#2E2520', ink2: '#4E4239', muted: '#74655A', rule: '#D6C8B6', accent: '#A85A38' };
export const SITE_URL = 'jasmine-tsaiii.github.io/success-journal';

const isMobile = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * 分享或下載檔案：手機開啟分享選單（可存到相簿、iCloud、Google 雲端硬碟、LINE），電腦直接下載。
 * 回傳 'shared' | 'downloaded' | 'cancelled'
 */
export async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
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

/** 有些 Android 瀏覽器不允許分享 .json，改用 .txt 再試一次 */
export async function shareBackup(json, stamp) {
  const name = `success-journal-backup-${stamp}`;
  const jsonBlob = new Blob([json], { type: 'application/json' });
  if (isMobile() && navigator.canShare) {
    const asJson = new File([jsonBlob], `${name}.json`, { type: 'application/json' });
    if (!navigator.canShare({ files: [asJson] })) {
      return shareOrDownload(new Blob([json], { type: 'text/plain' }), `${name}.txt`, '成功日記備份');
    }
  }
  return shareOrDownload(jsonBlob, `${name}.json`, '成功日記備份');
}

function spaced(ctx, str, x, y, ls, align = 'left') {
  const width = [...str].reduce((w, ch) => w + ctx.measureText(ch).width + ls, 0) - ls;
  let cx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  for (const ch of str) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
}

function grain(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d');
  const img = g.createImageData(220, 220);
  let s = 11;
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

/**
 * 今日卡片。day = { date: '2026-10-01', week: 'Thu · 週四', wins: [..], affirmation, color, colorName }
 */
export async function renderDayCard(day) {
  await ensureFonts(`${day.wins.join('')}${day.affirmation}今日色彩成功日記看見願景也看見每天小小的成功`);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // 當日色條
  ctx.fillStyle = day.color;
  ctx.fillRect(0, 0, W, 22);

  // 刊頭
  ctx.fillStyle = C.ink;
  ctx.font = `700 76px ${SERIF}`;
  spaced(ctx, '成功日記', M, 186, 18);
  ctx.font = `500 26px ${LATIN}`;
  spaced(ctx, 'LITTLE WINS', W - M, 150, 7, 'right');
  spaced(ctx, day.date.slice(0, 4), W - M, 188, 7, 'right');
  ctx.fillRect(M, 222, W - M * 2, 3);

  // 日期
  ctx.font = `500 170px ${LATIN}`;
  spaced(ctx, day.date.slice(5).replace('-', '.'), M - 6, 430, 2);
  ctx.fillStyle = C.ink2;
  ctx.font = `500 30px ${LATIN}`;
  spaced(ctx, day.week.toUpperCase(), W - M, 424, 6, 'right');

  // 三件小成功
  ctx.fillStyle = C.accent;
  ctx.font = `600 28px ${LATIN}`;
  spaced(ctx, 'THREE LITTLE WINS', M, 560, 8);
  let y = 650;
  const fs = 50;
  const lh = 80;
  const textX = M + 104;
  const maxW = W - M - textX;
  const wins = day.wins.filter((t) => t.trim()).slice(0, 3);
  wins.forEach((t, i) => {
    ctx.font = `500 ${fs}px ${SERIF}`;
    const measure = (s) => ctx.measureText(s).width + [...s].length * 2;
    let lines = wrapText(t.trim(), maxW, measure);
    if (lines.length > 4) lines = [...lines.slice(0, 3), `${lines[3].slice(0, -1)}⋯`];
    ctx.fillStyle = C.accent;
    ctx.font = `500 58px ${LATIN}`;
    ctx.fillText(`0${i + 1}`, M, y + 4);
    ctx.fillStyle = C.ink;
    ctx.font = `500 ${fs}px ${SERIF}`;
    lines.forEach((line, j) => spaced(ctx, line, textX, y + j * lh, 2));
    y += lines.length * lh + 34;
    ctx.fillStyle = C.rule;
    ctx.fillRect(M, y - 54, W - M * 2, 2);
    y += 40;
  });

  // 肯定語紙卡
  const cardTop = Math.max(y + 30, 1330);
  const cardH = 330;
  ctx.fillStyle = C.paper;
  ctx.fillRect(M, cardTop, W - M * 2, cardH);
  ctx.fillStyle = day.color;
  ctx.fillRect(M, cardTop, W - M * 2, 10);
  ctx.font = `600 24px ${LATIN}`;
  spaced(ctx, 'AFFIRMATION', M + 44, cardTop + 76, 7);
  ctx.fillStyle = C.ink;
  ctx.font = `500 42px ${SERIF}`;
  const affLines = wrapText(day.affirmation, W - M * 2 - 88, (s) => ctx.measureText(s).width + [...s].length * 3).slice(0, 2);
  affLines.forEach((line, j) => spaced(ctx, line, M + 44, cardTop + 150 + j * 66, 3));
  ctx.fillStyle = day.color;
  ctx.fillRect(M + 44, cardTop + cardH - 66, 22, 22);
  ctx.fillStyle = C.ink2;
  ctx.font = `500 26px ${SERIF}`;
  spaced(ctx, `今日色彩・${day.colorName}`, M + 80, cardTop + cardH - 46, 4);

  // 頁尾
  ctx.fillStyle = C.muted;
  ctx.font = `500 26px ${SERIF}`;
  spaced(ctx, '看見願景，也看見每天小小的成功', W / 2, H - 120, 5, 'center');
  ctx.font = `500 24px ${LATIN}`;
  spaced(ctx, SITE_URL.toUpperCase(), W / 2, H - 74, 3, 'center');
  grain(ctx);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}
