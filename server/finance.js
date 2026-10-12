/**
 * finance.js — موتور مالی برنامه.
 *
 * اصول:
 *  • همه مبالغ میکرو (BigInt)‌اند؛ هیچ جمع ممیز شناوری انجام نمی‌شود.
 *  • ارز هر سند در خود سند و «معادل افغانی» با نرخ ثبت‌شدهٔ همان سند ذخیره می‌شود؛ نرخ بعدی روی اسناد قبلی اثر ندارد.
 *  • ارزهای متفاوت با هم جمع نمی‌شوند؛ جمع‌ها «به تفکیک ارز» و ستون جداگانهٔ «معادل افغانی» دارد.
 *  • موجودی گدام با روش «میانگین موزون» محاسبه می‌شود و هر تغییر موجودی به یک سند متصل است.
 *  • حساب‌ها (صندوق/بانک) فقط از طریق دفتر روزنامهٔ (ledger) تغییر می‌کنند.
 */
import M from '../public/js/lib/money.js';
import * as J from '../public/js/lib/jalali.js';
import { db, all, get, run, tx as inTx, audit, nextDocNo, getSettings } from './db.js';

const { SCALE } = M;

/* ============================================================
   کمکی‌ها
   ============================================================ */
export const micro = (v) => (v === undefined || v === null || v === '' ? 0n : typeof v === 'bigint' ? v : (M.parse(v) ?? 0n));
export const money = (v) => M.toDb(typeof v === 'bigint' ? v : micro(v));
export const isNeg = (v) => v < 0n;

/** نرخ ارزِ مشخص‌شده؛ اگر داده نشد از آخرین نرخ ثبت‌شده برداشته می‌شود. AFN همیشه ۱ */
export function resolveRate(code, given) {
  if (!code || code === 'AFN') return SCALE;
  if (given !== undefined && given !== null && given !== '') {
    const r = M.parse(given);
    if (r !== null && r > 0n) return r;
  }
  const row = get(`SELECT rate FROM rates WHERE code=? ORDER BY date DESC, id DESC LIMIT 1`, [code]);
  if (row) return M.fromDb(row.rate);
  const cur = get(`SELECT rate FROM currencies WHERE code=?`, [code]);
  return cur ? M.fromDb(cur.rate) : SCALE;
}

export function currencyInfo(code) {
  return get(`SELECT * FROM currencies WHERE code=?`, [code]) || { code, name: code, decimals: 2, symbol: code };
}

/* ============================================================
   محاسبهٔ سرجمع سند (فروش/خرید)
   ============================================================ */
export function computeDoc(input, type) {
  const st = getSettings();
  const currency = input.currency || st.currency_default || 'AFN';
  const rate = currency === 'AFN' ? SCALE : resolveRate(currency, input.rate);
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw err('no_items', 'دست‌کم یک کالا یا خدمت اضافه کنید.');

  const lines = items.map((it, i) => {
    const qty = M.parse(it.qty ?? 0) ?? 0n;
    if (qty === 0n) throw err('bad_qty', `تعداد سطر ${i + 1} را وارد کنید (عدد بزرگ‌تر از صفر).`, `row_${i + 1}`);
    const price = M.parse(it.unit_price ?? 0) ?? 0n;
    if (price < 0n) throw err('bad_price', `بهای سطر ${i + 1} درست نیست.`, `row_${i + 1}`);
    const gross = M.mul(qty, price);
    let disc = M.parse(it.discount ?? 0) ?? 0n;
    if (it.discount_percent) disc = M.applyPct(gross, M.parse(it.discount_percent) ?? 0n);
    if (disc < 0n) disc = 0n;
    if (disc > gross) disc = gross;
    const line_total = gross - disc;
    return {
      row_no: i + 1,
      item_id: it.item_id ?? null,
      name: String(it.name || 'کالا/خدمت').slice(0, 200),
      unit: String(it.unit || 'عدد').slice(0, 20),
      qty, price, disc, gross, line_total,
      cost: M.parse(it.cost ?? 0) ?? 0n,
      update_stock: !!it.update_stock && type === 'purchase' ? 1 : it.update_stock ? 1 : 0,
      note: String(it.note || '').slice(0, 500),
    };
  });

  const subtotal = M.sum(lines.map((l) => l.gross));
  const lineDisc = M.sum(lines.map((l) => l.disc));
  let discount = lineDisc;
  if (input.discount_percent) {
    const p = M.parse(input.discount_percent) ?? 0n;
    discount = M.applyPct(subtotal, p);
  } else if (input.discount !== undefined && input.discount !== null && input.discount !== '') {
    discount = (M.parse(input.discount) ?? 0n) + lineDisc;
  }
  if (discount < 0n) discount = 0n;
  if (discount > subtotal) discount = subtotal;

  const net = subtotal - discount;
  let taxPercent = 0n;
  if (input.tax_enabled ?? st.tax_enabled) {
    taxPercent = M.parse(input.tax_percent ?? st.tax_percent) ?? 0n;
  }
  const tax = taxPercent > 0n ? M.applyPct(net, taxPercent) : 0n;
  const fee = M.parse(input.fee ?? 0) ?? 0n;
  const feeAbs = fee > 0n ? fee : 0n;
  const total = net + tax + feeAbs;
  const base_total = M.mul(total, rate);
  const cost = type === 'sale' ? M.sum(lines.map((l) => M.mul(l.qty, l.cost))) : 0n;
  return {
    currency, rate, lines, subtotal, discount, tax, tax_percent: taxPercent, fee: feeAbs,
    total, base_total, cost,
  };
}

/** وضعیت پرداخت سند از روی دریافت‌های ثبت‌شده (یا پرداخت اولیه) */
export function statusFromPaid(total, paid) {
  if (total <= 0n) return paid > 0n ? 'paid' : 'unpaid';
  if (paid >= total) return 'paid';
  if (paid > 0n) return 'partial';
  return 'unpaid';
}

export function recomputeDoc(docId) {
  const doc = get(`SELECT * FROM docs WHERE id=?`, [docId]);
  if (!doc) return null;
  const total = M.fromDb(doc.total);
  const paid = M.sum(all(`SELECT amount, currency, rate FROM tx WHERE doc_id=? AND void=0 AND ((type='receipt' AND ?='sale') OR (type='payment' AND ?='purchase'))`,
    [docId, doc.type, doc.type]).map((r) => signedPayAmount(doc, r)));
  const status = doc.status === 'cancelled' ? 'cancelled' : statusFromPaid(total, paid);
  const balance = total - paid > 0n ? total - paid : 0n;
  run(`UPDATE docs SET paid=?, balance=?, status=? WHERE id=?`, [money(paid), money(balance > 0n ? balance : 0n), status, docId]);
  return { paid, balance, status };
}

/** مبلغ یک دریافت/پرداخت به ارز سند (اگر به ارز دیگری ثبت شده، با نرخ ثبت‌شده تبدیل می‌شود) */
function signedPayAmount(doc, t) {
  const amount = M.fromDb(t.amount);
  if (t.currency === doc.currency) return amount;
  const docRate = M.fromDb(doc.rate);
  const tRate = M.fromDb(t.rate);
  return M.div(M.mul(amount, tRate), docRate || SCALE);
}

function err(code, message, field) {
  const e = new Error(message);
  e.code = code;
  e.field = field;
  e.status = 400;
  e.userMessage = message;
  return e;
}

/* ============================================================
   موجودی گدام — میانگین موزون
   ============================================================ */
export function getStock(itemId) {
  const s = get(`SELECT * FROM stock WHERE item_id=?`, [itemId]);
  return { qty: s ? M.fromDb(s.qty) : 0n, avg: s ? M.fromDb(s.avg_cost) : 0n, value: s ? M.fromDb(s.value) : 0n };
}

/**
 * ثبت یک حرکت موجودی و به‌روزرسانی میانگین موزون.
 * kind: in | out | return | waste | adjust | cancel_in | cancel_out
 * جهت: in/return → افزایش؛ out/waste → کاهش؛ adjust → علامتِ دلخواه (signed)
 */
