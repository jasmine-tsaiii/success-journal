// 分享：把今天的三件小成功做成 IG 限時動態尺寸的卡片（1080×1920），以及共用的「存圖／分享檔案」。

import { LATIN, SERIF, ensureFonts } from './board-render.js';
import { wrapText } from './board-core.js';

const W = 1080;
const H = 1920;
const M = 84;
const C = { bg: '#F3EBDF', paper: '#FAF5EC', ink: '#2E2520', ink2: '#4E4239', muted: '#74655A', rule: '#D6C8B6', accent: '#A85A38' };
export const SITE_URL = 'success.jas-soul.com';

const isMobile = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * 分享或下載檔案：手機開啟分享選單（可存到相簿、iCloud、Google 雲端硬碟、LINE），電腦直接下載。
 * 回傳 'shared' | 'downloaded' | 'cancelled'
 */
export async function shareOrDownload(blob, filename, title, text = '') {
  const file = new File([blob], filename, { type: blob.type });
  if (isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share(text ? { files: [file], title, text } : { files: [file], title });
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

function grain(ctx, w = W, h = H) {
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
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * 今日卡片。day = { date: '2026-10-01', week: 'Thu · 週四', wins: [..], affirmation, color, colorName, name? }
 */
export async function renderDayCard(day) {
  await ensureFonts(`${day.wins.join('')}${(day.thanks || []).join('')}♡${day.affirmation}${day.name || ''}的小成功還有件今日色彩成功日記看見願景也看見每天小小的成功`);
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

  // 小成功（預設三件；多寫的話字小一點，放不下的以「還有 N 件」帶過）
  const wins = day.wins.filter((t) => t.trim()).slice(0, 10);
  const many = wins.length > 3;
  ctx.fillStyle = C.accent;
  ctx.font = `600 28px ${LATIN}`;
  if (wins.length) spaced(ctx, many ? 'LITTLE WINS' : 'THREE LITTLE WINS', M, 560, 8);
  else if (!(day.thanks || []).some((t) => t.trim())) spaced(ctx, 'THREE LITTLE WINS', M, 560, 8);
  const name = (day.name || '').trim();
  if (name) {
    ctx.fillStyle = C.ink2;
    ctx.font = `500 30px ${SERIF}`;
    spaced(ctx, `${name}${/[A-Za-z0-9]$/.test(name) ? ' ' : ''}的小成功`, W - M, 562, 4, 'right');
  }
  let y = wins.length ? 650 : 560;
  const fs = many ? 42 : 50;
  const lh = many ? 66 : 80;
  const gap = many ? 58 : 74;
  const maxLines = many ? 2 : 4;
  const thanks = (day.thanks || []).filter((t) => t.trim()).slice(0, 3);
  const limit = thanks.length ? 1060 : 1290;
  const textX = M + 104;
  const maxW = W - M - textX;
  for (let i = 0; i < wins.length; i++) {
    ctx.font = `500 ${fs}px ${SERIF}`;
    const measure = (str) => ctx.measureText(str).width + [...str].length * 2;
    let lines = wrapText(wins[i].trim(), maxW, measure);
    if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, -1)}⋯`];
    if (i > 0 && y + lines.length * lh > limit) {
      ctx.fillStyle = C.ink2;
      ctx.font = `500 ${Math.round(fs * 0.8)}px ${SERIF}`;
      spaced(ctx, `＋ 還有 ${wins.length - i} 件小成功`, textX, y, 3);
      y += lh;
      break;
    }
    ctx.fillStyle = C.accent;
    ctx.font = `500 ${many ? 48 : 58}px ${LATIN}`;
    ctx.fillText(String(i + 1).padStart(2, '0'), M, y + 4);
    ctx.fillStyle = C.ink;
    ctx.font = `500 ${fs}px ${SERIF}`;
    lines.forEach((line, j) => spaced(ctx, line, textX, y + j * lh, 2));
    y += lines.length * lh + (gap - 40);
    ctx.fillStyle = C.rule;
    ctx.fillRect(M, y - (gap - 20), W - M * 2, 2);
    y += 40;
  }

  // 感恩
  if (thanks.length) {
    y += 6;
    ctx.fillStyle = day.color;
    ctx.font = `600 26px ${LATIN}`;
    spaced(ctx, 'THANK YOU', M, y, 8);
    y += 70;
    for (const t of thanks) {
      ctx.font = `500 40px ${SERIF}`;
      let lines = wrapText(t.trim(), maxW, (str) => ctx.measureText(str).width + [...str].length * 2);
      if (lines.length > 2) lines = [lines[0], `${lines[1].slice(0, -1)}⋯`];
      if (y + lines.length * 62 > 1340) break;
      ctx.fillStyle = day.color;
      ctx.font = `500 40px ${SERIF}`;
      ctx.fillText('♡', M + 8, y);
      ctx.fillStyle = C.ink2;
      lines.forEach((line, j) => spaced(ctx, line, textX, y + j * 62, 2));
      y += lines.length * 62 + 26;
    }
  }

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

/* ---------- 感謝卡與邀請卡（1080×1350，適合 LINE 與 IG 貼文） ---------- */

const CW = 1080;
const CH = 1350;

function cardBase(color) {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CW, CH);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CW, 18);
  return { canvas, ctx };
}

function cardFooter(ctx, line = '') {
  ctx.fillStyle = C.rule;
  ctx.fillRect(M, CH - (line ? 190 : 150), CW - M * 2, 2);
  ctx.fillStyle = C.muted;
  if (line) {
    ctx.font = `500 28px ${SERIF}`;
    spaced(ctx, line, CW / 2, CH - 122, 4, 'center');
  }
  ctx.font = `500 24px ${LATIN}`;
  spaced(ctx, SITE_URL.toUpperCase(), CW / 2, CH - 76, 3, 'center');
}

/** 置中排版一段文字，回傳最後一行的 y */
function centered(ctx, text, y, { size, lh, maxLines, maxW = CW - M * 2 - 60, ls = 3 }) {
  ctx.font = `500 ${size}px ${SERIF}`;
  let lines = wrapText(text, maxW, (str) => ctx.measureText(str).width + [...str].length * ls);
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, -1)}⋯`];
  lines.forEach((line, i) => spaced(ctx, line, CW / 2, y + i * lh, ls, 'center'));
  return y + (lines.length - 1) * lh;
}

/**
 * 感謝卡：{ text, name, date, color }
 * 寫給被感謝的人，所以卡片上只有這一則感謝。
 */
export async function renderThanksCard({ text, name = '', date, color = C.accent }) {
  const toLine = '謝謝你';
  const from = name.trim() ? `— ${name.trim()}` : '';
  await ensureFonts(`${text}${toLine}${from}♡在成功日記寫下的感謝`);
  const { canvas, ctx } = cardBase(color);

  ctx.fillStyle = color;
  ctx.font = `600 30px ${LATIN}`;
  spaced(ctx, 'THANK YOU', CW / 2, 190, 12, 'center');
  ctx.font = `500 90px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('♡', CW / 2, 330);
  ctx.textAlign = 'left';

  ctx.fillStyle = C.ink;
  const len = [...text.trim()].length;
  const size = len > 60 ? 46 : len > 30 ? 54 : 64;
  const lh = Math.round(size * 1.6);
  // 先算行數，讓整段文字在愛心與署名之間置中
  ctx.font = `500 ${size}px ${SERIF}`;
  const n = Math.min(6, wrapText(text.trim(), CW - M * 2 - 60, (str) => ctx.measureText(str).width + [...str].length * 3).length);
  let y = centered(ctx, text.trim(), Math.round(600 - ((n - 1) * lh) / 2), { size, lh, maxLines: 6 });

  y = Math.max(y + 150, 800);
  ctx.fillStyle = C.ink2;
  ctx.font = `500 44px ${SERIF}`;
  spaced(ctx, toLine, CW / 2, y, 6, 'center');
  if (from) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 34px ${SERIF}`;
    spaced(ctx, from, CW / 2, y + 74, 4, 'center');
  }
  if (date) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 26px ${LATIN}`;
    spaced(ctx, date.replaceAll('-', '.'), CW / 2, y + (from ? 136 : 74), 4, 'center');
  }
  cardFooter(ctx, '在成功日記寫下的感謝');
  grain(ctx, CW, CH);
  return canvas;
}

/** 邀請卡：days = 累積記錄天數，wins = 累積小成功件數（不放任何日記內容） */
export async function renderInviteCard({ days = 0, wins = 0, name = '', color = C.accent }) {
  const who = name.trim() ? `${name.trim()}${/[A-Za-z0-9]$/.test(name.trim()) ? ' ' : ''}` : '我';
  const head = days > 0 ? `${who}已經記錄了` : `${who}開始寫成功日記了`;
  await ensureFonts(`${head}天件小成功一起來寫成功日記吧每天寫下三件小成功看見自己一點一點在前進邀請你`);
  const { canvas, ctx } = cardBase(color);

  ctx.fillStyle = C.ink;
  ctx.font = `700 72px ${SERIF}`;
  spaced(ctx, '成功日記', CW / 2, 200, 18, 'center');
  ctx.fillStyle = color;
  ctx.font = `600 26px ${LATIN}`;
  spaced(ctx, 'LITTLE WINS · INVITATION', CW / 2, 262, 7, 'center');

  ctx.fillStyle = C.ink2;
  ctx.font = `500 46px ${SERIF}`;
  spaced(ctx, head, CW / 2, 430, 5, 'center');
  if (days > 0) {
    ctx.fillStyle = C.ink;
    ctx.font = `500 220px ${LATIN}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(days), CW / 2, 660);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink2;
    ctx.font = `500 46px ${SERIF}`;
    spaced(ctx, wins > 0 ? `天・${wins} 件小成功` : '天的小成功', CW / 2, 750, 5, 'center');
  }

  // 邀請的話（紙卡）
  const top = 850;
  ctx.fillStyle = C.paper;
  ctx.fillRect(M, top, CW - M * 2, 250);
  ctx.fillStyle = color;
  ctx.fillRect(M, top, CW - M * 2, 8);
  ctx.fillStyle = C.ink;
  ctx.font = `500 48px ${SERIF}`;
  spaced(ctx, '邀請你一起來寫', CW / 2, top + 100, 6, 'center');
  ctx.fillStyle = C.ink2;
  ctx.font = `500 32px ${SERIF}`;
  spaced(ctx, '每天寫下三件小成功，看見自己一點一點在前進', CW / 2, top + 170, 2, 'center');
  cardFooter(ctx);
  grain(ctx, CW, CH);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((r) => canvas.toBlob(r, 'image/png'));
}
