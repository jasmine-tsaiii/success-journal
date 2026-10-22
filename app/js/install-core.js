// 加到主畫面的引導：判斷裝置與瀏覽器，以及什麼時候該提醒（純邏輯，方便測試）。

/**
 * 回傳：
 *  'inapp'      LINE、Instagram、Facebook 等 App 內建的瀏覽器（這裡沒辦法加到主畫面，要先換瀏覽器）
 *  'ios-safari' iPhone／iPad 的 Safari
 *  'ios-other'  iPhone 上的 Chrome、Edge 等（iOS 16.4 起也能從分享選單加入主畫面）
 *  'android'    Android
 *  'desktop'    電腦（不提醒）
 */
export function detectPlatform(ua = '', maxTouchPoints = 0) {
  if (/\bLine\/|Instagram|FBAN|FBAV|FB_IAB|Messenger|MicroMessenger|Threads|KAKAOTALK/i.test(ua)) return 'inapp';
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export const BANNER_GAPS = [1, 2, 4]; // 每次提醒之間至少間隔幾天；完整說明＋3 次小提醒之後不再出現

const dayNum = (key) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);

/**
 * 這次要不要提醒？
 * install = { shownDay: 上次提醒的日期, shows: 提醒過幾次, done: 已加到主畫面 }（存在設定裡）
 * 回傳 'sheet'（第一天寫完：完整的步驟說明）、'banner'（之後打開：今日頁上方一行小提醒）、
 * 'open-app'（Android 已經裝了卻還在瀏覽器打開）或 null
 */
export function installNudge({ platform, standalone, installedApp = false, install = {}, recordedDays = 0, today, firstDayDone = false }) {
  if (standalone || install.done || platform === 'desktop') return null;
  const shows = install.shows || 0;
  if (shows > BANNER_GAPS.length) return null;
  if (install.shownDay === today) return null;
  if (installedApp) return 'open-app';
  // 在 LINE、IG 等 App 裡打開：一進來就引導換到瀏覽器，免得日記寫在 App 裡面
  if (platform === 'inapp' && !install.shownDay) return 'sheet';
  if (firstDayDone && !install.shownDay) return 'sheet';
  if (recordedDays < 1) return null;
  if (!install.shownDay) return 'banner'; // 已經寫過、但還沒看過說明的人（例如功能上線前就在用）
  const gap = BANNER_GAPS[Math.min(Math.max(shows - 1, 0), BANNER_GAPS.length - 1)];
  return dayNum(today) - dayNum(install.shownDay) >= gap ? 'banner' : null;
}

/**
 * 從 App 內建瀏覽器跳到手機瀏覽器的網址（保留原本的 UTM）
 *  LINE：加上 openExternalBrowser=1，LINE 會用預設瀏覽器打開
 *  Android 的 IG、FB 等：intent:// 交給系統選擇瀏覽器
 *  iPhone 的 IG、FB 等：x-safari-https://（iOS 17 起支援）直接用 Safari 打開
 */
export function externalBrowserUrl(href, ua = '') {
  const url = new URL(href);
  if (/\bLine\//i.test(ua)) {
    url.searchParams.set('openExternalBrowser', '1');
    return { url: url.toString(), label: '用瀏覽器打開' };
  }
  if (/Android/.test(ua)) {
    const fallback = encodeURIComponent(url.toString());
    return { url: `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;S.browser_fallback_url=${fallback};end`, label: '用瀏覽器打開' };
  }
  return { url: `x-safari-${url.toString()}`, label: '用 Safari 打開' };
}
