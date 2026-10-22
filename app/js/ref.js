// 分享連結的 UTM 與「從哪裡來」：分享出去的連結帶上 UTM，朋友點進來時記下第一次的來源。

export const SITE_ORIGIN = 'https://success.jas-soul.com/';
export const UTM_SOURCE = 'success_journal';
export const UTM_CAMPAIGN = 'friend_referral';
const KEYS = ['source', 'medium', 'campaign', 'content'];

/**
 * 分享用的連結。medium：thanks_card（感謝卡）、invite_card（邀請卡）、day_card（今天的小成功）
 * openExternalBrowser=1：朋友在 LINE 裡點開時，LINE 會直接用手機的瀏覽器打開（不是 LINE 內建的），
 * 這樣才能加到主畫面、日記也不會只留在 LINE 裡。其他 App 會忽略這個參數。
 */
export function shareLink(medium, content = '') {
  const q = new URLSearchParams({ utm_source: UTM_SOURCE, utm_medium: medium, utm_campaign: UTM_CAMPAIGN });
  if (content) q.set('utm_content', content);
  q.set('openExternalBrowser', '1');
  return `${SITE_ORIGIN}?${q}`;
}

/** 從網址讀出 UTM；沒有時回傳 null */
export function parseRef(search, now = new Date()) {
  const q = new URLSearchParams(search || '');
  const ref = {};
  for (const k of KEYS) {
    const v = (q.get(`utm_${k}`) || '').trim().slice(0, 60);
    if (v) ref[k] = v;
  }
  if (!ref.source && !ref.medium && !ref.campaign) return null;
  return { ...ref, at: now.toISOString() };
}

/** 網址去掉 utm_ 參數（記下來之後就不需要了，也避免使用者把它加到主畫面） */
export function stripUtm(href) {
  const url = new URL(href);
  for (const k of [...url.searchParams.keys()]) if (k.startsWith('utm_') || k === 'openExternalBrowser') url.searchParams.delete(k);
  return url.toString();
}
