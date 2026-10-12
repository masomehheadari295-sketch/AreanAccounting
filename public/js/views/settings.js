/**
 * settings.js — تنظیمات: ظاهر، قالب اعداد و تاریخ، ارزها، معلومات کسب‌وکار، مالیات و داده‌ها.
 * هیچ تنظیمی عددی را در دیتابیس تغییر نمی‌دهد؛ فقط نمایش و رفتار برنامه را عوض می‌کند.
 */
import * as U from '../core/ui.js';
import * as fmt from '../core/fmt.js';
import * as store from '../core/store.js';
import api, { pending, failedQueue, clearQueue, flush } from '../core/api.js';
import M from '../lib/money.js';

const { t, icon, card, btn, row, pill, field, input, select, switchField, segmented, esc, readForm, delegate } = U;

const TABS = [
  ['appearance', 'ظاهر', 'i-eye', 'رنگ، تاریکی/روشنی، اندازهٔ نوشته'],
  ['formats', 'تاریخ و اعداد', 'i-book', 'شمسی یا میلادی، رقم فارسی، اعشار'],
  ['currency', 'ارزها', 'i-swap', 'ارز پایه، ارز پیش‌فرض، نرخ'],
  ['business', 'کسب‌وکار', 'i-briefcase', 'نام، آدرس، لوگو، فاکتور'],
  ['tax', 'مالیات و شمارهٔ اسناد', 'i-tag', 'مالیات، پیشوند فاکتورها'],
  ['data', 'داده‌ها و پشتیبان', 'i-download', 'گرفتن نسخه، بازگردانی، پاک کردن'],
  ['about', 'دربارهٔ برنامه', 'i-info', 'نسخه، نصب، راهنما'],
];

export default {
  name: 'settings',
  title: () => 'تنظیمات',
  sub: () => `<span class="muted small">هر تغییر بلافاصله اعمال می‌شود</span>`,
  async render({ root, params }) {
    const tab = params.tab || 'appearance';
    const st = store.settings();
    root.innerHTML = `<div class="wrap">
      <div class="chips">${TABS.map(([k, l, ic]) => `<a class="chip ${tab === k ? 'on' : ''}" href="#/settings/${k}">${icon(ic, 'ic nano')}${esc(l)}</a>`).join('')}</div>
      <div data-tab>${U.skeleton(3)}</div>
    </div>`;
    const host = root.querySelector('[data-tab]');
    const V = {
      appearance: viewAppearance, formats: viewFormats, currency: viewCurrency,
      business: viewBusiness, tax: viewTax, data: viewData, about: viewAbout,
    };
    await (V[tab] || viewAppearance)(host, st);
  },
};

/* ---------------------- کمک‌کارها ---------------------- */
/** ذخیرۀ یک Blob با نام فایل (برای نسخۀ JSON) */
function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------------------- ابزار ذخیره ---------------------- */
async function save(patch, host, st, msg = 'تنظیمات ذخیره شد.') {
  try {
    const r = await store.mutate('post', '/api/settings', patch, { success: msg, quiet: true });
    await store.load(true);
    store.applyAppearance();
    U.toast(msg, 'success');
    if (host) { const next = r?.settings || store.settings(); await rerender(host, next); }
    return r;
  } catch (e) { U.toast(e.userMessage || 'ذخیره نشد', 'danger', 6000); }
}
const rerender = async (host, st) => {
  const tab = (location.hash.split('/')[2] || 'appearance').split('?')[0];
  const V = { appearance: viewAppearance, formats: viewFormats, currency: viewCurrency, business: viewBusiness, tax: viewTax, data: viewData, about: viewAbout };
  await (V[tab] || viewAppearance)(host, st || store.settings());
};
const colorRow = (label, name, value, hint) => t`
  <div class="colorrow">
    <label class="field" data-field="${name}">
      <span class="field-label">${esc(label)}</span>
      <span class="colorbox">
        <input type="color" name="${name}_pick" value="${esc(value)}" aria-label="${esc(label)}">
        <input class="inp inp-num" name="${name}" value="${esc(value)}" maxlength="7" aria-label="کد رنگ ${esc(label)}">
      </span>
      <span class="field-hint">${esc(hint)}</span>
    </label>
    <span class="colorpreview" data-preview="${name}" style="--pv:${esc(value)}">نمونهٔ نوشته</span>
  </div>`;

