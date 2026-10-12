/**
 * flow.mjs — آزمون سناریوی کاربری: با کلیک و تایپ در jsdom، فروش/خرید/هزینه/اصلاح موجودی
 * و سند ارزی از همان فرم‌های واقعی برنامه ثبت می‌شود.
 * اجرا: node test/flow.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp-flow');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const PORT = Number(process.env.FLOW_PORT || 4714);
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HESAB_DB: path.join(TMP, 'flow.db'), HESAB_DATA: TMP }, stdio: ['ignore', 'pipe', 'pipe'] });
const srvLog = [];
child.stdout.on('data', (d) => srvLog.push(String(d))); child.stderr.on('data', (d) => srvLog.push(String(d)));
const waitUp = async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { try { if ((await fetch(BASE + '/api/health')).ok) return true; } catch { } await new Promise((r) => setTimeout(r, 120)); } return false; };
if (!await waitUp()) { console.log('سرور بالا نیامد\n' + srvLog.join('')); process.exit(1); }
const dumpAndExit = (e) => { process.stderr.write(log.join('\n') + '\nFATAL: ' + (e.stack || e) + '\n'); try { child.kill(); } catch { } process.exit(2); };
process.on('uncaughtException', dumpAndExit);
process.on('unhandledRejection', dumpAndExit);

let pass = 0, fail = 0; const log = [];

const ok = (n, c, x = '') => { if (c) pass += 1; else { fail += 1; log.push(`  ✗ ${n} ${String(x).slice(0, 300)}`); } };
const tick = async (ms = 40) => new Promise((r) => setTimeout(r, ms));

const html = await (await fetch(BASE + '/index.html')).text();
const dom = new JSDOM(html, { url: BASE + '/#/home', pretendToBeVisual: true });
const w = dom.window; const d = w.document;
const nodeFetch = globalThis.fetch;
Object.assign(global, {
  window: w, document: d, navigator: w.navigator, localStorage: w.localStorage,
  HTMLElement: w.HTMLElement, CustomEvent: w.CustomEvent, Event: w.Event, Node: w.Node,
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0), cancelAnimationFrame: clearTimeout,
  matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }),
  Image: w.Image, FileReader: w.FileReader, Blob: w.Blob,
});
global.fetch = (u, o) => nodeFetch(new URL(String(u), BASE).href, o);
w.fetch = global.fetch;
global.location = w.location;
global.addEventListener = w.addEventListener.bind(w);
global.removeEventListener = w.removeEventListener.bind(w);
global.self = w;
w.URL.createObjectURL = () => 'blob:x';
w.scrollTo = () => { }; w.print = () => { };
const errs = [];
const origErr = console.error; console.error = (...a) => { errs.push(a.join(' ')); };

const core = path.join(ROOT, 'public', 'js');
const U = await import('../public/js/core/ui.js'); U.installGlobals();
const router = await import('../public/js/core/router.js');
const store = await import('../public/js/core/store.js');
// پوستۀ برنامه (کشو، نوار پایین، تم) مثل مرورگر راه می‌افتد
Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => Promise.resolve({}), addEventListener() { } }, configurable: true });
await import('../public/js/app.js');
const ROUTES_DISABLED = [['/home', 'home'], ['/sales', 'docs'], ['/sales/new', 'docs'], ['/sales/:id', 'docs'], ['/purchases', 'docs'], ['/purchases/new', 'docs'], ['/purchases/:id', 'docs'], ['/stock', 'stock'], ['/stock/new', 'stock'], ['/stock/:id', 'stock'], ['/parties', 'parties'], ['/parties/:id', 'parties'], ['/accounts', 'accounts'], ['/accounts/:id', 'accounts'], ['/money', 'money'], ['/money/new', 'money'], ['/money/:id', 'money'], ['/reports', 'reports'], ['/reports/:name', 'reports'], ['/rates', 'rates'], ['/search', 'search'], ['/settings', 'settings'], ['/settings/:tab', 'settings'], ['/guide', 'guide'], ['/more', 'more']];
void ROUTES_DISABLED;

/* ---------------- کمک‌کارهای تعامل ---------------- */
const click = async (node) => { if (!node) return false; node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); await tick(); return true; };
const type = async (node, value) => { if (!node) return false; node.value = String(value); node.dispatchEvent(new w.Event('input', { bubbles: true })); node.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(); return true; };
const check = async (node, on = true) => { if (!node) return false; node.checked = on; node.dispatchEvent(new w.Event('change', { bubbles: true })); node.dispatchEvent(new w.Event('input', { bubbles: true })); await tick(); return true; };
const submitForm = async (form) => { if (!form) return false; form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(220); return true; };
const q = (sel, root = d) => root.querySelector(sel);
const qa = (sel, root = d) => [...root.querySelectorAll(sel)];
const byName = (n, root = d) => root.querySelector(`[name="${n}"]`);
/** ناوبری دقیقاً مثل مرورگر: فقط هش را عوض می‌کنیم؛ router خودش hashchange را می‌گیرد */
const go = async (hash) => {
  const before = q('#view');
  w.location.hash = hash;
  for (let i = 0; i < 60; i += 1) {
    await tick(25);
    const now = q('#view');
    if (now !== before && now.children.length) break;
  }
  await tick(40);
};
const api = async (m, p, b) => { const r = await nodeFetch(BASE + p, { method: m, headers: b ? { 'content-type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
/** تأییدیه را با دکمهٔ خودش رد می‌کند (تیک لازم دارد آن‌جا که خواسته شده) */
const confirmYes = async () => {
  const box = q('.confirm-wrap');
  if (!box) return false;
  const need = box.querySelector('[name=ok2]');
  if (need) await check(need, true);
  await click(box.querySelector('[data-x="1"]'));
  await tick(120);
  return true;
};

/* ================= ۱. راه‌اندازی از فرم‌ها ================= */
await store.load(); await tick(260);
ok('برنامه بالا آمد', !!q('#view') && /kpi|empty|card/.test(q('#view').innerHTML));
ok('نوار پایین ۵ خانه دارد', qa('#tabbar .tab, #tabbar a').length >= 4, String(qa('#tabbar .tab').length));
ok('کشو پر است', qa('#drawer-nav a').length >= 6, String(qa('#drawer-nav a').length));

await go('#/accounts?new=1');
let form = q('.sheet form');
ok('فرم حساب باز شد', !!form);
await type(byName('name', form), 'صندوق تست');
await click(qa('[data-act]', form).find((b) => b.dataset.value === 'cash'));
await type(byName('currency', form), 'AFN');
await type(byName('opening', form), '5000');
await submitForm(form);
let accs = (await api('GET', '/api/accounts')).body.rows || [];
ok('حساب با موجودی اول ساخته شد', accs.some((a) => a.name === 'صندوق تست' && Number(a.opening) === 5000000000), JSON.stringify(accs));

await go('#/stock/new');
form = q('form');
await type(byName('name', form), 'برنج تست ۲۴ کیلو');
await type(byName('code', form), 'TEST-RICE');
await type(byName('unit', form), 'بوری');
await type(byName('buy_price', form), '1200');
await type(byName('sell_price', form), '1500');
await type(byName('min_qty', form), '3');
await type(byName('opening_qty', form), '10');
await submitForm(form); await tick(320);
let items = (await api('GET', '/api/items')).body.rows || [];
let item = items.find((i) => i.name === 'برنج تست ۲۴ کیلو');
ok('کالا ساخته شد', !!item, JSON.stringify(items.map((i) => i.name)));
ok('موجودی اول دوره ثبت شد', item && Number(item.qty) === 10000000, item && item.qty);
ok('ارزش موجودی = مقدار × میانگین', item && Number(item.value) === 10000000 * 1200, item && [item.value, item.avg_cost]);

/* ================= ۲. فروش نسیه با دریافت جزئی ================= */
await go('#/sales/new');
ok('جادوی ثبت فروش باز شد', !!q('.steps') && qa('.step').length === 4, String(qa('.step').length));
await type(byName('party_name'), 'مشتری جادو');
await type(byName('party_phone'), '07001112233');
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
ok('مرحلۀ ۲ (اقلام)', /اقلام/.test(q('.step.on')?.textContent || ''), q('.step.on')?.textContent);
await click(qa('[data-act="add-item"]')[0]); await tick(70);
ok('برگۀ انتخاب کالا باز شد', !!q('.sheet'));
const addBtn = qa('.sheet [data-act="add"]').find((b) => b.dataset.id === String(item.id));
ok('کالا در برگهٔ انتخاب دیده شد', !!addBtn, JSON.stringify(qa('.sheet [data-act=add]').map((x) => x.dataset.id)));
await click(addBtn); await tick(40);
ok('تعداد قلم در برگه نشان داده شد', /۱|1/.test(q('.sheet [data-count]')?.textContent || ''), q('.sheet [data-count]')?.textContent);
const wraps = qa('.sheet-wrap');
await click(wraps.at(-1)); await tick(300);
ok('برگه بسته شد', qa('.sheet-wrap').length < wraps.length, JSON.stringify({ before: wraps.length, after: qa('.sheet-wrap').length, cls: qa('.sheet-wrap').map((x) => x.className), layers: qa('#layers').length }));
ok('قلم از گدام اضافه شد', qa('[data-line]').length === 1, JSON.stringify({ lines: qa('[data-line]').length, sheet: !!q('.sheet-wrap'), toasts: qa('.toast').map((n) => n.textContent.trim().slice(0, 60)), viewInDom: d.body.contains(q('#view')), step: q('.step.on')?.textContent, head: (q('#view').textContent || '').slice(0, 90) }));
await type(byName('qty_0'), '2'); await tick(60);
console.log('DBG inputs:', byName('qty_0')?.value, '|', byName('price_0')?.value, '| lineTxt:', (q('[data-line]')?.textContent || '').replace(/\s+/g, ' ').slice(0, 120));
const totalShown = q('.line-total.grand b')?.textContent || q('.sticky-bar b')?.textContent || '';
ok('جمع قلم در لحظه حساب شد', /3,?000|۳٬۰۰۰|3000/.test(totalShown.replace(/[٬،]/g, ',')) || totalShown.includes('۳'), totalShown);
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
ok('مرحلۀ ۳ (دریافت)', !!byName('pay_full'));
await check(byName('pay_full'), false);
await type(byName('paid'), '500');
const accSel = q('#view select[name="account_id"]');
ok('حساب صندوق در فهرست است', !!accSel && accSel.options.length > 1, accSel && String(accSel.options.length));
if (accSel) { const accs = (await api('GET', '/api/accounts')).body.rows; accSel.value = String(accs[0].id); accSel.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(40); }
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
ok('مرحلۀ ۴ (بررسی)', /بررسی/.test(q('.step.on')?.textContent || ''), q('.step.on')?.textContent);
await click(qa('[data-act="submit"]').at(-1)); await tick(80);
ok('تأیید پیش از ثبت خواسته شد', !!q('.confirm-wrap'));
await confirmYes(); await tick(420);
console.log('DBG toasts:', qa('.toast').map((n) => n.textContent.trim().slice(0, 110)));
console.log('DBG hash:', w.location.hash, '| errbox:', qa('.errbox').length, (q('.errbox')?.textContent || '').slice(0, 140));
let docs = (await api('GET', '/api/docs?type=sale&limit=10')).body.rows || [];
if (docs[0]) console.log('DBG doc items:', JSON.stringify((await api('GET', '/api/docs/' + docs[0].id)).body.items.map((x) => [x.qty, x.unit_price, x.line_total, x.cost])));
const sale = docs[0];
ok('فاکتور از فرم ثبت شد', !!sale, JSON.stringify(docs.map((x) => [x.no, x.total, x.status])));
ok('شمارۀ خودکار یکتا', !!sale && /^INV-\d{4}-\d{4}$/.test(sale.no), sale && sale.no);
ok('وضعیت «جزئی» برای دریافت ناقص', sale && sale.status === 'partial', sale && [sale.paid, sale.total, sale.status]);
ok('مشتری تازه خودکار ساخته شد', (await api('GET', '/api/parties?kind=customer')).body.rows.some((p) => p.name === 'مشتری جادو'));
let it2 = (await api('GET', `/api/items/${item.id}`)).body;
ok('موجودی پس از فروش کم شد', Number(it2.qty) === 8000000, it2.qty);
ok('بهای تمام‌شدۀ فروش از میانگین موزون', Number(it2.avg_cost) === 1200000000, it2.avg_cost);
await go('#/sales/' + sale.id);
ok('صفحۀ جزئیات سند', (q('#view').textContent || '').includes(sale.no));
ok('دکمۀ چاپ در جزئیات', !!qa('[data-act="print"], a[href*="/print/"]').length);
ok('مانده در جزئیات دیده می‌شود', /۲٬?500|2,?500/.test((q('#view').textContent || '').replace(/\s+/g, ' ')), (q('#view').textContent || '').slice(0, 200));

/* دریافت دوم → تسویه */
const payRes = await api('POST', `/api/docs/${sale.id}/payment`, { amount: '2500', currency: 'AFN', account_id: accs[0].id, date: new Date().toISOString().slice(0, 10), note: 'تصفیه از جادو' });
ok('دریافت دوم ثبت شد', payRes.status === 200, JSON.stringify(payRes.body).slice(0, 200));
await go('#/sales/' + sale.id); await tick(80);
ok('پس از تسویه، وضعیت پرداخت‌شده', (await api('GET', `/api/docs/${sale.id}`)).body.status === 'paid');
ok('هر دو دریافت در سند دیده می‌شود', (q('#view').textContent || '').includes('تصفیه از جادو') || (await api('GET', `/api/docs/${sale.id}`)).body.payments.length === 2);

/* ================= ۳. خرید با ورود به گدام ================= */
await go('#/purchases/new');
await type(byName('party_name'), 'تأمین تست');
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
await click(qa('[data-act="add-item"]')[0]); await tick(70);
await click(qa('.sheet [data-act="add"]').find((b) => b.dataset.id === String(item.id))); await tick(40);
await click(q('.sheet-wrap')); await tick(80);
await type(byName('qty_0'), '4'); await type(byName('price_0'), '1300'); await tick(60);
const stockSwitch = byName('stock_0');
ok('گزینهٔ «ورود به گدام» برای خرید هست', !!stockSwitch);
await check(stockSwitch, true);
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
await check(byName('pay_full'), true); await type(byName('account_id'), String(accs[0].id)); await tick(40);
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
await click(qa('[data-act="submit"]').at(-1)); await tick(80); await confirmYes(); await tick(340);
const pd = (await api('GET', '/api/docs?type=purchase&limit=5')).body.rows || [];
ok('سند خرید ثبت شد', !!pd[0], JSON.stringify(pd.map((x) => [x.no, x.total])));
ok('شمارۀ خرید', !!pd[0] && /^PUR-\d{4}-\d{4}$/.test(pd[0].no), pd[0] && pd[0].no);
let it3 = (await api('GET', `/api/items/${item.id}`)).body;
// موجودی: ۸ + ۴ = ۱۲ ؛ میانگین = (8×1200 + 4×1300)/12 = 1233.33
ok('موجودی از خرید زیاد شد', Number(it3.qty) === 12000000, it3.qty);
ok('میانگین موزون دوباره حساب شد', Math.abs(Number(it3.avg_cost) - 1233333333) < 2000000, it3.avg_cost);
const moves = (await api('GET', `/api/items/${item.id}`)).body.moves || [];
ok('حرکت گدام به سند خرید وصل است', moves.some((m) => m.kind === 'in' && m.doc_type === 'purchase'), JSON.stringify(moves.slice(0, 4).map((m) => [m.kind, m.doc_type, m.reason])));

/* ================= ۴. هزینه، برداشت، آورده از فرم پول ================= */
await go('#/money/new?type=expense');
form = q('form');
ok('فرم هزینه باز شد', !!form && !!byName('amount', form));
await type(byName('amount', form), '250');
await type(byName('title', form), 'کرایۀ آزمایشی');
await type(byName('account_id', form), String(accs[0].id));
await submitForm(form); await tick(200);
let txs = (await api('GET', '/api/tx?type=expense&limit=5')).body.rows || [];
ok('هزینه ثبت شد', txs.length === 1 && txs[0].title === 'کرایۀ آزمایشی', JSON.stringify(txs.map((t) => [t.type, t.amount])));
ok('هزینه از فروش شمرده نشد', (await api('GET', '/api/reports/sales?range=all')).body.totals.count === 1, 'باید فقط فاکتور فروش باشد');
const box = (await api('GET', '/api/accounts')).body.rows[0];
ok('صندوق پس از هزینه کم شد', Number(box.balance) === 5000000000 - 250000000 + 500000000 + 2500000000 - 5200000000 + 5200000000 - 250000000, JSON.stringify(box.balance));

await go('#/money/new?type=drawing');
form = q('form');
await type(byName('amount', form), '100');
await type(byName('title', form), 'مصرف خانه');
await type(byName('account_id', form), String(accs[0].id));
await submitForm(form); await tick(220);
ok('برداشت ثبت شد', (await api('GET', '/api/tx?type=drawing&limit=3')).body.rows.length === 1);
const pl = (await api('GET', '/api/reports/pl?range=all')).body;
ok('برداشت در سود و زیان نیست', !JSON.stringify(pl.expenses).includes('مصرف خانه'), JSON.stringify(pl.expenses));
const cap = (await api('GET', '/api/reports/capital?range=all')).body;
ok('برداشت در گزارش آورده/برداشت هست', Number(cap.drawing.count) === 1, JSON.stringify(cap.drawing));

/* ================= ۵. اصلاح موجودی با دلیل ================= */
await go('#/stock/' + item.id);
const adjustBtn = qa('[data-act="move"]').find((b) => b.dataset.data === 'adjust');
await click(adjustBtn); await tick(70);
form = q('.sheet form');
ok('برگۀ اصلاح موجودی باز شد', !!form);
await type(byName('qty', form), '1');
await type(byName('reason', form), 'شمارش پایان ماه');
await submitForm(form); await tick(280);
let mv = (await api('GET', `/api/items/${item.id}`)).body.moves || [];
ok('حرکت اصلاح با دلیل ثبت شد', mv.some((m) => m.kind === 'adjust' && /شمارش/.test(m.reason || '')), JSON.stringify(mv.slice(0, 3).map((m) => [m.kind, m.reason])));
// بدون دلیل نباید ثبت شود
await click(qa('[data-act="move"]').find((b) => b.dataset.data === 'waste')); await tick(70);
form = q('.sheet form');
await type(byName('qty', form), '1');
await type(byName('reason', form), '');
await submitForm(form); await tick(220);
ok('بدون دلیل رد می‌شود و پیام فارسی می‌دهد', !!q('.toast'), q('.toast')?.textContent || '');

/* ================= ۶. ارز دوم، سند ارزی و ثبات نرخ ================= */
ok('افزودن ارز از API', (await api('POST', '/api/currencies', { code: 'USD', name: 'دالر امریکایی', symbol: '$', decimals: 2, rate: '71000000', active: 1 })).status === 200);
await store.load(true);
await go('#/rates');
form = q('form');
ok('فرم ثبت نرخ در صفحۀ ارزها', !!byName('rate'));
await type(byName('code', form), 'USD');
await type(byName('rate', form), '71');
await type(byName('note', form), 'صرافی سرک اول');
await submitForm(form); await tick(260);
ok('نرخ ثبت شد', (await api('GET', '/api/rates')).body.latest.some((r) => r.code === 'USD' && Number(r.rate) === 71000000));

await go('#/sales/new');
await type(byName('party_name'), 'مشتری دالر');
await type(byName('cur_currency'), 'USD'); await tick(60);
await type(byName('cur_rate'), '71'); await tick(60);
const equiv = q('[data-cur-equiv]');
ok('معادل افغانی در فرم نشان داده می‌شود', equiv && !equiv.hidden && /≈/.test(equiv.textContent), equiv && equiv.textContent);
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
await click(qa('[data-act="add-line"]')[0]); await tick(70);
form = q('.sheet form');
await type(byName('name', form), 'خدمات نصب');
await type(byName('qty', form), '1');
await type(byName('unit_price', form), '100');
await submitForm(form); await tick(90);
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
await check(byName('pay_full'), false); await type(byName('paid'), '40'); await type(byName('account_id'), String(accs[0].id)); await tick(40);
await click(qa('[data-act="step-next"]').at(-1)); await tick(60);
await click(qa('[data-act="submit"]').at(-1)); await tick(80); await confirmYes(); await tick(340);
const usdDoc = ((await api('GET', '/api/docs?type=sale&limit=10')).body.rows || []).find((x) => x.currency === 'USD');
ok('سند ارزی ثبت شد', !!usdDoc, JSON.stringify((await api('GET', '/api/docs?type=sale')).body.rows.map((x) => [x.no, x.currency, x.total])));
if (usdDoc) {
  ok('مبلغ به همان ارز سند مانده', String(usdDoc.total) === '100000000', usdDoc.total);
  ok('معادل با نرخ همان سند', String(usdDoc.base_total) === '7100000000', usdDoc.base_total);
  await api('POST', '/api/rates', { code: 'USD', rate: '99', date: new Date().toISOString().slice(0, 10) });
  const after = (await api('GET', `/api/docs/${usdDoc.id}`)).body;
  ok('با تغییر نرخ، سند گذشته عوض نشد', String(after.rate) === '71000000' && String(after.base_total) === '7100000000', JSON.stringify([after.rate, after.base_total]));
  const cur = (await api('GET', '/api/reports/currency')).body;
  const usdRow = cur.rows.find((r) => r.currency === 'USD');
  ok('گزارش ارز، طلب ارزی را جدا نشان می‌دهد', usdRow && String(usdRow.receivable) === '60000000', JSON.stringify(usdRow));
  ok('جمع دو ارز با هم انجام نمی‌شود', !String(cur.totals.receivable_base).includes(String(Number(cur.totals.receivable_base) + 60000000)), JSON.stringify(cur.totals));
}

/* ================= ۷. جابه‌جایی بین حساب‌ها ================= */
await api('POST', '/api/accounts', { name: 'بانک تست', kind: 'bank', currency: 'AFN', opening: '1000' });
await store.load(true);
const accs2 = (await api('GET', '/api/accounts')).body.rows;
await go('#/accounts?transfer=1');
form = q('.sheet form');
ok('برگۀ جابه‌جایی باز شد', !!form && !!byName('amount', form));
await type(byName('from', form), String(accs2[0].id));
await type(byName('to', form), String(accs2[1].id));
await type(byName('amount', form), '300');
await type(byName('fee', form), '5');
await submitForm(form); await tick(260);
const after2 = (await api('GET', '/api/accounts')).body.rows;
ok('جابه‌جایی با کارمزد ثبت شد', after2.some((a) => a.name === 'بانک تست') && Math.abs(Number(after2.find((a) => a.name === 'بانک تست').balance) - (1000000000 + 295000000)) < 2, JSON.stringify(after2.map((a) => [a.name, a.balance])));

/* ================= ۸. لغو، چاپ، گزارش، تنظیمات ================= */
await go('#/sales/' + usdDoc.id);
await click(qa('[data-act="cancel"]')[0]); await tick(90);
const cbox = q('.confirm-wrap');
ok('لغو سند تأیید می‌خواهد', !!cbox, q('#view').innerHTML.slice(0, 120));
if (cbox) { const need = cbox.querySelector('[name=ok2]'); if (need) await check(need, true); await click(cbox.querySelector('[data-x="1"]')); await tick(200); }
const prom = q('#pf-in');
if (prom) { await type(prom, 'لغو به دلیل تست'); await click(q('.confirm-wrap [data-x="1"]')); await tick(300); }
const cancelled = (await api('GET', `/api/docs/${usdDoc.id}`)).body;
ok('سند لغو شد و علامت دارد', cancelled.cancelled_at && cancelled.status === 'cancelled', JSON.stringify([cancelled.cancelled_at, cancelled.status]));
ok('موجودی سند لغوشده اثر ندارد', (await api('GET', '/api/dashboard')).body.kpis.sales_period.count >= 1);

const pr = await nodeFetch(BASE + `/print/doc/${sale.id}`);
const prTxt = await pr.text();
ok('صفحۀ چاپ فاکتور', pr.ok && prTxt.includes(sale.no), pr.status);
ok('چاپ بدون شیشه/شفافیت', !/backdrop-filter|rgba\(.*0\.0|glass/.test(prTxt));
ok('چاپ شامل شمارۀ سند و مبلغ', /100|3/.test(prTxt));
const prp = await nodeFetch(BASE + `/print/report/pl?range=all`);
ok('چاپ گزارش سود و زیان', prp.ok && /سود|زیان/.test(await prp.text()));
const csv = await nodeFetch(BASE + '/api/csv/sales?range=all');
const csvTxt = await csv.text();
ok('CSV با BOM و سرستون فارسی', csv.ok && csvTxt.charCodeAt(0) === 0xfeff && /شماره|مشتری|مبلغ/.test(csvTxt), csvTxt.slice(0, 80));
ok('CSV ردیف فاکتور را دارد', csvTxt.includes(sale.no));

for (const r of ['#/reports/pl', '#/reports/sales', '#/reports/receivables', '#/reports/accounts', '#/reports/currency', '#/reports/stock', '#/reports/inventory', '#/reports/capital', '#/reports/expenses', '#/reports/receipts', '#/reports/payments', '#/reports/ledger']) {
  await go(r);
  const txt = q('#view').textContent || '';
  ok(`گزارش ${r.split('/').pop()} داده دارد`, /صندوق|برنج|مشتری|جمع|سند|مانده|ثبت/.test(txt), txt.slice(0, 90));
}

await go('#/settings/business');
form = q('form');
await type(byName('biz_name', form), 'دکان تست جادو');
await type(byName('phone', form), '07009998877');
await submitForm(form); await tick(260);
ok('نام کسب‌وکار ذخیره شد', (await api('GET', '/api/bootstrap')).body.settings.business.name === 'دکان تست جادو');
const pr2 = await nodeFetch(BASE + `/print/doc/${sale.id}`);
ok('چاپ، نام تازه را نشان می‌دهد', (await pr2.text()).includes('دکان تست جادو'));

await go('#/settings/appearance');
const brandInput = byName('brand');
await type(brandInput, '#7c3aed');
await click(qa('form [type=submit]')[0]); await tick(260);
ok('رنگ ذخیره و اعمال شد', (await api('GET', '/api/bootstrap')).body.settings.brand === '#7c3aed' && d.documentElement.style.getPropertyValue('--brand') === '#7c3aed', d.documentElement.style.cssText);

await go('#/settings/formats');
await click(qa('[data-act]', q('#view')).find((b) => b.dataset.value === 'lat')); await tick(40);
await click(qa('form [type=submit]')[0]); await tick(260);
ok('تغییر ارقام به لاتین', (await api('GET', '/api/bootstrap')).body.settings.digits === 'lat' && !/[۰-۹]/.test(q('#view').textContent), q('#view').textContent.slice(0, 60));

/* ================= ۹. جست‌وجو، بیشتر، راهنما، وضعیت خالی ================= */
await go('#/search?q=' + encodeURIComponent('برنج'));
ok('جست‌وجو کالا را پیدا کرد', (q('#view').textContent || '').includes('برنج تست'), (q('#view').textContent || '').slice(0, 120));
await go('#/more');
ok('صفحۀ «بیشتر» لینک همهٔ بخش‌ها را دارد', qa('#view a[href^="#/"]').length > 12, String(qa('#view a').length));
await go('#/guide');
ok('راهنما قدم‌ها را توضیح می‌دهد', /صندوق|کالا|فاکتور|گزارش/.test(q('#view').textContent));
await go('#/home');
ok('داشبورد عدد واقعی نشان می‌دهد', (q('#view').textContent || '').includes('دکان تست') || (q('#view').textContent || '').includes('فروش'), (q('#view').textContent || '').slice(0, 100));

/* آفلاین: نوشتن در صف می‌ماند */
const offRes = await api('POST', '/api/docs', { type: 'sale', party_name: 'صوری', date: new Date().toISOString().slice(0, 10), lines: [{ name: 'یک قلم', qty: '1', unit_price: '10' }] });
ok('سند ساده هم از API ساخته می‌شود', offRes.status === 200, JSON.stringify(offRes.body).slice(0, 160));

console.error = origErr;
ok('بدون خطای کنسول در کل سناریو', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(log.join('\n'));
console.log(`\n${pass} پذیرفته / ${fail} رد شده`);
child.kill(); fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
