/**
 * e2e.js — آزمون سناریوهای اصلی. سرور را با پایگاه دادهٔ موقت خودش اجرا می‌کند،
 * سناریوها را روی API واقعی می‌زند و در پایان سرور را می‌بندد.
 * اجرا: node test/e2e.js
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'test', '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const PORT = Number(process.env.TEST_PORT || 4711);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const child = process.env.BASE_URL ? null : spawn('node', ['server/index.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), HESAB_DB: path.join(TMP, 'test.db'), HESAB_DATA: TMP }, stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
if (child) { child.stdout.on('data', (d) => serverLog.push(d.toString())); child.stderr.on('data', (d) => serverLog.push(d.toString())); }

async function waitUp(ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}


let pass = 0, fail = 0;
const log = (...a) => console.log(...a);
function ok(name, cond, extra = '') {
  if (cond) { pass++; log('  ✔', name); } else { fail++; log('  ✘', name, extra); }
}
async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (!r.ok && r.status < 400) return { status: r.status, body: json, transportError: text.slice(0, 300) };
  if (r.status >= 500) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(json).slice(0, 400)}`);
  return { status: r.status, body: json };
}

const run = async () => {
  if (!(await waitUp())) { console.error('سرور بالا نیامد:\n' + serverLog.join('')); process.exit(3); }
  log('\n== سلامت و شروع ==');
  const h = await api('GET', '/api/health');
  ok('سرور پاسخ می‌دهد', h.body.ok === true);
  const b = await api('GET', '/api/bootstrap');
  ok('bootstrap: تنظیمات و ارزها', !!b.body.settings && Array.isArray(b.body.currencies));

  log('\n== آماده‌سازی: ارز، حساب، شخص، کالا ==');
  await api('POST', '/api/rates', { code: 'USD', rate: '70' });
  let accs = (await api('GET', '/api/accounts')).body.rows;
  let cash = accs.find((a) => a.name === 'صندوق تست');
  if (!cash) cash = (await api('POST', '/api/accounts', { name: 'صندوق تست', kind: 'cash', currency: 'AFN', opening: '100000' })).body.row;
  let usd = accs.find((a) => a.name === 'بانک دالر تست');
  if (!usd) usd = (await api('POST', '/api/accounts', { name: 'بانک دالر تست', kind: 'bank', currency: 'USD', opening: '500' })).body.row;
  ok('حساب‌ها ساخته/یافته شدند', !!cash && !!usd);

  const cust = (await api('POST', '/api/parties', { name: 'مشتری آزمون', kind: 'customer', phone: '0700000001' })).body.row;
  const sup = (await api('POST', '/api/parties', { name: 'تأمین‌کننده آزمون', kind: 'supplier' })).body.row;
  ok('شخص‌ها ثبت شدند', !!cust.id && !!sup.id);

  let items = (await api('GET', '/api/items?q=برنج+آزمون')).body.rows;
  let item = items[0];
  if (!item) item = (await api('POST', '/api/items', { name: 'برنج آزمون', code: 'TST-' + Date.now(), unit: 'کیلو', kind: 'goods', buy_price: '40', sell_price: '55', track_stock: true, min_qty: '5' })).body.row;
  ok('کالا ثبت شد', !!item.id);

  log('\n== ۱) خرید با افزایش موجودی ==');
  const pur = (await api('POST', '/api/docs', {
    type: 'purchase', party_id: sup.id, currency: 'AFN', paid: '1000', account_id: cash.id,
    items: [{ item_id: item.id, qty: '100', unit_price: '40', update_stock: true }],
  })).body.doc;
  ok('سند خرید با شماره یکتا', /^PUR-\d{4}-\d{4}$/.test(pur.no), pur.no);
  ok('جمع سند خرید = ۴۰۰۰', pur.total === '4000000000', pur.total);
  ok('مانده خرید = ۳۰۰۰ و وضعیت جزئی', pur.balance === '3000000000' && pur.status === 'partial', `${pur.balance}/${pur.status}`);
  let st0 = (await api('GET', `/api/items/${item.id}`)).body;
  ok('موجودی پس از خرید = ۱۰۰', Number(st0.qty) === 100 * 1e6, st0.qty);
  ok('میانگین بها = ۴۰', Number(st0.avg_cost) === 40 * 1e6, st0.avg_cost);

  log('\n== ۲) فروش نسیه + دریافت جزئی ==');
  const sale = (await api('POST', '/api/docs', {
    type: 'sale', party_id: cust.id, currency: 'AFN',
    items: [{ item_id: item.id, qty: '30', unit_price: '55' }, { name: 'حمل', qty: '1', unit_price: '200', update_stock: false }],
    fee: '50', tax_enabled: true, tax_percent: '2',
  })).body.doc;
  ok('جمع اقلام = ۱۸۵۰', sale.subtotal === '1850000000', sale.subtotal);
  ok('مالیات ۲٪ روی جمع اقلام (۱۸۵۰) = ۳۷', sale.tax === '37000000', sale.tax);
  ok('کل سند = ۱۸۵۰ + ۳۷ + ۵۰ = ۱۹۳۷', sale.total === '1937000000', sale.total);
  ok('وضعیت پرداخت‌نشده', sale.status === 'unpaid' && sale.balance === sale.total, sale.status);
  const afterSale = (await api('GET', `/api/items/${item.id}`)).body;
  ok('موجودی پس از فروش = ۷۰', Number(afterSale.qty) === 70 * 1e6, afterSale.qty);
  ok('بهای تمام‌شدهٔ سند = ۳۰×۴۰ = ۱۲۰۰', sale.cost === '1200000000', sale.cost);
  const rec1 = await api('POST', `/api/docs/${sale.id}/payment`, { amount: '500', account_id: cash.id, note: 'قسط اول' });
  ok('دریافت جزئی ثبت شد', rec1.body.tx && rec1.body.tx.amount === '500000000');
  ok('سند → پرداخت جزئی', rec1.body.doc.status === 'partial', rec1.body.doc.status);
  ok('مانده سند = ۱۴۳۷', rec1.body.doc.balance === '1437000000', rec1.body.doc.balance);
  const over = await api('POST', `/api/docs/${sale.id}/payment`, { amount: '99999', account_id: cash.id });
  ok('پرداخت بیش از مانده رد می‌شود (۴۰۹)', over.status === 409, JSON.stringify(over.body).slice(0, 120));
  const rec2 = await api('POST', `/api/docs/${sale.id}/payment`, { amount: '1437', account_id: cash.id });
  ok('تسویهٔ کامل → پرداخت‌شده', rec2.body.doc.status === 'paid' && rec2.body.doc.balance === '0', `${rec2.body.doc.status}/${rec2.body.doc.balance}`);
  ok('وضعیت سند پرداخت‌شده در برگشت خوانده می‌شود', (await api('GET', `/api/docs/${sale.id}`)).body.status === 'paid');

  log('\n== ۳) لغو دریافت و برگشت ==');
  const voidRes = await api('POST', `/api/tx/${rec2.body.tx.id}/void`, { reason: 'اشتباه وارد شد' });
  ok('لغو دریافت، سند را دوباره جزئی می‌کند', voidRes.body.tx && (await api('GET', `/api/docs/${sale.id}`)).body.status === 'partial');
  await api('POST', `/api/docs/${sale.id}/payment`, { amount: '1437', account_id: cash.id });

  log('\n== ۴) چندارزی: فروش به دالر ==');
  const usdSale = (await api('POST', '/api/docs', {
    type: 'sale', party_id: cust.id, currency: 'USD', rate: '72',
    items: [{ item_id: item.id, qty: '10', unit_price: '10' }], account_id: usd.id, pay_full: true,
  })).body.doc;
  ok('کل ۱۰۰ دالر', usdSale.total === '100000000', usdSale.total);
  ok('معادل افغانی با نرخ ۷۲ = ۷۲۰۰', usdSale.base_total === '7200000000', usdSale.base_total);
  // تغییر نرخ نباید سند قبلی را عوض کند
  await api('POST', '/api/rates', { code: 'USD', rate: '80' });
  const again = (await api('GET', `/api/docs/${usdSale.id}`)).body;
  ok('نرخ تازه روی سند قبلی اثر ندارد', again.base_total === '7200000000' && again.rate === '72000000', `${again.base_total}/${again.rate}`);
  const cur = (await api('GET', '/api/reports/currency')).body;
  const usdRow = cur.rows.find((r) => r.currency === 'USD');
  ok('نقدی دالر = اول دوره ۵۰۰ + فروش ۱۰۰', usdRow && Number(usdRow.cash) === 600 * 1e6, usdRow && usdRow.cash);

  log('\n== ۵) هزینه، برداشت، آورده ==');
  const cats = (await api('GET', '/api/categories?kind=expense')).body.rows;
  const exp = (await api('POST', '/api/tx', { type: 'expense', amount: '1200', currency: 'AFN', account_id: cash.id, category_id: cats[0].id, title: 'کرایه' })).body.tx;
  ok('هزینه ثبت شد', exp.id > 0);
  const draw = (await api('POST', '/api/tx', { type: 'drawing', amount: '300', currency: 'AFN', account_id: cash.id })).body.tx;
  const cont = (await api('POST', '/api/tx', { type: 'contribution', amount: '1000', currency: 'AFN', account_id: cash.id })).body.tx;
  ok('برداشت و آورده ثبت شد', !!draw.id && !!cont.id);
  const pl = (await api('GET', '/api/reports/pl?from=1900-01-01&to=2999-01-01')).body;
  const big = (x) => BigInt(x || 0);
  ok('سود = فروش − بها تمام‌شده − هزینه', big(pl.net.base) === big(pl.revenue.base) - big(pl.cogs.base) - big(pl.expenses.base),
    `${pl.net.base} vs ${big(pl.revenue.base) - big(pl.cogs.base) - big(pl.expenses.base)}`);
  const cap = (await api('GET', '/api/reports/capital?from=1900-01-01&to=2999-01-01')).body;
  ok('آورده و برداشت از سود جداست', cap.contribution.amount === '1000000000' && cap.drawing.amount === '300000000', JSON.stringify(cap.totals || {}).slice(0, 80));

  log('\n== ۶) انتقال بین حساب با کارمزد ==');
  const tr = (await api('POST', '/api/tx', { type: 'transfer', amount: '2000', currency: 'AFN', account_id: cash.id, to_account_id: usd.id, to_rate: '80' })).body.tx;
  ok('مبلغ دریافتی در حساب مقصد = ۲۵ دالر', tr.to_amount === '25000000', tr.to_amount);
  const accAfter = (await api('GET', '/api/accounts')).body.rows;
  const cashAfter = accAfter.find((a) => a.id === cash.id);
  const usdAfter = accAfter.find((a) => a.id === usd.id);
  const ledg = (await api('GET', '/api/reports/ledger?from=1900-01-01&to=2999-12-31')).body.rows.filter((r) => r.account_id === cash.id && r.currency === 'AFN');
  const ledgSum = BigInt(cash.opening) + ledg.reduce((t, r) => t + BigInt(r.amount), 0n);
  ok('موجودی صندوق = اول دوره + جمع دفتر روزنامهٔ همان حساب', BigInt(cashAfter.balance) === ledgSum, `${cashAfter.balance} vs ${ledgSum}`);
  ok('دریافت‌های فروش در صندوق نشسته است', ledgSum > BigInt(cash.opening) - 2000n * 1000000n, String(ledgSum));
  ok('حساب دالر ۶۲۵ دالر شد (۵۰۰ + ۱۰۰ فروش + ۲۵ انتقال)', Number(usdAfter.balance) === 625 * 1e6, String(usdAfter.balance));

  log('\n== ۷) اصلاح موجودی و هشدار کمبود ==');
  const before = Number((await api('GET', `/api/items/${item.id}`)).body.qty);
  const mv = await api('POST', `/api/items/${item.id}/move`, { kind: 'adjust', qty: '5', decrease: true, reason: 'شمارش انبار' });
  ok('اصلاح موجودی ثبت شد', Number(mv.body.after) === before - 5 * 1e6, `${before} → ${mv.body.after}`);
  const mv2 = await api('POST', `/api/items/${item.id}/move`, { kind: 'waste', qty: '1', reason: 'ضایعات' });
  ok('ضایعات ثبت شد', Number(mv2.body.after) === before - 6 * 1e6, mv2.body.after);
  const noReason = await api('POST', `/api/items/${item.id}/move`, { kind: 'waste', qty: '1' });
  ok('تغییر بی‌دلیل رد می‌شود (۴۰۰)', noReason.status === 400, JSON.stringify(noReason.body).slice(0, 120));
  await api('POST', `/api/items/${item.id}/move`, { kind: 'adjust', qty: '50', reason: 'کاهش به زیر حد مجاز', decrease: true });
  const inv = (await api('GET', '/api/inventory?low=1')).body;
  ok('هشدار کمبود موجودی فعال شد', inv.items.some((i) => i.id === item.id && i.low), JSON.stringify(inv.items.map((i) => [i.name, i.qty])));
  const verify = (await api('POST', '/api/verify')).body;
  ok('راستی‌آزمایی: موجودی با گردش سازگار است', verify.mismatches.length === 0, JSON.stringify(verify.mismatches));

  log('\n== ۸) فاکتور چاپی ==');
  const html = await (await fetch(`${BASE}/print/doc/${sale.id}`)).text();
  ok('صفحه چاپ شامل شماره سند و مشتری', html.includes(sale.no) && html.includes('مشتری آزمون'));
  ok('برچسب وضعیت فارسی در چاپ', html.includes('پرداخت'), html.slice(0, 80));
  ok('چاپ بدون افکت شیشه‌ای', !/backdrop-filter/.test(html));
  const repHtml = await (await fetch(`${BASE}/print/report/sales?from=1900-01-01&to=2999-12-31`)).text();
  ok('چاپ گزارش فروش', repHtml.includes('گزارش فروش'));
  const csvBuf = Buffer.from(await (await fetch(`${BASE}/api/csv/expenses?from=1900-01-01&to=2999-12-31`)).arrayBuffer());
  const csvText = csvBuf.toString('utf8');
  ok('خروجی CSV با BOM برای فارسی در Excel', csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf && csvText.includes('کرایه'), csvText.slice(0, 60));

  log('\n== ۹) ویرایش، جست‌وجو، لغو سند ==');
  const stBeforeEdit = (await api('GET', `/api/items/${item.id}`)).body;
  const blocked = await api('PUT', `/api/docs/${pur.id}`, { currency: 'AFN', items: [{ item_id: item.id, qty: '1', unit_price: '1' }] });
  ok('ویرایش سندِ دارای دریافت/پرداخت مسدود است', blocked.status === 400 && /دریافت/.test(blocked.body.error), JSON.stringify(blocked.body).slice(0, 120));
  const pur2 = (await api('POST', '/api/docs', { type: 'purchase', party_id: sup.id, currency: 'AFN', items: [{ item_id: item.id, qty: '100', unit_price: '40', update_stock: true }] })).body.doc;
  const upd = await api('PUT', `/api/docs/${pur2.id}`, { currency: 'AFN', items: [{ item_id: item.id, qty: '50', unit_price: '40', update_stock: true }] });
  ok('ویرایش خرید، مبلغ سند را تازه می‌کند', upd.body.doc && upd.body.doc.total === '2000000000', JSON.stringify(upd.body).slice(0, 160));
  const stMidEdit = (await api('GET', `/api/items/${item.id}`)).body;
  ok('ویرایش سند (۱۰۰→۵۰) موجودی را ۵۰ واحد اضافه کرد، نه ۱۰۰', Number(stMidEdit.qty) === Number(stBeforeEdit.qty) + 50 * 1e6, `${stBeforeEdit.qty} → ${stMidEdit.qty}`);
  const stAfterEdit = (await api('GET', `/api/items/${item.id}`)).body;
  await api('POST', '/api/stock/rebuild');
  const stRebuilt = (await api('GET', `/api/items/${item.id}`)).body;
  ok('موجودی پس از ویرایش با بازسازی از گردش هم‌خوان است', stRebuilt.qty === stAfterEdit.qty, `${stAfterEdit.qty} vs ${stRebuilt.qty}`);
  const cancelled = await api('POST', `/api/docs/${pur2.id}/cancel`, { reason: 'خرید لغو شد' });
  ok('لغو سند با ثبت دلیل', cancelled.body.doc.status === 'cancelled' && cancelled.body.doc.cancel_reason === 'خرید لغو شد');
  const stAfterCancel = (await api('GET', `/api/items/${item.id}`)).body;
  ok('موجودی پس از لغو سند برگشت خورد (۵۰ واحد کمتر)', Number(stAfterCancel.qty) === Number(stAfterEdit.qty) - 50 * 1e6, `${stAfterEdit.qty}→${stAfterCancel.qty}`);
  const se = (await api('GET', `/api/search?q=${encodeURIComponent(sale.no)}`)).body;
  ok('جست‌وجوی شماره سند', se.docs.length >= 1);
  const dl = (await api('GET', `/api/docs?type=sale&q=${encodeURIComponent('مشتری آزمون')}`)).body;
  ok('فیلتر فاکتورها بر اساس نام مشتری', dl.rows.length >= 1 && dl.total >= 1);

  log('\n== ۱۰) داشبورد و مانده‌ها ==');
  const dash = (await api('GET', '/api/dashboard?range=all')).body;
  ok('داشبورد شاخص‌ها را از دادهٔ واقعی می‌سازد', Number(dash.kpis.sales_period.base) > 0 && Number(dash.kpis.purchases_period.base) > 0, JSON.stringify(dash.kpis).slice(0, 160));
  ok('بدهی به تأمین‌کننده در داشبورد دیده می‌شود', Number(dash.kpis.payable) > 0, String(dash.kpis.payable));
  ok('طلب از مشتری (پس از تسویهٔ کامل) صفر است', Number(dash.kpis.receivable) === 0, String(dash.kpis.receivable));
  ok('سود تخمینی = فروش − بها تمام‌شده − هزینه', Number(dash.kpis.profit) === Number(dash.kpis.sales_period.base) - Number((await api('GET', '/api/reports/pl?from=1900-01-01&to=2999-12-31')).body.cogs.base) - Number((await api('GET', '/api/reports/pl?from=1900-01-01&to=2999-12-31')).body.expenses.base), JSON.stringify({ p: dash.kpis.profit }));
  ok('داشبورد نمودار ماهانه/روزانه دارد', Array.isArray(dash.series) && dash.series.length > 0);
  const partyRows = (await api('GET', '/api/parties?kind=customer')).body.rows;
  ok('ماندهٔ مشتری در فهرست طرف‌ها محاسبه شده', partyRows[0] && Array.isArray(partyRows[0].balances) && partyRows[0].balances.length > 0, JSON.stringify(partyRows[0]?.balances));
  const ledger = (await api('GET', '/api/reports/ledger?from=1900-01-01&to=2999-12-31')).body;
  ok('دفتر روزنامه پر است', ledger.rows.length > 3);

  log('\n== ۱۱) حذف‌های محافظت‌شده ==');
  const delAcc = await api('DELETE', `/api/accounts/${cash.id}`);
  ok('حذف حسابِ دارای حرکت رد می‌شود', delAcc.status === 409);
  const delItem = await api('DELETE', `/api/items/${item.id}`);
  ok('حذف کالای دارای سند رد می‌شود', delItem.status === 409);
  const delParty = await api('DELETE', `/api/parties/${cust.id}`);
  ok('حذف شخصِ دارای سند رد می‌شود', delParty.status === 409);

  log('\n== ۱۲) تنظیمات ==');
  const setRes = await api('POST', '/api/settings', { brand: '#ff5a5a', theme: 'dark', digits: 'fa', decimals_money: 0, business: { name: 'دکان آزمون' } });
  ok('ذخیره تنظیمات', setRes.body.settings.brand === '#ff5a5a' && setRes.body.settings.business.name === 'دکان آزمون');
  const html2 = await (await fetch(`${BASE}/print/doc/${sale.id}`)).text();
  ok('چاپ، نام تازهٔ کسب‌وکار را نشان می‌دهد', html2.includes('دکان آزمون'));
  ok('تاریخ در چاپ با ارقام فارسی', /[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/.test(html2), html2.match(/تاریخ:[^<]*/)?.[0]);
  await api('POST', '/api/settings', { digits: 'en', theme: 'auto', brand: '#2f6df6', business: { name: 'کسب‌وکار من' } });

  log(`\nنتیجه: ${pass} پذیرفته، ${fail} رد شده\n`);
  if (fail) process.exitCode = 1;
};

run().then(() => { if (child) child.kill('SIGTERM'); if (fail) process.exitCode = 1; })
  .catch((e) => { console.error('خطای آزمون:', e.message, '\n--- سرور ---\n' + serverLog.join('').slice(-2500)); if (child) child.kill('SIGTERM'); process.exitCode = 2; });
