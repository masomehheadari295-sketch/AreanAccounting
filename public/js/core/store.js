/**
 * store.js — وضعیت برنامه: تنظیمات، فرهنگ‌ها (اشخاص، حساب‌ها، کالاها)، تم و صف آفلاین.
 */
import api from './api.js';
import * as fmt from './fmt.js';
import M from '../lib/money.js';

export const state = {
  boot: null,
  loading: false,
  error: null,
  route: '',
  offline: !navigator.onLine,
};
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = (what = 'change') => subs.forEach((f) => f(what));

export async function load(force = false) {
  if (state.boot && !force) return state.boot;
  state.loading = true; emit('loading');
  try {
    state.boot = await api.get('/api/bootstrap');
    state.error = null;
    applyAppearance();
    fmt.setSettings({ ...state.boot.settings, currencies: state.boot.currencies });
    fmt.setDictionaries({ currencies: state.boot.currencies });
    return state.boot;
  } catch (e) {
    state.error = e;
    throw e;
  } finally {
    state.loading = false;
    emit('loaded');
  }
}

export const boot = () => state.boot || {};
export const settings = () => state.boot?.settings || fmt.settings();
export const currencies = () => state.boot?.currencies || [];
export const activeCurrencies = () => currencies().filter((c) => c.active !== 0);
export const accounts = () => state.boot?.accounts || [];
export const methods = () => state.boot?.methods || [];
export const parties = () => state.boot?.parties_short || [];
export const items = () => state.boot?.items_short || [];
export const categories = (kind) => (state.boot?.categories || []).filter((c) => !kind || c.kind === kind);
export const findParty = (id) => parties().find((p) => p.id === +id);
export const findItem = (id) => items().find((i) => i.id === +id);
export const findAccount = (id) => accounts().find((a) => a.id === +id);
export const findMethod = (id) => methods().find((m) => m.id === +id);
export const currencyName = (code) => fmt.cur(code).name || code;
export const currencySymbol = (code) => fmt.cur(code).symbol || code;

/** آخرین نرخ ثبت‌شده برای ارز (برای پیش‌پرکردن فرم — کاربر می‌تواند تغییرش دهد) */
export function lastRate(code) {
  if (!code || code === fmt.base()) return M.SCALE;
  const row = (state.boot?.latest_rates || []).find((r) => r.code === code);
  if (row) return M.fromDb(row.rate);
  const c = currencies().find((x) => x.code === code);
  return c ? M.fromDb(c.rate) : M.SCALE;
}

export async function refreshDictionaries() {
  await load(true);
  emit('dict');
}

/* ---------------- appearance ---------------- */
function readableOn(hex) {
  const m = String(hex || '#2f6df6').replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#10203c' : '#ffffff';
}
function mix(hex, withHex, ratio) {
  const p = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex); const [r2, g2, b2] = p(withHex);
  const c = (a, b) => Math.round(a + (b - a) * ratio).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
export function applyAppearance() {
  const st = settings();
  const r = document.documentElement;
  const theme = st.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : (st.theme || 'light');
  r.dataset.theme = theme;
  r.dataset.font = st.font || 'vazirmatn';
  r.style.setProperty('--brand', st.brand || '#2f6df6');
  r.style.setProperty('--brand-ink', readableOn(st.brand || '#2f6df6'));
  r.style.setProperty('--brand-soft', mix(st.brand || '#2f6df6', theme === 'dark' ? '#0e1420' : '#ffffff', theme === 'dark' ? 0.78 : 0.86));
  r.style.setProperty('--accent', st.accent || '#0ea5a4');
  r.style.setProperty('--radius', `${st.radius ?? 18}px`);
  r.style.setProperty('--fs-scale', String(st.font_scale ?? 1));
  r.style.setProperty('--blur', `${Math.round(14 * (st.glass ?? 1))}px`);
  r.style.setProperty('--glass-a', String(0.62 + 0.16 * (1 - (st.glass ?? 1))));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d1420' : '#eef3fb');
  const title = document.getElementById('biz-name');
  if (title) title.textContent = st.business?.name || 'کسب‌وکار من';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (settings().theme === 'auto') applyAppearance(); });

/* ---------------- نوشتن با پیام موفقیت و به‌روزرسانی ---------------- */
export async function mutate(method, path, body, opts = {}) {
  const { success, reload = ['dict'], quiet = false } = opts;
  const say = async (msg, kind = 'success', ms = 3600) => { const U = await import('./ui.js'); U.toast(msg, kind, ms); };
  try {
    const res = await api[method](path, body);
    if (res?.queued) { if (!quiet) await say('این عملیات در صف آفلاین ماند؛ به‌محض اتصال ثبت می‌شود.', 'warn', 5200); }
    else if (success && !quiet) await say(success);
    for (const r of reload) {
      if (r === 'dict') await refreshDictionaries();
      else emit(r);
    }
    if (!res?.queued) emit('data');
    return res;
  } catch (e) {
    if (!quiet) await say(e.userMessage || e.message || 'ذخیره نشد', 'danger', 6000);
    throw e;
  }
}

/** شمارشگرهای ساده برای پیام‌ها */
export const nf = (v, dec = 0) => M.fmt(typeof v === 'bigint' ? v : M.fromDb(String(v ?? '0')), { decimals: dec, group: settings().group, digits: settings().digits });
export const moneyOf = (v, code) => fmt.money(v, code);
export const baseOf = (v, rate) => M.mul(M.fromDb(String(v ?? '0')), M.fromDb(String(rate ?? M.SCALE)));