/* ---------------------- ۱. ظاهر ---------------------- */
async function viewAppearance(host, st) {
  host.innerHTML = `
    ${card({
    title: 'رنگ‌ها',
    hint: 'رنگ فقط زیبا کردن نیست: وضعیت‌ها همیشه با نوشته هم نشان داده می‌شوند، پس اگر رنگ را عوض کنید چیزی گم نمی‌شود.',
    body: `<form class="form" data-onsubmit="colors">
        ${colorRow('رنگ اصلی', 'brand', st.brand, 'دکمه‌ها، انتخاب‌ها و نمودار فروش')}
        ${colorRow('رنگ دوم', 'accent', st.accent, 'برای برجسته کردن مانده و هشدارها')}
        ${btn({ label: 'ذخیرهٔ رنگ‌ها', type: 'submit', variant: 'primary', icon: 'i-check' })}
        ${btn({ label: 'رنگ‌های پیش‌فرض', variant: 'ghost', act: 'reset-colors' })}
      </form>`,
  })}
    ${card({
    title: 'نور و تاریکی',
    body: `<form class="form" data-onsubmit="ap">
        ${field({ label: 'حالت', name: 'theme', control: segmented({ name: 'theme', value: st.theme, items: [{ value: 'light', label: 'روشن', icon: 'i-sun' }, { value: 'dark', label: 'تاریک', icon: 'i-moon' }, { value: 'auto', label: 'خودکار', icon: 'i-cog' }] }), hint: 'خودکار یعنی با تنظیمات گوشی همراه می‌شود.' })}
        ${field({ label: 'اندازۀ نوشته', name: 'font_scale', control: segmented({ name: 'font_scale', value: String(st.font_scale), items: [{ value: '0.92', label: 'ریز' }, { value: '1', label: 'معمولی' }, { value: '1.08', label: 'درشت' }, { value: '1.18', label: 'خیلی درشت' }] }), hint: 'اگر خواندن عددّها سخت است، درشت‌ترش کنید.' })}
        ${field({ label: 'فونت', name: 'font', control: select({ name: 'font', value: st.font, options: [{ value: 'vazirmatn', label: 'وزیرمتن (پیش‌فرض، خوانا در فارسی)' }, { value: 'system', label: 'فونت خود گوشی/کمپیوتر' }] }) })}
        <div class="btn-group">
          ${switchField({ name: 'glass', checked: !!st.glass, label: 'شیشه‌ای مات', hint: 'کارت‌ها کمی شفاف و لایه‌ای شوند. اگر خوانایی کم شد، خاموشش کنید.' })}
        </div>
        ${btn({ label: 'اعمال', type: 'submit', variant: 'primary', icon: 'i-check' })}
      </form>`,
  })}`;
  const sync = (f) => {
    ['brand', 'accent'].forEach((n) => {
      const pick = f.querySelector(`[name=${n}_pick]`);
      const hex = f.querySelector(`[name=${n}]`);
      const on = () => { hex.value = pick.value; f.querySelector(`[data-preview=${n}]`).style.setProperty('--pv', pick.value); };
      pick.oninput = on;
      hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { pick.value = hex.value; on(); } };
    });
  };
  sync(host.querySelector('form'));
  delegate(host, {
    colors: (f) => { const v = readForm(f); return save({ brand: v.brand, accent: v.accent }, host, st, 'رنگ‌ها عوض شد.'); },
    ap: (f) => {
      const v = readForm(f);
      return save({ theme: v.theme, font: v.font, font_scale: Number(v.font_scale), glass: v.glass ? 1 : 0 }, host, st, 'ظاهر به‌روز شد.');
    },
    'reset-colors': () => save({ brand: '#2f6df6', accent: '#0ea5a4' }, host, st, 'رنگ‌های پیش‌فرض برگشت.'),
  });
}

