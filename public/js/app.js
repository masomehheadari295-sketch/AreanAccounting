/**
 * app.js — راه‌اندازی پوسته: منوی کشویی، نوار پایین، دکمهٔ کارهای سریع، اتصال، PWA.
 */
import { route, start, render, go } from './core/router.js';
import * as store from './core/store.js';
import * as U from './core/ui.js';
import api, { flush, pending, onNet, isOnline } from './core/api.js';
import * as fmt from './core/fmt.js';
import M from './lib/money.js';

const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export const SECTIONS = [
  { key: 'home', label: 'خانه', icon: 'i-home', href: '#/home', tab: true, order: 0 },
  { key: 'sales', label: 'فروش', icon: 'i-sale', href: '#/sales', tab: true, order: 1, sub: 'فاکتورها و دریافت‌ها' },
  { key: 'purchases', label: 'خرید', icon: 'i-buy', href: '#/purchases', tab: true, order: 2, sub: 'اسناد خرید و پرداخت‌ها' },
  { key: 'stock', label: 'گدام', icon: 'i-stock', href: '#/stock', tab: true, order: 3, sub: 'کالاها، موجودی و گردش' },
  { key: 'parties', label: 'مشتریان و تأمین‌کنندگان', icon: 'i-users', href: '#/parties', order: 4, sub: 'اطلاعات تماس و ماندهٔ حساب' },
  { key: 'money', label: 'صندوق و بانک', icon: 'i-wallet', href: '#/accounts', order: 5, sub: 'موجودی نقدی، انتقال و کارمزد' },
  { key: 'tx', label: 'هزینه، برداشت و آورده', icon: 'i-expense', href: '#/money', order: 6, sub: 'پول‌هایی که درآمد یا فروش نیست' },
  { key: 'rates', label: 'نرخ ارز', icon: 'i-swap', href: '#/rates', order: 7, sub: 'ثبت نرخ برای تبدیل و گزارش‌ها' },
  { key: 'reports', label: 'گزارش‌ها', icon: 'i-chart', href: '#/reports', order: 8, sub: 'فروش، سود و زیان، بدهی‌ها و موجودی' },
  { key: 'search', label: 'جست‌وجو', icon: 'i-search', href: '#/search', order: 9 },
  { key: 'settings', label: 'تنظیمات و ظاهر', icon: 'i-cog', href: '#/settings', order: 10, sub: 'ارز، فونت، رنگ، فاکتور و پشتیبان' },
];
const TABS = SECTIONS.filter((s) => s.tab);

