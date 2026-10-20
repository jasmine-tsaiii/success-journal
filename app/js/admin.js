// 管理者的使用狀況頁：用成功日記的登入狀態，向資料庫要整體統計數字（不含任何日記內容）。

import { cloudConfigured, fetchAdminStats, getSession } from './cloud.js';
import { loadSettings } from './storage.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('zh-TW');
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

const theme = loadSettings().theme;
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

function kpis(el, items) {
  el.textContent = '';
  for (const [label, value, sub, raw] of items) {
    const box = document.createElement('div');
    box.className = 'kpi';
    const v = document.createElement('p');
    v.className = 'kpi-value';
    v.textContent = raw ? value : fmt(value);
    const l = document.createElement('p');
    l.className = 'kpi-label';
    l.textContent = label;
    box.append(v, l);
    if (sub) {
      const s = document.createElement('p');
      s.className = 'kpi-sub';
      s.textContent = sub;
      box.appendChild(s);
    }
    el.appendChild(box);
  }
}

/**
 * 直條圖：points = [{ label, value, detail }]。
 * 點一下（或滑過、用鍵盤選）任一根，上方會顯示那一天／那一週的數字；預設顯示最後一根。
 */
function columns(el, points, unit) {
  el.textContent = '';
  const readout = document.createElement('p');
  readout.className = 'chart-readout';
  readout.setAttribute('aria-live', 'polite');
  const plot = document.createElement('div');
  plot.className = 'col-chart';
  plot.setAttribute('role', 'group');
  el.append(readout, plot);
  const max = Math.max(1, ...points.map((p) => p.value));
  const cols = [];
  const select = (i) => {
    cols.forEach((c, k) => {
      c.classList.toggle('on', k === i);
      c.setAttribute('aria-pressed', String(k === i));
    });
    readout.textContent = points[i].detail;
  };
  points.forEach((p, i) => {
    const col = document.createElement('button');
    col.type = 'button';
    col.className = 'col';
    col.setAttribute('aria-label', p.detail);
    const bar = document.createElement('span');
    bar.className = 'col-bar';
    bar.style.height = p.value ? `${Math.max(3, (p.value / max) * 100)}%` : '0';
    const x = document.createElement('span');
    x.className = 'col-x';
    x.textContent = p.label;
    col.append(bar, x);
    col.addEventListener('click', () => select(i));
    col.addEventListener('mouseenter', () => select(i));
    col.addEventListener('focus', () => select(i));
    plot.appendChild(col);
    cols.push(col);
  });
  // 最高值標在格線上，讓人一眼知道刻度
  const top = document.createElement('span');
  top.className = 'col-max';
  top.textContent = `最高 ${fmt(max)} ${unit}`;
  plot.appendChild(top);
  if (points.length) select(points.length - 1);
}

function hbars(el, rows, total) {
  el.textContent = '';
  const max = Math.max(1, ...rows.map((r) => r.value));
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tag-bar';
    row.setAttribute('role', 'listitem');
    row.title = `${r.label}：${fmt(r.value)} 人`;
    row.innerHTML = '<span class="tag-bar-label"></span><span class="tag-bar-track"><span class="tag-bar-fill"></span></span><span class="tag-bar-value"></span><span></span>';
    row.children[0].textContent = r.label;
    row.querySelector('.tag-bar-fill').style.width = `${(r.value / max) * 100}%`;
    row.children[2].textContent = `${fmt(r.value)}・${pct(r.value, total)}%`;
    el.appendChild(row);
  }
}

const md = (iso) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
};
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const wd = (iso) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const rate = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '–');

