// 願景板純邏輯：色調、雜誌版型、文字排版、物件操作、備份驗證。不碰 DOM，方便在 Node 中測試。
//
// 座標系：願景板固定為 1080 × 1920（手機直式桌布比例 9:16）。
// 每個物件以「中心點 x, y」、寬度 w、旋轉角 rot（度）、圖層 z 描述。
// 顏色以角色（ink / accent / block / bg）記錄，換色調時整張板子一起換色。

import { stickerById } from './stickers.js';

export const BOARD_W = 1080;
export const BOARD_H = 1920;
export const MIN_W = 60;
export const MAX_W = 2400;

/* ---------- 色調 ---------- */

const BEIGE = '#F3EBDF';
const INK = '#2E2520';
const LIGHT_TAPE = 'rgba(255,250,240,0.62)';
const DARK_TAPE = 'rgba(255,255,255,0.16)';

/** 淺色：米色紙底＋莫蘭迪主色；深色：夜空底＋星點 */
export const PALETTES = [
  { id: 'rose', name: '霧粉', en: 'Dusty Rose', bg: BEIGE, block: '#E3D1CC', accent: '#94706B', ink: INK, tape: LIGHT_TAPE },
  { id: 'milktea', name: '奶茶', en: 'Milk Tea', bg: BEIGE, block: '#E0D2C6', accent: '#87705F', ink: INK, tape: LIGHT_TAPE },
  { id: 'sage', name: '灰豆綠', en: 'Grey Green', bg: BEIGE, block: '#D2D8C9', accent: '#66745F', ink: INK, tape: LIGHT_TAPE },
  { id: 'haze', name: '霧藍', en: 'Haze Blue', bg: BEIGE, block: '#D1D9DF', accent: '#5F7282', ink: INK, tape: LIGHT_TAPE },
  { id: 'mauve', name: '灰紫', en: 'Mauve', bg: BEIGE, block: '#DBD3DD', accent: '#76687F', ink: INK, tape: LIGHT_TAPE },
  { id: 'terracotta', name: '赤陶', en: 'Terracotta', bg: BEIGE, block: '#E6BBA0', accent: '#A85A38', ink: INK, tape: LIGHT_TAPE },
  { id: 'starry', name: '星夜', en: 'Starry Night', dark: true, stars: true, bg: '#1D2238', block: '#2C3456', accent: '#D9B871', ink: '#EFE7DA', tape: DARK_TAPE },
  { id: 'nebula', name: '紫色星雲', en: 'Nebula', dark: true, stars: true, bg: '#241D3A', block: '#3E3260', accent: '#E3B2C4', ink: '#F1E9F0', tape: DARK_TAPE },
  { id: 'aurora', name: '極光', en: 'Aurora', dark: true, stars: true, bg: '#15282E', block: '#22454B', accent: '#9ED3C3', ink: '#E8F0EC', tape: DARK_TAPE },
  { id: 'obsidian', name: '黑曜', en: 'Obsidian', dark: true, stars: true, bg: '#1F1C1A', block: '#36322F', accent: '#C9A46B', ink: '#F0E8DC', tape: DARK_TAPE },
];

export const DEFAULT_PALETTE = 'rose';

const LEGACY_BACKGROUNDS = { cream: 'milktea', dawn: 'rose', sky: 'haze', meadow: 'sage', sunset: 'terracotta', night: 'starry' };

export function paletteById(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES.find((p) => p.id === LEGACY_BACKGROUNDS[id]) || PALETTES[0];
}

/** 顏色角色 → 實際色碼 */
export function resolveColor(role, palette) {
  if (!role) return palette.ink;
  if (role.startsWith('#')) return role;
  return palette[role] || palette.ink;
}

/* ---------- 文字 ---------- */

export const TEXT_STYLES = [
  { id: 'title', name: '大標' },
  { id: 'body', name: '內文' },
  { id: 'en', name: '英文斜體' },
  { id: 'label', name: '標籤' },
  { id: 'vertical', name: '直書' },
];

