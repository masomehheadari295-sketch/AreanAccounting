/**
 * seed.js — دادهٔ نمونه، فقط با درخواست کاربر از «تنظیمات → داده‌ها».
 * برنامه با داده خالی شروع می‌شود؛ هیچ عدد نمایشی در رابط کاربری hardcode نشده است.
 */
import M from '../public/js/lib/money.js';
import * as J from '../public/js/lib/jalali.js';
import { db, run, get, all, audit, setMeta, getMeta, getSettings, ensureDefaults } from './db.js';
import { createDoc, createTx, stockMove, resolveRate } from './finance.js';

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export function seed() {
  const today = J.todayIso();
  const day = (back) => J.addDaysIso(today, -back);
  const base = getSettings().currency_base || 'AFN';

  // نرخ‌ها
  const rate = (code, v) => {
    run(`INSERT INTO rates (code, date, rate) VALUES (?,?,?) ON CONFLICT(code, date) DO UPDATE SET rate=excluded.rate`, [code, day(1), M.toDb(M.parse(v))]);
    run(`UPDATE currencies SET rate=? WHERE code=?`, [M.toDb(M.parse(v)), code]);
  };
  rate('USD', 71.2);
  rate('EUR', 77.4);

  // حساب‌ها
  let cash = get(`SELECT id FROM accounts WHERE name='صندوق دکان'`);
  if (!cash) cash = { id: db.prepare(`INSERT INTO accounts (kind,name,currency,opening,sort) VALUES ('cash','صندوق دکان','AFN',?,0)`).run(M.toDb(M.parse('45000'))).lastInsertRowid };
  let bank = get(`SELECT id FROM accounts WHERE name='بانک کابل — حساب دالر'`);
  if (!bank) bank = { id: db.prepare(`INSERT INTO accounts (kind,name,currency,opening,sort,bank_name,account_no) VALUES ('bank','بانک کابل — حساب دالر','USD',?,1,'بانک ملی','1024-3388')`).run(M.toDb(M.parse('1200'))).lastInsertRowid };

  // دسته‌ها
  const cats = {};
  for (const n of ['مواد خوراکی', 'نوشیدنی', 'لوازم خانه', 'خدمات']) {
    const ex = get(`SELECT id FROM categories WHERE kind='item' AND name=?`, [n]);
    cats[n] = ex ? ex.id : db.prepare(`INSERT INTO categories (kind,name,sort) VALUES ('item',?,0)`).run(n).lastInsertRowid;
  }

  // کالاها
  const items = [];
  const itemDefs = [
    ['برنج سیله ۲۴ کیلو', 'RICE-24', cats['مواد خوراکی'], 'بوری', 2400, 2750, 6],
    ['روغن حبیب ۵ لیتر', 'OIL-05', cats['مواد خوراکی'], 'قطوه', 780, 900, 8],
    ['بوره سیاه ۱ کیلو', 'SUGAR-1', cats['مواد خوراکی'], 'کیلو', 55, 68, 20],
    ['چای سبز ۴۰۰ گرم', 'TEA-400', cats['نوشیدنی'], 'بسته', 120, 160, 12],
    ['آب معدنی ۱٫۵ لیتر', 'WTR-15', cats['نوشیدنی'], 'بوتل', 18, 25, 48],
    ['گازپخت کوچک', 'STV-01', cats['لوازم خانه'], 'عدد', 3200, 3900, 2],
    ['خدمات حمل و نقل', 'SVC-TRN', cats['خدمات'], 'تریپ', 0, 1500, 0],
  ];
  for (const [name, code, cat, unit, buy, sell, min] of itemDefs) {
    const ex = get(`SELECT id FROM items WHERE code=?`, [code]);
    if (ex) { items.push(ex.id); continue; }
    const id = db.prepare(`INSERT INTO items (name,code,category_id,unit,kind,buy_price,sell_price,track_stock,min_qty)
        VALUES (?,?,?,?,'goods',?,?,1,?)`)
      .run(name, code, cat, unit, M.toDb(M.parse(buy)), M.toDb(M.parse(sell)), M.toDb(M.parse(min))).lastInsertRowid;
    items.push(id);
  }

  // اشخاص
  const per = (name, kind, phone, contact) => {
    const ex = get(`SELECT id FROM parties WHERE name=? AND kind=?`, [name, kind]);
    return ex ? ex.id : db.prepare(`INSERT INTO parties (name,kind,phone,contact,address) VALUES (?,?,?,?,?)`)
      .run(name, kind, phone, contact, 'کابل، سرک دوم').lastInsertRowid;
  };
  const custA = per('خوروردگاه آریانا', 'customer', '0700112233', 'حاجی نصیر');
  const custB = per('دکانهٔ نور', 'customer', '0777889900', 'احمد ولی');
  const custC = per('محمد یوسف', 'customer', '0799123456', '');
  const supA = per('شرکت توزیع برکت', 'supplier', '0744556677', 'انجنیر فرید');
  const supB = per('واردات نور محمد و شرکا', 'supplier', '0700998877', 'نور محمد');

  // ورود اولیهٔ موجودی از طریق سند خرید
  const purchases = [
    { d: day(96), party: supA, items: [[items[0], 40, 2350], [items[1], 30, 760], [items[2], 60, 52]] },
    { d: day(64), party: supA, items: [[items[3], 40, 115], [items[4], 120, 17], [items[2], 40, 54]] },
    { d: day(38), party: supB, items: [[items[5], 6, 3100], [items[0], 20, 2420]] },
    { d: day(12), party: supA, items: [[items[1], 24, 780], [items[4], 96, 18]] },
  ];
  for (const p of purchases) {
    createDoc('purchase', {
      date: p.d, party_id: p.party, currency: base, paid: M.toDb(M.parse(String(rand(40, 80) * 1000))),
      account_id: cash.id, method_id: get(`SELECT id FROM methods WHERE name='نقدی'`)?.id,
      items: p.items.map(([item_id, qty, price]) => ({ item_id, qty: String(qty), unit_price: String(price), update_stock: true })),
      note: 'خرید دوره‌ای از تأمین‌کننده',
    });
  }

  // فروش‌ها (نقدی، نسیه، پرداخت جزئی)
  const methodCash = get(`SELECT id FROM methods WHERE name='نقدی'`)?.id;
  const methodBank = get(`SELECT id FROM methods WHERE name='کارت/بانکی'`)?.id;
  for (let back = 92; back >= 0; back -= 3) {
    const d = day(back);
    const party = [custA, custB, custC][back % 3];
    const lines = [];
    const n = rand(1, 3);
    for (let i = 0; i < n; i += 1) {
      const it = items[rand(0, items.length - 2)];
      const price = Math.max(1, Math.round(M.toNum(M.fromDb(get(`SELECT sell_price FROM items WHERE id=?`, [it]).sell_price))));
      lines.push({ item_id: it, qty: String(rand(1, 8)), price });
    }
    const cashSale = back % 6 === 0;
    const usd = back % 21 === 0;
    createDoc('sale', {
      date: d, party_id: party, currency: usd ? 'USD' : base,
      rate: usd ? '71.2' : undefined,
      pay_full: cashSale, account_id: cashSale ? cash.id : null, method_id: methodCash,
      items: lines.map((l) => ({ ...l, unit_price: String(l.price) })),
      note: back % 9 === 0 ? 'تخفیف ویژهٔ هفته' : '',
      discount: back % 9 === 0 ? String(rand(2, 8) * 100) : undefined,
    });
  }
  // دریافت‌های جزئی برای چند سند نسیه
  for (const doc of all(`SELECT id, no, balance, currency, party_id, date FROM docs WHERE type='sale' AND balance > 0 ORDER BY id LIMIT 6`)) {
    const bal = M.fromDb(doc.balance);
    if (bal <= 0n) continue;
    const part = M.round(bal / 2n, 0);
    createTx({ type: 'receipt', date: doc.date, amount: part, currency: doc.currency, account_id: cash.id, doc_id: doc.id, method_id: methodCash, note: `پرداخت اقساطی روی ${doc.no}` });
  }
  // هزینه‌ها
  for (let back = 90; back >= 0; back -= 7) {
    const kinds = [
      ['کرایهٔ دکان', 6000], ['برق و آب', rand(400, 1200)], ['معاش کارکن', rand(4000, 9000)], ['ترانسپورت', rand(600, 2400)], ['متفرقه', rand(200, 900)],
    ];
    for (const [cat, amount] of kinds.slice(0, back % 3 + 1)) {
      const cid = get(`SELECT id FROM categories WHERE kind='expense' AND name=?`, [cat])?.id;
      createTx({ type: 'expense', date: day(back), amount: String(amount), currency: base, account_id: cash.id, category_id: cid, title: cat });
    }
  }
  // برداشت و آورده
  createTx({ type: 'drawing', date: day(20), amount: '5000', currency: base, account_id: cash.id, title: 'برداشت شخصی' });
  createTx({ type: 'contribution', date: day(70), amount: '80000', currency: base, account_id: cash.id, title: 'آورده اولیهٔ صاحب دکان' });
  createTx({ type: 'contribution', date: day(5), amount: '300', currency: 'USD', account_id: bank.id, title: 'آورده دالر' });
  // اصلاح موجودی (شمارش انبار)
  stockMove({ item_id: items[2], kind: 'adjust', qty: M.parse(-3), date: day(6), reason: 'شمارش انبار — سه بسته آسیب‌دیده', doc_type: 'manual', doc_id: null });

  setMeta('demo_seeded', true);
  audit('data', null, 'بارگذاری دادهٔ نمونه', `${all(`SELECT id FROM docs`).length} سند`);
  return { ok: true, message: 'دادهٔ نمونه بارگذاری شد. می‌توانید برای شروعِ واقعی، از همان بخش تنظیمات همه را پاک کنید.', counts: { docs: all(`SELECT id FROM docs`).length, items: items.length } };
}

export function clearAll() {
  const tables = ['ledger', 'tx', 'doc_items', 'stock_moves', 'stock', 'docs', 'attachments', 'items', 'parties', 'accounts', 'methods', 'categories', 'rates', 'currencies', 'counters', 'audit'];
  return db.transaction(() => {
    for (const t of tables) run(`DELETE FROM ${t}`);
    run(`DELETE FROM meta WHERE key='demo_seeded'`);
    ensureDefaults();
    return { ok: true, message: 'همهٔ داده‌ها پاک شد و ساختار پایه دوباره ساخته شد. برنامه آمادهٔ شروع است.' };
  })();
}

