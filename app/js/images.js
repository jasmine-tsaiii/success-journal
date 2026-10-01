// 願景板照片：壓縮後存在此裝置的 IndexedDB，不會上傳。

const DB_NAME = 'success-journal';
const STORE = 'images';
const MAX_SIDE = 1600;

let dbPromise;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result !== undefined ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('儲存失敗'));
  });
}

export const putImage = (record) => tx('readwrite', (s) => s.put(record));
export const getImage = (id) => tx('readonly', (s) => s.get(id));
export const deleteImage = (id) => tx('readwrite', (s) => s.delete(id));
export const listImageIds = () => tx('readonly', (s) => s.getAllKeys());

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法讀取這張圖片'));
    img.src = src;
  });
}

/** 將使用者選的照片縮小並轉成 JPEG，回傳 { blob, width, height } */
export async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('無法處理這張圖片');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- 顯示用的 object URL 快取 ---------- */

const urlCache = new Map();

export async function imageUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await getImage(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export function forgetImageUrl(id) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
}

/* ---------- 備份用的 data URL 轉換 ---------- */

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export { loadImageElement };
