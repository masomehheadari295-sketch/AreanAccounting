/**
 * unit.test.js — آزمون‌های واحدِ حساب پول، تقویم و منطق سند.
 * اجرا: node --test test/unit.test.js   (یا npm test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import M from '../public/js/lib/money.js';
import * as J from '../public/js/lib/jalali.js';

test('parse: ارقام فارسی، جداکننده و ارز', () => {
  assert.equal(M.parse('۱٬۲۳۴٫۵۰'), 1234500000n);
  assert.equal(M.parse('1,234.50 AFN'), 1234500000n);
  assert.equal(M.parse('1٫234٫50'), 1234500000n); // نقطهٔ عربی به‌جای ممیز
  assert.equal(M.parse('1.234.567'), 1234567000000n); // نقطه‌ها جداکنندهٔ هزارگان‌اند
  assert.equal(M.parse('(۵۰۰)'), -500000000n); // پرانتز = منفی
  assert.equal(M.parse('-71.25'), -71250000n);
  assert.equal(M.parse(''), 0n);
  assert.equal(M.parse('abc'), null); // ورودی بی‌معنا → null تا فرم پیام خطا بدهد
  assert.equal(M.parse(12.34), 12340000n);
});

test('parse: گردکردن رقم هفتم', () => {
  assert.equal(M.parse('0.0000005'), 1n);
  assert.equal(M.parse('0.0000004'), 0n);
});

test('mul/div: تبدیل ارز دقیق است', () => {
  const amount = M.parse('1250.25');
  const rate = M.parse('71.25');
  const base = M.mul(amount, rate);
  assert.equal(M.str(M.mul(M.parse('1250.25'), M.parse('71.25')), 4), '89080.3125'); // ۱۲۵۰٫۲۵ × ۷۱٫۲۵
  assert.equal(M.str(base, 2), '89080.31'); // گرد به دو رقم اعشار
  assert.equal(M.str(M.div(base, rate), 2), '1250.25');
});

test('add/sub: خطای ممیز شناور تکرار نمی‌شود', () => {
  // در JS معمولی: 0.1+0.2 = 0.30000000000000004
  const t = [M.parse('0.1'), M.parse('0.2')].reduce((a, b) => M.add(a, b), 0n);
  assert.equal(M.str(t, 1), '0.3');
  assert.equal(M.str(M.sub(t, M.parse('0.3')), 2), '0.00');
});

test('fmt: جداکنندهٔ هزارگان، رقم فارسی و علامت منفی', () => {
  const v = M.parse('-1234567.891');
  assert.equal(M.fmt(v, { decimals: 2, group: true, digits: 'en' }), '−1٬234٬567.89');
  assert.equal(M.fmt(v, { decimals: 0, group: true, digits: 'fa' }), '−۱٬۲۳۴٬۵۶۸');
  assert.equal(M.fmt(0n, { decimals: 2, currency: '؋' }), '0.00 ؋');
});

test('round: نیم به بالا (half away from zero)', () => {
  assert.equal(M.str(M.round(M.parse('2.345'), 2), 2), '2.35');
  assert.equal(M.str(M.round(M.parse('-2.345'), 2), 2), '-2.35');
  assert.equal(M.str(M.round(M.parse('2.3449'), 2), 2), '2.34');
});

test('applyPct: درصد روی مبلغ', () => {
  assert.equal(M.str(M.applyPct(M.parse('1850'), M.parse('2')), 2), '37.00');
  assert.equal(M.str(M.applyPct(M.parse('1000'), M.parse('12.5')), 2), '125.00');
});

test('sum: جمع فهرست میکرو', () => {
  const rows = ['10.05', '9.95', '-0.10'].map(M.parse);
  assert.equal(M.str(M.sum(rows), 2), '19.90');
});

test('jalali: تبدیل‌های شناخته‌شده', () => {
  assert.equal(J.jalaliStr('2011-03-21'), '1390/01/01');
  assert.equal(J.jalaliStr('2026-10-11'), '1405/07/19');
  assert.equal(J.jalaliStr('2000-01-01'), '1378/10/11');
  assert.equal(J.isoFromJalali(1405, 7, 19), '2026-10-11');
});

test('jalali: رفت‌وبرگشت برای ۱۵۰ سال بی‌خطا است', () => {
  for (let jy = 1250; jy <= 1400; jy += 1) {
    for (const jm of [1, 6, 7, 12]) {
      for (const jd of [1, 15, J.jalaaliMonthLength(jy, jm)]) {
        const iso = J.isoFromJalali(jy, jm, jd);
        const back = J.jalaliFromIso(iso);
        assert.deepEqual([back.jy, back.jm, back.jd], [jy, jm, jd], `${jy}/${jm}/${jd} → ${iso}`);
      }
    }
  }
});

test('jalali: با تقویم نجومیِ ICU هم‌خوان است (۲۰۱۸ تا ۲۰۴۵)', () => {
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  let d = new Date(Date.UTC(2018, 0, 1));
  let n = 0;
  while (d.getTime() < Date.UTC(2045, 0, 1)) {
    const iso = d.toISOString().slice(0, 10);
    const p = fmt.formatToParts(d);
    const g = (x) => Number(p.find((y) => y.type === x).value);
    const j = J.jalaliFromIso(iso);
    assert.equal(j.jy * 10000 + j.jm * 100 + j.jd, g('year') * 10000 + g('month') * 100 + g('day'), 'تفاوت در ' + iso);
    n += 1;
    d = new Date(d.getTime() + 86400000);
  }
  assert.ok(n > 9000, `تعداد روزهای بررسی‌شده: ${n}`);
});

test('jalali: طول ماه‌ها و کبیسه', () => {
  assert.equal(J.jalaaliMonthLength(1405, 1), 31);
  assert.equal(J.jalaaliMonthLength(1405, 7), 30);
  assert.equal(J.jalaaliMonthLength(1403, 12), 30, 'اسفند سال کبیسه ۳۰ روزه است');
  assert.equal(J.jalaaliMonthLength(1405, 12), 29);
  assert.equal(J.jalaliMonthRange(1405, 7).from, '2026-09-23');
  assert.equal(J.jalaliMonthRange(1405, 7).to, '2026-10-22');
});

test('addDays / weekday', () => {
  assert.equal(J.addDaysIso('2026-10-11', 3), '2026-10-14');
  assert.equal(J.addDaysIso('2026-01-01', -1), '2025-12-31');
  assert.equal(J.WEEKDAYS[J.weekdayIndex('2026-10-11')], 'یکشنبه');
});
