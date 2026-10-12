/**
 * accounts.js — صندوق‌ها و حساب‌های بانکی: مانده به تفکیک ارز، جابه‌جایی بین حساب‌ها، گردش هر حساب.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, kpi, field, input, select, switchField, segmented, dateField, emptyState, esc, readForm, delegate } = U;

export default {
  name: 'accounts',
  title: () => 'صندوق و بانک',
  sub: () => `<span class="muted small">هر حساب یک ارز دارد؛ ارزها با هم جمع نمی‌شوند</span>`,
  async render({ root, params, query }) {
    if (query.new === '1') { accountForm(null, () => this.render({ root, params, query })); return; }
    if (query.transfer === '1') { transferSheet(() => this.render({ root, params, query })); return; }
    if (params.id) return detail(root, +params.id, query);
    return list(root, query, () => this.render({ root, params, query }));
  },
};

async function list(root, query, again) {
  let rows = [];
  try { rows = (await api.get('/api/accounts')).rows; }
  catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: again }); }
  const base = fmt.base();
  const byCur = {};
  let neg = 0;
  for (const a of rows) {
    const bal = M.fromDb(String(a.balance ?? '0'));
    if (bal < 0n) neg += 1;
    byCur[a.currency] = byCur[a.currency] || { cur: a.currency, bal: 0n, base: 0n, names: [] };
    byCur[a.currency].bal += bal;
    byCur[a.currency].base += M.mul(bal, store.lastRate(a.currency));
    for (const [c, v] of Object.entries(a.by_currency || {})) {
      if (c === a.currency) continue;
      byCur[c] = byCur[c] || { cur: c, bal: 0n, base: 0n, names: [] };
      byCur[c].bal += M.fromDb(String(v));
      byCur[c].base += M.mul(M.fromDb(String(v)), store.lastRate(c));
    }
  }
  root.innerHTML = `<div class="wrap">
    ${rows.length ? t`<section class="kpis">
      ${kpi({ label: `جمع نقدینگی (${fmt.cur(base).name})`, value: fmt.money(Object.values(byCur).reduce((s, r) => s + r.base, 0n), base), sub: 'معادل ارز پایه، بر پایهٔ نرخ هر سند', icon: 'i-wallet', tone: 'accent', hint: 'مبلغی که همین حالا در صندوق‌ها و بانک‌ها دارید.' })}
      ${kpi({ label: 'حساب‌ها', value: fmt.plain(rows.length), sub: `${fmt.plain(rows.filter((a) => a.kind === 'cash').length)} صندوق · ${fmt.plain(rows.filter((a) => a.kind === 'bank').length)} بانک`, icon: 'i-bank', tone: 'brand' })}
      ${kpi({ label: 'حساب‌های منفی', value: fmt.plain(neg), sub: neg ? 'بررسی کنید — معمولاً جای اشتباهی ثبت شده' : 'همه معمولی است', icon: 'i-alert', tone: neg ? 'danger' : 'success', badge: neg ? 'نیاز به بررسی' : 'سالم', badgeTone: neg ? 'danger' : 'success' })}
    </section>` : ''}
    ${rows.length ? `<div class="card card-flat"><div class="list">${rows.map((a) => row({
      href: `#/accounts/${a.id}`,
      icon: a.kind === 'bank' ? 'i-bank' : 'i-wallet',
      tone: M.fromDb(String(a.balance ?? '0')) < 0n ? 'danger' : 'success',
      title: `${esc(a.name)}${a.active === 0 ? ' <span class="muted small">(بایگان)</span>' : ''}`,
      sub: `${a.kind === 'bank' ? 'حساب بانکی' : 'صندوق نقدی'} • ${esc(fmt.cur(a.currency).name)}${a.bank_name ? ` • ${esc(a.bank_name)}` : ''}${a.doc_count ? ` • ${fmt.plain(a.doc_count)} ثبت` : ''}`,
      right: `<span class="row-amount"><span class="mono">${esc(fmt.money(a.balance, a.currency))}</span>${a.currency !== base ? `<i class="muted small" style="font-style:normal">≈ ${esc(fmt.money(a.balance_base, base))}</i>` : ''}</span>`,
    })).join('')}</div>
      <div class="card-foot btn-group">
        ${btn({ label: 'جابه‌جایی بین حساب‌ها', icon: 'i-swap', variant: 'primary', small: true, act: 'transfer' })}
        ${btn({ label: 'حساب تازه', icon: 'i-plus', variant: 'soft', small: true, act: 'new' })}
      </div></div>`
      : emptyState({
        icon: 'i-wallet', title: 'هنوز حسابی ندارید',
        text: 'یک صندوق نقدی بسازید تا دریافت و پرداخت‌ها ثبت شود. اگر حساب بانکی دارید، آن را هم اضافه کنید.',
        action: `<div class="btn-group">${btn({ label: 'ساخت صندوق نقدی', icon: 'i-plus', variant: 'primary', act: 'new', data: 'kind="cash"' })}${btn({ label: 'ساخت حساب بانکی', icon: 'i-bank', variant: 'soft', act: 'new', data: 'kind="bank"' })}</div>`,
      })}
    ${Object.keys(byCur).length ? card({
      title: 'مانده به تفکیک ارز',
      hint: 'هر ارز جدا نگه داشته می‌شود؛ ستون معادل فقط برای مقایسه است.',
      body: `<div class="cur-list">${Object.values(byCur).map((r) => t`
        <div class="cur-item"><b>${esc(fmt.cur(r.cur).name)}</b><span class="mono">${esc(fmt.money(r.bal, r.cur))}</span>
        <i class="muted small">≈ ${esc(fmt.money(r.base, base))} در ${esc(fmt.cur(base).name)}</i></div>`).join('')}</div>`,
      footer: `<a class="btn btn-ghost small" href="#/reports/accounts">گزارش گردش حساب‌ها</a><a class="btn btn-ghost small" href="#/rates">نرخ ارز</a>`,
    }) : ''}
  </div>`;
  delegate(root, {
    new: (n) => accountForm(n.dataset.kind ? { kind: n.dataset.kind } : null, again),
    transfer: () => transferSheet(again),
    retry: again,
  });
}

async function detail(root, id, query) {
  let rows;
  try { rows = (await api.get('/api/reports/accounts?from=2000-01-01&to=2100-01-01')); }
  catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: () => detail(root, id, query) }); }
  const arr = Array.isArray(rows) ? rows : rows.rows || [];
  const a = arr.find((x) => x.id === id);
  if (!a) { root.innerHTML = `<div class="wrap">${emptyState({ title: 'حساب پیدا نشد' })}</div>`; return; }
  document.getElementById('page-title').textContent = a.name;
  const entries = (a.entries || []).slice().reverse();
  const base = fmt.base();
  root.innerHTML = `<div class="wrap">
    ${card({
    title: a.kind === 'bank' ? 'حساب بانکی' : 'صندوق نقدی',
    action: a.active === 0 ? pill('بایگان', 'muted') : pill('فعال', 'success', 'i-check'),
    body: `<div class="summary">
        <div><span>ماندهٔ فعلی</span><b>${esc(fmt.money(a.balance, a.currency))}</b><i class="muted small">در ${esc(fmt.cur(a.currency).name)}</i></div>
        <div><span>معادل</span><b>${esc(fmt.money(a.base, base))}</b><i class="muted small">${esc(fmt.cur(base).name)}</i></div>
        <div><span>مانده اول دوره</span><b>${esc(fmt.money(a.opening, a.currency))}</b></div>
        <div><span>واریز به این حساب</span><b>${esc(fmt.money(a.moved_in, a.currency))}</b></div>
        <div><span>برداشت از این حساب</span><b>${esc(fmt.money(a.moved_out, a.currency))}</b></div>
        <div><span>تعداد ثبت</span><b>${fmt.plain(a.entry_count)}</b></div>
      </div>
      ${Object.keys(a.by_currency || {}).length > 1 ? note(`این حساب در ${fmt.plain(Object.keys(a.by_currency).length)} ارز ثبت دارد و هر کدام جدا نگه داشته شده است: ${Object.entries(a.by_currency).map(([c, v]) => `${esc(fmt.cur(c).name)} ${esc(fmt.money(v, c))}`).join('، ')}`, 'info') : ''}
      ${a.note ? note(esc(a.note), 'info') : ''}
      ${a.bank_name || a.account_no ? `<p class="muted small">${esc([a.bank_name, a.account_no && `شماره حساب: ${a.account_no}`, a.card_no && `کارت: ${a.card_no}`].filter(Boolean).join(' • '))}</p>` : ''}`,
    footer: `<div class="btn-group">
        ${btn({ label: 'افزودن به این حساب', icon: 'i-arrow-down', variant: 'primary', small: true, act: 'in' })}
        ${btn({ label: 'برداشت از این حساب', icon: 'i-arrow-up', variant: 'soft', small: true, act: 'out' })}
        ${btn({ label: 'جابه‌جایی', icon: 'i-swap', variant: 'ghost', small: true, act: 'transfer' })}
        ${btn({ label: 'ویرایش', icon: 'i-edit', variant: 'ghost', small: true, act: 'edit' })}
      </div>`,
  })}
    ${card({
    title: 'گردش حساب',
    hint: 'دریافت‌ها، پرداخت‌ها، هزینه‌ها و جابه‌جایی‌ها — از تازه به کهنه.',
    class: 'card-flat',
    body: entries.length ? `<div class="list">${entries.map((e) => row({
      arrow: false,
      icon: fmt.txIcon(e.type), tone: M.fromDb(String(e.amount)) >= 0n ? 'success' : 'danger',
      title: `${esc(fmt.txLabel(e.type))}${e.memo ? ` — ${esc(e.memo)}` : ''}`,
      sub: `${fmt.date(e.date)}${e.doc_no ? ` • سند ${esc(e.doc_no)}` : ''}`,
      right: `<span class="mono ${M.fromDb(String(e.amount)) >= 0n ? 'amt-pos' : 'amt-neg'}">${esc(fmt.money(e.amount, e.currency))}</span>`,
    })).join('')}</div>` : emptyState({ icon: 'i-clock', title: 'هنوز ثبتی ندارد', text: 'اولین دریافت یا پرداخت را روی این حساب بیاورید.' }),
  })}
  </div>`;
  delegate(root, {
    edit: () => accountForm(a, () => detail(root, id, query)),
    transfer: () => transferSheet(() => detail(root, id, query), a.id),
    in: () => txSheet({ type: 'contribution', account_id: a.id }, () => detail(root, id, query)),
    out: () => txSheet({ type: 'drawing', account_id: a.id }, () => detail(root, id, query)),
  });
}
const note = (text, tone) => U.note(text, tone);

/* ------------------------------ فرم حساب ------------------------------ */
function accountForm(a, onDone) {
  const editing = !!(a && a.id);
  const d = a || { kind: 'cash', currency: fmt.base() };
  U.formSheet({
    title: editing ? `ویرایش ${U.esc(d.name)}` : 'حساب تازه',
    sub: 'نوع حساب و ارز آن را مشخص کنید. موجودی اول دوره اختیاری است.',
    ok: editing ? 'ذخیره' : 'ساخت حساب',
    fields: [
      field({ label: 'نام حساب', name: 'name', required: true, control: input({ name: 'name', value: d.name || '', placeholder: 'مثلاً: صندوق دکان', required: true }) }),
      field({
        label: 'نوع', name: 'kind', control: segmented({ name: 'kind', value: d.kind || 'cash', items: [{ value: 'cash', label: 'صندوق نقدی', icon: 'i-wallet' }, { value: 'bank', label: 'حساب بانکی', icon: 'i-bank' }] }),
        hint: 'صندوق = پول دست شما. بانک = حساب بانکی.',
      }),
      field({
        label: 'ارز این حساب', name: 'currency', control: select({ name: 'currency', value: d.currency || fmt.base(), options: fmt.activeCurrencies().map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })) }),
        hint: 'ارز حساب مشخص می‌کند پول‌های این حساب با چه واحدی نگه داشته می‌شود.',
      }),
      field({ label: 'موجودی اول دوره', name: 'opening', control: input({ name: 'opening', type: 'money', value: fmt.inputValue(d.opening || '0'), placeholder: '۰' }), hint: 'هرچه همین حالا در صندوق یا بانک دارید. این مبلغ به‌عنوان موجودی اول ثبت می‌شود.' })
      ,
      field({ label: 'نام بانک', name: 'bank_name', control: input({ name: 'bank_name', value: d.bank_name || '', placeholder: 'مثلاً: بانک آزادی' }) }),
      t`<div class="grid-2">
        ${field({ label: 'شماره حساب', name: 'account_no', control: input({ name: 'account_no', value: d.account_no || '' }) })}
        ${field({ label: 'شماره کارت', name: 'card_no', control: input({ name: 'card_no', value: d.card_no || '' }) })}
      </div>`,
      field({ label: 'یادداشت', name: 'note', control: U.textarea({ name: 'note', rows: 2, value: d.note || '' }) }),
      editing ? switchField({ name: 'active', checked: a.active !== 0, label: 'فعال', hint: 'خاموش = پنهان از فهرست انتخاب‌ها، بدون حذف سابقه' }) : '',
    ],
    validate: (v) => { if (!v.name?.trim()) throw new Error('نام حساب را بنویسید.'); },
    onSubmit: async (v) => {
      const body = { name: v.name.trim(), kind: v.kind, currency: v.currency, opening: v.opening || '0', bank_name: v.bank_name || '', account_no: v.account_no || '', card_no: v.card_no || '', note: v.note || '', active: v.active === undefined ? 1 : (v.active ? 1 : 0) };
      try {
        if (editing) await store.mutate('put', `/api/accounts/${a.id}`, body, { success: 'حساب به‌روز شد.' });
        else await store.mutate('post', '/api/accounts', body, { success: 'حساب ساخته شد.' });
        onDone?.();
        return true;
      } catch (e) { return false; }
    },
  });
}

