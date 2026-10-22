import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, OPEN_URL, reminderMessage } from '../supabase/functions/sj-reminders/messages.js';

test('提醒文字：每天輪替，連續 3 天以上改成鼓勵連續', () => {
  assert.equal(MESSAGES.length, 7);
  const seen = new Set(Array.from({ length: 7 }, (_, i) => reminderMessage({ day_index: 100 + i }).body));
  assert.equal(seen.size, 7, '一週內每天不同');
  assert.equal(reminderMessage({ day_index: 3 }).body, reminderMessage({ day_index: 10 }).body);
  assert.equal(reminderMessage({ streak: 2, day_index: 0 }).body, MESSAGES[0]);
  assert.equal(reminderMessage({ streak: 6 }).body, '已經連續 6 天了 ✨ 今天也記一下，讓好習慣接下去。');
  const m = reminderMessage();
  assert.equal(m.title, '成功日記');
  assert.equal(m.url, OPEN_URL);
  assert.match(OPEN_URL, /utm_medium=push/);
});
