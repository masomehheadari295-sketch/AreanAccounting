/**
 * money.js — حساب دقیق پول و کمیت با اعداد صحیح (fixed-point) و BigInt.
 *
 * همه مبالغ و کمیت‌ها در سراسر برنامه به‌صورت «میکرو» ذخیره می‌شوند:
 *   ۱ واحد اصلی = ۱٬۰۰۰٬۰۰۰ میکرو (۶ رقم اعشار)
 * این کار خطای ممیز شناور را از بین می‌برد و جمع، تفریق و تبدیل ارز را دقیق می‌کند.
 * در پایگاه داده، مقدارها به‌شکل رشته متنی ذخیره می‌شوند.
 *
 * قانون مهم: جمع مبالغ با ارزهای متفاوت مجاز نیست. در گزارش‌های چندارزی،
 * هر ارز جدا جمع می‌شود و «معادل افغانی» بر پایهٔ نرخِ ثبت‌شده در خود سند حساب می‌شود.
 */

export const SCALE = 1000000n;
export const ZERO = 0n;
const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** تقسیم صحیح با گردکردن «نیم به بالا» (half away from zero) */
function bdiv(n, d) {
  if (d === 0n) return 0n;
  const neg = (n < 0n) !== (d < 0n);
  let a = n < 0n ? -n : n;
  let b = d < 0n ? -d : d;
  const q = a / b;
  const r = a % b;
  const out = r * 2n >= b ? q + 1n : q;
  return neg ? -out : out;
}

/**
 * نرمال‌سازی رشته ورودی کاربر: ارقام فارسی/عربی، جداکنندهٔ هزارگان، نام ارز و…
 * قاعدهٔ ممیز: اگر هم «.» و هم «,» بیاید، آخرین آن‌ها ممیز اعشار است و بقیه جداکنندهٔ هزارگان.
 */
export function normalize(input) {
  let s = String(input ?? '').trim();
  s = s
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[\s_٬'’]/g, '')
    .replace(/(افغانی|افغانۍ|؋|AFN|USD|US\$|دالر|دلار|EUR|یورو|€|£|GBP|INR|روپیه|Toman|تومان|AFN\.)|؉/gi, '');
  // پرانتز به سبک حسابداری یعنی منفی: (۵۰۰) = −۵۰۰
  const paren = /^\s*\(.*-?\d.*\)\s*$/.test(s);
  const neg = paren || /(^|[^\d])-$/.test(s) || /^-/.test(s);
  s = s.replace(/[()]/g, '').replace(/^[+-]/, '').replace(/-$/, '').replace(/-$/, '');
  // تعیین جداکنندهٔ اعشار
  const hasDot = s.includes('.'), hasComma = s.includes(','), hasArDot = s.includes('٫'), hasFaComma = s.includes('،');
  const marks = [];
  for (let i = 0; i < s.length; i += 1) if ('.,٫،'.includes(s[i])) marks.push([i, s[i]]);
  if (marks.length) {
    let decIndex = -1;
    const last = marks[marks.length - 1][0];
    const tailLen = s.length - last - 1;
    const onlyOneMark = marks.length === 1;
    const looksDecimal = onlyOneMark || tailLen > 0 && tailLen < 3 || (hasArDot || hasFaComma) && marks[marks.length - 1][1] !== '.' && marks[marks.length - 1][1] !== ',';
    if (looksDecimal) decIndex = last;
    s = s.split('').map((ch, i) => {
      if ('.,٫،'.includes(ch)) return i === decIndex ? '.' : '';
      return ch;
    }).join('');
  }
  if (!hasDot && !hasComma && !hasArDot && !hasFaComma) s = s;
  return { s, neg };
}

/** ورودی کاربر (رشته/عدد/bigint) → میکرو. اگر قابل خواندن نبود: null */
export function parse(input) {
  if (input === null || input === undefined) return 0n;
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number') return isFinite(input) ? BigInt(Math.round(input * 1e6)) : null;
  const { s: raw, neg } = normalize(input);
  const s = raw === '' ? '0' : raw;
  if (!/^\d*\.?\d*$/.test(s) || s === '') return null;
  const [ip = '0', fpRaw = ''] = s.split('.');
  const frac = fpRaw.slice(0, 6);
  let micro = BigInt(ip || '0') * SCALE + BigInt((frac + '000000').slice(0, 6));
  if (fpRaw.length > 6 && BigInt(fpRaw[6]) >= 5n) micro += 1n;
  return neg ? -micro : micro;
}

/** میکرو → عدد JS (فقط برای نمودار و کارهای غیرمالی) */
export function toNum(m) {
  return Number(typeof m === 'bigint' ? m : fromDb(m)) / 1e6;
}

/** گردکردن به dec رقم اعشار (هنوز در مقیاس میکرو) */
export function round(m, dec = 2) {
  if (dec >= 6) return m;
  const step = 10n ** BigInt(6 - dec);
  return bdiv(m, step) * step;
}

/** رشته ساده بدون جداکننده هزارگان، مثلاً "1234.50" */
export function str(m, dec = 2) {
  const v = typeof m === 'bigint' ? m : fromDb(m);
  const sign = v < 0n ? '-' : '';
  const a = v < 0n ? -v : v;
  const rounded = round(a, dec);
  const whole = rounded / SCALE;
  if (dec <= 0) return sign + whole.toString();
  const fracDigits = ((rounded % SCALE) * 10n ** BigInt(dec)) / SCALE;
  return `${sign}${whole.toString()}.${fracDigits.toString().padStart(dec, '0')}`;
}

export function toFaDigits(s) {
  return String(s).replace(/\d/g, (d) => FA[+d]);
}

/**
 * قالب نمایش نهایی.
 * opts: {decimals=2, group=true, digits='en'|'fa', sign='auto'|'always'|'none', currency=''}
 */
export function fmt(m, opts = {}) {
  const { decimals = 2, group = true, digits = 'en', sign = 'auto', currency = '' } = opts;
  if (m === null || m === undefined || m === '') return '—';
  const v = round(typeof m === 'bigint' ? m : fromDb(m), decimals);
  const neg = v < 0n;
  let s = str(neg ? -v : v, decimals);
  if (group) {
    const [ip, fp] = s.split('.');
    s = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '٬') + (fp ? '.' + fp : '');
  }
  if (digits === 'fa') s = toFaDigits(s);
  let out = s;
  if (neg && sign !== 'none') out = `−${out}`;
  else if (!neg && sign === 'always') out = `+${out}`;
  return currency ? `${out} ${currency}` : out;
}

