// 本機儲存：所有資料只寫入此裝置瀏覽器的 localStorage，不傳送到任何伺服器。

const KEY = 'success-journal.entries.v1';

export function isStorageAvailable() {
  try {
    const t = '__sj_test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}

export function loadEntries() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function saveEntries(entries) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** 請瀏覽器盡量不要自動清除本站資料（支援的瀏覽器才會生效） */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* 忽略 */
  }
  return false;
}