/* ------------------------------ جابه‌جایی بین حساب‌ها ------------------------------ */
function transferSheet(onDone, fromId) {
  const accs = store.accounts();
  if (accs.length < 2) { U.toast('برای جابه‌جایی به دو حساب نیاز است — اول یک حساب تازه بسازید.', 'warn', 5200); return; }
  const s = U.sheet({
    title: 'جابه‌جایی بین حساب‌ها',
    sub: 'مثلاً برداشتن پول از بانک برای صندوق دکان. ارز مبدأ و مقصد می‌تواند فرق کند؛ نرخ همان روز ثبت می‌شود.',
    body: `<form class="form" data-onsubmit="go">
      <div class="grid-2">
        ${field({ label: 'از حساب', name: 'from', required: true, control: select({ name: 'from', value: fromId || accs[0].id, options: accs.map((x) => ({ value: x.id, label: `${x.name} — ${fmt.cur(x.currency).name}` })) }) })}
        ${field({ label: 'به حساب', name: 'to', required: true, control: select({ name: 'to', options: accs.map((x) => ({ value: x.id, label: `${x.name} — ${fmt.cur(x.currency).name}` }), ), value: accs.find((x) => x.id !== (fromId || accs[0].id))?.id }) })}
      </div>
      ${field({ label: 'مبلغ از حساب مبدأ', name: 'amount', required: true, control: input({ name: 'amount', type: 'money', placeholder: 'مثلاً ۵۰۰۰' }) })}
      <div class="hintbox" data-transfer-hint></div>
      <div class="grid-2">
        ${field({ label: 'کارمزد (اختیاری)', name: 'fee', control: input({ name: 'fee', type: 'money', placeholder: '۰' }), hint: 'از همان حساب مبدأ کم می‌شود.' })}
        ${field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date' }) })}
      </div>
      ${field({ label: 'توضیح', name: 'note', control: input({ name: 'note', placeholder: 'مثلاً: برای پرداخت کرایه' }) })}
      ${btn({ label: 'انتقال مبلغ', type: 'submit', wide: true })}
    </form>`,
  });
  const fromSel = s.body.querySelector('[name=from]');
  const toSel = s.body.querySelector('[name=to]');
  const amt = s.body.querySelector('[name=amount]');
  const hint = s.body.querySelector('[data-transfer-hint]');
  const rateOf = (code) => (code === fmt.base() ? M.SCALE : M.fromDb(String(store.lastRate(code) || M.SCALE)));
  const calc = () => {
    const f = accs.find((x) => x.id === +fromSel.value);
    const to = accs.find((x) => x.id === +toSel.value);
    if (!f || !to) return;
    const a = M.parse(amt.value);
    if (!a || a <= 0n) { hint.innerHTML = 'مبلغ را وارد کنید.'; return; }
    if (f.currency === to.currency) { hint.innerHTML = `هر دو حساب ${esc(fmt.cur(f.currency).name)} است؛ ${esc(fmt.money(a, f.currency))} منتقل می‌شود.`; return; }
    const rf = rateOf(f.currency); const rt = rateOf(to.currency);
    const baseAmt = M.mul(a, rf);
    const out = rt > 0n ? M.div(baseAmt, rt) : 0n;
    hint.innerHTML = `نرخ ثبت‌شدهٔ امروز: ${esc(fmt.cur(f.currency).name)} ${esc(fmt.rateStr(rf))} · ${esc(fmt.cur(to.currency).name)} ${esc(fmt.rateStr(rt))}<br>
      <b>${esc(fmt.money(a, f.currency))}</b> ≈ <b>${esc(fmt.money(out, to.currency))}</b> به حساب مقصد می‌نشیند.`;
  };
  [fromSel, toSel].forEach((n) => n?.addEventListener('change', calc));
  amt?.addEventListener('input', calc);
  calc();
  delegate(s.body, {
    go: async (f) => {
      const v = readForm(f);
      if (+v.from === +v.to) return U.toast('حساب مبدأ و مقصد باید فرق کند.', 'warn');
      try {
        await store.mutate('post', '/api/tx', { type: 'transfer', account_id: v.from, to_account_id: v.to, amount: v.amount, fee: v.fee || '0', date: v.date, note: v.note || '' }, { success: 'جابه‌جایی ثبت شد.' });
        s.close(); onDone?.();
      } catch (e) { U.toast(e.userMessage || e.message || 'ثبت نشد', 'danger', 6000); }
    },
  });
}