export const add = (a, b) => a + b;
export const sub = (a, b) => a - b;
export const neg_ = (a) => -a;
export const abs = (a) => (a < 0n ? -a : a);
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const isZero = (m) => m === 0n || m === undefined || m === null || m === '';
export const sum = (list) => list.reduce((t, x) => (typeof x === 'bigint' ? t + x : t), 0n);
/** a × b → میکرو */
export const mul = (a, b) => bdiv(a * b, SCALE);
/** a ÷ b → میکرو */
export const div = (a, b) => (b === 0n ? 0n : bdiv(a * SCALE, b));
/** درصد: چند درصد a، برابر b است؟ → میکرو */
export const pctOf = (b, a) => (a === 0n ? 0n : bdiv(b * 100n * SCALE, a));
/** اعمال درصد (pct میکرو) روی مبلغ */
export const applyPct = (amount, pctMicro) => bdiv(amount * pctMicro, SCALE * 100n);

/** میکرو → رشته برای ذخیره */
export const toDb = (m) => String(typeof m === 'bigint' ? m : m ?? '0');
/** رشته ذخیره‌شده → میکرو */
export const fromDb = (s) => {
  if (typeof s === 'bigint') return s;
  const t = String(s ?? '0').trim();
  return /^-?\d+$/.test(t) ? BigInt(t) : (parse(t) ?? 0n);
};

/** تبدیل مبلغ به ارز پایه با نرخ ثبت‌شده در سند (نرخ ۷۱٫۲۵ → 71250000n) */
export const toBase = (amountMicro, rateMicro) => mul(amountMicro, rateMicro === undefined ? SCALE : rateMicro);

export default {
  SCALE, ZERO, parse, normalize, fmt, str, toNum, round, add, sub, mul, div, sum, cmp, abs, neg: neg_,
  isZero, toDb, fromDb, toBase, applyPct, pctOf, toFaDigits,
};
