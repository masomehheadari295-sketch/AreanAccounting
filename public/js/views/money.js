/**
 * money.js — دفتر پول: هزینه‌ها، برداشت و آوردهٔ صاحب کسب‌وکار، دریافت و پرداخت‌های آزاد.
 * این تراکنش‌ها در «فروش» و «سود» شمرده نمی‌شوند؛ فقط نقدینگی را تغییر می‌دهند.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, field, input, select, switchField, dateField, currencyField, imageField, searchBox, emptyState, esc, readForm, delegate } = U;

/** گونه‌های تراکنش که از این صفحه ثبت می‌شود */
const KIND = {
  expense: {
    label: 'هزینه', title: 'ثبت هزینه', verb: 'هزینه را ثبت کنید', icon: 'i-expense', tone: 'danger',
    hint: 'پولی که برای راه‌اندازی کار می‌دهید: کرایه، معاش، برق، ترانسپورت. این مبلغ با فروش اشتباه نشود.',
    needCat: true, sign: 'out',
  },
  other_income: {
    label: 'درآمد دیگر', title: 'ثبت درآمد دیگر', verb: 'درآمد را ثبت کنید', icon: 'i-arrow-down', tone: 'success',
    hint: 'پولی که از راه فروش نمی‌آید: اجارۀ دکان اضافه، فروش ضایعات، کمک یا سود بانکی.',
    needCat: false, sign: 'in',
  },
  drawing: {
    label: 'برداشت صاحب کار', title: 'برداشت شخصی', verb: 'برداشت را ثبت کنید', icon: 'i-briefcase', tone: 'warn',
    hint: 'پولی که برای مصارف شخصی از دکان برمی‌دارید. این مبلغ زیان نیست و در سود و زیان حساب نمی‌شود.',
    needCat: false, sign: 'out',
  },
  contribution: {
    label: 'آورده صاحب کار', title: 'آورده یا سرمایه', verb: 'آورده را ثبت کنید', icon: 'i-plus', tone: 'success',
    hint: 'پولی که خودتان به کسب‌وکار اضافه می‌کنید. این مبلغ فروش نیست، فقط نقدینگی را زیاد می‌کند.',
    needCat: false, sign: 'in',
  },
  refund: {
    label: 'بازگشت وجه', title: 'بازگشت وجه', verb: 'ثبت کنید', icon: 'i-swap', tone: 'muted',
    hint: 'پولی که به مشتری پس می‌دهید (مثلاً کالای مرجوعی نقدی).', needCat: false, sign: 'out',
  },
};

export default {
  name: 'money',
  title: () => 'پول و هزینه',
  sub: () => `<span class="muted small">هزینه، برداشت، آورده و دریافت/پرداخت‌های آزاد</span>`,
  async render({ root, params, query }) {
    if (location.hash.includes('/new')) return txForm(root, query.type || 'expense', query);
    if (params.id) return txDetail(root, +params.id, query);
    return list(root, query);
  },
};

