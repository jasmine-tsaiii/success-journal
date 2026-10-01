// 願景板介面：清單、編輯器（點照片格加照片、拖曳、雙指縮放旋轉）、版型、色調、文字、素材、存成桌布。

import {
  BOARD_W,
  PALETTES,
  TEMPLATES,
  TEXT_STYLES,
  applyTemplate,
  clampItem,
  createBoard,
  fillSlots,
  isEmptySlot,
  maxZ,
  migrateBoard,
  newId,
  paletteById,
  placeNew,
  scaleItem,
  spillPhoto,
} from './board-core.js';
import { positionItem, renderBoardCanvas, renderStage, stickerPreview } from './board-render.js';
import { compressImage, deleteImage, forgetImageUrl, listImageIds, putImage } from './images.js';
import { EN_IDEAS, PHRASE_IDEAS, STICKERS, WORD_IDEAS } from './stickers.js';
import { loadBoards, saveBoards } from './storage.js';

const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** 新增文字時，各樣式的預設大小 */
const TEXT_DEFAULTS = {
  title: { fs: 96, w: 900 },
  body: { fs: 50, w: 720 },
  en: { fs: 46, w: 820, color: 'accent' },
  label: { fs: 40, w: 560 },
  vertical: { fs: 66, h: 760, w: 120 },
};

