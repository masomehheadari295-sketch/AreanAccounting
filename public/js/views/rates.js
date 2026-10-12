/**
 * rates.js — ارزها و نرخ‌ها. نرخ فقط دستی ثبت می‌شود و روی هر سند برای همیشه می‌ماند.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, field, input, select, dateField, switchField, esc, readForm, delegate } = U;

export default {
  name: 'rates',
  title: () => 'ارزها و نرخ‌ها',
  sub: () => `<span class="muted small">نرخ را خودتان ثبت می‌کنید؛ برنامه آن را تغییر نمی‌دهد</span>`,
  back: true,
  async render({ root, params, query }) {
    let d;
    try {
      d = await api.get('/api/rates');
      const cur = await api.get('/api/currencies');
      d.rows = cur.rows;
    } catch (e) {
      root.innerHTML = `<div class="wrap">${U.errorBox(e)}</div>`;
      return delegate(root, { retry: () => this.render({ root, params, query }) });
    }
    const latest = {};
    for (const r of d.latest || []) latest[r.code] = r;
    const base = fmt.base();
    const active = fmt.activeCurrencies();
    if (!active.filter((c) => c.code !== base).length) U.toast('برای ثبت نرخ، اول یک ارز دوم اضافه کنید.', 'warn');
    root.innerHTML = `<div class="wrap">
      ${U.note('نرخ هر سند همان روز و همان مقداری که شما وارد کرده‌اید می‌ماند. اگر فردا نرخ عوض شود، اسناد قبلی تغییر نمی‌کنند — به همین دلیل گزارش‌ها همیشه خوانا و قابل دفاع‌اند.', 'info')}
      ${card({
      title: 'ثبت نرخ روز',
      hint: `یک خط کافی است: نرخ ${esc(fmt.cur(active.find((c) => c.code !== base)?.code || 'USD').name)} در برابر ${esc(fmt.cur(base).name)}.`,
      body: `<form class="form" data-onsubmit="save">
        <div class="grid-2">
          ${field({ label: 'ارز', name: 'code', control: select({ name: 'code', options: active.filter((c) => c.code !== base).map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })), value: query.code || active.find((c) => c.code !== base)?.code }) })}
          ${field({ label: 'تاریخ', name: 'date', control: dateField({ name: 'date' }) })}
        </div>
        <div class="grid-2">
          ${field({ label: `نرخ (چقدر ${esc(fmt.cur(base).name)})`, name: 'rate', required: true, control: input({ name: 'rate', type: 'money', placeholder: 'مثلاً ۷۱٫۵۰' }) })}
          ${field({ label: 'یادداشت', name: 'note', control: input({ name: 'note', placeholder: 'مثلاً: نرخ صرافی سرک اول' }) })}
        </div>
        ${btn({ label: 'ثبت نرخ', type: 'submit', variant: 'primary', wide: true, icon: 'i-check' })}
      </form>`,
    })}
      ${card({
      title: 'ارزهای فعال',
      hint: 'اگر ارزی را زیاد استفاده نمی‌کنید، غیرفعالش کنید تا در فرم‌ها دیده نشود؛ سوابقش می‌ماند.',
      class: 'card-flat',
      body: `<div class="list">${(d.rows || []).map((c) => {
        const l = latest[c.code];
        const isBase = c.code === base;
        return row({
          arrow: !isBase,
          act: isBase ? '' : 'edit',
          data: `data-code="${esc(c.code)}"`,
          icon: 'i-swap', tone: c.active ? 'success' : 'muted',
          title: `${esc(c.name)} <span class="muted small">${esc(c.code)}${c.symbol ? ' · ' + esc(c.symbol) : ''}</span>${isBase ? ' ' + pill('ارز پایه', 'brand', 'i-flag') : ''}`,
          sub: isBase ? 'مبنای همهٔ معادل‌ها' : (l ? `آخرین نرخ ثبت‌شده: ${esc(fmt.rateStr(l.rate))} — ${fmt.date(l.date)}${l.note ? ` · ${esc(l.note)}` : ''}` : 'نرخی ثبت نشده — هنگام ثبت سند خودتان نرخ را بنویسید'),
          right: isBase ? '' : `<span class="mono">${l ? esc(fmt.money(M.mul(M.SCALE, M.fromDb(String(l.rate))), base)) : '—'}</span>`,
        });
      }).join('')}</div>`,
      footer: `<div class="btn-group">${btn({ label: 'افزودن ارز', icon: 'i-plus', variant: 'primary', small: true, act: 'new' })}${btn({ label: 'تنظیمات ارز', icon: 'i-cog', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/settings/currency'"` })}</div>`,
    })}
      ${card({
      title: 'تاریخچۀ نرخ‌ها',
      hint: 'همهٔ نرخ‌هایی که دستی ثبت کرده‌اید، به ترتیب تاریخ.',
      class: 'card-flat',
      body: (d.history || []).length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>تاریخ</th><th>ارز</th><th class="e">نرخ به ${esc(fmt.cur(base).name)}</th><th>یادداشت</th></tr></thead>
        <tbody>${(d.history || []).slice(0, 60).map((r) => `<tr><td>${fmt.date(r.date)}</td><td>${esc(fmt.cur(r.code).name)}</td><td class="e"><span class="mono">${esc(fmt.rateStr(r.rate))}</span></td><td class="muted small">${esc(r.note || '')}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">${fmt.plain(Math.max(0, (d.history || []).length - 60))} ثبت قدیمی‌تر در همین جدول نیست؛ با فیلتر ارز آن‌ها را ببینید.</p>`
        : U.emptyState({ icon: 'i-clock', title: 'هنوز نرخی ثبت نشده', text: 'با ثبت اولین نرخ، تاریخچه اینجا ساخته می‌شود. نرخ‌های قبلی هیچ‌گاه خودکار تغییر نمی‌کنند.' }),
    })}
    </div>`;
    delegate(root, {
      save: async (f) => {
        const v = readForm(f);
        const rate = M.parse(v.rate);
        if (!rate || rate <= 0n) return U.toast('نرخ را درست بنویسید (مثلاً ۷۱٫۵۰).', 'warn');
        try {
          await store.mutate('post', '/api/rates', { code: v.code, rate: v.rate, date: v.date, note: v.note || '' }, { success: 'نرخ ثبت شد. از این پس در فرم‌های تازه پیشنهاد می‌شود.' });
          location.reload === undefined || setTimeout(() => location.reload(), 350);
        } catch (e) { U.toast(e.userMessage || 'ثبت نشد', 'danger', 6000); }
      },
      new: () => currencyForm(null, () => this.render({ root, params, query })),
      edit: (n) => currencyForm((d.rows || []).find((c) => c.code === n.dataset.code), () => this.render({ root, params, query })),
      'filter-code': (n) => { location.hash = `#/rates?code=${n.dataset.code}`; },
    });
  },
};

function currencyForm(c, onDone) {
  const editing = !!c?.code;
  U.formSheet({
    title: editing ? `ویرایش ${U.esc(c.name)}` : 'ارز تازه',
    sub: 'رمز ارز را با حرف‌های لاتین بنویسید (مثلاً PKR). نماد و رقم‌های اعشاری را خودتان تعیین کنید.',
    ok: editing ? 'ذخیره' : 'افزودن ارز',
    fields: [
      t`<div class="grid-2">
        ${field({ label: 'رمز ارز', name: 'code', required: true, control: input({ name: 'code', value: c?.code || '', placeholder: 'USD', attrs: editing ? 'readonly' : '' }) })}
        ${field({ label: 'نماد', name: 'symbol', control: input({ name: 'symbol', value: c?.symbol || '', placeholder: '$' }) })}
      </div>`,
      field({ label: 'نام فارسی', name: 'name', required: true, control: input({ name: 'name', value: c?.name || '', placeholder: 'دالر امریکایی' }) }),
      t`<div class="grid-2">
        ${field({ label: 'ارقام اعشاری', name: 'decimals', control: select({ name: 'decimals', value: c?.decimals ?? 2, options: [0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })) }), hint: 'چند رقم بعد از ممیز نگه داشته شود.' })}
        ${field({ label: 'نرخ اولیه', name: 'rate', control: input({ name: 'rate', type: 'money', value: c && c.code !== fmt.base() ? M.str(M.fromDb(String(c.rate)), 4).replace(/\.0+$/, '') : '' }), hint: 'اختیاری.' })}
      </div>`,
      switchField({ name: 'active', checked: !editing || c.active !== 0, label: 'در فرم‌ها استفاده شود' }),
    ],
    validate: (v) => {
      if (!/^[A-Za-z]{2,4}$/.test(String(v.code || '').trim())) throw new Error('رمز ارز ۲ تا ۴ حرف لاتین باشد (مثلاً AFN).');
      if (!String(v.name).trim()) throw new Error('نام ارز را بنویسید.');
    },
    onSubmit: async (v) => {
      const body = { code: v.code.trim().toUpperCase(), name: v.name.trim(), symbol: v.symbol || '', decimals: v.decimals, rate: v.rate || '0', active: v.active ? 1 : 0 };
      try {
        if (editing) await store.mutate('put', `/api/currencies/${c.code}`, body, { success: 'ارز به‌روز شد.' });
        else await store.mutate('post', '/api/currencies', body, { success: 'ارز افزوده شد.' });
        await store.load(true);
        onDone?.(); return true;
      } catch (e) { U.toast(e.userMessage || 'ذخیره نشد', 'danger', 6000); return false; }
    },
  });
}
