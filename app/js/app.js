import { CHAKRAS } from './chakras.js';
import {
  ITEMS_PER_DAY,
  MAX_ITEMS,
  MAX_THANKS,
  THANKS_TO,
  cleanThanks,
  cleanThanksTo,
  cleanThanksName,
  filledThanks,
  computeThanksStats,
  collectThanks,
  pickThanks,
  relativeDay,
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
  weekdayIndex,
  DEFAULT_TAGS,
  UNTAGGED,
  cleanTagName,
  cleanTags,
  cleanReflection,
  computeTagStats,
  itemsByTag,
  extractHashtags,
  itemTags,
  monthlyTagTable,
  periodRange,
} from './core.js';
import { isStorageAvailable, loadEntries, loadSettings, loadTagList, loadThanksList, requestPersistence, saveEntries, saveSettings, saveTagList, saveThanksList } from './storage.js';
import { initBoards } from './board-ui.js';
import { canvasToBlob, renderCourageCard, renderDayCard, renderInviteCard, renderThanksCard, shareBackup, shareOrDownload } from './share.js';
import { parseRef, shareLink, stripUtm } from './ref.js';
import { initAnalytics, setAnalyticsAllowed, setUserProperties, track, trackView } from './analytics.js';
import { detectPlatform, externalBrowserUrl, installNudge } from './install-core.js';
import {
  CHALLENGE_DAYS,
  CHALLENGE_TARGETS,
  IDEA_LEVELS,
  OUTCOMES,
  OUTCOME_ICON,
  OUTCOME_LABEL,
  challengeProgress,
  cleanChallenge,
  cleanCourage,
  comfortLine,
  pickIdea,
} from './courage-core.js';
import { DEFAULT_TIME, REMINDER_TIMES, disableReminder, enableReminder, markWritten, permission, pushSupport } from './reminders.js';
import { usedImageIds } from './board-core.js';
import { blobToDataUrl, dataUrlToBlob, getImage, putImage } from './images.js';
import * as cloud from './cloud.js';
import { initSync } from './sync.js';
import { APP_VERSION } from './version.js';
import { DEVELOPER_IG, FEEDBACK_EMAIL } from './config.js';

// 告訴 index.html：這次載入的程式是哪一版（用來發現「新頁面配舊程式」）
window.__SJ_APP = APP_VERSION;

const $ = (id) => document.getElementById(id);
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const state = {
  entries: loadEntries(),
  date: todayKey(),
  month: null, // { y, m }
  selected: null,
  dirty: false,
  settings: loadSettings(),
  tagList: loadTagList(DEFAULT_TAGS),
  thanksList: loadThanksList(THANKS_TO),
  dayTags: cleanTags(),
  dayCourage: [], // 每一件小成功的「勇敢一步」（對應 items）
  thanksTo: [[]],
  period: 'month',
  tagOpen: null, // 成功類型中展開明細的標籤
  tagShowAll: false,
};

const storageOk = isStorageAvailable();
const textareas = Array.from({ length: ITEMS_PER_DAY }, (_, i) => $(`item-${i}`));

/* ---------- 第四件之後的成功（想多寫時才出現） ---------- */

const EXTRA_PLACEHOLDERS = ['還有呢？', '再小的也算', '今天真的很棒', '繼續寫下去吧'];

function wireTextarea(ta, i) {
  ta.addEventListener('input', () => {
    autoGrow(ta);
    scheduleSave();
    updateShareButton();
    updateAddWin();
  });
  ta.addEventListener('blur', flushSave);
  ta.addEventListener('focus', () => {
    if (activeRow === i) return;
    activeRow = i;
    renderTagRows();
  });
}

function addRow() {
  const i = textareas.length;
  const li = document.createElement('li');
  li.className = 'win-extra';
  const num = document.createElement('span');
  num.className = 'win-num';
  num.setAttribute('aria-hidden', 'true');
  num.textContent = String(i + 1).padStart(2, '0');
  const body = document.createElement('div');
  body.className = 'win-body';
  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.htmlFor = `item-${i}`;
  label.textContent = `第 ${i + 1} 件`;
  const ta = document.createElement('textarea');
  ta.id = `item-${i}`;
  ta.rows = 1;
  ta.maxLength = 2000;
  ta.placeholder = EXTRA_PLACEHOLDERS[(i - ITEMS_PER_DAY) % EXTRA_PLACEHOLDERS.length];
  const tags = document.createElement('div');
  tags.className = 'win-tags';
  tags.id = `tags-${i}`;
  tags.dataset.i = String(i);
  body.append(label, ta, tags);
  li.append(num, body);
  document.querySelector('.win-list').appendChild(li);
  textareas.push(ta);
  wireTextarea(ta, i);
  return ta;
}

/** 調整成 n 格（至少三格） */
function setRowCount(n) {
  const count = Math.min(Math.max(n, ITEMS_PER_DAY), MAX_ITEMS);
  while (textareas.length < count) addRow();
  while (textareas.length > count) textareas.pop().closest('li').remove();
}

function updateAddWin() {
  const last = textareas[textareas.length - 1];
  $('add-win').hidden = textareas.length >= MAX_ITEMS || !last.value.trim();
  // 標題：預設「三件」；多寫的時候改成「成功小事」
  const name = displayName();
  const day = state.date === todayKey() ? '今天' : '這一天';
  const many = textareas.length > ITEMS_PER_DAY;
  $('entry-title').textContent = `${name ? `${name}，` : ''}${day}的${many ? '' : '三件'}成功小事`;
  $('wins-label').textContent = many ? 'Little Wins' : 'Three Little Wins';
}

/* ---------- 感恩日記 ---------- */

const thanksAreas = [];
let activeThanks = null; // 正在寫的那一件感恩（只有它會出現「謝謝誰」）

function addThanksRow() {
  const i = thanksAreas.length;
  const li = document.createElement('li');
  const num = document.createElement('span');
  num.className = 'thanks-num';
  num.setAttribute('aria-hidden', 'true');
  num.textContent = '♡';
  const body = document.createElement('div');
  body.className = 'win-body';
  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.htmlFor = `thanks-${i}`;
  label.textContent = `第 ${i + 1} 件感恩`;
  const ta = document.createElement('textarea');
  ta.id = `thanks-${i}`;
  ta.rows = 1;
  ta.maxLength = 2000;
  ta.placeholder = i === 0 ? '今天，我想謝謝⋯⋯' : '還想謝謝⋯⋯';
  const to = document.createElement('div');
  to.className = 'win-tags';
  to.id = `thanks-to-${i}`;
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'text-btn thanks-send';
  send.id = `thanks-send-${i}`;
  send.textContent = '傳感謝卡給他 ↗';
  send.hidden = true;
  send.addEventListener('click', () => shareThanks(i));
  body.append(label, ta, to, send);
  li.append(num, body);
  $('thanks-list').appendChild(li);
  thanksAreas.push(ta);
  ta.addEventListener('input', () => {
    autoGrow(ta);
    scheduleSave();
    updateShareButton();
    updateAddThanks();
    send.hidden = !ta.value.trim();
  });
  ta.addEventListener('blur', flushSave);
  ta.addEventListener('focus', () => {
    if (activeThanks === i) return;
    activeThanks = i;
    renderThanksTo();
  });
  return ta;
}

function setThanksCount(n) {
  const count = Math.min(Math.max(n, 1), MAX_THANKS);
  while (thanksAreas.length < count) addThanksRow();
  while (thanksAreas.length > count) thanksAreas.pop().closest('li').remove();
}

function updateAddThanks() {
  const last = thanksAreas[thanksAreas.length - 1];
  $('add-thanks').hidden = thanksAreas.length >= MAX_THANKS || !last.value.trim();
}

/** 「謝謝誰」：正在寫的那一件顯示一排選項，其他的以小字顯示已選的對象 */
function renderThanksTo() {
  thanksAreas.forEach((ta, i) => {
    const row = $(`thanks-to-${i}`);
    row.textContent = '';
    if (!state.thanksTo[i]) state.thanksTo[i] = [];
    const picked = state.thanksTo[i];
    const writing = activeThanks === i;
    row.closest('li').classList.toggle('writing', writing);
    if (!writing) {
      if (picked.length) {
        const list = document.createElement('span');
        list.className = 'tag-list';
        list.textContent = `謝謝 ${picked.join('・')}`;
        row.appendChild(list);
      }
      return;
    }
    const strip = document.createElement('div');
    strip.className = 'tag-strip';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', '想謝謝誰（選填）');
    const lead = document.createElement('span');
    lead.className = 'thanks-to-lead';
    lead.textContent = '謝謝';
    strip.appendChild(lead);
    for (const who of [...new Set([...picked, ...state.thanksList])]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag-chip';
      b.textContent = who;
      const sync = () => {
        const on = state.thanksTo[i].includes(who);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      };
      sync();
      keepFocus(b);
      b.addEventListener('click', () => {
        const list = state.thanksTo[i];
        state.thanksTo[i] = list.includes(who) ? list.filter((t) => t !== who) : [...list, who];
        state.dirty = true;
        flushSave();
        sync();
      });
      strip.appendChild(b);
    }
    strip.appendChild(
      addChip(strip, {
        placeholder: '例如：媽媽',
        label: '新增想謝謝的人',
        onCommit(value) {
          const who = cleanThanksName(value);
          if (who) {
            if (!state.thanksList.includes(who)) {
              state.thanksList = [...state.thanksList, who];
              saveThanksList(state.thanksList);
              renderThanksManage();
            }
            if (!state.thanksTo[i].includes(who)) {
              state.thanksTo[i] = [...state.thanksTo[i], who];
              state.dirty = true;
              flushSave();
            }
          }
          ta.focus({ preventScroll: true });
          renderThanksTo();
        },
      }),
    );
    row.appendChild(strip);
  });
}

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
  el.style.setProperty('--day', chakra.color);
}

const WEEK_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_ZH = ['一', '二', '三', '四', '五', '六', '日'];

/** 2026-10-01 → 2026.10.01 */
const dotDate = (key) => key.replaceAll('-', '.');

/** 一年中的第幾天，當作刊號 */
function dayOfYear(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

/* ---------- 外觀 ---------- */

const THEME_COLORS = { light: '#F3EBDF', dark: '#1D2238' };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
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
  if (name === 'data') {
    renderTagManage();
    renderCloud();
  }
  if (updateHash && location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0 });
  trackView(name, firstHref);
  firstHref = null;
  maybeFirstDayInstall();
  maybeAskReminder();
}

/** 剛打開時的完整網址（含 UTM），第一次記錄分頁瀏覽時使用 */
let firstHref = null;

/* ---------- 今日 ---------- */

