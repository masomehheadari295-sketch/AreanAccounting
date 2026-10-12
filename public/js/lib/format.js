/**
 * format.js — قالب‌نمایش تاریخ، عدد، پول و درصد بر پایهٔ تنظیمات کاربر.
 * در مرورگر و سرور مشترک است، پس گزارش چاپی و صفحهٔ برنامه همیشه یکسان نمایش می‌دهند.
 */
import M from './money.js';
import * as J from './jalali.js';

export const DEFAULT_SETTINGS = {
  brand: '#2f6df6',
  accent: '#0ea5a4',
  theme: 'auto', // light | dark | auto
  font: 'vazirmatn', // vazirmatn | vazirmatn-ui | system
  font_scale: 1,
  glass: 1, // ۰ = بدون شیشه‌ای
  radius: 18,
  currency_base: 'AFN',
  currency_default: 'AFN',
  calendar: 'jalali', // jalali | gregorian
  date_format: 'jalali_short', // jalali_short | jalali_long | gregorian | gregorian_slash
  digits: 'fa', // fa | en
  group: true,
  decimals_money: 0, // رقم اعشار پیش‌فرض مبالغ
  decimals_qty: 2,
  cal_style: 'afghan', // afghan | iranian
  tax_enabled: false,
  tax_percent: 0,
  doc_prefix_sale: 'INV',
  doc_prefix_purchase: 'PUR',
  business: {
    name: 'کسب‌وکار من',
    tagline: '',
    phone: '',
    address: '',
    email: '',
    logo: '',
    footer: 'از خرید شما سپاسگزاریم.',
    invoice_note: 'این سند پیش‌فاکتور رسمی نیست.',
    paper: 'a4', // a4 | a5 | 80mm
    show_logo: true,
  },
};

export const CURRENCY_LABEL = {
  AFN: 'افغانی', USD: 'دالر امریکایی', EUR: 'یورو', INR: 'روپیه هند', PKR: 'روپیه پاکستان',
  IRR: 'تومان', AED: 'درهم امارات', TRY: 'لیره ترکیه', GBP: 'پوند انگلستان', TMT: 'منات ترکمنستان',
  UZS: 'سوم ازبکستان', CNY: 'یوان چین',
};

export function mergeSettings(partial) {
  const out = { ...DEFAULT_SETTINGS, ...(partial || {}) };
  out.business = { ...DEFAULT_SETTINGS.business, ...((partial || {}).business || {}) };
  return out;
}

const dg = (s, st) => (st.digits === 'fa' ? M.toFaDigits(s) : s);

/** تاریخ: بسته به تنظیمات کاربر */
export function fmtDate(iso, st = DEFAULT_SETTINGS) {
  if (!iso) return '—';
  const d = String(iso).slice(0, 10);
  switch (st.date_format) {
    case 'jalali_long': {
      const j = J.jalaliFromIso(d);
      if (!j) return d;
      return dg(`${j.jd}`, st) + ' ' + J.monthName(j.jm, st.cal_style) + ' ' + dg(j.jy, st);
    }
    case 'gregorian':
      return dg(d, st);
    case 'gregorian_slash': {
      const [y, m, dd] = d.split('-');
      return dg(`${dd}/${m}/${y}`, st);
    }
    default: {
      const j = J.jalaliFromIso(d);
      if (!j) return d;
      return dg(`${j.jy}/${J.pad2(j.jm)}/${J.pad2(j.jd)}`, st);
    }
  }
}

export function fmtDateWithWeekday(iso, st = DEFAULT_SETTINGS) {
  const d = String(iso || '').slice(0, 10);
  const w = J.WEEKDAYS[J.weekdayIndex(d)];
  return `${fmtDate(d, st)} — ${w}`;
}

