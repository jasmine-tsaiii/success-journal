// 願景板純邏輯：版面資料結構、自動排版、文字排版。不碰 DOM，方便在 Node 中測試。
//
// 座標系：願景板固定為 1080 × 1920（手機直式桌布比例 9:16）。
// 每個物件以「中心點 x, y」、寬度 w、旋轉角 rot（度）、圖層 z 描述。

export const BOARD_W = 1080;
export const BOARD_H = 1920;
export const MIN_W = 90;
export const MAX_W = 2400;

/* ---------- 背景 ---------- */

export const BACKGROUNDS = [
  {
    id: 'cream',
    name: '米白柔光',
    stops: ['#FBF8F3', '#F6F0EA'],
    glows: [
      { x: 0.1, y: 0.05, r: 0.75, color: 'rgba(217,205,234,0.75)' },
      { x: 1.0, y: 0.45, r: 0.65, color: 'rgba(243,214,223,0.7)' },
      { x: 0.3, y: 1.0, r: 0.7, color: 'rgba(230,218,240,0.6)' },
    ],
  },
  { id: 'dawn', name: '晨光', stops: ['#E9DDF4', '#F6DCE5', '#FBEFE6'], glows: [{ x: 0.8, y: 0.15, r: 0.5, color: 'rgba(255,255,255,0.55)' }] },
  { id: 'sky', name: '晴空', stops: ['#DCE9F5', '#E7E3F4', '#F8F4EE'], glows: [{ x: 0.2, y: 0.1, r: 0.5, color: 'rgba(255,255,255,0.6)' }] },
  { id: 'meadow', name: '草地', stops: ['#F8F4EE', '#E9F1E4', '#DCEBDD'], glows: [{ x: 0.85, y: 0.2, r: 0.5, color: 'rgba(246,237,207,0.7)' }] },
  { id: 'sunset', name: '暮光', stops: ['#F9E3D3', '#F4D3DD', '#DCCDEE'], glows: [{ x: 0.5, y: 0.0, r: 0.6, color: 'rgba(255,240,215,0.7)' }] },
  { id: 'night', name: '星夜', dark: true, stops: ['#2E2A4F', '#4A3F6B', '#6E5A86'], glows: [{ x: 0.75, y: 0.12, r: 0.45, color: 'rgba(233,221,244,0.25)' }] },
];