function renderToday() {
  const key = state.date;
  const today = todayKey();
  const { chakra, prompt, affirmation } = chakraForDate(key);

  $('current-date-text').textContent = dotDate(key);
  $('current-week').textContent = `${WEEK_EN[weekdayIndex(key)]} · 週${WEEK_ZH[weekdayIndex(key)]}`;
  $('date-picker').setAttribute('aria-label', `選擇日期，目前為 ${formatDateZh(key)}`);
  $('issue-no').textContent = `No.${String(dayOfYear(key)).padStart(3, '0')}`;
  $('date-picker').value = key;
  $('date-picker').max = today;
  $('go-today').hidden = key === today;
  $('next-day').disabled = key >= today;

  applyChakraTheme(document.body, chakra);
  const showChakra = state.settings.showChakra;
  $('chakra-en').textContent = key === today ? 'Affirmation' : 'Affirmation of the Day';
  $('chakra-name').textContent = showChakra ? chakra.name : '';
  $('chakra-name').hidden = !showChakra;
  $('chakra-sep').hidden = !showChakra;
  $('chakra-color-name').textContent = chakra.colorName;
  $('chakra-theme').textContent = chakra.theme;
  $('chakra-prompt').textContent = prompt;
  $('chakra-affirmation').textContent = affirmation;

  const items = cleanItems(state.entries[key]?.items);
  setRowCount(items.length);
  textareas.forEach((ta, i) => {
    ta.value = items[i];
    autoGrow(ta);
  });
  state.dayTags = cleanTags(state.entries[key]?.tags, items.length);
  state.dayCourage = cleanCourage(state.entries[key]?.courage, items.length) || [];
  renderCourageBar();
  const thanks = cleanThanks(state.entries[key]?.gratitude);
  setThanksCount(thanks.length);
  thanksAreas.forEach((ta, i) => {
    ta.value = thanks[i];
    autoGrow(ta);
    $(`thanks-send-${i}`).hidden = !ta.value.trim();
  });
  state.thanksTo = cleanThanksTo(state.entries[key]?.gratitudeTo, thanks.length);
  activeThanks = null;
  renderThanksTo();
  updateAddThanks();
  $('prompt-answer').value = state.entries[key]?.reflection?.a || '';
  autoGrow($('prompt-answer'));
  updateAddWin();
  renderTagRows();
  updateShareButton();
  if ($('backup-nudge')) updateBackupNudge();
  const updated = state.entries[key]?.updatedAt;
  setSaveStatus(updated ? savedText(updated) : '');
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 已登入時強調「雲端」，沒登入時提醒只存在這台裝置 */
function savedText(iso) {
  const st = sync.status;
  if (cloud.getSession()) {
    if (st.state === 'ok' && st.lastSyncAt && Date.parse(st.lastSyncAt) >= Date.parse(iso)) return `已同步到雲端・${formatTime(st.lastSyncAt)}`;
    return `已儲存・稍後自動同步到雲端`;
  }
  return `已儲存在這台裝置・${formatTime(iso)}`;
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
  const hadRecord = Boolean(state.entries[key]);
  const items = cleanItems(textareas.map((ta) => ta.value));
  const answer = $('prompt-answer').value;
  const reflection = answer.trim() ? { q: chakraForDate(key).prompt, a: answer } : null;
  const gratitude = cleanThanks(thanksAreas.map((ta) => ta.value));
  const hasThanks = gratitude.some((t) => t.trim());
  if (items.some((t) => t.trim()) || reflection || hasThanks) {
    state.entries[key] = {
      items,
      ...(reflection ? { reflection } : {}),
      ...(hasThanks ? { gratitude, gratitudeTo: cleanThanksTo(state.thanksTo, gratitude.length) } : {}),
      tags: cleanTags(state.dayTags, items.length),
      ...(cleanCourage(state.dayCourage, items.length) ? { courage: cleanCourage(state.dayCourage, items.length) } : {}),
      updatedAt: new Date().toISOString(),
    };
    // 文字裡新的 #標籤 自動加入標籤清單
    const fresh = items.flatMap(extractHashtags).filter((t) => !state.tagList.includes(t));
    if (fresh.length) {
      state.tagList = [...state.tagList, ...new Set(fresh)];
      saveTagList(state.tagList);
      renderTagRows();
    }
  } else {
    delete state.entries[key];
  }
  if (persist()) {
    setSaveStatus(state.entries[key] ? savedText(state.entries[key].updatedAt) : '已清空這一天的紀錄');
  }
  // 這一天開始有紀錄（只記有沒有寫，不傳內容）
  if (!hadRecord && state.entries[key]) {
    track('write_entry', { day: key === todayKey() ? 'today' : 'other' });
    if (recordedDayCount() === 1) firstDayPending = true;
    if (key === todayKey()) {
      reminderPending = true;
      if (reminderState().on) markWritten(reminderState().endpoint, key);
    }
  }
}

/* ---------- 標籤（今日頁） ---------- */

function toggleTag(i, tag) {
  const list = state.dayTags[i];
  state.dayTags[i] = list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
  state.dirty = true;
  flushSave();
}

let activeRow = null; // 正在書寫的那一件（只有它會出現標籤列）

/** 點標籤時不要讓輸入框失去焦點，手機鍵盤才不會收起來又跳出來 */
const keepFocus = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());

function tagChip(i, tag) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tag-chip';
  b.textContent = `#${tag}`;
  const sync = () => {
    const on = state.dayTags[i].includes(tag);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  };
  sync();
  keepFocus(b);
  b.addEventListener('click', () => {
    toggleTag(i, tag);
    sync();
  });
  return b;
}

/** 「＋ 自訂」：點了變成小輸入框，按 Enter 或離開時呼叫 onCommit(輸入的文字) */
function addChip(strip, { placeholder, label, onCommit }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tag-chip tag-custom';
  b.textContent = '＋ 自訂';
  b.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-custom-input';
    input.maxLength = 12;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    input.enterKeyHint = 'done';
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      onCommit(input.value);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        input.value = '';
        commit();
      }
    });
    input.addEventListener('blur', commit);
    b.replaceWith(input);
    input.focus();
    strip.scrollLeft = strip.scrollWidth;
  });
  return b;
}

function customChip(i, strip) {
  return addChip(strip, {
    placeholder: '新標籤',
    label: '自訂標籤',
    onCommit(value) {
      const name = cleanTagName(value);
      if (name) {
        if (!state.tagList.includes(name)) {
          state.tagList = [...state.tagList, name];
          saveTagList(state.tagList);
        }
        if (!state.dayTags[i].includes(name)) toggleTag(i, name);
      }
      textareas[i].focus({ preventScroll: true });
      renderTagRows();
    },
  });
}

function renderTagRows() {
  for (let i = 0; i < textareas.length; i++) {
    const row = $(`tags-${i}`);
    row.textContent = '';
    if (!state.dayTags[i]) state.dayTags[i] = [];
    const picked = state.dayTags[i];
    const writing = activeRow === i;
    row.closest('li').classList.toggle('writing', writing);

    const brave = courageEnabled() && state.dayCourage[i];
    if (!writing) {
      // 沒在寫的那幾件：已選的標籤以小字顯示，不搶版面
      if (brave) row.appendChild(courageBadge(brave));
      if (picked.length) {
        const list = document.createElement('span');
        list.className = 'tag-list';
        list.textContent = picked.map((t) => `#${t}`).join(' ');
        row.appendChild(list);
      }
      continue;
    }
    // 正在寫的那一件：一排可以左右滑的標籤，點一下就選
    const strip = document.createElement('div');
    strip.className = 'tag-strip';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', '標籤（選填）');
    if (courageEnabled()) strip.appendChild(courageChip(i));
    const tags = [...new Set([...picked, ...state.tagList])];
    for (const tag of tags) strip.appendChild(tagChip(i, tag));
    strip.appendChild(customChip(i, strip));
    row.appendChild(strip);
  }
}

/* ---------- 標籤管理（設定頁） ---------- */

/** 設定頁的清單：每個項目旁有 × 可以移除 */
function renderChipManage(box, list, { show, removeLabel, onRemove, empty }) {
  box.textContent = '';
  for (const item of list) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = show(item);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'tag-remove';
    x.setAttribute('aria-label', `${removeLabel} ${item}`);
    x.textContent = '×';
    x.addEventListener('click', () => onRemove(item));
    chip.appendChild(x);
    box.appendChild(chip);
  }
  if (!list.length) {
    const p = document.createElement('span');
    p.className = 'small';
    p.textContent = empty;
    box.appendChild(p);
  }
}

function renderTagManage() {
  renderChipManage($('tag-manage'), state.tagList, {
    show: (t) => `#${t}`,
    removeLabel: '移除標籤',
    empty: '目前沒有標籤。',
    onRemove(tag) {
      state.tagList = state.tagList.filter((t) => t !== tag);
      saveTagList(state.tagList);
      renderTagManage();
    },
  });
}

/** 感謝的對象：移除只影響之後的選項，以前記下的不會被改掉 */
function renderThanksManage() {
  renderChipManage($('thanks-manage'), state.thanksList, {
    show: (t) => t,
    removeLabel: '移除對象',
    empty: '目前沒有對象，寫感恩時可以點「＋ 自訂」新增。',
    onRemove(who) {
      state.thanksList = state.thanksList.filter((t) => t !== who);
      saveThanksList(state.thanksList);
      renderThanksManage();
      renderThanksTo();
    },
  });
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
  const t = computeThanksStats(state.entries);
  $('stat-thanks').hidden = t.total === 0;
  $('stat-thanks').textContent = `♡ 累積感謝 ${t.total} 次${t.top ? `・最常感謝的是${t.top.who}（${t.top.count} 次）` : ''}`;
  renderTagReport();
  renderJar();
  renderCouragePanel();
}

/* ---------- 感恩抽屜 ---------- */

let jarNote = null;

function renderJar(draw = false) {
  const notes = collectThanks(state.entries);
  const has = notes.length > 0;
  $('jar-empty').hidden = has;
  $('jar-note').hidden = !has;
  $('jar-actions').hidden = !has;
  if (!has) {
    jarNote = null;
    return;
  }
  const stillThere = jarNote && notes.some((n) => n.date === jarNote.date && n.text === jarNote.text);
  if (draw || !stillThere) jarNote = pickThanks(notes, todayKey(), jarNote);
  const today = todayKey();
  $('jar-when').textContent = `${relativeDay(jarNote.date, today)}・${dotDate(jarNote.date)}`;
  $('jar-text').textContent = jarNote.text;
  $('jar-to').textContent = jarNote.to.length ? `謝謝${jarNote.to.join('・')}` : '';
  $('jar-to').hidden = !jarNote.to.length;
  $('jar-draw').hidden = notes.length < 2;
}

function bindJar() {
  $('jar-draw').addEventListener('click', () => {
    const note = $('jar-note');
    note.classList.remove('drawn');
    void note.offsetWidth; // 重新播放抽出的動畫
    renderJar(true);
    note.classList.add('drawn');
  });
  $('jar-open').addEventListener('click', () => {
    if (jarNote) openDay(jarNote.date);
  });
}

