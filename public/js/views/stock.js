/**
 * stock.js — گدام: کالاها، موجودی، حرکات (ورود/خروج/برگشت/ضایعات/اصلاح) و گردش.
 * ارزش‌گذاری: میانگین موزون (در تنظیمات توضیح داده شده).
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, note, field, input, select, switchField, imageField, dateField, searchBox, emptyState, esc, readForm, delegate } = U;

export default {
  name: 'stock',
  title: () => 'گدام',
  sub: () => `<span class="muted small">کالاها، موجودی و گردش</span>`,
  async render({ root, params, query }) {
    if (location.hash.includes('/new')) return itemForm(root, null);
    if (params.id) return itemDetail(root, +params.id);
    return list(root, query);
  },
};

/* ------------------------------ فهرست کالاها ------------------------------ */
async function list(root, query) {
  const state = { q: query.q || '', cat: query.cat || '', kind: query.kind || '', low: query.low === '1', view: localStorage.getItem('hesab.stockview') || 'cards' };
  const paint = async () => {
    let rows;
    try {
      const qs = new URLSearchParams({ ...state, low: state.low ? '1' : '' });
      rows = (await api.get('/api/items?' + qs.toString())).rows;
    } catch (e) {
      root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`;
      return delegate(root, { retry: paint });
    }
    const inv = await api.get('/api/inventory').catch(() => null);
    const total = inv?.totals;
    root.innerHTML = `<div class="wrap">
      ${total ? t`<section class="kpis">
        ${kpi2('ارزش موجودی', fmt.money(total.value, fmt.base()), 'میانگین موزون', 'i-stock')}
        ${kpi2('قیمت فروش موجودی', fmt.money(total.retail, fmt.base()), 'اگر همه فروخته شود', 'i-sale')}
        ${kpi2('کالاهای کم', fmt.plain(total.low), 'به حد minimum رسیده‌اند', 'i-alert', total.low > 0 ? 'warn' : 'success')}
        ${kpi2('تمام‌شده', fmt.plain(total.out), 'موجودی صفر یا زیر صفر', 'i-close', total.out > 0 ? 'danger' : 'success')}
      </section>` : ''}
      ${card({
      class: 'card-flat',
      body: `<div class="filters" style="border:0;padding:0">
          ${searchBox({ value: state.q, placeholder: 'نام کالا یا کد…' })}
          ${select({ name: 'cat', value: state.cat, options: [{ value: '', label: 'همهٔ دسته‌ها' }, ...store.categories('item').map((c) => ({ value: c.id, label: c.name }))] })}
          ${select({ name: 'kind', value: state.kind, options: [{ value: '', label: 'همهٔ نوع‌ها' }, { value: 'goods', label: 'کالا' }, { value: 'material', label: 'ماده خام' }, { value: 'service', label: 'خدمت' }] })}
          ${pill('فقط کم‌موجود', state.low ? 'danger' : 'neutral', state.low ? 'i-alert' : 'i-info')}
        </div>`,
      footer: `<div class="btn-group">
          ${btn({ label: state.low ? 'نمایش همهٔ کالاها' : 'فقط کالاهای کم', icon: 'i-alert', variant: state.low ? 'primary' : 'soft', small: true, act: 'toggle-low' })}
          ${btn({ label: 'گزارش گردش', icon: 'i-chart', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/reports/inventory'"` })}
          ${btn({ label: 'کالای تازه', icon: 'i-plus', variant: 'primary', small: true, attrs: `onclick="location.hash='#/stock/new'"` })}
        </div>`,
    })}
      ${rows.length ? (state.view === 'cards' ? `<div class="itemgrid">${rows.map(itemCard).join('')}</div>`
        : `<div class="tablewrap card"><table class="tbl"><thead><tr>
            <th>کالا</th><th class="c">موجودی</th><th class="e">میانگین بها</th><th class="e">ارزش</th><th class="e">قیمت فروش</th>
          </tr></thead><tbody>${rows.map((r) => `<tr data-act="open" data-id="${r.id}" style="cursor:pointer">
            <td>${esc(r.name)}${r.code ? `<br><span class="muted small">${esc(r.code)}</span>` : ''}</td>
            <td class="c">${esc(fmt.qty(M.fromDb(r.qty)))} ${esc(r.unit || '')} ${M.fromDb(r.qty) <= 0n ? '<span class="badge-neg">منفی</span>' : ''}</td>
            <td class="e">${esc(fmt.money(r.avg_cost, fmt.base()))}</td>
            <td class="e">${esc(fmt.money(r.value, fmt.base()))}</td>
            <td class="e">${esc(fmt.money(r.sell_price, fmt.base()))}</td></tr>`).join('')}</tbody></table></div>`)
        : emptyState({
          icon: 'i-stock',
          title: state.q || state.cat || state.kind || state.low ? 'کالایی با این فیلترها نیست' : 'گدام خالی است',
          text: state.q || state.low ? 'فیلترها را بردارید یا کالای تازه بسازید.' : 'هر کالایی که می‌فروشید را اینجا تعریف کنید تا موجودی و سود درست حساب شود.',
          action: btn({ label: 'تعریف کالا', icon: 'i-plus', variant: 'primary', attrs: `onclick="location.hash='#/stock/new'"` }),
        })}
    </div>`;
    delegate(root, {
      'toggle-low': () => { state.low = !state.low; paint(); },
      open: (n) => { location.hash = `#/stock/${n.dataset.id}`; },
      'clear-search': () => { state.q = ''; paint(); },
      retry: paint,
    });
    const box = root.querySelector('.searchbox input');
    let timer;
    box?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = box.value.trim(); paint(); }, 400); });
    root.querySelector('[name=cat]')?.addEventListener('change', (e) => { state.cat = e.target.value; paint(); });
    root.querySelector('[name=kind]')?.addEventListener('change', (e) => { state.kind = e.target.value; paint(); });
  };
  await paint();
}

