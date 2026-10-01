// 願景板繪製：畫面上的 DOM 與匯出桌布的 canvas 共用同一套排版計算，確保看到的就是存下來的。

import { BOARD_H, BOARD_W, isEmptySlot, itemSize, layoutTextWith, paletteById, resolveColor } from './board-core.js';
import { stickerById, stickerDataUrl } from './stickers.js';
import { imageUrl, loadImageElement } from './images.js';

export const SERIF = "'SJ Serif', 'Noto Serif TC', 'Noto Serif CJK TC', 'Songti TC', 'PMingLiU', serif";
export const LATIN = "'SJ Latin', 'SJ Serif', 'Cormorant Garamond', Georgia, serif";
const PAPER = '#FFFDF8';

const familyOf = (spec) => (spec.family === 'latin' ? LATIN : SERIF);
const fontOf = (spec, size, weight = 500) => `${spec.italic ? 'italic ' : ''}${weight} ${size}px ${familyOf(spec)}`;
const displayText = (item) => (item.style === 'caps' ? (item.text || '').toUpperCase() : item.text || '');

let measureCtx;
function ctx2d() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

function measureFactory(m) {
  const ctx = ctx2d();
  const font = fontOf(m.spec, m.fontSize);
  return (s) => {
    ctx.font = font;
    return ctx.measureText(s).width + [...s].length * m.letterSpacing;
  };
}

/** 文字排版結果（DOM 與 canvas 共用） */
export function layoutText(item) {
  return layoutTextWith({ ...item, text: displayText(item) }, measureFactory);
}

export const sizeOf = (item) => itemSize(item, layoutText);

/* ---------- 星點與紙紋 ---------- */

function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function starField(seedKey, count = 90) {
  const r = rng(hashSeed(seedKey));
  return Array.from({ length: count }, () => ({
    x: r() * BOARD_W,
    y: r() * BOARD_H,
    r: r() < 0.12 ? 3.6 : r() < 0.4 ? 2.2 : 1.3,
    a: 0.3 + r() * 0.6,
  }));
}

/* ---------- 印章 ---------- */

/** 印章的幾何資料（DOM 的 SVG 與 canvas 共用） */
function stampGeometry(sticker, w) {
  const r = w * 0.47;
  const chars = [...sticker.ring];
  return {
    r,
    inner: r * 0.6,
    ringSize: w * 0.095,
    ringRadius: r * 0.78,
    centerSize: w * 0.26,
    chars: chars.map((ch, i) => ({ ch, angle: (i / chars.length) * Math.PI * 2 - Math.PI / 2 })),
  };
}

function asteriskPath(cx, cy, s) {
  const d = s * 0.5;
  const k = d * 0.707;
  return `M${cx} ${cy - d}V${cy + d}M${cx - d} ${cy}H${cx + d}M${cx - k} ${cy - k}L${cx + k} ${cy + k}M${cx + k} ${cy - k}L${cx - k} ${cy + k}`;
}

function stampSvg(sticker, palette) {
  const w = 100;
  const g = stampGeometry(sticker, w);
  const main = sticker.solid ? palette.bg : palette.accent;
  const ring = g.chars
    .map(({ ch, angle }) => {
      const x = 50 + Math.cos(angle) * g.ringRadius;
      const y = 50 + Math.sin(angle) * g.ringRadius;
      const deg = (angle * 180) / Math.PI + 90;
      return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${deg.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})" text-anchor="middle" dominant-baseline="central">${ch === ' ' ? '' : ch}</text>`;
    })
    .join('');
  const center =
    sticker.center === '✳'
      ? `<path d="${asteriskPath(50, 50, g.centerSize)}" stroke="${main}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="${SERIF.replace(/"/g, "'")}" font-weight="700" font-size="${g.centerSize}" fill="${main}">${sticker.center}</text>`;
  const body = sticker.solid
    ? `<circle cx="50" cy="50" r="${g.r}" fill="${palette.accent}"/>`
    : `<circle cx="50" cy="50" r="${g.r}" fill="none" stroke="${palette.accent}" stroke-width="1.4"/><circle cx="50" cy="50" r="${g.inner}" fill="none" stroke="${palette.accent}" stroke-width="0.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}<g font-family="${LATIN.replace(/"/g, "'")}" font-size="${g.ringSize}" fill="${main}">${ring}</g>${center}</svg>`;
}

/* ---------- DOM ---------- */

const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 0.11 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