const TAG_ITEMS_LIMIT = 20;
const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'];

/** 展開某個標籤：列出這段期間裡這類的成功，點一下跳到那一天 */
function tagItemsPanel(tag, range) {
  const list = itemsByTag(state.entries, tag, range);
  const panel = document.createElement('div');
  panel.className = 'tag-items';
  const ul = document.createElement('ul');
  const shown = state.tagShowAll ? list : list.slice(0, TAG_ITEMS_LIMIT);
  let lastDate = null;
  for (const it of shown) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-item';
    btn.dataset.date = it.date;
    const when = document.createElement('span');
    when.className = 'tag-item-date';
    // 同一天的第二件起不重複顯示日期
    when.textContent = it.date === lastDate ? '' : `${dotDate(it.date).slice(5)} 週${WEEKDAY_SHORT[weekdayIndex(it.date)]}`;
    lastDate = it.date;
    const text = document.createElement('span');
    text.className = 'tag-item-text';
    text.textContent = it.text;
    btn.append(when, text);
    btn.setAttribute('aria-label', `${formatDateZh(it.date)}：${it.text}，看那一天`);
    btn.addEventListener('click', () => openDay(it.date));
    li.appendChild(btn);
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  if (list.length > shown.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'text-btn tag-items-more';
    more.textContent = `再顯示 ${list.length - shown.length} 件`;
    more.addEventListener('click', () => {
      state.tagShowAll = true;
      renderTagReport();
    });
    panel.appendChild(more);
  }
  return panel;
}

/** 在月曆選取某一天並捲到當日內容 */
function openDay(date) {
  const [y, m] = date.split('-').map(Number);
  state.month = { y, m };
  state.selected = date;
  renderCalendar();
  $('day-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const PERIOD_LABEL = { week: '本週', month: '本月', year: '今年', all: '全部' };

function renderTagReport() {
  const today = todayKey();
  const stats = computeTagStats(state.entries, periodRange(state.period, today));
  const bars = $('tag-bars');
  bars.textContent = '';
  const label = PERIOD_LABEL[state.period];

  if (!stats.total) {
    $('tag-hero').textContent = `${label}還沒有紀錄。`;
    $('tag-note').textContent = '';
  } else if (!stats.rows.length) {
    $('tag-hero').textContent = `${label}的 ${stats.total} 件成功都還沒有分類。`;
    $('tag-note').textContent = '在今日頁點「＃ 標籤」或在文字裡打 #標籤，這裡就會出現統計。';
  } else {
    const top = stats.rows[0];
    $('tag-hero').innerHTML = '';
    $('tag-hero').append(`${label}最多的是 `);
    const b = document.createElement('b');
    b.textContent = `#${top.tag}`;
    $('tag-hero').append(b, `：${top.count} 件，佔 ${Math.round(top.share * 100)}%`);
    $('tag-note').textContent = `${label}共 ${stats.total} 件成功${stats.untagged ? `，其中 ${stats.untagged} 件未分類` : ''}。一件成功可以有好幾個標籤，所以比例加起來可能超過 100%。點一下類型，就能看到是哪些成功。`;
  }

  const rows = [...stats.rows];
  if (stats.untagged && stats.rows.length) rows.push({ tag: UNTAGGED, count: stats.untagged, share: stats.untagged / stats.total, muted: true });
  if (!rows.some((r) => r.tag === state.tagOpen)) state.tagOpen = null;
  const max = Math.max(1, ...rows.map((r) => r.count));
  for (const r of rows) {
    const item = document.createElement('div');
    item.setAttribute('role', 'listitem');
    const row = document.createElement('button');
    row.type = 'button';
    const open = r.tag === state.tagOpen;
    row.className = `tag-bar${r.muted ? ' muted' : ''}${open ? ' open' : ''}`;
    row.dataset.tag = r.tag;
    row.setAttribute('aria-expanded', String(open));
    const pct = Math.round(r.share * 100);
    const name = r.muted ? r.tag : `#${r.tag}`;
    row.setAttribute('aria-label', `${name}：${r.count} 件，${pct}%，${open ? '收起' : '列出'}這些成功`);
    row.innerHTML = '<span class="tag-bar-label"></span><span class="tag-bar-track"><span class="tag-bar-fill"></span></span><span class="tag-bar-value"></span><span class="tag-bar-chev" aria-hidden="true">›</span>';
    row.children[0].textContent = name;
    row.querySelector('.tag-bar-fill').style.width = `${(r.count / max) * 100}%`;
    row.children[2].textContent = `${r.count}・${pct}%`;
    row.addEventListener('click', () => {
      state.tagOpen = open ? null : r.tag;
      state.tagShowAll = false;
      renderTagReport();
    });
    item.appendChild(row);
    if (open) item.appendChild(tagItemsPanel(r.tag, periodRange(state.period, today)));
    bars.appendChild(item);
  }

  // 每月表格
  const table = monthlyTagTable(state.entries, today, 4);
  const el = $('tag-table');
  el.textContent = '';
  const thead = el.createTHead().insertRow();
  const th0 = document.createElement('th');
  th0.textContent = '標籤';
  thead.appendChild(th0);
  for (const m of table.months) {
    const th = document.createElement('th');
    th.textContent = `${Number(m.slice(5))} 月`;
    thead.appendChild(th);
  }
  const body = el.createTBody();
  for (const r of table.rows) {
    const tr = body.insertRow();
    if (r.total) tr.className = 'total';
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = r.tag === UNTAGGED || r.tag === '其他' || r.total ? r.tag : `#${r.tag}`;
    tr.appendChild(th);
    for (const c of r.counts) tr.insertCell().textContent = c ? String(c) : '–';
  }
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
  $('month-en').textContent = MONTHS_EN[m - 1];
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
    if (filledThanks(state.entries[key]).length) btn.classList.add('thanked');
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
  eyebrow.className = 'label-caps';
  eyebrow.textContent = dotDate(key);
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = formatDateZh(key);
  const meta = document.createElement('p');
  meta.className = 'chakra-meta';
  meta.innerHTML = '<span class="swatch"></span>';
  meta.append(state.settings.showChakra ? `${chakra.name}・${chakra.colorName}` : `今日色彩・${chakra.colorName}`);
  el.append(eyebrow, h, meta);

  if (items.length) {
    const ol = document.createElement('ol');
    ol.className = 'detail-list';
    const entry = state.entries[key];
    entry.items.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) return;
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = t;
      li.appendChild(span);
      const extra = itemTags(entry, i).filter((tag) => !extractHashtags(t).includes(tag));
      if (extra.length) {
        const tags = document.createElement('span');
        tags.className = 'detail-tags';
        tags.textContent = extra.map((tag) => `#${tag}`).join(' ');
        li.appendChild(tags);
      }
      ol.appendChild(li);
    });
    el.appendChild(ol);
  } else if (!hasRecord(state.entries[key])) {
    const p = document.createElement('p');
    p.className = 'small';
    p.textContent = '這一天還沒有紀錄。想補寫的話，隨時都可以。';
    el.appendChild(p);
  }
  const entryNow = state.entries[key];
  const thanks = filledThanks(entryNow);
  if (thanks.length) {
    const box = document.createElement('div');
    box.className = 'detail-thanks';
    const head = document.createElement('p');
    head.className = 'label-caps';
    head.textContent = 'Thank You';
    box.appendChild(head);
    const ul = document.createElement('ul');
    entryNow.gratitude.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) return;
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'detail-thanks-text';
      text.textContent = t;
      li.appendChild(text);
      const who = cleanThanksTo(entryNow.gratitudeTo, entryNow.gratitude.length)[i];
      if (who.length) {
        const tag = document.createElement('span');
        tag.className = 'detail-tags';
        tag.textContent = `謝謝${who.join('・')}`;
        li.appendChild(tag);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
    el.appendChild(box);
  }
  const reflection = cleanReflection(state.entries[key]?.reflection);
  if (reflection) {
    const box = document.createElement('div');
    box.className = 'detail-reflection';
    const label = document.createElement('p');
    label.className = 'label-caps';
    label.textContent = 'Prompt';
    const q = document.createElement('p');
    q.className = 'detail-q';
    q.textContent = reflection.q;
    const a = document.createElement('p');
    a.className = 'detail-a';
    a.textContent = reflection.a;
    box.append(label, q, a);
    el.appendChild(box);
  }
  const aff = document.createElement('div');
  aff.className = 'detail-affirmation';
  const affLabel = document.createElement('p');
  affLabel.className = 'label-caps';
  affLabel.textContent = 'Affirmation';
  const affText = document.createElement('p');
  affText.textContent = affirmation;
  aff.append(affLabel, affText);
  el.appendChild(aff);

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn detail-edit';
  edit.id = 'edit-day';
  edit.textContent = hasRecord(state.entries[key]) ? '編輯這一天' : '補寫這一天';
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
  const backup = buildBackup(state.entries, new Date(), { boards: allBoards, images, tags: state.tagList, thanksList: state.thanksList });
  const result = await shareBackup(JSON.stringify(backup), stamp());
  if (result === 'cancelled') return;
  state.settings = { ...state.settings, lastBackupAt: new Date().toISOString(), backupSnoozeUntil: null };
  saveSettings(state.settings);
  renderLastBackup();
  updateBackupNudge();
  const days = Object.keys(backup.entries).length;
  const what = `${days} 天的紀錄${allBoards.length ? `、${allBoards.length} 個願景板` : ''}`;
  toast(result === 'shared' ? `已備份（${what}）` : `已下載備份檔（${what}）`);
}

/* ---------- 備份提醒 ---------- */

const DAY_MS = 86400000;
const BACKUP_EVERY_DAYS = 14;

function renderLastBackup() {
  const at = state.settings.lastBackupAt;
  $('last-backup').textContent = at ? `上次備份：${dotDate(toKeyFromIso(at))}` : '還沒有備份過。';
}

const toKeyFromIso = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function updateBackupNudge() {
  const nudge = $('backup-nudge');
  const recordedDays = Object.keys(state.entries).filter((k) => hasRecord(state.entries[k])).length;
  const now = Date.now();
  const last = Date.parse(state.settings.lastBackupAt || '');
  const snoozed = now < Date.parse(state.settings.backupSnoozeUntil || '');
  const daysSince = Number.isFinite(last) ? Math.floor((now - last) / DAY_MS) : null;
  const due = !cloud.getSession() && recordedDays >= 3 && (daysSince === null || daysSince >= BACKUP_EVERY_DAYS) && !snoozed;
  nudge.hidden = !due;
  if (due) {
    $('backup-nudge-text').textContent =
      daysSince === null
        ? `你已經記錄了 ${recordedDays} 天，還沒有備份過。登入 Google 帳號就會自動同步到雲端，換手機也不怕。`
        : `距離上次備份已經 ${daysSince} 天了。登入 Google 帳號就會自動同步，不用再手動備份。`;
  }
}