const STYLE_SPEC = {
  title: { family: 'serif', lh: 1.25, ls: 0.1 },
  body: { family: 'serif', lh: 1.8, ls: 0.08 },
  numbered: { family: 'serif', lh: 1.6, ls: 0.1 },
  en: { family: 'latin', italic: true, lh: 1.4, ls: 0.12 },
  caps: { family: 'latin', caps: true, lh: 1.4, ls: 0.28 },
  label: { family: 'serif', lh: 1.5, ls: 0.16, pad: 0.75 },
  vertical: { family: 'serif', lh: 1.6, ls: 0.22 },
  // 舊版樣式（相容）
  card: { family: 'serif', lh: 1.5, ls: 0.12, pad: 0.75 },
  glow: { family: 'serif', lh: 1.5, ls: 0.12, pad: 0.75 },
  plain: { family: 'serif', lh: 1.6, ls: 0.1 },
};

export function styleSpec(style) {
  return STYLE_SPEC[style] || STYLE_SPEC.body;
}

/** 文字的字級、內距、行高、字距（以願景板座標計） */
export function textMetrics(item) {
  const spec = styleSpec(item.style);
  let fontSize = item.fs;
  if (!fontSize) {
    const len = [...(item.text || '')].length;
    const ratio = len <= 4 ? 0.15 : len <= 10 ? 0.11 : len <= 24 ? 0.085 : 0.07;
    fontSize = item.w * ratio;
  }
  return {
    fontSize,
    padding: spec.pad ? fontSize * spec.pad : 0,
    lineHeight: fontSize * spec.lh,
    letterSpacing: fontSize * spec.ls,
    spec,
  };
}

