import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRemote, docsToState, localDocs, markPushed, maxSyncedAt, normTime, planPush, pullSince } from '../app/js/sync-core.js';

const T1 = '2026-10-01T01:00:00.000Z';
const T2 = '2026-10-01T02:00:00.000Z';
const T3 = '2026-10-01T03:00:00.000Z';
const entry = (text, t) => ({ items: [text, '', ''], tags: [[], [], []], updatedAt: t });

test('normTime：伺服器與瀏覽器的時間格式統一', () => {
  assert.equal(normTime('2026-10-01T02:00:00+00:00'), T2);
  assert.equal(normTime('2026-10-01T10:00:00+08:00'), T2);
  assert.equal(normTime(''), null);
  assert.equal(normTime('abc'), null);
});

test('localDocs：日記、願景板、標籤各成一份文件', () => {
  const docs = localDocs({
    entries: { '2026-10-01': entry('a', T1) },
    boards: [{ id: 'b1', updatedAt: T2, items: [] }],
    tags: ['工作'],
    tagsUpdatedAt: T3,
  });
  assert.deepEqual([...docs.keys()].sort(), ['board:b1', 'entry:2026-10-01', 'tags:list']);
  assert.equal(docs.get('tags:list').updatedAt, T3);
  // 沒有標籤時間時不同步標籤
  assert.equal(localDocs({ tags: ['工作'] }).size, 0);
});

test('planPush：上傳新增與修改的內容，略過已同步的', () => {
  const docs = localDocs({ entries: { '2026-10-01': entry('a', T1), '2026-10-02': entry('b', T2) } });
  const rows = planPush(docs, { 'entry:2026-10-01': T1 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, '2026-10-02');
  assert.equal(rows[0].deleted, false);
  assert.equal(rows[0].updated_at, T2);
});

test('planPush：本機刪除的內容上傳刪除紀錄，已刪除的不重複上傳', () => {
  const now = new Date(T3);
  const rows = planPush(new Map(), { 'entry:2026-09-30': T1, 'board:b1': T1, 'entry:2026-09-29': `del:${T1}` }, now);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.key, r.deleted, r.updated_at]).sort(),
    [
      ['board', 'b1', true, T3],
      ['entry', '2026-09-30', true, T3],
    ],
  );
});

test('markPushed：記錄伺服器接受的版本', () => {
  const pushed = markPushed({}, [
    { kind: 'entry', key: '2026-10-01', deleted: false, updated_at: '2026-10-01T01:00:00+00:00' },
    { kind: 'board', key: 'b1', deleted: true, updated_at: T2 },
  ]);
  assert.deepEqual(pushed, { 'entry:2026-10-01': T1, 'board:b1': `del:${T2}` });
  // 記錄後就不會再上傳
  const docs = localDocs({ entries: { '2026-10-01': entry('a', T1) } });
  assert.equal(planPush(docs, pushed).length, 0);
});

test('applyRemote：雲端較新的覆蓋本機，本機較新的保留', () => {
  const local = localDocs({ entries: { '2026-10-01': entry('本機舊', T1), '2026-10-02': entry('本機新', T3) } });
  const rows = [
    { kind: 'entry', key: '2026-10-01', data: entry('雲端新', T2), deleted: false, updated_at: T2 },
    { kind: 'entry', key: '2026-10-02', data: entry('雲端舊', T2), deleted: false, updated_at: T2 },
    { kind: 'entry', key: '2026-10-03', data: entry('只有雲端', T1), deleted: false, updated_at: T1 },
  ];
  const r = applyRemote(local, {}, rows);
  const { entries } = docsToState(r.local);
  assert.equal(entries['2026-10-01'].items[0], '雲端新');
  assert.equal(entries['2026-10-02'].items[0], '本機新');
  assert.equal(entries['2026-10-03'].items[0], '只有雲端');
  assert.deepEqual([...r.changed], ['entry']);
  // 本機較新的那天仍會上傳
  assert.deepEqual(
    planPush(r.local, r.pushed).map((x) => x.key),
    ['2026-10-02'],
  );
});

test('applyRemote：雲端刪除較新時刪除本機，並不再上傳', () => {
  const local = localDocs({ entries: { '2026-10-01': entry('a', T1) }, boards: [{ id: 'b1', updatedAt: T3, items: [] }] });
  const r = applyRemote(local, { 'entry:2026-10-01': T1 }, [
    { kind: 'entry', key: '2026-10-01', data: null, deleted: true, updated_at: T2 },
    { kind: 'board', key: 'b1', data: null, deleted: true, updated_at: T2 },
  ]);
  const state = docsToState(r.local);
  assert.equal(state.entries['2026-10-01'], undefined);
  assert.equal(state.boards.length, 1, '本機在刪除之後又修改過的願景板保留');
  assert.equal(r.pushed['entry:2026-10-01'], `del:${T2}`);
  assert.deepEqual(
    planPush(r.local, r.pushed).map((x) => x.key),
    ['b1'],
  );
});

test('applyRemote：相同版本不算變動；忽略格式不正確的資料', () => {
  const local = localDocs({ entries: { '2026-10-01': entry('a', T1) } });
  const r = applyRemote(local, {}, [
    { kind: 'entry', key: '2026-10-01', data: entry('a', T1), deleted: false, updated_at: '2026-10-01T01:00:00+00:00' },
    { kind: 'evil', key: 'x', data: {}, updated_at: T2 },
    { kind: 'entry', key: '2026-10-05', data: null, deleted: false, updated_at: T2 },
    { kind: 'entry', key: '2026-10-06', data: {}, deleted: false, updated_at: 'bad' },
  ]);
  assert.equal(r.changed.size, 0);
  assert.equal(r.pushed['entry:2026-10-01'], T1);
  assert.equal(r.local.size, 1);
});

test('applyRemote：雲端的標籤清單較新時套用', () => {
  const local = localDocs({ tags: ['工作'], tagsUpdatedAt: T1 });
  const r = applyRemote(local, {}, [{ kind: 'tags', key: 'list', data: { list: ['工作', '理財'] }, deleted: false, updated_at: T2 }]);
  const s = docsToState(r.local);
  assert.deepEqual(s.tags, ['工作', '理財']);
  assert.equal(s.tagsUpdatedAt, T2);
});

test('pullSince／maxSyncedAt：增量下載的起點', () => {
  assert.equal(pullSince(null), null);
  assert.equal(pullSince(T2), '2026-10-01T01:59:00.000Z');
  assert.equal(maxSyncedAt(null, []), null);
  assert.equal(maxSyncedAt(T1, [{ synced_at: '2026-10-01T03:00:00+00:00' }, { synced_at: T2 }]), T3);
});

test('applyRemote：重複收到上次同步的版本時，不會救回本機剛刪除或覆蓋本機剛修改的內容', () => {
  const pushed = { 'entry:2026-09-30': T1, 'entry:2026-10-01': T1 };
  const local = localDocs({ entries: { '2026-10-01': entry('本機剛改', T1) } });
  local.get('entry:2026-10-01').data.items[0] = '本機剛改';
  const rows = [
    { kind: 'entry', key: '2026-09-30', data: entry('舊', T1), deleted: false, updated_at: T1 },
    { kind: 'entry', key: '2026-10-01', data: entry('舊', T1), deleted: false, updated_at: T1 },
  ];
  const r = applyRemote(local, pushed, rows);
  assert.equal(r.changed.size, 0);
  assert.equal(r.local.has('entry:2026-09-30'), false);
  assert.deepEqual(planPush(r.local, r.pushed, new Date(T3)).map((x) => [x.key, x.deleted]), [['2026-09-30', true]]);
});
