// 願景板介面：清單、編輯器（拖曳、雙指縮放旋轉）、素材、背景、自動排版、存成桌布。

import {
  BACKGROUNDS,
  BOARD_W,
  LAYOUTS,
  TEXT_STYLES,
  autoLayout,
  backgroundCss,
  clampItem,
  createBoard,
  maxZ,
  newId,
  placeNew,
} from './board-core.js';
import { positionItem, renderBoardCanvas, renderStage } from './board-render.js';
import { compressImage, deleteImage, forgetImageUrl, listImageIds, putImage } from './images.js';
import { STICKERS, WORD_IDEAS, PHRASE_IDEAS, stickerDataUrl } from './stickers.js';
import { loadBoards, saveBoards } from './storage.js';

const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));

export function initBoards({ toast, stamp }) {
  const state = {
    boards: loadBoards(),
    currentId: null,
    selectedId: null,
    undo: [],
    layout: 'scatter',
    textStyle: 'card',
    editingTextId: null,
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
    $('boards-empty').hidden = state.boards.length > 0;
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
    state.els = renderStage(stage, board, { selectedId: state.selectedId });
    $('stage-empty').hidden = board.items.length > 0;
    $('board-undo').disabled = state.undo.length === 0;
    renderSelectionBar();
    document.querySelectorAll('#bg-grid button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bg === board.background)));
  }

  function renderSelectionBar() {
    const item = selectedItem();
    $('selection-bar').hidden = !item;
    stage.classList.toggle('has-selection', !!item);
    if (!item) return;
    $('sel-edit').hidden = item.type !== 'text';
    $('sel-frame').hidden = item.type !== 'photo';
    $('sel-frame').textContent = item.frame ? '取消相框' : '加上相框';
  }

  function select(id) {
    state.selectedId = id;
    for (const [itemId, el] of Object.entries(state.els)) el.classList.toggle('selected', itemId === id);
    renderSelectionBar();
  }

  /** 修改願景板：先存復原點，再套用修改、儲存、重繪 */
  function commit(mutate, { rerender = true } = {}) {
    const board = current();
    state.undo.push(clone({ items: board.items, background: board.background }));
    if (state.undo.length > 30) state.undo.shift();
    mutate(board);
    board.updatedAt = new Date().toISOString();
    persist();
    if (rerender) renderEditor();
    else $('board-undo').disabled = false;
  }

  function undo() {
    const snap = state.undo.pop();
    if (!snap) return;
    const board = current();
    board.items = snap.items;
    board.background = snap.background;
    board.updatedAt = new Date().toISOString();
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

  /* ---------- 手勢：單指拖曳、雙指縮放與旋轉 ---------- */

  const pointers = new Map();
  let gesture = null;

  function startGesture() {
    const item = selectedItem();
    if (!item) {
      gesture = null;
      return;
    }
    const pts = [...pointers.values()].map((p) => ({ ...p }));
    gesture = { item0: { ...item }, pts, before: gesture?.before || clone({ items: current().items, background: current().background }), moved: gesture?.moved || false };
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.d0 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      gesture.a0 = Math.atan2(b.y - a.y, b.x - a.x);
      gesture.m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  stage.addEventListener('pointerdown', (e) => {
    const itemEl = e.target.closest('.board-item');
    if (itemEl && pointers.size === 0) select(itemEl.dataset.id);
    else if (!itemEl && pointers.size === 0) {
      select(null);
      return;
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
        ...item0,
        w: item0.w * (d / gesture.d0),
        rot: item0.rot + ((ang - gesture.a0) * 180) / Math.PI,
        x: item0.x + (mid.x - gesture.m0.x) / s,
        y: item0.y + (mid.y - gesture.m0.y) / s,
      };
    } else {
      const p0 = gesture.pts[0];
      const p = pts[0];
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
      startGesture();
      return;
    }
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

  /* ---------- 選取物件的操作 ---------- */

  const actions = {
    bigger: (it) => Object.assign(it, clampItem({ ...it, w: it.w * 1.15 })),
    smaller: (it) => Object.assign(it, clampItem({ ...it, w: it.w / 1.15 })),
    rotl: (it) => Object.assign(it, clampItem({ ...it, rot: it.rot - 10 })),
    rotr: (it) => Object.assign(it, clampItem({ ...it, rot: it.rot + 10 })),
    front: (it, board) => (it.z = maxZ(board) + 1),
    frame: (it) => (it.frame = !it.frame),
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
      state.textStyle = item.style || 'card';
      $('text-input').value = item.text;
      openPanel('text');
      $('text-input').focus();
    } else if (act === 'deselect') {
      select(null);
    } else {
      commit((board) => actions[act](board.items.find((it) => it.id === item.id), board));
    }
  });

  /* ---------- 工具面板 ---------- */

  function closePanels() {
    document.querySelectorAll('.tool-panel').forEach((p) => (p.hidden = true));
    document.querySelectorAll('.tool[data-panel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    state.editingTextId = null;
    $('text-add').textContent = '放上願景板';
  }

  function openPanel(name) {
    const panel = $(`panel-${name}`);
    const wasOpen = !panel.hidden;
    const editing = state.editingTextId;
    closePanels();
    if (wasOpen && !(name === 'text' && editing)) return;
    if (name === 'text' && editing) {
      state.editingTextId = editing;
      $('text-add').textContent = '更新文字';
    } else if (name === 'text') {
      $('text-input').value = '';
    }
    panel.hidden = false;
    document.querySelector(`.tool[data-panel="${name}"]`)?.setAttribute('aria-expanded', 'true');
    renderTextStyleChips();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.querySelectorAll('.tool[data-panel]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.panel === 'layout' && $('panel-layout').hidden) {
        openPanel('layout');
        applyLayout(state.layout);
      } else {
        openPanel(btn.dataset.panel);
      }
    }),
  );

  // 文字
  function renderTextStyleChips() {
    const row = $('text-style-chips');
    row.textContent = '';
    for (const s of TEXT_STYLES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = s.name;
      b.setAttribute('aria-pressed', String(s.id === state.textStyle));
      b.addEventListener('click', () => {
        state.textStyle = s.id;
        renderTextStyleChips();
      });
      row.appendChild(b);
    }
  }

  for (const word of [...WORD_IDEAS, ...PHRASE_IDEAS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip chip-soft';
    b.textContent = word;
    b.addEventListener('click', () => {
      $('text-input').value = word;
      $('text-input').focus();
    });
    $('word-ideas').appendChild(b);
  }

  $('text-add').addEventListener('click', () => {
    const text = $('text-input').value.trim();
    if (!text) {
      toast('先寫下一些文字，或點選下方的靈感');
      return;
    }
    if (state.editingTextId) {
      const id = state.editingTextId;
      commit((board) => Object.assign(board.items.find((it) => it.id === id) || {}, { text, style: state.textStyle }));
      select(id);
    } else {
      addItem({ type: 'text', text, style: state.textStyle, w: [...text].length <= 4 ? 420 : 620 });
    }
    $('text-input').value = '';
    closePanels();
  });

  // 素材
  for (const s of STICKERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sticker-btn';
    b.dataset.sticker = s.id;
    b.setAttribute('aria-label', s.name);
    const img = document.createElement('img');
    img.src = stickerDataUrl(s);
    img.alt = '';
    const label = document.createElement('span');
    label.textContent = s.name;
    b.append(img, label);
    b.addEventListener('click', () => {
      addItem({ type: 'sticker', sticker: s.id });
      toast(`已放上「${s.name}」`);
    });
    $('sticker-grid').appendChild(b);
  }

  // 背景
  for (const bg of BACKGROUNDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bg-btn';
    b.dataset.bg = bg.id;
    const sw = document.createElement('span');
    sw.className = 'bg-swatch';
    sw.style.background = backgroundCss(bg);
    const label = document.createElement('span');
    label.textContent = bg.name;
    b.append(sw, label);
    b.addEventListener('click', () => commit((board) => (board.background = bg.id)));
    $('bg-grid').appendChild(b);
  }

  // 自動排版
  function renderLayoutChips() {
    const row = $('layout-chips');
    row.textContent = '';
    for (const l of LAYOUTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.layout = l.id;
      b.textContent = l.name;
      b.setAttribute('aria-pressed', String(l.id === state.layout));
      b.addEventListener('click', () => applyLayout(l.id));
      row.appendChild(b);
    }
  }

  function applyLayout(layoutId) {
    const board = current();
    if (!board.items.length) {
      toast('先放上幾張照片或文字，再讓我幫你排版');
      return;
    }
    state.layout = layoutId;
    renderLayoutChips();
    const seed = Math.floor(Math.random() * 1e9);
    commit((b) => (b.items = autoLayout(b.items, { layout: layoutId, seed })));
    select(null);
  }
  renderLayoutChips();
  $('layout-again').addEventListener('click', () => applyLayout(state.layout));

  // 照片
  $('photo-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    toast(files.length > 1 ? `正在加入 ${files.length} 張照片⋯⋯` : '正在加入照片⋯⋯');
    let added = 0;
    for (const file of files) {
      try {
        const { blob, width, height } = await compressImage(file);
        const id = newId('img');
        await putImage({ id, blob, width, height });
        addItem({ type: 'photo', imageId: id, aspect: width / height, frame: true });
        added++;
      } catch (err) {
        toast(err.message || '有一張照片無法加入');
      }
    }
    if (added) toast(added > 1 ? `已加入 ${added} 張照片，可以試試「幫我排版」` : '已加入照片');
  });

  $('board-undo').addEventListener('click', undo);

  /* ---------- 願景板本身 ---------- */

  $('new-board').addEventListener('click', () => {
    const board = createBoard(`我的願景板 ${state.boards.length + 1}`);
    if (state.boards.length === 0) board.title = '我的願景板';
    state.boards.push(board);
    persist();
    openBoard(board.id);
  });

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
      const canvas = await renderBoardCanvas(board);
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
      const used = new Set(state.boards.flatMap((b) => b.items.filter((it) => it.type === 'photo').map((it) => it.imageId)));
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
      else renderList();
    },
    getBoards: () => state.boards,
    setBoards(boards) {
      state.boards = boards;
      persist();
      if (state.currentId && !current()) state.currentId = null;
      gcImages();
    },
  };
}
