// 與 Supabase 溝通：Google 登入、日記文件的上傳下載、照片存放。
// 只用瀏覽器內建的 fetch，不載入額外套件。

import { GOOGLE_CLIENT_ID, SUPABASE_KEY, SUPABASE_URL } from './config.js';

const AUTH_KEY = 'success-journal.auth.v1';
const TABLE = 'journal_docs';
const BUCKET = 'photos';

export const cloudConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY && GOOGLE_CLIENT_ID);

export class CloudError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/* ---------- 登入狀態 ---------- */

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    return s && s.access_token && s.refresh_token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

function saveSession(data) {
  const meta = data.user?.user_metadata || {};
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: { id: data.user.id, email: data.user.email || meta.email || '', name: meta.full_name || meta.name || '' },
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* 忽略 */
  }
}

async function authRequest(grant, body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CloudError('目前沒有網路，請稍後再試', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new CloudError(data.msg || data.error_description || data.message || '登入失敗', res.status);
  }
  return saveSession(data);
}

export const signInWithGoogleToken = (idToken, nonce) => authRequest('id_token', { provider: 'google', id_token: idToken, nonce });

let refreshing = null;
async function refresh(session) {
  if (!refreshing) {
    refreshing = authRequest('refresh_token', { refresh_token: session.refresh_token }).finally(() => {
      refreshing = null;
    });
  }
  try {
    return await refreshing;
  } catch (err) {
    // 登入已失效（例如在別處刪除了帳號）：清除登入狀態，本機資料不受影響
    if (err.status >= 400 && err.status < 500) clearSession();
    throw err;
  }
}

async function freshSession() {
  let s = getSession();
  if (!s) throw new CloudError('尚未登入', 401);
  if (s.expires_at * 1000 - Date.now() < 60000) s = await refresh(s);
  return s;
}

/** 帶著登入憑證呼叫 Supabase；憑證過期時自動更新一次 */
async function api(path, { method = 'GET', headers = {}, body } = {}) {
  let s = await freshSession();
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}${path}`, {
        method,
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, ...headers },
        body,
      });
    } catch {
      throw new CloudError('目前沒有網路', 0);
    }
    if (res.status === 401 && attempt === 0) {
      s = await refresh(s);
      continue;
    }
    return res;
  }
  throw new CloudError('登入已過期，請重新登入', 401);
}

async function expectOk(res, fallback) {
  if (res.ok) return res;
  const data = await res.json().catch(() => ({}));
  throw new CloudError(data.message || data.msg || fallback, res.status);
}

export async function signOut() {
  const s = getSession();
  clearSession();
  if (!s) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` },
    });
  } catch {
    /* 離線時登出：本機已清除登入狀態即可 */
  }
}

/* ---------- 日記文件 ---------- */

const PAGE = 500;

/** 下載 since 之後有變動的文件（since 為 null 時下載全部） */
export async function pullDocs(since) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({ select: 'kind,key,data,deleted,updated_at,synced_at', order: 'synced_at.asc,kind.asc,key.asc', limit: String(PAGE), offset: String(offset) });
    if (since) q.set('synced_at', `gt.${since}`);
    const res = await expectOk(await api(`/rest/v1/${TABLE}?${q}`), '下載雲端資料失敗');
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** 上傳文件；回傳伺服器接受的列（雲端已有較新版本的不會被覆蓋，也不會出現在回傳中） */
export async function pushDocs(rows) {
  const userId = getSession()?.user.id;
  const accepted = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({ user_id: userId, ...r }));
    const res = await expectOk(
      await api(`/rest/v1/${TABLE}?on_conflict=user_id,kind,key&select=kind,key,deleted,updated_at`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(chunk),
      }),
      '上傳到雲端失敗',
    );
    accepted.push(...(await res.json()));
  }
  return accepted;
}

/* ---------- 照片 ---------- */

const photoPath = (id) => `${getSession()?.user.id}/${encodeURIComponent(id)}`;

export async function uploadPhoto(id, blob) {
  await expectOk(
    await api(`/storage/v1/object/${BUCKET}/${photoPath(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' },
      body: blob,
    }),
    '照片上傳失敗',
  );
}

/** 找不到時回傳 null */
export async function downloadPhoto(id) {
  const res = await api(`/storage/v1/object/authenticated/${BUCKET}/${photoPath(id)}`);
  if (res.status === 400 || res.status === 404) return null;
  await expectOk(res, '照片下載失敗');
  return res.blob();
}

/* ---------- 刪除帳號 ---------- */

/** 刪除雲端上的照片、日記與帳號本身（這台裝置上的資料不受影響） */
export async function deleteAccount() {
  const userId = getSession()?.user.id;
  for (;;) {
    const res = await expectOk(
      await api(`/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: userId, limit: 100, offset: 0 }),
      }),
      '刪除照片失敗',
    );
    const files = (await res.json()).filter((f) => f.name);
    if (!files.length) break;
    await expectOk(
      await api(`/storage/v1/object/${BUCKET}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files.map((f) => `${userId}/${f.name}`) }),
      }),
      '刪除照片失敗',
    );
  }
  await expectOk(await api('/rest/v1/rpc/delete_my_account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), '刪除帳號失敗');
  clearSession();
}

/* ---------- Google 登入按鈕 ---------- */

let gsiPromise = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gsiPromise = null;
        s.remove();
        reject(new CloudError('無法連線到 Google，請確認網路後再試', 0));
      };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 在 el 裡放 Google 登入按鈕。按下並選好帳號後，以 Google 的憑證登入 Supabase，
 * 授權畫面顯示的是我們自己的網址與名稱，而不是 Supabase 的網址。
 */
export async function renderGoogleButton(el, { onSignedIn, onError }) {
  await loadGsi();
  const raw = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  const nonce = await sha256Hex(raw);
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce,
    itp_support: true,
    callback: async ({ credential }) => {
      try {
        onSignedIn(await signInWithGoogleToken(credential, raw));
      } catch (err) {
        onError(err);
      }
    },
  });
  el.textContent = '';
  // 按鈕本身透明疊在我們自己畫的按鈕上，尺寸盡量蓋滿
  window.google.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'rectangular',
    text: 'signin_with',
    locale: 'zh-TW',
    width: Math.min(400, Math.max(200, el.clientWidth || 320)),
  });
}
