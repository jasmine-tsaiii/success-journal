import { CHAKRAS } from './chakras.js';
import {
  ITEMS_PER_DAY,
  addDays,
  buildBackup,
  buildTextExport,
  chakraForDate,
  cleanItems,
  computeStats,
  filledItems,
  formatDateZh,
  hasRecord,
  isValidKey,
  mergeBoards,
  mergeEntries,
  monthGrid,
  parseBackup,
  todayKey,
} from './core.js';
import { isStorageAvailable, loadEntries, loadSettings, requestPersistence, saveEntries, saveSettings } from './storage.js';
import { initBoards } from './board-ui.js';
import { usedImageIds } from './board-core.js';
import { blobToDataUrl, dataUrlToBlob, getImage, putImage } from './images.js';

const $ = (id) => document.getElementById(id);
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const state = {
  entries: loadEntries(),
  date: todayKey(),
  month: null, // { y, m }
  selected: null,
  dirty: false,
  settings: loadSettings(),
};

const storageOk = isStorageAvailable();
const textareas = Array.from({ length: ITEMS_PER_DAY }, (_, i) => $(`item-${i}`));

/* ---------- 共用 ---------- */

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => (el.hidden = true), 300);
  }, 2600);
}

function persist() {
  try {
    saveEntries(state.entries);
    return true;
  } catch {
    toast('無法儲存：瀏覽器的儲存空間無法使用。');
    return false;
  }
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyChakraTheme(el, chakra) {
  el.style.setProperty('--chakra', chakra.color);
  el.style.setProperty('--chakra-soft', chakra.soft);
}

/* ---------- 分頁 ---------- */

const VIEWS = ['today', 'dreams', 'calendar', 'data'];

function showView(name, { updateHash = true } = {}) {
  if (!VIEWS.includes(name)) name = 'today';
  flushSave();
  for (const v of VIEWS) {
    $(`view-${v}`).hidden = v !== name;
    const tab = $(`tab-${v}`);
    tab.setAttribute('aria-selected', String(v === name));
  }
  if (name === 'calendar') renderCalendar();
  if (name === 'today') renderToday();
  if (name === 'dreams') boards.show();
  if (updateHash && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0 });
}

/* ---------- 今日 ---------- */