/* ---------------------- ۲. تاریخ و اعداد ---------------------- */
function viewFormats(host, st) {
  const sample = { money: fmt.money(M.mul(1234567n, M.SCALE / 100n), 'AFN'), date: fmt.date('2026-10-11'), long: fmt.dateLong('2026-10-11'), qty: fmt.qty(M.fromDb('2500000')) };
  host.innerHTML = card({
    title: 'چطور نمایش داده شود',
    hint: 'این انتخاب‌ها فقط نوشته‌ها را عوض می‌کند؛ مبلغی که ذخیره شده تغییر نمی‌کند.',
    body: `<form class="form" data-onsubmit="save">
      ${field({ label: 'تقویم', name: 'date_format', control: segmented({ name: 'date_format', value: st.date_format, items: [{ value: 'jalali_short', label: 'شمسی' }, { value: 'jalali_long', label: 'شمسی با نام ماه' }, { value: 'gregorian', label: 'میلادی' }] }), hint: `نمونهٔ الان: <b>${sample.date}</b> — ${sample.long}` })}
      ${field({ label: 'نام ماه‌ها', name: 'cal_style', control: select({ name: 'cal_style', value: st.cal_style, options: [{ value: 'afghan', label: 'افغانی (ثور، جوزا…)' }, { value: 'iran', label: 'ایرانی (فروردین، اردیبهشت…)' }] }) })}
      ${field({ label: 'ارقام', name: 'digits', control: segmented({ name: 'digits', value: st.digits, items: [{ value: 'fa', label: 'فارسی ۱۲۳' }, { value: 'lat', label: 'لاتین 123' }] }), hint: 'نمونه: ' + sample.money })}
      <div class="grid-2">
        ${field({ label: 'ارقام اعشاری پول', name: 'decimals_money', control: select({ name: 'decimals_money', value: st.decimals_money, options: [0, 1, 2, 3].map((n) => ({ value: n, label: String(n) + ' رقم' })) }), hint: 'افغانی معمولاً ۰ یا ۲ رقم.' })}
        ${field({ label: 'ارقام اعشاری مقدار', name: 'decimals_qty', control: select({ name: 'decimals_qty', value: st.decimals_qty, options: [0, 1, 2, 3].map((n) => ({ value: n, label: String(n) + ' رقم' })) }), hint: 'برای کیلو و لیتر. نمونه: ' + sample.qty })}
      </div>
      ${switchField({ name: 'group', checked: !!st.group, label: 'جداکنندهٔ هزارگان', hint: 'مثلاً ۱٬۲۵۰ به‌جای ۱۲۵۰' })}
      ${btn({ label: 'ذخیره', type: 'submit', variant: 'primary', wide: true })}
    </form>`,
  });
  delegate(host, {
    save: (f) => {
      const v = readForm(f);
      return save({ date_format: v.date_format, cal_style: v.cal_style, digits: v.digits, decimals_money: +v.decimals_money, decimals_qty: +v.decimals_qty, group: v.group ? 1 : 0, calendar: v.date_format.startsWith('jalali') ? 'jalali' : 'greg' }, host, st, 'قالب نمایش عوض شد.');
    },
  });
}

/* ---------------------- ۳. ارز ---------------------- */
function viewCurrency(host, st) {
  const list = store.currencies();
  const base = st.currency_base || 'AFN';
  const sampleBase = M.mul(100n * M.SCALE, M.fromDb(String(list.find((c) => c.code === base)?.rate || M.SCALE)));
  host.innerHTML = `
    ${card({
    title: 'ارز اصلی (پایه)',
    hint: 'همهٔ گزارش‌ها و جمع‌ها بر همین ارز نشان داده می‌شود. در افغانستان معمولاً افغانی.',
    body: `<form class="form" data-onsubmit="base">
        ${field({ label: 'ارز پایه', name: 'currency_base', control: select({ name: 'currency_base', value: base, options: list.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })) }) })}
        ${field({ label: 'ارز پیش‌فرض فرم‌ها', name: 'currency_default', control: select({ name: 'currency_default', value: st.currency_default, options: list.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })) }), hint: 'وقتی فاکتور تازه می‌سازید، این ارز انتخاب شده است.' })}
        ${btn({ label: 'ذخیره', type: 'submit', variant: 'primary' })}
        <a class="btn btn-soft" href="#/rates">${icon('i-swap', 'ic nano')} ثبت نرخ روز</a>
      </form>`,
  })}
    ${card({
    title: 'ارزهایی که استفاده می‌کنید',
    hint: 'هر حساب، صندوق و سند یک ارز دارد. ارزها با هم جمع نمی‌شوند.',
    class: 'card-flat',
    body: `<div class="list">${list.map((c) => row({
      arrow: false,
      icon: 'i-swap', tone: c.active ? 'success' : 'muted',
      title: `${esc(c.name)} <span class="muted small">${esc(c.code)} · ${esc(c.symbol || '')} · ${fmt.plain(c.decimals)} رقم اعشاری</span>`,
      sub: c.code === base ? 'ارز پایه — مبنای همهٔ معادل‌ها' : `آخرین نرخی که ثبت کرده‌اید: ${esc(fmt.rateStr(c.rate))} ${esc(fmt.cur(base).name)}`,
      right: c.code === base ? pill('پایه', 'brand', 'i-flag') : pill(c.active ? 'فعال' : 'بایگان', c.active ? 'success' : 'muted'),
    })).join('')}</div>`,
    footer: `<div class="btn-group">${btn({ label: 'افزودن ارز', icon: 'i-plus', variant: 'soft', small: true, attrs: `onclick="location.hash='#/rates'"` })}${btn({ label: 'تنظیم نرخ', icon: 'i-swap', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/rates'"` })}</div>`,
  })}
    ${card({
    title: 'ارزش‌گذاری موجودی (گدام)',
    hint: 'یک روش، ثابت و روشن — تا عددّها همیشه قابل ردیابی بمانند.',
    body: U.note(`<b>میانگین موزون:</b> بهای هر کالای تازه‌خرید با بهای قبلی مخلوط می‌شود و یک «میانگین بها» می‌سازد.
      مثال: ۱۰ بوری هر کدام ۱۰۰۰، سپس ۱۰ بوری هر کدام ۱۲۰۰ ← میانگین ۱۱۰۰. سود فروش از همین میانگین حساب می‌شود.
      موجودی منفی اجازه ندارد مگر با «اصلاح شمارش» که دلیل می‌خواهد. هر ورود و خروج به یک سند یا دلیل وصل است.`, 'info'),
    footer: `<div class="btn-group">${btn({ label: 'بازشماری موجودی از اسناد', icon: 'i-swap', variant: 'soft', small: true, act: 'rebuild' })}${btn({ label: 'گزارش ارزش موجودی', icon: 'i-chart', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/reports/stock'"` })}</div>`,
  })}`;
  delegate(host, {
    base: (f) => { const v = readForm(f); return save({ currency_base: v.currency_base, currency_default: v.currency_default }, host, st, 'تنظیمات ارز ذخیره شد.'); },
    rebuild: async () => {
      const yes = await U.confirmBox({ title: 'بازشماری موجودی گدام؟', text: 'برنامه موجودی هر کالا را از اول روی اسناد و حرکت‌ها دوباره حساب می‌کند. داده‌ای پاک یا تغییر نمی‌کند — فقط اگر جایی ناهمخوانی باشد اصلاح می‌شود.', ok: 'بازشماری کن' });
      if (!yes) return;
      try {
        const r = await api.post('/api/stock/rebuild', {});
        U.toast(`${r?.message || 'بازشماری شد.'} ${fmt.plain(r?.items || 0)} کالا دوباره حساب شد.`, 'success', 5000);
      } catch (e) { U.toast(e.userMessage || 'بازشماری نشد', 'danger', 6000); }
    },
  });
}