/* ---------- 分享今天 ---------- */

function updateShareButton() {
  $('share-day').hidden = ![...textareas, ...thanksAreas].some((ta) => ta.value.trim());
}

let shareBlob = null;
let shareUrl = null;
let shareJob = null; // { filename, title, text, link, done, returnFocus }

function closeShare() {
  $('share-sheet').hidden = true;
  if (shareUrl) URL.revokeObjectURL(shareUrl);
  shareUrl = null;
  shareBlob = null;
  const back = shareJob?.returnFocus;
  shareJob = null;
  back?.focus({ preventScroll: true });
}

/** 先顯示卡片預覽，確認後才分享或存圖。link 有值時可以另外複製邀請文字與連結 */
async function openShareSheet({ render, alt, filename, title, text = '', link = '', done, returnFocus, square = false, kind = 'card' }) {
  const img = $('share-img');
  img.hidden = true;
  img.alt = alt;
  shareJob = { filename, title, text, link, done, returnFocus, kind };
  const job = shareJob;
  document.querySelector('.share-frame').classList.toggle('square', square);
  $('share-loading').hidden = false;
  $('share-confirm').disabled = true;
  $('share-copy').hidden = !link;
  $('share-hint').textContent = link ? '分享圖片時會一起附上連結；也可以只複製連結傳給朋友。' : '手機上也可以長按圖片，直接存到相簿。';
  $('share-sheet').hidden = false;
  $('share-cancel').focus({ preventScroll: true });
  try {
    const canvas = await render();
    if (shareJob !== job) return; // 製作途中按了關閉
    shareBlob = await canvasToBlob(canvas);
    shareUrl = URL.createObjectURL(shareBlob);
    img.src = shareUrl;
    img.hidden = false;
    $('share-loading').hidden = true;
    $('share-confirm').disabled = false;
  } catch {
    closeShare();
    toast('產生卡片時發生問題，請再試一次');
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function confirmShare() {
  if (!shareBlob || !shareJob) return;
  const job = shareJob;
  const message = [job.text, job.link].filter(Boolean).join('\n');
  const result = await shareOrDownload(shareBlob, job.filename, job.title, message);
  if (result === 'cancelled') return;
  track('share', { method: result === 'shared' ? 'share_sheet' : 'download', content_type: job.kind });
  closeShare();
  if (result === 'downloaded') {
    // 電腦上：存下圖片，同時把邀請文字與連結複製起來，方便貼到 LINE
    const copied = job.link && (await copyText(message));
    toast(copied ? `${job.done}，連結也複製好了` : job.done);
  }
}

async function copyShareLink() {
  if (!shareJob?.link) return;
  const ok = await copyText([shareJob.text, shareJob.link].filter(Boolean).join('\n'));
  if (ok) track('share', { method: 'copy_link', content_type: shareJob.kind });
  toast(ok ? '已複製邀請文字與連結，貼到 LINE 就能傳給朋友' : shareJob.link);
}

function shareToday() {
  flushSave();
  const key = state.date;
  const { chakra, affirmation } = chakraForDate(key);
  openShareSheet({
    alt: '今天的小成功卡片預覽',
    filename: `success-journal-${key}.png`,
    title: '今天的小成功',
    text: '我用「成功日記」記下今天的小成功 ✨',
    link: shareLink('day_card'),
    kind: 'day_card',
    done: '已存下今天的小成功卡片',
    returnFocus: $('share-day'),
    render: () =>
      renderDayCard({
        date: key,
        week: `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekdayIndex(key)]} · 週${WEEK_ZH[weekdayIndex(key)]}`,
        wins: textareas.map((ta) => ta.value),
        affirmation,
        color: chakra.color,
        colorName: chakra.colorName,
        name: displayName(),
        thanks: thanksAreas.map((ta) => ta.value),
      }),
  });
}

/** 感謝卡：把這一則感恩做成卡片，傳給被感謝的人 */
function shareThanks(i) {
  const text = thanksAreas[i]?.value.trim();
  if (!text) return;
  flushSave();
  const { chakra } = chakraForDate(state.date);
  openShareSheet({
    alt: '感謝卡預覽',
    filename: `thank-you-${state.date}.png`,
    title: '謝謝你',
    text: '想跟你說聲謝謝 ♡',
    link: shareLink('thanks_card'),
    kind: 'thanks_card',
    done: '已存下感謝卡',
    returnFocus: $(`thanks-send-${i}`),
    square: true,
    render: () => renderThanksCard({ text, name: displayName(), date: state.date, color: chakra.color }),
  });
}

/** 邀請卡：只放累積天數與件數，不放任何日記內容 */
function shareInvite(e) {
  flushSave();
  const s = computeStats(state.entries, todayKey());
  const { chakra } = chakraForDate(todayKey());
  openShareSheet({
    alt: '邀請卡預覽',
    filename: 'success-journal-invite.png',
    title: '一起來寫成功日記',
    text: '我在用「成功日記」每天寫下三件小成功，拿起手機就能記錄，邀請你一起來寫 🌱',
    link: shareLink('invite_card'),
    kind: 'invite_card',
    done: '已存下邀請卡',
    returnFocus: e?.currentTarget,
    square: true,
    render: () => renderInviteCard({ days: s.totalDays, wins: s.totalItems, name: displayName(), color: chakra.color }),
  });
}

/* ---------- 新手引導 ---------- */

function installTip() {
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return '你已經從主畫面打開成功日記了，很好！';
  if (ios) return '加到主畫面：在 Safari 點下方「分享」→「加入主畫面」。之後請固定從主畫面打開——iPhone 上 Safari 和主畫面的資料是分開存的。';
  if (/Android/.test(ua)) return '加到主畫面：點右上角「⋮」→「安裝應用程式」或「加到主畫面」，之後從主畫面打開就像一般 App。';
  return '用手機打開這個網址並加到主畫面，每天書寫最方便。';
}

function startOnboarding() {
  const box = $('onboarding');
  const steps = [...box.querySelectorAll('.ob-step')];
  let i = 0;
  const finish = () => {
    box.hidden = true;
    state.settings = { ...state.settings, onboarded: true };
    saveSettings(state.settings);
    textareas[0].focus({ preventScroll: true });
  };
  const show = () => {
    steps.forEach((el, n) => (el.hidden = n !== i));
    box.querySelectorAll('.ob-dots i').forEach((d, n) => d.classList.toggle('on', n === i));
    $('ob-next').textContent = i === steps.length - 1 ? '開始書寫' : '下一步';
  };
  $('ob-install').textContent = installTip();
  $('ob-next').addEventListener('click', () => (i === steps.length - 1 ? finish() : (i++, show())));
  $('ob-skip').addEventListener('click', finish);
  show();
  box.hidden = false;
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
  if (parsed.tags.length) {
    state.tagList = [...new Set([...state.tagList, ...parsed.tags])];
    saveTagList(state.tagList);
    renderTagManage();
  }
  if (parsed.thanksList?.length) {
    state.thanksList = [...new Set([...state.thanksList, ...parsed.thanksList])];
    saveThanksList(state.thanksList);
    renderThanksManage();
  }
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

/* ---------- 加到主畫面 ---------- */

const PLATFORM = detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const SITE = 'https://success.jas-soul.com/';
const LANDING_HREF = location.href; // 剛打開時的網址（含 UTM），從 App 跳到瀏覽器時一起帶過去

let deferredPrompt = null; // Android／電腦 Chrome 可以直接跳出安裝視窗
let installedApp = false; // Android 偵測到已經裝在主畫面
let firstDayPending = false; // 剛寫完第一天，等使用者停下來再顯示說明

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  markInstalled('prompt');
  closeInstall();
  toast('已加到主畫面，之後從主畫面打開就好');
});

const installState = () => state.settings.install || {};
function saveInstall(patch) {
  state.settings = { ...state.settings, install: { ...installState(), ...patch } };
  saveSettings(state.settings);
}

function markInstalled(method) {
  if (!installState().done) track('install_done', { platform: PLATFORM, method });
  saveInstall({ done: true });
  $('install-bar').hidden = true;
  renderLoginBar();
}

const recordedDayCount = () => Object.keys(state.entries).filter((k) => hasRecord(state.entries[k])).length;

function inAppName() {
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/Threads/i.test(ua)) return 'Threads';
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) return 'Facebook';
  return 'App';
}

const ICON = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M8 10H5.5v10.5h13V10H16" /></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M12 8v8M8 12h8" /></svg>',
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="18.5" r="1.6" /></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>',
};

/** 每個平台的說明：步驟（[圖示, 文字]）、補充、主要按鈕 */
function installGuide(kind) {
  const loggedIn = Boolean(cloud.getSession());
  const dataNote = '小提醒：iPhone 主畫面上的成功日記，和瀏覽器裡的是分開存的。先到「設定」用 Google 登入，加好之後在主畫面版再登入一次，寫過的日記就會跟過去。';
  if (kind === 'open-app') {
    return {
      lead: '成功日記已經在你的主畫面了。之後直接點主畫面的圖示打開，就像一般的 App。',
      steps: [],
      primary: { label: '知道了', action: 'done' },
    };
  }
  if (PLATFORM === 'inapp') {
    const app = inAppName();
    const ext = externalBrowserUrl(LANDING_HREF, navigator.userAgent);
    return {
      lead: `你現在是在 ${app} 裡面打開的。在這裡寫的日記只會留在 ${app} 裡，也沒辦法加到主畫面。換到手機的瀏覽器打開，日記才保存得好。`,
      steps: [
        [ICON.more, `如果按了沒反應：點 ${app} 畫面右上角（或右下角）的「⋯」`],
        [ICON.share, '選「用瀏覽器開啟」或「在 Safari 中開啟」'],
      ],
      note: loggedIn || !recordedDayCount() ? '' : `已經在 ${app} 裡寫了？先到「設定」用 Google 登入，換到瀏覽器後再登入一次，日記就會同步過去。`,
      primary: { label: ext.label, action: 'external', url: ext.url },
      secondary: { label: '複製網址', action: 'copy' },
      later: '先在這裡看看',
    };
  }
  if (PLATFORM === 'ios-safari') {
    return {
      steps: [
        [ICON.share, '點畫面下方的「分享」按鈕（iPad 在右上角）'],
        [ICON.add, '往下滑，點「加入主畫面」'],
        [ICON.check, '點右上角「加入」，主畫面就會出現成功日記'],
      ],
      note: loggedIn ? '' : dataNote,
      primary: { label: '我加好了', action: 'done' },
      secondary: loggedIn ? null : { label: '先去登入', action: 'login' },
    };
  }
  if (PLATFORM === 'ios-other') {
    return {
      steps: [
        [ICON.share, '點網址列旁的「分享」按鈕'],
        [ICON.add, '點「加入主畫面」'],
        [ICON.check, '點「加入」，主畫面就會出現成功日記'],
      ],
      note: `${loggedIn ? '' : `${dataNote}\n`}如果找不到「加入主畫面」，請改用 Safari 打開這個網址。`,
      primary: { label: '我加好了', action: 'done' },
      secondary: { label: '複製網址', action: 'copy' },
    };
  }
  if (PLATFORM === 'android') {
    if (deferredPrompt) return { steps: [], primary: { label: '加到主畫面', action: 'prompt' } };
    return {
      steps: [
        [ICON.dots, '點瀏覽器右上角的「⋮」'],
        [ICON.add, '選「加到主畫面」或「安裝應用程式」'],
        [ICON.check, '點「安裝」或「新增」，主畫面就會出現成功日記'],
      ],
      primary: { label: '我加好了', action: 'done' },
    };
  }
  // 電腦
  if (deferredPrompt) return { lead: '也可以安裝到電腦，像一般程式一樣打開。最推薦的還是加到手機主畫面，每天寫最方便。', steps: [], primary: { label: '安裝到這台電腦', action: 'prompt' }, secondary: { label: '複製網址', action: 'copy' } };
  return { lead: `用手機打開 ${SITE.replace('https://', '').replace(/\/$/, '')}，再加到主畫面，每天寫最方便。`, steps: [], primary: { label: '複製網址', action: 'copy' } };
}

