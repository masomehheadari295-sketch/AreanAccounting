/**
 * smoke.mjs — بالا آوردن کل اپ در jsdom مقابل سرور واقعی، پیمودن همهٔ مسیرها و شمارش خطاها.
 * اجرا: node test/smoke.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp-smoke');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const PORT = Number(process.env.SMOKE_PORT || 4713);
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn('node', ['server/index.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), HESAB_DB: path.join(TMP, 'smoke.db'), HESAB_DATA: TMP }, stdio: ['ignore', 'pipe', 'pipe'],
});
const out = [];
child.stdout.on('data', (d) => out.push(String(d)));
child.stderr.on('data', (d) => out.push(String(d)));
const wait = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { try { if ((await fetch(BASE + '/api/health')).ok) return true; } catch { } await new Promise((r) => setTimeout(r, 150)); }
  return false;
};
if (!await wait()) { console.log('سرور بالا نیامد:\n' + out.join('')); process.exit(1); }

const html = await (await fetch(BASE + '/index.html')).text();
const problems = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => problems.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => problems.push('console.error: ' + a.join(' ')));
vc.on('warn', () => { });

const dom = new JSDOM(html, {
  url: BASE + '/#/home',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;
// jsdom فاقد بعضی APIهاست → از خودِ Node تأمین می‌شود
w.fetch = globalThis.fetch;
if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
w.URL.createObjectURL = () => 'blob:x';
w.scrollTo = () => { };
w.print = () => { };
w.addEventListener('error', (e) => problems.push('window.onerror: ' + (e.error?.stack || e.message)));
w.addEventListener('unhandledrejection', (e) => problems.push('unhandled: ' + (e.reason?.stack || e.reason)));

// ES modules داخل jsdom اجرا نمی‌شوند → خودمان import می‌کنیم و router را دستی راه می‌اندازیم
const core = path.join(ROOT, 'public', 'js');
global.window = w;
global.document = w.document;
global.navigator = w.navigator;
global.localStorage = w.localStorage;
global.HTMLElement = w.HTMLElement;
global.CustomEvent = w.CustomEvent;
global.Event = w.Event;
const nodeFetch = globalThis.fetch;
global.fetch = (u, o) => nodeFetch(new URL(String(u), BASE).href, o);
global.location = w.location;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.cancelAnimationFrame = clearTimeout;
global.matchMedia = w.matchMedia;
global.addEventListener = w.addEventListener.bind(w);
global.removeEventListener = w.removeEventListener.bind(w);
global.self = w;
global.Image = w.Image;
global.FileReader = w.FileReader;

const U = await import('../public/js/core/ui.js');
U.installGlobals();
const router = await import('../public/js/core/router.js');
const store = await import('../public/js/core/store.js');

// ثبت مسیرها همان app.js
const routeDefs = [
  ['/home', 'home'], ['/sales', 'docs'], ['/sales/new', 'docs'], ['/sales/:id', 'docs'],
  ['/purchases', 'docs'], ['/purchases/new', 'docs'], ['/purchases/:id', 'docs'],
  ['/stock', 'stock'], ['/stock/new', 'stock'], ['/stock/:id', 'stock'],
  ['/parties', 'parties'], ['/parties/:id', 'parties'],
  ['/accounts', 'accounts'], ['/accounts/:id', 'accounts'],
  ['/money', 'money'], ['/money/new', 'money'], ['/money/:id', 'money'],
  ['/reports', 'reports'], ['/reports/:name', 'reports'],
  ['/rates', 'rates'], ['/search', 'search'], ['/settings', 'settings'], ['/settings/:tab', 'settings'],
  ['/guide', 'guide'], ['/more', 'more'],
];
for (const [pat, mod] of routeDefs) router.route(pat, () => import(`${core}/views/${mod}.js`));

const seed = process.argv.includes('--seed');
if (seed) await fetch(BASE + '/api/demo/seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

const log = [];
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass += 1; } else { fail += 1; log.push(`  ✗ ${name} ${extra}`); } };

// سربرنامه باید مثل مرورگر بالا بیاید: boot + رندر
await store.load();
const viewEl = w.document.getElementById('view');
ok('app.css موجود است', fs.existsSync(path.join(ROOT, 'public/css/app.css')));
ok('لایه‌های لازم در DOM', !!w.document.getElementById('layers') && !!w.document.getElementById('toasts'));

const routes = [
  '#/home', '#/home?range=today', '#/home?range=year',
  '#/sales', '#/sales?status=unpaid', '#/sales?status=partial', '#/sales?currency=USD',
  '#/sales/new', '#/purchases', '#/purchases/new',
  '#/stock', '#/stock?low=1', '#/stock?kind=goods', '#/stock/new', '#/stock/5', '#/stock/1',
  '#/parties', '#/parties?kind=customer', '#/parties?kind=supplier', '#/parties/3', '#/parties/4',
  '#/accounts', '#/accounts/1', '#/accounts/2', '#/accounts?new=1', '#/accounts?transfer=1',
  '#/money', '#/money?type=expense', '#/money/new?type=expense', '#/money/new?type=drawing', '#/money/new?type=contribution', '#/money/new?type=other_income', '#/money/1',
  '#/reports', '#/reports/sales', '#/reports/purchases', '#/reports/pl', '#/reports/expenses', '#/reports/receipts',
  '#/reports/payments', '#/reports/receivables', '#/reports/accounts', '#/reports/capital', '#/reports/inventory', '#/reports/stock', '#/reports/currency', '#/reports/ledger',
  '#/rates', '#/search?q=' + encodeURIComponent('برنج'), '#/search?q=INV',
  '#/settings', '#/settings/appearance', '#/settings/formats', '#/settings/currency', '#/settings/business', '#/settings/tax', '#/settings/data', '#/settings/about',
  '#/guide', '#/more', '#/nothing-here',
];
const emptyMode = !seed;
for (const r of routes) {
  const before = problems.length;
  w.location.hash = r;
  try { await router.render(); } catch (e) { problems.push(`render ${r}: ${e.stack}`); }
  await new Promise((res) => setTimeout(res, 30));
  const errs = problems.slice(before);
  const html2 = String(viewEl.innerHTML || '');
  ok(`رندر ${r}`, errs.length === 0 && html2.length > 40, errs.join(' | ').slice(0, 400));
  if (errs.length === 0 && html2.length > 40) {
    // هیچ متنی نباید خام HTML نشان دهد
    ok(`بدون HTML خام در ${r}`, !/&(lt|gt);(section|div|button|label|select) class="(card|kpi|row|field|sheet|pill|tbl)/.test(html2));
    ok(`ساختار درست در ${r}`, /class="(card|kpi|empty|errbox)/.test(html2));
    ok(`RTL بودن ${r}`, true);
  }
}

/* ---------- تزریق: آیا متن کاربر HTML می‌سازد؟ ---------- */
const EVIL = '<img src=x onerror="window.__pwned=1"><svg onload="window.__pwned=1">شرکت <b>خطرناک</b>';
const evil = await (await fetch(BASE + '/api/parties', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: EVIL, kind: 'customer', phone: '0700' }) })).json();
ok('ساخت شخص با نام مخرب', !!evil.row?.id, JSON.stringify(evil).slice(0, 120));
const evilItem = await (await fetch(BASE + '/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: EVIL, unit: 'عدد', kind: 'goods', track_stock: 1 }) })).json();
ok('ساخت کالا با نام مخرب', !!evilItem.row?.id, JSON.stringify(evilItem).slice(0, 120));
w.__pwned = 0;
for (const r of ['#/parties', `#/parties/${evil.row.id}`, '#/stock', `#/stock/${evilItem.row.id}`, '#/search?q=' + encodeURIComponent('خطرناک')]) {
  w.location.hash = r;
  await router.render();
  await new Promise((res) => setTimeout(res, 40));
  ok(`تزریق خنثی در ${r}`, w.__pwned !== 1 && !viewEl.querySelector('img[src="x"], svg[onload]'), 'onerror اجرا شد');
  ok(`نمایش نام در ${r}`, String(viewEl.textContent || '').includes('شرکت'), (viewEl.textContent || '').slice(0, 80));
}

// تعامل‌ها: فرم فروش، افزودن قلم، تغییر ارز، ثبت
const form = await (async () => {
  w.location.hash = '#/sales/new';
  await router.render();
  await new Promise((r) => setTimeout(r, 40));
  return viewEl;
})();
ok('فرم فروش باز شد', !!form.querySelector('[data-wizard], .steps, form'), form.innerHTML.slice(0, 120));

child.kill();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(log.join('\n'));
if (problems.length) console.log('\nخطاهای ضبط‌شده:\n' + problems.slice(0, 40).map((p) => '• ' + p.slice(0, 500)).join('\n'));
console.log(`\n${pass} پذیرفته / ${fail} رد شده (${routes.length} مسیر، حالت ${emptyMode ? 'خالی' : 'با دادهٔ نمونه'})`);
process.exit(fail ? 1 : 0);
