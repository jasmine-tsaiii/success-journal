// 成功日記 Plus：解鎖碼。
//
// 格式：SJ-<payload>.<signature>（皆為 base64url）
// payload = { v: 1, p: 'm' | 'y' | 'l', s: 開始日, e: 到期日（買斷為空字串）, n: 亂數 }
// 以 ECDSA P-256 / SHA-256 簽章，App 離線也能驗證；沒有私鑰無法偽造。

import { PUBLIC_KEYS } from './license-keys.js';

export const PLANS = {
  m: { name: '月訂', price: 'NT$60／月' },
  y: { name: '年訂', price: 'NT$490／年' },
  l: { name: '永久買斷', price: 'NT$1,290' },
};

const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

export function b64urlEncode(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** 解析解鎖碼（不驗簽）；格式錯誤回傳 null */
export function decodeCode(code) {
  const m = /^SJ-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(code || '').trim().replace(/\s+/g, ''));
  if (!m) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(m[1])));
    if (payload.v !== 1 || !PLANS[payload.p]) return null;
    return { payload, data: new TextEncoder().encode(m[1]), sig: b64urlDecode(m[2]) };
  } catch {
    return null;
  }
}

/** 驗證解鎖碼。回傳 { ok, plan, expires, reason } */
export async function verifyCode(code, { today, keys = PUBLIC_KEYS } = {}) {
  const decoded = decodeCode(code);
  if (!decoded) return { ok: false, reason: '解鎖碼格式不正確，請確認有完整複製。' };
  if (!keys.length || !globalThis.crypto?.subtle) return { ok: false, reason: '目前還無法驗證解鎖碼，請稍後再試。' };
  let valid = false;
  for (const jwk of keys) {
    try {
      const key = await crypto.subtle.importKey('jwk', jwk, ALG, false, ['verify']);
      if (await crypto.subtle.verify(SIGN, key, decoded.sig, decoded.data)) {
        valid = true;
        break;
      }
    } catch {
      /* 換下一把公鑰 */
    }
  }
  if (!valid) return { ok: false, reason: '解鎖碼無效，請確認有完整複製。' };
  const { p, e } = decoded.payload;
  if (e && today && today > e) return { ok: false, expired: true, plan: p, expires: e, reason: `這組解鎖碼已在 ${e.replaceAll('-', '.')} 到期。` };
  return { ok: true, plan: p, expires: e || null };
}

/* ---------- 發碼（只在 issuer.html 使用） ---------- */

export function addPeriod(start, plan) {
  if (plan === 'l') return '';
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + (plan === 'm' ? 1 : 12), d));
  // 多給 3 天緩衝，讓續購有時間
  dt.setUTCDate(dt.getUTCDate() + 3);
  return dt.toISOString().slice(0, 10);
}

export async function generateKeyPair() {
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  for (const k of [privateJwk, publicJwk]) {
    delete k.key_ops;
    delete k.ext;
  }
  return { privateJwk, publicJwk };
}

export async function issueCode(privateJwk, { plan, start }) {
  const payload = { v: 1, p: plan, s: start, e: addPeriod(start, plan), n: b64urlEncode(crypto.getRandomValues(new Uint8Array(6))) };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('jwk', { ...privateJwk, key_ops: ['sign'] }, ALG, false, ['sign']);
  const sig = await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(body));
  return { code: `SJ-${body}.${b64urlEncode(sig)}`, payload };
}