let installKind = null;

function openInstall(kind = 'guide', source = 'settings') {
  installKind = kind;
  const g = installGuide(kind);
  const inapp = PLATFORM === 'inapp';
  const first = kind === 'sheet' && !inapp;
  $('install-kicker').textContent = inapp ? 'Open in Browser' : first ? 'Day 1 · Done' : kind === 'open-app' ? 'Already Installed' : 'Add to Home Screen';
  $('install-title').textContent = inapp ? '用手機的瀏覽器打開' : first ? '第一天寫好了！' : kind === 'open-app' ? '從主畫面打開' : '把成功日記放到主畫面';
  $('install-lead').textContent =
    g.lead || (first ? '把成功日記放到手機主畫面，明天一點就能接著寫。每天的小成功，就從打開它開始。' : '放到主畫面，每天一點就能打開，就像一般的 App。');
  const list = $('install-steps');
  list.textContent = '';
  for (const [icon, text] of g.steps) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="install-step-icon">${icon}</span><span class="install-step-text"></span>`;
    li.lastElementChild.textContent = text;
    list.appendChild(li);
  }
  list.hidden = !g.steps.length;
  $('install-note').textContent = g.note || '';
  $('install-note').hidden = !g.note;
  const primary = $('install-primary');
  primary.textContent = g.primary.label;
  primary.dataset.action = g.primary.action;
  primary.dataset.url = g.primary.url || '';
  const second = $('install-secondary');
  second.hidden = !g.secondary;
  if (g.secondary) {
    second.textContent = g.secondary.label;
    second.dataset.action = g.secondary.action;
  }
  $('install-later').textContent = g.later || (g.primary.action === 'done' ? '之後再說' : '關閉');
  $('install-sheet').hidden = false;
  primary.focus({ preventScroll: true });
  track('install_guide', { platform: PLATFORM, source, kind });
}

function closeInstall() {
  $('install-sheet').hidden = true;
}

async function installAction(action, url = '') {
  if (action === 'external' && url) {
    track('install_external', { platform: PLATFORM, app: inAppName() });
    location.href = url;
    return;
  }
  if (action === 'prompt' && deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome !== 'accepted') closeInstall();
    return; // 接受後會收到 appinstalled
  }
  if (action === 'copy') {
    const ok = await copyText(SITE);
    toast(ok ? '已複製網址，貼到瀏覽器打開就可以了' : SITE);
    return;
  }
  if (action === 'login') {
    closeInstall();
    showView('data');
    return;
  }
  // done
  closeInstall();
  markInstalled(installKind === 'open-app' ? 'already' : 'manual');
  toast(installKind === 'open-app' ? '之後從主畫面打開就好' : '太好了！之後從主畫面打開成功日記就好');
}

/** 今日頁上方的小提醒 */
function showInstallBar(kind) {
  const text = $('install-bar-text');
  text.innerHTML =
    kind === 'open-app'
      ? '<b>從主畫面打開</b>　成功日記已經在你的主畫面了'
      : PLATFORM === 'inapp'
        ? '<b>用瀏覽器打開</b>　才能加到主畫面、好好保存日記'
        : '<b>加到主畫面</b>　每天一點就能寫，不用再找網址';
  $('install-bar').dataset.kind = kind;
  $('install-bar').hidden = false;
  renderLoginBar();
  track('install_nudge', { platform: PLATFORM, kind });
}

function nudgeInstall({ firstDayDone = false } = {}) {
  const kind = installNudge({
    platform: PLATFORM,
    standalone: isStandalone(),
    installedApp,
    install: installState(),
    recordedDays: recordedDayCount(),
    today: todayKey(),
    firstDayDone,
  });
  if (!kind) return false;
  saveInstall({ shownDay: todayKey(), shows: (installState().shows || 0) + 1 });
  if (kind === 'sheet') openInstall('sheet', 'first_day');
  else showInstallBar(kind);
  return true;
}

/** 剛寫完第一天：等使用者停下來（離開輸入框一會兒、或切換分頁）再顯示說明，不打斷書寫 */
function maybeFirstDayInstall() {
  if (!firstDayPending) return;
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
  if (!$('share-sheet').hidden || !$('onboarding').hidden) return;
  firstDayPending = false;
  nudgeInstall({ firstDayDone: true });
}

async function detectInstall() {
  const standalone = isStandalone();
  setUserProperties({ display_mode: standalone ? 'standalone' : 'browser', platform: PLATFORM });
  if (standalone) {
    // 從主畫面打開：記下來（Android 的瀏覽器和主畫面共用資料，之後在瀏覽器打開也不會再提醒）
    if (!installState().done) saveInstall({ done: true });
    return;
  }
  // Android Chrome：可以查到這個網站是不是已經裝在主畫面
  if (navigator.getInstalledRelatedApps) {
    try {
      installedApp = (await navigator.getInstalledRelatedApps()).length > 0;
    } catch {
      /* 忽略 */
    }
  }
  nudgeInstall();
}

function bindInstall() {
  $('install-btn').hidden = isStandalone();
  $('install-btn').addEventListener('click', () => openInstall('guide', 'settings'));
  $('install-bar-open').addEventListener('click', () => openInstall($('install-bar').dataset.kind === 'open-app' ? 'open-app' : 'guide', 'banner'));
  $('install-bar-close').addEventListener('click', () => {
    $('install-bar').hidden = true;
    renderLoginBar();
  });
  $('install-primary').addEventListener('click', () => installAction($('install-primary').dataset.action, $('install-primary').dataset.url));
  $('install-secondary').addEventListener('click', () => installAction($('install-secondary').dataset.action));
  $('install-later').addEventListener('click', closeInstall);
  $('install-sheet').addEventListener('click', (e) => e.target === e.currentTarget && closeInstall());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('install-sheet').hidden && closeInstall());
  document.addEventListener('focusout', () => setTimeout(maybeFirstDayInstall, 1200));
  detectInstall();
}

/* ---------- 勇氣練習 ---------- */

const courageEnabled = () => Boolean(state.settings.courage);
const currentChallenge = () => cleanChallenge(state.settings.challenge);
const progressNow = () => challengeProgress(state.entries, currentChallenge(), todayKey());

function setChallenge(c, { fromSync = false } = {}) {
  const clean = cleanChallenge(c);
  state.settings = { ...state.settings, challenge: clean };
  // 別台裝置開始了挑戰：這台也打開勇氣練習
  if (fromSync && clean && state.settings.courage === undefined) state.settings.courage = true;
  saveSettings(state.settings);
  if (!fromSync) window.dispatchEvent(new Event('sj:changed'));
  renderCourageBar();
  renderCouragePanel();
}

/** 標籤列最前面的「勇敢一步」：點了打開結果視窗；標過的直接顯示結果 */
function courageChip(i) {
  const b = document.createElement('button');
  b.type = 'button';
  const c = state.dayCourage[i];
  b.className = `tag-chip courage-chip${c ? ' on' : ''}`;
  b.setAttribute('aria-pressed', String(Boolean(c)));
  b.textContent = c ? `勇敢一步・${OUTCOME_LABEL[c.outcome]}` : '勇敢一步';
  b.addEventListener('click', () => {
    if (!state.dayCourage[i]) {
      state.dayCourage[i] = { outcome: 'pending', fear: '', next: '' };
      state.dirty = true;
      flushSave();
      renderTagRows();
      renderCourageBar();
      track('courage_mark', { outcome: 'pending' });
    }
    openBrave(i);
  });
  return b;
}

/** 沒在寫的那幾件：小字顯示「勇敢一步・被拒絕」 */
function courageBadge(c) {
  const span = document.createElement('span');
  span.className = `courage-badge is-${c.outcome}`;
  span.textContent = `勇敢一步・${OUTCOME_LABEL[c.outcome]}`;
  return span;
}

/* 結果視窗：選結果；被拒絕時多一句鼓勵和兩個選填問題。今日頁本身不多加任何東西 */
let braveRow = null;

function openBrave(i) {
  const c = state.dayCourage[i];
  if (!c) return;
  braveRow = i;
  $('brave-item').textContent = textareas[i].value.trim();
  document.querySelectorAll('input[name="brave-outcome"]').forEach((r) => (r.checked = r.value === c.outcome));
  $('brave-fear').value = c.fear || '';
  $('brave-next').value = c.next || '';
  $('brave-comfort').textContent = comfortLine(state.date, i);
  $('brave-no').hidden = c.outcome !== 'no';
  $('brave-sheet').hidden = false;
}

function closeBrave() {
  if ($('brave-sheet').hidden) return;
  $('brave-sheet').hidden = true;
  braveRow = null;
  flushSave();
  renderTagRows();
  renderCourageBar();
}

function patchBrave(patch) {
  if (braveRow === null || !state.dayCourage[braveRow]) return;
  state.dayCourage[braveRow] = { ...state.dayCourage[braveRow], ...patch };
  state.dirty = true;
}

function bindBrave() {
  document.querySelectorAll('input[name="brave-outcome"]').forEach((r) =>
    r.addEventListener('change', () => {
      patchBrave({ outcome: r.value });
      $('brave-no').hidden = r.value !== 'no';
      flushSave();
      renderCourageBar();
      track('courage_mark', { outcome: r.value });
    }),
  );
  for (const key of ['fear', 'next']) {
    const input = $(`brave-${key}`);
    input.addEventListener('input', () => {
      patchBrave({ [key]: input.value });
      scheduleSave();
    });
  }
  $('brave-done').addEventListener('click', closeBrave);
  $('brave-remove').addEventListener('click', () => {
    if (braveRow !== null) state.dayCourage[braveRow] = null;
    state.dirty = true;
    closeBrave();
  });
  $('brave-sheet').addEventListener('click', (e) => e.target === e.currentTarget && closeBrave());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeBrave());
}

/** 今日頁頂端的挑戰進度條 */
function renderCourageBar() {
  const bar = $('courage-bar');
  const p = courageEnabled() ? progressNow() : null;
  // 手動結束、或結束超過 3 天：不再顯示（成果在回顧頁）
  if (!p || (p.finished && (p.endedAt || todayKey() > addDays(p.endDate, 3)))) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  $('courage-bar-title').textContent = p.finished ? `⚡ ${p.days} 天勇氣挑戰結束了！看看成果 →` : `⚡ ${p.days} 天勇氣挑戰・第 ${p.day} 天`;
  $('courage-bar-count').textContent = p.finished ? '' : `被拒絕 ${p.no}/${p.target}`;
  $('courage-bar-fill').style.width = `${Math.min(100, (p.no / p.target) * 100)}%`;
}

function chipRow(values, selected, format, onPick) {
  const row = document.createElement('div');
  row.className = 'courage-choices';
  for (const v of values) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `reminder-time${v === selected ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(v === selected));
    b.textContent = format(v);
    b.addEventListener('click', () => onPick(v));
    row.appendChild(b);
  }
  return row;
}

