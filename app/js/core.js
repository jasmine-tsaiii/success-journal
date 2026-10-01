// 純邏輯模組：日期、脈輪輪替、統計、備份格式。
// 不碰 DOM，方便在 Node 中測試。

import { CHAKRAS } from './chakras.js';
import { sanitizeBoard } from './board-core.js';

export const ITEMS_PER_DAY = 3;
export const BACKUP_APP_ID = 'success-journal';
export const BACKUP_VERSION = 2;
const MAX_IMAGE_DATA = 12 * 1024 * 1024;

const DAY_MS = 86400000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');

/** Date 物件 → 本地日期字串 YYYY-MM-DD */
export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now = new Date()) {
  return toKey(now);
}

export function isValidKey(key) {
  const m = DATE_RE.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** YYYY-MM-DD → 自 1970-01-01 起的天數（與時區無關） */
export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(key, delta) {
  return fromDayNumber(dayNumber(key) + delta);
}

/** 0 = 週一 … 6 = 週日 */
export function weekdayIndex(key) {
  // 1970-01-01 是週四（索引 3）
  return (((dayNumber(key) + 3) % 7) + 7) % 7;
}

/** 以週一為一週起點的週序號，用於肯定語與問題輪替 */
export function weekNumber(key) {
  return Math.floor((dayNumber(key) + 3) / 7);
}

/** 取得某天的脈輪主題、引導問題與肯定語 */
export function chakraForDate(key) {
  const chakra = CHAKRAS[weekdayIndex(key)];
  const week = weekNumber(key);
  const mod = (n, len) => ((n % len) + len) % len;
  return {
    chakra,
    prompt: chakra.prompts[mod(week, chakra.prompts.length)],
    affirmation: chakra.affirmations[mod(week, chakra.affirmations.length)],
  };
}

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

export function formatDateZh(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日（週${WEEKDAY_NAMES[weekdayIndex(key)]}）`;
}

/* ---------- 紀錄與統計 ---------- */

export function cleanItems(items) {
  const out = [];
  for (let i = 0; i < ITEMS_PER_DAY; i++) {
    const v = Array.isArray(items) ? items[i] : '';
    out.push(typeof v === 'string' ? v : '');
  }
  return out;
}

export function filledItems(entry) {
  if (!entry || !Array.isArray(entry.items)) return [];
  return entry.items.filter((t) => typeof t === 'string' && t.trim() !== '');
}

export function hasRecord(entry) {
  return filledItems(entry).length > 0;
}

/**
 * 連續記錄天數：從今天往回數；若今天尚未記錄，從昨天起算
 * （讓使用者在今天寫之前，不會看到連續紀錄歸零）。
 */
export function currentStreak(entries, today) {
  let day = hasRecord(entries[today]) ? today : addDays(today, -1);
  let streak = 0;
  while (hasRecord(entries[day])) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function longestStreak(entries) {
  const days = Object.keys(entries)
    .filter((k) => isValidKey(k) && hasRecord(entries[k]))
    .map(dayNumber)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const n of days) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return best;
}

export function computeStats(entries, today) {
  let totalItems = 0;
  let totalDays = 0;
  for (const [key, entry] of Object.entries(entries)) {
    if (!isValidKey(key)) continue;
    const n = filledItems(entry).length;
    if (n > 0) {
      totalDays++;
      totalItems += n;
    }
  }
  return {
    streak: currentStreak(entries, today),
    longest: longestStreak(entries),
    totalDays,
    totalItems,
  };
}

/* ---------- 月曆 ---------- */

/** 產生月曆格子（週一起始），不在該月的格子為 null */
export function monthGrid(year, month /* 1-12 */) {
  const first = `${year}-${pad(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = weekdayIndex(first);
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ---------- 備份 ---------- */

/**
 * 建立備份內容。boards 為願景板版面，images 為 { id: { data: dataURL, width, height } }。
 */
export function buildBackup(entries, now = new Date(), { boards = [], images = {} } = {}) {
  const sorted = {};
  for (const key of Object.keys(entries).sort()) {
    if (isValidKey(key) && hasRecord(entries[key])) sorted[key] = entries[key];
  }
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    entries: sorted,
    boards,
    images,
  };
}

/**
 * 解析並驗證備份檔內容。成功回傳 { entries, count }，失敗丟出帶中文訊息的錯誤。
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('檔案不是有效的 JSON 格式。');
  }
  if (!data || typeof data !== 'object' || data.app !== BACKUP_APP_ID || typeof data.entries !== 'object' || data.entries === null) {
    throw new Error('這不是「成功日記」的備份檔。');
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error('備份檔版本較新，請先更新 App 後再匯入。');
  }
  const entries = {};
  for (const [key, entry] of Object.entries(data.entries)) {
    if (!isValidKey(key) || !entry || typeof entry !== 'object') continue;
    const items = cleanItems(entry.items).map((t) => t.slice(0, 2000));
    if (!items.some((t) => t.trim())) continue;
    entries[key] = {
      items,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    };
  }
  const boards = (Array.isArray(data.boards) ? data.boards : []).map(sanitizeBoard).filter(Boolean);
  const images = {};
  if (data.images && typeof data.images === 'object') {
    for (const [id, img] of Object.entries(data.images)) {
      if (!img || typeof img.data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(img.data)) continue;
      if (img.data.length > MAX_IMAGE_DATA) continue;
      images[id.slice(0, 64)] = { data: img.data, width: Number(img.width) || 0, height: Number(img.height) || 0 };
    }
  }
  return { entries, count: Object.keys(entries).length, boards, images };
}

/** 合併願景板：同 id 以備份為準，其他保留 */
export function mergeBoards(current, incoming) {
  const map = new Map(current.map((b) => [b.id, b]));
  for (const b of incoming) map.set(b.id, b);
  return [...map.values()];
}

/** 合併：備份檔中的日期覆蓋現有同日期紀錄，其他保留 */
export function mergeEntries(current, incoming) {
  return { ...current, ...incoming };
}

export function buildTextExport(entries, boards = []) {
  const keys = Object.keys(entries)
    .filter((k) => isValidKey(k) && hasRecord(entries[k]))
    .sort();
  const lines = ['成功日記', '='.repeat(20), ''];
  if (keys.length === 0) lines.push('（目前還沒有紀錄）');
  for (const key of keys) {
    const { chakra } = chakraForDate(key);
    lines.push(`${formatDateZh(key)}｜${chakra.name}`);
    filledItems(entries[key]).forEach((t, i) => {
      const [first, ...rest] = t.trim().split('\n');
      lines.push(`  ${i + 1}. ${first}`);
      for (const r of rest) lines.push(`     ${r}`);
    });
    lines.push('');
  }
  const dreams = boards.filter((b) => b.items.some((it) => it.type === 'text'));
  if (dreams.length) {
    lines.push('願景板', '='.repeat(20), '');
    for (const b of dreams) {
      lines.push(b.title || '我的願景板');
      for (const it of b.items.filter((i) => i.type === 'text')) lines.push(`  ・${it.text.replace(/\n/g, ' ')}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