/* ---------------------- ۴. کسب‌وکار ---------------------- */
function viewBusiness(host, st) {
  const b = st.business || {};
  host.innerHTML = `
    ${card({
    title: 'معلومات روی فاکتور',
    hint: 'این نوشته‌ها در چاپ فاکتور و رسید می‌آید.',
    body: `<form class="form" data-onsubmit="save">
        ${field({ label: 'نام کسب‌وکار', name: 'biz_name', required: true, control: input({ name: 'biz_name', value: b.name || '', placeholder: 'مثلاً: خوروردگاه نور' }) })}
        ${field({ label: 'شعار یا توضیح کوتاه', name: 'tagline', control: input({ name: 'tagline', value: b.tagline || '', placeholder: 'مثلاً: خرید مطمئن، قیمت مناسب' }) })}
        <div class="grid-2">
          ${field({ label: 'شماره تماس', name: 'phone', control: input({ name: 'phone', type: 'tel', value: b.phone || '' }) })}
          ${field({ label: 'ایمیل', name: 'email', control: input({ name: 'email', type: 'email', value: b.email || '' }) })}
        </div>
        ${field({ label: 'آدرس', name: 'address', control: U.textarea({ name: 'address', rows: 2, value: b.address || '' }) })}
        ${field({ label: 'نمرۀ مالیاتی / جواز (اختیاری)', name: 'tax_no', control: input({ name: 'tax_no', value: b.tax_no || '' }) })}
        ${field({ label: 'نوشتهٔ پایین فاکتور', name: 'footer', control: input({ name: 'footer', value: b.footer || '', placeholder: 'از خرید شما سپاسگزاریم.' }) })}
        ${field({ label: 'یادداشت حقوقی روی فاکتور', name: 'invoice_note', control: input({ name: 'invoice_note', value: b.invoice_note || '' }) })}
        ${field({ label: 'اندازۀ کاغذ چاپ', name: 'paper', control: segmented({ name: 'paper', value: b.paper || 'a4', items: [{ value: 'a4', label: 'A4' }, { value: 'a5', label: 'A5' }, { value: '80mm', label: 'رسید ۸۰ میلی' }] }), hint: 'چاپ خودکار برای همین اندازه آماده می‌شود.' })}
        ${switchField({ name: 'show_logo', checked: b.show_logo !== false, label: 'لوگو روی فاکتور باشد' })}
        ${btn({ label: 'ذخیرهٔ معلومات', type: 'submit', variant: 'primary', wide: true })}
      </form>`,
  })}
    ${card({
    title: 'لوگو',
    hint: 'یک تصویر ساده (PNG/JPG/SVG) تا ۱٫۵ مگابایت. روی فاکتور چاپی هم می‌آید.',
    body: `<div class="logobox">
        ${b.logo ? `<img src="${esc(b.logo)}" alt="لوگوی کسب‌وکار">` : `<div class="logofake">${icon('i-briefcase', 'ic big')}<span>لوگو ندارد</span></div>`}
        <div class="btn-group">
          ${btn({ label: 'انتخاب لوگو', icon: 'i-upload', variant: 'primary', small: true, act: 'logo' })}
          ${b.logo ? btn({ label: 'برداشتن لوگو', icon: 'i-trash', variant: 'ghost', small: true, act: 'nologo' }) : ''}
        </div>
      </div>`,
  })}
    ${card({
    title: 'پیش‌نمایش فاکتور',
    hint: 'اگر سندی دارید، ظاهر چاپ را می‌بینید.',
    class: 'card-flat',
    body: `<p class="muted small">پیش‌نمایش با آخرین سند شما ساخته می‌شود؛ برای دیدن، دکمه را بزنید (در تب تازه باز می‌شود و همان‌جا چاپ یا PDF بگیرید).</p>`,
    footer: btn({ label: 'دیدن چاپ یک فاکتور', icon: 'i-print', variant: 'soft', small: true, act: 'preview' }),
  })}`;
  delegate(host, {
    save: (f) => {
      const v = readForm(f);
      if (!v.biz_name?.trim()) return U.toast('نام کسب‌وکار را بنویسید.', 'warn');
      return save({ business: { name: v.biz_name.trim(), tagline: v.tagline, phone: v.phone, email: v.email, address: v.address, tax_no: v.tax_no, footer: v.footer, invoice_note: v.invoice_note, paper: v.paper, show_logo: v.show_logo ? 1 : 0, logo: b.logo || '' } }, host, st, 'معلومات کسب‌وکار ذخیره شد.');
    },
    logo: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f0 = inp.files?.[0]; if (!f0) return;
        const rd = new FileReader();
        rd.onload = async () => {
          const small = await U.shrink(String(rd.result), 520);
          try {
            const r = await api.post('/api/settings/logo', { data: small, filename: f0.name });
            await save({ business: { logo: r.path || `/files/${r.name}` } }, host, st, 'لوگو افزوده شد.');
          } catch (e) { U.toast(e.userMessage || 'لوگو ذخیره نشد', 'danger', 6000); }
        };
        rd.readAsDataURL(f0);
      };
      inp.click();
    },
    nologo: () => save({ business: { logo: '' } }, host, st, 'لوگو برداشته شد.'),
    preview: async () => {
      try {
        const d = await api.get('/api/docs?limit=1&type=sale');
        const id = d.rows?.[0]?.id;
        if (!id) return U.toast('هنوز فاکتوری ثبت نکرده‌اید که پیش‌نمایش شود.', 'warn');
        window.open(`/print/doc/${id}`, '_blank', 'noopener');
      } catch (e) { U.toast('پیش‌نمایش ممکن نشد', 'warn'); }
    },
  });
}

