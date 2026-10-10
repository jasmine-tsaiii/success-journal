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
  cleanTagName,
  computeTagStats,
  extractHashtags,
  itemTags,
  monthlyTagTable,
  periodRange,
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
  for (const k of Object.keys(entries)) assert.deepEqual(back[k].items, entries[k].items);
  assert.deepEqual(back['2026-10-01'].tags, [[], [], []]);
});

const t = (items, tags) => ({ items: [...items, '', '', ''].slice(0, 3), tags, updatedAt: '2026-01-01T00:00:00.000Z' });

test('標籤：#hashtag 解析與名稱清理', () => {
  assert.deepEqual(extractHashtags('完成報告 #工作 #工作，還有＃健康!'), ['工作', '健康']);
  assert.deepEqual(extractHashtags('沒有標籤'), []);
  assert.equal(cleanTagName('  #自我 照顧  '), '自我照顧');
  assert.equal(cleanTagName('一二三四五六七八九十一二三'), '一二三四五六七八九十一二');
  const entry = t(['散步 #健康', '', '早睡'], [['生活', '健康'], ['工作'], []]);
  assert.deepEqual(itemTags(entry, 0), ['生活', '健康']);
  assert.deepEqual(itemTags(entry, 1), [], '沒有內容的那件不算');
  assert.deepEqual(itemTags(entry, 2), []);
});

test('標籤統計：件數、比例、未分類、日期區間', () => {
  const entries = {
    '2026-09-29': t(['報告', '跑步', '看書'], [['工作'], ['健康'], []]),
    '2026-09-30': t(['開會 #工作', '陪家人'], [[], ['人際', '生活']]),
    '2026-10-01': t(['簡報'], [['工作']]),
  };
  const all = computeTagStats(entries);
  assert.equal(all.total, 6);
  assert.equal(all.untagged, 1);
  assert.deepEqual(all.rows.map((r) => [r.tag, r.count]), [['工作', 3], ['人際', 1], ['生活', 1], ['健康', 1]]);
  assert.equal(all.rows[0].share, 0.5);
  const oct = computeTagStats(entries, periodRange('month', '2026-10-01'));
  assert.deepEqual([oct.total, oct.rows[0].tag], [1, '工作']);
  assert.deepEqual(periodRange('week', '2026-10-01'), { from: '2026-09-28', to: '2026-10-01' });
  assert.deepEqual(periodRange('year', '2026-10-01'), { from: '2026-01-01', to: '2026-10-01' });
  assert.equal(computeTagStats({}).total, 0);
});

test('每月標籤表：近幾個月、其他、未分類、合計', () => {
  const entries = {
    '2026-08-15': t(['a', 'b'], [['工作'], ['學習']]),
    '2026-10-01': t(['c', 'd', 'e'], [['工作'], ['工作'], []]),
  };
  const table = monthlyTagTable(entries, '2026-10-01', 3, 1);
  assert.deepEqual(table.months, ['2026-08', '2026-09', '2026-10']);
  const row = (tag) => table.rows.find((r) => r.tag === tag).counts;
  assert.deepEqual(row('工作'), [1, 0, 2]);
  assert.deepEqual(row('其他'), [1, 0, 0]);
  assert.deepEqual(row('未分類'), [0, 0, 1]);
  assert.deepEqual(row('合計'), [2, 0, 3]);
  // 跨年
  assert.deepEqual(monthlyTagTable({}, '2026-02-10', 3).months, ['2025-12', '2026-01', '2026-02']);
});