function renderToday() {
  const key = state.date;
  const today = todayKey();
  const { chakra, prompt, affirmation } = chakraForDate(key);

  $('current-date-text').textContent = formatDateZh(key);
  $('date-picker').value = key;
  $('date-picker').max = today;
  $('go-today').hidden = key === today;
  $('next-day').disabled = key >= today;

  applyChakraTheme(document.body, chakra);
  const showChakra = state.settings.showChakra;
  $('chakra-en').textContent = key === today ? "Today's Affirmation" : 'Affirmation of the Day';
  $('chakra-name').textContent = showChakra ? chakra.name : '';
  $('chakra-name').hidden = !showChakra;
  $('chakra-sep').hidden = !showChakra;
  $('chakra-color-name').textContent = chakra.colorName;
  $('chakra-theme').textContent = chakra.theme;
  $('chakra-prompt').textContent = prompt;
  $('chakra-affirmation').textContent = affirmation;

  $('entry-title').textContent = key === today ? '今天的三件成功小事' : '這一天的三件成功小事';
  const items = cleanItems(state.entries[key]?.items);
  textareas.forEach((ta, i) => {
    ta.value = items[i];
    autoGrow(ta);
  });
  const updated = state.entries[key]?.updatedAt;
  setSaveStatus(updated ? `已儲存在這台裝置・${formatTime(updated)}` : '');
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function setSaveStatus(text) {
  $('save-status').textContent = text;
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

let saveTimer;
function scheduleSave() {
  state.dirty = true;
  setSaveStatus('輸入中⋯⋯');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 500);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (!state.dirty) return;
  state.dirty = false;
  const key = state.date;
  const items = textareas.map((ta) => ta.value);
  if (items.some((t) => t.trim())) {
    state.entries[key] = { items, updatedAt: new Date().toISOString() };
  } else {
    delete state.entries[key];
  }
  if (persist()) {
    setSaveStatus(state.entries[key] ? `已儲存在這台裝置・${formatTime(state.entries[key].updatedAt)}` : '已清空這一天的紀錄');
  }
}

function goToDate(key) {
  if (!isValidKey(key)) return;
  const today = todayKey();
  if (key > today) key = today;
  flushSave();
  state.date = key;
  renderToday();
}

/* ---------- 回顧 ---------- */

function renderStats() {
  const s = computeStats(state.entries, todayKey());
  $('stat-streak').textContent = s.streak;
  $('stat-items').textContent = s.totalItems;
  $('stat-days').textContent = s.totalDays;
  $('stat-longest').textContent = s.longest > 0 ? `最長連續記錄：${s.longest} 天` : '寫下第一件成功小事，開始累積吧。';
}

function renderCalendar() {
  renderStats();
  const today = todayKey();
  if (!state.month) {
    const [y, m] = today.split('-').map(Number);
    state.month = { y, m };
  }
  const { y, m } = state.month;
  $('month-title').textContent = `${y} 年 ${m} 月`;
  $('month-en').textContent = `${MONTHS_EN[m - 1]} ${y}`;
  const [ty, tm] = today.split('-').map(Number);
  $('next-month').disabled = y > ty || (y === ty && m >= tm);

  const grid = $('calendar-grid');
  grid.textContent = '';
  for (const key of monthGrid(y, m)) {
    if (!key) {
      const empty = document.createElement('span');
      empty.className = 'cal-cell empty';
      grid.appendChild(empty);
      continue;
    }
    const { chakra } = chakraForDate(key);
    const recorded = hasRecord(state.entries[key]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-cell';
    btn.dataset.date = key;
    btn.textContent = String(Number(key.slice(8)));
    if (recorded) {
      btn.classList.add('recorded');
      btn.style.setProperty('--dot', chakra.color);
    }
    if (key === today) btn.classList.add('today');
    if (key === state.selected) btn.classList.add('selected');
    if (key > today) btn.disabled = true;
    btn.setAttribute(
      'aria-label',
      `${formatDateZh(key)}，${chakra.name}${recorded ? `，已記錄 ${filledItems(state.entries[key]).length} 件` : ''}`,
    );
    grid.appendChild(btn);
  }

  const legend = $('legend');
  legend.textContent = '';
  for (const c of CHAKRAS) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="legend-dot"></span>';
    li.firstChild.style.background = c.color;
    li.append(state.settings.showChakra ? c.name : c.colorName);
    legend.appendChild(li);
  }
  renderDayDetail();
}

function renderDayDetail() {
  const el = $('day-detail');
  const key = state.selected;
  if (!key) {
    el.hidden = true;
    return;
  }
  const { chakra, affirmation } = chakraForDate(key);
  const items = filledItems(state.entries[key]);
  applyChakraTheme(el, chakra);
  el.textContent = '';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = state.settings.showChakra ? chakra.en : 'Little Wins';
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = formatDateZh(key);
  const meta = document.createElement('p');
  meta.className = 'chakra-meta';
  meta.innerHTML = '<span class="chakra-dot"></span>';
  meta.append(state.settings.showChakra ? `${chakra.name}・${chakra.colorName}` : `今日色彩・${chakra.colorName}`);
  el.append(eyebrow, h, meta);

  if (items.length) {
    const ol = document.createElement('ol');
    ol.className = 'detail-list';
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t;
      ol.appendChild(li);
    }
    el.appendChild(ol);
  } else {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '這一天還沒有紀錄。想補寫的話，隨時都可以。';
    el.appendChild(p);
  }
  const aff = document.createElement('p');
  aff.className = 'affirmation-text small-aff';
  aff.textContent = affirmation;
  el.appendChild(aff);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn btn-primary';
  edit.id = 'edit-day';
  edit.textContent = items.length ? '編輯這一天' : '補寫這一天';
  edit.addEventListener('click', () => {
    state.date = key;
    showView('today');
  });
  el.appendChild(edit);
  el.hidden = false;
}

function shiftMonth(delta) {
  let { y, m } = state.month;
  m += delta;
  if (m < 1) {
    m = 12;
    y--;
  } else if (m > 12) {
    m = 1;
    y++;
  }
  state.month = { y, m };
  renderCalendar();
}

/* ---------- 備份 ---------- */

function stamp() {
  return todayKey().replaceAll('-', '');
}

async function exportJson() {
  flushSave();
  const allBoards = boards.getBoards();
  const images = {};
  for (const id of usedImageIds(allBoards)) {
    try {
      const rec = await getImage(id);
      if (rec) images[id] = { data: await blobToDataUrl(rec.blob), width: rec.width, height: rec.height };
    } catch {
      /* 略過讀不到的照片 */
    }
  }
  const backup = buildBackup(state.entries, new Date(), { boards: allBoards, images });
  download(`success-journal-backup-${stamp()}.json`, JSON.stringify(backup), 'application/json');
  const days = Object.keys(backup.entries).length;
  toast(`已下載備份檔（${days} 天的紀錄${allBoards.length ? `、${allBoards.length} 個願景板` : ''}）`);
}

function exportText() {
  flushSave();
  download(`success-journal-${stamp()}.txt`, buildTextExport(state.entries, boards.getBoards()), 'text/plain;charset=utf-8');
  toast('已下載文字檔');
}

