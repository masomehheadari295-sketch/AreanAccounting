/**
 * docs.js — فروش و خرید: فهرست فاکتورها، فرم مرحله‌ای ثبت، جزئیات سند، دریافت/پرداخت و چاپ.
 * یک ماژول برای هر دو نوع سند (sales/purchases) چون ساختارشان یکی است.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';
import * as J from '../lib/jalali.js';

const { t, raw, icon, card, btn, row, pill, emptyState, statusPill, esc, field, input, select, switchField, segmented, stepper, dateField, currencyField, imageField, pickerField, searchBox, moneyView, delegate, readForm, clearErrors, markErrors } = U;

const TEXT = {
  sale: {
    nav: 'فروش', newTitle: 'ثبت فروش', party: 'مشتری', partyPl: 'مشتریان', doc: 'فاکتور', docPl: 'فاکتورهای فروش',
    payLabel: 'دریافت', payVerb: 'ثبت دریافت', payAll: 'گرفتم، تسویه شد', method: 'روش دریافت', unpaid: 'وصول‌نشده',
    hint: 'فاکتور فروش: هر چیزی که به مشتری می‌فروشید. اگر پول را نقدی می‌گیرید، همان موقع «دریافت» را هم ثبت کنید تا مانده صفر بماند.',
    stockHint: 'با ثبت این فاکتور، موجودی گدام کم می‌شود.',
  },
  purchase: {
    nav: 'خرید', newTitle: 'ثبت خرید', party: 'تأمین‌کننده', partyPl: 'تأمین‌کنندگان', doc: 'سند خرید', docPl: 'اسناد خرید',
    payLabel: 'پرداخت', payVerb: 'ثبت پرداخت', payAll: 'پرداختم، تسویه شد', method: 'روش پرداخت', unpaid: 'پرداخت‌نشده',
    hint: 'سند خرید: هر چیزی که از تأمین‌کننده می‌خرید. اگر می‌خواهید به گدام اضافه شود، در هر قلم گزینهٔ «ورود به گدام» را روشن بگذارید.',
    stockHint: 'اگر «ورود به گدام» روشن باشد، موجودی کالا زیاد می‌شود.',
  },
};

export default {
  name: 'docs',
  title: (q, p) => '',
  sub: () => '',
  async render({ root, params, query }) {
    const type = (location.hash.match(/^#\/(sales|purchases)/) || [, 'sale'])[1] === 'purchases' ? 'purchase' : 'sale';
    if (params.id && query.edit === '1') return renderForm(root, +params.id, type, query);
    if (params.id) return renderDetail(root, +params.id, type);
    if (location.hash.includes('/new')) return renderForm(root, null, type, query);
    return renderList(root, type, query);
  },
};

/* ==========================================================================
   فهرست
   ========================================================================== */
async function renderList(root, type, query) {
  const tx = TEXT[type];
  const state = { q: query.q || '', status: query.status || 'all', range: query.range || 'all', currency: query.currency || '', unpaid: query.unpaid === '1', page: 0, limit: 40 };
  document.getElementById('page-title').textContent = tx.nav;
  document.getElementById('page-sub').innerHTML = `<span class="muted small">${tx.docPl} — ${tx.hint.split('.')[0]}</span>`;
  root.innerHTML = `<div class="wrap">${U.skeleton(5)}</div>`;

  const paint = async () => {
    const qs = new URLSearchParams({ type, q: state.q, status: state.status, currency: state.currency, page: state.page });
    if (state.unpaid) qs.set('unpaid', '1');
    if (state.range !== 'all') qs.set('range', state.range);
    let d;
    try { d = await api.get('/api/docs?' + qs.toString()); }
    catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: paint }); }
    const rows = d.rows || [];
    const cur = d.totals_by_currency || [];
    root.innerHTML = `<div class="wrap">
      ${card({
      class: 'card-flat',
      body: `<div class="filters" style="border:0;padding:0">
          ${searchBox({ value: state.q, placeholder: `جست‌وجو در شماره ${tx.doc}، نام ${tx.party} یا یادداشت` })}
          ${select({ name: 'status', value: state.status, options: [{ value: 'all', label: 'همهٔ وضعیت‌ها' }, { value: 'unpaid', label: 'پرداخت‌نشده' }, { value: 'partial', label: 'پرداخت جزئی' }, { value: 'paid', label: 'پرداخت‌شده' }, { value: 'cancelled', label: 'لغوشده' }] })}
          ${select({ name: 'currency', value: state.currency, options: [{ value: '', label: 'همهٔ ارزها' }, ...store.activeCurrencies().map((c) => ({ value: c.code, label: c.name }))] })}
        </div>
        <div style="margin-top:8px">${U.rangeChips(state.range)}
          ${btn({ label: state.unpaid ? `فقط ${tx.unpaid}` : `فقط ${tx.unpaid}`, icon: 'i-alert', variant: state.unpaid ? 'primary' : 'ghost', small: true, act: 'toggle-unpaid' })}
        </div>`,
    })}

      ${rows.length ? card({
      title: `${fmt.plain(d.total)} ${tx.docPl}`,
      hint: fmt.plain(rows.length) + ` مورد در این صفحه نمایش داده می‌شود.`,
      action: btn({ label: `ثبت ${type === 'sale' ? 'فروش' : 'خرید'}`, icon: 'i-plus', small: true, variant: 'primary', attrs: `onclick="location.hash='#/${type === 'sale' ? 'sales' : 'purchases'}/new'"` }),
      class: 'card-flat',
      body: `<div class="list">${rows.map((r) => row({
        href: `#/${type === 'sale' ? 'sales' : 'purchases'}/${r.id}`,
        icon: type === 'sale' ? 'i-sale' : 'i-buy',
        tone: r.status === 'paid' ? 'success' : r.status === 'cancelled' ? 'muted' : r.status === 'partial' ? 'warn' : 'danger',
        title: `${esc(r.no)} — ${esc(r.party_name || tx.party)}`,
        sub: `${fmt.date(r.date)} • ${statusPill(r.status)}${r.pay_count > 0 ? ` • ${fmt.plain(r.pay_count)} ${tx.payLabel}` : ''}`,
        right: `<span class="row-amount"><span class="mono">${esc(fmt.money(r.total, r.currency))}</span>${M.fromDb(r.balance) > 0n && r.status !== 'cancelled'
          ? `<i class="muted small" style="font-style:normal">مانده ${esc(fmt.money(r.balance, r.currency))}</i>` : ''}</span>`,
      })).join('')}</div>`,
      footer: (d.total > state.limit) ? `<div class="btn-group">
              ${state.page > 0 ? btn({ label: 'قبلی', variant: 'soft', small: true, act: 'prev' }) : ''}
              <span class="chip">${fmt.plain(state.page * state.limit + 1)}–${fmt.plain(Math.min((state.page + 1) * state.limit, d.total))} از ${fmt.plain(d.total)}</span>
              ${(state.page + 1) * state.limit < d.total ? btn({ label: 'بعدی', variant: 'soft', small: true, act: 'next' }) : ''}
            </div>` : '',
    }) : emptyState({
      icon: type === 'sale' ? 'i-sale' : 'i-buy',
      title: state.q || state.status !== 'all' || state.unpaid ? `موردی با این فیلترها پیدا نشد` : `هنوز ${tx.docPl.toLowerCase()} ثبت نکرده‌اید`,
      text: state.q || state.status !== 'all' || state.unpaid ? 'فیلترها را تغییر دهید یا جست‌وجو را پاک کنید.' : tx.hint,
      action: (state.q || state.status !== 'all' || state.unpaid || state.range !== 'all')
        ? btn({ label: 'پاک کردن فیلترها', variant: 'soft', act: 'reset' })
        : btn({ label: `ثبت ${type === 'sale' ? 'فروش' : 'خرید'}`, icon: 'i-plus', attrs: `onclick="location.hash='#/${type === 'sale' ? 'sales' : 'purchases'}/new'"` }),
    })}
    </div>`;

    delegate(root, {
      'toggle-unpaid': () => { state.unpaid = !state.unpaid; state.page = 0; paint(); },
      reset: () => { location.hash = `#/${type === 'sale' ? 'sales' : 'purchases'}`; },
      prev: () => { state.page = Math.max(0, state.page - 1); paint(); },
      next: () => { state.page += 1; paint(); },
      range: (n) => { state.range = n.dataset.range; state.page = 0; paint(); },
      'clear-search': () => { state.q = ''; paint(); },
      retry: paint,
    });
    const box = root.querySelector('.searchbox input');
    if (box) {
      let timer;
      box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = box.value.trim(); state.page = 0; paint(); }, 380); });
    }
    root.querySelector('[name=status]')?.addEventListener('change', (e) => { state.status = e.target.value; state.page = 0; paint(); });
    root.querySelector('[name=currency]')?.addEventListener('change', (e) => { state.currency = e.target.value; state.page = 0; paint(); });
  };
  await paint();
}