export function backgroundById(id) {
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

/** 背景的 CSS（與匯出圖片使用相同資料，畫面與桌布一致） */
export function backgroundCss(bg) {
  const glows = bg.glows.map(
    (g) => `radial-gradient(circle at ${g.x * 100}% ${g.y * 100}%, ${g.color}, transparent ${Math.round(g.r * 100)}%)`,
  );
  const stops = bg.stops.map((c, i) => `${c} ${Math.round((i / Math.max(1, bg.stops.length - 1)) * 100)}%`).join(', ');
  return [...glows, `linear-gradient(180deg, ${stops})`].join(', ');
}

/* ---------- 文字卡 ---------- */

export const TEXT_STYLES = [
  { id: 'card', name: '紙卡' },
  { id: 'glow', name: '柔光' },
  { id: 'plain', name: '純文字' },
];

/** 文字卡的字級、內距、行高（以願景板座標計） */
export function textMetrics(item) {
  const len = [...(item.text || '')].length;
  const ratio = len <= 4 ? 0.15 : len <= 10 ? 0.11 : len <= 24 ? 0.085 : 0.07;
  const fontSize = item.w * ratio;
  const padding = item.style === 'plain' ? item.w * 0.03 : item.w * 0.09;
  return { fontSize, padding, lineHeight: fontSize * 1.5 };
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
export function estimateMeasure(fontSize) {
  return (s) => [...s].reduce((sum, ch) => sum + (/[\x20-\x7E]/.test(ch) ? 0.55 : 1) * fontSize, 0);
}

/** 物件高度。文字卡需要 measure 才精準，未提供時用估算。 */
export function itemHeight(item, measure) {
  if (item.type === 'photo') {
    const pad = item.frame ? item.w * 0.045 : 0;
    return (item.w - pad * 2) / (item.aspect || 1) + pad * 2;
  }
  if (item.type === 'sticker') return item.w;
  const m = textMetrics(item);
  const lines = wrapText(item.text || '', item.w - m.padding * 2, measure || estimateMeasure(m.fontSize));
  return lines.length * m.lineHeight + m.padding * 2;
}

/* ---------- 物件操作 ---------- */

let idCounter = 0;
export function newId(prefix = 'i') {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createBoard(title = '我的願景板') {
  const now = new Date().toISOString();
  return { id: newId('b'), title, background: 'cream', items: [], createdAt: now, updatedAt: now };
}

export function maxZ(board) {
  return board.items.reduce((m, it) => Math.max(m, it.z || 0), 0);
}

/** 新物件放在畫面中央偏上，帶一點隨機位移，避免完全疊在一起 */
export function placeNew(board, item, rand = Math.random) {
  const w = item.w || (item.type === 'sticker' ? 220 : item.type === 'photo' ? 520 : 560);
  return {
    id: newId(),
    rot: 0,
    ...item,
    w,
    x: BOARD_W / 2 + (rand() - 0.5) * 240,
    y: BOARD_H * 0.42 + (rand() - 0.5) * 360,
    z: maxZ(board) + 1,
  };
}

export function clampItem(item) {
  const w = Math.min(MAX_W, Math.max(MIN_W, item.w));
  return {
    ...item,
    w,
    x: Math.min(BOARD_W, Math.max(0, item.x)),
    y: Math.min(BOARD_H, Math.max(0, item.y)),
    rot: ((((item.rot || 0) + 180) % 360) + 360) % 360 - 180,
  };
}

/* ---------- 自動排版 ---------- */

export const LAYOUTS = [
  { id: 'scatter', name: '拼貼散落' },
  { id: 'grid', name: '整齊網格' },
  { id: 'focus', name: '主角置中' },
];

/** 可重現的亂數（同一個 seed 得到同樣的排版） */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const between = (rand, lo, hi) => lo + rand() * (hi - lo);
const MARGIN = 70;

function layoutGrid(main, rand) {
  const cols = main.length > 7 ? 3 : main.length > 1 ? 2 : 1;
  const gap = 34;
  const colW = (BOARD_W - MARGIN * 2 - gap * (cols - 1)) / cols;
  const heights = Array(cols).fill(0);
  const placed = main.map((it) => {
    const c = heights.indexOf(Math.min(...heights));
    const sized = { ...it, w: colW, rot: 0 };
    const h = itemHeight(sized);
    const out = { ...sized, x: MARGIN + c * (colW + gap) + colW / 2, top: heights[c], h };
    heights[c] += h + gap;
    return out;
  });
  // 整體高度超過畫面時等比縮小，並垂直置中
  const total = Math.max(...heights) - gap;
  const avail = BOARD_H - MARGIN * 2;
  const scale = total > avail ? avail / total : 1;
  const offsetY = (BOARD_H - total * scale) / 2;
  return placed.map(({ top, h, ...it }) => ({
    ...it,
    w: it.w * scale,
    x: BOARD_W / 2 + (it.x - BOARD_W / 2) * scale,
    y: offsetY + (top + h / 2) * scale,
  }));
}

function layoutScatter(main, rand) {
  const n = main.length;
  const cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellW = (BOARD_W - MARGIN * 2) / cols;
  const cellH = (BOARD_H - MARGIN * 2) / rows;
  return main.map((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // 最後一列不滿時置中
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rowOffset = ((cols - inRow) * cellW) / 2;
    const ratio = it.type === 'photo' ? it.aspect || 1 : 2.2;
    let w = Math.min(cellW * between(rand, 0.95, 1.12), cellH * 0.92 * ratio);
    if (it.type === 'text') w = Math.max(w, Math.min(BOARD_W * 0.5, cellW * 1.15));
    return {
      ...it,
      w,
      x: MARGIN + rowOffset + c * cellW + cellW / 2 + between(rand, -0.1, 0.1) * cellW,
      y: MARGIN + r * cellH + cellH / 2 + between(rand, -0.08, 0.08) * cellH,
      rot: between(rand, -8, 8),
    };
  });
}

function layoutFocus(main, rand) {
  const heroIdx = Math.max(0, main.findIndex((it) => it.type === 'photo'));
  const hero = main[heroIdx];
  const others = main.filter((_, i) => i !== heroIdx);
  const heroW = others.length ? BOARD_W * 0.6 : BOARD_W * 0.78;
  const out = [{ ...hero, w: heroW, x: BOARD_W / 2, y: BOARD_H * 0.47, rot: between(rand, -2, 2) }];
  const start = between(rand, 0, Math.PI * 2);
  const n = others.length;
  const size = n <= 3 ? 0.42 : n <= 6 ? 0.36 : 0.28;
  others.forEach((it, i) => {
    const angle = start + (i / n) * Math.PI * 2;
    // 文字卡寬一點，字才看得清楚
    const w = BOARD_W * (it.type === 'text' ? Math.max(size, 0.5) : size);
    out.push({
      ...it,
      w,
      x: BOARD_W / 2 + Math.cos(angle) * BOARD_W * 0.31,
      y: BOARD_H * 0.47 + Math.sin(angle) * BOARD_H * 0.33,
      rot: between(rand, -7, 7),
    });
  });
  return out;
}

/**
 * 自動排版：照片與文字卡依版型排列，素材貼紙點綴在上層。
 * 回傳新的 items 陣列（不修改原陣列）。
 */
export function autoLayout(items, { layout = 'scatter', seed = 1 } = {}) {
  const rand = seededRandom(seed);
  const stickers = items.filter((it) => it.type === 'sticker');
  const main = shuffle(
    items.filter((it) => it.type !== 'sticker'),
    rand,
  );
  let placed = [];
  if (main.length) {
    if (layout === 'grid') placed = layoutGrid(main, rand);
    else if (layout === 'focus') placed = layoutFocus(main, rand);
    else placed = layoutScatter(main, rand);
  }
  placed = placed.map((it, i) => ({ ...it, z: i + 1 }));
  const decor = stickers.map((it, i) => ({
    ...it,
    w: BOARD_W * between(rand, 0.11, 0.17),
    x: between(rand, 0.1, 0.9) * BOARD_W,
    y: between(rand, 0.06, 0.94) * BOARD_H,
    rot: between(rand, -15, 15),
    z: placed.length + i + 1,
  }));
  return [...placed, ...decor].map(clampItem);
}

/* ---------- 備份驗證 ---------- */

const finite = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

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
    if (it.type === 'photo' && typeof it.imageId === 'string') {
      const aspect = Math.min(10, Math.max(0.1, finite(it.aspect, 1)));
      items.push(clampItem({ ...base, type: 'photo', imageId: it.imageId.slice(0, 64), aspect, frame: !!it.frame }));
    } else if (it.type === 'sticker' && typeof it.sticker === 'string') {
      items.push(clampItem({ ...base, type: 'sticker', sticker: it.sticker.slice(0, 32) }));
    } else if (it.type === 'text' && typeof it.text === 'string' && it.text.trim()) {
      const style = TEXT_STYLES.some((s) => s.id === it.style) ? it.style : 'card';
      items.push(clampItem({ ...base, type: 'text', text: it.text.slice(0, 200), style }));
    }
  }
  const now = new Date().toISOString();
  return {
    id: b.id.slice(0, 64),
    title: typeof b.title === 'string' ? b.title.slice(0, 40) : '我的願景板',
    background: BACKGROUNDS.some((bg) => bg.id === b.background) ? b.background : 'cream',
    items,
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : now,
    updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : now,
  };
}

/** 願景板使用到的照片 id */
export function usedImageIds(boards) {
  return [...new Set(boards.flatMap((b) => b.items.filter((it) => it.type === 'photo').map((it) => it.imageId)))];
}