/* ------------------------------ فهرست ------------------------------ */
async function list(root, query) {
  const st = { type: query.type || '', q: query.q || '', range: query.range || 'month', offset: 0 };
  const paint = async () => {
    let d;
    try {
      const qs = new URLSearchParams({ limit: '60', offset: String(st.offset) });
      if (st.type) qs.set('type', st.type);
      if (st.q) qs.set('q', st.q);
      qs.set('range', st.range);
      if (st.q) qs.set('include_void', '0');
      d = await api.get('/api/tx?' + qs.toString());
    } catch (e) {
      root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`;
      return delegate(root, { retry: paint });
    }
    const rows = d.rows || [];
    const byCur = d.by_currency || [];
    root.innerHTML = `<div class="wrap">
      ${card({
      class: 'card-flat',
      body: t`<div class="filters" style="border:0;padding:0">
          ${searchBox({ value: st.q, placeholder: 'جست‌وجو در توضیح، شخص یا سند…' })}
          ${U.rangeChips(st.range)}
        </div>
        <div class="chips" style="margin-top:8px">
          <button type="button" class="chip ${st.type === '' ? 'on' : ''}" data-act="type" data-type="">همه</button>
          ${Object.entries(KIND).map(([k, v]) => `<button type="button" class="chip ${st.type === k ? 'on' : ''}" data-act="type" data-type="${k}">${icon(v.icon, 'ic nano')}${esc(v.label)}</button>`).join('')}
        </div>`,
      footer: `<div class="btn-group">
          ${btn({ label: 'ثبت هزینه', icon: 'i-expense', variant: 'primary', small: true, attrs: `onclick="location.hash='#/money/new?type=expense'"` })}
          ${btn({ label: 'برداشت', icon: 'i-briefcase', variant: 'soft', small: true, attrs: `onclick="location.hash='#/money/new?type=drawing'"` })}
          ${btn({ label: 'آورده', icon: 'i-plus', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/money/new?type=contribution'"` })}
          ${btn({ label: 'جابه‌جایی حساب', icon: 'i-swap', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/accounts?transfer=1'"` })}
        </div>`,
    })}
      ${byCur.length ? card({
      title: 'جمع این دوره',
      hint: 'مبلغ‌ها در ستون اول همان ارز سند هستند؛ معادل افغانی جدا نشان داده می‌شود.',
      body: `<div class="cur-list">${byCur.map((r) => t`
        <div class="cur-item"><b>${esc(fmt.cur(r.currency).name)}</b>
          <span class="mono">${esc(fmt.money(r.amount, r.currency))}</span>
          <i class="muted small">≈ ${esc(fmt.money(r.base, fmt.base()))} · ${fmt.plain(r.count || 0)} ثبت</i></div>`).join('')}</div>`,
    }) : ''}
      ${rows.length ? `<div class="card card-flat"><div class="list">${rows.map(txRow).join('')}</div></div>`
        : emptyState({
          icon: 'i-expense', title: st.q || st.type ? 'چیزی با این فیلتر نیست' : 'هزینه‌ای ثبت نشده',
          text: st.q ? 'جست‌وجو را عوض کنید.' : 'اولین هزینهٔ کاری را ثبت کنید تا وضعیت نقدینگی و سود درست دیده شود.',
          action: btn({ label: 'ثبت هزینه', icon: 'i-plus', variant: 'primary', attrs: `onclick="location.hash='#/money/new?type=expense'"` }),
        })}
      ${rows.length >= 60 ? btn({ label: 'موردهای بیشتر', variant: 'ghost', wide: true, act: 'more' }) : ''}
    </div>`;
    delegate(root, {
      type: (n) => { st.type = n.dataset.type; paint(); },
      range: (n) => { st.range = n.dataset.range; paint(); },
      more: () => { st.offset += 60; paint(); },
      'clear-search': () => { st.q = ''; paint(); },
      open: (n) => { location.hash = `#/money/${n.dataset.id}`; },
      retry: paint,
    });
    const box = root.querySelector('.searchbox input');
    let timer; box?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = box.value.trim(); paint(); }, 400); });
  };
  await paint();
}

const txRow = (x) => {
  const k = KIND[x.type] || { label: fmt.txLabel(x.type), icon: fmt.txIcon(x.type), tone: 'brand' };
  const out = ['expense', 'payment', 'drawing', 'refund'].includes(x.type);
  const voided = !!x.void;
  return row({
    href: `#/money/${x.id}`,
    icon: voided ? 'i-close' : k.icon, tone: voided ? 'muted' : (k.tone || (out ? 'danger' : 'success')),
    title: `${esc(x.title || x.party_name || x.doc_no || k.label)}${voided ? ' ' + pill('لغو شده', 'muted') : ''}`,
    sub: `${fmt.date(x.date)} • ${esc(x.account_name || 'بدون حساب')}${x.category_name ? ` • ${esc(x.category_name)}` : ''}${x.doc_no ? ` • ${esc(x.doc_no)}` : ''}`,
    right: `<span class="row-amount"><span class="mono ${out ? 'amt-neg' : 'amt-pos'}">${out ? '−' : '+'}${esc(fmt.money(x.amount, x.currency))}</span>
      ${x.currency !== fmt.base() ? `<i class="muted small" style="font-style:normal">≈ ${esc(fmt.money(x.base_amount, fmt.base()))}</i>` : ''}</span>`,
  });
};

