// 本機儲存：資料寫入此裝置瀏覽器的 localStorage。
// 登入雲端同步時，sync.js 會在收到 sj:changed 事件後把變動上傳。

export const notifyChanged = () => window.dispatchEvent(new Event('sj:changed'));

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
  notifyChanged();
}

const BOARDS_KEY = 'success-journal.boards.v1';
const TAGS_KEY = 'success-journal.tags.v1';
const SETTINGS_KEY = 'success-journal.settings.v1';

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : fallback;
  } catch {
    return fallback;
  }
}

/** 願景板版面（照片本身存在 IndexedDB，見 images.js） */
export function loadBoards() {
  const data = loadJson(BOARDS_KEY, []);
  return Array.isArray(data) ? data : [];
}

export function saveBoards(boards) {
  localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
  notifyChanged();
}

/** 標籤清單（null 表示尚未設定，使用預設標籤） */
export function loadTagList(defaults) {
  const data = loadJson(TAGS_KEY, null);
  return Array.isArray(data) ? data.filter((t) => typeof t === 'string') : [...defaults];
}

export function saveTagList(tags) {
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
    notifyChanged();
  } catch {
    /* 忽略 */
  }
}

export const DEFAULT_SETTINGS = { showChakra: true, theme: 'auto' };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...loadJson(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 忽略 */
  }
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
