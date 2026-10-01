// 雲端同步流程：登入後自動在背景同步，先下載雲端的新內容，再上傳本機的變動與照片。

import * as cloud from './cloud.js';
import { applyRemote, docsToState, localDocs, markPushed, maxSyncedAt, planPush, pullSince } from './sync-core.js';
import { usedImageIds } from './board-core.js';
import { getImage, loadImageElement, putImage } from './images.js';

const META_KEY = 'success-journal.sync.v1';
const DEBOUNCE_MS = 3000;

function loadMeta(userId) {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (m && m.userId === userId) return m;
  } catch {
    /* 忽略 */
  }
  return { userId, cursor: null, pushed: {}, photos: {}, tagsJson: null, tagsUpdatedAt: null, lastSyncAt: null };
}

function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* 忽略 */
  }
}

async function blobSize(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * app 提供存取本機資料的方法：
 * getEntries/setEntries、getBoards/setBoards、getTags/setTags、
 * beforeSync()（先存下正在輸入的內容）、onStatus(status)
 */
export function initSync(app) {
  let running = null;
  let again = false;
  let timer = null;
  let applying = false;
  let status = { state: 'idle', lastSyncAt: null, error: null };

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    app.onStatus(status);
  };

  async function syncPhotos(meta, boards) {
    for (const id of usedImageIds(boards)) {
      const rec = await getImage(id).catch(() => null);
      if (rec && !meta.photos[id]) {
        await cloud.uploadPhoto(id, rec.blob);
        meta.photos[id] = true;
        saveMeta(meta);
      } else if (!rec) {
        const blob = await cloud.downloadPhoto(id);
        if (!blob) continue;
        const size = await blobSize(blob).catch(() => ({ width: 0, height: 0 }));
        applying = true;
        try {
          await putImage({ id, blob, ...size });
        } finally {
          applying = false;
        }
        meta.photos[id] = true;
        saveMeta(meta);
        app.onPhotosArrived?.();
      }
    }
  }

  async function run() {
    const session = cloud.getSession();
    if (!session) return;
    app.beforeSync();
    const meta = loadMeta(session.user.id);
    setStatus({ state: 'syncing', error: null });

    // 標籤清單沒有時間戳記：和上次同步時不同就視為剛修改
    // 第一次同步時以雲端為準（之後再合併本機的標籤），避免新手機的預設標籤蓋掉雲端的自訂標籤
    const firstSync = meta.tagsJson === null;
    const localTags = app.getTags();
    const tagsJson = JSON.stringify(localTags);
    if (tagsJson !== meta.tagsJson) {
      meta.tagsJson = tagsJson;
      meta.tagsUpdatedAt = firstSync ? new Date(0).toISOString() : new Date().toISOString();
    }

    const collect = () => localDocs({ entries: app.getEntries(), boards: app.getBoards(), tags: app.getTags(), tagsUpdatedAt: meta.tagsUpdatedAt });

    const pullAndApply = async (since) => {
      const rows = await cloud.pullDocs(since);
      const result = applyRemote(collect(), meta.pushed, rows);
      meta.pushed = result.pushed;
      meta.cursor = maxSyncedAt(meta.cursor, rows);
      if (result.changed.size) {
        const next = docsToState(result.local);
        applying = true;
        try {
          if (result.changed.has('entry')) app.setEntries(next.entries);
          if (result.changed.has('board')) app.setBoards(next.boards);
          if (result.changed.has('tags') && next.tags) {
            const merged = firstSync ? [...new Set([...next.tags, ...localTags])] : next.tags;
            app.setTags(merged);
            meta.tagsJson = JSON.stringify(merged);
            meta.tagsUpdatedAt = merged.length === next.tags.length ? next.tagsUpdatedAt : new Date().toISOString();
          }
        } finally {
          applying = false;
        }
      }
      saveMeta(meta);
      return result.changed;
    };

    const changed = await pullAndApply(pullSince(meta.cursor));
    // 雲端還沒有標籤清單：以這台裝置的清單為準
    if (firstSync && !changed.has('tags')) {
      meta.tagsUpdatedAt = new Date().toISOString();
      saveMeta(meta);
    }
    const rows = planPush(collect(), meta.pushed);
    if (rows.length) {
      const accepted = await cloud.pushDocs(rows);
      meta.pushed = markPushed(meta.pushed, accepted);
      saveMeta(meta);
      // 有些沒被接受：表示雲端有更新的版本，整份重新下載一次
      if (accepted.length < rows.length) {
        for (const kind of await pullAndApply(null)) changed.add(kind);
      }
    }
    await syncPhotos(meta, app.getBoards());
    meta.lastSyncAt = new Date().toISOString();
    saveMeta(meta);
    setStatus({ state: 'ok', lastSyncAt: meta.lastSyncAt, error: null, changed });
  }

  /** 立即同步；同步中又有變動時，結束後再跑一次 */
  async function syncNow() {
    clearTimeout(timer);
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await run();
        } while (again);
      } catch (err) {
        if (!cloud.getSession()) setStatus({ state: 'signed-out', error: err.message });
        else setStatus({ state: 'error', error: err.message || '同步失敗' });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  function schedule() {
    if (applying || !cloud.getSession()) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, DEBOUNCE_MS);
  }

  window.addEventListener('sj:changed', schedule);
  window.addEventListener('online', () => cloud.getSession() && syncNow());
  let lastFocusSync = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !cloud.getSession()) return;
    if (Date.now() - lastFocusSync < 60000) return;
    lastFocusSync = Date.now();
    syncNow();
  });

  const session = cloud.getSession();
  if (session) status.lastSyncAt = loadMeta(session.user.id).lastSyncAt;

  return {
    syncNow,
    get status() {
      return status;
    },
    /** 登出：清掉同步紀錄，本機日記保留 */
    reset() {
      clearTimeout(timer);
      try {
        localStorage.removeItem(META_KEY);
      } catch {
        /* 忽略 */
      }
      status = { state: 'idle', lastSyncAt: null, error: null };
    },
  };
}
