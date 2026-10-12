/**
 * home.js — داشبورد: خلاصهٔ وضعیت کسب‌وکار با زبان ساده.
 * همهٔ عددّها از /api/dashboard و بر پایهٔ دادهٔ واقعی کاربر محاسبه می‌شود.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, kpi, btn, row, emptyState, esc } = U;

export default {
  name: 'home',
  title: () => 'خانه',
  sub: () => `<span class="muted small">${esc(fmt.dateLong(store.boot().today || fmt.today()))}</span>`,
  async render({ root, query }) {
    const st = store.settings();
    const range = query.range || 'month';
    root.innerHTML = `<div class="wrap"><div class="greet"><div><h2>در حال بارگذاری…</h2>
      <p class="muted small">شاخص‌ها از داده‌های ثبت‌شدهٔ شما حساب می‌شود</p></div></div>${U.skeleton(6)}</div>`;

    let d;
    try {
      const qs = new URLSearchParams(query.from ? { from: query.from, to: query.to } : { range });
      d = await api.get('/api/dashboard?' + qs.toString());
    } catch (e) {
      root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`;
      return U.delegate(root, { retry: () => this.render({ root, query }) });
    }
    const k = d.kpis;
    const P = [];
    const empty = (store.boot().stats?.docs || 0) === 0;

    P.push(t`
      <div class="greet">
        <div><h2>${esc(st.business?.name || 'کسب‌وکار من')}</h2>
          <p class="muted small">${esc(fmt.dateLong(d.range.from))} تا ${esc(fmt.dateLong(d.range.to))}</p></div>
        ${U.pill('نقدینگی ' + fmt.money(k.cash, 'AFN'), 'neutral', 'i-wallet')}
      </div>`);

    if (empty) P.push(onboarding());

    P.push(t`
      <div class="rangebar">
        ${U.rangeChips(range)}
        <button class="btn btn-ghost small" data-act="custom-range">${icon('i-clock', 'ic nano')} بازهٔ دلخواه</button>
      </div>`);

    P.push(t`
      <section class="kpis">
        ${kpi({ label: 'فروش امروز', value: fmt.money(k.sales_today.base, 'AFN'), sub: `${fmt.plain(k.sales_today.count)} فاکتور`, icon: 'i-sale', tone: 'success', href: '#/sales', hint: 'جمع فاکتورهایی که امروز صادر کرده‌اید (معادل افغانی).' })}
        ${kpi({ label: 'فروش این دوره', value: fmt.money(k.sales_period.base, 'AFN'), sub: `${fmt.plain(k.sales_period.count)} فاکتور`, icon: 'i-chart', tone: 'brand', hint: 'مبلغ کل فاکتورهای فروش در بازهٔ انتخابی.' })}
        ${kpi({ label: 'خرید امروز', value: fmt.money(k.purchases_today.base, 'AFN'), sub: `${fmt.plain(k.purchases_today.count)} سند`, icon: 'i-buy', tone: 'warn', href: '#/purchases', hint: 'ارزش کالاهایی که امروز خریده‌اید.' })}
        ${kpi({ label: 'خرید این دوره', value: fmt.money(k.purchases_period.base, 'AFN'), sub: `${fmt.plain(k.purchases_period.count)} سند`, icon: 'i-buy', tone: 'brand' })}
        ${kpi({ label: 'سود تخمینی', value: fmt.money(k.profit, 'AFN'), sub: 'فروش − بهاى کالا − هزینه‌ها', icon: 'i-check', tone: M.fromDb(k.profit) >= 0n ? 'success' : 'danger', badge: M.fromDb(k.profit) >= 0n ? 'سود' : 'زیان', badgeTone: M.fromDb(k.profit) >= 0n ? 'success' : 'danger', hint: 'تخمینی است: بر پایهٔ مبلغ فاکتورها و بهای تمام‌شدهٔ کالا (میانگین موزون). برداشت و آورده صاحب سرمایه در آن نیست.' })}
        ${kpi({ label: 'موجودی نقدی', value: fmt.money(k.cash, 'AFN'), sub: 'صندوق‌ها و بانک‌ها', icon: 'i-wallet', tone: 'accent', href: '#/accounts', hint: 'جمع صندوق‌ها و حساب‌های بانکی. هر ارز جدا نگه داشته می‌شود؛ این عدد معادل افغانی است.' })}
        ${kpi({ label: 'طلب از مشتریان', value: fmt.money(k.receivable, 'AFN'), sub: 'فاکتورهای وصول‌نشده', icon: 'i-arrow-down', tone: 'success', href: '#/reports/receivables?kind=customer', hint: 'پولی که مشتریان هنوز نداده‌اند.' })}
        ${kpi({ label: 'بدهی به تأمین‌کنندگان', value: fmt.money(k.payable, 'AFN'), sub: 'اسناد پرداخت‌نشده', icon: 'i-arrow-up', tone: 'danger', href: '#/reports/receivables?kind=supplier', hint: 'پولی که شما باید بپردازید.' })}
      </section>`);

    P.push(card({
      title: 'فروش و خرید در این دوره',
      hint: d.series_mode === 'month' ? 'هر ستون یک ماه شمسی است.' : 'هر ستون یک روز است.',
      action: `<span class="lg"><i class="sw sw-s"></i>فروش</span><span class="lg"><i class="sw sw-p"></i>خرید</span>`,
      body: d.series.length
        ? U.barChart(d.series.map((s) => ({ ...s, label: d.series_mode === 'month' ? fmt.monthLabel(s.key) : String(fmt.date(s.key)).slice(-5) })))
        : emptyState({ icon: 'i-chart', title: 'در این بازه چیزی ثبت نشده', text: 'نخستین فاکتور فروش را بسازید تا نمودار پر شود.', action: btn({ label: 'ثبت فروش', icon: 'i-plus', variant: 'primary', attrs: `onclick="location.hash='#/sales/new'"` }) }),
    }));

    const byCur = {};
    for (const r of d.by_currency_cash || []) {
      const c = r.currency;
      byCur[c] = byCur[c] || { currency: c, amount: 0n, base: 0n, names: [] };
      byCur[c].amount += M.fromDb(String(r.amount));
      byCur[c].base += M.fromDb(String(r.base));
      byCur[c].names.push(r.account);
    }
    P.push(card({
      title: 'نقدینگی به تفکیک ارز',
      hint: 'ارزهای متفاوت با هم جمع نمی‌شوند؛ ستون افغانی فقط برای مقایسه است.',
      body: Object.keys(byCur).length
        ? `<div class="cur-list">${Object.values(byCur).map((r) => t`
          <div class="cur-item">
            <b>${esc(fmt.cur(r.currency).name)}</b>
            <span class="mono">${esc(fmt.money(r.amount, r.currency))}</span>
            <i class="muted small">${esc(r.names.join(' + '))} • ≈ ${esc(fmt.money(r.base, 'AFN'))}</i>
          </div>`).join('')}</div>`
        : emptyState({ icon: 'i-wallet', title: 'هنوز حسابی نساخته‌اید', text: 'یک صندوق نقدی بسازید تا دریافت و پرداخت‌ها همان‌جا ثبت شود.', action: btn({ label: 'ساخت حساب', icon: 'i-plus', attrs: `onclick="location.hash='#/accounts?new=1'"` }) }),
      footer: `<a class="btn btn-soft small" href="#/accounts">رفتن به صندوق و بانک</a><a class="btn btn-ghost small" href="#/rates">نرخ ارز</a>`,
    }));

    if (d.low_stock_items?.length) {
      P.push(card({
        title: 'هشدار موجودی گدام',
        hint: 'به این کالاها برسید؛ به حد کمبود رسیده‌اند.',
        class: 'card-warn',
        body: `<div class="list">${d.low_stock_items.map((i) => row({
          icon: 'i-alert', tone: 'warn', title: U.esc(i.name),
          sub: `موجودی ${esc(fmt.qty(i.qty))} ${esc(i.unit || '')} — حداقل ${esc(fmt.qty(i.min_qty))}`,
          right: U.pill(i.out ? 'تمام شده' : 'کم است', i.out ? 'danger' : 'warn', i.out ? 'i-close' : 'i-alert'),
          href: `#/stock/${i.id}`,
        })).join('')}</div>`,
        footer: btn({ label: 'ثبت خرید این کالاها', icon: 'i-buy', variant: 'soft', attrs: `onclick="location.hash='#/purchases/new'"` }),
      }));
    }

    const open = d.open_docs || [];
    P.push(card({
      title: 'فاکتورهای باز',
      hint: 'پول این اسناد کامل گرفته/پرداخت نشده است.',
      action: `<a class="btn btn-ghost small" href="#/sales?unpaid=1">همه</a>`,
      body: open.length ? `<div class="list">${open.map((o) => row({
        icon: o.type === 'sale' ? 'i-sale' : 'i-buy', tone: o.type === 'sale' ? 'success' : 'warn',
        title: `${esc(o.no)} — ${esc(o.party_name || '')}`,
        sub: `${fmt.date(o.date)} • ${U.statusPill(o.status)}`,
        right: `<span class="mono">${esc(fmt.money(o.balance, o.currency))}</span>`,
        href: `#/${o.type === 'sale' ? 'sales' : 'purchases'}/${o.id}`,
      })).join('')}</div>` : emptyState({ icon: 'i-check', title: 'همه‌چیز تسویه شده', text: 'سند باز یا پرداخت‌نشده‌ای ندارید.' }),
    }));

    P.push(card({
      title: 'آخرین فعالیت‌ها',
      hint: 'فروش، خرید، دریافت، هزینه و تغییر موجودی.',
      action: `<a class="btn btn-ghost small" href="#/money">دفتر پول</a>`,
      body: (d.recent || []).length ? `<ul class="feed">${d.recent.slice(0, 9).map(actRow).join('')}</ul>`
        : emptyState({ icon: 'i-clock', title: 'هنوز فعالیتی ثبت نشده' }),
    }));

    root.innerHTML = `<div class="wrap">${P.join('')}</div>`;
    U.delegate(root, {
      range: (n) => { location.hash = `#/home?range=${n.dataset.range}`; },
      'custom-range': () => openRange(),
      retry: () => this.render({ root, query }),
    });
  },
};

const actRow = (a) => {
  const ic = { doc: a.type === 'sale' ? 'i-sale' : 'i-buy', tx: fmt.txIcon(a.type), move: 'i-stock' }[a.kind] || 'i-info';
  const tone = a.kind === 'move' ? 'brand' : ['expense', 'payment', 'drawing'].includes(a.type) ? 'danger' : 'success';
  const right = a.kind === 'move'
    ? `<span class="mono">${esc(fmt.qty(a.qty))} · ${esc(fmt.moveLabel(a.qty_kind))}</span>`
    : `<span class="mono">${esc(fmt.money(a.amount, fmt.base()))}</span>`;
  return `<li class="feed-item"><span class="feed-ic feed-${tone}">${icon(ic, 'ic nano')}</span>
    <span class="feed-main"><b>${esc(a.title || '')}</b>${a.who ? `<i>${esc(a.who)}</i>` : ''}
    <i class="muted">${fmt.date(a.date)} • ${esc(fmt.rel(a.created_at))}</i></span>${right}</li>`;
};

function onboarding() {
  const steps = [
    { t: 'صندوق و بانک را بسازید', d: 'یک صندوق نقدی (و اگر دارید حساب بانکی) تعریف کنید تا پول‌ها جابه‌جا ثبت شوند.', h: '#/accounts?new=1', i: 'i-wallet' },
    { t: 'کالاها را وارد کنید', d: 'نام کالا، قیمت خرید و فروش و حداقل موجودی. تصویر هم می‌توانید بگیرید.', h: '#/stock/new', i: 'i-stock' },
    { t: 'نخستین فروش را ثبت کنید', d: 'مشتری، اقلام و مبلغ دریافتی. شمارهٔ فاکتور خودکار ساخته می‌شود.', h: '#/sales/new', i: 'i-sale' },
    { t: 'گزارش بگیرید', d: 'سود و زیان، طلب مشتریان و گردش گدام — آمادهٔ چاپ و CSV.', h: '#/reports', i: 'i-chart' },
  ];
  return card({
    title: 'شروع کار در ۴ قدم',
    hint: 'برنامه با دادهٔ خالی شروع می‌شود. برای دیدن نمونهٔ کار، از تنظیمات «دادهٔ نمونه» را بارگذاری کنید.',
    class: 'card-onboard',
    body: `<ol class="steps-list">${steps.map((s, i) => t`
      <li><span class="steps-n">${fmt.plain(i + 1)}</span><div><b>${s.t}</b><i>${s.d}</i></div>
        <a class="btn btn-soft small" href="${s.h}">${icon(s.i, 'ic nano')} انجام</a></li>`).join('')}</ol>`,
  });
}

function openRange() {
  const s = U.sheet({
    title: 'بازهٔ دلخواه',
    sub: 'تاریخ‌ها را شمسی انتخاب کنید',
    body: t`<form class="form" data-onsubmit="go">
      <div class="grid-2">
        ${U.field({ label: 'از تاریخ', name: 'from', control: U.dateField({ name: 'from', value: fmt.today() }) })}
        ${U.field({ label: 'تا تاریخ', name: 'to', control: U.dateField({ name: 'to', value: fmt.today() }) })}
      </div>
      ${btn({ label: 'نمایش', type: 'submit', wide: true })}
    </form>`,
  });
  U.delegate(s.body, {
    go: (f) => {
      const v = U.readForm(f);
      if (!v.from || !v.to) return U.toast('هر دو تاریخ را انتخاب کنید.', 'warn');
      s.close();
      location.hash = `#/home?from=${v.from}&to=${v.to}&range=custom`;
    },
  });
}