export function stockMove({ item_id, kind, qty, cost = 0n, doc_type = 'manual', doc_id = null, date, reason = '', note = '' }) {
  const q = typeof qty === 'bigint' ? qty : M.parse(qty) ?? 0n;
  if (q === 0n) throw err('bad_qty', 'مقدار تغییر موجودی صفر است. مقدار را وارد کنید.');
  const item = get(`SELECT * FROM items WHERE id=?`, [item_id]);
  if (!item) throw err('no_item', 'کالا پیدا نشد. لطفاً کالا را انتخاب کنید.');
  const signed = kind === 'in' || kind === 'return' || kind === 'cancel_out' ? M.abs(q)
    : kind === 'out' || kind === 'waste' || kind === 'cancel_in' ? -M.abs(q)
      : q; // adjust: علامت از کاربر
  const unitCost = typeof cost === 'bigint' ? cost : M.parse(cost) ?? 0n;
  const s = getStock(item_id);
  let qty2 = s.qty + signed;
  let avg = s.avg;
  if (signed > 0n) {
    const incCost = unitCost > 0n ? unitCost : avg;
    const newValue = M.mul(s.qty, avg) + M.mul(signed, incCost);
    qty2 = s.qty + signed;
    avg = qty2 > 0n ? M.div(newValue, qty2) : incCost;
  } else if (signed < 0n) {
    qty2 = s.qty + signed;
    if (qty2 <= 0n) avg = unitCost > 0n ? unitCost : avg;
  }
  const value = M.mul(qty2, avg);
  run(
    `INSERT INTO stock (item_id, qty, avg_cost, value, updated_at) VALUES (?,?,?,?,datetime('now'))
     ON CONFLICT(item_id) DO UPDATE SET qty=excluded.qty, avg_cost=excluded.avg_cost, value=excluded.value, updated_at=excluded.updated_at`,
    [item_id, money(qty2), money(avg), money(value)],
  );
  run(
    `INSERT INTO stock_moves (item_id, kind, qty, cost, doc_type, doc_id, date, reason, note) VALUES (?,?,?,?,?,?,?,?,?)`,
    [item_id, kind, money(M.abs(q)), money(unitCost), doc_type, doc_id, date, reason.slice(0, 300), note.slice(0, 500)],
  );
  return { qty: qty2, avg, value };
}

export function deleteDocMoves(docId, date = null) {
  const moves = all(`SELECT * FROM stock_moves WHERE doc_id=? AND doc_type IN ('sale','purchase')`, [docId]);
  for (const mv of moves) run(`DELETE FROM stock_moves WHERE id=?`, [mv.id]);
  return moves.length;
}

/** بازسازی کامل موجودی از روی گردش (ابزار راستی‌آزمایی) */
export function rebuildStock() {
  const items = all(`SELECT id FROM items`);
  const res = [];
  for (const it of items) {
    const moves = all(`SELECT * FROM stock_moves WHERE item_id=? ORDER BY date, id`, [it.id]);
    let qty = 0n, avg = 0n;
    for (const mv of moves) {
      const q = M.fromDb(mv.qty);
      const signed = mv.kind === 'in' || mv.kind === 'return' || mv.kind === 'cancel_out' ? q
        : mv.kind === 'out' || mv.kind === 'waste' || mv.kind === 'cancel_in' ? -q : q;
      const c = M.fromDb(mv.cost);
      if (signed > 0n) {
        const nv = M.mul(qty, avg) + M.mul(signed, c > 0n ? c : avg);
        qty += signed;
        avg = qty > 0n ? M.div(nv, qty) : (c > 0n ? c : avg);
      } else {
        qty += signed;
        if (qty <= 0n && c > 0n) avg = c;
      }
    }
    const value = M.mul(qty, avg);
    run(
      `INSERT INTO stock (item_id, qty, avg_cost, value, updated_at) VALUES (?,?,?,?,datetime('now'))
       ON CONFLICT(item_id) DO UPDATE SET qty=excluded.qty, avg_cost=excluded.avg_cost, value=excluded.value, updated_at=excluded.updated_at`,
      [it.id, money(qty), money(avg), money(value)],
    );
    res.push({ item_id: it.id, qty, avg, value });
  }
  return res;
}

/* ============================================================
   سند فروش / خرید
   ============================================================ */
