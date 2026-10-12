/**
 * fmt.js — قالب‌نمایش بر پایهٔ تنظیمات فعلی کاربر (ارقام، اعشار، ارز، تقویم).
 * تنها منبع حقیقت برای نمایش عدد و تاریخ در سراسر برنامه.
 */
import M from '../lib/money.js';
import * as J from '../lib/jalali.js';
import F from '../lib/format.js';

let st = F.DEFAULT_SETTINGS;
let currencies = [];

export function setSettings(next) { if (next) st = { ...st, ...next }; }
export function setDictionaries(d) { if (d?.currencies) currencies = d.currencies; }
export const settings = () => st;
export const cur = (code) => currencies.find((c) => c.code === code) || { code, name: F.CURRENCY_LABEL[code] || code, symbol: code, decimals: st.decimals_money };
export const activeCurrencies = () => currencies.filter((c) => c.active !== 0);

export const money = (v, code = null, opts = {}) =>
  F.fmtMoney(M.fromDb(typeof v === 'bigint' ? v : String(v ?? '0')), code || st.currency_default || 'AFN',
    { ...st, currencies }, { ...opts });

/** مبلغ + نام ارز، برای جاهایی که وضوح مهم است */
export const moneyCur = (v, code = null, opts = {}) =>
  F.fmtMoneyCur(M.fromDb(typeof v === 'bigint' ? v : String(v ?? '0')), code || st.currency_default || 'AFN',
    { ...st, currencies }, opts);

/** «۱٬۲۰۰ افغانی ≈ ۱۷ دالر» یا برعکس؛ فقط وقتی ارز سند با ارز پیش‌فرض فرق دارد */
export function withBase(v, code, baseMicro, opts = {}) {
  const main = money(v, code, opts);
  if (!code || code === base() ) return main;
  return `${main} <span class="muted small">≈ ${money(baseMicro, base(), opts)}</span>`;
}
export const base = () => st.currency_base || 'AFN';

export const qty = (v, opts = {}) => F.fmtQty(M.fromDb(typeof v === 'bigint' ? v : String(v ?? '0')), st, opts.unit || '');
export const date = (iso) => F.fmtDate(iso, st);
export const dateLong = (iso) => `${F.fmtDate(iso, st)} — ${J.WEEKDAYS[J.weekdayIndex(iso)]}`;
export const rel = (iso) => F.relTime(iso, st);
export const monthLabel = (key) => F.monthLabel(key, st);
export const bignum = (v) => M.fromDb(typeof v === 'bigint' ? v : String(v ?? '0'));
/** شمارشگر/عدد ساده (تعداد، نه مبلغ) */
export const plain = (v) => {
  const n = Math.trunc(Number(typeof v === 'number' ? v : String(v ?? '0')));
  if (!isFinite(n)) return st.digits === 'fa' ? '۰' : '0';
  const s = n.toLocaleString('en-US');
  return st.digits === 'fa' ? M.toFaDigits(s) : s;
};
export const num = (v, dec = 0) => M.fmt(M.fromDb(String(v ?? '0')), { decimals: dec, group: st.group, digits: st.digits });
export const rateStr = (v) => M.fmt(M.fromDb(String(v ?? '0')), { decimals: 4, group: false, digits: st.digits });
export const micro = (v) => M.parse(v);
/** ورودی متن عددی از کاربر → میکرو (و تشخیص نامعتبر) */
export function needMoney(v, label = 'مبلغ') {
  const m = M.parse(v);
  if (m === null) throw new Error(`«${label}» را درست وارد کنید. فقط رقم بنویسید؛ مثلاً ۱۲۵۰۰`);
  return m;
}
export function needPositive(v, label = 'مبلغ') {
  const m = needMoney(v, label);
  if (m <= 0n) throw new Error(`«${label}» باید بزرگ‌تر از صفر باشد.`);
  return m;
}
/** مقدار میکرو را برای input آماده می‌کند (بدون جداکننده) */
export const inputValue = (v, dec = null) =>
  M.str(M.fromDb(typeof v === 'bigint' ? v : String(v ?? '0')), dec ?? st.decimals_money).replace(/\.0+$/, '');

export const today = () => J.todayIso();
export const fmtJalali = (iso) => J.jalaliStr(iso, '/', st.digits);
export const statusLabel = (s) => ({ unpaid: 'پرداخت‌نشده', partial: 'پرداخت جزئی', paid: 'پرداخت‌شده', cancelled: 'لغوشده' }[s] || s);
export const txLabel = (t) => ({
  receipt: 'دریافت', payment: 'پرداخت', expense: 'هزینه', other_income: 'درآمد دیگر',
  drawing: 'برداشت صاحب سرمایه', contribution: 'آورده صاحب سرمایه', transfer: 'انتقال وجه', refund: 'بازگشت وجه',
}[t] || t);
export const txIcon = (t) => ({ receipt: 'i-arrow-down', payment: 'i-arrow-up', expense: 'i-expense', other_income: 'i-wallet', drawing: 'i-arrow-up', contribution: 'i-arrow-down', transfer: 'i-swap', refund: 'i-arrow-up' }[t] || 'i-wallet');
export const kindLabel = (k) => ({ goods: 'کالا', material: 'ماده خام', service: 'خدمت' }[k] || k);
export const moveLabel = (k) => ({ in: 'ورود', out: 'خروج', return: 'برگشت از مشتری', waste: 'ضایعات', adjust: 'اصلاح', cancel_in: 'لغو ورود', cancel_out: 'لغو خروج' }[k] || k);