/* ==========================================================================
   فرم مرحله‌ای (ثبت و ویرایش)
   ========================================================================== */
async function renderForm(root, docId, type, query) {
  const tx = TEXT[type];
  const st = store.settings();
  document.getElementById('page-title').textContent = docId ? `ویرایش ${tx.doc}` : tx.newTitle;
  document.getElementById('page-sub').innerHTML = `<span class="muted small">${tx.stockHint}</span>`;
  root.innerHTML = `<div class="wrap">${U.skeleton(4)}</div>`;

  let doc = null;
  if (docId) {
    try { doc = await api.get('/api/docs/' + docId); }
    catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: () => renderForm(root, docId, type, query) }); }
  }
  const editable = !doc || doc.status !== 'cancelled';
  const locked = !!doc && (doc.payments || []).length > 0;

  // مدل فرم
  const F = {
    step: 0,
    party_id: doc?.party_id || '', party_name: doc?.party_name || '', party_phone: doc?.party_phone || '',
    date: doc?.date || J.todayIso(), due_date: doc?.due_date || '',
    currency: doc?.currency || st.currency_default || 'AFN', rate: doc ? M.str(M.fromDb(doc.rate), 4) : '',
    lines: doc ? doc.items.map((i) => ({
      item_id: i.item_id || '', name: i.name, unit: i.unit, qty: M.str(M.fromDb(i.qty), 4).replace(/\.0+$/, ''),
      unit_price: M.str(M.fromDb(i.unit_price), 2).replace(/\.0+$/, ''), discount: M.fromDb(i.discount) > 0n ? M.str(M.fromDb(i.discount), 2) : '',
    })) : [],
    discount: '', discount_mode: 'amount', tax_enabled: st.tax_enabled && Number(st.tax_percent) > 0, tax_percent: String(st.tax_percent || 0),
    fee: '', note: doc?.note || '',
    pay_full: !doc, paid: '', method_id: doc?.method_id || '', account_id: doc?.account_id || '', attachment: doc?.attachment || '',
  };
  if (doc && M.fromDb(doc.paid) > 0n) { F.pay_full = false; F.paid = M.str(M.fromDb(doc.paid), 2).replace(/\.0+$/, ''); }


  const steps = [`${tx.party}`, 'اقلام', tx.payLabel, 'بررسی'];

  const totals = () => {
    const cur = F.currency || 'AFN';
    const isBase = cur === fmt.base();
    const rate = isBase ? M.SCALE : (M.parse(F.rate) ?? 0n) || store.lastRate(cur);
    let subtotal = 0n, disc = 0n;
    const lines = F.lines.map((l) => {
      const qty = M.parse(l.qty) ?? 0n;
      const price = M.parse(l.unit_price) ?? 0n;
      const gross = M.mul(qty, price);
      const ld = l.discount_mode === 'percent' ? M.applyPct(gross, M.parse(l.discount) ?? 0n) : (M.parse(l.discount) ?? 0n);
      const net = gross - (ld > gross ? gross : ld);
      subtotal += gross; disc += ld;
      return { ...l, gross, net, qty, price };
    });
    let d = disc;
    if (F.discount_mode === 'percent') d = M.applyPct(subtotal, M.parse(F.discount) ?? 0n);
    else if (F.discount) d = disc + (M.parse(F.discount) ?? 0n);
    if (d < 0n) d = 0n;
    if (d > subtotal) d = subtotal;
    const net = subtotal - d;
    const tax = F.tax_enabled ? M.applyPct(net, M.parse(F.tax_percent) ?? 0n) : 0n;
    const fee = M.parse(F.fee) ?? 0n;
    const total = net + tax + (fee > 0n ? fee : 0n);
    const paid = F.pay_full ? total : (M.parse(F.paid) ?? 0n);
    return { lines, subtotal, discount: d, tax, fee, total, base: M.mul(total, rate), rate, currency: cur, isBase, paid: paid > total ? total : (paid < 0n ? 0n : paid), balance: total - (paid > total ? total : (paid < 0n ? 0n : paid)) };
  };

  const stickyBar = () => {
    const s = totals();
    return `<div class="sticky-bar"><div>
        <span class="muted small">مبلغ کل</span>
        <b class="mono big">${esc(fmt.money(s.total, s.currency))}</b>
        ${!s.isBase ? `<span class="muted small">≈ ${esc(fmt.money(s.base, fmt.base()))}</span>` : ''}
      </div><div class="btn-group">${F.step > 0 ? btn({ label: 'مرحله قبل', variant: 'ghost', small: true, act: 'step-back' }) : ''}
      ${F.step < 3 ? btn({ label: 'مرحله بعد', small: true, act: 'step-next' }) : btn({ label: docId ? 'ذخیره تغییرات' : `ثبت ${tx.nav}`, variant: 'primary', icon: 'i-check', small: true, act: 'submit' })}</div></div>`;
  };

  const paint = () => {
    const s = totals();
    document.getElementById('btn-back').hidden = false;
    root.innerHTML = `<div class="wrap wrap-form">
      <div class="steps">${steps.map((x, i) => `<span class="step ${i === F.step ? 'on' : i < F.step ? 'done' : ''}"><b>${i + 1}</b>${x}</span>`).join('')}</div>
      ${doc && !editable ? U.note(`این ${tx.doc} لغو شده است. برای اصلاح، یک ${tx.doc} تازه ثبت کنید.`, 'warn') : ''}
      ${doc && locked && F.step !== 3 ? U.note(`برای تغییر اقلام، نخست ${tx.payLabel}‌های ثبت‌شده را لغو کنید. مبلغ و توضیحات هم فقط با همان روش قابل اصلاح است.`, 'warn') : ''}
      ${F.step === 0 ? stepParty(s) : F.step === 1 ? stepLines(s) : F.step === 2 ? stepPay(s) : stepReview(s)}
      ${stickyBar()}
    </div>`;
    wire();
  };

  const stepParty = () => t`
    ${card({
    title: `۱ — ${tx.party} و تاریخ`,
    hint: `اگر ${tx.party} در فهرست نیست، نامش را بنویسید؛ خودکار ساخته می‌شود.`,
    body: `<div class="form">
        ${pickerField({
      name: 'party_id', label: `${tx.party} از فهرست`, value: F.party_id,
      placeholder: `انتخاب ${tx.party} — یا «${tx.party} جدید» را بزنید`, act: 'pick-party',
      hint: 'انتخاب از فهرست، تاریخچه و ماندهٔ حساب او را به این سند وصل می‌کند.',
    })}
        <div class="grid-2">
          ${field({ label: `نام ${tx.party} (بدون انتخاب از فهرست)`, name: 'party_name', control: input({ name: 'party_name', value: F.party_name, placeholder: 'مثلاً: دکان نور' }) })}
          ${field({ label: 'شماره تماس', name: 'party_phone', control: input({ name: 'party_phone', type: 'tel', value: F.party_phone, placeholder: '07XXXXXXXX' }) })}
        </div>
        <div class="grid-2">
          ${field({ label: 'تاریخ سند', name: 'date', control: dateField({ name: 'date', value: F.date }) })}
          ${field({ label: 'سررسید (اختیاری)', name: 'due_date', control: dateField({ name: 'due_date', value: F.due_date }), hint: 'اگر نسیه است، روز وصول را مشخص کنید تا در گزارش «بدهی» هشدار ببینید.' })}
        </div>
      </div>`,
  })}
    ${card({
    title: 'ارز و نرخ تبدیل',
    hint: `مبلغ‌ها به همین ارز ثبت می‌شود. معادل افغانی بر اساس نرخی که همین‌جا می‌نویسید محاسبه و در سند می‌ماند.`,
    body: `<div class="form">
        ${currencyField({ name: 'cur', currency: F.currency, rate: F.rate || (F.currency === fmt.base() ? '' : M.str(store.lastRate(F.currency), 4).replace(/\.0+$/, '')), rateHint: `نرخ امروز: ${esc(fmt.rateStr(store.lastRate(F.currency)))} — اگر نرخ امروز فرق دارد، همین‌جا عوض کنید.` })}
      </div>`,
  })}`;

  const stepLines = (s) => t`
    ${card({
    title: `۲ — اقلام ${tx.doc}`,
    hint: 'از گدام انتخاب کنید یا قلم دستی بنویسید (مثلاً خدمات). حداقل یک قلم لازم است.',
    action: `<div class="btn-group">${btn({ label: 'از گدام', icon: 'i-stock', small: true, act: 'add-item' })}${btn({ label: 'قلم دستی', icon: 'i-plus', small: true, variant: 'soft', act: 'add-line' })}</div>`,
    body: s.lines.length ? `<div class="lines">${s.lines.map((l, i) => lineRow(l, i)).join('')}</div>
        ${type === 'purchase' ? `<p class="field-hint" style="margin-top:8px">${icon('i-info', 'ic nano')} هر قلم گزینهٔ «ورود به گدام» دارد؛ اگر خاموش باشد فقط مبلغ ثبت می‌شود و موجودی زیاد نمی‌شود.</p>` : ''}`
        : emptyState({ icon: 'i-tag', title: 'هنوز قلمی اضافه نکرده‌اید', text: 'یک کالا از گدام انتخاب کنید یا قلم دستی بسازید.', action: btn({ label: 'افزودن قلم', icon: 'i-plus', act: 'add-line' }) }),
    footer: s.lines.length ? `<div class="totals" style="flex:1">
        ${line('جمع اقلام', fmt.money(s.subtotal, s.currency))}
        ${s.discount > 0n ? line('تخفیف', '− ' + fmt.money(s.discount, s.currency), 'warn') : ''}
        ${s.tax > 0n ? line(`مالیات ${esc(fmt.num(M.parse(F.tax_percent) ?? 0n, 2))}٪`, fmt.money(s.tax, s.currency)) : ''}
        ${s.fee > 0n ? line('هزینه جانبی', fmt.money(s.fee, s.currency)) : ''}
        ${line('مبلغ کل', fmt.money(s.total, s.currency), 'grand')}
        ${!s.isBase ? line(`معادل ${fmt.base()}`, fmt.money(s.base, fmt.base())) : ''}
      </div>` : '',
  })}
    ${card({
    title: 'تخفیف، مالیات و هزینهٔ جانبی',
    hint: 'همه اختیاری است. اگر لازم ندارید، همین‌طور خاموش بگذارید.',
    body: `<div class="form">
        <div class="grid-2">
          ${field({ label: 'تخفیف روی کل سند', name: 'discount', control: input({ name: 'discount', type: 'money', value: F.discount, placeholder: 'مثلاً ۵۰' }) })}
          ${field({ label: 'نوع تخفیف', name: 'discount_mode', control: segmented({ value: F.discount_mode, act: 'disc-mode', items: [{ value: 'amount', label: fmt.cur(s.currency).symbol || s.currency }, { value: 'percent', label: 'درصد' }] }) })}
        </div>
        ${switchField({ name: 'tax_enabled', checked: F.tax_enabled, label: 'مالیات/عوارض', hint: 'روشن باشد: درصد زیر روی جمع اقلام (بعد از تخفیف) حساب می‌شود.' })}
        <div class="grid-2">
          ${field({ label: 'درصد مالیات', name: 'tax_percent', control: input({ name: 'tax_percent', type: 'money', value: F.tax_percent, placeholder: '۲' }), hidden: !F.tax_enabled })}
          ${field({ label: 'هزینهٔ جانبی (حمل، بسته‌بندی…)', name: 'fee', control: input({ name: 'fee', type: 'money', value: F.fee, placeholder: 'مثلاً ۱۰' }) })}
        </div>
        ${field({ label: 'یادداشت سند', name: 'note', control: U.textarea({ name: 'note', value: F.note, rows: 2, placeholder: 'توضیح کوتاه برای خودتان' }) })}
      </div>`,
    })}`;

  const stepPay = (s) => t`
    ${card({
    title: `۳ — ${tx.payLabel}`,
    hint: s.total === 0n ? 'مبلغ سند صفر است؛ نیازی به دریافت نیست.' : `اگر همهٔ مبلغ را الان می‌گیرید، گزینهٔ «${tx.payAll}» را روشن بگذارید.`,
    body: `<div class="form">
        ${switchField({ name: 'pay_full', checked: F.pay_full, label: tx.payAll, hint: 'مانده صفر حساب می‌شود و وضعیت فاکتور «پرداخت‌شده» می‌شود.' })}
        <div class="grid-2" ${F.pay_full ? 'hidden' : ''}>
          ${field({ label: `مبلغ ${tx.payLabel} (الان)`, name: 'paid', control: input({ name: 'paid', type: 'money', value: F.paid, placeholder: 'مثلاً ۲۰۰۰' }), hint: `بیش از مانده مجاز نیست؛ اضافه را بعداً به‌عنوان پیش‌پرداخت ثبت کنید.` })}
          <div class="chips" style="align-items:flex-end">
            <button class="chip" type="button" data-act="pay-quick" data-kind="half">نصف</button>
            <button class="chip" type="button" data-act="pay-quick" data-kind="rest">همهٔ باقیمانده</button>
          </div>
        </div>
        ${field({ label: tx.method, name: 'method_id', control: select({ name: 'method_id', value: F.method_id, placeholder: '— انتخاب کنید —', options: store.methods().map((m) => ({ value: m.id, label: m.name })) }), hint: 'پول از کجا آمد/رفت؟ اگر «نقدی» است صندوق را در مرحلهٔ بعد انتخاب کنید.' })}
        ${field({ label: 'حساب (صندوق یا بانک)', name: 'account_id', control: accountSelect(F.account_id, s.currency) })}
        ${imageField({ name: 'attachment', value: F.attachment, label: 'تصویر رسید یا فاکتور', buttonLabel: 'افزودن تصویر' })}
      </div>`,
    })}`;

  const stepReview = (s) => t`
    ${card({
    title: '۴ — بررسی و ثبت',
    hint: 'یک‌دیگر نگاهی بیندازید؛ پس از ثبت هم می‌توانید دریافت اضافه کنید یا سند را لغو کنید.',
    body: `<div class="totals">
        ${line(tx.party, F.party_name || store.findParty(F.party_id)?.name || '—')}
        ${line('تاریخ', fmt.date(F.date))}
        ${F.due_date ? line('سررسید', fmt.date(F.due_date)) : ''}
        ${line('تعداد اقلام', fmt.plain(s.lines.length))}
        ${line('مبلغ کل', `${fmt.money(s.total, s.currency)}`, 'grand')}
        ${!s.isBase ? line(`معادل ${fmt.base()} (نرخ ${fmt.rateStr(s.rate)})`, fmt.money(s.base, fmt.base())) : ''}
        ${line(tx.payLabel + ' الان', fmt.money(s.paid, s.currency))}
        ${line('مانده', fmt.money(s.balance, s.currency), s.balance > 0n ? 'warn' : '')}
      </div>
      <div class="divider"></div>
      ${s.lines.map((l, i) => `<div class="line-total"><span>${i + 1}. ${esc(l.name)} × ${esc(fmt.qty(M.fromDb(String(l.qty))))}</span><b>${esc(fmt.money(l.net, s.currency))}</b></div>`).join('')}
      ${U.note(type === 'sale' ? 'با ثبت این سند، موجودی کالاهای انتخاب‌شده از گدام کم می‌شود و بهاى تمام‌شده بر پایهٔ میانگین موزون محاسبه می‌گردد.' : 'کالاهایی که «ورود به گدام» روشن دارند به موجودی اضافه می‌شوند و بهاى میانگین تازه محاسبه می‌گردد.', 'info')}`,
    footer: `<div class="btn-group">
        ${btn({ label: docId ? 'ذخیره تغییرات' : `ثبت ${tx.nav}`, variant: 'primary', icon: 'i-check', act: 'submit' })}
        ${type === 'sale' ? btn({ label: 'ثبت و چاپ فاکتور', variant: 'soft', icon: 'i-print', act: 'submit-print' }) : ''}
      </div>`,
    })}`;

  const line = (k, v, cls = '') => `<div class="line-total ${cls}"><span>${k}</span><b>${esc(v)}</b></div>`;

  function lineRow(l, i) {
    const canStock = type === 'purchase';
    return `<div class="line" data-line="${i}">
      <span class="line-n">${i + 1}</span>
      <div class="line-main">
        <b>${esc(l.name)}${l.item_id ? ` <i class="muted small">${esc(store.findItem(l.item_id)?.code || '')}</i>` : ''}</b>
        <div class="grid-3" style="margin-top:6px">
          ${field({ label: 'تعداد', name: `qty_${i}`, control: stepper({ name: `qty_${i}`, value: l.qty, incAct: 'line-inc', decAct: 'line-dec' }) })}
          ${field({ label: 'بهای واحد', name: `price_${i}`, control: input({ name: `price_${i}`, type: 'money', value: l.unit_price }) })}
          ${field({ label: 'تخفیف قلم', name: `disc_${i}`, control: input({ name: `disc_${i}`, type: 'money', value: l.discount, placeholder: '—' }) })}
        </div>
        ${canStock ? switchField({ name: `stock_${i}`, checked: l.update_stock !== 0 && l.update_stock !== false, label: 'ورود به گدام', hint: 'موجودی این کالا زیاد شود' }) : ''}
        ${l.item_id ? `<i class="muted small" style="font-style:normal">موجودی گدام: ${esc(fmt.qty(M.fromDb(store.findItem(l.item_id)?.stock_qty ?? '0')))} ${esc(store.findItem(l.item_id)?.unit || '')}</i>` : ''}
      </div>
      <div class="line-end">
        <span class="mono">${esc(fmt.money(M.sub(M.mul(M.parse(l.qty) ?? 0n, M.parse(l.unit_price) ?? 0n), M.parse(l.discount) ?? 0n), F.currency))}</span>
        <button class="icon-btn tiny" data-act="line-del" data-i="${i}" aria-label="حذف قلم">${icon('i-trash', 'ic nano')}</button>
        <button class="icon-btn tiny" data-act="line-edit" data-i="${i}" aria-label="ویرایش قلم">${icon('i-edit', 'ic nano')}</button>
      </div>
    </div>`;
  }



  function accountSelect(value, currency) {
    const list = store.accounts().filter((a) => a.active !== 0);
    const same = list.filter((a) => a.currency === currency);
    const other = list.filter((a) => a.currency !== currency);
    const opt = (a) => ({ value: a.id, label: `${a.name} — ${fmt.cur(a.currency).name}${a.kind === 'cash' ? '' : ' (بانک)'}` });
    return select({
      name: 'account_id', value,
      placeholder: '— انتخاب کنید —',
      options: [...(same.length ? [{ value: '_g', label: 'حساب‌های هم‌ارز سند' }, ...same.map(opt)] : same.map(opt)),
      ...(other.length ? [{ value: '_g2', label: 'حساب‌های با ارز دیگر (تبدیل می‌شود)' }, ...other.map(opt)] : [])],
    });
  }

  /* ---- واکنش‌ها ---- */
  function wire() {
    const acts = {
      'step-next': () => { sync(); if (F.step === 0 && !F.party_id && !F.party_name) return U.toast(`نام ${tx.party} را وارد کنید یا از فهرست انتخاب کنید.`, 'warn'); if (F.step === 1 && !F.lines.length) return U.toast('دست‌کم یک قلم اضافه کنید.', 'warn'); F.step = Math.min(3, F.step + 1); paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
      'step-back': () => { sync(); F.step = Math.max(0, F.step - 1); paint(); },
      'add-line': () => { sync(); openLineEditor(null); },
      'add-item': () => { sync(); openItemPicker(); },
      'line-del': (n) => { sync(); F.lines.splice(+n.dataset.i, 1); paint(); },
      'line-edit': (n) => { sync(); openLineEditor(+n.dataset.i); },
      'line-inc': (n) => stepLine(n, 1n), 'line-dec': (n) => stepLine(n, -1n),
      'disc-mode': (n) => { F.discount_mode = n.dataset.value; paint(); },
      'pay-quick': (n) => {
        const s = totals();
        const el2 = root.querySelector('[name=paid]');
        if (!el2) return;
        F.pay_full = false;
        el2.value = M.str(n.dataset.kind === 'half' ? s.total / 2n : s.balance, 2).replace(/\.0+$/, '');
        root.querySelector('[name=pay_full]') && (root.querySelector('[name=pay_full]').checked = false);
        paint();
      },
      'pick-party': () => openPartyPicker(),
      'clear-img': () => { F.attachment = ''; paint(); },
      submit: () => save(false), 'submit-print': () => save(true),
    };
    delegate(root, acts);
    root.querySelectorAll('[name^="qty_"],[name^="price_"],[name^="disc_"]').forEach((inp) => {
      inp.addEventListener('change', () => { sync(); paint(); });
    });
    root.addEventListener('dateset', (e) => {
      const wrap = e.target.closest('[data-date-field]');
      const name = wrap?.querySelector('input[type=hidden]')?.name;
      if (name === 'date') F.date = e.detail.iso;
      if (name === 'due_date') F.due_date = e.detail.iso;
    });
    const cf = root.querySelector('[data-cur-field]');
    if (cf) {
      cf.addEventListener('change', () => {
        F.currency = cf.querySelector('[name=cur_currency]')?.value || F.currency;
        F.rate = cf.querySelector('[name=cur_rate]')?.value || '';
        updateEquiv();
      });
      cf.addEventListener('input', updateEquiv);
      updateEquiv();
    }
    function updateEquiv() {
      const box = cf?.querySelector('[data-cur-equiv]');
      if (!box) return;
      const s = totals();
      if (s.isBase) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = `${fmt.money(s.total, s.currency)} <b>≈ ${fmt.money(s.base, fmt.base())}</b> <span class="muted small">(نرخ ${fmt.rateStr(s.rate)})</span>`;
    }
    function stepLine(n, dir) {
      const idx = +n.closest('.line').dataset.line;
      const l = F.lines[idx];
      const q = M.parse(l.qty) ?? 0n;
      const next = q + dir * M.SCALE;
      l.qty = M.str(next > 0n ? next : 0n, 4).replace(/\.0+$/, '');
      sync(); paint();
    }
  }

  function sync() {
    const v = readForm(root);
    if (v.party_name !== undefined) F.party_name = v.party_name.trim();
    if (v.party_phone !== undefined) F.party_phone = v.party_phone.trim();
    if (v.date) F.date = v.date;
    if (v.due_date) F.due_date = v.due_date;
    if (v.note !== undefined) F.note = v.note;
    if (v.discount !== undefined) F.discount = v.discount;
    if (v.tax_percent !== undefined) F.tax_percent = v.tax_percent;
    if (v.fee !== undefined) F.fee = v.fee;
    if (v.tax_enabled !== undefined) F.tax_enabled = v.tax_enabled;
    if (v.pay_full !== undefined) F.pay_full = v.pay_full;
    if (v.paid !== undefined) F.paid = v.paid;
    if (v.method_id !== undefined) F.method_id = v.method_id;
    if (v.account_id !== undefined) F.account_id = v.account_id.startsWith('_') ? '' : v.account_id;
    if (v.attachment !== undefined) F.attachment = v.attachment;
    if (v.cur_currency) F.currency = v.cur_currency;
    if (v.cur_rate !== undefined) F.rate = v.cur_rate;
    F.lines.forEach((l, i) => {
      if (v[`qty_${i}`] !== undefined) l.qty = v[`qty_${i}`];
      if (v[`price_${i}`] !== undefined) l.unit_price = v[`price_${i}`];
      if (v[`disc_${i}`] !== undefined) l.discount = v[`disc_${i}`];
      if (type === 'purchase' && v[`stock_${i}`] !== undefined) l.update_stock = v[`stock_${i}`] ? 1 : 0;
    });
    root.querySelectorAll('[data-line]').forEach((n) => {
      const img = n.querySelector('[data-img-field] input[type=hidden]');
      if (img) F.lines[+n.dataset.line].attachment = img.value;
    });
  }

  /* ---- انتخاب‌گرها ---- */
  function openPartyPicker() {
    const kind = type === 'sale' ? 'customer' : 'supplier';
    const list = store.parties().filter((p) => p.kind === kind || p.kind === 'both');
    const s = U.sheet({
      title: `انتخاب ${tx.party}`,
      sub: `${fmt.plain(list.length)} مورد در فهرست`,
      body: `<div class="form">${searchBox({ name: 'q', placeholder: 'نام یا شماره تماس…', autofocus: true })}
        <div class="list" data-list>${list.map((p) => row({ title: esc(p.name), sub: esc(p.phone || ''), icon: 'i-users', act: 'pick', data: `data-id="${p.id}"`, arrow: false })).join('') || emptyState({ icon: 'i-users', title: 'فهرست خالی است' })}</div>
        <button class="btn btn-soft wide" data-act="new-party">${icon('i-plus')} ${tx.party} جدید</button></div>`,
    });
    delegate(s.body, {
      pick: (n) => {
        const id = n.dataset.id;
        const p = store.findParty(id);
        F.party_id = +id; F.party_name = p?.name || ''; F.party_phone = p?.phone || '';
        s.close(); paint();
      },
      'new-party': async () => {
        s.close();
        openPartyForm(() => paint());
      },
      'clear-search': () => { },
    });
    const inp = s.body.querySelector('input[name=q]');
    inp?.addEventListener('input', () => {
      const q = inp.value.trim();
      s.body.querySelectorAll('[data-act=pick]').forEach((n) => {
        const p = store.findParty(n.dataset.id);
        n.style.display = !q || `${p.name} ${p.phone}`.includes(q) ? '' : 'none';
      });
    });
  }

  function openPartyForm(onDone) {
    const kind = type === 'sale' ? 'customer' : 'supplier';
    U.formSheet({
      title: `${tx.party} جدید`,
      sub: `با پرکردن این فرم، ${tx.party} به فهرست اضافه می‌شود و در این سند انتخاب می‌گردد.`,
      ok: 'ذخیره و انتخاب',
      fields: [
        field({ label: `نام ${tx.party}`, name: 'name', required: true, control: input({ name: 'name', placeholder: type === 'sale' ? 'مثلاً: خوروردگاه آریانا' : 'مثلاً: شرکت برکت', required: true }) }),
        field({ label: 'نفر تماس', name: 'contact', control: input({ name: 'contact', placeholder: 'نام کسی که حساب را پیگیری می‌کند' }) }),
        field({ label: 'شماره تماس', name: 'phone', control: input({ name: 'phone', type: 'tel', placeholder: '07XXXXXXXX' }) }),
        field({ label: 'نشانی', name: 'address', control: U.textarea({ name: 'address', rows: 2 }) }),
      ],
      validate: (v) => { if (!v.name?.trim()) throw new Error(`«نام ${tx.party}» را وارد کنید.`); },
      onSubmit: async (v) => {
        const r = await store.mutate('post', '/api/parties', { ...v, kind }, { success: `${tx.party} افزوده شد.` });
        F.party_id = r.row.id; F.party_name = r.row.name; F.party_phone = r.row.phone || '';
        onDone?.();
      },
    });
  }

  function openItemPicker() {
    const items = store.items().filter((i) => i.active !== 0);
    const s = U.sheet({
      title: 'افزودن قلم از گدام',
      sub: 'می‌توانید چند قلم پشت‌سرهم انتخاب کنید.',
      body: `<div class="form">${searchBox({ name: 'q', placeholder: 'نام کالا یا کد…', autofocus: true })}
        <p class="field-hint" data-count>${fmt.plain(items.length)} کالا در فهرست</p>
        <div class="list">${items.map((i) => row({
        title: esc(i.name), sub: `${esc(i.code || '—')} • ${esc(i.unit || '')} • قیمت ${type === 'sale' ? 'فروش' : 'خرید'}: ${esc(fmt.money(type === 'sale' ? i.sell_price : i.buy_price, fmt.base()))}`,
        icon: 'i-stock', act: 'add', data: `data-id="${i.id}"`, arrow: false,
        right: `<span class="chip">${icon('i-plus', 'ic nano')}افزودن</span>`,
      })).join('') || emptyState({ icon: 'i-stock', title: 'کالایی تعریف نشده', text: 'از بخش گدام کالا بسازید یا قلم دستی اضافه کنید.' })}</div>
        ${btn({ label: 'قلم دستی (خارج از فهرست)', variant: 'soft', wide: true, act: 'manual' })}</div>`,
    });
    const add = (id) => {
      const it = store.findItem(id);
      if (!it) return;
      F.lines.push({
        item_id: it.id, name: it.name, unit: it.unit, qty: '1',
        unit_price: M.str(M.fromDb(type === 'sale' ? it.sell_price : it.buy_price), 2).replace(/\.0+$/, ''),
        discount: '', update_stock: type === 'purchase' ? 1 : 0,
      });
      const c = s.body.querySelector('[data-count]');
      if (c) c.textContent = `${fmt.plain(F.lines.length)} قلم در سند — برای بستن، بیرون فهرست را بزنید`;
      U.toast(`${it.name} اضافه شد.`, 'success', 1400);
      paint(); // فهرست قلم‌ها بی‌درنگ پشت همین برگه به‌روز می‌شود
    };
    delegate(s.body, {
      add: (n) => add(n.dataset.id),
      manual: () => { s.close(); openLineEditor(null); },
      'clear-search': () => { },
    });
    const inp = s.body.querySelector('input[name=q]');
    inp?.addEventListener('input', () => {
      const q = inp.value.trim();
      s.body.querySelectorAll('[data-act=add]').forEach((n) => {
        const it = store.findItem(n.dataset.id);
        n.style.display = !q || `${it.name} ${it.code}`.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
      });
    });
    s.root.addEventListener('click', (e) => { if (e.target === s.root && F.lines.length) s.close(), paint(); });
  }

  function openLineEditor(index) {
    const l = index === null ? { name: '', unit: 'عدد', qty: '1', unit_price: '', discount: '' } : F.lines[index];
    const s = U.sheet({
      title: index === null ? 'قلم دستی' : `ویرایش قلم ${index + 1}`,
      sub: 'برای خدمات، کرایه یا چیزی که در گدام نیست.',
      body: `<form class="form" data-onsubmit="ok">
        ${field({ label: 'شرح', name: 'name', required: true, control: input({ name: 'name', value: l.name, placeholder: 'مثلاً: کرایهٔ حمل', required: true }) })}
        <div class="grid-2">
          ${field({ label: 'تعداد', name: 'qty', control: input({ name: 'qty', type: 'money', value: l.qty, placeholder: '۱' }) })}
          ${field({ label: 'واحد', name: 'unit', control: input({ name: 'unit', value: l.unit || 'عدد' }) })}
        </div>
        <div class="grid-2">
          ${field({ label: 'بهای واحد', name: 'unit_price', required: true, control: input({ name: 'unit_price', type: 'money', value: l.unit_price, placeholder: '۰' }) })}
          ${field({ label: 'تخفیف این قلم', name: 'discount', control: input({ name: 'discount', type: 'money', value: l.discount, placeholder: '—' }) })}
        </div>
        ${type === 'purchase' ? switchField({ name: 'update_stock', checked: l.update_stock !== 0 && l.update_stock !== false, label: 'ورود به گدام', hint: 'اگر کالا در گدام ثبت می‌شود' }) : ''}
        ${field({ label: 'تصویر (اختیاری)', name: 'img', control: imageField({ name: 'line_img', value: l.attachment || '', label: 'تصویر قلم' }) })}
        <button class="btn btn-primary wide" type="submit">${index === null ? 'افزودن قلم' : 'ذخیرهٔ قلم'}</button>
      </form>`,
    });
    delegate(s.body, {
      ok: (f) => {
        const v = readForm(f);
        if (!v.name?.trim()) return U.toast('شرح قلم را بنویسید.', 'warn');
        const qty = M.parse(v.qty);
        if (qty === null) return U.toast('تعداد را عددی وارد کنید.', 'warn');
        const obj = {
          item_id: l.item_id || '', name: v.name.trim(), unit: v.unit || 'عدد',
          qty: M.str(qty, 4).replace(/\.0+$/, ''), unit_price: v.unit_price || '0', discount: v.discount || '',
          update_stock: v.update_stock ? 1 : 0, attachment: v.line_img || '',
        };
        if (index === null) F.lines.push(obj); else F.lines[index] = { ...l, ...obj };
        s.close(); paint();
      },
    });
  }

  /* ---- ذخیره ---- */
  async function save(andPrint) {
    sync();
    if (!F.party_id && !F.party_name?.trim()) { F.step = 0; paint(); return U.toast(`نام ${tx.party} لازم است.`, 'warn'); }
    if (!F.lines.length) { F.step = 1; paint(); return U.toast('دست‌کم یک قلم اضافه کنید.', 'warn'); }
    const s = totals();
    if (s.total <= 0n) {
      const okk = await U.confirmBox({ title: 'مبلغ کل صفر است', text: 'معمولاً فاکتور با مبلغ صفر اشتباه است. باز هم ثبت شود؟', ok: 'ثبت کن', icon: 'i-alert', tone: 'warn' });
      if (!okk) return;
    } else {
      const okk = await U.confirmBox({
        title: docId ? 'ذخیرهٔ تغییرات؟' : `ثبت ${tx.nav}؟`,
        text: 'پیش از ثبت نهایی، مبلغ و تاریخ را ببینید.',
        ok: docId ? 'ذخیره' : 'ثبت کن',
        detail: `<div><span>${tx.party}</span><b>${esc(F.party_name || store.findParty(F.party_id)?.name || '')}</b></div>
          <div><span>تاریخ</span><b>${fmt.date(F.date)}</b></div>
          <div><span>مبلغ کل</span><b>${fmt.money(s.total, s.currency)}</b></div>
          ${!s.isBase ? `<div><span>معادل ${fmt.base()}</span><b>${fmt.money(s.base, fmt.base())}</b></div>` : ''}
          <div><span>${tx.payLabel} الان</span><b>${fmt.money(s.paid, s.currency)}</b></div>
          <div><span>مانده</span><b>${fmt.money(s.balance, s.currency)}</b></div>`,
      });
      if (!okk) return;
    }
    const body = {
      party_id: F.party_id || null, party_name: F.party_name, party_phone: F.party_phone,
      date: F.date, due_date: F.due_date || null, currency: F.currency, rate: F.rate || undefined,
      tax_enabled: F.tax_enabled, tax_percent: F.tax_percent, fee: F.fee,
      discount: F.discount_mode === 'percent' ? '' : F.discount, discount_percent: F.discount_mode === 'percent' ? F.discount : '',
      note: F.note, method_id: F.method_id || null, account_id: F.account_id || null,
      attachment: F.attachment,
      paid: s.paid > 0n ? M.str(s.paid, 2) : '',
      items: F.lines.map((l) => ({
        item_id: l.item_id || null, name: l.name, unit: l.unit, qty: l.qty, unit_price: l.unit_price,
        discount: l.discount || '', update_stock: l.update_stock ? 1 : 0, attachment: l.attachment || '',
      })),
    };
    try {
      const r = docId ? await api.put('/api/docs/' + docId, body) : await api.post('/api/docs', body);
      const saved = r?.doc || r;
      await store.refreshDictionaries();
      U.toast(r?.queued ? `${tx.doc} در صف آفلاین است؛ پس از اتصال ثبت می‌شود.`
        : `${tx.doc} ${saved?.no || ''} ثبت شد.${s.balance > 0n ? ` مانده: ${fmt.money(s.balance, s.currency)}` : ' تسویه کامل.'}`, r?.queued ? 'warn' : 'success', 5200);
      if (saved?.id) {
        if (andPrint) window.open(`/print/doc/${saved.id}`, '_blank', 'noopener');
        else location.hash = `#/${type === 'sale' ? 'sales' : 'purchases'}/${saved.id}`;
      } else { location.hash = `#/${type === 'sale' ? 'sales' : 'purchases'}`; }
    } catch (e) {
      // خطا را در همان مرحلۀ مربوطه نشان بده، نه فقط با یک اعلان
      const stepOfField = { party_name: 0, party_phone: 0, party_id: 0, date: 0, due_date: 0, account_id: 2, method_id: 2, paid: 2, note: 0 };
      const f = e?.field;
      const to = f && (/^(qty_|price_|disc_)/.test(f) ? 1 : stepOfField[f]);
      if (to !== undefined && to !== F.step) { F.step = to; paint(); await U.tick(60); }
      markErrors(root, e);
      U.toast(e.userMessage || e.message || 'ثبت نشد', 'danger', 6000);
    }
  }

  paint();
}