export function createDoc(type, input) {
  const st = getSettings();
  return inTx(() => {
    const date = validDate(input.date) || J.todayIso();
    if (!input.party_id && type === 'sale' && !input.party_name) throw err('no_party', 'نام مشتری را وارد کنید تا بعداً بتوانید حساب او را ببینید.', 'party');
    if (!input.party_id && type === 'purchase' && !input.party_name) throw err('no_party', 'نام تأمین‌کننده را وارد کنید.', 'party');
    const c = computeDoc(input, type);
    const party = input.party_id ? get(`SELECT * FROM parties WHERE id=?`, [input.party_id]) : null;
    const no = uniqueNo(type, date);
    let paid0 = input.pay_full ? c.total : (M.parse(input.paid ?? 0) ?? 0n);
    if (paid0 < 0n) paid0 = 0n;
    if (paid0 > c.total) paid0 = c.total;
    const info = {
      type, no, party_id: party?.id ?? null,
      party_name: party?.name || String(input.party_name || '').slice(0, 120),
      party_phone: party?.phone || String(input.party_phone || '').slice(0, 40),
      date, due_date: input.due_date ? validDate(input.due_date) : null,
      currency: c.currency, rate: money(c.rate),
      subtotal: money(c.subtotal), discount: money(c.discount), tax: money(c.tax), fee: money(c.fee),
      total: money(c.total), base_total: money(c.base_total), cost: money(c.cost),
      paid: money(paid0),
      balance: money(c.total - paid0),
      status: statusFromPaid(c.total, paid0),
      account_id: input.account_id ? +input.account_id : null,
      method_id: input.method_id ? +input.method_id : null,
      note: String(input.note || '').slice(0, 1000),
      attachment: String(input.attachment || ''),
    };
    const r = db.prepare(`INSERT INTO docs (type, no, party_id, party_name, party_phone, date, due_date, currency, rate,
        subtotal, discount, tax, fee, total, base_total, cost, paid, balance, status, account_id, method_id, note, attachment, origin)
        VALUES ($type,$no,$party_id,$party_name,$party_phone,$date,$due_date,$currency,$rate,
        $subtotal,$discount,$tax,$fee,$total,$base_total,$cost,$paid,$balance,$status,$account_id,$method_id,$note,$attachment,$origin)`)
      .run({ ...info, origin: input.origin || 'manual' });
    const docId = r.lastInsertRowid;
    const insLine = db.prepare(`INSERT INTO doc_items (doc_id,row_no,item_id,name,unit,qty,unit_price,discount,line_total,cost,note,update_stock)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of c.lines) {
      let costUnit = l.cost;
      if (type === 'sale' && l.item_id) {
        const s = getStock(l.item_id);
        if (s.avg > 0n) costUnit = s.avg;
      }
      if (type === 'purchase' && l.item_id && costUnit <= 0n) costUnit = l.line_total > 0n && l.qty !== 0n ? M.div(l.line_total, l.qty) : 0n;
      insLine.run(docId, l.row_no, l.item_id, l.name, l.unit, money(l.qty), money(l.price), money(l.disc), money(l.line_total), money(costUnit), l.note, l.update_stock ? 1 : 0);
      // حرکت موجودی
      if (l.item_id && l.qty !== 0n) {
        const item = get(`SELECT track_stock, kind FROM items WHERE id=?`, [l.item_id]);
        const track = type === 'purchase' ? (l.update_stock ? 1 : 0) : (item?.track_stock && item.kind !== 'service' ? 1 : 0);
        if (track) {
          stockMove({
            item_id: l.item_id, kind: type === 'purchase' ? 'in' : 'out', qty: l.qty,
            cost: type === 'purchase' ? (l.line_total > 0n && l.qty !== 0n ? M.div(l.line_total, M.abs(l.qty)) : 0n) : costUnit,
            doc_type: type, doc_id: docId, date, reason: type === 'purchase' ? `ورود از خرید ${info.no}` : `خروج از فروش ${info.no}`,
          });
          if (type === 'sale') {
            const s = getStock(l.item_id);
            run(`UPDATE doc_items SET cost=? WHERE doc_id=? AND row_no=?`, [money(s.avg), docId, l.row_no]);
          }
        }
      }
    }
    // بازمحاسبهٔ بهاى تمام‌شدهٔ سند فروش
    if (type === 'sale') {
      const cost = M.sum(all(`SELECT qty, cost FROM doc_items WHERE doc_id=?`, [docId]).map((l) => M.mul(M.fromDb(l.qty), M.fromDb(l.cost))));
      run(`UPDATE docs SET cost=? WHERE id=?`, [money(cost), docId]);
    }
    // دریافت/پرداخت اولیه
    if (paid0 > 0n) {
      createTx({
        type: type === 'sale' ? 'receipt' : 'payment',
        date, amount: paid0, currency: c.currency, rate: c.rate,
        doc_id: docId, party_id: info.party_id, account_id: info.account_id, method_id: info.method_id,
        note: type === 'sale' ? `دریافت هنگام صدور ${info.no}` : `پرداخت هنگام صدور ${info.no}`,
        attachment: String(input.receipt_attachment || input.attachment || ''),
      });
    }
    recomputeDoc(docId);
    audit('doc', docId, 'ایجاد سند', `${info.no} ${type === 'sale' ? 'فروش' : 'خرید'} — ${M.str(M.fromDb(info.total), 2)} ${c.currency}`, date);
    return getDoc(docId);
  });
}

function uniqueNo(type, date) {
  for (let i = 0; i < 200; i += 1) {
    const no = nextDocNo(type, date);
    if (!get(`SELECT id FROM docs WHERE no=?`, [no])) return no;
  }
  return `${type === 'sale' ? 'INV' : 'PUR'}-${Date.now()}`;
}

export function updateDoc(docId, input) {
  const doc = get(`SELECT * FROM docs WHERE id=?`, [docId]);
  if (!doc) throw err('not_found', 'سند پیدا نشد.');
  if (doc.status === 'cancelled') throw err('cancelled', 'سند لغوشده قابل ویرایش نیست. برای اصلاح، سند جدیدی ثبت کنید.');
  const linked = all(`SELECT id FROM tx WHERE doc_id=? AND void=0`, [docId]);
  if (linked.length) throw err('has_payments', `این سند ${linked.length} دریافت/پرداخت ثبت‌شده دارد. برای تغییر اقلام، نخست دریافت‌ها را لغو کنید.`, 'payments');
  return inTx(() => {
    const date = validDate(input.date) || doc.date;
    const c = computeDoc(input, doc.type);
    // برگرداندن حرکات موجودی قبلی
    const oldMoves = all(`SELECT * FROM stock_moves WHERE doc_id=? AND doc_type IN ('sale','purchase')`, [docId]);
    for (const mv of oldMoves) {
      const q = M.fromDb(mv.qty);
      const back = mv.kind === 'in' ? -q : mv.kind === 'out' ? q : -q;
      stockMove({ item_id: mv.item_id, kind: 'adjust', qty: back, cost: M.fromDb(mv.cost), doc_type: mv.doc_type, doc_id: docId, date, reason: `اصلاح سند ${doc.no}` });
    }
    run(`DELETE FROM stock_moves WHERE doc_id=? AND doc_type IN ('sale','purchase')`, [docId]);
    run(`DELETE FROM doc_items WHERE doc_id=?`, [docId]);
    const party = input.party_id ? get(`SELECT * FROM parties WHERE id=?`, [input.party_id]) : null;
    run(
      `UPDATE docs SET party_id=?, party_name=?, party_phone=?, date=?, due_date=?, currency=?, rate=?, subtotal=?, discount=?,
        tax=?, fee=?, total=?, base_total=?, note=?, attachment=?, account_id=?, method_id=?, updated_at=datetime('now') WHERE id=?`,
      [party?.id ?? null, party?.name || String(input.party_name || '').slice(0, 120), party?.phone || '',
        date, input.due_date ? validDate(input.due_date) : null, c.currency, money(c.rate),
        money(c.subtotal), money(c.discount), money(c.tax), money(c.fee), money(c.total), money(c.base_total),
        String(input.note || '').slice(0, 1000), String(input.attachment || ''),
        input.account_id ? +input.account_id : null, input.method_id ? +input.method_id : null, docId],
    );
    const insLine = db.prepare(`INSERT INTO doc_items (doc_id,row_no,item_id,name,unit,qty,unit_price,discount,line_total,cost,note,update_stock)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of c.lines) {
      let costUnit = l.cost;
      if (doc.type === 'sale' && l.item_id) {
        const s = getStock(l.item_id);
        if (s.avg > 0n) costUnit = s.avg;
      }
      insLine.run(docId, l.row_no, l.item_id, l.name, l.unit, money(l.qty), money(l.price), money(l.disc), money(l.line_total), money(costUnit), l.note, l.update_stock ? 1 : 0);
      if (l.item_id && l.qty !== 0n) {
        const item = get(`SELECT track_stock, kind FROM items WHERE id=?`, [l.item_id]);
        const track = doc.type === 'purchase' ? (l.update_stock ? 1 : 0) : (item?.track_stock && item.kind !== 'service' ? 1 : 0);
        if (track) {
          stockMove({
            item_id: l.item_id, kind: doc.type === 'purchase' ? 'in' : 'out', qty: l.qty,
            cost: doc.type === 'purchase' ? (l.qty !== 0n ? M.div(l.line_total, M.abs(l.qty)) : 0n) : costUnit,
            doc_type: doc.type, doc_id: docId, date, reason: `ویرایش سند ${doc.no}`,
          });
        }
      }
    }
    const cost = doc.type === 'sale' ? M.sum(all(`SELECT qty, cost FROM doc_items WHERE doc_id=?`, [docId]).map((l) => M.mul(M.fromDb(l.qty), M.fromDb(l.cost)))) : 0n;
    run(`UPDATE docs SET cost=? WHERE id=?`, [money(cost), docId]);
    recomputeDoc(docId);
    audit('doc', docId, 'ویرایش سند', `${doc.no} — مبلغ جدید ${M.str(c.total, 2)} ${c.currency}`, date);
    return getDoc(docId);
  });
}

export function cancelDoc(docId, reason = '') {
  const doc = get(`SELECT * FROM docs WHERE id=?`, [docId]);
  if (!doc) throw err('not_found', 'سند پیدا نشد.');
  if (doc.status === 'cancelled') throw err('already', 'این سند از پیش لغو شده است.');
  return inTx(() => {
    const date = J.todayIso();
    for (const mv of all(`SELECT * FROM stock_moves WHERE doc_id=? AND doc_type IN ('sale','purchase')`, [docId])) {
      const q = M.fromDb(mv.qty);
      const back = mv.kind === 'in' ? -q : q;
      stockMove({ item_id: mv.item_id, kind: 'adjust', qty: back, cost: M.fromDb(mv.cost), doc_type: mv.doc_type, doc_id: docId, date, reason: `لغو سند ${doc.no}` });
    }
    for (const t of all(`SELECT id FROM tx WHERE doc_id=? AND void=0`, [docId])) voidTx(t.id, `لغو سند ${doc.no}`);
    run(`UPDATE docs SET status='cancelled', cancelled_at=datetime('now'), cancel_reason=?, updated_at=datetime('now') WHERE id=?`, [String(reason).slice(0, 500), docId]);
    recomputeDoc(docId);
    audit('doc', docId, 'لغو سند', `${doc.no} — دلیل: ${reason || 'بی‌دلیل'}`, date);
    return getDoc(docId);
  });
}

export function getDoc(docId) {
  const doc = get(`SELECT * FROM docs WHERE id=?`, [docId]);
  if (!doc) return null;
  doc.items = all(`SELECT di.*, i.code AS item_code, i.kind AS item_kind FROM doc_items di LEFT JOIN items i ON i.id=di.item_id WHERE di.doc_id=? ORDER BY di.row_no`, [docId]);
  doc.payments = all(`SELECT t.*, m.name AS method_name, a.name AS account_name FROM tx t
      LEFT JOIN methods m ON m.id=t.method_id LEFT JOIN accounts a ON a.id=t.account_id
      WHERE t.doc_id=? AND t.type IN ('receipt','payment') AND t.void=0 ORDER BY t.date, t.id`, [docId]);
  doc.attachments = all(`SELECT id, name, mime, path, size, created_at FROM attachments WHERE owner_type='doc' AND owner_id=? ORDER BY id`, [docId]);
  const st = getSettings();
  doc.status_label = { unpaid: 'پرداخت‌نشده', partial: 'پرداخت جزئی', paid: 'پرداخت‌شده', cancelled: 'لغوشده' }[doc.status];
  doc.party = doc.party_id ? get(`SELECT * FROM parties WHERE id=?`, [doc.party_id]) : null;
  return doc;
}