/** تبدیل رشتهٔ نمایشی (شمسی یا میلادی) به ISO میلادی؛ خطا → null */
export function parseUserDate(text, st = DEFAULT_SETTINGS) {
  const t = String(text ?? '').trim().replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/\s/g, '');
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const parts = t.split(/[/.\-]/).map(Number);
  if (parts.length === 3 && parts.every((x) => x > 0)) {
    const [y, m, d] = parts;
    if (st.calendar === 'gregorian') return y > 2500 ? `${y}-${J.pad2(m)}-${J.pad2(d)}` : J.isoFromJalali(y, m, d);
    return J.isoFromJalali(y, m, d);
  }
  if (/^(\d{1,2})(\d{2})(\d{2})$/.test(t)) {
    const m = t.match(/^(\d{1,2})(\d{2})(\d{2})$/);
    return J.isoFromJalali(+m[1] + (st.calendar === 'gregorian' ? 0 : 0), +m[2], +m[3]);
  }
  return null;
}

/** مبلغ با ارز: «۱۲٬۵۰۰ افغانی» */
export function fmtMoney(micro, code, st = DEFAULT_SETTINGS, opts = {}) {
  const cur = (st.currencies || []).find((c) => c.code === code);
  const dec = opts.decimals ?? cur?.decimals ?? st.decimals_money;
  const symbol = opts.noSymbol ? '' : (cur?.symbol || code || '');
  return M.fmt(typeof micro === 'bigint' || typeof micro === 'string' ? M.fromDb(micro) : micro, {
    decimals: dec, group: st.group, digits: st.digits, currency: symbol, sign: opts.sign,
  });
}

export function fmtMoneyCur(micro, code, st = DEFAULT_SETTINGS, opts = {}) {
  const cur = (st.currencies || []).find((c) => c.code === code);
  const label = opts.short ? (cur?.symbol || code) : (cur?.name || CURRENCY_LABEL[code || ''] || code);
  const v = fmtMoney(micro, code, st, { ...opts, noSymbol: true });
  return `${v} ${label}`;
}

export const fmtQty = (micro, st = DEFAULT_SETTINGS, unit = '') =>
  M.fmt(micro, { decimals: st.decimals_qty ?? 2, group: st.group, digits: st.digits, currency: unit });

export const fmtPct = (micro, st = DEFAULT_SETTINGS, dec = 1) =>
  M.fmt(M.round(micro, dec), { decimals: dec, group: false, digits: st.digits }) + (st.digits === 'fa' ? '٪' : '%');

/** فاصلهٔ زمانی به زبان ساده */
export function relTime(isoDateTime, st = DEFAULT_SETTINGS) {
  if (!isoDateTime) return '';
  const then = new Date(String(isoDateTime).replace(' ', 'T') + (/[z+]/i.test(isoDateTime) ? '' : 'Z')).getTime();
  if (!isFinite(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  const table = [[60, 'دقیقه'], [24, 'ساعت'], [30, 'روز'], [12, 'ماه'], [9999, 'سال']];
  if (mins < 1) return 'هم‌اکنون';
  let value = mins, unit = 'دقیقه';
  if (mins < 60) { value = mins; unit = 'دقیقه'; }
  else if (mins < 1440) { value = Math.round(mins / 60); unit = 'ساعت'; }
  else if (mins < 43200) { value = Math.round(mins / 1440); unit = 'روز'; }
  else { value = Math.round(mins / 43200); unit = 'ماه'; }
  return dg(value, st) + ' ' + unit + ' پیش';
}

/** برچسب ماه جلالی برای نمودارها */
export function monthLabel(key, st = DEFAULT_SETTINGS) {
  const [jy, jm] = String(key).split('-').map(Number);
  if (!jy) return key;
  const nm = J.monthName(jm, st.cal_style);
  return st.digits === 'fa' ? `${nm} ${M.toFaDigits(String(jy).slice(-2))}` : `${nm} ${String(jy).slice(-2)}`;
}

export function numberFromInput(v) {
  const m = M.parse(v);
  return m === null ? null : m;
}

/** عدد با جداکنندهٔ هزارگان برای ورودی (نمایش) */
export function inputNumber(micro, st = DEFAULT_SETTINGS, dec = null) {
  const d = dec ?? DEFAULT_SETTINGS.decimals_money;
  return M.fmt(micro, { decimals: d, group: st.group, digits: 'en', sign: 'auto' }).replace(/٬/g, '');
}

export default { fmtDate, fmtDateWithWeekday, fmtMoney, fmtMoneyCur, fmtQty, fmtPct, relTime, monthLabel, parseUserDate, DEFAULT_SETTINGS, mergeSettings, CURRENCY_LABEL };
