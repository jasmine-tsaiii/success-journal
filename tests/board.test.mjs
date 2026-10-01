import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_H,
  BOARD_W,
  DEFAULT_PALETTE,
  PALETTES,
  TEMPLATES,
  applyTemplate,
  clampItem,
  createBoard,
  estimateMeasure,
  estimateTextLayout,
  fillSlots,
  isEmptySlot,
  itemSize,
  migrateBoard,
  paletteById,
  placeNew,
  resolveColor,
  sanitizeBoard,
  scaleItem,
  usedImageIds,
  verticalColumns,
  wrapText,
} from '../app/js/board-core.js';
import { STICKERS, stickerSvg, WORD_IDEAS } from '../app/js/stickers.js';
import { buildBackup, buildTextExport, mergeBoards, parseBackup } from '../app/js/core.js';

const NOW = new Date('2026-10-01T09:00:00');
const photo = (n) => ({ imageId: `img-${n}`, aspect: 1.5 });

test('色調：淺色 6 種（米色底）、深色 4 種（夜空底、星點）', () => {
  const light = PALETTES.filter((p) => !p.dark);
  const dark = PALETTES.filter((p) => p.dark);
  assert.equal(light.length, 6);
  assert.equal(dark.length, 4);
  assert.ok(light.every((p) => p.bg === '#F3EBDF'));
  assert.ok(dark.every((p) => p.stars));
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
  assert.equal(paletteById('nope').id, PALETTES[0].id);
  assert.equal(paletteById('night').id, 'starry'); // 舊版背景
  const rose = paletteById('rose');
  assert.equal(resolveColor('accent', rose), rose.accent);
  assert.equal(resolveColor(undefined, rose), rose.ink);
});

test('新的願景板：預設封面版型、霧粉色調，有可以點的照片格', () => {
  const b = createBoard(undefined, { now: NOW });
  assert.equal(b.template, 'cover');
  assert.equal(b.palette, DEFAULT_PALETTE);
  assert.equal(b.items.filter(isEmptySlot).length, 1);
  assert.equal(b.items.find((it) => it.role === 'title').text, '2027 的我');
});

test('每個版型的物件都在畫面內，且照片格數量正確', () => {
  const slots = { cover: 1, grid: 6, editorial: 3 };
  for (const t of TEMPLATES) {
    const b = createBoard('x', { template: t.id, now: NOW });
    assert.equal(b.items.filter(isEmptySlot).length, slots[t.id], t.id);
    for (const it of b.items) {
      const { w, h } = itemSize(it);
      assert.ok(it.x - w / 2 >= -1 && it.x + w / 2 <= BOARD_W + 1, `${t.id}/${it.role} 超出左右`);
      assert.ok(it.y - h / 2 >= -1 && it.y + h / 2 <= BOARD_H + 1, `${t.id}/${it.role} 超出上下`);
    }
    assert.ok(b.items.filter((it) => it.type === 'shape').every((it) => it.locked));
  }
});

test('照片依序放進空白格，指定的格子優先；放不下的回傳', () => {
  const b = createBoard('x', { template: 'grid', now: NOW });
  const target = b.items.filter(isEmptySlot)[3];
  const rest = fillSlots(b, [photo(1), photo(2)], target.id);
  assert.deepEqual(rest, []);
  assert.equal(target.imageId, 'img-1');
  assert.equal(b.items.filter(isEmptySlot).length, 4);
  const cover = createBoard('x', { now: NOW });
  assert.equal(fillSlots(cover, [photo(1), photo(2), photo(3)]).length, 2);
});

test('換版型：照片搬進新格子，只保留改過的文字，自己加的物件保留', () => {
  const b = createBoard('x', { template: 'grid', now: NOW });
  fillSlots(b, [1, 2, 3, 4].map(photo));
  const title = b.items.find((it) => it.role === 'title');
  Object.assign(title, { text: '我的 2027', edited: true });
  b.items.push({ id: 'mine', type: 'sticker', sticker: 'leaf', x: 100, y: 100, w: 200, rot: 0, z: 99 });

  const items = applyTemplate(b, 'editorial', { now: NOW });
  const slots = items.filter((it) => it.tpl && it.type === 'photo');
  assert.deepEqual(slots.map((s) => s.imageId), ['img-1', 'img-2', 'img-3']);
  // 第 4 張照片放不下：縮小放在旁邊
  const spill = items.filter((it) => !it.tpl && it.type === 'photo');
  assert.deepEqual(spill.map((s) => s.imageId), ['img-4']);
  // 直書標題不被橫書標題取代
  assert.equal(items.find((it) => it.role === 'title').style, 'vertical');
  assert.ok(items.some((it) => it.id === 'mine'));

  const back = applyTemplate({ ...b, items }, 'cover', { now: NOW });
  assert.equal(back.filter((it) => it.type === 'photo' && it.imageId).length, 4);
  // 沒改過的版型文字不會被帶到別的版型
  const coverDefault = createBoard('x', { now: NOW }).items.find((it) => it.role === 'li1').text;
  assert.equal(back.find((it) => it.role === 'li1').text, coverDefault);
});

test('換版型時，使用者改過的標題會保留', () => {
  const b = createBoard('x', { now: NOW });
  Object.assign(b.items.find((it) => it.role === 'title'), { text: '溫柔的一年', edited: true });
  const items = applyTemplate(b, 'grid', { now: NOW });
  assert.equal(items.find((it) => it.role === 'title').text, '溫柔的一年');
});