/* ==========================================================================
   جزئیات سند
   ========================================================================== */
async function renderDetail(root, id, type) {
  const tx = TEXT[type];
  document.getElementById('page-sub').innerHTML = '';
  document.getElementById('btn-back').hidden = false;
  root.innerHTML = `<div class="wrap">${U.skeleton(4)}</div>`;
  let d;
  try { d = await api.get('/api/docs/' + id); }
  catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: () => renderDetail(root, id, type) }); }
  document.getElementById('page-title').textContent = d.no;
  const bal = M.fromDb(d.balance);
  const cur = d.currency;

  const line = (k, v, cls = '') => `<div class="line-total ${cls}"><span>${k}</span><b>${esc(v)}</b></div>`;
  root.innerHTML = `<div class="wrap">
    ${card({
    title: `${type === 'sale' ? 'فاکتور فروش' : 'سند خرید'}`,
    action: statusPill(d.status),
    hint: d.status === 'cancelled' ? `لغو شده: ${esc(d.cancel_reason || 'بدون دلیل')}` : '',
    body: `<div class="totals">
        ${line(tx.party, `${esc(d.party?.name || d.party_name || '—')}${(d.party?.phone || d.party_phone) ? ` • ${esc(d.party?.phone || d.party_phone)}` : ''}`)}
        ${line('تاریخ', fmt.date(d.date) + (d.due_date ? ` • سررسید ${fmt.date(d.due_date)}` : ''))}
        ${line('جمع اقلام', fmt.money(d.subtotal, cur))}
        ${M.fromDb(d.discount) > 0n ? line('تخفیف', '− ' + fmt.money(d.discount, cur), 'warn') : ''}
        ${M.fromDb(d.tax) > 0n ? line('مالیات', fmt.money(d.tax, cur)) : ''}
        ${M.fromDb(d.fee) > 0n ? line('هزینه جانبی', fmt.money(d.fee, cur)) : ''}
        ${line('مبلغ کل', fmt.money(d.total, cur), 'grand')}
        ${cur !== fmt.base() ? line(`معادل ${fmt.base()} (نرخ ${fmt.rateStr(d.rate)})`, fmt.money(d.base_total, fmt.base())) : ''}
        ${line(tx.payLabel + '‌شده', fmt.money(d.paid, cur))}
        ${line('مانده', fmt.money(bal, cur), bal > 0n ? 'warn' : '')}
        ${type === 'sale' && M.fromDb(d.cost) > 0n ? line('بهای تمام‌شده (میانگین موزون)', fmt.money(d.cost, cur)) : ''}
        ${type === 'sale' && M.fromDb(d.cost) > 0n ? line('سود این فاکتور', fmt.money(M.sub(M.fromDb(d.total), M.fromDb(d.cost)), cur), 'grand') : ''}
      </div>
      ${d.note ? U.note('یادداشت: ' + esc(d.note), 'info') : ''}`,
    footer: `<div class="btn-group" style="flex-wrap:wrap">
        ${bal > 0n && d.status !== 'cancelled' ? btn({ label: tx.payVerb, icon: 'i-wallet', variant: 'primary', act: 'pay' }) : ''}
        ${btn({ label: 'چاپ / PDF', icon: 'i-print', variant: 'soft', act: 'print' })}
        ${d.status !== 'cancelled' ? btn({ label: 'ویرایش', icon: 'i-edit', variant: 'soft', act: 'edit' }) : ''}
        ${d.status !== 'cancelled' ? btn({ label: 'لغو سند', icon: 'i-close', variant: 'ghost', act: 'cancel' }) : ''}
      </div>`,
  })}

    ${card({
    title: 'اقلام',
    hint: type === 'sale' ? 'موجودی گدام با ثبت این فاکتور کم شد.' : 'اگر «ورود به گدام» روشن بوده، موجودی زیاد شده است.',
    class: 'card-flat',
    body: `<div class="tablewrap"><table class="tbl"><thead><tr>
        <th>شرح</th><th class="c">تعداد</th><th class="e">بهای واحد</th><th class="e">تخفیف</th><th class="e">مبلغ</th>
      </tr></thead><tbody>
        ${d.items.map((i) => `<tr>
          <td>${i.item_id ? `<a href="#/stock/${i.item_id}">${esc(i.name)}</a>` : esc(i.name)}</td>
          <td class="c">${esc(fmt.qty(M.fromDb(i.qty)))} ${esc(i.unit || '')}</td>
          <td class="e">${esc(fmt.money(i.unit_price, cur))}</td>
          <td class="e">${M.fromDb(i.discount) > 0n ? esc(fmt.money(i.discount, cur)) : '—'}</td>
          <td class="e"><b>${esc(fmt.money(i.line_total, cur))}</b></td></tr>`).join('')}
      </tbody></table></div>`,
  })}

    ${card({
    title: tx.payLabel + '‌ها',
    hint: d.payments.length ? 'برای اصلاح، یک دریافت را لغو و دوباره ثبت کنید.' : `هنوز ${tx.payLabel.toLocaleLowerCase()}ی ثبت نشده است.`,
    body: d.payments.length ? `<div class="list">${d.payments.map((p) => row({
      icon: fmt.txIcon(p.type), tone: 'success',
      title: `${fmt.money(p.amount, p.currency)} — ${esc(p.method_name || 'بدون روش')}`,
      sub: `${fmt.date(p.date)}${p.account_name ? ` • ${esc(p.account_name)}` : ''}${p.note ? ` • ${esc(p.note)}` : ''}`,
      right: p.attachment ? `<a class="chip" href="${esc(p.attachment)}" target="_blank" rel="noopener">رسید</a>` : '',
      act: 'void-pay', data: `data-id="${p.id}"`,
    })).join('')}</div>` : emptyState({ icon: 'i-wallet', title: `${tx.payLabel} ثبت نشده`, action: btn({ label: tx.payVerb, variant: 'soft', act: 'pay' }) }),
  })}

    ${card({
    title: 'پیوست‌ها',
    hint: 'تصویر فاکتور دست‌نویس، رسید بانک یا قرارداد.',
    body: (d.attachments || []).length
      ? `<div class="itemgrid">${d.attachments.map((a) => `<a class="itemcard" href="${esc(a.path)}" target="_blank" rel="noopener">
          <span class="itemcard-img"><img src="${esc(a.path)}" alt="${esc(a.name)}"></span>
          <span class="itemcard-body"><b>${esc(a.name)}</b><i>${fmt.plain(Math.round((a.size || 0) / 1024))} کیلوبایت</i></span></a>`).join('')}</div>`
      : d.attachment ? `<img src="${esc(d.attachment)}" alt="پیوست سند" style="max-width:100%;border-radius:14px">`
        : emptyState({ icon: 'i-camera', title: 'پیوستی نیست', action: btn({ label: 'افزودن تصویر', variant: 'soft', act: 'attach' }) }),
    footer: (d.attachments || []).length ? btn({ label: 'افزودن تصویر دیگر', variant: 'ghost', small: true, act: 'attach' }) : '',
  })}
  </div>`;

  delegate(root, {
    print: () => window.open(`/print/doc/${d.id}`, '_blank', 'noopener'),
    edit: () => { location.hash = `#/${type === 'sale' ? 'sales' : 'purchases'}/${d.id}?edit=1`; },
    pay: () => openPayment(d, type, () => renderDetail(root, id, type)),
    attach: () => openAttach(d, () => renderDetail(root, id, type)),
    cancel: async () => {
      const yes = await U.confirmBox({
        title: `لغو این ${tx.doc.toLocaleLowerCase()}؟`,
        danger: true, icon: 'i-close', ok: 'لغو کن',
        text: 'موجودی گدام برگشت می‌خورد و دریافت‌های ثبت‌شده لغو می‌شود. خود سند پاک نمی‌شود و در سابقه می‌ماند.',
        detail: `<div><span>شماره</span><b>${esc(d.no)}</b></div><div><span>مبلغ کل</span><b>${fmt.money(d.total, cur)}</b></div>`,
        check: 'می‌دانم این عمل قابل بازگشت نیست',
      });
      if (!yes) return;
      const reason = await U.promptBox({ title: 'دلیل لغو', text: 'برای سابقه نوشته می‌شود (اختیاری).', placeholder: 'مثلاً: انصراف مشتری', ok: 'ثبت لغو' });
      if (reason === null) return;
      try {
        await store.mutate('post', `/api/docs/${d.id}/cancel`, { reason }, { success: `${tx.doc} لغو و موجودی برگشت خورد.` });
        renderDetail(root, id, type);
      } catch (e) { U.toast(e.userMessage || 'لغو نشد', 'danger'); }
    },
    'void-pay': async (n) => {
      const yes = await U.confirmBox({
        title: `لغو ${tx.payLabel.toLocaleLowerCase()}؟`, danger: true, ok: 'لغو کن', icon: 'i-close',
        text: 'مبلغ به ماندهٔ سند برمی‌گردد. اگر دریافت از صندوق بوده، موجودی صندوق هم کم می‌شود.',
        check: 'مطمئنم',
      });
      if (!yes) return;
      try {
        await store.mutate('post', `/api/tx/${n.dataset.id}/void`, { reason: 'لغو از صفحهٔ سند' }, { success: `${tx.payLabel} لغو شد.` });
        renderDetail(root, id, type);
      } catch (e) { U.toast(e.userMessage || 'لغو نشد', 'danger'); }
    },
  });
}