/**
 * 在容器中繪製願景板。scale = 容器寬度 / 1080。
 * 回傳 { 物件 id → 元素 }，供編輯器更新單一物件。
 */
export function renderStage(stage, board, { selectedId = null, editable = false } = {}) {
  const palette = paletteById(board.palette);
  stage.textContent = '';
  stage.style.background = palette.bg;
  stage.dataset.palette = palette.id;
  stage.classList.toggle('dark', !!palette.dark);
  const scale = stage.clientWidth / BOARD_W;

  if (palette.stars) {
    const ns = 'http://www.w3.org/2000/svg';
    const sky = document.createElementNS(ns, 'svg');
    sky.setAttribute('viewBox', `0 0 ${BOARD_W} ${BOARD_H}`);
    sky.setAttribute('preserveAspectRatio', 'none');
    sky.classList.add('board-stars');
    sky.innerHTML = starField(board.id)
      .map((s) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r}" fill="#fff" opacity="${s.a.toFixed(2)}"/>`)
      .join('');
    stage.appendChild(sky);
  }

  const els = {};
  for (const item of [...board.items].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    const el = document.createElement('div');
    el.className = `board-item type-${item.type}`;
    el.dataset.id = item.id;
    if (item.locked) el.classList.add('locked');
    if (item.id === selectedId) el.classList.add('selected');
    fillItem(el, item, palette, scale, editable);
    positionItem(el, item, scale);
    stage.appendChild(el);
    els[item.id] = el;
  }
  const grain = document.createElement('div');
  grain.className = 'board-grain';
  grain.style.backgroundImage = GRAIN;
  stage.appendChild(grain);
  return els;
}

function fillItem(el, item, palette, scale, editable) {
  if (item.type === 'shape') {
    el.style.background = resolveColor(item.color || 'block', palette);
  } else if (item.type === 'photo') {
    el.classList.toggle('framed', !!item.frame);
    el.classList.toggle('shadow', !!item.shadow || !!item.frame);
    if (isEmptySlot(item)) {
      el.classList.add('empty-slot');
      el.style.color = palette.ink;
      if (editable) {
        const hint = document.createElement('div');
        hint.className = 'slot-hint';
        hint.innerHTML = '<b>+</b><span>點一下加入照片</span>';
        hint.style.fontSize = `${Math.max(10, 30 * scale)}px`;
        el.appendChild(hint);
      }
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      imageUrl(item.imageId).then((url) => url && (img.src = url));
      el.appendChild(img);
    }
  } else if (item.type === 'sticker') {
    const s = stickerById(item.sticker);
    if (!s) return;
    if (s.kind === 'stamp') {
      el.innerHTML = stampSvg(s, palette);
    } else {
      const img = document.createElement('img');
      img.alt = s.name;
      img.draggable = false;
      img.src = stickerDataUrl(s, palette);
      el.appendChild(img);
    }
  } else {
    el.classList.add(`style-${item.style || 'body'}`);
    el.style.color = resolveColor(item.color || 'ink', palette);
    if (item.style === 'label' || item.style === 'card' || item.style === 'glow') {
      el.style.borderColor = palette.ink;
      if (item.style === 'glow') el.style.background = palette.block;
      else if (item.style === 'card') el.style.background = palette.dark ? palette.block : PAPER;
    }
    const inner = document.createElement('div');
    inner.className = 'text-inner';
    el.appendChild(inner);
    el._accent = palette.accent;
  }
}

export function positionItem(el, item, scale) {
  const { w, h } = sizeOf(item);
  el.style.width = `${w * scale}px`;
  el.style.height = `${h * scale}px`;
  el.style.left = `${(item.x - w / 2) * scale}px`;
  el.style.top = `${(item.y - h / 2) * scale}px`;
  el.style.transform = `rotate(${item.rot || 0}deg)`;
  if (item.type === 'photo' && item.frame) el.style.padding = `${item.w * 0.04 * scale}px`;
  if (item.type !== 'text') return;

  const t = layoutText(item);
  const inner = el.firstChild;
  el.style.padding = `${t.padding * scale}px`;
  if (t.padding) el.style.borderWidth = `${Math.max(1, 2.5 * scale)}px`;
  inner.style.font = fontOf(t.spec, t.fontSize * scale);
  inner.style.letterSpacing = `${t.letterSpacing * scale}px`;
  inner.style.lineHeight = `${t.lineHeight * scale}px`;
  inner.textContent = '';
  if (item.style === 'vertical') {
    inner.classList.add('vertical');
    for (const col of t.columns) {
      const c = document.createElement('div');
      c.style.width = `${t.lineHeight * scale}px`;
      for (const ch of col) {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.height = `${(t.fontSize + t.letterSpacing) * scale}px`;
        c.appendChild(s);
      }
      inner.appendChild(c);
    }
    return;
  }
  inner.style.textAlign = item.align || 'center';
  t.lines.forEach((line, i) => {
    const div = document.createElement('div');
    if (item.num && i === 0) {
      const n = document.createElement('span');
      n.className = 'num';
      n.textContent = item.num;
      n.style.color = el._accent;
      n.style.font = `600 ${t.fontSize * 0.8 * scale}px ${LATIN}`;
      n.style.width = `${t.numW * scale}px`;
      div.appendChild(n);
    } else if (item.num) {
      div.style.paddingLeft = `${t.numW * scale}px`;
    }
    div.append(line || ' ');
    inner.appendChild(div);
  });
}