/* ---------------------- ۵. مالیات و شماره‌گذاری ---------------------- */
function viewTax(host, st) {
  host.innerHTML = `
    ${card({
    title: 'مالیات و عوارض',
    hint: 'اگر مالیات نمی‌گیرید، خاموش بگذارید تا در فرم‌ها دیده نشود.',
    body: `<form class="form" data-onsubmit="save">
        ${switchField({ name: 'tax_enabled', checked: !!st.tax_enabled, label: 'مالیات در فاکتورها فعال باشد', hint: 'مالیات روی مبلغ پس از تخفیف حساب می‌شود.' })}
        ${field({ label: 'فیصدی پیش‌فرض', name: 'tax_percent', control: input({ name: 'tax_percent', type: 'money', value: fmt.inputValue(M.mul(M.fromDb(String(st.tax_percent ?? 0)), M.SCALE), 2) }), hint: 'مثلاً ۲ یعنی دو فیصد. در هر فاکتور هم می‌توانید عوضش کنید.' })}
        ${btn({ label: 'ذخیره', type: 'submit', variant: 'primary', wide: true })}
      </form>`,
  })}
    ${card({
    title: 'شماره‌گذاری اسناد',
    hint: 'شماره‌ها خودکار و یکتا ساخته می‌شوند؛ پیشوند را می‌توانید عوض کنید.',
    body: `<form class="form" data-onsubmit="nums">
        <div class="grid-2">
          ${field({ label: 'پیشوند فاکتور فروش', name: 'doc_prefix_sale', control: input({ name: 'doc_prefix_sale', value: st.doc_prefix_sale || 'INV' }), hint: 'نمونه: ' + esc((st.doc_prefix_sale || 'INV') + '-۱۴۰۵-۰۰۰۱') })}
          ${field({ label: 'پیشوند سند خرید', name: 'doc_prefix_purchase', control: input({ name: 'doc_prefix_purchase', value: st.doc_prefix_purchase || 'PUR' }), hint: 'نمونه: ' + esc((st.doc_prefix_purchase || 'PUR') + '-۱۴۰۵-۰۰۰۱') })}
        </div>
        ${btn({ label: 'ذخیرهٔ پیشوندها', type: 'submit', variant: 'primary', wide: true })}
      </form>`,
  })}`;
  delegate(host, {
    save: (f) => {
      const v = readForm(f);
      const pct = M.parse(v.tax_percent || '0');
      return save({ tax_enabled: v.tax_enabled ? 1 : 0, tax_percent: M.toDb(pct || 0n) }, host, st, 'تنظیمات مالیات ذخیره شد.');
    },
    nums: (f) => {
      const v = readForm(f);
      const clean = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
      return save({ doc_prefix_sale: clean(v.doc_prefix_sale) || 'INV', doc_prefix_purchase: clean(v.doc_prefix_purchase) || 'PUR' }, host, st, 'پیشوندها ذخیره شد.');
    },
  });
}