test('文字檔匯出附上標籤，備份保留標籤與標籤清單', () => {
  const entries = { '2026-10-01': t(['簡報 #工作', '散步'], [['工作'], ['健康']]) };
  const txt = buildTextExport(entries);
  assert.match(txt, /1\. 簡報 #工作\n {2}2\. 散步 {2}#健康/);
  const back = parseBackup(JSON.stringify(buildBackup(entries, new Date(), { tags: ['工作', '#冥想'] })));
  assert.deepEqual(back.entries['2026-10-01'].tags[1], ['健康']);
  assert.deepEqual(back.tags, ['工作', '冥想']);
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
  assert.deepEqual(entries['2026-10-01'].items, ['a', '', '', 'extra'], '第四件之後也保留（非文字的格子變成空白）');
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

test('cleanItems／cleanTags：預設三件，可以多寫到十件，後面的空白格會移除', async () => {
  const { cleanItems, cleanTags, MAX_ITEMS } = await import('../app/js/core.js');
  assert.deepEqual(cleanItems(undefined), ['', '', '']);
  assert.deepEqual(cleanItems(['a']), ['a', '', '']);
  assert.deepEqual(cleanItems(['a', 'b', 'c', 'd', '', ' ']), ['a', 'b', 'c', 'd']);
  assert.deepEqual(cleanItems(['a', '', '', '', '']), ['a', '', '']);
  assert.equal(cleanItems(Array.from({ length: 15 }, (_, i) => `w${i}`)).length, MAX_ITEMS);
  assert.deepEqual(cleanItems([1, null, 'c', 'd']), ['', '', 'c', 'd']);
  assert.equal(cleanTags(undefined).length, 3);
  assert.equal(cleanTags([[], [], [], ['工作']], 4)[3][0], '工作');
  assert.equal(cleanTags([], 20).length, MAX_ITEMS);
});

test('parseBackup：保留第四件之後的成功與標籤', async () => {
  const { parseBackup } = await import('../app/js/core.js');
  const text = JSON.stringify({ app: 'success-journal', version: 2, entries: { '2026-10-01': { items: ['a', 'b', 'c', 'd', 'e'], tags: [[], [], [], [], ['學習']], updatedAt: '2026-10-01T01:00:00.000Z' } } });
  const { entries } = parseBackup(text);
  assert.deepEqual(entries['2026-10-01'].items, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(entries['2026-10-01'].tags[4], ['學習']);
});

test('引導問題的回答：算有紀錄、備份保留、文字檔匯出', async () => {
  const { cleanReflection, hasRecord, computeStats, parseBackup, buildTextExport } = await import('../app/js/core.js');
  assert.equal(cleanReflection(null), null);
  assert.equal(cleanReflection({ q: '問', a: '   ' }), null);
  assert.deepEqual(cleanReflection({ q: '問', a: '答' }), { q: '問', a: '答' });
  const onlyReflection = { items: ['', '', ''], reflection: { q: '今天你說出了哪一句真心話？', a: '我跟媽媽說謝謝' } };
  assert.equal(hasRecord(onlyReflection), true);
  const stats = computeStats({ '2026-10-01': onlyReflection }, '2026-10-01');
  assert.equal(stats.totalDays, 1);
  assert.equal(stats.totalItems, 0);
  assert.equal(stats.streak, 1);
  const { entries } = parseBackup(JSON.stringify({ app: 'success-journal', version: 2, entries: { '2026-10-01': onlyReflection } }));
  assert.deepEqual(entries['2026-10-01'].reflection, onlyReflection.reflection);
  const txt = buildTextExport({ '2026-10-01': { ...onlyReflection, items: ['早起', '', ''] } });
  assert.match(txt, / {2}1\. 早起\n {2}✎ 今天你說出了哪一句真心話？\n {4}我跟媽媽說謝謝/);
});

test('感恩日記：預設一格、最多五件、算有紀錄、統計最常感謝的對象、備份與匯出', async () => {
  const { cleanThanks, cleanThanksTo, hasRecord, computeThanksStats, parseBackup, buildTextExport, MAX_THANKS } = await import('../app/js/core.js');
  assert.deepEqual(cleanThanks(undefined), ['']);
  assert.deepEqual(cleanThanks(['謝謝媽媽', '', ' ']), ['謝謝媽媽']);
  assert.equal(cleanThanks(Array(9).fill('a')).length, MAX_THANKS);
  assert.deepEqual(cleanThanksTo([['家人', '不存在的', '家人']], 1), [['家人']]);
  const e = (g, to) => ({ items: ['', '', ''], gratitude: g, gratitudeTo: to });
  assert.equal(hasRecord(e(['謝謝同事幫忙'], [['同事']])), true);
  assert.equal(hasRecord(e([''], [[]])), false);
  const stats = computeThanksStats({
    '2026-10-01': e(['媽媽煮的湯', '路人幫我撐傘'], [['家人'], ['陌生人']]),
    '2026-10-02': e(['爸爸載我'], [['家人']]),
    bad: e(['x'], [['家人']]),
  });
  assert.deepEqual(stats, { total: 3, top: { who: '家人', count: 2 } });
  assert.deepEqual(computeThanksStats({}), { total: 0, top: null });
  const { entries } = parseBackup(JSON.stringify({ app: 'success-journal', version: 2, entries: { '2026-10-01': e(['媽媽煮的湯', ''], [['家人', 'x'], []]) } }));
  assert.deepEqual(entries['2026-10-01'].gratitude, ['媽媽煮的湯']);
  assert.deepEqual(entries['2026-10-01'].gratitudeTo, [['家人']]);
  const txt = buildTextExport({ '2026-10-01': { items: ['早起', '', ''], gratitude: ['媽媽煮的湯'], gratitudeTo: [['家人']] } });
  assert.match(txt, / {2}1\. 早起\n {2}♡ 媽媽煮的湯（謝謝家人）/);
});

test('感恩抽屜：收集小紙條、相對時間、隨機抽且不重複上一張', async () => {
  const { collectThanks, relativeDay, pickThanks } = await import('../app/js/core.js');
  const notes = collectThanks({
    '2026-09-10': { gratitude: ['爸爸載我', ''], gratitudeTo: [['家人'], []] },
    '2026-10-08': { gratitude: ['今天的陽光'], gratitudeTo: [['大自然']] },
    '2026-10-01': { items: ['a'] },
    bad: { gratitude: ['x'] },
  });
  assert.deepEqual(notes.map((n) => n.date), ['2026-10-08', '2026-09-10']);
  assert.deepEqual(notes[1].to, ['家人']);
  assert.equal(relativeDay('2026-10-08', '2026-10-08'), '今天');
  assert.equal(relativeDay('2026-10-07', '2026-10-08'), '昨天');
  assert.equal(relativeDay('2026-10-05', '2026-10-08'), '3 天前');
  assert.equal(relativeDay('2026-09-17', '2026-10-08'), '3 週前');
  assert.equal(relativeDay('2026-07-01', '2026-10-08'), '3 個月前');
  assert.equal(relativeDay('2024-10-01', '2026-10-08'), '2 年前');
  // 優先抽今天以前的
  assert.equal(pickThanks(notes, '2026-10-08', null, () => 0).text, '爸爸載我');
  // 只有今天的時候也抽得到
  assert.equal(pickThanks([notes[0]], '2026-10-08').text, '今天的陽光');
  // 不重複上一張
  const many = collectThanks({ '2026-09-01': { gratitude: ['a', 'b'] } });
  for (let i = 0; i < 10; i++) assert.equal(pickThanks(many, '2026-10-08', many[0]).text, 'b');
  assert.equal(pickThanks([], '2026-10-08'), null);
});

test('版本號：sw.js、js/version.js、index.html 的版本檢查一致', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../app/', import.meta.url);
  const sw = (await readFile(new URL('sw.js', root), 'utf8')).match(/const VERSION = '([^']+)'/)[1];
  const js = (await readFile(new URL('js/version.js', root), 'utf8')).match(/APP_VERSION = '([^']+)'/)[1];
  const html = (await readFile(new URL('index.html', root), 'utf8')).match(/PAGE_VERSION = '([^']+)'/)[1];
  assert.equal(js, sw);
  assert.equal(html, sw);
});
