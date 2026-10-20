// Google Analytics 4：只記錄匿名的使用情形（打開、切換分頁、開始寫、分享、登入），
// 絕不傳送任何日記內容。使用者可以在設定頁關閉。

import { GA_HOST, GA_MEASUREMENT_ID } from './config.js';

const DEBUG_KEY = 'success-journal.ga-debug';
const TITLES = { today: '今日', dreams: '願景板', calendar: '回顧', data: '設定' };
let loaded = false;

const disableKey = () => `ga-disable-${GA_MEASUREMENT_ID}`;

function debugMode() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** 是否在這個網址啟用（正式網址，或測試時開了除錯） */
export function analyticsAvailable() {
  return Boolean(GA_MEASUREMENT_ID) && (location.hostname === GA_HOST || debugMode());
}

/** 載入 GA。allowed = 使用者沒有在設定頁關閉 */
export function initAnalytics(allowed) {
  if (!analyticsAvailable()) return false;
  window[disableKey()] = !allowed;
  if (!allowed || loaded) return loaded;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false, // 分頁由 App 自己記錄
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(debugMode() ? { debug_mode: true } : {}),
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  return true;
}

/** 設定頁的開關 */
export function setAnalyticsAllowed(allowed) {
  if (!analyticsAvailable()) return;
  window[disableKey()] = !allowed;
  if (allowed) initAnalytics(true);
}

export function track(name, params = {}) {
  if (!loaded || window[disableKey()]) return;
  window.gtag('event', name, params);
}

/** 分頁瀏覽。第一次要用剛打開時的完整網址（含 UTM），GA 才知道是從哪裡來的 */
export function trackView(view, href) {
  const url = href || `${location.origin}${location.pathname}?view=${encodeURIComponent(view)}`;
  track('page_view', { page_title: `成功日記・${TITLES[view] || view}`, page_location: url });
}
