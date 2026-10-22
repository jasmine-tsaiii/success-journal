import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 發送程式是給 Supabase（Deno）跑的 TypeScript，這裡把其中的文字與輪替邏輯拿出來測
const src = await readFile(new URL('../supabase/functions/sj-reminders/index.ts', import.meta.url), 'utf8');
const MESSAGES = Function(`return ${src.match(/const MESSAGES = (\[[\s\S]*?\]);/)[1]}`)();
const OPEN_URL = src.match(/const OPEN_URL = '([^']+)'/)[1];
const fn = src.match(/function reminderMessage\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)[1];
const reminderMessage = Function('MESSAGES', 'TITLE', 'OPEN_URL', `return ({ streak = 0, day_index: dayIndex = 0 } = {}) => {${fn}}`)(MESSAGES, '成功日記', OPEN_URL);

test('發送程式只有一個檔案（Supabase 後台的編輯器只要貼一個檔案）', () => {
  assert.doesNotMatch(src, /from '\.\//, '不 import 其他自己的檔案');
});

test('提醒文字：每天輪替，連續 3 天以上改成鼓勵連續', () => {
  assert.equal(MESSAGES.length, 7);
  const seen = new Set(Array.from({ length: 7 }, (_, i) => reminderMessage({ day_index: 100 + i }).body));
  assert.equal(seen.size, 7, '一週內每天不同');
  assert.equal(reminderMessage({ day_index: 3 }).body, reminderMessage({ day_index: 10 }).body);
  assert.equal(reminderMessage({ streak: 2, day_index: 0 }).body, MESSAGES[0]);
  assert.equal(reminderMessage({ streak: 6 }).body, '已經連續 6 天了 ✨ 今天也記一下，讓好習慣接下去。');
  const m = reminderMessage();
  assert.equal(m.title, '成功日記');
  assert.match(m.url, /utm_medium=push/);
});