/* ---------- Canvas（存成桌布） ---------- */

function grainPattern(ctx, dark) {
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d');
  const img = g.createImageData(220, 220);
  const r = rng(12345);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = dark ? 255 : 70;
    img.data[i] = v;
    img.data[i + 1] = v * 0.85;
    img.data[i + 2] = v * 0.7;
    img.data[i + 3] = r() * (dark ? 14 : 30);
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

function drawStamp(ctx, sticker, palette, w) {
  const g = stampGeometry(sticker, w);
  const main = sticker.solid ? palette.bg : palette.accent;
  ctx.beginPath();
  ctx.arc(0, 0, g.r, 0, Math.PI * 2);
  if (sticker.solid) {
    ctx.fillStyle = palette.accent;
    ctx.fill();
  } else {
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = w * 0.014;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, g.inner, 0, Math.PI * 2);
    ctx.lineWidth = w * 0.008;
    ctx.stroke();
  }
  ctx.fillStyle = main;
  ctx.font = `500 ${g.ringSize}px ${LATIN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { ch, angle } of g.chars) {
    ctx.save();
    ctx.translate(Math.cos(angle) * g.ringRadius, Math.sin(angle) * g.ringRadius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  if (sticker.center === '✳') {
    const s = g.centerSize / 2;
    const k = s * 0.707;
    ctx.strokeStyle = main;
    ctx.lineWidth = w * 0.024;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s);
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.moveTo(-k, -k);
    ctx.lineTo(k, k);
    ctx.moveTo(k, -k);
    ctx.lineTo(-k, k);
    ctx.stroke();
  } else {
    ctx.font = `700 ${g.centerSize}px ${SERIF}`;
    ctx.fillText(sticker.center, 0, g.centerSize * 0.04);
  }
}

/** 逐字繪製（手動處理字距，各瀏覽器結果一致） */
function drawSpaced(ctx, text, x, y, ls) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
}

function drawText(ctx, item, palette, w, h) {
  const t = layoutText(item);
  const x0 = -w / 2;
  const y0 = -h / 2;
  if (t.padding) {
    if (item.style === 'glow' || item.style === 'card') {
      ctx.fillStyle = item.style === 'glow' || palette.dark ? palette.block : PAPER;
      ctx.fillRect(x0, y0, w, h);
    }
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0, y0, w, h);
  }
  ctx.fillStyle = resolveColor(item.color || 'ink', palette);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  if (item.style === 'vertical') {
    ctx.font = fontOf(t.spec, t.fontSize);
    ctx.textAlign = 'center';
    t.columns.forEach((col, i) => {
      const cx = w / 2 - (i + 0.5) * t.lineHeight;
      [...col].forEach((ch, j) => ctx.fillText(ch, cx, y0 + (j + 0.5) * (t.fontSize + t.letterSpacing)));
    });
    return;
  }

  const measure = (s) => {
    ctx.font = fontOf(t.spec, t.fontSize);
    return ctx.measureText(s).width + [...s].length * t.letterSpacing;
  };
  const innerW = w - t.padding * 2 - t.numW;
  t.lines.forEach((line, i) => {
    const y = y0 + t.padding + t.lineHeight * (i + 0.5);
    let x = x0 + t.padding + t.numW;
    const lw = measure(line);
    if ((item.align || 'center') === 'center') x += (innerW - lw) / 2;
    else if (item.align === 'right') x += innerW - lw;
    if (item.num && i === 0) {
      ctx.save();
      ctx.fillStyle = palette.accent;
      ctx.font = `600 ${t.fontSize * 0.8}px ${LATIN}`;
      ctx.fillText(item.num, x0 + t.padding, y);
      ctx.restore();
    }
    ctx.font = fontOf(t.spec, t.fontSize);
    drawSpaced(ctx, line, x, y, t.letterSpacing);
  });
}

async function loadAssets(board, palette) {
  const map = new Map();
  await Promise.all(
    board.items.map(async (it) => {
      try {
        if (it.type === 'photo' && it.imageId) {
          const url = await imageUrl(it.imageId);
          if (url) map.set(it.id, await loadImageElement(url));
        } else if (it.type === 'sticker') {
          const s = stickerById(it.sticker);
          if (s && s.kind !== 'stamp') map.set(it.id, await loadImageElement(stickerDataUrl(s, palette)));
        }
      } catch {
        /* 圖片遺失時略過 */
      }
    }),
  );
  return map;
}

export async function ensureFonts(text = '') {
  if (!document.fonts || !document.fonts.load) return;
  const sample = `${text}成功願景`;
  await Promise.all([
    document.fonts.load(`500 40px 'SJ Serif'`, sample),
    document.fonts.load(`700 40px 'SJ Serif'`, '願成'),
    document.fonts.load(`500 40px 'SJ Latin'`, 'Aa'),
    document.fonts.load(`italic 500 40px 'SJ Latin'`, 'Aa'),
  ]).catch(() => {});
}

/** 將願景板畫成 1080×1920 的 canvas */
export async function renderBoardCanvas(board, { watermark = false } = {}) {
  const palette = paletteById(board.palette);
  await ensureFonts(board.items.map((it) => it.text || '').join(''));
  const assets = await loadAssets(board, palette);
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  if (palette.stars) {
    for (const s of starField(board.id)) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  for (const item of [...board.items].sort((a, b) => (a.z || 0) - (b.z || 0))) {
    if (isEmptySlot(item)) continue;
    const { w, h } = sizeOf(item);
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(((item.rot || 0) * Math.PI) / 180);
    const x = -w / 2;
    const y = -h / 2;

    if (item.type === 'shape') {
      ctx.fillStyle = resolveColor(item.color || 'block', palette);
      ctx.fillRect(x, y, w, h);
    } else if (item.type === 'photo') {
      const img = assets.get(item.id);
      const pad = item.frame ? w * 0.04 : 0;
      if (item.shadow || item.frame) {
        ctx.shadowColor = 'rgba(40, 28, 20, 0.28)';
        ctx.shadowBlur = 34;
        ctx.shadowOffsetY = 14;
      }
      ctx.fillStyle = PAPER;
      ctx.fillRect(x, y, w, h);
      ctx.shadowColor = 'transparent';
      if (img) {
        // 裁切成 cover
        const bw = w - pad * 2;
        const bh = h - pad * 2;
        const ir = img.naturalWidth / img.naturalHeight;
        const br = bw / bh;
        let sw = img.naturalWidth;
        let sh = img.naturalHeight;
        if (ir > br) sw = sh * br;
        else sh = sw / br;
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x + pad, y + pad, bw, bh);
      }
    } else if (item.type === 'sticker') {
      const s = stickerById(item.sticker);
      if (s && s.kind === 'stamp') drawStamp(ctx, s, palette, w);
      else {
        const img = assets.get(item.id);
        if (img) ctx.drawImage(img, x, y, w, h);
      }
    } else {
      drawText(ctx, item, palette, w, h);
    }
    ctx.restore();
  }

  ctx.globalCompositeOperation = palette.dark ? 'screen' : 'multiply';
  ctx.fillStyle = grainPattern(ctx, palette.dark);
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.globalCompositeOperation = 'source-over';

  // 免費版：右下角小小的字樣
  if (watermark) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = palette.ink;
    ctx.font = `500 22px ${LATIN}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const label = 'MADE WITH SUCCESS JOURNAL';
    const width = ctx.measureText(label).width + 4 * (label.length - 1);
    drawSpaced(ctx, label, BOARD_W - 40 - width, BOARD_H - 34, 4);
    ctx.globalAlpha = 1;
  }
  return canvas;
}

/** 素材面板用的預覽（HTML 字串） */
export function stickerPreview(sticker, palette) {
  if (sticker.kind === 'stamp') return stampSvg(sticker, palette);
  return `<img alt="" src="${stickerDataUrl(sticker, palette)}">`;
}