const kpi2 = (label, value, sub, ic, tone = '') => U.kpi({ label, value, sub, icon: ic, tone, class: '', attrs: 'data-act="noop"' });

function itemCard(r) {
  const qty = M.fromDb(r.qty);
  return `<a class="itemcard" href="#/stock/${r.id}">
    <span class="itemcard-img">${r.image ? `<img src="${esc(r.image)}" alt="${esc(r.name)}">` : icon('i-stock')}</span>
    <span class="itemcard-body">
      <b>${esc(r.name)}</b>
      <i>${esc(r.code || '—')} • ${esc(fmt.kindLabel(r.kind))}</i>
      <i>${esc(fmt.qty(qty))} ${esc(r.unit || '')}</i>
      <span class="itemcard-foot">
        <span>${esc(fmt.money(r.avg_cost, fmt.base()))}</span>
        ${qty <= 0n ? pill('تمام شده', 'danger', 'i-close') : r.low ? pill('کم است', 'warn', 'i-alert') : pill('موجود', 'success', 'i-check')}
      </span>
    </span></a>`;
}

/* ------------------------------ جزئیات کالا ------------------------------ */
async function itemDetail(root, id) {
  let d;
  try { d = await api.get('/api/items/' + id); }
  catch (e) { root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`; return delegate(root, { retry: () => itemDetail(root, id) }); }
  document.getElementById('page-title').textContent = d.name;
  const qty = M.fromDb(String(d.qty ?? '0'));
  const avg = M.fromDb(String(d.avg_cost ?? '0'));
  const min = M.fromDb(String(d.min_qty ?? '0'));
  const value = M.mul(qty, avg);
  root.innerHTML = `<div class="wrap">
    ${card({
    body: `<div class="itemdetail">
      <div class="itemdetail-img">${d.image ? `<img src="${esc(d.image)}" alt="">` : icon('i-stock', 'ic big')}</div>
      <div>
        <h2 style="font-size:1.15rem">${esc(d.name)}</h2>
        <p class="muted small">${esc(d.code || 'بدون کد')} • ${esc(fmt.kindLabel(d.kind))} • دسته: ${esc(d.category_name || '—')}</p>
        <div class="chips" style="margin-top:6px">
          ${qty <= 0n ? pill('تمام شده', 'danger', 'i-close') : qty <= min ? pill('کمبود', 'warn', 'i-alert') : pill('موجود', 'success', 'i-check')}
          ${d.active === 0 ? pill('غیرفعال', 'muted') : ''}
        </div>
        <div class="summary" style="margin-top:10px">
          <div><span>موجودی</span><b>${esc(fmt.qty(qty))} ${esc(d.unit || '')}</b></div>
          <div><span>حداقل مجاز</span><b>${esc(fmt.qty(min))}</b></div>
          <div><span>میانگین بها</span><b>${esc(fmt.money(avg, fmt.base()))}</b></div>
          <div><span>ارزش موجودی</span><b>${esc(fmt.money(value, fmt.base()))}</b></div>
          <div><span>قیمت خرید</span><b>${esc(fmt.money(d.buy_price, fmt.base()))}</b></div>
          <div><span>قیمت فروش</span><b>${esc(fmt.money(d.sell_price, fmt.base()))}</b></div>
        </div>
        ${d.note ? note(esc(d.note), 'info') : ''}
      </div></div>`,
    footer: `<div class="btn-group">
        ${btn({ label: 'افزایش موجودی', icon: 'i-arrow-down', variant: 'primary', small: true, act: 'move', data: 'in' })}
        ${btn({ label: 'کاهش / خروج دستی', icon: 'i-arrow-up', variant: 'soft', small: true, act: 'move', data: 'out' })}
        ${btn({ label: 'اصلاح شمارش', icon: 'i-edit', variant: 'ghost', small: true, act: 'move', data: 'adjust' })}
        ${btn({ label: 'ویرایش کالا', icon: 'i-edit', variant: 'ghost', small: true, act: 'edit' })}
      </div>`,
  })}
    ${card({
    title: 'گردش موجودی',
    hint: 'هر تغییر به سند یا دلیل متصل است؛ تغییر بی‌سابقه ممکن نیست.',
    class: 'card-flat',
    body: (d.moves || []).length ? `<div class="list">${d.moves.map((m) => row({
      icon: { in: 'i-arrow-down', out: 'i-arrow-up', return: 'i-swap', waste: 'i-trash', adjust: 'i-edit', cancel_in: 'i-close', cancel_out: 'i-check' }[m.kind] || 'i-info',
      tone: m.kind === 'in' || m.kind === 'return' ? 'success' : m.kind === 'out' || m.kind === 'waste' ? 'danger' : 'brand',
      title: `${esc(fmt.moveLabel(m.kind))} — ${esc(fmt.qty(M.fromDb(m.qty)))} ${esc(d.unit || '')}`,
      sub: `${fmt.date(m.date)}${m.doc_no ? ` • سند ${esc(m.doc_no)}` : ''}${m.reason ? ` • ${esc(m.reason)}` : ''}`,
      right: m.cost && M.fromDb(m.cost) > 0n ? `<span class="mono muted small">${esc(fmt.money(M.mul(M.fromDb(m.cost), M.fromDb(m.qty)), fmt.base()))}</span>` : '',
      arrow: false,
    })).join('')}</div>` : emptyState({ icon: 'i-clock', title: 'حرکتی ثبت نشده', text: 'با ثبت خرید یا فروش، گردش گدام پر می‌شود.' }),
  })}
    ${card({
    title: 'سندهای این کالا',
    hint: 'فروش‌ها و خریدهای مرتبط.',
    class: 'card-flat',
    body: (d.recent_docs || []).length ? `<div class="list">${d.recent_docs.map((x) => row({
      href: `#/${x.type === 'sale' ? 'sales' : 'purchases'}/${x.id}`,
      icon: x.type === 'sale' ? 'i-sale' : 'i-buy', tone: x.type === 'sale' ? 'success' : 'warn',
      title: `${esc(x.no || '')} — ${fmt.qty(M.fromDb(x.qty))} ${esc(d.unit || '')}`,
      sub: fmt.date(x.date), right: `<span class="mono">${esc(fmt.money(x.unit_price, fmt.base()))}</span>`,
    })).join('')}</div>` : `<p class="muted small">سندی برای این کالا ثبت نشده است.</p>`,
  })}
  </div>`;
  delegate(root, {
    edit: () => itemForm(root, d),
    move: (n) => moveSheet(d, n.dataset.data, () => itemDetail(root, id)),
  });
}