test('文字換行：中文逐字、英文單字不拆開、保留換行', () => {
  const measure = estimateMeasure(10); // 中文 10、英文 5.5
  assert.deepEqual(wrapText('我值得美好的一切', 40, measure), ['我值得美', '好的一切']);
  assert.deepEqual(wrapText('love and light', 50, measure), ['love and', 'light']);
  assert.deepEqual(wrapText('第一行\n第二行', 100, measure), ['第一行', '第二行']);
  assert.ok(wrapText('supercalifragilistic', 30, measure).every((l) => measure(l) <= 30));
});

test('直書：依欄高分欄，寬度由欄數決定', () => {
  assert.deepEqual(verticalColumns('溫柔而堅定地\n生活', 30, 10, 0), ['溫柔而', '堅定地', '生活']);
  const t = estimateTextLayout({ type: 'text', style: 'vertical', text: '一二三四\n五', fs: 50, h: 1000, w: 10 });
  assert.equal(t.columns.length, 2);
  assert.equal(t.w, 2 * t.lineHeight);
});

test('縮放時照片框與字級等比例，位置限制在畫面內', () => {
  const big = scaleItem({ type: 'photo', w: 400, h: 300, x: 1, y: 1, rot: 0 }, 2);
  assert.deepEqual([big.w, big.h], [800, 600]);
  const text = scaleItem({ type: 'text', w: 400, fs: 40, x: 1, y: 1, rot: 0 }, 0.5);
  assert.equal(text.fs, 20);
  const c = clampItem({ x: -50, y: 99999, w: 1, rot: 370 });
  assert.deepEqual([c.x, c.y, c.w, Math.round(c.rot)], [0, BOARD_H, 60, 10]);
  const b = createBoard();
  assert.equal(placeNew(b, { type: 'sticker', sticker: 'leaf' }).z, Math.max(...b.items.map((i) => i.z)) + 1);
});

test('素材：id 不重複、SVG 依色調換色、印章含文字', () => {
  assert.ok(STICKERS.length >= 14);
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, STICKERS.length);
  const rose = paletteById('rose');
  for (const s of STICKERS) {
    if (s.kind === 'stamp') {
      assert.ok(s.ring && s.center, s.id);
      continue;
    }
    const out = stickerSvg(s, rose);
    assert.ok(!/\{(accent|ink|block|tape|bg)\}/.test(out), s.id);
    assert.match(out, /^<svg[^>]+viewBox=/);
  }
  assert.ok(WORD_IDEAS.length >= 10);
});

test('舊版願景板會轉換成新格式', () => {
  const old = { id: 'b1', title: '舊的', background: 'sunset', items: [{ id: 's', type: 'sticker', sticker: 'lotus', x: 1, y: 1, w: 100, rot: 0, z: 1 }] };
  const m = migrateBoard(old);
  assert.equal(m.palette, 'terracotta');
  assert.equal(m.items[0].sticker, 'flower');
  assert.equal(migrateBoard(m), m);
});

test('願景板備份：照片、版型、色調可來回轉換；不合法的內容會被濾掉', () => {
  const board = createBoard('2027', { template: 'editorial', palette: 'nebula', now: NOW });
  fillSlots(board, [photo('a')]);
  const images = { 'img-a': { data: 'data:image/jpeg;base64,AAAA', width: 300, height: 200 } };
  const parsed = parseBackup(JSON.stringify(buildBackup({}, NOW, { boards: [board], images })));
  assert.equal(parsed.boards.length, 1);
  const back = parsed.boards[0];
  assert.equal(back.template, 'editorial');
  assert.equal(back.palette, 'nebula');
  assert.equal(back.items.length, board.items.length);
  assert.equal(back.items.filter(isEmptySlot).length, 2);
  assert.deepEqual(parsed.images, images);

  const bad = parseBackup(
    JSON.stringify({
      app: 'success-journal',
      version: 2,
      entries: {},
      boards: [
        {
          id: 'x',
          background: 'night',
          items: [
            { type: 'evil', x: 1 },
            { type: 'text', text: '  ', style: 'nope' },
            { type: 'photo', imageId: 'i', x: 'NaN', w: 1e9 },
            { type: 'photo', imageId: null },
            { type: 'shape', color: 'red', h: -5 },
          ],
        },
        { items: [] },
        'junk',
      ],
      images: { i: { data: 'javascript:alert(1)' }, j: { data: 'data:image/png;base64,AA==' } },
    }),
  );
  assert.equal(bad.boards.length, 1);
  const items = bad.boards[0].items;
  assert.equal(bad.boards[0].palette, 'starry');
  assert.deepEqual(items.map((i) => i.type), ['text', 'photo', 'shape']);
  assert.equal(items[0].style, 'body');
  assert.equal(items[1].x, BOARD_W / 2);
  assert.ok(items[1].w <= 2400);
  assert.equal(items[2].color, 'block');
  assert.ok(items[2].locked);
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
  const b = createBoard('2027 願景', { now: NOW });
  fillSlots(b, [photo('a')]);
  assert.deepEqual(usedImageIds([b, b]), ['img-a']);
  const txt = buildTextExport({}, [b]);
  assert.match(txt, /願景板[\s\S]*2027 願景\n[\s\S]*・2027 的我/);
});