/**
 * 依寬度斷行。中文逐字斷行，英文與數字盡量整個單字一起換行。
 * measure(text) 回傳文字寬度（與 fontSize 同單位）。
 */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const tokens = para.match(/[A-Za-z0-9'’.,!?-]+\s*|\s+|./gu) || [''];
    let line = '';
    for (const tok of tokens) {
      const next = line + tok;
      if (line && measure(next.trimEnd()) > maxWidth) {
        lines.push(line.trimEnd());
        line = tok.trimStart();
      } else {
        line = next;
      }
      // 單一單字本身比寬度還長：逐字切開
      while (measure(line.trimEnd()) > maxWidth && [...line].length > 1) {
        const chars = [...line];
        let cut = chars.length - 1;
        while (cut > 1 && measure(chars.slice(0, cut).join('')) > maxWidth) cut--;
        lines.push(chars.slice(0, cut).join(''));
        line = chars.slice(cut).join('');
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** 粗估字寬（排版用；實際畫面以 canvas 量測） */
export function estimateMeasure(fontSize, letterSpacing = 0) {
  return (s) => [...s].reduce((sum, ch) => sum + (/[\x20-\x7E]/.test(ch) ? 0.55 : 1) * fontSize + letterSpacing, 0);
}

/** 直書：依欄高切成多欄（由右而左） */
export function verticalColumns(text, colHeight, fontSize, letterSpacing) {
  const perCol = Math.max(1, Math.floor(colHeight / (fontSize + letterSpacing)));
  const cols = [];
  for (const para of String(text).split('\n')) {
    const chars = [...para];
    if (!chars.length) cols.push('');
    for (let i = 0; i < chars.length; i += perCol) cols.push(chars.slice(i, i + perCol).join(''));
  }
  return cols;
}

/**
 * 文字排版結果：lines（橫書）或 columns（直書）、尺寸。
 * 直書時 w 由欄數決定，item.h 為欄高。
 */
export function layoutTextWith(item, measureFactory) {
  const m = textMetrics(item);
  if (item.style === 'vertical') {
    const colH = item.h || m.fontSize * 8;
    const columns = verticalColumns(item.text || '', colH, m.fontSize, m.letterSpacing);
    const longest = Math.max(1, ...columns.map((c) => [...c].length));
    return { ...m, columns, w: columns.length * m.lineHeight, h: longest * (m.fontSize + m.letterSpacing) };
  }
  const measure = measureFactory(m);
  const numW = item.num ? measureFactory({ ...m, fontSize: m.fontSize * 0.8 })(`${item.num}`) + m.fontSize * 0.7 : 0;
  const lines = wrapText(item.text || '', item.w - m.padding * 2 - numW, measure);
  return { ...m, lines, numW, w: item.w, h: lines.length * m.lineHeight + m.padding * 2 };
}

export function estimateTextLayout(item) {
  return layoutTextWith(item, (m) => estimateMeasure(m.fontSize, m.letterSpacing));
}

/** 物件高度（文字以估算為準；畫面上以 canvas 量測） */
export function itemSize(item, textLayout = estimateTextLayout) {
  if (item.type === 'photo') {
    const pad = item.frame ? item.w * 0.04 : 0;
    const h = item.h || (item.w - pad * 2) / (item.aspect || 1) + pad * 2;
    return { w: item.w, h };
  }
  if (item.type === 'sticker') return { w: item.w, h: item.w * (stickerById(item.sticker)?.ratio || 1) };
  if (item.type === 'shape') return { w: item.w, h: item.h || 4 };
  const t = textLayout(item);
  return { w: t.w, h: t.h };
}

/* ---------- 物件操作 ---------- */

let idCounter = 0;
export function newId(prefix = 'i') {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function maxZ(board) {
  return board.items.reduce((m, it) => Math.max(m, it.z || 0), 0);
}

/** 新物件放在畫面中央偏上，帶一點隨機位移，避免完全疊在一起 */
export function placeNew(board, item, rand = Math.random) {
  const w = item.w || (item.type === 'sticker' ? 240 : item.type === 'photo' ? 520 : 600);
  return {
    id: newId(),
    rot: 0,
    ...item,
    w,
    x: BOARD_W / 2 + (rand() - 0.5) * 240,
    y: BOARD_H * 0.45 + (rand() - 0.5) * 360,
    z: maxZ(board) + 1,
  };
}

export function clampItem(item) {
  const w = Math.min(MAX_W, Math.max(MIN_W, item.w));
  const out = {
    ...item,
    w,
    x: Math.min(BOARD_W, Math.max(0, item.x)),
    y: Math.min(BOARD_H, Math.max(0, item.y)),
    rot: ((((item.rot || 0) + 180) % 360) + 360) % 360 - 180,
  };
  // 寬度被限制時，高度與字級跟著等比例調整
  const ratio = item.w ? w / item.w : 1;
  if (item.h) out.h = item.h * ratio;
  if (item.fs) out.fs = item.fs * ratio;
  return out;
}

/** 等比例縮放（照片框、文字字級一起縮放） */
export function scaleItem(item, factor) {
  const next = { ...item, w: item.w * factor };
  if (item.h) next.h = item.h * factor;
  if (item.fs) next.fs = item.fs * factor;
  return clampItem(next);
}

/** 空的照片格 */
export const isEmptySlot = (it) => it.type === 'photo' && !it.imageId;

/* ---------- 雜誌版型 ---------- */

export const TEMPLATES = [
  { id: 'cover', name: '封面', en: 'Cover' },
  { id: 'grid', name: '格狀', en: 'Grid' },
  { id: 'editorial', name: '編輯頁', en: 'Editorial' },
];

/** 由左上角座標建立物件（版型設計時比較直覺） */
function at(l, t, w, h, props) {
  return { x: l + w / 2, y: t + h / 2, w, ...(props.type === 'text' && props.style !== 'vertical' ? {} : { h }), rot: 0, ...props };
}

function textAt(l, t, w, fs, props) {
  const item = { type: 'text', fs, w, rot: 0, ...props };
  const { h } = estimateTextLayout(item);
  return { ...item, x: l + w / 2, y: t + h / 2 };
}

const defaultYear = (now) => (now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear());

function coverItems(year) {
  return [
    at(0, 0, BOARD_W, 760, { type: 'shape', shape: 'rect', color: 'block', role: 'band' }),
    textAt(72, 64, 520, 27, { style: 'caps', text: 'Vision Board', role: 'kicker', align: 'left' }),
    textAt(608, 64, 400, 27, { style: 'caps', text: `No.01 — ${year}`, role: 'issue', align: 'right' }),
    at(126, 170, 828, 900, { type: 'photo', imageId: null, role: 'p1', shadow: true }),
    { type: 'sticker', sticker: 'tape-plain', x: 540, y: 172, w: 250, rot: -3, role: 'tape1' },
    textAt(126, 1094, 828, 25, { style: 'en', text: 'fig. 01 — my favourite place', color: 'accent', role: 'caption', align: 'left' }),
    textAt(66, 1160, 960, 126, { style: 'title', text: `${year} 的我`, role: 'title', align: 'left' }),
    textAt(78, 1340, 900, 38, { style: 'en', text: 'a warm, abundant year', color: 'accent', role: 'subtitle', align: 'left' }),
    at(72, 1446, 132, 9, { type: 'shape', shape: 'rect', color: 'accent', role: 'rule' }),
    textAt(72, 1496, 720, 38, { style: 'numbered', num: '01', text: '去一個一直想去的地方', role: 'li1', align: 'left' }),
    textAt(72, 1582, 720, 38, { style: 'numbered', num: '02', text: '每天好好吃一頓早餐', role: 'li2', align: 'left' }),
    textAt(72, 1668, 720, 38, { style: 'numbered', num: '03', text: '溫柔而堅定地生活', role: 'li3', align: 'left' }),
    { type: 'sticker', sticker: 'stamp-solid', x: 900, y: 1726, w: 252, rot: -8, role: 'stamp' },
  ];
}

function gridItems(year) {
  const words = ['旅行', '咖啡', '散步', '森林', '黃昏', '海'];
  const items = [
    at(0, 0, BOARD_W, 300, { type: 'shape', shape: 'rect', color: 'block', role: 'band' }),
    textAt(72, 84, 936, 66, { style: 'caps', text: 'My Vision', role: 'title', align: 'center' }),
    textAt(72, 196, 936, 30, { style: 'body', text: '我想要的日常', role: 'subtitle', align: 'center' }),
  ];
  for (let i = 0; i < 6; i++) {
    const c = i % 2;
    const r = Math.floor(i / 2);
    const l = 72 + c * 486;
    const t = 360 + r * 486;
    items.push(at(l, t, 450, 390, { type: 'photo', imageId: null, role: `p${i + 1}` }));
    items.push(textAt(l, t + 408, 450, 30, { style: 'numbered', num: `No.0${i + 1}`, text: words[i], role: `li${i + 1}`, align: 'left' }));
  }
  items.push(
    at(72, 1810, 936, 3, { type: 'shape', shape: 'rect', color: 'ink', role: 'rule' }),
    textAt(72, 1838, 600, 24, { style: 'caps', text: `Spring — Summer ${year}`, role: 'footer', align: 'left' }),
    textAt(700, 1832, 308, 28, { style: 'body', text: '一步一步', color: 'accent', role: 'footer2', align: 'right' }),
    { type: 'sticker', sticker: 'asterisk', x: 960, y: 150, w: 90, rot: 0, role: 'mark' },
  );
  return items;
}

function editorialItems() {
  const title = { type: 'text', style: 'vertical', text: '溫柔而堅定地\n生活', fs: 76, h: 900, role: 'title' };
  const tw = estimateTextLayout(title).w;
  return [
    at(0, 1190, BOARD_W, 730, { type: 'shape', shape: 'rect', color: 'block', role: 'band' }),
    textAt(72, 96, 700, 27, { style: 'en', text: 'Issue 03 · Slow Living', color: 'accent', role: 'kicker', align: 'left' }),
    at(72, 190, 636, 990, { type: 'photo', imageId: null, role: 'p1', shadow: true }),
    { type: 'sticker', sticker: 'tape-plain', x: 390, y: 192, w: 230, rot: -4, role: 'tape1' },
    { ...title, x: BOARD_W - 84 - tw / 2, y: 190 + 450, w: tw, rot: 0 },
    at(72, 1250, 450, 330, { type: 'photo', imageId: null, role: 'p2', shadow: true }),
    at(558, 1250, 450, 480, { type: 'photo', imageId: null, role: 'p3', shadow: true }),
    textAt(72, 1616, 450, 29, { style: 'body', text: '把喜歡的事放進每一天。\n慢一點，也沒關係。', role: 'body', align: 'left' }),
    { type: 'sticker', sticker: 'leaf', x: 870, y: 1040, w: 210, rot: 0, role: 'leaf' },
    textAt(808, 1830, 200, 24, { style: 'caps', text: 'p. 27', role: 'folio', align: 'right' }),
  ];
}

/** 產生版型物件（全部標記 tpl，可自由移動與編輯） */
export function templateItems(templateId, { now = new Date() } = {}) {
  const year = defaultYear(now);
  const raw = templateId === 'grid' ? gridItems(year) : templateId === 'editorial' ? editorialItems() : coverItems(year);
  return raw.map((it, i) => ({
    id: newId(),
    ...it,
    tpl: true,
    locked: it.type === 'shape' ? true : undefined,
    z: i + 1,
  }));
}

/** 放不下的照片：縮小疊在右下角，不遮住主角 */
export function spillPhoto(photo, i, z) {
  return {
    id: newId(),
    type: 'photo',
    imageId: photo.imageId,
    aspect: photo.aspect,
    frame: true,
    w: 250,
    x: 880 - (i % 3) * 40,
    y: 1440 + i * 70,
    rot: i % 2 ? 6 : -5,
    z,
  };
}

/**
 * 套用版型：版型物件換新，所有照片依序放進新的照片格（版型裡的照片優先），
 * 使用者改過的標題與清單文字依角色保留；其他自己加的物件保留在最上層。
 * 放不下的照片縮小放在右下角。
 */
export function applyTemplate(board, templateId, opts = {}) {
  const old = board.items || [];
  const fresh = templateItems(templateId, opts);
  const tplPhotos = old.filter((it) => it.tpl && it.type === 'photo' && it.imageId);
  const freePhotos = old.filter((it) => !it.tpl && it.type === 'photo' && it.imageId);
  const photos = [...tplPhotos, ...freePhotos];
  const edited = new Map(old.filter((it) => it.tpl && it.edited && it.type === 'text' && it.role).map((it) => [it.role, it.text]));
  const carry = ['title', 'subtitle', 'li1', 'li2', 'li3'];
  const placed = new Set();
  let pi = 0;
  const items = fresh.map((it) => {
    if (it.type === 'photo' && pi < photos.length) {
      const p = photos[pi++];
      placed.add(p.id);
      return { ...it, imageId: p.imageId, aspect: p.aspect };
    }
    if (it.type === 'text' && carry.includes(it.role) && edited.has(it.role) && it.style !== 'vertical') {
      return { ...it, text: edited.get(it.role), edited: true };
    }
    return it;
  });
  let z = items.length;
  const spill = tplPhotos.filter((p) => !placed.has(p.id)).map((p, i) => spillPhoto(p, i, ++z));
  const free = old.filter((it) => !it.tpl && !placed.has(it.id)).map((it) => ({ ...it, z: ++z }));
  return [...items, ...spill, ...free];
}

export function createBoard(title = '我的願景板', { template = 'cover', palette = DEFAULT_PALETTE, now = new Date() } = {}) {
  const ts = now.toISOString();
  const board = { id: newId('b'), title, template, palette, items: [], createdAt: ts, updatedAt: ts };
  board.items = applyTemplate(board, template, { now });
  return board;
}

/** 依序把照片放進空的照片格；回傳放不下的照片 */
export function fillSlots(board, photos, startSlotId = null) {
  const slots = board.items.filter(isEmptySlot).sort((a, b) => (a.id === startSlotId ? -1 : b.id === startSlotId ? 1 : 0));
  const rest = [];
  photos.forEach((p, i) => {
    const slot = slots[i];
    if (slot) Object.assign(slot, { imageId: p.imageId, aspect: p.aspect });
    else rest.push(p);
  });
  return rest;
}

/* ---------- 備份驗證 ---------- */

const finite = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const COLOR_ROLES = ['ink', 'accent', 'block', 'bg'];
const ALL_STYLES = Object.keys(STYLE_SPEC);

/** 驗證並清理備份檔中的願景板；格式不符時回傳 null */
export function sanitizeBoard(b) {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id || !Array.isArray(b.items)) return null;
  const items = [];
  for (const it of b.items.slice(0, 200)) {
    if (!it || typeof it !== 'object') continue;
    const base = {
      id: typeof it.id === 'string' && it.id ? it.id.slice(0, 64) : newId(),
      x: finite(it.x, BOARD_W / 2),
      y: finite(it.y, BOARD_H / 2),
      w: finite(it.w, 400),
      rot: finite(it.rot, 0),
      z: finite(it.z, 0),
    };
    if (it.tpl) base.tpl = true;
    if (it.edited) base.edited = true;
    if (typeof it.role === 'string') base.role = it.role.slice(0, 24);
    const h = finite(it.h, 0) > 0 ? { h: Math.min(4000, it.h) } : {};
    if (it.type === 'photo') {
      const aspect = Math.min(10, Math.max(0.1, finite(it.aspect, 1)));
      const imageId = typeof it.imageId === 'string' ? it.imageId.slice(0, 64) : null;
      if (!imageId && !it.tpl) continue;
      items.push(clampItem({ ...base, ...h, type: 'photo', imageId, aspect, frame: !!it.frame, shadow: !!it.shadow }));
    } else if (it.type === 'sticker' && typeof it.sticker === 'string') {
      items.push(clampItem({ ...base, type: 'sticker', sticker: it.sticker.slice(0, 32) }));
    } else if (it.type === 'shape') {
      const color = COLOR_ROLES.includes(it.color) ? it.color : 'block';
      items.push(clampItem({ ...base, h: Math.min(4000, Math.max(1, finite(it.h, 4))), type: 'shape', shape: 'rect', color, locked: true }));
    } else if (it.type === 'text' && typeof it.text === 'string') {
      const style = ALL_STYLES.includes(it.style) ? it.style : 'body';
      const extra = {};
      if (finite(it.fs, 0) > 0) extra.fs = Math.min(400, it.fs);
      if (['left', 'center', 'right'].includes(it.align)) extra.align = it.align;
      if (COLOR_ROLES.includes(it.color)) extra.color = it.color;
      if (typeof it.num === 'string') extra.num = it.num.slice(0, 8);
      items.push(clampItem({ ...base, ...h, ...extra, type: 'text', text: it.text.slice(0, 200), style }));
    }
  }
  const now = new Date().toISOString();
  return {
    id: b.id.slice(0, 64),
    title: typeof b.title === 'string' ? b.title.slice(0, 40) : '我的願景板',
    template: TEMPLATES.some((t) => t.id === b.template) ? b.template : 'cover',
    palette: paletteById(b.palette || b.background).id,
    items,
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : now,
    updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : now,
  };
}

/** 舊版願景板（只有 background）轉成新格式 */
const LEGACY_STICKERS = {
  star: 'sparkle', lotus: 'flower', cloud: 'sparkle', sprout: 'leaf', rainbow: 'stamp-wins', butterfly: 'flower',
  gem: 'sparkle', house: 'heart', plane: 'arrow', book: 'postage', orbs: 'asterisk',
};

export function migrateBoard(b) {
  if (b.palette) return b;
  return {
    ...b,
    palette: paletteById(b.background).id,
    template: b.template || null,
    items: (b.items || []).map((it) => (it.type === 'sticker' && LEGACY_STICKERS[it.sticker] ? { ...it, sticker: LEGACY_STICKERS[it.sticker] } : it)),
  };
}

/** 願景板使用到的照片 id */
export function usedImageIds(boards) {
  return [...new Set(boards.flatMap((b) => b.items.filter((it) => it.type === 'photo' && it.imageId).map((it) => it.imageId)))];
}
