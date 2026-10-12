/**
 * jalali.js — تبدیل تاریخ جلالی (هجری شمسی) و میلادی.
 * الگوریتم، پیاده‌سازی استاندارد jalaali-js است و با آزمون‌های واحد بررسی شده.
 * ماه‌های ۱ تا ۶ سی‌ویک‌روزه و ۷ تا ۱۲ سی‌روزه‌اند؛ سال کبیسه، ماه دوازدهم را ۳۰ روزه می‌کند.
 */

const divn = (a, b) => ~~(a / b);
const modn = (a, b) => a - ~~(a / b) * b;

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + divn(jump, 33) * 8 + divn(modn(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + divn(n, 33) * 8 + divn(modn(n, 33) + 3, 4);
  if (modn(jump, 33) === 4 && jump - n === 6) leapJ += 1;
  const leapG = divn(gy, 4) - divn((divn(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + divn(jump + 4, 33) * 33;
  let leap = modn(modn(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = divn((gy + divn(gm - 8, 6) + 100100) * 1461, 4) + divn(153 * modn(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - divn(divn(gy + 100100 + divn(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + divn(divn(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = divn(modn(j, 1461), 4) * 5 + 308;
  const gd = divn(modn(i, 153), 5) + 1;
  const gm = modn(divn(i, 153), 12) + 1;
  const gy = divn(j, 1461) - 100100 + divn(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - divn(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jm, jd;
  let k = jdn - jdn1f; // روزهایی که از اول حمل گذشته است
  if (k >= 0) {
    if (k <= 185) {
      // شش ماه نخست، سی‌ویک‌روزه
      return { jy, jm: 1 + divn(k, 31), jd: modn(k, 31) + 1 };
    }
    k -= 186;
  } else {
    // سال جلالیِ پیشین
    jy -= 1;
    k += jalCal(jy).leap === 0 ? 180 : 179;
  }
  jm = 7 + divn(k, 30);
  jd = modn(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalaali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}
export function toGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}
export function isLeapJalaaliYear(jy) {
  return jalCal(jy).leap === 0;
}
export function jalaaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

/** نام ماه‌ها — سبک افغانی و ایرانی */
export const MONTHS_AFGHAN = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
export const MONTHS_IRAN = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export const pad2 = (n) => String(n).padStart(2, '0');
export const pad4 = (n) => String(n).padStart(4, '0');

/** رشته YYYY-MM-DD میلادی → {jy,jm,jd} */
export function jalaliFromIso(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return toJalaali(y, m, d);
}
export function isoFromJalali(jy, jm, jd) {
  const g = toGregorian(jy, jm, jd);
  return `${pad4(g.gy)}-${pad2(g.gm)}-${pad2(g.gd)}`;
}
export function todayIso(d = new Date()) {
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function addDaysIso(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
/** شمارهٔ روز هفته: ۰=شنبه … ۶=جمعه */
export function weekdayIndex(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (jsDay + 1) % 7;
}
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
/** کلید ماه جلالیِ یک تاریخ: "1405-07" */
export function jalaliMonthKey(iso) {
  const j = jalaliFromIso(iso);
  if (!j) return String(iso).slice(0, 7);
  return `${j.jy}-${pad2(j.jm)}`;
}
export function jalaliMonthRange(jy, jm) {
  return { from: isoFromJalali(jy, jm, 1), to: isoFromJalali(jy, jm, jalaaliMonthLength(jy, jm)) };
}
export function jalaliMonthStart(iso) {
  const j = jalaliFromIso(iso);
  return isoFromJalali(j.jy, j.jm, 1);
}
export function shiftJalaliMonth(iso, delta) {
  const j = jalaliFromIso(iso);
  let jm = j.jm + delta;
  let jy = j.jy;
  while (jm < 1) { jm += 12; jy -= 1; }
  while (jm > 12) { jm -= 12; jy += 1; }
  return isoFromJalali(jy, jm, Math.min(j.jm === jm ? j.jd : 1, 28));
}
export function monthName(jm, style = 'afghan') {
  return (style === 'iran' ? MONTHS_IRAN : MONTHS_AFGHAN)[Math.max(1, Math.min(12, jm)) - 1];
}
/** رشتهٔ شمسی کامل: 1405/07/19 */
export function jalaliStr(iso, sep = '/', digits = 'en') {
  const j = jalaliFromIso(iso);
  if (!j) return String(iso ?? '');
  const s = `${j.jy}${sep}${pad2(j.jm)}${sep}${pad2(j.jd)}`;
  return digits === 'fa' ? s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]) : s;
}