/* ------------------------------ دریافت/پرداخت سریع از صفحهٔ حساب ------------------------------ */
function txSheet(prefill, onDone) {
  const drawing = prefill.type === 'drawing';
  U.formSheet({
    title: drawing ? 'برداشت شخصی صاحب کسب‌وکار' : 'افزودن به حساب',
    sub: drawing ? 'پولی که برای مصارف شخصی از دکان برمی‌دارید. این مبلغ زیان یا هزینهٔ کاری نیست.' : 'پولی که به‌صورت قرض، سرمایه یا تصفیه به حساب می‌آید.',
    ok: 'ثبت',
    fields: [
      t`<div class="grid-2">
        ${field({ label: 'مبلغ', name: 'amount', required: true, control: input({ name: 'amount', type: 'money', placeholder: '۰' }) })}
        ${field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date' }) })}
      </div>`,
      field({ label: 'حساب', name: 'account_id', control: select({ name: 'account_id', value: prefill.account_id, options: store.accounts().map((a) => ({ value: a.id, label: `${a.name} — ${fmt.cur(a.currency).name}` })) }) }),
      field({ label: 'توضیح', name: 'title', control: input({ name: 'title', placeholder: drawing ? 'مثلاً: مخارج خانه' : 'مثلاً: آوردۀ نقدی' }) }),
    ],
    validate: (v) => { if (!M.parse(v.amount) || M.parse(v.amount) <= 0n) throw new Error('مبلغ را درست وارد کنید.'); },
    onSubmit: async (v) => {
      try {
        await store.mutate('post', '/api/tx', { type: prefill.type, amount: v.amount, account_id: v.account_id, date: v.date, title: v.title || '', note: '' }, { success: 'ثبت شد.' });
        onDone?.(); return true;
      } catch (e) { return false; }
    },
  });
}