/* ============================================================
   دریافت، پرداخت، هزینه، برداشت، آورده، انتقال
   ============================================================ */
const TX_DIR = { receipt: 1, other_income: 1, contribution: 1, payment: -1, expense: -1, drawing: -1, transfer: -1, refund: -1 };

export function createTx(input) {
  const st = getSettings();
  const type = input.type;
  if (!TX_DIR[type]) throw err('bad_type', 'نوع تراکنش شناخته‌شده نیست.');
  const date = validDate(input.date) || J.todayIso();
  const currency = input.currency || st.currency_default || 'AFN';
  const rate = currency === 'AFN' ? SCALE : resolveRate(currency, input.rate);
  const amount = M.parse(input.amount);
  if (amount === null) throw err('bad_amount', 'مبلغ را درست وارد کنید. مثلاً ۱۲۵۰۰', 'amount');
  if (amount <= 0n) throw err('bad_amount', 'مبلغ باید بزرگ‌تر از صفر باشد.', 'amount');
  const base = M.mul(amount, rate);
  return inTx(() => {
    let account_id = input.account_id ? +input.account_id : null;
    let to_account_id = input.to_account_id ? +input.to_account_id : null;
    if (type === 'transfer' && (!account_id || !to_account_id)) throw err('bad_transfer', 'برای انتقال، مبدأ و مقصد را انتخاب کنید.');
    if (type !== 'transfer' && !account_id) {
      throw err('no_account', 'حساب دریافت/پرداخت (صندوق یا بانک) را انتخاب کنید تا موجودی نقد درست بماند.', 'account_id');
    }
    if (type === 'transfer' && account_id === to_account_id) throw err('same_account', 'حساب مبدأ و مقصد نباید یکی باشد.');
    if (type === 'transfer') {
      const acc = get(`SELECT * FROM accounts WHERE id=?`, [account_id]);
      if (acc && acc.currency !== currency) throw err('acc_currency', `ارز حساب مبدأ (${acc.currency}) با ارز تراکنش (${currency}) یکی نیست.`);
    }
    const acc = account_id ? get(`SELECT * FROM accounts WHERE id=?`, [account_id]) : null;
    const toAcc = to_account_id ? get(`SELECT * FROM accounts WHERE id=?`, [to_account_id]) : null;
    const fee = type === 'transfer' ? (M.parse(input.fee) ?? 0n) : 0n;
    // مبلغ واریزی به حساب مقصد
    let toAmount = M.parse(input.to_amount) ?? 0n;
    let toRate = SCALE;
    let toBase = 0n;
    if (type === 'transfer') {
      const srcRate = rate;
      toRate = toAcc && toAcc.currency !== currency ? resolveRate(toAcc.currency, input.to_rate) : srcRate;
      const net = amount - fee;
      if (net <= 0n) throw err('bad_fee', 'کارمزد نباید بیشتر یا برابر مبلغ باشد.');
      toAmount = toAcc && toAcc.currency !== currency ? M.div(M.mul(net, srcRate), toRate) : net;
      toBase = M.mul(toAmount, toRate);
    }
    const r = db.prepare(`INSERT INTO tx (type, date, amount, currency, rate, base_amount, account_id, to_account_id,
        to_currency, to_amount, fee, party_id, doc_id, category_id, method_id, title, note, attachment)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(type, date, money(amount), currency, money(rate), money(base), account_id, to_account_id,
        toAcc?.currency || currency, money(toAmount), money(fee),
        input.party_id ? +input.party_id : null, input.doc_id ? +input.doc_id : null,
        input.category_id ? +input.category_id : null, input.method_id ? +input.method_id : null,
        String(input.title || '').slice(0, 200), String(input.note || '').slice(0, 1000), String(input.attachment || '').slice(0, 300));
    const txId = r.lastInsertRowid;
    if (type === 'transfer') {
      addLedger(txId, null, account_id, currency, -(amount + 0n), rate, date, 'انتقال از این حساب');
      addLedger(txId, null, to_account_id, toAcc.currency, toAmount, toRate, date, 'انتقال به این حساب');
    } else if (account_id) {
      const sign = TX_DIR[type] === 1 ? 1n : -1n;
      addLedger(txId, null, account_id, currency, sign * amount, rate, date, txMemo(type));
    }
    if (type === 'receipt' || type === 'payment') {
      if (input.doc_id) recomputeDoc(+input.doc_id);
      // اگر پیش‌پرداخت/پیش‌دریافت است (بدون سند) در ماندهٔ طرف حساب دیده می‌شود
    }
    audit('tx', txId, txLabel(type), `${M.str(amount, 2)} ${currency} — ${date}`, date);
    return getTx(txId);
  });
}

const txMemo = (type) => ({ receipt: 'دریافت از مشتری', payment: 'پرداخت به تأمین‌کننده', expense: 'پرداخت هزینه', other_income: 'درآمد دیگر', drawing: 'برداشت صاحب سرمایه', contribution: 'آورده صاحب سرمایه', transfer: 'انتقال وجه', refund: 'بازگشت وجه' }[type] || type);
const txLabel = (type) => ({ receipt: 'ثبت دریافت', payment: 'ثبت پرداخت', expense: 'ثبت هزینه', other_income: 'ثبت درآمد دیگر', drawing: 'ثبت برداشت', contribution: 'ثبت آورده', transfer: 'انتقال وجه', refund: 'ثبت بازگشت وجه' }[type] || 'تراکنش');

function addLedger(txId, docId, accountId, currency, amount, rate, date, memo) {
  if (amount === 0n) return;
  run(`INSERT INTO ledger (tx_id, doc_id, account_id, currency, amount, date, memo) VALUES (?,?,?,?,?,?,?)`,
    [txId, docId, accountId, currency, money(amount), date, memo]);
}

export function getTx(id) {
  const t = get(`SELECT t.*, a.name AS account_name, a.currency AS account_currency, a.kind AS account_kind,
      ta.name AS to_account_name, p.name AS party_name, c.name AS category_name, m.name AS method_name
      FROM tx t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts ta ON ta.id=t.to_account_id
      LEFT JOIN parties p ON p.id=t.party_id LEFT JOIN categories c ON c.id=t.category_id
      LEFT JOIN methods m ON m.id=t.method_id WHERE t.id=?`, [id]);
  if (!t) return null;
  t.doc_no = t.doc_id ? get(`SELECT no, type FROM docs WHERE id=?`, [t.doc_id])?.no : null;
  return t;
}

export function voidTx(id, reason = '') {
  const t = get(`SELECT * FROM tx WHERE id=?`, [id]);
  if (!t) throw err('not_found', 'تراکنش پیدا نشد.');
  if (t.void) throw err('already', 'این تراکنش از پیش لغو شده است.');
  const doc = t.doc_id ? get(`SELECT * FROM docs WHERE id=?`, [t.doc_id]) : null;
  if (doc && doc.status === 'cancelled') throw err('cancelled', 'سند مربوط لغو شده است؛ نیازی به لغو تراکنش نیست.');
  if (doc) {
    const paidAfter = M.sub(M.fromDb(doc.paid), signedPayAmount(doc, t));
    if (paidAfter < 0n) throw err('negative', 'لغو این دریافت باعث منفی‌شدن پرداخت سند می‌شود؛ نخست دریافت‌های بعدی را لغو کنید.');
  }
  return inTx(() => {
    run(`UPDATE tx SET void=1, void_reason=?, void_at=datetime('now') WHERE id=?`, [String(reason).slice(0, 500), id]);
    run(`DELETE FROM ledger WHERE tx_id=?`, [id]);
    if (t.doc_id) recomputeDoc(t.doc_id);
    audit('tx', id, `لغو ${txLabel(t.type)}`, `مبلغ ${M.str(M.fromDb(t.amount), 2)} ${t.currency} — دلیل: ${reason || 'بی‌دلیل'}`);
    return getTx(id);
  });
}

export function updateTx(id, input) {
  const old = get(`SELECT * FROM tx WHERE id=?`, [id]);
  if (!old) throw err('not_found', 'تراکنش پیدا نشد.');
  if (old.void) throw err('voided', 'تراکنش لغوشده قابل ویرایش نیست. تراکنش تازه‌ای ثبت کنید.');
  return inTx(() => {
    const date = validDate(input.date) || old.date;
    const currency = input.currency || old.currency;
    const rate = currency === 'AFN' ? SCALE : resolveRate(currency, input.rate ?? M.str(M.fromDb(old.rate), 6));
    const amount = M.parse(input.amount ?? M.str(M.fromDb(old.amount), 6));
    if (amount === null || amount <= 0n) throw err('bad_amount', 'مبلغ درست را وارد کنید (بزرگ‌تر از صفر).', 'amount');
    run(`UPDATE tx SET date=?, amount=?, currency=?, rate=?, base_amount=?, account_id=?, to_account_id=?, category_id=?,
        method_id=?, party_id=?, title=?, note=?, attachment=?, fee=? WHERE id=?`,
      [date, money(amount), currency, money(rate), money(M.mul(amount, rate)),
        input.account_id ? +input.account_id : old.account_id,
        input.to_account_id ? +input.to_account_id : old.to_account_id,
        input.category_id === undefined ? old.category_id : (input.category_id ? +input.category_id : null),
        input.method_id === undefined ? old.method_id : (input.method_id ? +input.method_id : null),
        input.party_id === undefined ? old.party_id : (input.party_id ? +input.party_id : null),
        String(input.title ?? old.title).slice(0, 200), String(input.note ?? old.note).slice(0, 1000),
        String(input.attachment ?? old.attachment), money(M.parse(input.fee ?? M.str(M.fromDb(old.fee), 6)) ?? 0n), id]);
    run(`DELETE FROM ledger WHERE tx_id=?`, [id]);
    rebuildLedgerForTx(id);
    if (old.doc_id) recomputeDoc(old.doc_id);
    audit('tx', id, 'ویرایش تراکنش', `${M.str(amount, 2)} ${currency}`);
    return getTx(id);
  });
}

function rebuildLedgerForTx(txId) {
  const t = get(`SELECT * FROM tx WHERE id=?`, [txId]);
  if (!t || t.void) return;
  if (t.type === 'transfer') {
    const toAcc = get(`SELECT * FROM accounts WHERE id=?`, [t.to_account_id]);
    addLedger(t.id, null, t.account_id, t.currency, -M.fromDb(t.amount), M.fromDb(t.rate), t.date, 'انتقال از این حساب');
    if (toAcc) addLedger(t.id, null, toAcc.id, toAcc.currency, M.fromDb(t.to_amount), M.fromDb(t.rate), t.date, 'انتقال به این حساب');
  } else if (t.account_id) {
    addLedger(t.id, null, t.account_id, t.currency, (TX_DIR[t.type] === 1 ? 1n : -1n) * M.fromDb(t.amount), M.fromDb(t.rate), t.date, txMemo(t.type));
  }
}

/* ============================================================
   مانده‌ها
   ============================================================ */
export function accountBalance(accountId) {
  const acc = get(`SELECT * FROM accounts WHERE id=?`, [accountId]);
  if (!acc) return null;
  const rows = all(`SELECT currency, SUM(CAST(amount AS INTEGER)) s FROM ledger WHERE account_id=? GROUP BY currency`, [accountId]);
  // چون ممکن است ارز حساب با ارز تراکنش فرق کند، جمع را به تفکیک ارزِ حساب و بقیه می‌آوریم
  const byCur = {};
  for (const r of all(`SELECT currency, amount FROM ledger WHERE account_id=?`, [accountId])) {
    byCur[r.currency] = (byCur[r.currency] ?? 0n) + M.fromDb(r.amount);
  }
  const open = M.fromDb(acc.opening);
  const own = (byCur[acc.currency] ?? 0n) + open;
  const other = Object.entries(byCur).filter(([c]) => c !== acc.currency).map(([c, v]) => ({ currency: c, amount: v }));
  const base = M.mul(own, resolveRate(acc.currency, null)) + other.reduce((t, o) => t + M.mul(o.amount, resolveRate(o.currency, null)), 0n);
  return { ...acc, balance: own, balance_base: base, opening: open, other_currencies: other, by_currency: byCur };
}

export function accountBalances() {
  const accs = all(`SELECT * FROM accounts ORDER BY active DESC, sort, name`);
  return accs.map((a) => accountBalance(a.id));
}

export function partyBalance(partyId) {
  const docs = all(`SELECT currency, SUM(CAST(balance AS INTEGER)) b, SUM(CAST(total AS INTEGER)) t FROM docs WHERE party_id=? AND status!='cancelled' GROUP BY currency`, [partyId]);
  const adv = all(`SELECT type, currency, amount FROM tx WHERE party_id=? AND doc_id IS NULL AND void=0`, [partyId]);
  const per = {};
  for (const d of docs) {
    per[d.currency] = per[d.currency] || { currency: d.currency, balance: 0n, total: 0n };
    per[d.currency].balance += M.fromDb(d.b);
    per[d.currency].total += M.fromDb(d.t);
  }
  for (const a of adv) {
    per[a.currency] = per[a.currency] || { currency: a.currency, balance: 0n, total: 0n };
    const amt = M.fromDb(a.amount);
    // پیش‌دریافت مشتری → طلب ما کم می‌شود (بدهکار کردن مشتری)، پیش‌پرداخت تأمین‌کننده → بدهی ما کم
    per[a.currency].balance += a.type === 'receipt' ? -amt : a.type === 'payment' ? amt : 0n;
  }
  return Object.values(per).map((x) => ({ ...x, balance: x.balance > 0n ? x.balance : 0n, advance: x.balance < 0n ? -x.balance : 0n }));
}

/** طلب از مشتریان و بدهی به تأمین‌کنندگان (به تفکیک ارز) */
export function totalsByParty(kind) {
  const rows = all(`
    SELECT p.id, p.name, p.phone, d.currency, SUM(CAST(d.balance AS INTEGER)) bal, COUNT(d.id) docs,
           MAX(d.date) last, MIN(d.date) first_due
    FROM docs d JOIN parties p ON p.id = d.party_id
    WHERE d.status != 'cancelled' AND d.balance > 0
      AND (d.type = ? )
    GROUP BY p.id, d.currency
    ORDER BY bal DESC`, [kind === 'customer' ? 'sale' : 'purchase']);
  const out = [];
  for (const r of rows) {
    const rate = resolveRate(r.currency, null);
    out.push({ ...r, bal_micro: M.fromDb(r.bal), base: M.mul(M.fromDb(r.bal), rate), rate });
  }
  return out;
}

export function aging(kind = 'customer', today = J.todayIso()) {
  const docs = all(`SELECT d.*, p.name FROM docs d JOIN parties p ON p.id=d.party_id
      WHERE d.type=? AND d.status!='cancelled' AND d.balance>0`, [kind === 'customer' ? 'sale' : 'purchase']);
  const buckets = { current: 0n, d30: 0n, d60: 0n, d90: 0n };
  const perCur = {};
  for (const d of docs) {
    const due = d.due_date || d.date;
    const days = J.daysBetween(due, today);
    const bal = M.fromDb(d.balance);
    const key = days <= 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : 'd90';
    buckets[key] += bal;
    perCur[d.currency] = (perCur[d.currency] ?? 0n) + bal;
  }
  return { buckets, by_currency: perCur, count: docs.length };
}

/* ============================================================
   گروه‌بندی چندارزی
   ============================================================ */
export function byCurrency(rows, amountKey = 'amount', baseKey = 'base_amount', curKey = 'currency') {
  const map = {};
  for (const r of rows) {
    const c = r[curKey] || 'AFN';
    if (!map[c]) map[c] = { currency: c, amount: 0n, base: 0n, count: 0 };
    map[c].amount += M.fromDb(r[amountKey]);
    map[c].base += M.fromDb(r[baseKey] ?? '0');
    map[c].count += 1;
  }
  return Object.values(map).sort((a, b) => Number(b.base - a.base));
}

/** جمع معادل افغانی (از base_amount های ثبت‌شده، بدون تبدیل دوباره) */
export const baseSum = (rows, key = 'base_amount') => M.sum(rows.map((r) => M.fromDb(r[key] ?? '0')));

/* ============================================================
   گزارش‌ها
   ============================================================ */
const DOC_SEL = `d.subtotal, d.discount, d.tax, d.fee, d.total, d.paid, d.balance, d.base_total, d.cost, d.currency, d.rate, d.date, d.id, d.no, d.status, d.type, d.party_id, d.party_name`;

export function rangeDocs(from, to, type) {
  return all(`SELECT ${DOC_SEL} FROM docs d WHERE d.status!='cancelled' AND date(d.date) >= date(?) AND date(d.date) <= date(?) ${type ? 'AND d.type=?' : ''} ORDER BY d.date, d.id`,
    type ? [from, to, type] : [from, to]);
}

export function reportSales(from, to, { type = 'sale', party_id, currency } = {}) {
  let rows = rangeDocs(from, to, type);
  if (party_id) rows = rows.filter((r) => r.party_id === +party_id);
  if (currency) rows = rows.filter((r) => r.currency === currency);
  const totals = {
    count: rows.length,
    total: M.sum(rows.map((r) => M.fromDb(r.total))),
    paid: M.sum(rows.map((r) => M.fromDb(r.paid))),
    balance: M.sum(rows.map((r) => M.fromDb(r.balance))),
    discount: M.sum(rows.map((r) => M.fromDb(r.discount))),
    tax: M.sum(rows.map((r) => M.fromDb(r.tax))),
    cost: M.sum(rows.map((r) => M.fromDb(r.cost))),
    base_total: M.sum(rows.map((r) => M.fromDb(r.base_total))),
  };
  return {
    from, to, rows, totals,
    by_currency: byCurrency(rows, 'total', 'base_total'),
    by_status: ['unpaid', 'partial', 'paid'].map((s) => ({ status: s, count: rows.filter((r) => r.status === s).length, total: M.sum(rows.filter((r) => r.status === s).map((r) => M.fromDb(r.total))) })),
    by_day: groupBy(rows, (r) => r.date, (acc, r) => { acc.total += M.fromDb(r.total); acc.base += M.fromDb(r.base_total); acc.count += 1; }),
    by_month: groupBy(rows, (r) => J.jalaliMonthKey(r.date), (acc, r) => { acc.total += M.fromDb(r.total); acc.base += M.fromDb(r.base_total); acc.count += 1; }),
    by_party: groupBy(rows, (r) => r.party_name || 'بدون نام', (acc, r) => { acc.total += M.fromDb(r.total); acc.balance += M.fromDb(r.balance); acc.base += M.fromDb(r.base_total); }),
  };
}

function groupBy(rows, keyFn, fold) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, { key: k, total: 0n, base: 0n, count: 0, balance: 0n, sales: 0n, purchases: 0n });
    fold(map.get(k), r);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function reportPayments(from, to, dir) {
  const type = dir === 'in' ? 'receipt' : 'payment';
  const rows = all(`SELECT t.*, p.name AS party_name, a.name AS account_name, d.no AS doc_no FROM tx t
      LEFT JOIN parties p ON p.id=t.party_id LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN docs d ON d.id=t.doc_id
      WHERE t.type=? AND t.void=0 AND date(t.date) >= date(?) AND date(t.date) <= date(?) ORDER BY t.date, t.id`, [type, from, to]);
  return { from, to, rows, totals: { count: rows.length, amount: M.sum(rows.map((r) => M.fromDb(r.amount))), base: baseSum(rows) }, by_currency: byCurrency(rows), by_month: groupBy(rows, (r) => J.jalaliMonthKey(r.date), (a, r) => { a.total += M.fromDb(r.amount); a.base += M.fromDb(r.base_amount); a.count += 1; }) };
}

export function reportExpenses(from, to, { category_id } = {}) {
  const rows = all(`SELECT t.*, c.name AS category_name, a.name AS account_name FROM tx t
      LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN accounts a ON a.id=t.account_id
      WHERE t.type IN ('expense','other_income') AND t.void=0 AND date(t.date) >= date(?) AND date(t.date) <= date(?)
        ${category_id ? 'AND t.category_id=?' : ''} ORDER BY t.date DESC, t.id DESC`,
    category_id ? [from, to, +category_id] : [from, to]);
  const cats = {};
  for (const r of rows) {
    const k = r.category_name || (r.type === 'other_income' ? 'درآمد دیگر' : 'بدون دسته');
    cats[k] = cats[k] || { name: k, amount: 0n, base: 0n, count: 0, currency: r.currency };
    const sign = r.type === 'other_income' ? -1n : 1n;
    cats[k].amount += sign * M.fromDb(r.amount);
    cats[k].base += sign * M.fromDb(r.base_amount);
    cats[k].count += 1;
  }
  return {
    from, to, rows,
    totals: { count: rows.length, amount: M.sum(rows.filter((r) => r.type === 'expense').map((r) => M.fromDb(r.amount))), income: M.sum(rows.filter((r) => r.type === 'other_income').map((r) => M.fromDb(r.amount))), base: M.sum(rows.map((r) => (r.type === 'other_income' ? -1n : 1n) * M.fromDb(r.base_amount))) },
    by_currency: byCurrency(rows.filter((r) => r.type === 'expense')),
    by_category: Object.entries(cats).map(([name, v]) => ({ name, ...v })).sort((a, b) => Number(b.base - a.base)),
  };
}

export function reportCapital(from, to) {
  const rows = all(`SELECT t.*, a.name AS account_name FROM tx t LEFT JOIN accounts a ON a.id=t.account_id
      WHERE t.type IN ('drawing','contribution') AND t.void=0 AND date(t.date) >= date(?) AND date(t.date) <= date(?) ORDER BY t.date, t.id`, [from, to]);
  const contrib = rows.filter((r) => r.type === 'contribution');
  const draw = rows.filter((r) => r.type === 'drawing');
  return {
    from, to, rows,
    contribution: { amount: M.sum(contrib.map((r) => M.fromDb(r.amount))), base: baseSum(contrib), count: contrib.length },
    drawing: { amount: M.sum(draw.map((r) => M.fromDb(r.amount))), base: baseSum(draw), count: draw.length },
    net: M.sum(rows.map((r) => (r.type === 'contribution' ? 1n : -1n) * M.fromDb(r.base_amount))),
    by_currency: byCurrency(rows),
  };
}

export function reportAccounts(from, to) {
  const accs = all(`SELECT * FROM accounts ORDER BY active DESC, sort, name`);
  return accs.map((a) => {
    const open = M.fromDb(a.opening);
    const rows = all(`SELECT * FROM ledger WHERE account_id=? ORDER BY date, id`, [a.id]);
    const inRange = rows.filter((r) => r.date >= from && r.date <= to);
    const before = rows.filter((r) => r.date < from);
    const sum = (l) => M.sum(l.filter((r) => r.currency === a.currency).map((r) => M.fromDb(r.amount)));
    return {
      ...a,
      opening: open,
      moved_in: M.sum(inRange.filter((r) => r.currency === a.currency && M.fromDb(r.amount) > 0n).map((r) => M.abs(M.fromDb(r.amount)))),
      moved_out: M.sum(inRange.filter((r) => r.currency === a.currency && M.fromDb(r.amount) < 0n).map((r) => M.abs(M.fromDb(r.amount)))),
      entries: rows,
      entry_count: rows.length,
      entries: rows.slice(-40),
      balance_before: open + sum(before),
      balance: open + sum(rows),
      by_currency: Object.fromEntries(Object.entries(rows.reduce((m, r) => { m[r.currency] = (m[r.currency] ?? 0n) + M.fromDb(r.amount); return m; }, {}))),
      base: M.mul(open + sum(rows), resolveRate(a.currency, null)),
    };
  });
}

export function reportInventory(from, to, { item_id } = {}) {
  const moves = all(`SELECT m.*, i.name, i.unit, i.code, i.kind FROM stock_moves m JOIN items i ON i.id=m.item_id
      WHERE date(m.date) >= date(?) AND date(m.date) <= date(?) ${item_id ? 'AND m.item_id=?' : ''} ORDER BY m.date, m.id`,
    item_id ? [from, to, +item_id] : [from, to]);
  const signed = moves.map((m) => {
    const q = M.fromDb(m.qty);
    const s = m.kind === 'in' || m.kind === 'return' || m.kind === 'cancel_out' ? q : m.kind === 'out' || m.kind === 'waste' || m.kind === 'cancel_in' ? -q : q;
    return { ...m, signed: s, value: M.mul(s, M.fromDb(m.cost)) };
  });
  const byItem = {};
  for (const m of signed) {
    const k = m.item_id;
    byItem[k] = byItem[k] || { item_id: k, name: m.name, unit: m.unit, in: 0n, out: 0n, adjust: 0n, value: 0n, count: 0 };
    if (m.signed > 0n) byItem[k].in += m.signed;
    else if (m.signed < 0n) byItem[k].out += -m.signed;
    byItem[k].adjust += m.signed;
    byItem[k].value += m.value;
    byItem[k].count += 1;
  }
  return { from, to, moves: signed, by_item: Object.values(byItem) };
}

export function reportStockValue() {
  const rows = all(`SELECT i.id, i.name, i.code, i.unit, i.kind, i.min_qty, i.active, i.image, i.buy_price, i.sell_price,
      COALESCE(s.qty,'0') qty, COALESCE(s.avg_cost,'0') avg_cost, COALESCE(s.value,'0') value
      FROM items i LEFT JOIN stock s ON s.item_id=i.id ORDER BY i.name`);
  const items = rows.map((r) => {
    const qty = M.fromDb(r.qty), avg = M.fromDb(r.avg_cost);
    const value = M.mul(qty, avg);
    const low = r.kind !== 'service' && qty <= M.fromDb(r.min_qty);
    const out = qty <= 0n;
    return { ...r, qty, avg, value, low, out, retail: M.mul(qty, M.fromDb(r.sell_price)) };
  });
  return {
    items,
    totals: {
      count: items.length,
      value: M.sum(items.map((i) => i.value)),
      retail: M.sum(items.map((i) => i.retail)),
      low: items.filter((i) => i.low).length,
      out: items.filter((i) => i.out && i.kind !== 'service').length,
    },
  };
}

/** سود و زیان: درآمد، بهاى تمام‌شده، هزینه‌ها، سود خالص */
export function reportPL(from, to) {
  const sales = rangeDocs(from, to, 'sale');
  const purchases = rangeDocs(from, to, 'purchase');
  const exp = all(`SELECT t.* FROM tx t WHERE t.type IN ('expense','other_income') AND t.void=0 AND date(t.date) >= date(?) AND date(t.date) <= date(?)`, [from, to]);
  const revenueBase = M.sum(sales.map((r) => M.fromDb(r.base_total)));
  const cogsBase = M.sum(sales.map((r) => M.mul(M.fromDb(r.cost), M.fromDb(r.rate))));
  const expBase = M.sum(exp.map((r) => (r.type === 'other_income' ? -1n : 1n) * M.fromDb(r.base_amount)));
  const byCur = {};
  for (const r of sales) {
    byCur[r.currency] = byCur[r.currency] || { currency: r.currency, revenue: 0n, cogs: 0n, gross: 0n, base_revenue: 0n };
    byCur[r.currency].revenue += M.fromDb(r.total);
    byCur[r.currency].cogs += M.fromDb(r.cost);
    byCur[r.currency].base_revenue += M.fromDb(r.base_total);
    byCur[r.currency].gross = byCur[r.currency].revenue - byCur[r.currency].cogs;
  }
  const months = groupBy(sales, (r) => J.jalaliMonthKey(r.date), (a, r) => { a.total += M.fromDb(r.base_total); a.count += 1; });
  const pMonths = groupBy(purchases, (r) => J.jalaliMonthKey(r.date), (a, r) => { a.total += M.fromDb(r.base_total); a.count += 1; });
  return {
    from, to,
    revenue: { amount: M.sum(sales.map((r) => M.fromDb(r.total))), base: revenueBase, count: sales.length },
    cogs: { amount: M.sum(sales.map((r) => M.fromDb(r.cost))), base: cogsBase },
    gross: { amount: M.sum(sales.map((r) => M.fromDb(r.total) - M.fromDb(r.cost))), base: revenueBase - cogsBase },
    expenses: { amount: M.sum(exp.filter((r) => r.type === 'expense').map((r) => M.fromDb(r.amount))), base: expBase },
    net: { base: revenueBase - cogsBase - expBase },
    purchases: { amount: M.sum(purchases.map((r) => M.fromDb(r.total))), base: M.sum(purchases.map((r) => M.fromDb(r.base_total))), count: purchases.length },
    by_currency: Object.values(byCur),
    sales_by_month: months,
    purchases_by_month: pMonths,
    expenses_by_category: (() => {
      const m = {};
      for (const r of exp.filter((x) => x.type === 'expense')) {
        const c = get(`SELECT name FROM categories WHERE id=?`, [r.category_id])?.name || 'بدون دسته';
        m[c] = m[c] || { name: c, base: 0n, amount: 0n, currency: r.currency };
        m[c].base += M.fromDb(r.base_amount);
        m[c].amount += M.fromDb(r.amount);
      }
      return Object.values(m).sort((a, b) => Number(b.base - a.base));
    })(),
  };
}

/**
 * خلاصهٔ چندارزی.
 * هر ارز در ستون خودش جمع می‌شود. «معادل افغانی» موجودی‌ها با نرخ امروز حساب می‌شود
 * (برچسب آن روشن است)؛ اما مبلغ اسناد و تراکنش‌ها همیشه با نرخی که در همان سند ثبت شده می‌ماند.
 */
export function reportCurrency() {
  const st = getSettings();
  const base = st.currency_base || 'AFN';
  const cur = {};
  const ensure = (c) => (cur[c] = cur[c] || {
    currency: c, cash: 0n, receivable: 0n, payable: 0n, advance_in: 0n, advance_out: 0n,
    cash_base: 0n, receivable_base: 0n, payable_base: 0n, stock: 0n, docs: 0,
  });
  for (const r of all(`SELECT currency, SUM(CAST(amount AS INTEGER)) s FROM ledger GROUP BY currency`)) {
    ensure(r.currency).cash += M.fromDb(r.s);
  }
  for (const a of all(`SELECT currency, opening FROM accounts`)) ensure(a.currency).cash += M.fromDb(a.opening);
  for (const d of all(`SELECT currency, rate, balance, type FROM docs WHERE status!='cancelled'`)) {
    ensure(d.currency);
    const bal = M.fromDb(d.balance);
    const rate = d.currency === base ? SCALE : M.fromDb(d.rate);
    if (d.type === 'sale') {
      cur[d.currency].receivable += bal;
      cur[d.currency].receivable_base += M.mul(bal, rate);
    } else {
      cur[d.currency].payable += bal;
      cur[d.currency].payable_base += M.mul(bal, rate);
    }
    cur[d.currency].docs += 1;
  }
  for (const t of all(`SELECT currency, amount, rate, type FROM tx WHERE void=0 AND doc_id IS NULL AND type IN ('receipt','payment')`)) {
    ensure(t.currency);
    const amt = M.fromDb(t.amount);
    if (t.type === 'receipt') cur[t.currency].advance_in += amt; // پیش‌دریافت از مشتری
    else cur[t.currency].advance_out += amt; // پیش‌پرداخت به تأمین‌کننده
  }
  for (const r of all(`SELECT COALESCE(s.qty,'0') q, COALESCE(s.avg_cost,'0') c FROM items i LEFT JOIN stock s ON s.item_id=i.id WHERE i.track_stock=1 AND i.kind!='service'`)) {
    ensure(base).stock += M.mul(M.fromDb(r.q), M.fromDb(r.c));
  }
  const rows = Object.values(cur).map((x) => {
    const rateToday = x.currency === base ? SCALE : resolveRate(x.currency, null);
    return {
      ...x,
      rate_today: rateToday,
      cash_base: M.mul(x.cash, rateToday),
      net: x.cash + x.receivable - x.payable + x.advance_in - x.advance_out,
      net_base: M.mul(x.cash, rateToday) + x.receivable_base - x.payable_base
        + M.mul(x.advance_in - x.advance_out, rateToday) + x.stock,
      info: currencyInfo(x.currency),
    };
  });
  rows.sort((a, b) => Number(b.cash_base - a.cash_base));
  const totals = rows.reduce((t, r) => {
    t.cash_base += r.cash_base; t.receivable_base += r.receivable_base; t.payable_base += r.payable_base;
    t.stock += r.stock; t.net_base += r.net_base;
    return t;
  }, { cash_base: 0n, receivable_base: 0n, payable_base: 0n, stock: 0n, net_base: 0n });
  return { base_currency: base, rows, totals, stock_value: totals.stock };
}

export function dashboard(range) {
  const { from, to } = range;
  const today = J.todayIso();
  const st = getSettings();
  const salesAll = rangeDocs(from, to, 'sale');
  const purchAll = rangeDocs(from, to, 'purchase');
  const sum = (rows, key) => M.sum(rows.map((r) => M.fromDb(r[key])));
  const baseSum = (rows) => M.sum(rows.map((r) => M.fromDb(r.base_total)));
  const todaySales = salesAll.filter((r) => r.date === today);
  const todayPurch = purchAll.filter((r) => r.date === today);
  const mFrom = J.jalaliMonthStart(today), mTo = J.addDaysIso(J.shiftJalaliMonth(today, 1), -1);
  const monthSales = rangeDocs(mFrom, mTo, 'sale');
  const monthPurch = rangeDocs(mFrom, mTo, 'purchase');
  const pl = reportPL(from, to);
  const inv = reportStockValue();
  const cash = accountBalances();
  const receivable = totalsByParty('customer');
  const payable = totalsByParty('supplier');
  const expRows = all(`SELECT base_amount, amount, currency FROM tx WHERE type='expense' AND void=0 AND date>=date(?) AND date<=date(?)`, [from, to]);
  const incRows = all(`SELECT base_amount, amount, currency FROM tx WHERE type='other_income' AND void=0 AND date>=date(?) AND date<=date(?)`, [from, to]);
  return {
    range: { from, to },
    kpis: {
      sales_today: { amount: sum(todaySales, 'total'), base: baseSum(todaySales), count: todaySales.length, currency_note: 'مجموع ارزها فقط در ستون معادل افغانی معتبر است' },
      sales_period: { amount: sum(salesAll, 'total'), base: baseSum(salesAll), count: salesAll.length },
      sales_month: { amount: sum(monthSales, 'total'), base: baseSum(monthSales), count: monthSales.length },
      purchases_today: { amount: sum(todayPurch, 'total'), base: baseSum(todayPurch), count: todayPurch.length },
      purchases_period: { amount: sum(purchAll, 'total'), base: baseSum(purchAll), count: purchAll.length },
      purchases_month: { amount: sum(monthPurch, 'total'), base: baseSum(monthPurch), count: monthPurch.length },
      expenses_period: { amount: sum(expRows, 'amount'), base: baseSum(expRows) },
      income_period: { amount: sum(incRows, 'amount'), base: baseSum(incRows) },
      profit: pl.net.base,
      gross: pl.gross.base,
      receivable: M.sum(receivable.map((r) => r.base)),
      payable: M.sum(payable.map((r) => r.base)),
      cash: M.sum(cash.map((a) => a.balance_base ?? 0n)),
      low_stock: inv.totals.low,
      out_stock: inv.totals.out,
    },
    by_currency_cash: cash.map((a) => ({ account: a.name, id: a.id, currency: a.currency, amount: a.balance, base: a.balance_base })),
    receivable_by_currency: receivable.slice(0, 8),
    payable_by_currency: payable.slice(0, 8),
    series: (() => {
      const byMonth = J.daysBetween(from, to) > 60;
      const key = byMonth ? (r) => J.jalaliMonthKey(r.date) : (r) => r.date;
      return mergeSeries(
        groupBy(salesAll, key, (a, r) => { a.sales += M.fromDb(r.base_total); a.count += 1; }),
        groupBy(purchAll, key, (a, r) => { a.purchases += M.fromDb(r.base_total); a.count += 1; }),
      );
    })(),
    series_mode: J.daysBetween(from, to) > 60 ? 'month' : 'day',
    low_stock_items: inv.items.filter((i) => i.low).slice(0, 8),
    recent: recentActivity(),
    open_docs: all(`SELECT id, no, type, party_name, date, total, balance, currency, status FROM docs WHERE status IN ('unpaid','partial') ORDER BY date DESC LIMIT 6`),
  };
}

function mergeSeries(sRows, pRows, from, to) {
  const map = {};
  for (const r of sRows) { map[r.key] = { key: r.key, sales: r.sales, purchases: 0n, count: r.count }; }
  for (const r of pRows) { map[r.key] = map[r.key] || { key: r.key, sales: 0n, purchases: 0n, count: 0 }; map[r.key].purchases = r.purchases; }
  return Object.values(map).sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function recentActivity(limit = 12) {
  const docs = all(`SELECT id, no, type, party_name, date, total, base_total, currency, status, created_at FROM docs ORDER BY created_at DESC, id DESC LIMIT 200`);
  const txs = all(`SELECT t.id, t.type, t.date, t.amount, t.currency, t.base_amount, t.title, t.created_at,
        p.name AS party_name, a.name AS account_name, c.name AS category_name
      FROM tx t LEFT JOIN parties p ON p.id=t.party_id LEFT JOIN accounts a ON a.id=t.account_id
      LEFT JOIN categories c ON c.id=t.category_id ORDER BY t.created_at DESC, t.id DESC LIMIT 200`);
  const moves = all(`SELECT m.id, m.date, m.qty, m.kind, m.reason, m.created_at, i.name FROM stock_moves m JOIN items i ON i.id=m.item_id ORDER BY m.created_at DESC, m.id DESC LIMIT 100`);
  const out = [];
  const label = { sale: 'فروش', purchase: 'خرید' };
  for (const d of docs) out.push({ kind: 'doc', id: d.id, type: label[d.type], title: d.no, who: d.party_name, date: d.date, amount: M.fromDb(d.base_total), currency: d.currency, status: d.status, created_at: d.created_at });
  for (const t of txs) out.push({ kind: 'tx', id: t.id, type: t.type, title: t.title || txLabel(t.type), who: t.party_name || t.account_name || t.category_name || '', date: t.date, amount: M.fromDb(t.base_amount), currency: t.currency, created_at: t.created_at });
  for (const m of moves) out.push({ kind: 'move', id: m.id, type: 'stock', title: m.name, who: m.reason, date: m.date, qty: M.fromDb(m.qty), qty_kind: m.kind, created_at: m.created_at });
  return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
}

export function search(q, limit = 30) {
  const like = `%${q}%`;
  const res = { docs: [], parties: [], items: [], tx: [] };
  if (!q) return res;
  res.docs = all(`SELECT id, no, type, party_name, date, total, currency, status FROM docs WHERE no LIKE ? OR party_name LIKE ? ORDER BY date DESC LIMIT ?`, [like, like, limit]);
  res.parties = all(`SELECT id, name, phone, kind FROM parties WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT ?`, [like, like, limit]);
  res.items = all(`SELECT id, name, code, unit FROM items WHERE name LIKE ? OR code LIKE ? ORDER BY name LIMIT ?`, [like, like, limit]);
  res.tx = all(`SELECT t.id, t.type, t.date, t.amount, t.currency, t.title, p.name party FROM tx t LEFT JOIN parties p ON p.id=t.party_id
      WHERE t.title LIKE ? OR p.name LIKE ? ORDER BY t.date DESC LIMIT ?`, [like, like, limit]);
  return res;
}

function validDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  if (m) return J.isoFromJalali(+m[1], +m[2], +m[3]);
  return null;
}
