import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPeriod, decodeCode, generateKeyPair, issueCode, verifyCode } from '../app/js/license.js';

test('解鎖碼：簽發與驗證、到期、竄改、別人的金鑰', async () => {
  const { privateJwk, publicJwk } = await generateKeyPair();
  const keys = [publicJwk];

  const life = await issueCode(privateJwk, { plan: 'l', start: '2026-10-01' });
  assert.match(life.code, /^SJ-[\w-]+\.[\w-]+$/);
  assert.deepEqual(await verifyCode(life.code, { today: '2099-01-01', keys }), { ok: true, plan: 'l', expires: null });

  const year = await issueCode(privateJwk, { plan: 'y', start: '2026-10-01' });
  assert.equal(year.payload.e, '2027-10-04');
  assert.equal((await verifyCode(year.code, { today: '2027-10-04', keys })).ok, true);
  const expired = await verifyCode(year.code, { today: '2027-10-05', keys });
  assert.equal(expired.ok, false);
  assert.equal(expired.expired, true);

  // 竄改內容（把月訂改成買斷）→ 簽章不符
  const month = await issueCode(privateJwk, { plan: 'm', start: '2026-10-01' });
  const [, sig] = month.code.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ ...month.payload, p: 'l', e: '' })).toString('base64url');
  assert.equal((await verifyCode(`SJ-${forgedBody}.${sig}`, { today: '2026-10-02', keys })).ok, false);

  // 別人自己產生的金鑰簽的碼 → 無效
  const other = await generateKeyPair();
  const fake = await issueCode(other.privateJwk, { plan: 'l', start: '2026-10-01' });
  assert.equal((await verifyCode(fake.code, { today: '2026-10-01', keys })).ok, false);

  // 格式錯誤、沒有公鑰
  assert.equal(decodeCode('hello'), null);
  assert.equal((await verifyCode('SJ-abc', { keys })).ok, false);
  assert.equal((await verifyCode(life.code, { keys: [] })).ok, false);
  // 複製時夾帶空白或換行也能用
  assert.equal((await verifyCode(` ${life.code.slice(0, 20)}\n${life.code.slice(20)} `, { keys })).ok, true);
});

test('方案期間：月訂一個月、年訂一年，各加 3 天緩衝；買斷不到期', () => {
  assert.equal(addPeriod('2026-10-01', 'm'), '2026-11-04');
  assert.equal(addPeriod('2026-01-31', 'm'), '2026-03-06');
  assert.equal(addPeriod('2026-10-01', 'y'), '2027-10-04');
  assert.equal(addPeriod('2026-10-01', 'l'), '');
});
