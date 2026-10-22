// 每日提醒：向瀏覽器要通知權限、訂閱推播，並把「幾點提醒、時區」存到 Supabase。
// 真正的發送由 Supabase 的排程程式負責（supabase/functions/sj-reminders）。

import * as cloud from './cloud.js';
import { VAPID_PUBLIC_KEY } from './config.js';

export const REMINDER_TIMES = [
  { time: '17:00', label: '傍晚' },
  { time: '21:00', label: '晚上' },
  { time: '23:00', label: '睡前' },
];
export const DEFAULT_TIME = '21:00';

/** 'ok'：可以開提醒；'ios-needs-home'：iPhone 要先加到主畫面；'unsupported'：這個瀏覽器不支援 */
export function pushSupport({ platform, standalone }) {
  const ios = platform.startsWith('ios');
  if (ios && !standalone) return 'ios-needs-home';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

export const permission = () => ('Notification' in window ? Notification.permission : 'default');

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';
  } catch {
    return 'Asia/Taipei';
  }
};

async function registration() {
  if (!navigator.serviceWorker.controller) await navigator.serviceWorker.register('sw.js');
  return navigator.serviceWorker.ready;
}

/** 開啟（或更新時間）。會先詢問通知權限；回傳 endpoint。被拒絕時丟出 code = 'denied' 的錯誤 */
export async function enableReminder(time) {
  if (permission() !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
      const err = new Error('沒有通知權限');
      err.code = 'denied';
      throw err;
    }
  }
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  await cloud.rpc('sj_push_save', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_remind_at: time, p_tz: timeZone() });
  return json.endpoint;
}

export async function disableReminder(endpoint) {
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {
    /* 忽略 */
  }
  if (endpoint) await cloud.rpc('sj_push_delete', { p_endpoint: endpoint });
}

/** 今天寫了：這台裝置今天就不提醒（失敗也沒關係，最多多收到一次提醒） */
export function markWritten(endpoint, day) {
  if (!endpoint) return;
  cloud.rpc('sj_push_wrote', { p_endpoint: endpoint, p_day: day }).catch(() => {});
}