/* ------------------------------ ثبت حرکت موجودی ------------------------------ */
function moveSheet(item, kind, onDone) {
  const labels = { in: 'افزایش موجودی', out: 'کاهش موجودی', adjust: 'اصلاح شمارش', waste: 'ضایعات', return: 'برگشت از مشتری' };
  const s = U.sheet({
    title: labels[kind] || 'تغییر موجودی',
    sub: `${U.esc(item.name)} — موجودی فعلی: ${fmt.qty(M.fromDb(String(item.qty ?? '0')))} ${U.esc(item.unit || '')}`,
    body: `<form class="form" data-onsubmit="ok">
      ${kind === 'adjust' ? note('در «اصلاح شمارش»، مقدار را با علامت بنویسید: عدد مثبت اضافه و عدد منفی کم می‌کند. مثال: ‎-۳‎ یعنی سه واحد کمتر از چیزی که ثبت شده.', 'info') : ''}
      <div class="grid-2">
        ${field({ label: 'مقدار', name: 'qty', required: true, control: input({ name: 'qty', type: 'money', value: '1', placeholder: 'مثلاً ۵' }) })}
        ${kind === 'adjust' ? field({ label: 'جهت', name: 'dir', control: U.segmented({ name: 'dir', value: 'inc', act: 'dir', items: [{ value: 'inc', label: 'اضافه' }, { value: 'dec', label: 'کم کردن' }] }) }) : ''}
      </div>
      ${kind === 'in' || kind === 'adjust' ? field({ label: 'بهای هر واحد (اختیاری)', name: 'cost_unit', control: input({ name: 'cost_unit', type: 'money', value: M.str(M.fromDb(String(item.avg_cost ?? '0')), 2).replace(/\.0+$/, '') }), hint: 'برای میانگین موزون. اگر خرید رسمی است، بهتر است سند خرید ثبت شود.' }) : ''}
      ${field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date' }) })}
      ${field({ label: 'دلیل', name: 'reason', required: true, hint: 'این متن در گردش کالا و گزارش‌ها می‌ماند.', control: input({ name: 'reason', placeholder: kind === 'waste' ? 'مثلاً: آسیب‌دیدگی در انبار' : kind === 'return' ? 'مثلاً: مرجوعی مشتری — فاکتور ۱۲۳' : 'مثلاً: شمارش پایان ماه' }) })}
      ${field({ label: 'توضیح بیشتر', name: 'note', control: U.textarea({ name: 'note', rows: 2 }) })}
      ${btn({ label: 'ثبت تغییر', type: 'submit', wide: true })}
    </form>`,
  });
  let dir = 'inc';
  delegate(s.body, {
    dir: (n) => { dir = n.dataset.value; },
    ok: async (f) => {
      const v = readForm(f);
      let q;
      try { q = M.parse(v.qty); if (!q || q === 0n) throw 0; } catch { return U.toast('مقدار را درست وارد کنید.', 'warn'); }
      if (dir === 'dec' && v.kind !== 'adjust') q = -q;
      try {
        const body = {
          kind, qty: M.str(dir === 'dec' && kind === 'adjust' ? -Math.abs(q) : q, 6),
          cost_unit: v.cost_unit || '', date: v.date, reason: v.reason, note: v.note || '',
          decrease: kind === 'adjust' ? (dir === 'dec' ? 1 : 0) : (kind === 'out' || kind === 'waste' ? 1 : 0),
        };
        const r = await store.mutate('post', `/api/items/${item.id}/move`, body, { success: 'موجودی به‌روز شد.' });
        U.toast(r?.message || 'ثبت شد.', 'success', 5000);
        s.close(); onDone?.();
      } catch (e) { U.toast(e.userMessage || e.message || 'ثبت نشد', 'danger', 6000); }
    },
  });
}