let startForm = { days: 30, target: 20 };

/** 回顧頁最上面的挑戰面板：還沒開始→開始挑戰；進行中→進度；結束→成果 */
function renderCouragePanel() {
  const panel = $('courage-panel');
  panel.hidden = !courageEnabled();
  if (panel.hidden) return;
  const body = $('courage-panel-body');
  body.textContent = '';
  const p = progressNow();
  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  if (!p) {
    // 開始一個挑戰
    const title = h('h2', 'courage-title', '開始一個勇氣挑戰');
    title.id = 'courage-title';
    body.append(title, h('p', 'courage-lead', '規則很簡單：每天至少勇敢一步。被拒絕也算數，而且越多越好。'));
    const draw = () => {
      body.querySelectorAll('.courage-form').forEach((el) => el.remove());
      const form = h('div', 'courage-form');
      form.append(h('p', 'courage-label', '期間'), chipRow(CHALLENGE_DAYS, startForm.days, (d) => `${d} 天`, (d) => ((startForm.days = d), draw())));
      const targets = chipRow(CHALLENGE_TARGETS, startForm.target, (t) => `${t} 次`, (t) => ((startForm.target = t), draw()));
      const custom = document.createElement('input');
      custom.type = 'number';
      custom.min = 1;
      custom.max = 999;
      custom.className = `reminder-custom courage-custom${CHALLENGE_TARGETS.includes(startForm.target) ? '' : ' on'}`;
      custom.placeholder = '自訂';
      custom.setAttribute('aria-label', '自訂被拒絕目標');
      if (!CHALLENGE_TARGETS.includes(startForm.target)) custom.value = startForm.target;
      custom.addEventListener('change', () => {
        const n = Math.round(Number(custom.value));
        if (n > 0) {
          startForm.target = Math.min(n, 999);
          draw();
        }
      });
      targets.appendChild(custom);
      form.append(h('p', 'courage-label', '被拒絕目標'), targets);
      const go = h('button', 'btn btn-primary courage-start', '開始挑戰');
      go.type = 'button';
      go.addEventListener('click', () => {
        setChallenge({ startDate: todayKey(), days: startForm.days, target: startForm.target });
        track('challenge_start', { days: startForm.days, target: startForm.target });
        toast(`開始了！接下來 ${startForm.days} 天，每天勇敢一步 ⚡`);
      });
      form.appendChild(go);
      form.appendChild(h('p', 'small courage-safe', '量力而為，從小事開始就好。本功能為自我練習之用，不具治療用途。'));
      body.appendChild(form);
    };
    draw();
    return;
  }

  const title = h('h2', 'courage-title', p.finished ? `${p.days} 天勇氣挑戰完成 🎉` : `${p.days} 天勇氣挑戰`);
  title.id = 'courage-title';
  const head = h('div', 'courage-head');
  head.append(title, h('span', 'courage-day', p.finished ? `${p.startDate.slice(5).replace('-', '/')}–${p.endDate.slice(5).replace('-', '/')}` : `第 ${p.day} / ${p.days} 天`));
  body.appendChild(head);

  const stats = h('div', 'courage-stats');
  for (const [num, label, cls] of [
    [p.brave, '勇敢', ''],
    [`${p.no}/${p.target}`, '被拒絕', 'is-no'],
    [p.yes, '成功', ''],
    [p.pending, '沒回音', ''],
  ]) {
    const st = h('div', `courage-stat ${cls}`);
    st.append(h('span', 'courage-stat-num', String(num)), h('span', 'courage-stat-label', label));
    stats.appendChild(st);
  }
  body.appendChild(stats);

  const grid = h('div', 'courage-grid');
  grid.setAttribute('aria-label', `${p.days} 天中，有 ${p.doneDays} 天勇敢了一步`);
  for (const c of p.cells) {
    const cell = h('span', `courage-cell${c.done ? ' done' : ''}${c.today ? ' today' : ''}${c.future ? ' future' : ''}`);
    cell.title = `${c.date.slice(5).replace('-', '/')}${c.done ? ' 勇敢了一步' : ''}`;
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  if (p.finished) {
    body.appendChild(
      h('p', 'courage-lead', `${p.days} 天裡，你勇敢了 ${p.brave} 次，被拒絕 ${p.no} 次${p.reached ? '，達成目標！' : '。'}每一次開口，都讓下一次更容易。`),
    );
    const actions = h('div', 'courage-actions');
    const share = h('button', 'btn btn-primary', '分享成果');
    share.type = 'button';
    share.addEventListener('click', shareCourage);
    const again = h('button', 'btn', '開始新的挑戰');
    again.type = 'button';
    again.addEventListener('click', () => {
      startForm = { days: p.days, target: p.target };
      setChallenge(null);
    });
    actions.append(share, again);
    body.appendChild(actions);
  } else {
    const actions = h('div', 'courage-actions');
    const idea = h('button', 'btn btn-primary', '抽一個勇氣點子');
    idea.type = 'button';
    idea.addEventListener('click', openIdea);
    actions.appendChild(idea);
    body.appendChild(actions);
  }

  if (p.recent.length) {
    body.appendChild(h('p', 'courage-label', '最近的勇敢一步'));
    const ul = h('ul', 'courage-recent');
    for (const x of p.recent) {
      const li = h('li', `is-${x.outcome}`);
      li.append(h('span', 'courage-recent-date', x.date.slice(5).replace('-', '/')), h('span', 'courage-recent-icon', OUTCOME_ICON[x.outcome]));
      const text = h('span', 'courage-recent-text', x.text);
      if (x.fear) text.appendChild(h('span', 'courage-recent-fear', `「${x.fear}」`));
      li.appendChild(text);
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  if (!p.finished) {
    const end = h('button', 'text-btn courage-end', '提早結束挑戰');
    end.type = 'button';
    end.addEventListener('click', () => {
      if (!window.confirm('要提早結束這個挑戰嗎？寫過的紀錄都會保留。')) return;
      setChallenge({ ...currentChallenge(), endedAt: todayKey() });
      track('challenge_end', { day: p.day, no: p.no });
    });
    body.appendChild(end);
  } else {
    if (!state.settings.challengeDoneTracked) {
      state.settings = { ...state.settings, challengeDoneTracked: p.startDate };
      saveSettings(state.settings);
      track('challenge_done', { days: p.days, brave: p.brave, no: p.no, reached: p.reached });
    }
  }
}

function shareCourage() {
  const p = progressNow();
  if (!p) return;
  const { chakra } = chakraForDate(todayKey());
  openShareSheet({
    alt: '勇氣挑戰成果卡預覽',
    filename: `courage-challenge-${p.startDate}.png`,
    title: '我的勇氣挑戰',
    text: `我完成了 ${p.days} 天勇氣挑戰：勇敢 ${p.brave} 次，被拒絕 ${p.no} 次 ⚡`,
    link: shareLink('courage_card'),
    kind: 'courage_card',
    done: '已存下成果卡',
    square: true,
    render: () => renderCourageCard({ days: p.days, brave: p.brave, no: p.no, yes: p.yes, pending: p.pending, name: displayName(), color: chakra.color }),
  });
}

/* 勇氣點子 */
let idea = null;
const ideaLevel = () => Number(document.querySelector('input[name="idea-level"]:checked')?.value || 0);

function drawIdea() {
  idea = pickIdea(ideaLevel(), idea);
  $('idea-text').textContent = idea ? idea.text : '';
}

function openIdea() {
  drawIdea();
  $('idea-sheet').hidden = false;
  $('idea-use').focus({ preventScroll: true });
  track('courage_idea', { level: IDEA_LEVELS[ideaLevel()] });
}

/** 就做這個：放進今天的第一個空白小成功，標成勇敢一步（還沒回音），寫完再補結果 */
function useIdea() {
  if (!idea) return;
  $('idea-sheet').hidden = true;
  flushSave();
  state.date = todayKey();
  showView('today');
  let i = textareas.findIndex((ta) => !ta.value.trim());
  if (i < 0) {
    if (textareas.length >= MAX_ITEMS) {
      toast('今天的小成功已經寫滿了');
      return;
    }
    addRow();
    state.dayTags.push([]);
    updateAddWin();
    i = textareas.length - 1;
  }
  textareas[i].value = idea.text;
  autoGrow(textareas[i]);
  state.dayCourage[i] = { outcome: 'pending', fear: '', next: '' };
  state.dirty = true;
  flushSave();
  activeRow = i;
  renderTagRows();
  textareas[i].focus();
  toast('加到今天的小成功了。做完再點「勇敢一步」補上結果');
}

function bindCourage() {
  const box = $('setting-courage');
  box.checked = courageEnabled();
  box.addEventListener('change', () => {
    state.settings = { ...state.settings, courage: box.checked };
    saveSettings(state.settings);
    renderTagRows();
    renderCourageBar();
    renderCouragePanel();
    track(box.checked ? 'courage_on' : 'courage_off', {});
    toast(box.checked ? '已開啟勇氣練習：寫小成功時可以標成「勇敢一步」，回顧頁可以開始挑戰' : '已關閉勇氣練習（紀錄都還在）');
  });
  $('courage-bar').addEventListener('click', () => showView('calendar'));
  document.querySelectorAll('input[name="idea-level"]').forEach((r) => r.addEventListener('change', drawIdea));
  $('idea-next').addEventListener('click', drawIdea);
  $('idea-use').addEventListener('click', useIdea);
  $('idea-close').addEventListener('click', () => ($('idea-sheet').hidden = true));
  $('idea-sheet').addEventListener('click', (e) => e.target === e.currentTarget && ($('idea-sheet').hidden = true));
  bindBrave();
}

/* ---------- 每日提醒 ---------- */

const reminderState = () => state.settings.reminder || {};
function saveReminder(patch) {
  state.settings = { ...state.settings, reminder: { ...reminderState(), ...patch } };
  saveSettings(state.settings);
}
const reminderSupport = () => pushSupport({ platform: PLATFORM, standalone: isStandalone() });
let reminderPending = false; // 今天寫好了，等停下來再問要不要提醒

/** 時間選項：傍晚 17:00、晚上 21:00、睡前 23:00、自訂 */
function renderTimeChips(box, selected, onPick, big = false) {
  box.textContent = '';
  const presets = REMINDER_TIMES.map((t) => t.time);
  for (const { time, label } of REMINDER_TIMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `reminder-time${time === selected ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(time === selected));
    b.innerHTML = big ? `<small>${label}</small>${time}` : time;
    b.addEventListener('click', () => onPick(time));
    box.appendChild(b);
  }
  const custom = !presets.includes(selected);
  const input = document.createElement('input');
  input.type = 'time';
  input.step = 900;
  input.className = `reminder-custom${custom && !big ? ' on' : ''}`;
  input.setAttribute('aria-label', '自訂提醒時間');
  input.value = custom ? selected : '';
  input.addEventListener('change', () => input.value && onPick(input.value));
  if (big) {
    const wrap = document.createElement('label');
    wrap.className = `reminder-custom-wrap${custom ? ' on' : ''}`;
    wrap.innerHTML = '<small>自訂</small>';
    wrap.appendChild(input);
    box.appendChild(wrap);
  } else {
    box.appendChild(input);
  }
}

function renderReminderSettings() {
  const r = reminderState();
  const support = reminderSupport();
  const on = Boolean(r.on) && support === 'ok';
  $('reminder-on').checked = on;
  $('reminder-on').disabled = support !== 'ok';
  $('reminder-time-row').hidden = !on;
  renderTimeChips($('reminder-times-settings'), r.time || DEFAULT_TIME, (time) => changeReminderTime(time));
  const note = $('reminder-note');
  let text = '';
  if (support === 'ios-needs-home') text = 'iPhone 需要先把成功日記加到主畫面、並從主畫面打開，才能收到提醒（iOS 16.4 以上）。';
  else if (support === 'unsupported') text = '這個瀏覽器不支援通知，請改用手機的 Chrome 或 Safari 打開。';
  else if (permission() === 'denied') text = '通知權限被關閉了。請到手機的「設定」→「通知」，找到成功日記（或瀏覽器）打開通知，再回來開啟提醒。';
  note.textContent = text;
  note.hidden = !text;
  $('reminder-install').hidden = support !== 'ios-needs-home';
}

async function turnOnReminder(time, source) {
  try {
    const endpoint = await enableReminder(time);
    saveReminder({ on: true, time, endpoint, asked: true });
    track('reminder_on', { time, source });
    toast(`好的，每天 ${time} 提醒你（當天寫過就不會打擾）`);
    if (recordedToday()) markWritten(endpoint, todayKey());
    return true;
  } catch (e) {
    saveReminder({ asked: true });
    if (e.code === 'denied') toast('沒有開啟通知權限，所以無法提醒你。之後可以在手機設定裡打開。');
    else toast(`開啟提醒失敗：${e.message || '請稍後再試'}`);
    return false;
  } finally {
    renderReminderSettings();
  }
}

async function changeReminderTime(time) {
  const r = reminderState();
  if (!r.on) {
    saveReminder({ time });
    renderReminderSettings();
    return;
  }
  if (await turnOnReminder(time, 'settings_time')) toast(`提醒時間改成每天 ${time}`);
}

const recordedToday = () => hasRecord(state.entries[todayKey()]);

function openReminderSheet() {
  let picked = reminderState().time || DEFAULT_TIME;
  const draw = () => renderTimeChips($('reminder-times-sheet'), picked, (t) => ((picked = t), draw()), true);
  draw();
  $('reminder-yes').onclick = async () => {
    $('reminder-sheet').hidden = true;
    await turnOnReminder(picked, 'ask');
  };
  $('reminder-no').onclick = () => {
    $('reminder-sheet').hidden = true;
    saveReminder({ asked: true });
    track('reminder_declined', { platform: PLATFORM });
  };
  $('reminder-sheet').hidden = false;
  $('reminder-yes').focus({ preventScroll: true });
  track('reminder_ask', { platform: PLATFORM });
}

/** 今天寫好、停下來之後，問要不要每天提醒（每台裝置只問一次；不和加到主畫面的說明同時出現） */
function maybeAskReminder() {
  if (!reminderPending) return;
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
  if (firstDayPending || !$('install-sheet').hidden || !$('share-sheet').hidden || !$('onboarding').hidden) return;
  reminderPending = false;
  const r = reminderState();
  if (r.on || r.asked || reminderSupport() !== 'ok' || permission() === 'denied') return;
  if (PLATFORM === 'desktop') return;
  // 在瀏覽器裡、今天剛看過加到主畫面的說明：改天再問，一次只講一件事
  if (!isStandalone() && installState().shownDay === todayKey()) return;
  openReminderSheet();
}

function bindReminders() {
  renderReminderSettings();
  $('reminder-on').addEventListener('change', async () => {
    if ($('reminder-on').checked) {
      await turnOnReminder(reminderState().time || DEFAULT_TIME, 'settings');
    } else {
      const { endpoint } = reminderState();
      saveReminder({ on: false, endpoint: null });
      renderReminderSettings();
      track('reminder_off', {});
      toast('已關閉每日提醒');
      disableReminder(endpoint).catch(() => {});
    }
  });
  $('reminder-install').addEventListener('click', () => openInstall('guide', 'reminder'));
  $('reminder-sheet').addEventListener('click', (e) => e.target === e.currentTarget && ($('reminder-sheet').hidden = true));
  document.addEventListener('focusout', () => setTimeout(maybeAskReminder, 1500));
  // 點了提醒通知、App 本來就開著：切到今日頁
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'open-today') {
      state.date = todayKey();
      showView('today');
    }
  });
}

/* ---------- 綁定事件 ---------- */

function bind() {
  for (const v of VIEWS) $(`tab-${v}`).addEventListener('click', () => showView(v));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)));

  $('prev-day').addEventListener('click', () => goToDate(addDays(state.date, -1)));
  $('next-day').addEventListener('click', () => goToDate(addDays(state.date, 1)));
  $('go-today').addEventListener('click', () => goToDate(todayKey()));
  $('date-picker').addEventListener('change', (e) => e.target.value && goToDate(e.target.value));

  textareas.forEach(wireTextarea);
  $('prompt-answer').addEventListener('input', (e) => {
    autoGrow(e.target);
    scheduleSave();
  });
  $('prompt-answer').addEventListener('blur', flushSave);
  $('add-thanks').addEventListener('click', () => {
    const ta = addThanksRow();
    state.thanksTo.push([]);
    activeThanks = thanksAreas.length - 1;
    updateAddThanks();
    renderThanksTo();
    ta.focus();
  });
  // 點在感恩以外的地方：收起「謝謝誰」
  document.addEventListener('click', (e) => {
    if (activeThanks === null || !e.target.isConnected || e.target.closest('.thanks-list li, #add-thanks')) return;
    activeThanks = null;
    renderThanksTo();
  });
  $('add-win').addEventListener('click', () => {
    const ta = addRow();
    state.dayTags.push([]);
    updateAddWin();
    renderTagRows();
    ta.focus();
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

function bindTags() {
  // 點在三件成功以外的地方：收起「#」按鈕與標籤選單
  // 用 click 而不是 pointerdown：先讓被點的按鈕（再寫一件、分享）收到點擊，再收起標籤列，
  // 不然標籤列一收起，按鈕會往上跳，手指就點不到了
  document.addEventListener('click', (e) => {
    // 被點的元素已經換掉（例如「＋ 自訂」變成輸入框）時也不收起
    if (activeRow === null || !e.target.isConnected || e.target.closest('.win-list li, #add-win, .share-sheet')) return;
    activeRow = null;
    renderTagRows();
  });
  document.querySelectorAll('input[name="period"]').forEach((r) =>
    r.addEventListener('change', () => {
      state.period = r.value;
      state.tagShowAll = false;
      renderTagReport();
    }),
  );
  $('tag-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanTagName($('tag-add-input').value);
    if (!name) return;
    if (state.tagList.includes(name)) {
      toast(`已經有「${name}」這個標籤了`);
      return;
    }
    state.tagList = [...state.tagList, name];
    saveTagList(state.tagList);
    $('tag-add-input').value = '';
    renderTagManage();
    toast(`已新增標籤「${name}」`);
  });
  renderTagManage();
  $('thanks-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const who = cleanThanksName($('thanks-add-input').value);
    if (!who) return;
    if (state.thanksList.includes(who)) {
      toast(`已經有「${who}」了`);
      return;
    }
    state.thanksList = [...state.thanksList, who];
    saveThanksList(state.thanksList);
    $('thanks-add-input').value = '';
    renderThanksManage();
    renderThanksTo();
    toast(`已新增「${who}」`);
  });
  renderThanksManage();
}

function bindSettings() {
  const theme = state.settings.theme || 'auto';
  document.querySelectorAll('input[name="theme"]').forEach((r) => {
    r.checked = r.value === theme;
    r.addEventListener('change', () => {
      state.settings = { ...state.settings, theme: r.value };
      saveSettings(state.settings);
      applyTheme(r.value);
      if (!$('view-dreams').hidden) boards.show();
    });
  });
  applyTheme(theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state.settings.theme || 'auto'));

  const stats = $('setting-analytics');
  stats.checked = state.settings.analytics !== false;
  stats.addEventListener('change', () => {
    state.settings = { ...state.settings, analytics: stats.checked };
    saveSettings(state.settings);
    setAnalyticsAllowed(stats.checked);
    toast(stats.checked ? '謝謝你幫忙改善成功日記' : '已關閉匿名使用統計');
  });

  const box = $('setting-chakra');
  box.checked = state.settings.showChakra;
  box.addEventListener('change', () => {
    state.settings = { ...state.settings, showChakra: box.checked };
    saveSettings(state.settings);
    toast(box.checked ? '今日頁會顯示脈輪名稱' : '今日頁只顯示色彩與肯定語');
  });
}

/* ---------- 帳號與雲端同步 ---------- */

const sync = initSync({
  getEntries: () => state.entries,
  setEntries(entries) {
    state.entries = entries;
    persist();
    // 正在輸入時不要重畫今日頁，以免游標跳走
    if (!textareas.includes(document.activeElement)) renderToday();
    renderStats();
    if (!$('view-calendar').hidden) renderCalendar();
  },
  getBoards: () => boards.getBoards(),
  setBoards(list) {
    boards.setBoards(list);
    if (!$('view-dreams').hidden) boards.show();
  },
  getChallenge: () => currentChallenge(),
  setChallenge: (c) => setChallenge(c, { fromSync: true }),
  getThanksList: () => state.thanksList,
  setThanksList(list) {
    state.thanksList = list;
    saveThanksList(list);
    renderThanksManage();
    renderThanksTo();
  },
  getTags: () => state.tagList,
  setTags(tags) {
    state.tagList = tags;
    saveTagList(tags);
    renderTagManage();
    renderTagRows();
  },
  beforeSync: flushSave,
  onPhotosArrived() {
    if (!$('view-dreams').hidden) boards.show();
  },
  onStatus: renderCloud,
});

function renderCloud() {
  const panel = $('cloud-panel');
  renderLoginBar();
  if (!cloud.cloudConfigured()) {
    panel.hidden = true;
    return;
  }
  // 同步完成後，今日頁的儲存狀態改成「已同步到雲端」
  const entry = state.entries[state.date];
  if (entry && !state.dirty && sync.status.state === 'ok') setSaveStatus(savedText(entry.updatedAt));
  panel.hidden = false;
  const session = cloud.getSession();
  $('cloud-out').hidden = Boolean(session);
  $('cloud-in').hidden = !session;
  if (!session) {
    if (!$('view-data').hidden) showGoogleButton();
    return;
  }
  $('cloud-email').textContent = session.user.email || session.user.name || '已登入';
  const st = sync.status;
  const text =
    st.state === 'syncing'
      ? '同步中⋯⋯'
      : st.state === 'error'
        ? `同步失敗：${st.error}。有網路時會自動再試。`
        : st.lastSyncAt
          ? `上次同步：${formatTime(st.lastSyncAt)}`
          : '尚未同步';
  $('cloud-status').textContent = text;
  $('cloud-sync').disabled = st.state === 'syncing';
}

/** 今日頁頂端：沒登入時提醒，避免以為資料不見了 */
function renderLoginBar() {
  // 兩個提醒不同時出現：「加到主畫面」關掉後才顯示登入提醒
  $('login-bar').hidden = !cloud.cloudConfigured() || Boolean(cloud.getSession()) || !$('install-bar').hidden;
  // iPhone 剛從主畫面打開、還是空的：多半是在 Safari 寫過、加到主畫面後資料沒跟過來（iOS 兩邊是分開存的）
  const freshHomeScreen = PLATFORM.startsWith('ios') && isStandalone() && !recordedDayCount();
  $('login-bar').querySelector('.login-bar-text').innerHTML = freshHomeScreen
    ? '<b>剛從 Safari 加過來的嗎？</b>　主畫面版的資料是分開的，用 Google 登入就能找回剛剛寫的日記'
    : '<b>尚未登入</b>　日記只在這台裝置。登入 Google 帳號，找回並同步你的日記';
}

let buttonShown = false;
async function showGoogleButton() {
  if (buttonShown) return;
  buttonShown = true;
  const err = $('cloud-error');
  err.hidden = true;
  try {
    await cloud.renderGoogleButton($('gsi-button'), {
      onSignedIn: afterSignIn,
      onError: (e) => {
        err.textContent = `登入失敗：${e.message}`;
        err.hidden = false;
      },
    });
  } catch (e) {
    buttonShown = false;
    err.textContent = e.message;
    err.hidden = false;
  }
}

async function afterSignIn(session) {
  buttonShown = false;
  // 稱呼：帳號上有就用帳號上的；沒有的話，把這台裝置的稱呼（或 Google 名字）存到帳號上
  if (session.user.displayName !== null) setDisplayName(session.user.displayName, { push: false });
  else setDisplayName(displayName() || session.user.name || '');
  toast(`已登入 ${session.user.email}，正在同步⋯⋯`);
  pushRef();
  track('login', { method: 'Google' });
  // 已經開了提醒：重新存一次，記到帳號上（在別台裝置寫過也不會提醒）
  if (reminderState().on && reminderSupport() === 'ok') enableReminder(reminderState().time || DEFAULT_TIME).catch(() => {});
  renderCloud();
  updateBackupNudge();
  await sync.syncNow();
  if (sync.status.state === 'ok') toast('同步完成，日記已存到雲端');
}

function bindCloud() {
  $('cloud-sync').addEventListener('click', async () => {
    await sync.syncNow();
    if (sync.status.state === 'ok') toast('同步完成');
  });
  $('cloud-signout').addEventListener('click', async () => {
    if (!window.confirm('確定要登出嗎？這台裝置上的日記會保留，但之後的變動不會再同步到雲端。')) return;
    await cloud.signOut();
    sync.reset();
    renderCloud();
    updateBackupNudge();
    toast('已登出');
  });
  $('cloud-delete').addEventListener('click', async () => {
    if (!window.confirm('確定要刪除帳號嗎？雲端上的日記、願景板與照片會全部刪除，無法復原。\n這台裝置上的資料會保留。')) return;
    const btn = $('cloud-delete');
    btn.disabled = true;
    try {
      await cloud.deleteAccount();
      sync.reset();
      toast('已刪除帳號與雲端資料');
    } catch (e) {
      toast(`刪除失敗：${e.message}`);
    } finally {
      btn.disabled = false;
      renderCloud();
      updateBackupNudge();
    }
  });
  renderCloud();
  if (cloud.getSession()) {
    sync.syncNow();
    refreshName();
    pushRef();
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshName());
}

/* ---------- 從哪裡來（分享連結的 UTM） ---------- */

const REF_KEY = 'success-journal.ref.v1';

/** 朋友從分享連結點進來：記下第一次的來源，並把網址上的 utm_ 參數拿掉 */
function captureRef() {
  const ref = parseRef(location.search);
  if (!ref) return;
  try {
    if (!localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, JSON.stringify(ref));
    history.replaceState(history.state, '', stripUtm(location.href));
  } catch {
    /* 忽略 */
  }
}

/** 登入後把來源存到帳號上（只存第一次的，之後不覆蓋），讓使用狀況頁看得到大家從哪裡來 */
async function pushRef() {
  const session = cloud.getSession();
  if (!session) return;
  let ref;
  try {
    ref = JSON.parse(localStorage.getItem(REF_KEY) || 'null');
  } catch {
    return;
  }
  if (!ref || ref.saved) return;
  try {
    if (!session.user.hasRef) await cloud.saveRef(ref);
    localStorage.setItem(REF_KEY, JSON.stringify({ ...ref, saved: true }));
  } catch {
    /* 下次再試 */
  }
}

/* ---------- 問題回報與開發者 ---------- */

/** 問題回報信：先帶好版本與裝置資訊，方便查問題（不含任何日記內容） */
function feedbackMailto() {
  const ua = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const body = [
    '想回報的問題或建議：',
    '',
    '',
    '',
    '（以下資訊可以幫助我找出問題，不需要修改）',
    `版本：${APP_VERSION}`,
    `開啟方式：${standalone ? '主畫面' : '瀏覽器'}`,
    `登入：${cloud.getSession() ? '是' : '否'}`,
    `裝置：${ua}`,
  ].join('\n');
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('成功日記 問題回報')}&body=${encodeURIComponent(body)}`;
}

function bindAbout() {
  const link = $('feedback-link');
  link.href = feedbackMailto();
  link.addEventListener('click', () => (link.href = feedbackMailto()));
  const ig = String(DEVELOPER_IG || '').replace(/^@/, '').trim();
  if (ig) {
    $('developer-ig').href = `https://www.instagram.com/${encodeURIComponent(ig)}/`;
    $('developer-ig-handle').textContent = `Instagram @${ig}`;
    $('developer-ig').hidden = false;
  }
  $('app-version').textContent = `成功日記 ${APP_VERSION}`;
}

/* ---------- 稱呼 ---------- */

const displayName = () => (state.settings.displayName || '').trim();

/** 設定稱呼；已登入時一併存到帳號上，換裝置登入也會跟著 */
function setDisplayName(value, { push = true } = {}) {
  const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  state.settings = { ...state.settings, displayName: name };
  if (push && cloud.getSession()) state.settings.namePending = true;
  saveSettings(state.settings);
  $('display-name').value = name;
  renderToday();
  if (push) pushName();
  return name;
}

async function pushName() {
  if (!cloud.getSession() || !state.settings.namePending) return;
  try {
    await cloud.saveProfile(displayName());
    state.settings = { ...state.settings, namePending: false };
    saveSettings(state.settings);
  } catch {
    /* 離線時先記著，下次再存 */
  }
}

let lastNameCheck = 0;
/** 在別的裝置改過稱呼時，這裡也跟著更新（還沒存上去的修改優先） */
async function refreshName() {
  if (!cloud.getSession() || Date.now() - lastNameCheck < 60000) return;
  lastNameCheck = Date.now();
  if (state.settings.namePending) return pushName();
  try {
    const remote = await cloud.fetchProfile();
    if (remote !== null && remote !== displayName()) setDisplayName(remote, { push: false });
  } catch {
    /* 忽略 */
  }
}

function bindDisplayName() {
  $('display-name').value = displayName();
  const save = () => {
    const before = displayName();
    const name = setDisplayName($('display-name').value);
    if (name !== before) toast(name ? `之後就叫你「${name}」囉` : '已清除稱呼');
  };
  $('display-name').addEventListener('change', save);
  $('name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('display-name').blur();
    save();
  });
}


function bindBackupAndShare() {
  $('backup-now').addEventListener('click', exportJson);
  $('backup-later').addEventListener('click', () => {
    state.settings = { ...state.settings, backupSnoozeUntil: new Date(Date.now() + 3 * DAY_MS).toISOString() };
    saveSettings(state.settings);
    updateBackupNudge();
  });
  $('share-day').addEventListener('click', shareToday);
  $('share-confirm').addEventListener('click', confirmShare);
  $('share-copy').addEventListener('click', copyShareLink);
  $('invite-review').addEventListener('click', shareInvite);
  $('invite-settings').addEventListener('click', shareInvite);
  $('share-cancel').addEventListener('click', closeShare);
  $('share-sheet').addEventListener('click', (e) => e.target === e.currentTarget && closeShare());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('share-sheet').hidden && closeShare());
  renderLastBackup();
  updateBackupNudge();
}

function init() {
  firstHref = location.href; // 先記下含 UTM 的網址，再把 UTM 從網址拿掉
  initAnalytics(state.settings.analytics !== false);
  captureRef();
  bind();
  bindBackupAndShare();
  if (!state.settings.onboarded) {
    if (Object.keys(state.entries).length) {
      state.settings = { ...state.settings, onboarded: true };
      saveSettings(state.settings);
    } else if (PLATFORM !== 'inapp') {
      startOnboarding(); // 在 LINE 等 App 裡打開時，先引導換到瀏覽器（到瀏覽器後才看新手引導）
    }
  }
  bindSettings();
  bindTags();
  bindCloud();
  bindDisplayName();
  bindJar();
  bindAbout();
  bindInstall();
  bindReminders();
  bindCourage();
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