/* ---- ثبت دریافت/پرداخت روی سند ---- */
export function openPayment(doc, type, onDone) {
  const tx = TEXT[type];
  const bal = M.fromDb(doc.balance);
  const s = U.sheet({
    title: tx.payVerb,
    sub: `${esc(doc.no)} — مانده: ${fmt.money(bal, doc.currency)}`,
    body: `<form class="form" data-onsubmit="ok">
      ${field({ label: 'مبلغ', name: 'amount', required: true, control: input({ name: 'amount', type: 'money', value: M.str(bal, 2).replace(/\.0+$/, ''), required: true }), hint: 'می‌توانید کمتر بنویسید؛ سند «پرداخت جزئی» می‌ماند.' })}
      <div class="chips" style="margin-top:-4px">
        <button class="chip" type="button" data-act="amt" data-v="all">${fmt.cur(doc.currency).symbol} همهٔ مانده</button>
        <button class="chip" type="button" data-act="amt" data-v="half">نصف</button>
        <button class="chip" type="button" data-act="amt" data-v="q">یک‌چهارم</button>
      </div>
      <div class="grid-2">
        ${field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date', value: J.todayIso() }) })}
        ${field({ label: tx.method, name: 'method_id', control: select({ name: 'method_id', placeholder: '—', options: store.methods().map((m) => ({ value: m.id, label: m.name })) }) })}
      </div>
      ${field({ label: 'حسابی که پول از آن کم/زیاد می‌شود', name: 'account_id', control: select({ name: 'account_id', placeholder: '— انتخاب کنید —', options: store.accounts().filter((a) => a.active !== 0).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })) }), hint: 'برای نقدی، صندوق را انتخاب کنید تا موجودی نقدی درست بماند.' })}
      ${field({ label: 'ارز دریافت', name: 'currency', control: select({ name: 'currency', value: doc.currency, options: store.activeCurrencies().map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })) }), hint: 'اگر ارز دریافت با ارز سند فرق دارد، نرخ را هم بنویسید.' })}
      ${field({ label: 'نرخ تبدیل', name: 'rate', control: input({ name: 'rate', type: 'money', value: doc.currency === fmt.base() ? '' : M.str(store.lastRate(doc.currency), 4).replace(/\.0+$/, '') }), hidden: doc.currency === fmt.base() })}
      ${field({ label: 'توضیح', name: 'note', control: input({ name: 'note', placeholder: 'مثلاً: قسط دوم — نقدی' }) })}
      ${imageField({ name: 'attachment', label: 'تصویر رسید', buttonLabel: 'افزودن تصویر رسید' })}
      <button class="btn btn-primary wide" type="submit">${icon('i-check', 'ic nano')}${tx.payVerb}</button>
    </form>`,
  });
  const f = s.body.querySelector('form');
  delegate(s.body, {
    amt: (n) => {
      const v = n.dataset.v === 'all' ? bal : n.dataset.v === 'half' ? bal / 2n : bal / 4n;
      f.querySelector('[name=amount]').value = M.str(v, 2).replace(/\.0+$/, '');
    },
    ok: async () => {
      const v = readForm(f);
      let amount;
      try { amount = fmt.needPositive(v.amount, 'مبلغ'); } catch (e) { return U.toast(e.message, 'warn'); }
      if (amount > bal && v.currency === doc.currency) {
        const yes = await U.confirmBox({
          title: 'بیش از مانده؟', tone: 'warn', icon: 'i-alert', ok: 'ثبت کن',
          text: `مبلغی که نوشتید از مانده بیشتر است. اضافه به‌عنوان پیش‌پرداخت/پیش‌دریافت در حساب طرف می‌ماند.`,
          detail: `<div><span>مانده</span><b>${fmt.money(bal, doc.currency)}</b></div><div><span>مبلغ واردشده</span><b>${fmt.money(amount, doc.currency)}</b></div>`,
        });
        if (!yes) return;
        v.allow_over = 1;
      }
      const done = await U.confirmBox({
        title: `تأیید ${tx.payLabel.toLocaleLowerCase()}`, ok: tx.payVerb,
        detail: `<div><span>مبلغ</span><b>${fmt.money(amount, v.currency || doc.currency)}</b></div>
          <div><span>سند</span><b>${esc(doc.no)}</b></div>
          <div><span>حساب</span><b>${esc(store.findAccount(v.account_id)?.name || '—')}</b></div>`,
      });
      if (!done) return;
      try {
        await store.mutate('post', `/api/docs/${doc.id}/payment`, {
          amount: M.str(amount, 6), currency: v.currency, rate: v.rate || undefined, date: v.date,
          method_id: v.method_id || null, account_id: v.account_id || null, note: v.note, attachment: v.attachment || '', allow_over: v.allow_over || 0,
        }, { success: `${tx.payLabel} ثبت شد.` });
        s.close();
        onDone?.();
      } catch (e) { markErrors(f, e); U.toast(e.userMessage || 'ثبت نشد', 'danger', 6000); }
    },
  });
}

function openAttach(doc, onDone) {
  U.formSheet({
    title: 'افزودن پیوست',
    sub: 'تصویر فاکتور دست‌نویس یا رسید',
    ok: 'افزودن',
    fields: [imageField({ name: 'data', label: 'انتخاب تصویر', buttonLabel: 'انتخاب از گالری یا دوربین' })],
    onSubmit: async (v) => {
      if (!v.data) throw new Error('ابتدا یک تصویر انتخاب کنید.');
      await store.mutate('post', `/api/docs/${doc.id}/attachments`, { data: v.data, filename: `attach-${Date.now()}.jpg` }, { success: 'پیوست افزوده شد.' });
      onDone?.();
    },
  });
}
