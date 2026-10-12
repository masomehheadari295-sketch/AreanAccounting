/**
 * parties.js — مشتریان و تأمین‌کنندگان: فهرست، ماندهٔ حساب، سابقه و فرم افزودن/ویرایش.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, note, field, input, select, switchField, searchBox, emptyState, statusPill, esc, readForm, delegate } = U;

export default {
  name: 'parties',
  title: () => 'مشتریان و تأمین‌کنندگان',
  sub: () => `<span class="muted small">اطلاعات تماس، مانده و سابقهٔ هر شخص</span>`,
  async render({ root, params, query }) {
    if (params.id) return detail(root, +params.id);
    return list(root, query);
  },
};

async function list(root, query) {
  const state = { kind: query.kind || 'all', q: query.q || '' };
  const paint = async () => {
    let rows = [];
    try { rows = (await api.get(`/api/parties?kind=${state.kind}&q=${encodeURIComponent(state.q)}`)).rows; }
    catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: paint }); }
    const sums = {};
    for (const r of rows) {
      for (const b of r.balances || []) {
        sums[b.currency] = sums[b.currency] || { bal: 0n, adv: 0n };
        sums[b.currency].bal += M.fromDb(String(b.balance));
        sums[b.currency].adv += M.fromDb(String(b.advance));
      }
    }
    root.innerHTML = `<div class="wrap">
      ${card({
      class: 'card-flat',
      body: `<div class="filters" style="border:0;padding:0">
          ${searchBox({ value: state.q, placeholder: 'نام، تلفن یا نفر تماس…' })}
          ${U.segmented({ value: state.kind, act: 'kind', items: [{ value: 'all', label: 'همه' }, { value: 'customer', label: 'مشتریان', icon: 'i-sale' }, { value: 'supplier', label: 'تأمین‌کنندگان', icon: 'i-buy' }] })}
        </div>`,
      footer: `<div class="btn-group">
          ${btn({ label: 'مشتری تازه', icon: 'i-plus', variant: 'primary', small: true, act: 'new', data: 'customer' })}
          ${btn({ label: 'تأمین‌کنندهٔ تازه', icon: 'i-plus', variant: 'soft', small: true, act: 'new', data: 'supplier' })}
        </div>`,
    })}
      ${Object.keys(sums).length ? card({
      title: 'خلاصهٔ مانده‌ها',
      hint: 'طلب و بدهی به تفکیک ارز (افزونهٔ ارزی با هم جمع نمی‌شود).',
      body: `<div class="cur-list">${Object.entries(sums).map(([c, v]) => t`
        <div class="cur-item"><b>${esc(fmt.cur(c).name)}</b>
        <span class="mono">${esc(fmt.money(v.bal, c))}</span>
        <i class="muted small">${v.adv > 0n ? `پیش‌پرداخت/پیش‌دریافت: ${esc(fmt.money(v.adv, c))}` : 'مجموع ماندهٔ اسناد باز'}</i></div>`).join('')}</div>`,
    }) : ''}
      ${rows.length ? `<div class="card card-flat"><div class="list">${rows.map((p) => row({
      href: `#/parties/${p.id}`,
      icon: p.kind === 'supplier' ? 'i-buy' : p.kind === 'both' ? 'i-swap' : 'i-users',
      tone: p.active === 0 ? 'muted' : (p.balances || []).some((b) => M.fromDb(String(b.balance)) > 0n) ? 'warn' : 'brand',
      title: `${esc(p.name)}${p.active === 0 ? ' <span class="muted small">(بایگان)</span>' : ''}`,
      sub: `${p.kind === 'both' ? 'مشتری و تأمین‌کننده' : p.kind === 'supplier' ? 'تأمین‌کننده' : 'مشتری'}${p.phone ? ` • ${esc(p.phone)}` : ''} • ${fmt.plain(p.doc_count)} سند`,
      right: `<span class="row-amount">${(p.balances || []).filter((b) => M.fromDb(String(b.balance)) > 0n).slice(0, 2).map((b) => `<span class="mono">${esc(fmt.money(b.balance, b.currency))}</span>`).join('') || '<i class="muted small" style="font-style:normal">بی‌مانده</i>'}</span>`,
    })).join('')}</div></div>` : emptyState({
      icon: 'i-users', title: state.q ? 'موردی پیدا نشد' : 'فهرست خالی است',
      text: state.q ? 'جست‌وجو را تغییر دهید.' : 'با افزودن یک مشتری، راه فروش نسیه و پیگیری طلب باز می‌شود.',
      action: btn({ label: 'افزودن مشتری', icon: 'i-plus', variant: 'primary', act: 'new', data: 'customer' }),
    })}
    </div>`;
    delegate(root, {
      kind: (n) => { state.kind = n.dataset.value; paint(); },
      new: (n) => partyForm(null, n.dataset.data, paint),
      'clear-search': () => { state.q = ''; paint(); },
      retry: paint,
    });
    const box = root.querySelector('.searchbox input');
    let timer; box?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = box.value.trim(); paint(); }, 400); });
  };
  await paint();
}

async function detail(root, id) {
  let d, docs;
  try {
    d = (await api.get(`/api/parties?kind=all&q=${encodeURIComponent('')}`)).rows.find((x) => x.id === id);
    docs = (await api.get(`/api/docs?party=${id}&limit=100`)).rows;
  } catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: () => detail(root, id) }); }
  if (!d) { root.innerHTML = `<div class="wrap">${emptyState({ title: 'شخص پیدا نشد' })}</div>`; return; }
  document.getElementById('page-title').textContent = d.name;
  const bal = d.balances || [];
  const totalBase = bal.reduce((s, b) => s + M.mul(M.fromDb(String(b.balance)), store.lastRate(b.currency)), 0n);
  root.innerHTML = `<div class="wrap">
    ${card({
    title: d.kind === 'supplier' ? 'تأمین‌کننده' : d.kind === 'both' ? 'مشتری و تأمین‌کننده' : 'مشتری',
    action: d.active === 0 ? pill('بایگان', 'muted') : pill('فعال', 'success', 'i-check'),
    body: `<div class="profile">
        <div class="profile-av">${icon(d.kind === 'supplier' ? 'i-buy' : 'i-users')}</div>
        <div class="profile-body">
          <h2>${esc(d.name)}</h2>
          ${d.contact ? `<p class="muted small">نفر تماس: ${esc(d.contact)}</p>` : ''}
          ${d.phone ? `<a class="chip" href="tel:${esc(d.phone)}">${icon('i-info', 'ic nano')}${esc(d.phone)}</a>` : ''}
          ${d.email ? `<a class="chip" href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : ''}
        </div>
      </div>
      ${d.address ? note('نشانی: ' + esc(d.address)) : ''}
      ${d.note ? note(esc(d.note), 'info') : ''}
      <div class="summary">
        ${bal.length ? bal.map((b) => `<div><span>${esc(fmt.cur(b.currency).name)}</span><b>${esc(fmt.money(b.balance, b.currency))}</b><i class="muted small">${M.fromDb(String(b.advance)) > 0n ? 'پیش‌پرداخت ' + esc(fmt.money(b.advance, b.currency)) : d.kind === 'supplier' ? 'بدهی شما' : 'طلب شما'}</i></div>`).join('')
        : '<div><span>مانده</span><b>صفر</b><i class="muted small">حساب تسویه است</i></div>'}
        ${bal.length > 1 ? `<div><span>معادل ${fmt.base()}</span><b>${esc(fmt.money(totalBase, 'AFN'))}</b><i class="muted small">با نرخ هر سند</i></div>` : ''}
      </div>`,
    footer: `<div class="btn-group">
        ${d.kind !== 'supplier' ? btn({ label: 'ثبت فروش برای این شخص', icon: 'i-sale', variant: 'primary', small: true, attrs: `onclick="location.hash='#/sales/new?party=${d.id}'"` }) : ''}
        ${d.kind !== 'customer' ? btn({ label: 'ثبت خرید از این شخص', icon: 'i-buy', variant: 'soft', small: true, attrs: `onclick="location.hash='#/purchases/new?party=${d.id}'"` }) : ''}
        ${btn({ label: 'ویرایش', icon: 'i-edit', variant: 'ghost', small: true, act: 'edit' })}
      </div>`,
  })}
    ${card({
    title: 'سابقهٔ اسناد',
    hint: 'فروش و خرید این شخص، از تازه به کهنه.',
    class: 'card-flat',
    body: docs.length ? `<div class="list">${docs.map((r) => row({
      href: `#/${r.type === 'sale' ? 'sales' : 'purchases'}/${r.id}`,
      icon: r.type === 'sale' ? 'i-sale' : 'i-buy', tone: r.type === 'sale' ? 'success' : 'warn',
      title: `${esc(r.no)} — ${esc(fmt.money(r.total, r.currency))}`,
      sub: `${fmt.date(r.date)} • ${statusPill(r.status)}`,
      right: M.fromDb(r.balance) > 0n ? `<span class="mono">مانده ${esc(fmt.money(r.balance, r.currency))}</span>` : '',
    })).join('')}</div>` : emptyState({ icon: 'i-clock', title: 'سندی ثبت نشده', text: 'با ثبت اولین فاکتور، سابقهٔ این شخص اینجا پر می‌شود.' }),
  })}
  </div>`;
  delegate(root, { edit: () => partyForm(d, d.kind, () => detail(root, id)) });
}

function partyForm(p, kind, onDone) {
  const editing = !!p?.id;
  U.formSheet({
    title: editing ? `ویرایش ${U.esc(p.name)}` : kind === 'supplier' ? 'تأمین‌کنندهٔ تازه' : 'مشتری تازه',
    sub: 'فقط نام لازم است. بقیه برای یادآوری و تماس است.',
    ok: editing ? 'ذخیره' : 'افزودن',
    fields: [
      field({ label: 'نام', name: 'name', required: true, control: input({ name: 'name', value: p?.name || '', required: true, placeholder: kind === 'supplier' ? 'مثلاً: شرکت برکت' : 'مثلاً: دکان نور' }) }),
      field({ label: 'نوع', name: 'kind', control: select({ name: 'kind', value: p?.kind || kind || 'customer', options: [{ value: 'customer', label: 'مشتری' }, { value: 'supplier', label: 'تأمین‌کننده' }, { value: 'both', label: 'هر دو' }] }) }),
      field({ label: 'نفر تماس', name: 'contact', control: input({ name: 'contact', value: p?.contact || '' }) }),
      t`<div class="grid-2">
        ${field({ label: 'شماره تماس', name: 'phone', control: input({ name: 'phone', type: 'tel', value: p?.phone || '', placeholder: '07XXXXXXXX' }) })}
        ${field({ label: 'ایمیل', name: 'email', control: input({ name: 'email', type: 'email', value: p?.email || '' }) })}
      </div>`,
      field({ label: 'نشانی', name: 'address', control: U.textarea({ name: 'address', rows: 2, value: p?.address || '' }) }),
      field({ label: 'یادداشت', name: 'note', control: U.textarea({ name: 'note', rows: 2, value: p?.note || '' }) }),
      editing ? switchField({ name: 'active', checked: p.active !== 0, label: 'فعال', hint: 'خاموش کردن = پنهان از فهرست‌ها، بدون حذف سابقه' }) : '',
    ],
    validate: (v) => { if (!v.name?.trim()) throw new Error('نام را وارد کنید.'); },
    onSubmit: async (v) => {
      const body = { ...v, active: v.active === undefined ? 1 : !!v.active };
      delete body.data;
      if (editing) await store.mutate('put', `/api/parties/${p.id}`, body, { success: 'اطلاعات ذخیره شد.' });
      else await store.mutate('post', '/api/parties', body, { success: 'به فهرست افزوده شد.' });
      onDone?.();
    },
  });
}