/* ---------------- ناوبری ---------------- */
function drawTabbar() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map((s) => `
    <a class="tab" href="${s.href}" data-key="${s.key}" aria-label="${s.label}">
      <svg class="ic"><use href="#${s.icon}"/></svg><span>${s.label}</span>
    </a>`).join('');
}
function drawDrawer() {
  const nav = document.getElementById('drawer-nav');
  const path = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  nav.innerHTML = SECTIONS.map((s) => `
    <a class="dnav ${s.key === path ? 'on' : ''}" href="${s.href}" data-key="${s.key}" ${s.key === path ? 'aria-current="page"' : ''}>
      <span class="dnav-ic"><svg class="ic"><use href="#${s.icon}"/></svg></span>
      <span class="dnav-txt"><b>${s.label}</b>${s.sub ? `<i>${s.sub}</i>` : ''}</span>
      ${s.key === path ? '<span class="dnav-flag">بخش فعلی</span>' : ''}
    </a>`).join('');
  const d = new Date();
  const today = store.boot().today || fmt.today();
  document.getElementById('biz-date').innerHTML = `${escHtml(fmt.dateLong(today))}${store.boot().stats ? ` • ${fmt.plain(store.boot().stats.sales)} فروش، ${fmt.plain(store.boot().stats.purchases)} خرید` : ''}`;
}
export function syncNav() {
  const path = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'home';
  const key = ['sales', 'purchases', 'stock', 'home'].includes(path) ? path : path === 'parties' ? 'parties' : null;
  document.querySelectorAll('#tabbar .tab').forEach((a) => {
    const on = a.dataset.key === (key || 'more');
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  drawDrawer();
  document.getElementById('drawer').classList.toggle('hide-on-tab', ['home', 'sales', 'purchases', 'stock'].includes(path));
  document.getElementById('fab').hidden = path === 'settings';
}
addEventListener('hashchange', syncNav);

/* ---------------- منوی کشویی ---------------- */
const drawer = () => document.getElementById('drawer');
export function openDrawer() {
  const d = drawer();
  d.classList.add('open');
  document.getElementById('scrim').hidden = false;
  document.getElementById('btn-menu').setAttribute('aria-expanded', 'true');
  d.setAttribute('aria-hidden', 'false');
  d.querySelector('a')?.focus();
}
export function closeDrawer() {
  drawer().classList.remove('open');
  document.getElementById('scrim').hidden = true;
  document.getElementById('btn-menu').setAttribute('aria-expanded', 'false');
  drawer().setAttribute('aria-hidden', 'true');
}

/* ---------------- کارهای سریع ---------------- */
const QUICK = [
  { label: 'ثبت فروش', sub: 'فاکتور نو', icon: 'i-sale', href: '#/sales/new', tone: 'success' },
  { label: 'ثبت خرید', sub: 'سند خرید نو', icon: 'i-buy', href: '#/purchases/new', tone: 'brand' },
  { label: 'ثبت هزینه', sub: 'کرایه، معاش و…', icon: 'i-expense', href: '#/money/new?type=expense', tone: 'warn' },
  { label: 'دریافت از مشتری', sub: 'ثبت پرداخت روی فاکتور', icon: 'i-wallet', href: '#/sales?tab=open', tone: 'accent' },
  { label: 'افزودن کالا', sub: 'تعریف کالا یا خدمت', icon: 'i-stock', href: '#/stock/new', tone: 'brand' },
  { label: 'برداشت صاحب سرمایه', icon: 'i-briefcase', href: '#/money/new?type=drawing', tone: 'muted' },
];
function quickSheet() {
  const s = U.sheet({
    title: 'کارهای سریع',
    sub: 'پرتکرارترین کارها در یک نگاه',
    body: `<div class="quick">${QUICK.map((q) => `
      <a class="quick-item quick-${q.tone}" href="${q.href}" data-quick>
        <span class="quick-ic"><svg class="ic"><use href="#${q.icon}"/></svg></span>
        <b>${q.label}</b><i>${q.sub || ''}</i></a>`).join('')}</div>`,
  });
  s.root.addEventListener('click', (e) => { if (e.target.closest('[data-quick]')) s.close(); });
}

/* ---------------- اتصال / آفلاین ---------------- */
function netChip() {
  const chip = document.getElementById('conn-chip');
  const txt = document.getElementById('conn-text');
  const q = pending();
  const online = isOnline();
  chip.className = 'chip ' + (online ? (q ? 'chip-warn' : 'chip-ok') : 'chip-danger');
  chip.querySelector('use').setAttribute('href', online ? (q ? '#i-clock' : '#i-check') : '#i-offline');
  txt.textContent = !online ? 'آفلاین' : q ? `${M.toFaDigits(String(q))} کار در صف` : 'متصل';
  chip.title = !online ? 'بدون اینترنت می‌توانید دیدن کنید؛ ثبت‌ها در صف می‌ماند.' : q ? 'این کارها پس از اتصال ثبت می‌شوند.' : 'همه‌چیز ذخیره شد';
}
onNet(async (s) => {
  if (s === 'online') {
    const r = await flush();
    if (r.sent) { U.toast(`${M.toFaDigits(String(r.sent))} عملیات در صف، حالا ثبت شد.`, 'success'); await store.refreshDictionaries(); render(); }
  }
  netChip();
});

/* ---------------- PWA ---------------- */
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = document.getElementById('btn-install');
  b.hidden = false;
  b.onclick = async () => {
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice.catch(() => ({}));
    if (r.outcome === 'accepted') U.toast('برنامه به صفحهٔ اصلی اضافه شد.', 'success');
    deferredPrompt = null;
    b.hidden = true;
  };
});
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* ---------------- شروع ---------------- */
async function bootUp() {
  U.installGlobals();
  drawTabbar();
  drawDrawer();
  syncNav();
  netChip();
  setInterval(netChip, 12000);

  document.getElementById('btn-menu').addEventListener('click', () => (drawer().classList.contains('open') ? closeDrawer() : openDrawer()));
  document.getElementById('btn-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('scrim').addEventListener('click', closeDrawer);
  document.getElementById('drawer-nav').addEventListener('click', (e) => { if (e.target.closest('a')) setTimeout(closeDrawer, 60); });
  document.getElementById('fab').addEventListener('click', quickSheet);
  document.getElementById('btn-search').addEventListener('click', () => go('/search'));
  document.getElementById('btn-back').addEventListener('click', () => (history.length > 1 ? history.back() : go('/home')));
  document.getElementById('btn-theme').addEventListener('click', async () => {
    const st = store.settings();
    const next = st.theme === 'dark' ? 'light' : st.theme === 'light' ? 'auto' : 'dark';
    await store.mutate('post', '/api/settings', { theme: next }, { success: `حالت نمایش: ${({ dark: 'تیره', light: 'روشن', auto: 'پیروی از سیستم' })[next]}`, reload: [] });
    store.applyAppearance();
  });

  try {
    await store.load(true);
  } catch (e) {
    document.getElementById('view').innerHTML = U.t`
      <div class="wrap"><div class="errbox" role="alert">
        <span class="err-ic">${U.icon('i-alert')}</span>
        <div><h4>اتصال به داده‌ها برقرار نشد</h4>
        <p>${e.message || 'سرور پاسخ نمی‌دهد.'}</p>
        <p class="muted small">اگر برنامه را روی گوشی نصب کرده‌اید، اینترنت را بررسی کنید؛ آخرین داده‌ها را می‌توانید ببینید.</p></div>
        <button class="btn btn-soft small" onclick="location.reload()">تلاش دوباره</button></div></div>`;
  }
  route('/home', () => import('./views/home.js'));
  route('/sales', () => import('./views/docs.js'));
  route('/sales/new', () => import('./views/docs.js'));
  route('/sales/:id', () => import('./views/docs.js'));
  route('/purchases', () => import('./views/docs.js'));
  route('/purchases/new', () => import('./views/docs.js'));
  route('/purchases/:id', () => import('./views/docs.js'));
  route('/stock', () => import('./views/stock.js'));
  route('/stock/new', () => import('./views/stock.js'));
  route('/stock/:id', () => import('./views/stock.js'));
  route('/parties', () => import('./views/parties.js'));
  route('/parties/:id', () => import('./views/parties.js'));
  route('/accounts', () => import('./views/accounts.js'));
  route('/accounts/:id', () => import('./views/accounts.js'));
  route('/money', () => import('./views/money.js'));
  route('/money/new', () => import('./views/money.js'));
  route('/money/:id', () => import('./views/money.js'));
  route('/reports', () => import('./views/reports.js'));
  route('/reports/:name', () => import('./views/reports.js'));
  route('/rates', () => import('./views/rates.js'));
  route('/search', () => import('./views/search.js'));
  route('/settings', () => import('./views/settings.js'));
  route('/settings/:tab', () => import('./views/settings.js'));
  route('/guide', () => import('./views/guide.js'));
  route('/more', () => import('./views/more.js'));
  start();
  store.subscribe(() => syncNav());
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (a) { U.closeSheetAll?.(); }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); go('/search'); }
});
bootUp();
export { M };