/* ---------------------- ۶. داده‌ها ---------------------- */
function viewData(host, st) {
  const boot = store.boot();
  const stats = boot.stats || {};
  const q = pending();
  const bad = failedQueue();
  host.innerHTML = `
    ${U.note('داده‌های شما روی همین دستگاه (یا همین سرور) نگه داشته می‌شود. هیچ چیز به جای دیگری فرستاده نمی‌شود. برای اطمینان، هر از گاهی «نسخهٔ پشتیبان» بگیرید.', 'info')}
    ${card({
    title: 'نسخهٔ پشتیبان',
    hint: 'یک فایل می‌گیرید که همه‌چیز داخلش است: اسناد، کالاها، حساب‌ها، تنظیمات و نرخ‌ها.',
    body: `<div class="btn-group">
        ${btn({ label: 'گرفتن نسخه (فایل JSON)', icon: 'i-download', variant: 'primary', small: true, act: 'export' })}
        ${btn({ label: 'نسخهٔ دیتابیس (SQLite)', icon: 'i-download', variant: 'soft', small: true, act: 'exportdb' })}
      </div>`,
  })}
    ${card({
    title: 'بازگردانی نسخه',
    hint: 'همهٔ داده‌های فعلی با فایل جایگزین می‌شود. اگر از این مطمئن نیستید، اول نسخهٔ جدید بگیرید.',
    body: `<div class="btn-group">
        ${btn({ label: 'انتخاب فایل نسخه', icon: 'i-upload', variant: 'soft', small: true, act: 'import' })}
      </div>`,
  })}
    ${card({
    title: 'صف آفلاین',
    hint: 'وقتی اینترنت نیست، ثبت‌ها در صف می‌ماند و به‌محض اتصال می‌رود.',
    body: t`<div class="summary">
        <div><span>در صف</span><b>${fmt.plain(q)}</b><i class="muted small">${q ? 'به‌محض اتصال ارسال می‌شود' : 'صف خالی است'}</i></div>
        <div><span>ارسال‌نشده</span><b>${fmt.plain(bad.length)}</b><i class="muted small">${bad.length ? 'دلیلش در فهرست است' : 'مشکلی نیست'}</i></div>
      </div>
      ${bad.length ? `<div class="list mini">${bad.map((x) => row({ arrow: false, icon: 'i-alert', tone: 'danger', title: esc(`${x.method} ${x.path}`), sub: esc(x.error || 'خطا') }))}</div>` : ''}`,
    footer: `<div class="btn-group">${btn({ label: 'تلاش دوباره برای ارسال', icon: 'i-swap', variant: 'soft', small: true, act: 'flush' })}${bad.length ? btn({ label: 'پاک کردن صف', icon: 'i-trash', variant: 'ghost', small: true, act: 'clearq' }) : ''}</div>`,
  })}
    ${card({
    title: 'دادهٔ نمونه',
    hint: 'برای دیدن شکل کار: چند کالا، مشتری، فاکتور و هزینه. اگر دادهٔ واقعی دارید، «پاک کردن» نزنید.',
    body: `<div class="btn-group">
        ${btn({ label: stats.docs ? 'بارگذاری مجدد نمونه' : 'دیدن نمونهٔ کاری', icon: 'i-book', variant: 'soft', small: true, act: 'seed' })}
        ${stats.docs ? btn({ label: 'پاک کردن همهٔ داده‌ها', icon: 'i-trash', variant: 'ghost', small: true, act: 'clear' }) : ''}
      </div>`,
  })}
    ${card({
    title: 'سنجش حساب‌ها',
    hint: 'موجودی گدام، ماندهٔ اسناد و حساب‌ها را دوباره از اصل اسناد حساب می‌کند و ناهمخوانی را نشان می‌دهد.',
    body: `<div class="btn-group">${btn({ label: 'سنجش و اصلاح', icon: 'i-check', variant: 'soft', small: true, act: 'verify' })}${btn({ label: 'دیدن گزارش گردش گدام', icon: 'i-chart', variant: 'ghost', small: true, attrs: `onclick="location.hash='#/reports/inventory'"` })}</div>`,
  })}
    ${card({
    title: 'حجم داده‌ها',
    class: 'card-flat',
    body: `<div class="summary">
        <div><span>سند فروش/خرید</span><b>${fmt.plain(stats.docs || 0)}</b></div>
        <div><span>کالاها</span><b>${fmt.plain(stats.items || 0)}</b></div>
        <div><span>مشتریان و تأمین‌کنندگان</span><b>${fmt.plain(stats.parties || 0)}</b></div>
        <div><span>تراکنش‌های پولی</span><b>${fmt.plain(stats.tx || 0)}</b></div>
        <div><span>حرکت‌های گدام</span><b>${fmt.plain(stats.moves || 0)}</b></div>
        <div><span>حجم حافظه</span><b>${esc(fmt.num((stats.db_bytes || 0) / 1024, 1))} کیلوبایت</b></div>
      </div>`,
    footer: `<a class="btn btn-ghost small" href="#/reports/ledger">دفتر حساب‌ها</a>`,
  })}`;
  delegate(host, {
    export: async () => {
      try {
        const data = await api.get('/api/export');
        const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
        saveFile(blob, `hesab-copy-${(data.exported_at || '').slice(0, 10) || 'backup'}.json`);
        U.toast('فایل نسخه در پوشهٔ دانلودها است.', 'success');
      } catch (e) { U.toast(e.userMessage || 'نسخه گرفته نشد', 'danger', 6000); }
    },
    exportdb: () => { location.href = '/api/backup.sqlite'; },
    import: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const f0 = inp.files?.[0]; if (!f0) return;
        const yes = await U.confirmBox({
          title: 'بازگردانی از فایل نسخه', danger: true, ok: 'بازیابی کن',
          text: 'همهٔ داده‌های فعلی پاک و با فایل جایگزین می‌شود. این کار برگشت‌ناپذیر است.',
          detail: `فایل: ${esc(f0.name)} · ${esc(fmt.num(f0.size / 1024, 1))} کیلوبایت`,
          check: 'می‌فهمم که داده‌های فعلی جایگزین می‌شود',
        });
        if (!yes) return;
        const word = await U.promptBox({ title: 'تأیید نهایی', text: 'برای ادامه دقیقاً این عبارت را بنویسید.', expected: 'بازیابی', ok: 'بازیابی' });
        if (word !== 'بازیابی') return;
        try {
          const text = await f0.text();
          const data = JSON.parse(text);
          const r = await api.post('/api/import', { ...data, confirm: 'بازیابی' });
          await store.load(true);
          U.toast(r?.message || 'داده‌ها بازیابی شد.', 'success', 6000);
          setTimeout(() => location.reload(), 700);
        } catch (e) { U.toast(e.userMessage || 'فایل خوانا نبود. فایلی که خود برنامه ساخته را انتخاب کنید.', 'danger', 7000); }
      };
      inp.click();
    },
    flush: async () => {
      const r = await flush();
      U.toast(r.sent ? `${fmt.plain(r.sent)} مورد ارسال شد.` : 'هنوز اتصال برقرار نیست.', r.sent ? 'success' : 'warn');
      rerender(host, st);
    },
    clearq: async () => {
      const yes = await U.confirmBox({ title: 'پاک کردن صف آفلاین؟', danger: true, text: 'ثبت‌هایی که هنوز نرفته‌اند حذف می‌شوند و ثبت نخواهند شد.', ok: 'پاک کن' });
      if (!yes) return; clearQueue(); U.toast('صف پاک شد.', 'success'); rerender(host, st);
    },
    seed: async () => {
      const yes = await U.confirmBox({
        title: 'بارگذاری دادهٔ نمونه؟',
        text: 'چند کالا، مشتری، فاکتور و هزینه به داده‌های شما افزوده می‌شود تا شکل کار را ببینید. بعداً می‌توانید تک‌تکشان را پاک کنید.',
        ok: 'بله، نمونه را ببینم',
      });
      if (!yes) return;
      try {
        const r = await api.post('/api/demo/seed', {});
        await store.load(true);
        U.toast('دادهٔ نمونه بارگذاری شد. از فهرست‌ها پاکش کنید تا به حالت خالی برگردید.', 'success', 6000);
        rerender(host, st);
      } catch (e) { U.toast(e.userMessage || 'نمونه بارگذاری نشد', 'danger', 6000); }
    },
    clear: async () => {
      const yes = await U.confirmBox({
        title: 'پاک کردن همهٔ داده‌ها', danger: true, ok: 'همه را پاک کن',
        text: 'اسناد، کالاها، حساب‌ها، اشخاص، نرخ‌ها و تراکنش‌ها پاک می‌شود. تنظیمات می‌ماند. نسخهٔ پشتیبان نگرفته‌اید؟',
        check: 'می‌خواهم همه‌چیز پاک شود',
      });
      if (!yes) return;
      const word = await U.promptBox({ title: 'تأیید نهایی', text: 'این عبارت را بنویسید تا پاک شود.', expected: 'پاک کردن', ok: 'پاک کن' });
      if (word !== 'پاک کردن') return;
      try {
        await api.post('/api/demo/clear', { confirm: 'پاک کردن' });
        await store.load(true);
        U.toast('داده‌ها پاک شد. برنامه آمادهٔ شروع است.', 'success', 6000);
        location.hash = '#/home';
      } catch (e) { U.toast(e.userMessage || 'پاک نشد', 'danger', 7000); }
    },
    verify: async () => {
      try {
        const r = await api.post('/api/verify', {});
        const n = (r.mismatches || []).length;
        U.sheet({
          title: 'نتیجهٔ سنجش',
          sub: n ? `${fmt.plain(n)} مورد اصلاح شد` : 'همه‌چیز سر جای خودش است',
          body: t`<p class="muted small">${esc(r.message || '')}</p>
            <div class="summary">
              <div><span>سند بررسی‌شده</span><b>${fmt.plain(r.docs || 0)}</b></div>
              <div><span>ناهمخوانی موجودی</span><b>${fmt.plain(n)}</b></div>
              <div><span>حساب منفی</span><b>${fmt.plain((r.negative_accounts || []).length)}</b></div>
            </div>
            ${(r.negative_accounts || []).length ? card({ class: 'card-flat', title: 'حساب‌هایی که منفی شده', body: `<div class="list mini">${r.negative_accounts.map((x) => row({ arrow: false, icon: 'i-alert', tone: 'danger', title: esc(x.account), right: `<span class="mono">${esc(fmt.money(x.balance, fmt.base()))}</span>` })).join('')}</div>` }) : ''}`,
        });
      } catch (e) { U.toast(e.userMessage || 'سنجش نشد', 'danger', 6000); }
    },
  });
}