/* ------------------------------ فرم کالا ------------------------------ */
async function itemForm(root, item) {
  const editing = !!item?.id;
  document.getElementById('page-title').textContent = editing ? 'ویرایش کالا' : 'تعریف کالا';
  const cats = store.categories('item');
  const d = item || { kind: 'goods', unit: 'عدد', track_stock: true, min_qty: '0', buy_price: '0', sell_price: '0' };
  root.innerHTML = `<div class="wrap">
    ${card({
    title: editing ? `ویرایش ${esc(d.name)}` : 'کالای تازه',
    hint: 'فقط نام لازم است. بقیه را بعداً هم می‌توانید پر کنید.',
    body: `<form class="form" data-onsubmit="save">
        ${field({ label: 'نام کالا یا خدمت', name: 'name', required: true, control: input({ name: 'name', value: d.name || '', placeholder: 'مثلاً: برنج سیله ۲۴ کیلو', required: true }) })}
        <div class="grid-2">
          ${field({ label: 'کد کالا', name: 'code', control: input({ name: 'code', value: d.code || '', placeholder: 'مثلاً RICE-24' }), hint: 'برای جست‌وجوی سریع‌تر؛ اختیاری است.' })}
          ${field({ label: 'واحد', name: 'unit', control: input({ name: 'unit', value: d.unit || 'عدد', placeholder: 'کیلو، بوری، عدد، تریپ' }) })}
        </div>
        <div class="grid-2">
          ${field({ label: 'نوع', name: 'kind', control: select({ name: 'kind', value: d.kind || 'goods', options: [{ value: 'goods', label: 'کالا (موجودی دارد)' }, { value: 'material', label: 'ماده خام' }, { value: 'service', label: 'خدمت (بدون موجودی)' }] }) })}
          ${field({ label: 'دسته‌بندی', name: 'category_id', control: select({ name: 'category_id', value: d.category_id || '', placeholder: '— بدون دسته —', options: cats.map((c) => ({ value: c.id, label: c.name })) }) })}
        </div>
        <div class="grid-2">
          ${field({ label: 'قیمت خرید', name: 'buy_price', control: input({ name: 'buy_price', type: 'money', value: fmt.inputValue(d.buy_price || '0'), placeholder: '۰' }) })}
          ${field({ label: 'قیمت فروش', name: 'sell_price', control: input({ name: 'sell_price', type: 'money', value: fmt.inputValue(d.sell_price || '0'), placeholder: '۰' }) })}
        </div>
        <div class="grid-2">
          ${field({ label: 'حداقل موجودی (هشدار)', name: 'min_qty', control: input({ name: 'min_qty', type: 'money', value: fmt.inputValue(d.min_qty || '0'), placeholder: 'مثلاً ۵' }), hint: 'اگر موجودی به این عدد برسد، هشدار می‌گیرید.' })}
          ${field({ label: 'موجودی اولیه', name: 'opening_qty', control: input({ name: 'opening_qty', type: 'money', placeholder: '۰' }), hint: editing ? 'برای اصلاح موجودی از «گردش موجودی» استفاده کنید.' : 'اگر از قبل جنس در انبار دارید، اینجا بنویسید (به نام «موجودی اول دوره» ثبت می‌شود).' })}
        </div>
        ${switchField({ name: 'track_stock', checked: d.track_stock !== 0 && d.track_stock !== false, label: 'موجودی این کالا دنبال شود', hint: 'روشن باشد: با فروش کم و با خرید زیاد می‌شود.' })}
        ${field({ label: 'توضیح', name: 'note', control: U.textarea({ name: 'note', rows: 2, value: d.note || '' }) })}
        ${imageField({ name: 'image', value: d.image || '', label: 'تصویر کالا', buttonLabel: 'افزودن تصویر کالا' })}
        <div class="btn-group">
          ${btn({ label: editing ? 'ذخیره تغییرات' : 'ذخیره کالا', type: 'submit', variant: 'primary' })}
          ${editing ? btn({ label: 'حذف کالا', variant: 'ghost', act: 'delete' }) : ''}
        </div>
      </form>`,
  })}
  </div>`;
  delegate(root, {
    delete: async () => {
      const yes = await U.confirmBox({ title: 'حذف این کالا؟', danger: true, ok: 'حذف کن', text: 'اگر کالا در سند یا گردش باشد، حذف نمی‌شود؛ به‌جایش آن را غیرفعال کنید.', check: 'می‌خواهم حذف کنم' });
      if (!yes) return;
      try {
        await store.mutate('del', `/api/items/${d.id}`, null, { success: 'کالا حذف شد.' });
        location.hash = '#/stock';
      } catch (e) { U.toast(e.userMessage || 'حذف نشد', 'danger', 6000); }
    },
    save: async (f) => {
      const v = readForm(f);
      if (!v.name?.trim()) return U.toast('نام کالا را بنویسید.', 'warn');
      const body = {
        name: v.name.trim(), code: v.code || '', unit: v.unit || 'عدد', kind: v.kind, category_id: v.category_id || null,
        buy_price: v.buy_price || '0', sell_price: v.sell_price || '0', min_qty: v.min_qty || '0',
        track_stock: !!v.track_stock, note: v.note || '', image: v.image || '',
      };
      try {
        let id = d.id;
        if (editing) await store.mutate('put', `/api/items/${id}`, body, { success: 'تغییرات ذخیره شد.' });
        else { const r = await store.mutate('post', '/api/items', body, { success: 'کالا ساخته شد.' }); id = r.row.id; }
        if (v.opening_qty && M.parse(v.opening_qty) > 0n) {
          await store.mutate('post', `/api/items/${id}/move`, {
            kind: 'in', qty: v.opening_qty, cost_unit: v.buy_price || '0', reason: 'موجودی اول دوره (هنگام تعریف کالا)',
          }, { success: 'موجودی اولیه ثبت شد.', quiet: true });
        }
        location.hash = `#/stock/${id}`;
      } catch (e) { U.toast(e.userMessage || 'ذخیره نشد', 'danger', 6000); }
    },
  });
}
