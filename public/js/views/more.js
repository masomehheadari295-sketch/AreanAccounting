/**
 * more.js — «بیشتر»: همهٔ بخش‌ها، میان‌بُرهای سریع و دسترسی به تنظیمات.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api from '../core/api.js';

const { t, icon, card, row, btn, esc, delegate } = U;

export default {
  name: 'more',
  title: () => 'بیشتر',
  sub: () => `<span class="muted small">همهٔ بخش‌ها در یک نگاه</span>`,
  async render({ root }) {
    const stats = store.boot().stats || {};
    let low = 0;
    try { low = (await api.get('/api/inventory?low=1')).totals?.low || 0; } catch { /* آفلاین */ }
    const groups = [
      ['کارهای روزمره', [
        { h: '#/sales/new', i: 'i-sale', t: 'ثبت فروش', s: 'فاکتور بدهید، نقدی یا نسیه', tone: 'success' },
        { h: '#/purchases/new', i: 'i-buy', t: 'ثبت خرید', s: 'کالا بخرید و به گدام بیفزایید', tone: 'warn' },
        { h: '#/money/new?type=expense', i: 'i-expense', t: 'ثبت هزینه', s: 'کرایه، معاش، برق، ترانسپورت', tone: 'danger' },
        { h: '#/money/new?type=drawing', i: 'i-briefcase', t: 'برداشت شخصی', s: 'پول برای مصرف خودتان — زیان نیست' },
        { h: '#/money/new?type=contribution', i: 'i-plus', t: 'آوردهٔ سرمایه', s: 'پولی که به کار اضافه می‌کنید' },
      ]],
      ['بینش کار', [
        { h: '#/reports/pl', i: 'i-chart', t: 'سود و زیان', s: 'در این دوره چقدر سود کردید؟' },
        { h: '#/reports/receivables', i: 'i-users', t: 'طلب و بدهی', s: 'چه کسی بدهکار، شما به که' },
        { h: '#/reports/sales', i: 'i-sale', t: 'گزارش فروش', s: 'با چاپ و فایل اکسل' },
        { h: '#/reports/purchases', i: 'i-buy', t: 'گزارش خرید' },
        { h: '#/reports/expenses', i: 'i-expense', t: 'گزارش هزینه‌ها' },
        { h: '#/reports/receipts', i: 'i-arrow-down', t: 'دریافت‌ها' },
        { h: '#/reports/payments', i: 'i-arrow-up', t: 'پرداخت‌ها' },
        { h: '#/reports/accounts', i: 'i-wallet', t: 'گردش صندوق و بانک' },
        { h: '#/reports/capital', i: 'i-briefcase', t: 'آورده و برداشت' },
        { h: '#/reports/currency', i: 'i-swap', t: 'وضعیت ارزها' },
        { h: '#/reports/ledger', i: 'i-book', t: 'دفتر حساب‌ها', s: 'رکورد به رکورد' },
      ]],
      ['امکانات', [
        { h: '#/stock', i: 'i-stock', t: 'گدام', s: `${fmt.plain(stats.items || 0)} کالا` + (low ? ` • ${fmt.plain(low)} کم‌موجود` : ''), badge: low ? `${fmt.plain(low)} هشدار` : '' },
        { h: '#/stock/new', i: 'i-plus', t: 'تعریف کالا', s: 'نام، قیمت، حداقل موجودی، عکس' },
        { h: '#/reports/inventory', i: 'i-swap', t: 'گردش گدام', s: 'ورود، خروج، ضایعات، اصلاح' },
        { h: '#/reports/stock', i: 'i-tag', t: 'ارزش موجودی', s: 'میانگین موزون' },
        { h: '#/parties', i: 'i-users', t: 'مشتریان و تأمین‌کنندگان', s: `${fmt.plain(stats.parties || 0)} شخص` },
        { h: '#/money', i: 'i-wallet', t: 'دفتر پول', s: `${fmt.plain(stats.tx || 0)} تراکنش` },
        { h: '#/rates', i: 'i-swap', t: 'ارزها و نرخ‌ها', s: 'نرخ را خودتان ثبت می‌کنید' },
        { h: '#/search', i: 'i-search', t: 'جست‌وجوی سراسری', s: 'شمارهٔ فاکتور، شخص، کالا' },
      ]],
      ['برنامه', [
        { h: '#/settings/appearance', i: 'i-cog', t: 'تنظیمات', s: 'رنگ، نوشته، تاریخ، ارز، چاپ' },
        { h: '#/settings/business', i: 'i-briefcase', t: 'معلومات کسب‌وکار و لوگو', s: 'که روی فاکتور چاپ شود' },
        { h: '#/settings/data', i: 'i-download', t: 'نسخهٔ پشتیبان و بازگردانی', s: 'فایل بگیرید، برگردانید' },
        { h: '#/guide', i: 'i-book', t: 'راهنمای سه‌قدمی', s: 'اگر نمی‌دانید از کجا شروع کنید' },
      ]],
    ];
    root.innerHTML = `<div class="wrap">
      ${low ? t`<a class="alertbar" href="#/stock?low=1">${icon('i-alert', 'ic nano')}
        <span><b>${fmt.plain(low)} کالا</b> به حد کمبود رسیده — وقت سفارش است.</span>${icon('i-back', 'ic nano flip')}</a>` : ''}
      ${btn({ label: 'ثبت فروش سریع', icon: 'i-sale', variant: 'primary', wide: true, attrs: `onclick="location.hash='#/sales/new'"`, class: 'quick-cta' })}
      <div class="quick">
        <a class="quick-item quick-brand" href="#/purchases/new"><span class="quick-ic">${icon('i-buy')}</span><b>ثبت خرید</b><i>کالا به گدام اضافه شود</i></a>
        <a class="quick-item quick-warn" href="#/money/new?type=expense"><span class="quick-ic">${icon('i-expense')}</span><b>ثبت هزینه</b><i>کرایه، معاش، برق</i></a>
        <a class="quick-item quick-accent" href="#/money/new?type=drawing"><span class="quick-ic">${icon('i-briefcase')}</span><b>برداشت شخصی</b><i>مصرف خانه</i></a>
        <a class="quick-item quick-success" href="#/reports/pl"><span class="quick-ic">${icon('i-chart')}</span><b>سود و زیان</b><i>این دوره</i></a>
      </div>
      ${groups.map(([g, items]) => card({
      title: g, class: 'card-flat',
      body: `<div class="list">${items.map((x) => row({
        href: x.h, icon: x.i, tone: x.tone || 'brand', title: x.t, sub: x.s || '',
        right: x.badge ? U.pill(x.badge, 'warn', 'i-alert') : '',
      })).join('')}</div>`,
    })).join('')}
      ${card({
      title: 'نصب روی گوشی',
      hint: 'برنامه را مثل یک اپلیکیشن نصب کنید تا با یک آیکون باز شود و بدون اینترنت هم کار کند.',
      body: `<p class="muted small">در اندروید: منوی مرورگر ← «افزودن به صفحهٔ اصلی». در آیفون (Safari): دکمۀ Share ← «Add to Home Screen».</p>`,
      footer: btn({ label: 'امتحان نصب', icon: 'i-download', variant: 'soft', small: true, act: 'install' }),
    })}
      <p class="muted small center">حساب • نسخهٔ ${esc(store.boot().version || '1.0.0')} • داده‌ها روی همین دستگاه است</p>
    </div>`;
    delegate(root, {
      install: async () => {
        const ev = window.__deferredPrompt;
        if (ev?.prompt) { ev.prompt(); const r = await ev.userChoice; U.toast(r.outcome === 'accepted' ? 'نصب شد.' : 'نصب لغو شد.', r.outcome === 'accepted' ? 'success' : 'warn'); }
        else U.toast('از منوی مرورگر گزینهٔ «افزودن به صفحهٔ اصلی» را بزنید.', 'info', 6000);
      },
    });
  },
};
