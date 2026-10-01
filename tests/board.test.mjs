import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKGROUNDS,
  BOARD_H,
  BOARD_W,
  LAYOUTS,
  autoLayout,
  backgroundCss,
  clampItem,
  createBoard,
  estimateMeasure,
  itemHeight,
  placeNew,
  sanitizeBoard,
  usedImageIds,
  wrapText,
} from '../app/js/board-core.js';
import { STICKERS, WORD_IDEAS } from '../app/js/stickers.js';
import { buildBackup, buildTextExport, mergeBoards, parseBackup } from '../app/js/core.js';

const photo = (id, aspect = 1.5) => ({ id, type: 'photo', imageId: `img-${id}`, aspect, frame: true, x: 0, y: 0, w: 400, rot: 0, z: 0 });
const text = (id, t = '自由') => ({ id, type: 'text', text: t, style: 'card', x: 0, y: 0, w: 400, rot: 0, z: 0 });
const sticker = (id) => ({ id, type: 'sticker', sticker: 'star', x: 0, y: 0, w: 200, rot: 0, z: 0 });

function sample(n) {
  const items = [];
  for (let i = 0; i < n; i++) items.push(i % 3 === 2 ? text(`t${i}`, '一步一步，我正在靠近夢想') : photo(`p${i}`, i % 2 ? 0.75 : 1.4));
  items.push(sticker('s1'), sticker('s2'));
  return items;
}

test('自動排版：每種版型都把物件的中心放在畫面內，且保留所有物件', () => {
  for (const { id: layout } of LAYOUTS) {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      const items = sample(n);
      const out = autoLayout(items, { layout, seed: 42 });
      assert.equal(out.length, items.length, `${layout}/${n}`);
      assert.deepEqual(new Set(out.map((it) => it.id)), new Set(items.map((it) => it.id)));
      for (const it of out) {
        assert.ok(it.x >= 0 && it.x <= BOARD_W && it.y >= 0 && it.y <= BOARD_H, `${layout}/${n} 超出畫面`);
        assert.ok(it.w > 50 && Number.isFinite(it.rot));
      }
      // 素材貼紙在最上層
      const maxMain = Math.max(...out.filter((it) => it.type !== 'sticker').map((it) => it.z));
      assert.ok(out.filter((it) => it.type === 'sticker').every((it) => it.z > maxMain));
    }
  }
});

test('自動排版：同一個 seed 結果相同，不同 seed 會換一種排法', () => {
  const items = sample(6);
  assert.deepEqual(autoLayout(items, { seed: 7 }), autoLayout(items, { seed: 7 }));
  assert.notDeepEqual(autoLayout(items, { seed: 7 }), autoLayout(items, { seed: 8 }));
});

test('整齊網格：物件之間不重疊，也不會超出上下邊界', () => {
  const out = autoLayout(sample(9), { layout: 'grid', seed: 3 }).filter((it) => it.type !== 'sticker');
  const boxes = out.map((it) => {
    const h = itemHeight(it);
    return { l: it.x - it.w / 2, r: it.x + it.w / 2, t: it.y - h / 2, b: it.y + h / 2 };
  });
  for (const b of boxes) assert.ok(b.t >= 0 && b.b <= BOARD_H + 1);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const c = boxes[j];
      const overlap = a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1;
      assert.ok(!overlap, `第 ${i} 與第 ${j} 個物件重疊`);
    }
  }
});

test('文字換行：中文逐字、英文單字不拆開、保留換行', () => {
  const measure = estimateMeasure(10); // 中文 10、英文 5.5
  assert.deepEqual(wrapText('我值得美好的一切', 40, measure), ['我值得美', '好的一切']);
  assert.deepEqual(wrapText('love and light', 50, measure), ['love and', 'light']);
  assert.deepEqual(wrapText('第一行\n第二行', 100, measure), ['第一行', '第二行']);
  assert.ok(wrapText('supercalifragilistic', 30, measure).every((l) => measure(l) <= 30));
});

test('物件操作：新增、限制範圍', () => {
  const board = createBoard();
  const a = placeNew(board, { type: 'sticker', sticker: 'star' }, () => 0.5);
  assert.equal(a.x, BOARD_W / 2);
  assert.equal(a.z, 1);
  board.items.push(a);
  assert.equal(placeNew(board, { type: 'text', text: 'x' }).z, 2);
  const c = clampItem({ x: -50, y: 99999, w: 1, rot: 370 });
  assert.deepEqual([c.x, c.y, c.w, Math.round(c.rot)], [0, BOARD_H, 90, 10]);
});

test('背景、素材與文字靈感', () => {
  assert.ok(BACKGROUNDS.length >= 5);
  for (const bg of BACKGROUNDS) assert.match(backgroundCss(bg), /linear-gradient/);
  assert.ok(STICKERS.length >= 12);
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, STICKERS.length);
  for (const s of STICKERS) assert.match(s.svg, /^<svg[^>]+viewBox="0 0 100 100"/);
  assert.ok(WORD_IDEAS.length >= 10);
});

test('願景板備份：照片、版面可來回轉換；不合法的內容會被濾掉', () => {
  const board = { ...createBoard('2027'), items: [photo('a'), text('b', '旅行'), sticker('c')] };
  const images = { 'img-a': { data: 'data:image/jpeg;base64,AAAA', width: 300, height: 200 } };
  const json = JSON.stringify(buildBackup({}, new Date(), { boards: [board], images }));
  const parsed = parseBackup(json);
  assert.equal(parsed.boards.length, 1);
  assert.equal(parsed.boards[0].items.length, 3);
  assert.equal(parsed.boards[0].title, '2027');
  assert.deepEqual(parsed.images, images);

  const bad = parseBackup(
    JSON.stringify({
      app: 'success-journal',
      version: 2,
      entries: {},
      boards: [
        { id: 'x', items: [{ type: 'evil', x: 1 }, { type: 'text', text: '  ' }, { type: 'photo', imageId: 'i', x: 'NaN', w: 1e9 }], background: 'nope' },
        { items: [] },
        'junk',
      ],
      images: { i: { data: 'javascript:alert(1)' }, j: { data: 'data:image/png;base64,AA==' } },
    }),
  );
  assert.equal(bad.boards.length, 1);
  assert.equal(bad.boards[0].background, 'cream');
  assert.equal(bad.boards[0].items.length, 1);
  assert.equal(bad.boards[0].items[0].x, BOARD_W / 2);
  assert.ok(bad.boards[0].items[0].w <= 2400);
  assert.deepEqual(Object.keys(bad.images), ['j']);
});

test('舊版（v1）備份仍可匯入', () => {
  const v1 = JSON.stringify({ app: 'success-journal', version: 1, entries: { '2026-10-01': { items: ['a', '', ''] } } });
  const parsed = parseBackup(v1);
  assert.equal(parsed.count, 1);
  assert.deepEqual(parsed.boards, []);
});

test('合併願景板與文字匯出', () => {
  const merged = mergeBoards([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 2 }]);
  assert.deepEqual(merged.map((b) => `${b.id}${b.v}`), ['a1', 'b2', 'c2']);
  assert.deepEqual(usedImageIds([{ items: [photo('a'), photo('a'), text('t')] }]), ['img-a']);
  const txt = buildTextExport({}, [{ title: '2027 夢想', items: [text('t', '去京都旅行')] }]);
  assert.match(txt, /願景板[\s\S]*2027 夢想\n {2}・去京都旅行/);
});