export function initBoards({ toast, stamp, plus }) {
  const state = {
    boards: loadBoards().map(migrateBoard),
    currentId: null,
    selectedId: null,
    undo: [],
    textStyle: 'body',
    editingTextId: null,
    pendingSlotId: null,
    els: {},
  };

  const stage = $('board-stage');
  const current = () => state.boards.find((b) => b.id === state.currentId) || null;
  const selectedItem = () => current()?.items.find((it) => it.id === state.selectedId) || null;
  const scale = () => stage.clientWidth / BOARD_W;

  function persist() {
    try {
      saveBoards(state.boards);
    } catch {
      toast('無法儲存：此裝置的儲存空間可能已滿。');
    }
  }

  /* ---------- 清單 ---------- */

  function renderList() {
    $('boards-list').hidden = false;
    $('board-editor').hidden = true;
    const grid = $('board-grid');
    grid.textContent = '';
    const sorted = [...state.boards].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    for (const board of sorted) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'board-card';
      card.dataset.id = board.id;
      const mini = document.createElement('div');
      mini.className = 'board-stage mini';
      const name = document.createElement('span');
      name.className = 'board-card-title';
      name.textContent = board.title || '未命名的願景板';
      card.append(mini, name);
      card.addEventListener('click', () => openBoard(board.id));
      grid.appendChild(card);
      renderStage(mini, board);
    }
  }

  function newBoard() {
    if (state.boards.length >= 1 && !plus.requirePlus('boards')) return;
    const board = createBoard(state.boards.length ? `我的願景板 ${state.boards.length + 1}` : '我的願景板');
    state.boards.push(board);
    persist();
    openBoard(board.id);
  }

  /* ---------- 編輯器 ---------- */

  function openBoard(id) {
    state.currentId = id;
    state.selectedId = null;
    state.undo = [];
    closePanels();
    $('boards-list').hidden = true;
    $('board-editor').hidden = false;
    $('board-title').value = current().title || '';
    renderEditor();
    window.scrollTo({ top: 0 });
  }

  function renderEditor() {
    const board = current();
    if (!board) return;
    state.els = renderStage(stage, board, { selectedId: state.selectedId, editable: true });
    $('board-undo').disabled = state.undo.length === 0;
    renderSelectionBar();
    renderPanels();
  }

  function renderSelectionBar() {
    const item = selectedItem();
    $('selection-bar').hidden = !item;
    stage.classList.toggle('has-selection', !!item);
    if (!item) return;
    const photo = item.type === 'photo';
    $('sel-edit').hidden = item.type !== 'text';
    $('sel-photo').hidden = !photo;
    $('sel-photo').textContent = isEmptySlot(item) ? '加入照片' : '換照片';
    $('sel-clear').hidden = !photo || isEmptySlot(item) || !item.tpl;
    $('sel-frame').hidden = !photo || item.tpl;
    $('sel-frame').textContent = item.frame ? '取消白框' : '加上白框';
  }

  function select(id) {
    state.selectedId = id;
    for (const [itemId, el] of Object.entries(state.els)) el.classList.toggle('selected', itemId === id);
    renderSelectionBar();
  }

  /** 修改願景板：先存復原點，再套用修改、儲存、重繪 */
  function commit(mutate) {
    const board = current();
    state.undo.push(clone({ items: board.items, palette: board.palette, template: board.template }));
    if (state.undo.length > 30) state.undo.shift();
    mutate(board);
    board.updatedAt = new Date().toISOString();
    persist();
    renderEditor();
  }

  function undo() {
    const snap = state.undo.pop();
    if (!snap) return;
    const board = current();
    Object.assign(board, snap, { updatedAt: new Date().toISOString() });
    if (!board.items.some((it) => it.id === state.selectedId)) state.selectedId = null;
    persist();
    renderEditor();
  }

  function addItem(partial) {
    let added;
    commit((board) => {
      added = placeNew(board, partial);
      board.items.push(added);
    });
    select(added.id);
    return added;
  }

  /* ---------- 手勢：單指拖曳、雙指縮放與旋轉；點空白照片格加入照片 ---------- */

  const pointers = new Map();
  let gesture = null;
  let tappedSlot = null;

  function startGesture() {
    const item = selectedItem();
    if (!item) {
      gesture = null;
      return;
    }
    const pts = [...pointers.values()].map((p) => ({ ...p }));
    gesture = {
      item0: { ...item },
      pts,
      before: gesture?.before || clone({ items: current().items, palette: current().palette, template: current().template }),
      moved: gesture?.moved || false,
    };
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.d0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      gesture.a0 = Math.atan2(b.y - a.y, b.x - a.x);
      gesture.m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  stage.addEventListener('pointerdown', (e) => {
    const itemEl = e.target.closest('.board-item:not(.locked)');
    if (pointers.size === 0) {
      tappedSlot = itemEl && itemEl.classList.contains('empty-slot') ? itemEl.dataset.id : null;
      if (itemEl) select(itemEl.dataset.id);
      else {
        select(null);
        return;
      }
    }
    if (!state.selectedId) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const item = selectedItem();
    if (!item) return;
    const s = scale();
    const pts = [...pointers.values()];
    const { item0 } = gesture;
    let next;
    if (pts.length >= 2 && gesture.d0) {
      const [a, b] = pts;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      next = {
        ...scaleItem(item0, d / gesture.d0),
        rot: item0.rot + ((ang - gesture.a0) * 180) / Math.PI,
        x: item0.x + (mid.x - gesture.m0.x) / s,
        y: item0.y + (mid.y - gesture.m0.y) / s,
      };
    } else {
      const p0 = gesture.pts[0];
      const p = pts[0];
      if (!gesture.moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 6) return; // 輕點不算移動
      next = { ...item0, x: item0.x + (p.x - p0.x) / s, y: item0.y + (p.y - p0.y) / s };
    }
    Object.assign(item, clampItem(next));
    gesture.moved = true;
    positionItem(state.els[item.id], item, s);
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size > 0) {
      tappedSlot = null;
      startGesture();
      return;
    }
    // 輕點空白照片格（沒有拖曳）→ 開啟相簿
    if (tappedSlot && !gesture?.moved) pickPhotos(tappedSlot);
    tappedSlot = null;
    if (gesture?.moved) {
      state.undo.push(gesture.before);
      if (state.undo.length > 30) state.undo.shift();
      current().updatedAt = new Date().toISOString();
      persist();
      $('board-undo').disabled = false;
    }
    gesture = null;
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  new ResizeObserver(() => {
    if (!$('board-editor').hidden && current()) renderEditor();
  }).observe(stage);

  // 字型載入完成後重新排版，確保量測正確
  if (document.fonts) {
    document.fonts.addEventListener('loadingdone', () => {
      if (!$('board-editor').hidden && current()) renderEditor();
      else if (!$('boards-list').hidden) renderList();
    });
  }

  /* ---------- 照片 ---------- */

  function pickPhotos(slotId = null) {
    state.pendingSlotId = slotId;
    $('photo-input').click();
  }

  $('photo-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const slotId = state.pendingSlotId;
    state.pendingSlotId = null;
    toast(files.length > 1 ? `正在加入 ${files.length} 張照片⋯⋯` : '正在加入照片⋯⋯');
    const photos = [];
    for (const file of files) {
      try {
        const { blob, width, height } = await compressImage(file);
        const imageId = newId('img');
        await putImage({ id: imageId, blob, width, height });
        photos.push({ imageId, aspect: width / height });
      } catch (err) {
        toast(err.message || '有一張照片無法加入');
      }
    }
    if (!photos.length) return;
    const count = photos.length;
    let spilled = 0;
    commit((board) => {
      // 指定的照片格若已有照片（換照片），先清空
      const target = board.items.find((it) => it.id === slotId);
      if (target && target.type === 'photo' && !target.tpl && target.imageId) {
        Object.assign(target, photos.shift());
      } else {
        if (target && target.type === 'photo') target.imageId = null;
        const rest = fillSlots(board, photos, slotId);
        let z = maxZ(board);
        rest.forEach((p, i) => board.items.push(spillPhoto(p, i, ++z)));
        spilled = rest.length;
      }
    });
    select(null);
    toast(
      spilled
        ? `已加入 ${count} 張照片；格子不夠的 ${spilled} 張放在右下角，可以拖曳調整，或試試「格狀」版型`
        : count > 1
          ? `已加入 ${count} 張照片`
          : '已加入照片',
    );
  });

  /* ---------- 選取物件的操作 ---------- */

  const actions = {
    bigger: (it) => Object.assign(it, scaleItem(it, 1.12)),
    smaller: (it) => Object.assign(it, scaleItem(it, 1 / 1.12)),
    rotl: (it) => Object.assign(it, clampItem({ ...it, rot: it.rot - 8 })),
    rotr: (it) => Object.assign(it, clampItem({ ...it, rot: it.rot + 8 })),
    front: (it, board) => (it.z = maxZ(board) + 1),
    frame: (it) => (it.frame = !it.frame),
    clear: (it) => (it.imageId = null),
  };

  $('selection-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    const item = selectedItem();
    if (!btn || !item) return;
    const act = btn.dataset.act;
    if (act === 'delete') {
      commit((board) => (board.items = board.items.filter((it) => it.id !== item.id)));
      select(null);
      toast('已移除，可以按「復原」找回來');
    } else if (act === 'edit') {
      state.editingTextId = item.id;
      state.textStyle = TEXT_STYLES.some((s) => s.id === item.style) ? item.style : 'body';
      openPanel('text', { keepEditing: true });
      $('text-input').value = item.text;
      $('text-input').focus();
    } else if (act === 'photo') {
      pickPhotos(item.id);
    } else if (act === 'deselect') {
      select(null);
    } else {
      const id = item.id;
      commit((board) => actions[act](board.items.find((it) => it.id === id), board));
      select(id);
    }
  });

  /* ---------- 工具面板 ---------- */

  function closePanels() {
    document.querySelectorAll('.tool-panel').forEach((p) => (p.hidden = true));
    document.querySelectorAll('.tool[data-panel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    state.editingTextId = null;
    $('text-add').textContent = '放上願景板';
  }

  function openPanel(name, { keepEditing = false } = {}) {
    const panel = $(`panel-${name}`);
    const wasOpen = !panel.hidden;
    const editing = keepEditing ? state.editingTextId : null;
    closePanels();
    if (wasOpen && !editing) return;
    state.editingTextId = editing;
    if (name === 'text') {
      $('text-add').textContent = editing ? '更新文字' : '放上願景板';
      if (!editing) $('text-input').value = '';
    }
    panel.hidden = false;
    document.querySelector(`.tool[data-panel="${name}"]`)?.setAttribute('aria-expanded', 'true');
    renderPanels();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.querySelectorAll('.tool[data-panel]').forEach((btn) => btn.addEventListener('click', () => openPanel(btn.dataset.panel)));
  $('tool-photo').addEventListener('click', () => pickPhotos(null));

  function chip(label, pressed, onClick, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip ${extraClass}`;
    b.textContent = label;
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  }

  /** 依目前願景板的色調與版型更新各面板 */
  function renderPanels() {
    const board = current();
    if (!board) return;
    const palette = paletteById(board.palette);

    const styles = $('text-style-chips');
    styles.textContent = '';
    for (const s of TEXT_STYLES) {
      styles.appendChild(
        chip(s.name, s.id === state.textStyle, () => {
          state.textStyle = s.id;
          renderPanels();
        }),
      );
    }

    const stickers = $('sticker-grid');
    stickers.textContent = '';
    stickers.style.background = palette.bg;
    stickers.classList.toggle('dark', !!palette.dark);
    for (const s of STICKERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sticker-btn';
      b.dataset.sticker = s.id;
      b.setAttribute('aria-label', s.name);
      b.innerHTML = `<span class="sticker-prev">${stickerPreview(s, palette)}</span>`;
      const label = document.createElement('span');
      label.textContent = s.name;
      b.appendChild(label);
      b.addEventListener('click', () => {
        const w = s.id.startsWith('tape') ? 300 : s.kind === 'stamp' ? 260 : 200;
        addItem({ type: 'sticker', sticker: s.id, w });
        toast(`已放上「${s.name}」`);
      });
      stickers.appendChild(b);
    }

    for (const group of ['light', 'dark']) {
      const row = $(`palette-${group}`);
      row.textContent = '';
      for (const p of PALETTES.filter((x) => !!x.dark === (group === 'dark'))) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'palette-btn';
        b.dataset.palette = p.id;
        b.setAttribute('aria-pressed', String(p.id === board.palette));
        if (p.dark && !plus.isPlus()) b.classList.add('locked');
        b.innerHTML = `<span class="pal-swatch" style="background:${p.bg}"><i style="background:${p.block}"></i><i style="background:${p.accent}"></i></span><span class="pal-name">${p.name}</span>`;
        b.addEventListener('click', () => {
          if (p.dark && !plus.requirePlus('palettes')) return;
          commit((bd) => (bd.palette = p.id));
        });
        row.appendChild(b);
      }
    }

    const tpl = $('template-grid');
    tpl.textContent = '';
    for (const t of TEMPLATES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'template-btn';
      b.dataset.template = t.id;
      b.setAttribute('aria-pressed', String(t.id === board.template));
      if (t.id !== 'cover' && !plus.isPlus()) b.classList.add('locked');
      const mini = document.createElement('div');
      mini.className = 'board-stage mini';
      const label = document.createElement('span');
      label.innerHTML = `${t.name}<small>${t.en}</small>`;
      b.append(mini, label);
      b.addEventListener('click', () => {
        if (t.id !== 'cover' && !plus.requirePlus('templates')) return;
        commit((bd) => {
          bd.items = applyTemplate(bd, t.id);
          bd.template = t.id;
        });
        select(null);
        toast(`已換成「${t.name}」版型，照片和標題都保留了`);
      });
      tpl.appendChild(b);
      if (!$('panel-template').hidden) {
        requestAnimationFrame(() => renderStage(mini, { ...board, id: `${board.id}-${t.id}`, items: applyTemplate(board, t.id) }));
      }
    }
  }

  // 文字靈感
  for (const word of [...WORD_IDEAS, ...PHRASE_IDEAS, ...EN_IDEAS]) {
    $('word-ideas').appendChild(
      chip(
        word,
        false,
        () => {
          $('text-input').value = word;
          if (/^[\x20-\x7E]+$/.test(word)) state.textStyle = 'en';
          renderPanels();
          $('text-input').focus();
        },
        'chip-soft',
      ),
    );
  }

  $('text-add').addEventListener('click', () => {
    const text = $('text-input').value.trim();
    if (!text) {
      toast('先寫下一些文字，或點選下方的靈感');
      return;
    }
    const style = state.textStyle;
    const defaults = TEXT_DEFAULTS[style] || TEXT_DEFAULTS.body;
    if (state.editingTextId) {
      const id = state.editingTextId;
      commit((board) => {
        const it = board.items.find((x) => x.id === id);
        if (!it) return;
        const restyle = it.style !== style;
        Object.assign(it, { text, style, edited: true }, restyle ? { ...defaults, align: style === 'vertical' ? undefined : it.align || 'center' } : {});
      });
      select(id);
    } else {
      addItem({ type: 'text', text, style, align: 'center', ...defaults });
    }
    $('text-input').value = '';
    closePanels();
  });

  $('board-undo').addEventListener('click', undo);

  /* ---------- 願景板本身 ---------- */

  $('new-board').addEventListener('click', newBoard);

  $('board-title').addEventListener('input', (e) => {
    const board = current();
    board.title = e.target.value.slice(0, 40);
    board.updatedAt = new Date().toISOString();
    persist();
  });

  $('board-back').addEventListener('click', () => {
    state.currentId = null;
    closePanels();
    renderList();
    gcImages();
  });

  $('board-delete').addEventListener('click', () => {
    const board = current();
    if (!window.confirm(`確定要刪除「${board.title || '這個願景板'}」嗎？刪除後無法復原。`)) return;
    state.boards = state.boards.filter((b) => b.id !== board.id);
    state.currentId = null;
    persist();
    renderList();
    gcImages();
    toast('已刪除願景板');
  });

  $('board-export').addEventListener('click', async () => {
    const board = current();
    select(null);
    const btn = $('board-export');
    btn.disabled = true;
    try {
      const canvas = await renderBoardCanvas(board, { watermark: !plus.isPlus() });
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const name = `vision-board-${stamp()}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const mobile = window.matchMedia('(pointer: coarse)').matches;
      if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: board.title });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('已存成桌布圖片（1080 × 1920）');
    } catch {
      toast('存圖時發生問題，請再試一次');
    } finally {
      btn.disabled = false;
    }
  });

  /** 清掉沒有任何願景板使用的照片 */
  async function gcImages() {
    try {
      const used = new Set(state.boards.flatMap((b) => b.items.filter((it) => it.type === 'photo' && it.imageId).map((it) => it.imageId)));
      for (const id of await listImageIds()) {
        if (!used.has(id)) {
          forgetImageUrl(id);
          await deleteImage(id);
        }
      }
    } catch {
      /* 忽略 */
    }
  }

  return {
    show() {
      if (state.currentId && current()) renderEditor();
      else if (state.boards.length === 0) newBoard(); // 第一次進來：直接開一張預設願景板
      else renderList();
    },
    getBoards: () => state.boards,
    setBoards(boards) {
      state.boards = boards.map(migrateBoard);
      persist();
      if (state.currentId && !current()) state.currentId = null;
      gcImages();
    },
  };
}