export function render(s) {
  const u = s.users;
  const w = s.writing;
  kpis($('kpi-users'), [
    ['使用人數', u.total, `近 30 天新加入 ${fmt(u.new30)} 人`],
    ['近 7 天有使用', u.active7, `${pct(u.active7, u.total)}%`],
    ['近 30 天有使用', u.active30, `${pct(u.active30, u.total)}%`],
    ['今天有寫', w.today_writers, ''],
  ]);
  kpis($('kpi-writing'), [
    ['紀錄天數', w.entry_days, u.total ? `平均每人 ${(w.entry_days / u.total).toFixed(1)} 天` : ''],
    ['成功小事', w.wins, w.entry_days ? `平均每天 ${(w.wins / w.entry_days).toFixed(1)} 件` : ''],
    ['感恩', w.thanks, ''],
    ['回答引導問題', w.reflections, ''],
    ['願景板', w.boards, ''],
  ]);
  columns(
    $('chart-daily'),
    s.daily.map((d, i) => ({
      label: (s.daily.length - 1 - i) % 7 === 0 ? md(d.date) : '',
      value: d.writers,
      detail: `${md(d.date)}（週${wd(d.date)}）${i === s.daily.length - 1 ? '今天' : ''}：${fmt(d.writers)} 人有寫・${fmt(d.wins)} 件小成功`,
    })),
    '人',
  );
  const weekLabel = (x) => `${md(x.week)}–${md(addDays(x.week, 6))}`;
  const weekTick = (i) => ((s.weekly.length - 1 - i) % 2 === 0 ? md(s.weekly[i].week) : '');
  columns(
    $('chart-writers'),
    s.weekly.map((x, i) => ({ label: weekTick(i), value: x.writers, detail: `${weekLabel(x)} 那週：${fmt(x.writers)} 人有寫・共 ${fmt(x.entry_days)} 篇` })),
    '人',
  );
  columns(
    $('chart-new'),
    s.weekly.map((x, i) => ({ label: weekTick(i), value: x.new_users, detail: `${weekLabel(x)} 那週：${fmt(x.new_users)} 人新加入` })),
    '人',
  );

  // 留存與黏著度
  const r = s.retention || {};
  kpis($('kpi-retention'), [
    ['第一週回來寫', rate(r.week1_returned, r.week1_cohort), `開始寫的 7 天內又回來寫・${fmt(r.week1_returned)}／${fmt(r.week1_cohort)} 人`, true],
    ['第二週還在寫', rate(r.week2_returned, r.week2_cohort), `開始寫後第 8–14 天有寫・${fmt(r.week2_returned)}／${fmt(r.week2_cohort)} 人`, true],
    ['黏著度', rate(r.daily_avg7, r.writers30), `近 7 天平均每天 ${r.daily_avg7 ?? 0} 人寫 ÷ 近 30 天有寫的 ${fmt(r.writers30)} 人`, true],
    ['正在連續 3 天以上', r.streak3, '', false],
    ['沉睡中', r.dormant, '寫過 3 天以上，但已 14 天沒寫', false],
  ]);
  const d = s.depth;
  hbars(
    $('chart-depth'),
    [
      { label: '還沒寫', value: d.none },
      { label: '1 天', value: d.d1 },
      { label: '2–6 天', value: d.d2_6 },
      { label: '7–29 天', value: d.d7_29 },
      { label: '30 天以上', value: d.d30 },
    ],
    u.total,
  );
  const f = s.features;
  hbars(
    $('chart-features'),
    [
      { label: '感恩日記', value: f.thanks },
      { label: '引導問題', value: f.reflections },
      { label: '願景板', value: f.boards },
    ],
    u.total,
  );
  const SOURCE_NAME = { direct: '直接進入', thanks_card: '感謝卡', invite_card: '邀請卡', day_card: '分享的小成功' };
  hbars(
    $('chart-sources'),
    (s.sources || []).map((x) => ({ label: SOURCE_NAME[x.medium] || x.medium, value: x.users })),
    u.total,
  );
  const t = new Date(s.generated_at);
  $('admin-updated').textContent = `更新於 ${t.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

async function load() {
  const msg = $('admin-msg');
  if (!cloudConfigured() || !getSession()) {
    msg.innerHTML = '';
    msg.append('請先在成功日記的「設定」用 Google 登入，再回到這頁。');
    const a = document.createElement('a');
    a.href = './';
    a.textContent = '前往登入 →';
    msg.append(' ', a);
    return;
  }
  msg.hidden = false;
  msg.textContent = '讀取中⋯⋯';
  try {
    render(await fetchAdminStats());
    msg.hidden = true;
    $('admin-body').hidden = false;
  } catch (err) {
    $('admin-body').hidden = true;
    msg.textContent = err.message || '讀取失敗，請稍後再試';
  }
}

$('admin-refresh').addEventListener('click', load);
load();
