/**
 * search.js — جست‌وجوی سراسری: فاکتور، شخص، کالا و تراکنش در یک خانه.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import api from '../core/api.js';

const { t, icon, card, row, searchBox, emptyState, esc, delegate } = U;

export default {
  name: 'search',
  title: () => 'جست‌وجو',
  sub: () => `<span class="muted small">شمارۀ فاکتور، نام مشتری، کالا یا توضیح هزینه را بنویسید</span>`,
  back: true,
  async render({ root, query }) {
    const state = { q: query.q || '' };
    root.innerHTML = `<div class="wrap">
      ${searchBox({ value: state.q, placeholder: 'مثلاً: INV-1405 یا آقای نور یا برنج', autofocus: true })}
      <div data-out>${t`<div class="hintbox">${icon('i-info', 'ic nano')} هر چیزی که یادتان هست بنویسید: شمارۀ فاکتور، نام شخص، نام کالا یا یک کلمه از توضیح هزینه.</div>`}</div>
    </div>`;
    const out = root.querySelector('[data-out]');
    const inp = root.querySelector('.searchbox input');
    let timer; let token = 0;
    const run = async () => {
      const q = inp.value.trim();
      state.q = q;
      if (q.length < 1) { out.innerHTML = `<div class="hintbox">${icon('i-info', 'ic nano')} یک کلمه بنویسید تا نتیجه بیاید.</div>`; return; }
      const my = ++token;
      out.innerHTML = U.skeleton(4);
      let d;
      try { d = await api.get('/api/search?q=' + encodeURIComponent(q)); }
      catch (e) { if (my === token) out.innerHTML = U.errorBox(e); return; }
      if (my !== token) return;
      const n = (d.docs?.length || 0) + (d.parties?.length || 0) + (d.items?.length || 0) + (d.tx?.length || 0);
      if (!n) {
        out.innerHTML = emptyState({
          icon: 'i-search', title: `چیزی با «${esc(q)}» پیدا نشد`,
          text: 'املا را کوتاه‌تر بنویسید — مثلاً فقط یک کلمه یا فقط شمارۀ فاکتور.',
          action: `<div class="btn-group">
            <a class="btn btn-soft small" href="#/sales">فاکتورهای فروش</a>
            <a class="btn btn-soft small" href="#/stock">کالاها</a>
            <a class="btn btn-soft small" href="#/money">هزینه‌ها</a></div>`,
        });
        return;
      }
      out.innerHTML = `
        ${d.docs?.length ? card({
          title: `سندها (${fmt.plain(d.docs.length)})`, class: 'card-flat',
          body: `<div class="list">${d.docs.map((x) => row({
            href: `#/${x.type === 'sale' ? 'sales' : 'purchases'}/${x.id}`, icon: x.type === 'sale' ? 'i-sale' : 'i-buy',
            tone: x.type === 'sale' ? 'success' : 'warn',
            title: `${esc(x.no)} — ${esc(x.party_name || '')}`,
            sub: `${fmt.date(x.date)} • ${U.statusPill(x.status)}`,
            right: `<span class="mono">${esc(fmt.money(x.total, x.currency))}</span>`,
          })).join('')}</div>`,
        }) : ''}
        ${d.parties?.length ? card({
          title: `اشخاص (${fmt.plain(d.parties.length)})`, class: 'card-flat',
          body: `<div class="list">${d.parties.map((p) => row({
            href: `#/parties/${p.id}`, icon: p.kind === 'supplier' ? 'i-buy' : 'i-users', tone: 'brand',
            title: esc(p.name), sub: `${p.kind === 'supplier' ? 'تأمین‌کننده' : 'مشتری'}${p.phone ? ` • ${esc(p.phone)}` : ''}`,
          })).join('')}</div>`,
        }) : ''}
        ${d.items?.length ? card({
          title: `کالاها (${fmt.plain(d.items.length)})`, class: 'card-flat',
          body: `<div class="list">${d.items.map((i) => row({
            href: `#/stock/${i.id}`, icon: 'i-stock', tone: 'accent', title: esc(i.name),
            sub: `${esc(i.code || 'بدون کد')}${i.unit ? ` • ${esc(i.unit)}` : ''}`,
          })).join('')}</div>`,
        }) : ''}
        ${d.tx?.length ? card({
          title: `تراکنش‌ها (${fmt.plain(d.tx.length)})`, class: 'card-flat',
          body: `<div class="list">${d.tx.map((x) => row({
            href: `#/money/${x.id}`, icon: fmt.txIcon(x.type), tone: ['expense', 'payment', 'drawing'].includes(x.type) ? 'danger' : 'success',
            title: esc(x.title || fmt.txLabel(x.type)), sub: `${fmt.date(x.date)}${x.party ? ` • ${esc(x.party)}` : ''}`,
            right: `<span class="mono">${esc(fmt.money(x.amount, x.currency))}</span>`,
          })).join('')}</div>`,
        }) : ''}`;
    };
    inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); run(); } });
    delegate(root, { 'clear-search': () => { inp.value = ''; run(); } });
    if (state.q) run(); else setTimeout(() => inp.focus(), 60);
  },
};
