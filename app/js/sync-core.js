// 雲端同步的純邏輯：把本機資料拆成一筆筆「文件」，比較時間決定上傳或套用雲端版本（較新的為準）。
//
// 文件 id 為「種類:鍵」：entry:2026-10-01、board:b123、tags:list
// pushed 記錄每份文件上次與雲端一致時的版本（updatedAt，刪除則為 'del:時間'），
// 用來找出本機新增、修改與刪除的內容，不需要在每個存檔的地方另外記錄。

export const docId = (kind, key) => `${kind}:${key}`;

/** 統一時間格式（伺服器回傳 +00:00、瀏覽器為 Z），無效時回傳 null */
export function normTime(t) {
  const ms = Date.parse(t || '');
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const later = (a, b) => Date.parse(a) > Date.parse(b);

/** 本機資料 → Map<id, { kind, key, data, updatedAt }> */
export function localDocs({ entries = {}, boards = [], tags = null, tagsUpdatedAt = null }) {
  const map = new Map();
  const epoch = new Date(0).toISOString();
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== 'object') continue;
    map.set(docId('entry', key), { kind: 'entry', key, data: entry, updatedAt: normTime(entry.updatedAt) || epoch });
  }
  for (const board of boards) {
    if (!board || !board.id) continue;
    map.set(docId('board', board.id), { kind: 'board', key: board.id, data: board, updatedAt: normTime(board.updatedAt) || epoch });
  }
  if (Array.isArray(tags) && tagsUpdatedAt) {
    map.set(docId('tags', 'list'), { kind: 'tags', key: 'list', data: { list: tags }, updatedAt: normTime(tagsUpdatedAt) });
  }
  return map;
}

/** 要上傳的內容：本機版本和上次同步不同的文件，以及本機已刪除的文件 */
export function planPush(local, pushed, now = new Date()) {
  const rows = [];
  for (const [id, doc] of local) {
    if (pushed[id] !== doc.updatedAt) {
      rows.push({ kind: doc.kind, key: doc.key, data: doc.data, deleted: false, updated_at: doc.updatedAt });
    }
  }
  const nowIso = now.toISOString();
  for (const [id, ver] of Object.entries(pushed)) {
    if (local.has(id) || String(ver).startsWith('del:')) continue;
    const sep = id.indexOf(':');
    rows.push({ kind: id.slice(0, sep), key: id.slice(sep + 1), data: null, deleted: true, updated_at: nowIso });
  }
  return rows;
}

/** 上傳成功（伺服器接受）的文件，記錄為已同步 */
export function markPushed(pushed, acceptedRows) {
  const next = { ...pushed };
  for (const r of acceptedRows) {
    const t = normTime(r.updated_at);
    next[docId(r.kind, r.key)] = r.deleted ? `del:${t}` : t;
  }
  return next;
}

/**
 * 套用雲端的文件。本機較新的保留（之後會上傳），雲端較新的覆蓋或刪除本機。
 * 回傳 { local, pushed, changed: Set<kind> }
 */
export function applyRemote(local, pushed, rows) {
  const next = new Map(local);
  const nextPushed = { ...pushed };
  const changed = new Set();
  for (const r of rows) {
    if (!r || !['entry', 'board', 'tags'].includes(r.kind) || typeof r.key !== 'string') continue;
    const t = normTime(r.updated_at);
    if (!t) continue;
    const id = docId(r.kind, r.key);
    const mine = next.get(id);
    if (mine && later(mine.updatedAt, t)) continue;
    // 本機剛刪除、雲端還是上次同步的那一版（重疊下載時會再收到）：保留刪除，稍後上傳
    if (!mine && !r.deleted && nextPushed[id] === t) continue;
    if (r.deleted) {
      if (mine) {
        next.delete(id);
        changed.add(r.kind);
      }
      nextPushed[id] = `del:${t}`;
      continue;
    }
    if (!r.data || typeof r.data !== 'object') continue;
    if (!mine || mine.updatedAt !== t) {
      next.set(id, { kind: r.kind, key: r.key, data: { ...r.data, ...(r.kind === 'tags' ? {} : { updatedAt: t }) }, updatedAt: t });
      changed.add(r.kind);
    }
    nextPushed[id] = t;
  }
  return { local: next, pushed: nextPushed, changed };
}

/** Map → 本機資料格式 */
export function docsToState(local) {
  const entries = {};
  const boards = [];
  let tags = null;
  let tagsUpdatedAt = null;
  for (const doc of local.values()) {
    if (doc.kind === 'entry') entries[doc.key] = doc.data;
    else if (doc.kind === 'board') boards.push(doc.data);
    else if (doc.kind === 'tags' && Array.isArray(doc.data.list)) {
      tags = doc.data.list.filter((t) => typeof t === 'string');
      tagsUpdatedAt = doc.updatedAt;
    }
  }
  return { entries, boards, tags, tagsUpdatedAt };
}

/** 讓下一次「增量下載」稍微往前重疊，避免同時寫入時漏掉資料（重複套用不會有影響） */
export function pullSince(cursor, overlapMs = 60000) {
  const ms = Date.parse(cursor || '');
  return Number.isFinite(ms) ? new Date(ms - overlapMs).toISOString() : null;
}

/** 下載回來的資料中最新的同步時間 */
export function maxSyncedAt(cursor, rows) {
  let best = cursor || null;
  for (const r of rows) {
    const t = normTime(r.synced_at);
    if (t && (!best || later(t, best))) best = t;
  }
  return best;
}
