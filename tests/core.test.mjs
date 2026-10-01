import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAKRAS } from '../app/js/chakras.js';
import {
  addDays,
  buildBackup,
  buildTextExport,
  chakraForDate,
  computeStats,
  currentStreak,
  dayNumber,
  formatDateZh,
  isValidKey,
  longestStreak,
  mergeEntries,
  monthGrid,
  parseBackup,
  weekdayIndex,
} from '../app/js/core.js';

const e = (...items) => ({ items: [...items, '', '', ''].slice(0, 3), updatedAt: '2026-01-01T00:00:00.000Z' });

test('七大脈輪內容完整：每個至少 5 句肯定語，且有引導問題', () => {
  assert.equal(CHAKRAS.length, 7);
  for (const c of CHAKRAS) {
    assert.ok(c.name && c.colorName && /^#[0-9A-F]{6}$/i.test(c.color), c.id);
    assert.ok(c.affirmations.length >= 5, `${c.name} 肯定語不足 5 句`);
    assert.ok(c.prompts.length >= 1);
    assert.equal(new Set(c.affirmations).size, c.affirmations.length, `${c.name} 肯定語重複`);
  }
});

test('文案不含醫療療效相關用語', () => {
  const banned = /治療|治癒|療效|疾病|病痛|藥|醫治|痊癒|根治/;
  for (const c of CHAKRAS) {
    for (const text of [c.theme, ...c.prompts, ...c.affirmations]) {
      assert.ok(!banned.test(text), `不適當的用語：${text}`);
    }
  }
});

test('日期工具', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dayNumber('1970-01-02'), 1);
  assert.ok(isValidKey('2026-10-01'));
  assert.ok(!isValidKey('2026-02-30'));
  assert.ok(!isValidKey('2026/10/01'));
  assert.equal(weekdayIndex('2026-10-05'), 0); // 週一
  assert.equal(weekdayIndex('2026-10-01'), 3); // 週四
  assert.equal(formatDateZh('2026-10-04'), '2026 年 10 月 4 日（週日）');
});

test('脈輪依星期輪替：週一海底輪 → 週日頂輪', () => {
  const names = [];
  for (let i = 0; i < 7; i++) names.push(chakraForDate(addDays('2026-10-05', i)).chakra.id);
  assert.deepEqual(names, ['root', 'sacral', 'solar', 'heart', 'throat', 'third-eye', 'crown']);
  assert.equal(chakraForDate('2026-10-12').chakra.id, 'root');
});

test('肯定語會隨週次輪替，且每句最終都會出現', () => {
  const seen = new Set();
  for (let w = 0; w < 6; w++) seen.add(chakraForDate(addDays('2026-10-05', w * 7)).affirmation);
  assert.equal(seen.size, CHAKRAS[0].affirmations.length);
  // 同一週同一天結果固定
  assert.deepEqual(chakraForDate('2026-10-05'), chakraForDate('2026-10-05'));
});

test('連續天數與統計', () => {
  const entries = {
    '2026-09-27': e('a'),
    '2026-09-28': e('a', 'b'),
    '2026-09-29': e('a', 'b', 'c'),
    '2026-09-30': e('a'),
    '2026-09-25': e('x'),
    '2026-09-26': e('', '  '), // 空白不算
  };
  // 今天還沒寫：從昨天起算
  assert.equal(currentStreak(entries, '2026-10-01'), 4);
  // 今天寫了
  assert.equal(currentStreak({ ...entries, '2026-10-01': e('ok') }, '2026-10-01'), 5);
  // 中斷超過一天
  assert.equal(currentStreak(entries, '2026-10-03'), 0);
  assert.equal(longestStreak(entries), 4);
  assert.deepEqual(computeStats(entries, '2026-10-01'), { streak: 4, longest: 4, totalDays: 5, totalItems: 8 });
});

test('月曆格子以週一起始', () => {
  const cells = monthGrid(2026, 10); // 2026-10-01 為週四
  assert.equal(cells.length % 7, 0);
  assert.deepEqual(cells.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(cells.filter(Boolean).length, 31);
});

test('JSON 備份可以來回轉換', () => {
  const entries = { '2026-09-30': e('一', '二', '三'), '2026-10-01': e('今天') };
  const backup = buildBackup(entries, new Date('2026-10-01T12:00:00Z'));
  const { entries: back, count } = parseBackup(JSON.stringify(backup));
  assert.equal(count, 2);
  assert.deepEqual(back, entries);
});

test('匯入時驗證格式並清理資料', () => {
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup('{"foo":1}'), /備份檔/);
  assert.throws(() => parseBackup('{"app":"success-journal","version":99,"entries":{}}'), /版本/);
  const { entries, count } = parseBackup(
    JSON.stringify({
      app: 'success-journal',
      version: 1,
      entries: { 'bad-key': e('x'), '2026-10-01': { items: ['a', 3, null, 'extra'] }, '2026-10-02': { items: ['', ''] } },
    }),
  );
  assert.equal(count, 1);
  assert.deepEqual(entries['2026-10-01'].items, ['a', '', '']);
});

test('合併：備份覆蓋同日期，保留其他日期', () => {
  const merged = mergeEntries({ a: 1, b: 2 }, { b: 3, c: 4 });
  assert.deepEqual(merged, { a: 1, b: 3, c: 4 });
});

test('文字檔匯出易讀', () => {
  const txt = buildTextExport({ '2026-10-01': e('早起', '', '散步\n看見夕陽'), '2026-09-30': e('喝水') });
  assert.match(txt, /2026 年 9 月 30 日（週三）｜太陽神經叢輪\n {2}1\. 喝水/);
  assert.match(txt, /2026 年 10 月 1 日（週四）｜心輪\n {2}1\. 早起\n {2}2\. 散步\n {5}看見夕陽/);
  assert.ok(txt.indexOf('9 月 30 日') < txt.indexOf('10 月 1 日'));
});
