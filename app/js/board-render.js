// 願景板繪製：畫面上的 DOM 與匯出桌布的 canvas 共用同一套尺寸計算，確保看到的就是存下來的。

import { BOARD_H, BOARD_W, backgroundById, backgroundCss, itemHeight, textMetrics, wrapText } from './board-core.js';
import { stickerById, stickerDataUrl } from './stickers.js';
import { imageUrl, loadImageElement } from './images.js';

export const SERIF = '"Noto Serif TC", "Noto Serif CJK TC", "Source Han Serif TC", "Songti TC", "STSong", "PMingLiU", Georgia, serif';
const INK = '#4A4250';
const PAPER = '#FFFDF9';

let measureCtx;
function measurer(fontSize) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `${fontSize}px ${SERIF}`;
  return (s) => measureCtx.measureText(s).width;
}

/** 文字卡排版結果（DOM 與 canvas 共用） */
export function layoutText(item) {
  const m = textMetrics(item);
  const measure = measurer(m.fontSize);
  const lines = wrapText(item.text || '', item.w - m.padding * 2, measure);
  return { ...m, lines, h: lines.length * m.lineHeight + m.padding * 2 };
}

export function heightOf(item) {
  return item.type === 'text' ? layoutText(item).h : itemHeight(item);
}

function textColor(item, bg) {
  return item.style === 'plain' && bg.dark ? PAPER : INK;
}

/* ---------- DOM ---------- */

/**
 * 在容器中繪製願景板。scale = 容器寬度 / 1080。
 * 回傳 { el: 物件 id → 元素 }，供編輯器更新單一物件。
 */
export function renderStage(stage, board, { selectedId = null } = {}) {
  const bg = backgroundById(board.background);
  stage.style.background = backgroundCss(bg);
  stage.dataset.bg = bg.id;
  stage.textContent = '';
  const scale = stage.clientWidth / BOARD_W;
  const els = {};
  for (const item of [...board.items].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    const el = document.createElement('div');
    el.className = `board-item type-${item.type}`;
    el.dataset.id = item.id;
    if (item.id === selectedId) el.classList.add('selected');
    fillItem(el, item, bg);
    positionItem(el, item, scale);
    stage.appendChild(el);
    els[item.id] = el;
  }
  return els;
}

function fillItem(el, item, bg) {
  if (item.type === 'photo') {
    el.classList.toggle('framed', !!item.frame);
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    imageUrl(item.imageId).then((url) => url && (img.src = url));
    el.appendChild(img);
  } else if (item.type === 'sticker') {
    const s = stickerById(item.sticker);
    const img = document.createElement('img');
    img.alt = s ? s.name : '';
    img.draggable = false;
    if (s) img.src = stickerDataUrl(s);
    el.appendChild(img);
  } else {
    el.classList.add(`style-${item.style || 'card'}`);
    el.style.color = textColor(item, bg);
    const inner = document.createElement('div');
    inner.className = 'text-inner';
    el.appendChild(inner);
  }
}

export function positionItem(el, item, scale) {
  const h = heightOf(item);
  el.style.width = `${item.w * scale}px`;
  el.style.height = `${h * scale}px`;
  el.style.left = `${(item.x - item.w / 2) * scale}px`;
  el.style.top = `${(item.y - h / 2) * scale}px`;
  el.style.transform = `rotate(${item.rot || 0}deg)`;
  if (item.type === 'photo' && item.frame) {
    el.style.padding = `${item.w * 0.045 * scale}px`;
  }
  if (item.type === 'text') {
    const t = layoutText(item);
    const inner = el.firstChild;
    el.style.padding = `${t.padding * scale}px`;
    el.style.borderRadius = item.style === 'plain' ? '0' : `${item.w * 0.04 * scale}px`;
    inner.style.fontSize = `${t.fontSize * scale}px`;
    inner.style.lineHeight = `${t.lineHeight * scale}px`;
    inner.textContent = '';
    for (const line of t.lines) {
      const div = document.createElement('div');
      div.textContent = line || ' ';
      inner.appendChild(div);
    }
  }
  if (item.type === 'photo' && !item.frame) el.style.borderRadius = `${item.w * 0.03 * scale}px`;
}

/* ---------- Canvas（存成桌布） ---------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx, bg) {
  const lin = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  bg.stops.forEach((c, i) => lin.addColorStop(i / Math.max(1, bg.stops.length - 1), c));
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  // CSS 的 circle 半徑以「到最遠角落的距離」為 100%
  for (const g of bg.glows) {
    const cx = g.x * BOARD_W;
    const cy = g.y * BOARD_H;
    const far = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(BOARD_W - cx, cy),
      Math.hypot(cx, BOARD_H - cy),
      Math.hypot(BOARD_W - cx, BOARD_H - cy),
    );
    const rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, far * g.r);
    rad.addColorStop(0, g.color);
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  }
}

function withShadow(ctx, on) {
  ctx.shadowColor = on ? 'rgba(90, 70, 110, 0.22)' : 'transparent';
  ctx.shadowBlur = on ? 36 : 0;
  ctx.shadowOffsetY = on ? 12 : 0;
}

async function loadAssets(board) {
  const map = new Map();
  await Promise.all(
    board.items.map(async (it) => {
      try {
        if (it.type === 'photo') {
          const url = await imageUrl(it.imageId);
          if (url) map.set(it.id, await loadImageElement(url));
        } else if (it.type === 'sticker') {
          const s = stickerById(it.sticker);
          if (s) map.set(it.id, await loadImageElement(stickerDataUrl(s)));
        }
      } catch {
        /* 圖片遺失時略過 */
      }
    }),
  );
  return map;
}

/** 將願景板畫成 1080×1920 的 canvas */
export async function renderBoardCanvas(board) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const bg = backgroundById(board.background);
  const assets = await loadAssets(board);
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, bg);

  for (const item of [...board.items].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    const h = heightOf(item);
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(((item.rot || 0) * Math.PI) / 180);
    const x = -item.w / 2;
    const y = -h / 2;

    if (item.type === 'photo') {
      const img = assets.get(item.id);
      if (item.frame) {
        const pad = item.w * 0.045;
        withShadow(ctx, true);
        ctx.fillStyle = PAPER;
        ctx.fillRect(x, y, item.w, h);
        withShadow(ctx, false);
        if (img) ctx.drawImage(img, x + pad, y + pad, item.w - pad * 2, h - pad * 2);
      } else {
        withShadow(ctx, true);
        roundRect(ctx, x, y, item.w, h, item.w * 0.03);
        ctx.fillStyle = PAPER;
        ctx.fill();
        withShadow(ctx, false);
        ctx.clip();
        if (img) ctx.drawImage(img, x, y, item.w, h);
      }
    } else if (item.type === 'sticker') {
      const img = assets.get(item.id);
      if (img) ctx.drawImage(img, x, y, item.w, item.w);
    } else {
      const t = layoutText(item);
      if (item.style !== 'plain') {
        withShadow(ctx, true);
        roundRect(ctx, x, y, item.w, h, item.w * 0.04);
        if (item.style === 'glow') {
          const g = ctx.createLinearGradient(x, y, x + item.w, y + h);
          g.addColorStop(0, '#E6DAF3');
          g.addColorStop(1, '#F7DCE5');
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = PAPER;
        }
        ctx.fill();
        withShadow(ctx, false);
      }
      ctx.fillStyle = textColor(item, bg);
      ctx.font = `${t.fontSize}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      t.lines.forEach((line, i) => {
        ctx.fillText(line, 0, y + t.padding + t.lineHeight * (i + 0.5));
      });
    }
    ctx.restore();
  }
  return canvas;
}
