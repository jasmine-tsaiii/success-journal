// 成功日記 Plus：會員狀態、付費牆、解鎖碼輸入。

import { PLANS, verifyCode } from './license.js';
import { todayKey } from './core.js';

/** 購買頁（Portaly）網址。設定後，付費牆會出現「前往購買」按鈕。 */
export const PURCHASE_URL = '';

const KEY = 'success-journal.license.v1';
const $ = (id) => document.getElementById(id);

const FEATURES = {
  boards: '無限張願景板',
  templates: '格狀、編輯頁版型',
  palettes: '深色星空色調',
  stats: '今年／全部統計與每月表格',
  report: '年度回顧報告',
  watermark: '桌布去除浮水印',
};

const state = { plus: false, plan: null, expires: null, listeners: [] };

export const isPlus = () => state.plus;
export const onPlusChange = (fn) => state.listeners.push(fn);

function readCode() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

function writeCode(code) {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

function setState(next) {
  Object.assign(state, next);
  document.documentElement.classList.toggle('is-plus', state.plus);
  renderSettings();
  state.listeners.forEach((fn) => fn(state.plus));
}

/** 套用解鎖碼；成功時儲存 */
export async function applyCode(code, { toast } = {}) {
  const result = await verifyCode(code, { today: todayKey() });
  if (!result.ok) {
    toast?.(result.reason);
    return false;
  }
  writeCode(code.trim().replace(/\s+/g, ''));
  setState({ plus: true, plan: result.plan, expires: result.expires });
  const dlg = $('plus-dialog');
  if (dlg?.open) dlg.close ? dlg.close() : dlg.removeAttribute('open');
  toast?.(`已開通成功日記 Plus（${PLANS[result.plan].name}${result.expires ? `，到 ${result.expires.replaceAll('-', '.')}` : ''}）`);
  return true;
}

function renderSettings() {
  const status = $('plus-status');
  if (!status) return;
  if (state.plus) {
    const plan = PLANS[state.plan]?.name || 'Plus';
    status.textContent = state.expires ? `已開通・${plan}・有效至 ${state.expires.replaceAll('-', '.')}` : `已開通・${plan}・永久使用`;
  } else {
    status.textContent = state.expired ? `方案已到期（${state.expired.replaceAll('-', '.')}）。輸入新的解鎖碼即可續用。` : '目前為免費版。';
  }
  $('plus-remove').hidden = !state.plus;
  $('plus-buy-settings').hidden = state.plus;
}

/** 顯示付費牆 */
export function showPaywall(feature) {
  const dlg = $('plus-dialog');
  $('plus-reason').textContent = feature && FEATURES[feature] ? `「${FEATURES[feature]}」是 Plus 功能` : '解鎖完整的成功日記';
  $('plus-buy').hidden = !PURCHASE_URL;
  $('plus-soon').hidden = !!PURCHASE_URL;
  $('plus-code').value = '';
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open', '');
}

/** 需要 Plus 的動作：是會員就回傳 true，否則顯示付費牆 */
export function requirePlus(feature) {
  if (state.plus) return true;
  showPaywall(feature);
  return false;
}

export async function initPlus({ toast }) {
  const dlg = $('plus-dialog');
  const close = () => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
  $('plus-close').addEventListener('click', close);
  dlg.addEventListener('click', (e) => e.target === dlg && close());
  for (const id of ['plus-buy', 'plus-buy-settings']) {
    $(id).addEventListener('click', () => {
      if (PURCHASE_URL) window.open(PURCHASE_URL, '_blank', 'noopener');
      else showPaywall();
    });
  }
  $('plus-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await applyCode($('plus-code').value, { toast })) close();
  });
  $('plus-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await applyCode($('plus-settings-code').value, { toast })) $('plus-settings-code').value = '';
  });
  $('plus-remove').addEventListener('click', () => {
    if (!window.confirm('確定要移除這台裝置上的解鎖碼嗎？之後可以再輸入同一組解鎖碼開通。')) return;
    writeCode('');
    setState({ plus: false, plan: null, expires: null });
  });
  $('plus-open').addEventListener('click', () => showPaywall());

  // 從購買後收到的連結開啟：#unlock=解鎖碼（App 已開著時只會觸發 hashchange）
  const unlockFromHash = async () => {
    const m = /[#&]unlock=([^&]+)/.exec(location.hash);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    await applyCode(decodeURIComponent(m[1]), { toast });
    return true;
  };
  window.addEventListener('hashchange', unlockFromHash);
  if (await unlockFromHash()) return;

  const saved = readCode();
  if (saved) {
    const result = await verifyCode(saved, { today: todayKey() });
    if (result.ok) setState({ plus: true, plan: result.plan, expires: result.expires });
    else setState({ plus: false, expired: result.expired ? result.expires : null });
  } else {
    setState({ plus: false });
  }
}
