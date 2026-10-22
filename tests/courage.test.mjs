import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDEAS, challengeProgress, cleanChallenge, cleanCourage, courageItems, pickIdea } from '../app/js/courage-core.js';

const e = (items, courage) => ({ items, courage, updatedAt: '2026-10-01T00:00:00.000Z' });

test('勇敢一步：清理資料，和小成功一樣長；全部不是時回傳 null', () => {
  assert.deepEqual(cleanCourage([{ outcome: 'no', fear: '怕被笑', next: 7 }, null, { outcome: 'x' }], 3), [
    { outcome: 'no', fear: '怕被笑', next: '' },
    null,
    { outcome: 'pending', fear: '', next: '' },
  ]);
  assert.equal(cleanCourage([null, null], 3), null);
  assert.equal(cleanCourage('bad', 3), null);
  assert.equal(cleanCourage([{ outcome: 'yes' }, { outcome: 'no' }], 1).length, 1, '多的截掉');
  assert.equal(cleanCourage([{ outcome: 'yes', fear: 'x'.repeat(500) }], 1)[0].fear.length, 300);
});

test('勇敢一步：列出期間內的紀錄，新的在前，沒寫內容的不算', () => {
  const entries = {
    '2026-10-20': e(['請店員換燕麥奶', '散步', ''], [{ outcome: 'yes' }, null, { outcome: 'no' }]),
    '2026-10-22': e(['問主管新專案'], [{ outcome: 'no', fear: '怕被覺得太急' }]),
    bad: e(['x'], [{ outcome: 'no' }]),
  };
  assert.deepEqual(
    courageItems(entries).map((x) => [x.date, x.text, x.outcome]),
    [
      ['2026-10-22', '問主管新專案', 'no'],
      ['2026-10-20', '請店員換燕麥奶', 'yes'],
    ],
  );
  assert.equal(courageItems(entries, { from: '2026-10-21' }).length, 1);
});

test('挑戰：清理設定', () => {
  assert.equal(cleanChallenge(null), null);
  assert.equal(cleanChallenge({ startDate: 'x' }), null);
  assert.deepEqual(cleanChallenge({ startDate: '2026-10-01', days: '30', target: 20.4 }), { startDate: '2026-10-01', days: 30, target: 20 });
  assert.deepEqual(cleanChallenge({ startDate: '2026-10-01', days: 0, target: -1 }), { startDate: '2026-10-01', days: 30, target: 20 });
  assert.equal(cleanChallenge({ startDate: '2026-10-01', endedAt: '2026-10-10' }).endedAt, '2026-10-10');
});

test('挑戰：第幾天、每天格子、次數、達標、結束', () => {
  const entries = {
    '2026-09-30': e(['挑戰開始前'], [{ outcome: 'no' }]),
    '2026-10-01': e(['A', 'B'], [{ outcome: 'no' }, { outcome: 'yes' }]),
    '2026-10-03': e(['C'], [{ outcome: 'pending' }]),
    '2026-10-04': e(['普通的小成功'], null),
    '2026-10-05': e(['D'], [{ outcome: 'no' }]),
  };
  const ch = { startDate: '2026-10-01', days: 14, target: 2 };
  const p = challengeProgress(entries, ch, '2026-10-05');
  assert.equal(p.day, 5);
  assert.equal(p.endDate, '2026-10-14');
  assert.equal(p.finished, false);
  assert.equal(p.cells.length, 14);
  assert.deepEqual(p.cells.slice(0, 6).map((c) => [c.done, c.today, c.future]), [
    [true, false, false],
    [false, false, false],
    [true, false, false],
    [false, false, false],
    [true, true, false],
    [false, false, true],
  ]);
  assert.deepEqual([p.brave, p.no, p.yes, p.pending, p.doneDays], [4, 2, 1, 1, 3]);
  assert.equal(p.reached, true, '被拒絕 2 次達標');
  assert.equal(p.recent[0].text, 'D');
  // 期間過了：結束，天數停在最後一天，期間外的不算
  entries['2026-10-20'] = e(['E'], [{ outcome: 'no' }]);
  const done = challengeProgress(entries, ch, '2026-10-20');
  assert.equal(done.finished, true);
  assert.equal(done.day, 14);
  assert.equal(done.no, 2);
  // 手動結束
  assert.equal(challengeProgress(entries, { ...ch, endedAt: '2026-10-05' }, '2026-10-05').finished, true);
  assert.equal(challengeProgress(entries, null, '2026-10-05'), null);
});

test('勇氣點子：三個等級都有，抽的時候不重複上一個', () => {
  for (const level of [0, 1, 2]) assert.ok(IDEAS.filter((x) => x.level === level).length >= 6);
  const a = pickIdea(1, null, () => 0);
  assert.equal(a.level, 1);
  const b = pickIdea(1, a, () => 0);
  assert.notEqual(b.text, a.text);
  assert.ok(pickIdea(null, null, () => 0.999));
});
