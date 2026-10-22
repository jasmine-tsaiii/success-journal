// 勇氣練習與勇氣挑戰：純邏輯（方便測試）。
// 「勇敢一步」記在小成功上：entry.courage[i] 對應 entry.items[i]，沒有的為 null。
// 被拒絕也算一件小成功，而且是挑戰的分數。

import { addDays, dayNumber, isValidKey } from './core.js';

export const OUTCOMES = ['yes', 'no', 'pending'];
export const OUTCOME_LABEL = { yes: '成功了', no: '被拒絕', pending: '還沒回音' };
export const OUTCOME_ICON = { yes: '✓', no: '✗', pending: '…' };

const MAX_NOTE = 300;

/** 清理一件小成功的勇氣紀錄：{ outcome, fear, next }，不是勇敢一步的回傳 null */
function cleanOne(c) {
  if (!c || typeof c !== 'object') return null;
  const outcome = OUTCOMES.includes(c.outcome) ? c.outcome : 'pending';
  const text = (v) => (typeof v === 'string' ? v.slice(0, MAX_NOTE) : '');
  return { outcome, fear: text(c.fear), next: text(c.next) };
}

/** 和小成功一樣長的陣列；全部都不是勇敢一步時回傳 null（不存進日記） */
export function cleanCourage(list, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(Array.isArray(list) ? cleanOne(list[i]) : null);
  return out.some(Boolean) ? out : null;
}

/** 某段期間的勇敢一步（有寫內容的才算），新的在前：[{ date, i, text, outcome, fear, next }] */
export function courageItems(entries, { from = null, to = null } = {}) {
  const out = [];
  for (const [date, entry] of Object.entries(entries || {})) {
    if (!isValidKey(date) || (from && date < from) || (to && date > to)) continue;
    const items = Array.isArray(entry?.items) ? entry.items : [];
    const list = Array.isArray(entry?.courage) ? entry.courage : [];
    items.forEach((text, i) => {
      const c = cleanOne(list[i]);
      if (c && typeof text === 'string' && text.trim()) out.push({ date, i, text: text.trim(), ...c });
    });
  }
  return out.sort((a, b) => (a.date === b.date ? a.i - b.i : a.date < b.date ? 1 : -1));
}

/* ---------- 挑戰 ---------- */

export const CHALLENGE_DAYS = [14, 30, 60];
export const CHALLENGE_TARGETS = [10, 20, 30];

/** { startDate, days, target, endedAt? }；格式不對回傳 null */
export function cleanChallenge(c) {
  if (!c || typeof c !== 'object' || !isValidKey(c.startDate)) return null;
  const num = (v, def) => {
    const n = Math.round(Number(v));
    return n > 0 ? n : def;
  };
  const days = Math.min(num(c.days, 30), 365);
  const target = Math.min(num(c.target, 20), 999);
  const out = { startDate: c.startDate, days, target };
  if (typeof c.endedAt === 'string' && c.endedAt) out.endedAt = c.endedAt;
  return out;
}

/**
 * 挑戰進度：
 *  day（今天是第幾天，最多 days）、endDate、finished（期間已過或手動結束）、
 *  cells（每天一格：{ date, done, today, future }）、brave／no／yes／pending 次數、
 *  doneDays（有勇敢一步的天數）、reached（被拒絕次數達標）
 */
export function challengeProgress(entries, challenge, today) {
  const c = cleanChallenge(challenge);
  if (!c) return null;
  const endDate = addDays(c.startDate, c.days - 1);
  const items = courageItems(entries, { from: c.startDate, to: endDate < today ? endDate : today });
  const doneSet = new Set(items.map((x) => x.date));
  const cells = [];
  for (let k = 0; k < c.days; k++) {
    const date = addDays(c.startDate, k);
    cells.push({ date, done: doneSet.has(date), today: date === today, future: date > today });
  }
  const count = (o) => items.filter((x) => x.outcome === o).length;
  const day = Math.min(Math.max(dayNumber(today) - dayNumber(c.startDate) + 1, 1), c.days);
  return {
    ...c,
    endDate,
    day,
    finished: Boolean(c.endedAt) || today > endDate,
    cells,
    brave: items.length,
    no: count('no'),
    yes: count('yes'),
    pending: count('pending'),
    doneDays: doneSet.size,
    reached: count('no') >= c.target,
    recent: items.slice(0, 5),
  };
}

/* ---------- 勇氣點子庫 ---------- */

export const IDEA_LEVELS = ['暖身', '進階', '挑戰'];

export const IDEAS = [
  // 暖身：很小、很安全的請求
  { level: 0, text: '點餐時問店員可不可以客製（少冰、換配料）' },
  { level: 0, text: '問店家有沒有優惠，沒有也沒關係' },
  { level: 0, text: '主動跟常去的店員或鄰居多聊一句' },
  { level: 0, text: '在會議或課堂上問一個問題' },
  { level: 0, text: '請路人幫你拍一張照片' },
  { level: 0, text: '跟朋友說出一個你真正想去的地方' },
  { level: 0, text: '向同事請教一個你不懂的問題' },
  { level: 0, text: '有禮貌地退換一個不滿意的東西' },
  // 進階：說出需求、讓別人看見你
  { level: 1, text: '主動約一位想認識的人喝咖啡' },
  { level: 1, text: '跟主管或客戶說出一個你的需求' },
  { level: 1, text: '在社群分享一個真實的想法或作品' },
  { level: 1, text: '請朋友給你一個誠實的回饋' },
  { level: 1, text: '拒絕一個你其實不想答應的邀約' },
  { level: 1, text: '主動提議一個新的做法' },
  { level: 1, text: '請別人幫一個平常不好意思開口的忙' },
  { level: 1, text: '問能不能延後、改期或換一個方式' },
  // 挑戰：為自己爭取機會
  { level: 2, text: '毛遂自薦一個專案或角色' },
  { level: 2, text: '向你欣賞的人提出合作邀請' },
  { level: 2, text: '開口談加薪、漲價或更好的條件' },
  { level: 2, text: '報名或投稿一個「可能不會上」的機會' },
  { level: 2, text: '主動聯絡一位潛在客戶' },
  { level: 2, text: '公開說出你的目標，請大家見證' },
  { level: 2, text: '向一位業界前輩請教' },
  { level: 2, text: '說出一句你一直不敢說的真心話' },
];

/** 抽一個點子（level 為 null 表示不限），盡量不和上一個相同 */
export function pickIdea(level = null, prev = null, rand = Math.random) {
  let pool = IDEAS.filter((x) => level === null || x.level === level);
  if (pool.length > 1 && prev) pool = pool.filter((x) => x.text !== prev.text);
  return pool[Math.floor(rand() * pool.length)] || null;
}