/* ---------------------- ۷. درباره ---------------------- */
function viewAbout(host, st) {
  const boot = store.boot();
  host.innerHTML = `
    ${card({
    title: 'حساب',
    hint: 'یک برنامهٔ سبک حسابداری برای دکان و کسب‌وکار کوچک — بدون اصطلاح حسابداري.',
    body: `<div class="about">
        <p><b>نسخهٔ ${esc(boot.version || '1.0.0')}</b> — ${esc(fmt.dateLong(boot.today || fmt.today()))}</p>
        <ul class="ticks">
          <li>${icon('i-check', 'ic nano')} کار می‌کند وقتی اینترنت نیست؛ ثبت‌ها در صف می‌ماند.</li>
          <li>${icon('i-check', 'ic nano')} قابل نصب روی گوشی به‌شکل یک اپلیکیشن.</li>
          <li>${icon('i-check', 'ic nano')} پول با دقت کامل (بدون خطای اعشار) حساب می‌شود.</li>
          <li>${icon('i-check', 'ic nano')} همهٔ گزارش‌ها قابل چاپ و خروجی اکسل.</li>
        </ul>
      </div>`,
    footer: `<div class="btn-group">
        <a class="btn btn-soft small" href="#/guide">${icon('i-book', 'ic nano')} راهنمای سه‌قدمی</a>
        ${btn({ label: 'نصب برنامه', icon: 'i-download', variant: 'primary', small: true, act: 'install' })}
      </div>`,
  })}
    ${card({
    title: 'چند نکته که به دردتان می‌خورد',
    class: 'card-flat',
    body: `<div class="list">
        ${row({ arrow: false, icon: 'i-print', title: 'چاپ و PDF', sub: 'دکمهٔ چاپ در هر فاکتور و گزارش، صفحه را ساده و بی‌رنگ می‌کند تا جوهر کم مصرف شود.' })}
        ${row({ arrow: false, icon: 'i-swap', title: 'نرخ ارز', sub: 'نرخ را خودتان ثبت می‌کنید و روی هر سند می‌ماند؛ برنامه هیچ نرخ را خودکار عوض نمی‌کند.' })}
        ${row({ arrow: false, icon: 'i-alert', title: 'هشدار موجودی', sub: 'برای هر کالا یک «حداقل» بگذارید؛ اگر موجودی به آن رسید، در خانه و گدام هشدار می‌گیرید.' })}
        ${row({ arrow: false, icon: 'i-cog', title: 'بازگشت تنظیمات', sub: 'اگر رنگ یا اندازهٔ نوشته اذیت‌تان می‌کند، از تب «ظاهر» به حالت اول برگردید.' })}
      </div>`,
  })}`;
  delegate(host, {
    install: async () => {
      const ev = window.__deferredPrompt;
      if (ev?.prompt) { ev.prompt(); const r = await ev.userChoice; U.toast(r.outcome === 'accepted' ? 'برنامه نصب شد.' : 'نصب لغو شد.', r.outcome === 'accepted' ? 'success' : 'warn'); return; }
      U.toast('برای نصب: از منوی مرورگر «افزودن به صفحهٔ اصلی» را بزنید.', 'info', 6000);
    },
  });
}
