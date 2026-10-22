import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, installNudge } from '../app/js/install-core.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  iphoneLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0',
  iphoneIG: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  androidFB: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0]',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

test('判斷裝置與瀏覽器', () => {
  assert.equal(detectPlatform(UA.iphoneSafari), 'ios-safari');
  assert.equal(detectPlatform(UA.iphoneChrome), 'ios-other');
  assert.equal(detectPlatform(UA.iphoneLine), 'inapp');
  assert.equal(detectPlatform(UA.iphoneIG), 'inapp');
  assert.equal(detectPlatform(UA.androidChrome), 'android');
  assert.equal(detectPlatform(UA.androidFB), 'inapp');
  assert.equal(detectPlatform(UA.ipadOS, 5), 'ios-safari', 'iPadOS 會假裝是 Mac');
  assert.equal(detectPlatform(UA.mac, 0), 'desktop');
});

test('什麼時候提醒加到主畫面', () => {
  const base = { platform: 'ios-safari', standalone: false, recordedDays: 1, today: '2026-10-22' };
  // 第一天寫完：完整步驟
  assert.equal(installNudge({ ...base, firstDayDone: true }), 'sheet');
  // 已經從主畫面打開、說過加好了、或是電腦：都不提醒
  assert.equal(installNudge({ ...base, firstDayDone: true, standalone: true }), null);
  assert.equal(installNudge({ ...base, firstDayDone: true, install: { done: true } }), null);
  assert.equal(installNudge({ ...base, firstDayDone: true, platform: 'desktop' }), null);
  // 看過說明之後：小提醒的間隔 1、2、4 天
  const shown = (day, shows) => ({ shownDay: day, shows });
  assert.equal(installNudge({ ...base, install: shown('2026-10-22', 1) }), null, '同一天不重複');
  assert.equal(installNudge({ ...base, install: shown('2026-10-21', 1) }), 'banner');
  assert.equal(installNudge({ ...base, install: shown('2026-10-21', 2) }), null, '第二次小提醒後要隔 2 天');
  assert.equal(installNudge({ ...base, install: shown('2026-10-20', 2) }), 'banner');
  assert.equal(installNudge({ ...base, install: shown('2026-10-19', 3) }), null, '再下一次要隔 4 天');
  assert.equal(installNudge({ ...base, install: shown('2026-10-18', 3) }), 'banner');
  assert.equal(installNudge({ ...base, install: shown('2026-01-01', 4) }), null, '說明＋3 次小提醒後不再出現');
  // 功能上線前就在寫的人：直接給小提醒
  assert.equal(installNudge({ ...base, recordedDays: 12 }), 'banner');
  // 還沒寫過：不提醒
  assert.equal(installNudge({ ...base, recordedDays: 0 }), null);
  // Android 已經裝了卻在瀏覽器打開：提醒從主畫面打開
  assert.equal(installNudge({ ...base, platform: 'android', installedApp: true }), 'open-app');
  assert.equal(installNudge({ ...base, platform: 'android', installedApp: true, install: shown('2026-10-22', 1) }), null);
});