async function importJson(file) {
  if (!file) return;
  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch (err) {
    toast(`匯入失敗：${err.message}`);
    return;
  }
  const boardCount = parsed.boards.length;
  if (parsed.count === 0 && boardCount === 0) {
    toast('備份檔裡沒有任何紀錄。');
    return;
  }
  const overlap = Object.keys(parsed.entries).filter((k) => hasRecord(state.entries[k])).length;
  const existingIds = new Set(boards.getBoards().map((b) => b.id));
  const boardOverlap = parsed.boards.filter((b) => existingIds.has(b.id)).length;
  const msg =
    `備份檔中有 ${parsed.count} 天的紀錄${boardCount ? `、${boardCount} 個願景板` : ''}。` +
    (overlap ? `\n其中 ${overlap} 天與這台裝置上的紀錄日期相同，將以備份檔內容覆蓋。` : '') +
    (boardOverlap ? `\n其中 ${boardOverlap} 個願景板已存在，將以備份檔內容覆蓋。` : '') +
    '\n確定要匯入嗎？';
  if (!window.confirm(msg)) return;
  flushSave();
  try {
    for (const [id, img] of Object.entries(parsed.images)) {
      await putImage({ id, blob: await dataUrlToBlob(img.data), width: img.width, height: img.height });
    }
  } catch {
    toast('匯入照片時空間不足，請清出一些手機空間後再試一次。');
    return;
  }
  state.entries = mergeEntries(state.entries, parsed.entries);
  if (persist()) {
    try {
      boards.setBoards(mergeBoards(boards.getBoards(), parsed.boards));
    } catch {
      toast('願景板匯入失敗：此裝置的儲存空間可能已滿。');
      return;
    }
    toast(`已匯入 ${parsed.count} 天的紀錄${boardCount ? `、${boardCount} 個願景板` : ''}`);
    renderToday();
    renderStats();
  }
}

/* ---------- 安裝到主畫面 ---------- */

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('install-btn').hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  $('install-btn').hidden = true;
  toast('已加到主畫面');
});

/* ---------- 綁定事件 ---------- */

function bind() {
  for (const v of VIEWS) $(`tab-${v}`).addEventListener('click', () => showView(v));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)));

  $('prev-day').addEventListener('click', () => goToDate(addDays(state.date, -1)));
  $('next-day').addEventListener('click', () => goToDate(addDays(state.date, 1)));
  $('go-today').addEventListener('click', () => goToDate(todayKey()));
  $('date-picker').addEventListener('change', (e) => e.target.value && goToDate(e.target.value));

  textareas.forEach((ta) => {
    ta.addEventListener('input', () => {
      autoGrow(ta);
      scheduleSave();
    });
    ta.addEventListener('blur', flushSave);
  });
  $('entry-form').addEventListener('submit', (e) => e.preventDefault());

  $('prev-month').addEventListener('click', () => shiftMonth(-1));
  $('next-month').addEventListener('click', () => shiftMonth(1));
  $('calendar-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('button.cal-cell');
    if (!cell || cell.disabled) return;
    state.selected = cell.dataset.date;
    renderCalendar();
    $('day-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('export-json').addEventListener('click', exportJson);
  $('export-txt').addEventListener('click', exportText);
  $('import-file').addEventListener('change', async (e) => {
    await importJson(e.target.files[0]);
    e.target.value = '';
  });
  $('install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('install-btn').hidden = true;
  });

  // 離開頁面或切到背景時，立即存檔
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushSave());
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), { updateHash: false }));

  // 跨日時（例如 App 整晚開著），回到前景時更新到新的一天
  let lastToday = todayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayKey();
    if (now !== lastToday) {
      if (state.date === lastToday) state.date = now;
      lastToday = now;
      renderToday();
    }
  });
}

const boards = initBoards({ toast, stamp });

function bindSettings() {
  const box = $('setting-chakra');
  box.checked = state.settings.showChakra;
  box.addEventListener('change', () => {
    state.settings = { ...state.settings, showChakra: box.checked };
    saveSettings(state.settings);
    toast(box.checked ? '今日頁會顯示脈輪名稱' : '今日頁只顯示色彩與肯定語');
  });
}

function init() {
  bind();
  bindSettings();
  if (!storageOk) {
    toast('這個瀏覽器目前無法儲存資料（可能是無痕模式），紀錄將不會被保存。');
  }
  showView(location.hash.slice(1) || 'today', { updateHash: false });
  requestPersistence().then((ok) => {
    $('storage-info').textContent = ok ? '已請瀏覽器將日記資料標記為「持續保存」。' : '';
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
