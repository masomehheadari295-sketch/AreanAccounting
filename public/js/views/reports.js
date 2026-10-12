/**
 * reports.js — گزارش‌ها: هر گزارش یک صفحهٔ ساده با توضیح یک‌خطی، فیلتر بازه، چاپ و CSV.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, esc, delegate } = U;

const META = {
  sales: { name: 'گزارش فروش', icon: 'i-sale', desc: 'همهٔ فاکتورهای فروش این دوره، با وضعیت پرداخت.' },
  purchases: { name: 'گزارش خرید', icon: 'i-buy', desc: 'همهٔ اسناد خرید این دوره.' },
  pl: { name: 'سود و زیان', icon: 'i-chart', desc: 'درآمد منهای بهای کالا و هزینه‌ها؛ برداشت و آورده در آن نیست.' },
  expenses: { name: 'گزارش هزینه‌ها', icon: 'i-expense', desc: 'پول‌هایی که برای راه کار داده‌اید، بر اساس نوع هزینه.' },
  receipts: { name: 'دریافت‌ها', icon: 'i-arrow-down', desc: 'پول‌هایی که در این دوره گرفته‌اید.' },
  payments: { name: 'پرداخت‌ها', icon: 'i-arrow-up', desc: 'پول‌هایی که در این دوره پرداخته‌اید.' },
  receivables: { name: 'طلب و بدهی', icon: 'i-users', desc: 'چه کسی به شما بدهکار است و شما به چه کسی.' },
  accounts: { name: 'گردش صندوق و بانک', icon: 'i-wallet', desc: 'حرکت پول در هر حساب، به تفکیک ارز.' },
  capital: { name: 'آورده و برداشت صاحب کار', icon: 'i-briefcase', desc: 'پولی که خودتان به کار اضافه یا از آن برداشته‌اید.' },
  inventory: { name: 'گردش گدام', icon: 'i-stock', desc: 'ورود و خروج کالا در این دوره، با دلیل و سند.' },
  stock: { name: 'ارزش موجودی', icon: 'i-tag', desc: 'چه کالایی، چقدر، به چه بهایی. ارزش‌گذاری: میانگین موزون.' },
  currency: { name: 'وضعیت ارزها', icon: 'i-swap', desc: 'موجودی هر ارز جدا، به‌همراه معادل افغانی.' },
  ledger: { name: 'دفتر حساب‌ها', icon: 'i-book', desc: 'روایتِ همهٔ حرکت‌های پول، رکورد به رکورد.' },
};

export default {
  name: 'reports',
  title: () => 'گزارش‌ها',
  sub: () => `<span class="muted small">آمادهٔ چاپ، PDF و فایل اکسل</span>`,
  back: true,
  async render({ root, params, query }) {
    if (!params.name) return hub(root);
    return one(root, params.name, query);
  },
};

function hub(root) {
  const groups = [
    ['فروش، خرید و سود', ['sales', 'purchases', 'pl', 'expenses']],
    ['پول و حساب‌ها', ['receipts', 'payments', 'accounts', 'receivables', 'capital']],
    ['گدام و ارز', ['inventory', 'stock', 'currency', 'ledger']],
  ];
  root.innerHTML = `<div class="wrap">
    ${groups.map(([g, names]) => card({
      title: g, class: 'card-flat',
      body: `<div class="list">${names.map((n) => row({ href: `#/reports/${n}`, icon: META[n].icon, title: META[n].name, sub: META[n].desc })).join('')}</div>`,
    })).join('')}
    ${U.note('همهٔ اعداد از همان چیزی ساخته می‌شود که شما ثبت کرده‌اید؛ هیچ عدد آماده‌ای در برنامه نیست.', 'info')}
  </div>`;
}

/* ------------------------------ یک گزارش ------------------------------ */
async function one(root, name, query) {
  const m = META[name];
  if (!m) { root.innerHTML = `<div class="wrap">${U.emptyState({ title: 'این گزارش وجود ندارد', action: btn({ label: 'فهرست گزارش‌ها', attrs: `onclick="location.hash='#/reports'"` }) })}</div>`; return; }
  document.getElementById('page-title').textContent = m.name;
  const st = {
    range: query.range || 'month',
    from: query.from || '', to: query.to || '', currency: query.currency || '',
  };
  const qs = () => {
    const p = new URLSearchParams();
    if (st.from && st.to) { p.set('from', st.from); p.set('to', st.to); } else p.set('range', st.range);
    if (st.currency) p.set('currency', st.currency);
    if (name === 'purchases') p.set('type', 'purchase');
    return p.toString();
  };
  const paint = async () => {
    let d;
    try { d = await api.get(`/api/reports/${name}?${qs()}`); }
    catch (e) {
      root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`;
      return delegate(root, { retry: paint });
    }
    const rangeText = `${fmt.date(d.from)} تا ${fmt.date(d.to)}`;
    root.innerHTML = `<div class="wrap report">
      <div class="rep-head">
        <div><h2 class="rep-title">${icon(m.icon, 'ic nano')} ${esc(m.name)}</h2>
          <p class="muted small">${esc(m.desc)}</p>
          <p class="muted small">${esc(rangeText)}</p></div>
        <div class="btn-group no-print">
          ${btn({ label: 'چاپ / PDF', icon: 'i-print', variant: 'primary', small: true, act: 'print' })}
          ${btn({ label: 'اکسل (CSV)', icon: 'i-download', variant: 'soft', small: true, act: 'csv' })}
        </div>
      </div>
      <div class="no-print">${card({
        class: 'card-flat filters-card',
        body: `<div class="filters" style="border:0;padding:0;margin:0">
          ${U.rangeChips(st.range)}
          <button type="button" class="btn btn-ghost small" data-act="open-range">${icon('i-clock', 'ic nano')} بازهٔ دلخواه${st.from && st.to ? ` (${esc(rangeText)})` : ''}</button>
          ${(name === 'sales' || name === 'purchases') ? `<select class="inp" data-act="cur" aria-label="فیلتر ارز" style="max-width:180px">
              <option value="">همهٔ ارزها</option>
              ${fmt.activeCurrencies().map((c) => `<option value="${esc(c.code)}" ${st.currency === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>` : ''}
        </div>`,
      })}</div>
      ${BODY[name](d)}
    </div>`;
    delegate(root, {
      range: (n) => { st.range = n.dataset.range; st.from = ''; st.to = ''; paint(); },
      'open-range': () => openRange(),
      print: () => window.open(`/print/report/${name}?${qs()}`, '_blank', 'noopener'),
      csv: () => { location.href = `/api/csv/${name}?${qs()}`; },
      cur: (n) => { st.currency = n.value; paint(); },
      retry: paint,
    });
  };
  await paint();
}

/* ------------------------------ اجزای مشترک ------------------------------ */
const summary = (pairs) => `<div class="summary summary-top">${pairs
  .filter(Boolean)
  .map(([k, v]) => `<div><span>${esc(k)}</span><b>${v}</b></div>`).join('')}</div>`;

const table = (heads, rows, opts = {}) => (rows.length
  ? `<div class="tablewrap card"><table class="tbl"><thead><tr>${heads.map((h, i) => `<th class="${i === 0 ? '' : 'e'}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? '' : 'e'}">${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
      ${opts.foot ? `<tfoot><tr>${opts.foot.map((c, i) => `<td class="${i === 0 ? '' : 'e'}">${c}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`
  : U.emptyState({ icon: 'i-chart', title: 'در این بازه داده‌ای نیست', text: 'بازهٔ زمانی را عوض کنید یا سند تازه ثبت کنید.' }));

const curBreak = (list) => ((list || []).length > 1 ? card({
  title: 'به تفکیک ارز',
  hint: 'مبلغ هر ارز جدا است؛ ستون معادل فقط برای مقایسه است.',
  class: 'card-flat',
  body: `<div class="cur-list">${list.map((r) => t`<div class="cur-item"><b>${esc(fmt.cur(r.currency).name)}</b>
    <span class="mono">${esc(fmt.money(r.amount ?? r.total ?? '0', r.currency))}</span>
    <i class="muted small">≈ ${esc(fmt.money(r.base ?? '0', fmt.base()))} · ${fmt.plain(r.count || 0)} سند</i></div>`).join('')}</div>`,
}) : '');

const docCell = (r, base) => t`<a href="#/${r.type === 'purchase' ? 'purchases' : 'sales'}/${r.id}">${esc(r.no)}</a>
  <br><span class="muted small">${fmt.date(r.date)}</span>`;
const amtCell = (v, cur, baseV) => `<span class="mono">${esc(fmt.money(v, cur))}</span>${cur && cur !== fmt.base() ? `<br><span class="muted small">≈ ${esc(fmt.money(baseV ?? '0', fmt.base()))}</span>` : ''}`;

const BODY = {
  sales: (d) => {
    const T = d.totals;
    return t`
      ${summary([
      ['تعداد سند', fmt.plain(T.count)],
      ['مبلغ کل', fmt.money(T.total, fmt.base())],
      ['دریافت‌شده', fmt.money(T.paid, fmt.base())],
      ['مانده', fmt.money(T.balance, fmt.base())],
      ['بهای کالا', fmt.money(T.cost, fmt.base())],
      ['سود خام', fmt.money(M.sub(M.fromDb(String(T.base_total)), M.fromDb(String(T.cost))), fmt.base())],
    ])}
      ${table(['شماره و تاریخ', 'مشتری', 'مبلغ', 'مانده'], (d.rows || []).slice(0, 200).map((r) => [
        docCell(r),
        esc(r.party_name || '—'),
        amtCell(r.total, r.currency, r.base_total),
        M.fromDb(r.balance) > 0n ? `<span class="mono amt-neg">${esc(fmt.money(r.balance, r.currency))}</span>` : '<span class="muted">تسویه</span>',
      ]), { foot: ['جمع', fmt.plain(T.count) + ' سند', fmt.money(T.total, fmt.base()), fmt.money(T.balance, fmt.base())] })}
      ${curBreak(d.by_currency)}
      ${(d.by_party || []).length ? card({
        title: 'بر اساس مشتری', hint: 'پرتقاضاترین مشتری‌های این دوره.', class: 'card-flat',
        body: table(['مشتری', 'سند', 'مبلغ'], d.by_party.slice(0, 12).map((p) => [
          t`<a href="#/parties/${p.id}">${esc(p.party_name || p.name || '—')}</a>`, fmt.plain(p.count), `<span class="mono">${esc(fmt.money(p.base ?? p.total, fmt.base()))}</span>`,
        ])),
      }) : ''}`;
  },

  purchases: (d) => {
    const T = d.totals;
    return t`
      ${summary([
      ['تعداد سند', fmt.plain(T.count)],
      ['مبلغ کل', fmt.money(T.total, fmt.base())],
      ['پرداخت‌شده', fmt.money(T.paid, fmt.base())],
      ['مانده', fmt.money(T.balance, fmt.base())],
    ])}
      ${table(['شماره و تاریخ', 'تأمین‌کننده', 'مبلغ', 'مانده'], (d.rows || []).slice(0, 200).map((r) => [
        docCell(r),
        esc(r.party_name || '—'),
        amtCell(r.total, r.currency, r.base_total),
        M.fromDb(r.balance) > 0n ? `<span class="mono amt-neg">${esc(fmt.money(r.balance, r.currency))}</span>` : '<span class="muted">تسویه</span>',
      ]), { foot: ['جمع', fmt.plain(T.count) + ' سند', fmt.money(T.total, fmt.base()), fmt.money(T.balance, fmt.base())] })}
      ${curBreak(d.by_currency)}`;
  },

  pl: (d) => {
    const net = M.fromDb(String(d.net.base));
    return t`
      <div class="pl">
        <div class="pl-row pl-main"><b>فروش</b><span class="mono">${esc(fmt.money(d.revenue.base, fmt.base()))}</span><i class="muted small">${fmt.plain(d.revenue.count)} فاکتور</i></div>
        <div class="pl-row"><b>بهای کالای فروخته‌شده</b><span class="mono">−${esc(fmt.money(d.cogs.base, fmt.base()))}</span><i class="muted small">میانگین موزون</i></div>
        <div class="pl-row pl-sub"><b>سود ناخالص</b><span class="mono">${esc(fmt.money(d.gross.base, fmt.base()))}</span></div>
        <div class="pl-row"><b>هزینه‌های کاری</b><span class="mono">−${esc(fmt.money(d.expenses.base, fmt.base()))}</span><i class="muted small">بدون برداشت صاحب کار</i></div>
        <div class="pl-row pl-total"><b>${net >= 0n ? 'سود خالص' : 'زیان خالص'}</b><span class="mono">${esc(fmt.money(d.net.base, fmt.base()))}</span>
          ${pill(net >= 0n ? 'سود' : 'زیان', net >= 0n ? 'success' : 'danger', net >= 0n ? 'i-check' : 'i-alert')}</div>
      </div>
      ${U.note('سود ناخالص ' + esc(U.pctFmt(M.pctOf(d.gross.base, d.revenue.base))) + ' از فروش است. برداشت و آوردهٔ شما اینجا حساب نشده، چون پول شخصی است نه مخارج کار.', 'info')}
      ${(d.expenses_by_category || []).length ? card({
        title: 'هزینه‌ها بر اساس نوع', class: 'card-flat',
        body: U.donut(d.expenses_by_category.slice(0, 6).map((x) => ({ label: x.name, value: String(x.base ?? x.amount) })), { center: fmt.money(d.expenses.base, fmt.base()) })
          + U.legend(d.expenses_by_category.slice(0, 6).map((x) => ({ label: x.name, value: String(x.base ?? x.amount) })), { currency: fmt.base() }),
      }) : ''}
      ${table(['ماه', 'سند', 'فروش', 'خرید'], (d.sales_by_month || []).map((r, i) => {
        const buy = (d.purchases_by_month || [])[i] || {};
        return [esc(fmt.monthLabel(r.key)), fmt.plain(r.count), `<span class="mono">${esc(fmt.money(r.base ?? r.total, fmt.base()))}</span>`, `<span class="mono">${esc(fmt.money(buy.base ?? '0', fmt.base()))}</span>`];
      }))}
      ${curBreak(d.by_currency)}`;
  },

  expenses: (d) => t`
    ${summary([['تعداد', fmt.plain(d.totals.count)], ['جمع هزینه', fmt.money(d.totals.amount, fmt.base())], ['درآمد دیگر', fmt.money(d.totals.income, fmt.base())], ['خالص این دوره', fmt.money(d.totals.base, fmt.base())]])}
    ${table(['تاریخ', 'توضیح', 'حساب', 'مبلغ'], (d.rows || []).map((r) => [
      t`<a href="#/money/${r.id}">${fmt.date(r.date)}</a>`,
      `${esc(r.title || '—')}${r.category_name ? ` <span class="muted small">· ${esc(r.category_name)}</span>` : ''}`,
      esc(r.account_name || '—'),
      amtCell(r.amount, r.currency, r.base_amount),
    ]))}
    ${(d.by_category || []).length ? card({
      title: 'خلاصه بر اساس نوع', class: 'card-flat',
      body: table(['نوع', 'تعداد', 'مبلغ'], d.by_category.map((c) => [esc(c.name), fmt.plain(c.count), `<span class="mono">${esc(fmt.money(c.base ?? c.amount, fmt.base()))}</span>`])),
    }) : ''}`,

  receipts: (d) => txReport(d, 'دریافت'),
  payments: (d) => txReport(d, 'پرداخت'),

  receivables: (d) => t`
    ${card({
      title: 'طلب از مشتریان',
      hint: 'مبلغی که هنوز از مشتری نگرفته‌اید. اگر بیش از ۳۰ روز بگذرد، در جدول «سنی» می‌بینید.',
      body: (d.customers || []).length
        ? table(['مشتری', 'سند باز', 'مانده'], d.customers.map((c) => [
          t`<a href="#/parties/${c.id}">${esc(c.name)}</a>${c.phone ? `<br><span class="muted small">${esc(c.phone)}</span>` : ''}`,
          fmt.plain(c.docs),
          amtCell(c.bal ?? c.bal_micro, c.currency || fmt.base(), c.base),
        ]))
        : U.emptyState({ icon: 'i-check', title: 'کسی بدهکار نیست', text: 'وقتی فروش نسیه ثبت کنید، اینجا فهرست می‌شود.' }),
      footer: `<a class="btn btn-ghost small" href="#/sales?unpaid=1">دیدن فاکتورهای باز</a>`,
    })}
    ${card({
      title: 'بدهی به تأمین‌کنندگان', class: 'card-flat',
      body: (d.suppliers || []).length
        ? table(['تأمین‌کننده', 'سند', 'مانده'], d.suppliers.map((c) => [
          t`<a href="#/parties/${c.id}">${esc(c.name)}</a>`, fmt.plain(c.docs), amtCell(c.bal ?? c.bal_micro, c.currency || fmt.base(), c.base),
        ]))
        : `<p class="muted small">بدهی باز ندارید.</p>`,
      footer: `<a class="btn btn-ghost small" href="#/purchases?unpaid=1">دیدن اسناد پرداخت‌نشده</a>`,
    })}
    ${agingCard('سنی شدن طلب‌ها', d.aging_in)}
    ${agingCard('سنی شدن بدهی‌ها', d.aging_out)}`,

  accounts: (d) => {
    const rows = Array.isArray(d) ? d : d.rows || [];
    if (!rows.length) return U.emptyState({ icon: 'i-wallet', title: 'حسابی ندارید', text: 'از بخش «صندوق و بانک» یک حساب بسازید.' });
    return `<div class="accgrid">${rows.map((a) => card({
      title: t`<span class="row-ic ${a.kind === 'bank' ? 'brand' : 'success'}">${icon(a.kind === 'bank' ? 'i-bank' : 'i-wallet', 'ic nano')}</span> ${esc(a.name)}`,
      action: `<span class="mono">${esc(fmt.money(a.balance, a.currency))}</span>`,
      body: t`<p class="muted small">${esc(fmt.cur(a.currency).name)} • معادل ${esc(fmt.money(a.base, fmt.base()))} • ${fmt.plain(a.entry_count)} ثبت در این بازه</p>
        ${summary([
          ['مانده اول دوره', fmt.money(a.opening, a.currency)],
          ['واریز', fmt.money(a.moved_in, a.currency)],
          ['برداشت', fmt.money(a.moved_out, a.currency)],
          ['مانده پایان', fmt.money(a.balance, a.currency)],
        ])}
        ${(a.entries || []).length ? `<div class="list mini">${a.entries.slice(-14).reverse().map((e) => row({
          arrow: false, icon: fmt.txIcon(e.type), tone: M.fromDb(String(e.amount)) >= 0n ? 'success' : 'danger',
          title: t`${esc(fmt.txLabel(e.type))}${e.memo ? ` — ${esc(e.memo)}` : ''}`, sub: fmt.date(e.date),
          right: `<span class="mono">${esc(fmt.money(e.amount, e.currency))}</span>`,
        })).join('')}</div>` : '<p class="muted small">در این بازه حرکتی نداشته است.</p>'}`,
      footer: `<a class="btn btn-ghost small" href="#/accounts/${a.id}">همهٔ گردش حساب</a>`,
    })).join('')}</div>`;
  },

  capital: (d) => t`
    ${summary([['آورده', fmt.money(d.contribution.base, fmt.base())], ['برداشت', fmt.money(d.drawing.base, fmt.base())], ['خالص سرمایهٔ شما در کار', fmt.money(d.net, fmt.base())]])}
    ${table(['تاریخ', 'نوع', 'توضیح', 'حساب', 'مبلغ'], (d.rows || []).map((r) => [
      fmt.date(r.date),
      r.type === 'drawing' ? pill('برداشت', 'warn', 'i-arrow-up') : pill('آورده', 'success', 'i-arrow-down'),
      esc(r.title || '—'), esc(r.account_name || '—'),
      amtCell(r.amount, r.currency, r.base_amount),
    ]))}
    ${U.note('این دو مورد در سود و زیان نیست. برداشت پول از جیب خودتان به جیب خودتان است — زیان کاری محسوب نمی‌شود.', 'info')}
    ${curBreak(d.by_currency)}`,

  inventory: (d) => t`
    ${summary([['تعداد حرکت', fmt.plain((d.moves || []).length)], ['کالای درگیر', fmt.plain((d.by_item || []).length)]])}
    ${(d.by_item || []).length ? table(['کالا', 'ورود', 'خروج', 'اصلاح'], d.by_item.map((r) => [
      esc(r.name),
      `<span class="mono">${esc(fmt.qty(M.fromDb(String(r.in || '0'))))}</span>`,
      `<span class="mono">${esc(fmt.qty(M.fromDb(String(r.out || '0'))))}</span>`,
      `<span class="mono">${esc(fmt.qty(M.fromDb(String(r.adjust || '0'))))}</span>`,
    ])) : ''}
    ${card({
      title: 'حرکت‌ها', hint: 'هر خط به یک سند یا دلیل متصل است.', class: 'card-flat',
      body: (d.moves || []).length
        ? table(['تاریخ', 'کالا', 'مقدار', 'دلیل / سند'], d.moves.slice(0, 200).map((mm) => [
          fmt.date(mm.date),
          t`<a href="#/stock/${mm.item_id}">${esc(mm.name || '')}</a>`,
          `<span class="mono ${M.fromDb(mm.signed) >= 0n ? 'amt-pos' : 'amt-neg'}">${M.fromDb(mm.signed) >= 0n ? '+' : ''}${esc(fmt.qty(M.fromDb(mm.signed)))} ${esc(mm.unit || '')}</span>`,
          t`${esc(mm.reason || '')}${mm.doc_no ? ` <span class="muted small">· ${esc(mm.doc_no)}</span>` : ''}`,
        ]))
        : U.emptyState({ icon: 'i-stock', title: 'حرکتی در این بازه نبوده' }),
    })}`,

  stock: (d) => table(['کالا', 'موجودی', 'میانگین بها', 'ارزش', 'قیمت فروش', 'وضعیت'], (d.items || []).map((r) => {
    const q = M.fromDb(String(r.qty));
    return [
      t`<a href="#/stock/${r.id}">${esc(r.name)}</a>${r.code ? `<br><span class="muted small">${esc(r.code)}</span>` : ''}`,
      `<span class="mono">${esc(fmt.qty(q))} ${esc(r.unit || '')}</span>`,
      `<span class="mono">${esc(fmt.money(r.avg_cost, fmt.base()))}</span>`,
      `<span class="mono">${esc(fmt.money(r.value, fmt.base()))}</span>`,
      `<span class="mono muted">${esc(fmt.money(r.retail, fmt.base()))}</span>`,
      q <= 0n ? pill('تمام شده', 'danger', 'i-close') : r.low ? pill('کم', 'warn', 'i-alert') : pill('موجود', 'success', 'i-check'),
    ];
  }), {
    foot: [
      `<b>جمع</b>`, fmt.plain(d.totals.count) + ' کالا', '',
      `<span class="mono"><b>${esc(fmt.money(d.totals.value, fmt.base()))}</b></span>`,
      `<span class="mono">${esc(fmt.money(d.totals.retail, fmt.base()))}</span>`,
      d.totals.low ? pill(d.totals.low + ' کالا کم است', 'warn', 'i-alert') : '',
    ],
  }),

  currency: (d) => t`
    ${U.note('ارزها با هم جمع نمی‌شوند. ستون «معادل» بر پایهٔ نرخی است که روی هر سند ثبت کرده‌اید — نه نرخ امروز.', 'info')}
    ${table(['ارز', 'نقد در حساب‌ها', 'طلب', 'بدهی', 'گدام', 'مانده', 'معادل ' + esc(fmt.cur(d.base_currency).name)], (d.rows || []).map((r) => [
      t`<b>${esc(r.info?.name || r.currency)}</b><br><span class="muted small">نرخ ${esc(fmt.rateStr(r.rate_today))} · ${fmt.plain(r.docs)} سند</span>`,
      `<span class="mono">${esc(fmt.money(r.cash, r.currency))}</span>`,
      `<span class="mono">${esc(fmt.money(r.receivable, r.currency))}</span>`,
      `<span class="mono">${esc(fmt.money(r.payable, r.currency))}</span>`,
      `<span class="mono muted">${esc(fmt.money(r.stock, r.currency))}</span>`,
      `<span class="mono"><b>${esc(fmt.money(r.net, r.currency))}</b></span>`,
      `<span class="mono muted">${esc(fmt.money(r.net_base, d.base_currency))}</span>`,
    ]), {
      foot: ['', '', '', '', '', 'جمع معادل‌ها', `<span class="mono"><b>${esc(fmt.money(d.totals.net_base, d.base_currency))}</b></span>`],
    })}`;
  },

  ledger: (d) => t`
    ${summary([['تعداد سطر', fmt.plain((d.rows || []).length)]])}
    ${table(['تاریخ', 'حساب', 'نوع', 'شرح', 'مبلغ'], (d.rows || []).slice(0, 400).map((r) => [
      fmt.date(r.date),
      esc(r.account_name || ''),
      esc(fmt.txLabel(r.type || '')),
      t`${esc(r.doc_no ? 'سند ' + r.doc_no : r.memo || '')}`,
      `<span class="mono ${M.fromDb(String(r.amount)) >= 0n ? 'amt-pos' : 'amt-neg'}">${esc(fmt.money(r.amount, r.currency))}</span>`,
    ]))}`,
};

const txReport = (d, label) => t`
  ${summary([['تعداد', fmt.plain(d.totals.count)], ['جمع ' + label, fmt.money(d.totals.amount, fmt.base())], ['معادل ' + fmt.cur(fmt.base()).name, fmt.money(d.totals.base, fmt.base())]])}
  ${table(['تاریخ', 'توضیح', 'حساب', 'مبلغ'], (d.rows || []).map((r) => [
    t`<a href="#/money/${r.id}">${fmt.date(r.date)}</a>`,
    `${esc(r.title || r.party_name || fmt.txLabel(r.type))}${r.doc_no ? ` <span class="muted small">· ${esc(r.doc_no)}</span>` : ''}${r.void ? ' ' + pill('لغو شده', 'muted') : ''}`,
    esc(r.account_name || '—'),
    amtCell(r.amount, r.currency, r.base_amount),
  ]))}
  ${curBreak(d.by_currency)}`;

const agingCard = (title, a) => (!a || !a.count ? '' : card({
  title, class: 'card-flat', hint: 'چند روز از سررسید گذشته است.',
  body: summary([
    ['کمتر از ۳۰ روز', fmt.money(a.buckets.current, fmt.base())],
    ['۳۰ تا ۶۰ روز', fmt.money(a.buckets.d30, fmt.base())],
    ['۶۰ تا ۹۰ روز', fmt.money(a.buckets.d60, fmt.base())],
    ['بیش از ۹۰ روز', fmt.money(a.buckets.d90, fmt.base())],
  ]),
}));

function openRange() {
  const s = U.sheet({
    title: 'بازهٔ دلخواه',
    sub: 'تاریخ‌های شمسی را انتخاب کنید',
    body: `<form class="form" data-onsubmit="go">
      <div class="grid-2">
        ${U.field({ label: 'از تاریخ', name: 'from', control: U.dateField({ name: 'from', value: fmt.today() }) })}
        ${U.field({ label: 'تا تاریخ', name: 'to', control: U.dateField({ name: 'to', value: fmt.today() }) })}
      </div>
      ${btn({ label: 'نمایش گزارش', type: 'submit', wide: true })}
    </form>`,
  });
  delegate(s.body, {
    go: (f) => {
      const v = U.readForm(f);
      if (!v.from || !v.to) return U.toast('هر دو تاریخ را انتخاب کنید.', 'warn');
      const base = location.hash.split('?')[0];
      const p = new URLSearchParams(location.hash.split('?')[1] || '');
      p.set('from', v.from); p.set('to', v.to); p.delete('range');
      s.close();
      location.hash = base + '?' + p.toString();
    },
  });
}

export { META };