/* ------------------------------ فرم ثبت ------------------------------ */
async function txForm(root, type, query) {
  const k = KIND[type] || KIND.expense;
  document.getElementById('page-title').textContent = k.title;
  const accs = store.accounts();
  if (!accs.length) {
    root.innerHTML = `<div class="wrap">${emptyState({
      icon: 'i-wallet', title: 'اول یک حساب بسازید',
      text: 'هزینه و برداشت باید از یک صندوق یا حساب بانکی کم شود. یک حساب بسازید تا این فرم باز شود.',
      action: btn({ label: 'ساخت حساب', icon: 'i-plus', variant: 'primary', wide: true, attrs: `onclick="location.hash='#/accounts?new=1'"` }),
    })}</div>`;
    return;
  }
  const cats = store.categories('expense');
  const cur = accs.find((a) => a.id === +query.account_id) || accs.find((a) => a.currency === fmt.base()) || accs[0];
  root.innerHTML = `<div class="wrap wrap-form">
    ${card({
    title: k.verb,
    hint: k.hint,
    body: `<form class="form" data-onsubmit="save">
        <div class="grid-2">
          ${field({ label: 'مبلغ', name: 'amount', required: true, control: input({ name: 'amount', type: 'money', placeholder: 'مثلاً ۱۵۰۰', required: true, autofocus: 1 }) })}
          ${field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date' }) })}
        </div>
        ${currencyField({ name: 'cur', currency: cur.currency, rate: cur.currency === fmt.base() ? M.SCALE : store.lastRate(cur.currency) })}
        <div class="grid-2">
          ${field({ label: k.sign === 'out' ? 'از حساب' : 'به حساب', name: 'account_id', required: true, control: select({ name: 'account_id', value: cur.id, options: accs.filter((a) => a.active !== 0).map((a) => ({ value: a.id, label: `${a.name} — ${fmt.cur(a.currency).name} (${esc(fmt.money(a.balance, a.currency))})` })) }), hint: 'موجودی این حساب بعد از ثبت کم/زیاد می‌شود.' })}
          ${k.needCat ? field({ label: 'نوع هزینه', name: 'category_id', control: select({ name: 'category_id', value: query.category || '', placeholder: '— انتخاب کنید —', options: cats.map((c) => ({ value: c.id, label: c.name })) }), hint: 'برای گزارش هزینه‌ها بر اساس نوع.' }) : ''}
        </div>
        ${k.needCat ? `<div class="chips">${cats.slice(0, 8).map((c) => `<button type="button" class="chip" data-act="cat" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}
        ${field({ label: 'توضیح کوتاه', name: 'title', control: input({ name: 'title', placeholder: type === 'expense' ? 'مثلاً: کرایهٔ ماه میزان' : type === 'drawing' ? 'مثلاً: خرید خانگی' : 'مثلاً: آوردۀ نقدی' }) })}
        <details class="more"><summary>گزینه‌های بیشتر</summary>
          ${field({ label: 'توضیح بیشتر', name: 'note', control: U.textarea({ name: 'note', rows: 2, placeholder: 'هر نکته‌ای که بعداً به یادتان می‌آورد' }) })}
          ${field({ label: 'ربط به فاکتور (اختیاری)', name: 'doc_id', control: input({ name: 'doc_id', type: 'number', placeholder: 'شمارهٔ سند' }) })}
          ${switchField({ name: 'need_attach', checked: false, label: 'عکس رسید را هم اضافه کن' })}
        </details>
        <div class="attach-slot" data-slot hidden>${imageField({ name: 'attachment', label: 'تصویر رسید', buttonLabel: 'انتخاب تصویر رسید' })}</div>
        <div class="sticky-bar">
          ${btn({ label: k.verb, type: 'submit', variant: 'primary', wide: true, icon: 'i-check' })}
        </div>
      </form>`,
  })}
    <p class="muted small center">${type === 'expense' || type === 'drawing' || type === 'contribution'
      ? 'این مبلغ در «فروش» و «سود» حساب نمی‌شود؛ فقط نقدینگی و گزارش هزینه‌ها را تغییر می‌دهد.'
      : 'این مبلغ فروش نیست؛ فقط نقدینگی را تغییر می‌دهد.'}</p>
  </div>`;
  const f = root.querySelector('form');
  const slot = root.querySelector('[data-slot]');
  f.querySelector('[name=need_attach]')?.addEventListener('change', (e) => { slot.hidden = !e.target.checked; });
  let cat = query.category || '';
  const syncCur = () => {
    const id = +f.querySelector('[name=account_id]').value;
    const a = store.findAccount(id);
    if (!a) return;
    const sel = f.querySelector('[name=cur_currency]');
    if (sel) { sel.value = a.currency; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  f.querySelector('[name=account_id]')?.addEventListener('change', syncCur);
  syncCur();
  delegate(root, {
    cat: (n) => { cat = n.dataset.cat; f.querySelector('[name=category_id]').value = cat; root.querySelectorAll('[data-act=cat]').forEach((x) => x.classList.toggle('on', x.dataset.cat === cat)); },
    save: async (form) => {
      const v = readForm(form);
      const amount = M.parse(v.amount);
      if (!amount || amount <= 0n) return U.toast('مبلغ را درست وارد کنید (مثلاً ۱۵۰۰).', 'warn');
      const body = {
        type, amount: M.toDb(amount), currency: v.cur_currency || cur.currency,
        rate: v.cur_rate || '', date: v.date, account_id: v.account_id,
        category_id: k.needCat ? (v.category_id || null) : null,
        title: v.title || '', note: v.note || '', doc_id: v.doc_id || null,
        attachment: v.attachment || '',
      };
      try {
        const r = await store.mutate('post', '/api/tx', body, { success: `${k.label} ثبت شد.` });
        if (v.attachment) {
          await store.mutate('post', `/api/tx/${r.tx.id}/attachment`, { data: v.attachment }, { quiet: true, success: '' });
        }
        location.hash = '#/money';
      } catch (e) { U.toast(e.userMessage || e.message || 'ثبت نشد', 'danger', 6000); }
    },
  });
}

/* ------------------------------ جزئیات تراکنش ------------------------------ */
async function txDetail(root, id, query) {
  let x;
  try { x = (await api.get(`/api/tx/${id}?include_void=1`)).tx; }
  catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: () => txDetail(root, id, query) }); }
  if (!x) { root.innerHTML = `<div class="wrap">${emptyState({ title: 'موردی پیدا نشد', action: btn({ label: 'بازگشت', attrs: `onclick="history.back()"` }) })}</div>`; return; }
  const k = KIND[x.type] || { label: fmt.txLabel(x.type), icon: fmt.txIcon(x.type) };
  const base = fmt.base();
  const acc = store.findAccount(x.account_id);
  document.getElementById('page-title').textContent = k.label;
  root.innerHTML = `<div class="wrap">
    ${card({
    title: `${icon(k.icon, 'ic nano')} ${esc(x.title || k.label)}`,
    action: x.void ? pill('لغو شده', 'muted', 'i-close') : pill(k.label, x.type === 'expense' ? 'danger' : 'success'),
    body: `<div class="summary">
        <div><span>مبلغ</span><b>${esc(fmt.money(x.amount, x.currency))}</b><i class="muted small">${esc(fmt.cur(x.currency).name)}</i></div>
        <div><span>معادل</span><b>${esc(fmt.money(x.base_amount, base))}</b><i class="muted small">نرخ ثبت‌شده: ${esc(fmt.rateStr(x.rate))}</i></div>
        <div><span>تاریخ</span><b>${fmt.date(x.date)}</b></div>
        <div><span>${k.sign === 'out' ? 'از حساب' : 'به حساب'}</span><b>${esc(x.account_name || '—')}</b>${acc ? `<i class="muted small">ماندهٔ فعلی: ${esc(fmt.money(acc.balance, acc.currency))}</i>` : ''}</div>
        ${x.to_account_name ? `<div><span>به حساب</span><b>${esc(x.to_account_name)}</b><i class="muted small">${esc(fmt.money(x.to_amount, x.to_currency))}</i></div>` : ''}
        ${M.fromDb(String(x.fee)) > 0n ? `<div><span>کارمزد</span><b>${esc(fmt.money(x.fee, x.currency))}</b></div>` : ''}
        ${x.category_name ? `<div><span>نوع هزینه</span><b>${esc(x.category_name)}</b></div>` : ''}
        ${x.party_name ? `<div><span>شخص</span><b>${esc(x.party_name)}</b></div>` : ''}
        ${x.doc_no ? `<div><span>سند</span><b>${esc(x.doc_no)}</b></div>` : ''}
      </div>
      ${x.note ? U.note(esc(x.note), 'info') : ''}
      ${x.attachment ? `<a class="att" href="${esc(x.attachment)}" target="_blank" rel="noopener">${icon('i-eye', 'ic nano')} دیدن تصویر رسید</a>` : ''}
      ${x.void ? U.note(`این ثبت لغو شده است.${x.void_reason ? ` دلیل: ${esc(x.void_reason)}` : ''} مبلغ به حساب برگشت داده شد.`, 'warn') : ''}`,
    footer: x.void ? '' : `<div class="btn-group">
        ${['expense', 'other_income', 'drawing', 'contribution'].includes(x.type) ? btn({ label: 'ویرایش مبلغ', icon: 'i-edit', variant: 'soft', small: true, act: 'edit' }) : ''}
        ${!x.doc_id ? btn({ label: 'لغو این ثبت', icon: 'i-trash', variant: 'ghost', small: true, act: 'void' }) : U.note('این ثبت به یک فاکتور متصل است؛ برای تصحیح، از صفحهٔ فاکتور استفاده کنید.', 'info')}
      </div>`,
  })}
  </div>`;
  delegate(root, {
    edit: () => {
      U.formSheet({
        title: 'ویرایش ' + k.label,
        sub: 'فقط مبلغ، تاریخ و توضیح قابل تغییر است.',
        ok: 'ذخیره',
        fields: [
          field({ label: 'مبلغ', name: 'amount', control: input({ name: 'amount', type: 'money', value: fmt.inputValue(x.amount) }) }),
          field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date', value: x.date }) }),
          field({ label: 'توضیح', name: 'title', control: input({ name: 'title', value: x.title || '' }) }),
          field({ label: 'یادداشت', name: 'note', control: U.textarea({ name: 'note', rows: 2, value: x.note || '' }) }),
        ],
        validate: (v) => { const a = M.parse(v.amount); if (!a || a <= 0n) throw new Error('مبلغ را درست وارد کنید.'); },
        onSubmit: async (v) => {
          try {
            await store.mutate('put', `/api/tx/${x.id}`, { amount: v.amount, date: v.date, title: v.title, note: v.note, account_id: x.account_id }, { success: 'تغییر ذخیره شد.' });
            txDetail(root, id, query); return true;
          } catch (e) { U.toast(e.userMessage || 'ذخیره نشد', 'danger', 6000); return false; }
        },
      });
    },
    void: async () => {
      const yes = await U.confirmBox({
        title: 'لغو این ثبت؟',
        text: 'مبلغ به حساب برمی‌گردد و در گزارش‌ها شمرده نمی‌شود. خودِ ثبت هم با علامت «لغو شده» باقی می‌ماند تا سابقه از بین نرود.',
        detail: `${esc(x.title || k.label)} — ${esc(fmt.money(x.amount, x.currency))} در ${fmt.date(x.date)}`,
        ok: 'لغو کن', danger: true, check: 'می‌خواهم این ثبت را لغو کنم',
      });
      if (!yes) return;
      const reason = await U.promptBox({ title: 'دلیل لغو', text: 'یک خط بنویسید تا در سابقه بماند.', placeholder: 'مثلاً: اشتباهی ثبت شد', ok: 'ثبت لغو' });
      if (reason === null) return;
      try {
        await store.mutate('post', `/api/tx/${x.id}/void`, { reason }, { success: 'ثبت لغو شد و حساب اصلاح گردید.' });
        txDetail(root, id, query);
      } catch (e) { U.toast(e.userMessage || 'لغو نشد', 'danger', 6000); }
    },
  });
}

export { KIND };
