/**
 * api.js — مسیرهای API. پاسخ‌ها JSON‌اند؛ مبالغ به‌شکل رشتهٔ «میکرو» می‌روند
 * و مرورگر با همان money.js قالب‌شان می‌کند (یک منبع حقیقت برای محاسبه و نمایش).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import M from '../public/js/lib/money.js';
import * as J from '../public/js/lib/jalali.js';
import F from '../public/js/lib/format.js';
import { db, all, get, run, audit, getSettings, saveSettings, getMeta, setMeta, stats, UPLOAD_DIR, DB_PATH } from './db.js';
import {
  stockMove, createDoc, updateDoc, cancelDoc, getDoc, recomputeDoc, createTx, updateTx, voidTx, getTx,
  accountBalances, accountBalance, partyBalance, totalsByParty, aging, rebuildStock,
  reportSales, reportPL, reportExpenses, reportPayments, reportCapital, reportAccounts,
  reportInventory, reportStockValue, reportCurrency, dashboard, search, resolveRate, currencyInfo,
  statusFromPaid,
} from './finance.js';

const VERSION = '1.0.0';

/* ============================== ابزارها ============================== */
const num = (v, d = 0) => {
  const n = Number(v);
  return isFinite(n) ? n : d;
};

export class ApiError extends Error {
  constructor(message, status = 400, field) {
    super(message);
    this.status = status;
    this.field = field;
    this.userMessage = message;
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
const str = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008]/g, '').trim().slice(0, max);
const bool01 = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

function rangeOf(q) {
  if (q.from && q.to) return { from: q.from.slice(0, 10), to: q.to.slice(0, 10) };
  const today = J.todayIso();
  if (q.range === 'today') return { from: today, to: today };
  if (q.range === 'week') return { from: J.addDaysIso(today, -6), to: today };
  if (q.range === 'quarter') return { from: J.addDaysIso(today, -89), to: today };
  if (q.range === 'year') {
    const j = J.jalaliFromIso(today);
    return { from: J.isoFromJalali(j.jy, 1, 1), to: J.isoFromJalali(j.jy, 12, J.jalaaliMonthLength(j.jy, 12)) };
  }
  if (q.range === 'last_month') {
    const start = J.jalaliMonthStart(J.shiftJalaliMonth(today, -1));
    const j2 = J.jalaliFromIso(start);
    return { from: start, to: J.isoFromJalali(j2.jy, j2.jm, J.jalaaliMonthLength(j2.jy, j2.jm)) };
  }
  if (q.range === 'all') return { from: '1900-01-01', to: '2999-12-31' };
  const j = J.jalaliFromIso(today);
  const r = J.jalaliMonthRange(j.jy, j.jm);
  return { from: r.from, to: r.to };
}

/* ============================== تعریف منابع CRUD ============================== */
const RESOURCES = {
  parties: {
    table: 'parties',
    fields: { name: 'str!', kind: 'kind!', contact: 'str', phone: 'str', email: 'str', address: 'str', note: 'str', tax_no: 'str', active: 'bool', is_company: 'bool' },
    list: ({ q }) => {
      const kind = q.kind && q.kind !== 'all' ? `AND (kind=? OR kind='both')` : '';
      const params = kind ? [q.kind] : [];
      const like = q.q ? `%${str(q.q, 60)}%` : null;
      const where = `${like ? 'AND (name LIKE ? OR phone LIKE ? OR contact LIKE ?)' : ''}`;
      if (like) params.push(like, like, like);
      const rows = all(`SELECT * FROM parties WHERE 1=1 ${kind} ${where} ORDER BY active DESC, name LIMIT 500`, params);
      return rows.map((p) => ({ ...p, balances: partyBalance(p.id), doc_count: get(`SELECT COUNT(*) c FROM docs WHERE party_id=?`, [p.id]).c }));
    },
    beforeDelete: (id) => {
      const c = get(`SELECT COUNT(*) c FROM docs WHERE party_id=? AND status!='cancelled'`, [id]).c;
      if (c) throw new ApiError(`این شخص ${c} سند دارد. برای پنهان‌کردنش، آن را از فهرست بایگان کنید (غیرفعال).`, 409);
      return true;
    },
  },
  categories: {
    table: 'categories',
    fields: { name: 'str!', kind: 'str', note: 'str', sort: 'num' },
    list: ({ q }) => all(`SELECT * FROM categories ${q.kind ? `WHERE kind=?` : ''} ORDER BY sort, name`, q.kind ? [q.kind] : []),
    beforeDelete: (id) => {
      const c = get(`SELECT COUNT(*) c FROM items WHERE category_id=?`, [id]).c + get(`SELECT COUNT(*) c FROM tx WHERE category_id=?`, [id]).c;
      if (c) throw new ApiError(`این دسته در ${c} مورد استفاده شده است و قابل حذف نیست.`, 409);
      return true;
    },
  },
  methods: {
    table: 'methods',
    fields: { name: 'str!', kind: 'str', account_id: 'int', note: 'str', active: 'bool', sort: 'num' },
    list: () => all(`SELECT * FROM methods ORDER BY sort, name`),
  },
  accounts: {
    table: 'accounts',
    fields: { name: 'str!', kind: 'kind!', currency: 'cur!', opening: 'micro', bank_name: 'str', account_no: 'str', card_no: 'str', note: 'str', active: 'bool', sort: 'num' },
    list: () => accountBalances().map((a) => ({ ...a, doc_count: get(`SELECT COUNT(*) c FROM tx WHERE account_id=? OR to_account_id=?`, [a.id, a.id]).c })),
    get: (id) => accountBalance(id),
    beforeDelete: (id) => {
      const c = get(`SELECT COUNT(*) c FROM ledger WHERE account_id=?`, [id]).c;
      if (c) throw new ApiError(`این حساب ${c} حرکت مالی دارد و قابل حذف نیست. آن را غیرفعال کنید.`, 409);
      return true;
    },
  },
  currencies: {
    table: 'currencies', pk: 'code', pkType: 'text',
    fields: { code: 'code!', name: 'str!', symbol: 'str', decimals: 'num', rate: 'rate', active: 'bool', sort: 'num' },
    list: () => all(`SELECT * FROM currencies ORDER BY sort, code`),
    beforeDelete: (id) => {
      const c = get(`SELECT COUNT(*) c FROM docs WHERE currency=?`, [id]).c + get(`SELECT COUNT(*) c FROM tx WHERE currency=?`, [id]).c + get(`SELECT COUNT(*) c FROM accounts WHERE currency=?`, [id]).c;
      if (c) throw new ApiError(`ارز ${id} در ${c} سند/حساب استفاده شده و قابل حذف نیست. می‌توانید آن را از فهرست بایگان کنید.`, 409);
      run(`DELETE FROM rates WHERE code=?`, [id]);
      return true;
    },
    afterSave: (code, body) => {
      if (body.rate !== undefined && M.parse(body.rate) > 0n) {
        const today = J.todayIso();
        run(`INSERT INTO rates (code, date, rate) VALUES (?,?,?) ON CONFLICT(code, date) DO UPDATE SET rate=excluded.rate`, [code, today, M.toDb(M.parse(body.rate))]);
        run(`UPDATE currencies SET rate=? WHERE code=?`, [M.toDb(M.parse(body.rate)), code]);
      }
    },
  },
  items: {
    table: 'items',
    fields: { name: 'str!', code: 'str', category_id: 'int', unit: 'str', kind: 'kind', buy_price: 'micro', sell_price: 'micro', track_stock: 'bool', min_qty: 'micro', image: 'str', note: 'str', active: 'bool' },
    list: ({ q }) => {
      const like = q.q ? `%${str(q.q, 60)}%` : null;
      const rows = all(`SELECT i.*, c.name AS category_name, COALESCE(s.qty,'0') qty, COALESCE(s.avg_cost,'0') avg_cost, COALESCE(s.value,'0') value
          FROM items i LEFT JOIN categories c ON c.id=i.category_id LEFT JOIN stock s ON s.item_id=i.id
          WHERE (1=1) ${q.category ? 'AND i.category_id=?' : ''} ${q.kind ? 'AND i.kind=?' : ''} ${like ? 'AND (i.name LIKE ? OR i.code LIKE ?)' : ''}
            ${q.low ? "AND i.kind!='service' AND CAST(COALESCE(s.qty,'0') AS INTEGER) <= CAST(i.min_qty AS INTEGER)" : ''}
          ORDER BY i.name LIMIT 800`,
        [...(q.category ? [+q.category] : []), ...(q.kind ? [q.kind] : []), ...(like ? [like, like] : [])]);
      return rows.map((r) => {
        const qty = M.fromDb(r.qty), avg = M.fromDb(r.avg_cost);
        return {
          ...r, qty, avg_cost: avg, value: M.mul(qty, avg), retail: M.mul(qty, M.fromDb(r.sell_price)),
          low: r.kind !== 'service' && qty <= M.fromDb(r.min_qty), out: r.kind !== 'service' && qty <= 0n,
        };
      });
    },
    get: (id) => {
      const r = get(`SELECT i.*, c.name AS category_name, COALESCE(s.qty,'0') qty, COALESCE(s.avg_cost,'0') avg_cost, COALESCE(s.value,'0') stock_value
          FROM items i LEFT JOIN categories c ON c.id=i.category_id LEFT JOIN stock s ON s.item_id=i.id WHERE i.id=?`, [id]);
      if (!r) throw new ApiError('کالا پیدا نشد.', 404);
      r.qty = M.fromDb(r.qty); r.avg_cost = M.fromDb(r.avg_cost);
      r.stock_value = M.mul(r.qty, r.avg_cost);
      r.low = r.kind !== 'service' && r.qty <= M.fromDb(r.min_qty);
      r.out = r.kind !== 'service' && r.qty <= 0n;
      r.retail_value = M.mul(r.qty, M.fromDb(r.sell_price));
      r.min_qty = M.fromDb(r.min_qty);
      r.qty_units = M.sum(all(`SELECT qty FROM doc_items di JOIN docs d ON d.id=di.doc_id WHERE di.item_id=? AND d.type='sale' AND d.status!='cancelled'`, [id]).map((x) => M.fromDb(x.qty)));
      r.moves = all(`SELECT m.*, d.no AS doc_no FROM stock_moves m LEFT JOIN docs d ON d.id=m.doc_id WHERE m.item_id=? ORDER BY m.date DESC, m.id DESC LIMIT 200`, [id]);
      r.recent_docs = all(`SELECT d.id, d.no, d.date, d.type, di.qty, di.unit_price FROM docs d JOIN doc_items di ON di.doc_id=d.id WHERE di.item_id=? AND d.status!='cancelled' ORDER BY d.date DESC LIMIT 20`, [id]);
      return r;
    },
    beforeDelete: (id) => {
      const c = get(`SELECT COUNT(*) c FROM doc_items WHERE item_id=?`, [id]).c + get(`SELECT COUNT(*) c FROM stock_moves WHERE item_id=?`, [id]).c;
      if (c) throw new ApiError(`این کالا در ${c} سند یا حرکت گدام استفاده شده و قابل حذف نیست. آن را غیرفعال کنید.`, 409);
      return true;
    },
  },
};

function castField(kind, value, name) {
  switch (kind) {
    case 'str': return str(value);
    case 'str!': {
      const v = str(value);
      if (!v) throw new ApiError(`«${labelOf(name)}» را وارد کنید.`);
      return v;
    }
    case 'micro': return M.toDb(M.parse(value) ?? 0n);
    case 'rate': {
      const v = M.parse(value) ?? 0n;
      if (v <= 0n) throw new ApiError('نرخ تبدیل باید عددی بزرگ‌تر از صفر باشد.');
      return M.toDb(v);
    }
    case 'num': return num(value);
    case 'bool': return bool01(value);
    case 'int': return value === '' || value === null || value === undefined ? null : +value;
    case 'kind': {
      const v = str(value, 20);
      if (!['customer', 'supplier', 'both'].includes(v) && !['goods', 'material', 'service'].includes(v) && !['cash', 'bank'].includes(v)) {
        if (name === 'kind' || name === 'type') throw new ApiError('نوع انتخاب‌شده معتبر نیست.');
      }
      return v || 'customer';
    }
    case 'cur': {
      const v = str(value, 8).toUpperCase();
      if (!get(`SELECT code FROM currencies WHERE code=?`, [v])) throw new ApiError(`ارز «${v}» تعریف نشده است. نخست آن را به ارزها اضافه کنید.`);
      return v;
    }
    case 'code': {
      const v = str(value, 8).toUpperCase().replace(/[^A-Z]/g, '');
      if (v.length < 2 || v.length > 4) throw new ApiError('کد ارز باید ۲ تا ۴ حرف باشد. مثلاً AFN');
      return v;
    }
    default: return typeof value === 'object' ? JSON.stringify(value) : value;
  }
}
const LABELS = { name: 'نام', kind: 'نوع', currency: 'ارز', opening: 'موجودی اول دوره', code: 'کد', unit: 'واحد', rate: 'نرخ', amount: 'مبلغ', date: 'تاریخ' };
const labelOf = (k) => LABELS[k] || k;

function upsert(resource, body, id = null) {
  const cfg = RESOURCES[resource];
  const pk = cfg.pk || 'id';
  const values = {};
  for (const [field, kind] of Object.entries(cfg.fields)) {
    if (kind.endsWith('!') && body[field] === undefined) throw new ApiError(`«${labelOf(field)}» لازم است.`);
    if (body[field] !== undefined) values[field] = castField(kind, body[field], field);
  }
  if (id) {
    if (!Object.keys(values).length) throw new ApiError('چیزی برای ذخیره فرستاده نشد.');
    if (pk === 'code') throw new ApiError('کد ارز قابل تغییر نیست. ارز تازه بسازید و در تنظیمات انتخابش کنید.');
    run(`UPDATE ${cfg.table} SET ${Object.keys(values).map((k) => `${k}=$${k}`).join(', ')} ${resource === 'items' || resource === 'parties' ? ", updated_at=datetime('now')" : ''} WHERE ${pk}=$id`,
      { ...values, id });
    cfg.afterSave?.(body[pk] ?? id, body);
    audit(resource, +id || body[pk], 'ویرایش', Object.keys(values).join('، '));
    return getResourceRow(resource, id);
  }
  if (pk === 'code' && get(`SELECT code FROM currencies WHERE code=?`, [values.code])) throw new ApiError(`ارز ${values.code} از پیش تعریف شده است.`);
  if (pk !== 'code') {
    const cols = Object.keys(values);
    const r = db.prepare(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${cols.map((c) => `$${c}`).join(',')})`).run(values);
    const newId = r.lastInsertRowid;
    cfg.afterSave?.(body.code ?? newId, body);
    audit(resource, newId, 'افزودن', values.name || '');
    return getResourceRow(resource, newId);
  }
  const cols = Object.keys(values);
  db.prepare(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${cols.map((c) => `$${c}`).join(',')})`).run(values);
  cfg.afterSave?.(values.code, body);
  audit(resource, null, 'افزودن ارز', values.code);
  return getResourceRow(resource, values.code);
}
function getResourceRow(resource, id) {
  const cfg = RESOURCES[resource];
  const pk = cfg.pk || 'id';
  if (cfg.get) return cfg.get(id);
  return get(`SELECT * FROM ${cfg.table} WHERE ${pk}=?`, [id]);
}

/* ============================== مسیرها ============================== */
export const routes = {
  'GET /api/health': () => ({ ok: true, version: VERSION, time: new Date().toISOString(), stats: stats(), offline_ready: true }),

  'GET /api/bootstrap': () => {
    const st = getSettings();
    return {
      version: VERSION,
      settings: st,
      currencies: all(`SELECT * FROM currencies ORDER BY sort, code`),
      latest_rates: all(`SELECT * FROM rates ORDER BY date DESC, id DESC LIMIT 200`),
      methods: all(`SELECT * FROM methods WHERE active=1 ORDER BY sort, name`),
      categories: all(`SELECT * FROM categories ORDER BY kind, sort, name`),
      accounts: accountBalances(),
      parties_short: all(`SELECT id, name, kind, phone FROM parties WHERE active=1 ORDER BY name LIMIT 500`),
      items_short: all(`SELECT i.id, i.name, i.code, i.unit, i.kind, i.sell_price, i.buy_price, i.track_stock, i.image, i.min_qty,
          COALESCE(s.qty,'0') stock_qty, COALESCE(s.avg_cost,'0') avg_cost FROM items i LEFT JOIN stock s ON s.item_id=i.id
          WHERE i.active=1 ORDER BY i.name LIMIT 800`),
      today: J.todayIso(),
      stats: stats(),
      seeded: !!getMeta('demo_seeded', false),
      pwa: { installable: true },
    };
  },

  'POST /api/settings': ({ body }) => {
    const next = saveSettings(body || {});
    audit('settings', null, 'تغییر تنظیمات', Object.keys(body || {}).join('، '));
    return { settings: next };
  },
  'POST /api/settings/logo': ({ body }) => {
    const data = str(body.data, 4_000_000);
    const m = data.match(/^data:(image\/(png|jpeg|jpg|webp|svg\+xml));base64,(.+)$/);
    if (!m) throw new ApiError('فایل تصویر خوانا نیست. یک PNG، JPG یا SVG انتخاب کنید.');
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 1_500_000) throw new ApiError('حجم لوگو نباید بیشتر از ۱٫۵ مگابایت باشد.');
    const name = `logo-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'svg+xml' ? 'svg' : m[2] === 'jpeg' ? 'jpg' : m[2]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    const st = saveSettings({ ...getSettings(), business: { ...getSettings().business, logo: `/files/${name}` } });
    return { settings: st, path: `/files/${name}` };
  },

  'GET /api/rates': ({ q }) => ({
    latest: all(`SELECT r.* FROM rates r JOIN (SELECT code, MAX(date) d FROM rates GROUP BY code) x ON x.code=r.code AND x.d=r.date ORDER BY r.code`),
    currencies: all(`SELECT code, rate FROM currencies`),
    history: q.code
      ? all(`SELECT * FROM rates WHERE code=? ORDER BY date DESC LIMIT 300`, [str(q.code, 8).toUpperCase()])
      : all(`SELECT * FROM rates ORDER BY date DESC, id DESC LIMIT 300`),
  }),
  'POST /api/rates': ({ body }) => {
    const code = str(body.code, 8).toUpperCase();
    const rate = M.parse(body.rate);
    if (!rate || rate <= 0n) throw new ApiError('نرخ باید بزرگ‌تر از صفر باشد. مثلاً ۷۱٫۵۰');
    const date = body.date || J.todayIso();
    run(`INSERT INTO rates (code, date, rate, note) VALUES (?,?,?,?) ON CONFLICT(code, date) DO UPDATE SET rate=excluded.rate, note=excluded.note`,
      [code, date.slice(0, 10), M.toDb(rate), str(body.note, 200)]);
    run(`UPDATE currencies SET rate=? WHERE code=?`, [M.toDb(rate), code]);
    audit('rates', null, 'ثبت نرخ ارز', `${code} = ${M.str(rate, 4)} ${(getSettings().currency_base || 'AFN')}`);
    return { ok: true, rate: M.toDb(rate), date: date.slice(0, 10) };
  },

  /* ---------- اسناد فروش/خرید ---------- */
  'GET /api/docs': ({ q }) => {
    const type = q.type === 'purchase' ? 'purchase' : q.type === 'sale' ? 'sale' : null;
    const like = q.q ? `%${str(q.q, 60)}%` : null;
    const params = [];
    let where = `WHERE 1=1`;
    if (type) { where += ` AND d.type=?`; params.push(type); }
    if (q.status && q.status !== 'all') { where += ` AND d.status=?`; params.push(q.status); }
    if (q.party) { where += ` AND d.party_id=?`; params.push(+q.party); }
    if (q.currency) { where += ` AND d.currency=?`; params.push(str(q.currency, 6)); }
    if (q.from) { where += ` AND date(d.date) >= date(?)`; params.push(q.from); }
    if (q.to) { where += ` AND date(d.date) <= date(?)`; params.push(q.to); }
    if (q.unpaid === '1') where += ` AND d.balance > 0 AND d.status!='cancelled'`;
    if (like) { where += ` AND (d.no LIKE ? OR d.party_name LIKE ? OR d.note LIKE ?)`; params.push(like, like, like); }
    const limit = Math.min(num(q.limit, 60), 400);
    const offset = Math.max(num(q.offset, 0), 0);
    const rows = all(`SELECT d.*, (SELECT COUNT(*) FROM tx t WHERE t.doc_id=d.id AND t.void=0) pay_count
        FROM docs d ${where} ORDER BY d.date DESC, d.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
    const total = get(`SELECT COUNT(*) c FROM docs d ${where}`, params).c;
    const agg = all(`SELECT currency, SUM(CAST(total AS INTEGER)) total, SUM(CAST(balance AS INTEGER)) bal FROM docs d ${where} AND d.status!='cancelled' GROUP BY currency`, params);
    return {
      rows: rows.map((r) => ({ ...r, status_label: { unpaid: 'پرداخت‌نشده', partial: 'پرداخت جزئی', paid: 'پرداخت‌شده', cancelled: 'لغوشده' }[r.status] })),
      total, limit, offset,
      totals_by_currency: agg.map((a) => ({ currency: a.currency, total: M.fromDb(a.total), balance: M.fromDb(a.bal) })),
      totals_base: M.sum(agg.map((a) => M.mul(M.fromDb(a.total), resolveRate(a.currency, null)))),
    };
  },
  'GET /api/docs/:id': ({ params }) => {
    const d = getDoc(+params.id);
    if (!d) throw new ApiError('سند پیدا نشد.', 404);
    return d;
  },
  'POST /api/docs': ({ body }) => {
    const type = body.type === 'purchase' ? 'purchase' : 'sale';
    return { doc: createDoc(type, body) };
  },
  'PUT /api/docs/:id': ({ body, params }) => ({ doc: updateDoc(+params.id, body) }),
  'POST /api/docs/:id/cancel': ({ body, params }) => ({ doc: cancelDoc(+params.id, str(body.reason, 400)) }),
  'POST /api/docs/:id/payment': ({ body, params }) => {
    const doc = get(`SELECT * FROM docs WHERE id=?`, [+params.id]);
    if (!doc) throw new ApiError('سند پیدا نشد.', 404);
    if (doc.status === 'cancelled') throw new ApiError('سند لغوشده است؛ دریافت جدید روی آن ثبت نمی‌شود.');
    const bal = M.fromDb(doc.balance);
    let amount = M.parse(body.amount);
    if (amount === null) throw new ApiError('مبلغ دریافت را وارد کنید. مثلاً ۵۰۰۰', 400, 'amount');
    if (amount <= 0n) throw new ApiError('مبلغ باید بزرگ‌تر از صفر باشد.', 400, 'amount');
    const allowOver = bool01(body.allow_over);
    if (!allowOver) {
      const balInTxCur = doc.currency === (body.currency || doc.currency) ? bal : M.div(M.mul(bal, M.fromDb(doc.rate)), resolveRate(body.currency || doc.currency, body.rate));
      if (amount > balInTxCur && balInTxCur > 0n) {
        const e = new ApiError(`مبلغ وارد شده (${M.fmt(amount, { decimals: 2, digits: 'fa' })}) از ماندهٔ سند (${M.fmt(balInTxCur, { decimals: 2, digits: 'fa' })}) بیشتر است. اگر واقعاً بیشتر پرداخته‌اید، گزینهٔ «ثبت اضافه به‌عنوان پیش‌پرداخت» را روشن کنید.`, 409);
        e.code = 'over_paid';
        throw e;
      }
    }
    const t = createTx({
      ...pick(body, ['date', 'currency', 'rate', 'account_id', 'method_id', 'note', 'attachment', 'party_id', 'account_id']),
      type: doc.type === 'sale' ? 'receipt' : 'payment',
      amount, doc_id: doc.id, party_id: doc.party_id,
    });
    return { tx: t, doc: getDoc(doc.id) };
  },
  'POST /api/docs/:id/attachments': ({ body, params }) => {
    const saved = saveUpload(body);
    const doc = get(`SELECT * FROM docs WHERE id=?`, [+params.id]);
    if (!doc) throw new ApiError('سند پیدا نشد.', 404);
    db.prepare(`INSERT INTO attachments (owner_type, owner_id, name, mime, size, path) VALUES (?,?,?,?,?,?)`)
      .run('doc', +params.id, saved.name, saved.mime, saved.size, saved.path);
    audit('doc', +params.id, 'افزودن پیوست', saved.name);
    return { ok: true, ...saved, doc: getDoc(+params.id) };
  },
  'DELETE /api/attachments/:id': ({ params }) => {
    const a = get(`SELECT * FROM attachments WHERE id=?`, [+params.id]);
    if (!a) throw new ApiError('پیوست پیدا نشد.', 404);
    fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(a.path))).catch(() => {});
    run(`DELETE FROM attachments WHERE id=?`, [a.id]);
    return { ok: true };
  },

  /* ---------- تراکنش‌های نقدی ---------- */
  'GET /api/tx': ({ q }) => {
    const params = [];
    let where = `WHERE t.void=0`;
    if (q.type && q.type !== 'all') {
      const types = String(q.type).split(',').filter(Boolean);
      where += ` AND t.type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
    if (q.include_void === '1') where = where.replace('WHERE t.void=0', 'WHERE 1=1');
    if (q.range || q.from || q.to) { const r = rangeOf(q); where += ` AND date(t.date) >= date(?) AND date(t.date) <= date(?)`; params.push(r.from, r.to); }
    if (q.account) { where += ` AND (t.account_id=? OR t.to_account_id=?)`; params.push(+q.account, +q.account); }
    if (q.party) { where += ` AND t.party_id=?`; params.push(+q.party); }
    if (q.currency) { where += ` AND t.currency=?`; params.push(q.currency); }
    const like = q.q ? `%${str(q.q, 60)}%` : null;
    if (like) { where += ` AND (t.title LIKE ? OR t.note LIKE ?)`; params.push(like, like); }
    const rows = all(`SELECT t.*, p.name party_name, a.name account_name, ta.name to_account_name, c.name category_name, m.name method_name, d.no doc_no, d.type doc_type
        FROM tx t LEFT JOIN parties p ON p.id=t.party_id LEFT JOIN accounts a ON a.id=t.account_id
        LEFT JOIN accounts ta ON ta.id=t.to_account_id LEFT JOIN categories c ON c.id=t.category_id
        LEFT JOIN methods m ON m.id=t.method_id LEFT JOIN docs d ON d.id=t.doc_id
        ${where} ORDER BY t.date DESC, t.id DESC LIMIT ${Math.min(num(q.limit, 200), 600)} OFFSET ${Math.max(0, num(q.offset, 0))}`, params);
    const totals = {};
    for (const r of rows) {
      totals[r.currency] = totals[r.currency] || { currency: r.currency, amount: 0n, base: 0n };
      totals[r.currency].amount += M.fromDb(r.amount);
      totals[r.currency].base += M.fromDb(r.base_amount);
    }
    return { rows, by_currency: Object.values(totals) };
  },
  'GET /api/tx/:id': ({ params }) => {
    const t = getTx(+params.id);
    if (!t) throw new ApiError('این ثبت پیدا نشد. ممکن است حذف شده باشد.', 404);
    return { tx: t };
  },
  'POST /api/tx': ({ body }) => ({ tx: createTx(body) }),
  'PUT /api/tx/:id': ({ body, params }) => ({ tx: updateTx(+params.id, body) }),
  'POST /api/tx/:id/void': ({ body, params }) => ({ tx: voidTx(+params.id, str(body.reason, 400)) }),
  'POST /api/tx/:id/attachment': ({ body, params }) => {
    const saved = saveUpload(body);
    run(`UPDATE tx SET attachment=? WHERE id=?`, [saved.path, +params.id]);
    return { ok: true, ...saved };
  },

  /* ---------- گدام ---------- */
  'POST /api/items/:id/move': ({ body, params }) => {
    const kind = str(body.kind, 12);
    if (!['in', 'out', 'return', 'waste', 'adjust'].includes(kind)) throw new ApiError('نوع حرکت درست نیست.');
    const qty = M.parse(body.qty);
    if (qty === null) throw new ApiError('مقدار را وارد کنید. مثلاً ۱۰', 400, 'qty');
    const reason = str(body.reason, 300);
    if (kind === 'adjust' || kind === 'waste' || kind === 'return') {
      if (!reason) throw new ApiError('برای ثبت تغییر موجودی، دلیل را بنویسید تا در گزارش گردش قابل پیگیری باشد.', 400, 'reason');
    }
    const item = get(`SELECT * FROM items WHERE id=?`, [+params.id]);
    if (!item) throw new ApiError('کالا پیدا نشد.', 404);
    const kindMap = { in: 'in', out: 'out', return: 'return', waste: 'waste', adjust: 'adjust' };
    const mk = kindMap[kind];
    const cost = kind === 'in' || kind === 'adjust' ? (M.parse(body.cost_unit) ?? 0n) : 0n;
    const date = str(body.date, 10) || J.todayIso();
    let qtySigned = qty;
    if (mk === 'adjust') {
      // کاربر جهت را با علامت یا با «اصلاح به» مشخص می‌کند
      qtySigned = M.abs(qty) * (bool01(body.decrease) ? -1n : 1n);
    }
    if (mk !== 'adjust' && qtySigned <= 0n) throw new ApiError('مقدار باید بزرگ‌تر از صفر باشد.', 400, 'qty');
    const before = get(`SELECT qty FROM stock WHERE item_id=?`, [item.id])?.qty ?? '0';
    const after = stockMove({
      item_id: item.id, kind: mk, qty: qtySigned, cost, date, reason, note: str(body.note, 400),
      doc_type: 'manual', doc_id: null,
    });
    if (after.qty < 0n) {
      audit('item', item.id, 'هشدار موجودی منفی', `${item.name}: موجودی پس از اصلاح منفی شد`);
    }
    return {
      ok: true, item: item.name,
      before: M.toDb(M.fromDb(before)), after: M.toDb(after.qty), avg: M.toDb(after.avg),
      message: after.qty < 0n
        ? 'موجودی این کالا منفی شد. اگر کالا را تحویل داده‌اید اما هنوز خریدش را ثبت نکرده‌اید، سند خرید را ثبت کنید.'
        : 'تغییر موجودی ثبت شد و در گردش کالا یادداشت شد.',
    };
  },
  'GET /api/inventory': ({ q }) => {
    const rep = reportStockValue();
    if (q?.low === '1') rep.items = rep.items.filter((i) => i.low);
    return rep;
  },
  'POST /api/stock/rebuild': () => ({ ok: true, items: rebuildStock().length, message: 'موجودی از روی گردش گدام دوباره ساخته شد.' }),

  /* ---------- گزارش‌ها ---------- */
  'GET /api/dashboard': ({ q }) => dashboard(rangeOf(q)),
  'GET /api/search': ({ q }) => search(str(q.q, 60)),
  'GET /api/reports/sales': ({ q }) => { const r = rangeOf(q); return reportSales(r.from, r.to, { type: q.type === 'purchase' ? 'purchase' : 'sale', party_id: q.party, currency: q.currency }); },
  'GET /api/reports/pl': ({ q }) => { const r = rangeOf(q); return reportPL(r.from, r.to); },
  'GET /api/reports/expenses': ({ q }) => { const r = rangeOf(q); return reportExpenses(r.from, r.to, { category_id: q.category }); },
  'GET /api/reports/receipts': ({ q }) => { const r = rangeOf(q); return reportPayments(r.from, r.to, 'in'); },
  'GET /api/reports/payments': ({ q }) => { const r = rangeOf(q); return reportPayments(r.from, r.to, 'out'); },
  'GET /api/reports/capital': ({ q }) => { const r = rangeOf(q); return reportCapital(r.from, r.to); },
  'GET /api/reports/accounts': ({ q }) => { const r = rangeOf(q); return reportAccounts(r.from, r.to); },
  'GET /api/reports/inventory': ({ q }) => { const r = rangeOf(q); return reportInventory(r.from, r.to, { item_id: q.item }); },
  'GET /api/reports/stock': () => reportStockValue(),
  'GET /api/reports/currency': () => reportCurrency(),
  'GET /api/reports/receivables': () => ({ customers: totalsByParty('customer'), suppliers: totalsByParty('supplier'), aging_in: aging('customer'), aging_out: aging('supplier') }),
  'GET /api/reports/ledger': ({ q }) => {
    const r = rangeOf(q);
    const rows = all(`SELECT l.*, a.name account_name, a.currency acc_cur, t.type, t.id tx_id, d.no doc_no
        FROM ledger l JOIN accounts a ON a.id=l.account_id LEFT JOIN tx t ON t.id=l.tx_id LEFT JOIN docs d ON d.id=l.doc_id
        WHERE l.date >= date(?) AND l.date <= date(?) ORDER BY l.date, l.id`, [r.from, r.to]);
    return { from: r.from, to: r.to, rows };
  },

  /* ---------- داده‌ها: پشتیبان و نمونه ---------- */
  'GET /api/export': () => exportData(),
  'POST /api/import': ({ body }) => importData(body),
  'POST /api/demo/seed': () => import('./seed.js').then((m) => m.seed()),
  'POST /api/demo/clear': ({ body }) => {
    if (str(body.confirm, 20) !== 'پاک کردن') throw new ApiError('برای پاک‌کردن همهٔ داده‌ها، عبارت «پاک کردن» را تایپ کنید.', 409);
    return import('./seed.js').then((m) => m.clearAll());
  },
  'POST /api/verify': () => {
    const out = { mismatches: [], docs: 0 };
    const rebuilt = rebuildStock();
    for (const r of rebuilt) {
      const s = get(`SELECT qty, avg_cost FROM stock WHERE item_id=?`, [r.item_id]);
      if (s && (s.qty !== M.toDb(r.qty))) out.mismatches.push({ item_id: r.item_id, stored: s.qty, recomputed: M.toDb(r.qty) });
    }
    for (const d of all(`SELECT id FROM docs`)) { recomputeDoc(d.id); out.docs += 1; }
    const acc = accountBalances().filter((a) => a.balance < 0n).map((a) => ({ account: a.name, balance: M.toDb(a.balance) }));
    return { ...out, negative_accounts: acc, message: out.mismatches.length ? 'برخی موجودی‌ها اصلاح و بازسازی شد.' : 'همه‌چیز سازگار است.' };
  },

  /* ---------- ذرات CRUD عمومی ---------- */
  ...Object.fromEntries(Object.keys(RESOURCES).flatMap((r) => [
    [`GET /api/${r}`, (ctx) => ({ rows: RESOURCES[r].list(ctx) })],
    [`GET /api/${r}/:id`, (ctx) => { const cfg = RESOURCES[r]; return cfg.get ? cfg.get(+ctx.params.id) : getResourceRow(r, +ctx.params.id); }],
    [`POST /api/${r}`, (ctx) => ({ row: upsert(r, ctx.body || {}) })],
    [`PUT /api/${r}/:id`, (ctx) => ({ row: upsert(r, ctx.body || {}, r === 'currencies' ? str(ctx.body.code, 8).toUpperCase() : +ctx.params.id) })],
    [`DELETE /api/${r}/:id`, (ctx) => {
      const cfg = RESOURCES[r];
      const pk = cfg.pk || 'id';
      const id = pk === 'code' ? str(ctx.params.id, 8).toUpperCase() : +ctx.params.id;
      cfg.beforeDelete?.(id);
      run(`DELETE FROM ${cfg.table} WHERE ${pk}=?`, [id]);
      audit(r, typeof id === 'number' ? id : null, 'حذف', String(id));
      return { ok: true };
    }],
  ])),
};

/* ============================== پیوست‌ها ============================== */
function saveUpload(body) {
  const data = str(body.data, 6_000_000);
  const m = data.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) throw new ApiError('فایل خوانا نیست. دوباره تلاش کنید یا تصویر کوچک‌تری انتخاب کنید.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4_000_000) throw new ApiError('حجم فایل نباید بیشتر از ۴ مگابایت باشد.');
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' })[m[1]] || 'bin';
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { name: str(body.filename, 160) || name, mime: m[1], size: buf.length, path: `/files/${name}` };
}

/* ============================== پشتیبان‌گیری ============================== */
const TABLES = ['currencies', 'rates', 'parties', 'accounts', 'methods', 'categories', 'items', 'stock', 'stock_moves', 'docs', 'doc_items', 'tx', 'ledger', 'attachments', 'audit', 'counters'];
function exportData() {
  const dump = { app: 'hesab', version: VERSION, exported_at: new Date().toISOString(), settings: getSettings(), tables: {} };
  for (const t of TABLES) dump.tables[t] = all(`SELECT * FROM ${t}`);
  return dump;
}
function importData(body) {
  if (!body || !body.tables) throw new ApiError('فایل پشتیبان خوانا نیست. همان فایلی که برنامه خودش ساخته را انتخاب کنید.');
  if (str(body.confirm, 20) !== 'بازیابی') throw new ApiError('برای بازیابی، در پنجرهٔ تأیید عبارت «بازیابی» را وارد کنید.', 409);
  return inTxSafe(() => {
    for (const t of [...TABLES].reverse()) run(`DELETE FROM ${t}`);
    const colsFor = (rows) => (rows.length ? Object.keys(rows[0]) : []);
    for (const t of TABLES) {
      const rows = body.tables[t] || [];
      const valid = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
      const cols = colsFor(rows).filter((c) => valid.has(c));
      if (!cols.length) continue;
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const r of rows) stmt.run(cols.map((c) => (r[c] === undefined ? null : typeof r[c] === 'number' ? String(r[c]) : r[c])));
    }
    if (body.settings) saveSettings(body.settings);
    rebuildStock();
    for (const d of all(`SELECT id FROM docs`)) recomputeDoc(d.id);
    audit('data', null, 'بازیابی پشتیبان', `${rowsCount(body)} رکورد`);
    return { ok: true, message: 'داده‌ها بازیابی شد.' };
  });
}
const rowsCount = (b) => Object.values(b.tables || {}).reduce((t, r) => t + (r?.length || 0), 0);
function inTxSafe(fn) { return db.transaction(fn)(); }

/* ============================== CSV ============================== */
export function toCsv(cols, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')).join('\n');
  return '\uFEFF' + head + '\n' + body;
}

/** تبدیل پاسخ: BigInt → رشته (میکرو) تا در مرورگر دقیق بماند */
export function serialize(value) {
  return JSON.stringify(value, (k, v) => {
    if (typeof v === 'bigint') return v.toString();
    return v;
  });
}

/* ============================== چاپ ============================== */
const st = () => getSettings();
function fmtDate(iso) { return F.fmtDate(iso, st()); }
function money(microStr, code) { return F.fmtMoney(M.fromDb(microStr), code, st()); }

export function printDocHtml(id) {
  const doc = getDoc(+id);
  if (!doc) return '<h1 style="text-align:center;padding:40px">سند پیدا نشد</h1>';
  const s = st();
  const b = s.business;
  const rows = (doc.items || []).map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.name)}${it.item_code ? `<span class="sub">${esc(it.item_code)}</span>` : ''}</td>
      <td class="c">${F.fmtQty(M.fromDb(it.qty), s)}</td>
      <td class="c">${esc(it.unit || '')}</td>
      <td class="e">${money(it.unit_price, doc.currency)}</td>
      <td class="e">${M.fromDb(it.discount) > 0n ? money(it.discount, doc.currency) : '—'}</td>
      <td class="e b">${money(it.line_total, doc.currency)}</td>
    </tr>`).join('');
  const pays = (doc.payments || []).length ? (doc.payments || []).map((p) =>
    `<tr><td class="c">${fmtDate(p.date)}</td><td>${esc(p.title || (p.type === 'receipt' ? 'دریافت' : 'پرداخت'))}</td><td class="e">${money(p.amount, p.currency)}</td><td class="c">${esc(p.method_name || '—')}</td></tr>`).join('') : '';
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${doc.no} — ${esc(b.name)}</title>
<style>${printCss(b.paper)}</style></head><body>
<div class="sheet">
  <header class="h">
    <div class="brand">
      ${b.show_logo && b.logo ? `<img src="${b.logo}" alt="">` : ''}
      <div><h1>${esc(b.name)}</h1>${b.tagline ? `<p class="tg">${esc(b.tagline)}</p>` : ''}
      <p class="small">${[b.address, b.phone && `تلفن: ${esc(b.phone)}`, b.email && `ایمیل: ${esc(b.email)}`].filter(Boolean).join(' • ')}</p></div>
    </div>
    <div class="title">
      <h2>${doc.type === 'sale' ? 'فاکتور فروش' : 'سند خرید'}</h2>
      <p class="mono">شماره: ${esc(doc.no)}</p>
      <p>تاریخ: ${fmtDate(doc.date)}${doc.due_date ? ` — سررسید: ${fmtDate(doc.due_date)}` : ''}</p>
      <p>وضعیت: ${doc.status_label}</p>
    </div>
  </header>
  <section class="who">
    <div><span>${doc.type === 'sale' ? 'مشتری' : 'تأمین‌کننده'}</span><strong>${esc(doc.party?.name || doc.party_name || '—')}</strong>
      <p class="small">${[doc.party?.phone || doc.party_phone, doc.party?.address].filter(Boolean).map(esc).join(' — ')}</p></div>
    <div><span>ارز</span><strong>${doc.currency}${doc.currency !== 'AFN' ? ` (نرخ ${M.fmt(M.fromDb(doc.rate), { decimals: 4, group: false })})` : ''}</strong>
      <p class="small">روش: ${esc(get(`SELECT name FROM methods WHERE id=?`, [doc.method_id])?.name || '—')}</p></div>
  </section>
  <table class="items">
    <thead><tr><th class="c">ردیف</th><th>شرح کالا یا خدمت</th><th class="c">تعداد</th><th class="c">واحد</th><th class="e">بهای واحد</th><th class="e">تخفیف</th><th class="e">مبلغ</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="c">موردی ثبت نشده است</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div class="t"><span>جمع اقلام</span><b>${money(doc.subtotal, doc.currency)}</b></div>
    ${M.fromDb(doc.discount) > 0n ? `<div class="t"><span>تخفیف</span><b>${money(doc.discount, doc.currency)}</b></div>` : ''}
    ${M.fromDb(doc.tax) > 0n ? `<div class="t"><span>مالیات</span><b>${money(doc.tax, doc.currency)}</b></div>` : ''}
    ${M.fromDb(doc.fee) > 0n ? `<div class="t"><span>هزینه‌های جانبی</span><b>${money(doc.fee, doc.currency)}</b></div>` : ''}
    <div class="t grand"><span>مبلغ کل</span><b>${money(doc.total, doc.currency)}</b></div>
    ${doc.currency !== 'AFN' ? `<div class="t small2"><span>معادل افغانی (نرخ سند)</span><b>${money(doc.base_total, 'AFN')}</b></div>` : ''}
    <div class="t"><span>پرداخت‌شده</span><b>${money(doc.paid, doc.currency)}</b></div>
    <div class="t remain"><span>مانده</span><b>${money(doc.balance, doc.currency)}</b></div>
  </div>
  ${pays ? `<h3>دریافت‌ها/پرداخت‌ها</h3><table class="items"><thead><tr><th class="c">تاریخ</th><th>شرح</th><th class="e">مبلغ</th><th class="c">روش</th></tr></thead><tbody>${pays}</tbody></table>` : ''}
  ${doc.note ? `<p class="note">یادداشت: ${esc(doc.note)}</p>` : ''}
  <div class="sign"><div>امضای فروشنده</div><div>امضای خریدار</div></div>
  ${b.footer ? `<footer>${esc(b.footer)}</footer>` : ''}
  ${b.invoice_note ? `<p class="small ct">${esc(b.invoice_note)}</p>` : ''}
  <div class="no-print"><button onclick="window.print()">چاپ</button> <button onclick="history.back()">بازگشت</button></div>
</div>
</body></html>`;
}

function printCss(paper = 'a4') {
  const size = paper === 'a5' ? '@page { size: A5; margin: 8mm } .sheet{max-width:140mm}' : paper === '80mm' ? '@page { size: 80mm auto; margin: 3mm } .sheet{max-width:74mm;font-size:11px}' : '@page { size: A4; margin: 12mm } .sheet{max-width:186mm}';
  return `*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:13px/1.7 Vazirmatn,Tahoma,'Segoe UI',sans-serif;padding:14px}
${size}.sheet{margin:0 auto;background:#fff;padding:0}h1{font-size:19px;margin:0}h2{font-size:17px;margin:0 0 4px}h3{font-size:13px;margin:16px 0 6px}
.h{display:flex;justify-content:space-between;gap:14px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
.brand{display:flex;gap:10px;align-items:flex-start}.brand img{width:56px;height:56px;object-fit:contain}
.title{text-align:left;font-size:12px}.title p{margin:2px 0}
.who{display:flex;gap:18px;border:1px solid #111;padding:8px 10px;margin-bottom:12px;font-size:12px}
.who>div{flex:1}.who span{color:#555;font-size:11px;display:block}.who strong{font-size:14px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px 6px;font-size:12px;vertical-align:top}
th{background:#f1f1f1;text-align:center;font-weight:700}td.e,th.e{text-align:left}td.c,th.c{text-align:center}td.b{font-weight:700}
.sub{display:block;color:#666;font-size:10px}.totals{margin-top:10px;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.t{display:flex;gap:12px;justify-content:flex-end;width:100%;font-size:12px;padding:2px 0;border-bottom:1px dotted #ccc}
.t span{flex:1;text-align:right}.t b{min-width:120px;text-align:left}
.grand{background:#eee;font-size:14px;padding:5px 6px;border:1px solid #111}.remain b{color:#000}
.note{margin-top:10px;font-size:11px;border-top:1px dashed #999;padding-top:6px}
.sign{display:flex;justify-content:space-between;margin-top:26px;font-size:11px}
.sign div{border-top:1px solid #555;padding-top:4px;width:38%;text-align:center}
footer{margin-top:14px;border-top:1px solid #111;padding-top:6px;font-size:11px;text-align:center}
.small,.small2{font-size:11px;color:#555}.ct{text-align:center}.mono{font-variant-numeric:tabular-nums}
.no-print{margin-top:16px;text-align:center}@media print{.no-print{display:none}body{padding:0}}
button{font:inherit;padding:6px 14px;margin:0 4px;cursor:pointer}`;
}

/** چاپ یک گزارش */
export function printReportHtml(name, q) {
  const s = st();
  const r = rangeOf(q);
  const data = buildReport(name, q);
  const cols = data.cols || [];
  const body = (data.rows || []).map((row) => `<tr>${cols.map((c) => `<td class="${c.align || ''}">${esc(typeof c.value === 'function' ? c.value(row) : (row[c.key] ?? ''))}</td>`).join('')}</tr>`).join('');
  const totalsBlock = (data.totals_list || []).map(([label, val]) => `<div class="t"><span>${esc(label)}</span><b>${esc(val)}</b></div>`).join('');
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.title)} — ${esc(s.business.name)}</title><style>${printCss(s.business.paper)}</style></head><body>
<div class="sheet"><header class="h"><div class="brand"><div><h1>${esc(s.business.name)}</h1>
<p class="small">${[s.business.address, s.business.phone && `تلفن: ${s.business.phone}`].filter(Boolean).join(' • ')}</p></div></div>
<div class="title"><h2>${esc(data.title)}</h2><p>بازهٔ گزارش: ${fmtDate(r.from)} تا ${fmtDate(r.to)}</p><p>تاریخ چاپ: ${fmtDate(J.todayIso())}</p></div></header>
${totalsBlock ? `<div class="totals">${totalsBlock}</div>` : ''}
<table><thead><tr>${cols.map((c) => `<th class="${c.align || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${cols.length}" class="c">داده‌ای در این بازه نیست</td></tr>`}</tbody></table>
<p class="small">تهیه‌شده با برنامهٔ حسابداری — ${esc(data.note || '')}</p>
<div class="no-print"><button onclick="window.print()">چاپ</button> <button onclick="history.back()">بازگشت</button></div></div></body></html>`;
}

function buildReport(name, q) {
  const r = rangeOf(q);
  const s = st();
  const m = (v, cur) => money(typeof v === 'string' || typeof v === 'bigint' ? String(v) : '0', cur);
  switch (name) {
    case 'sales':
    case 'purchases': {
      const rep = reportSales(r.from, r.to, { type: name === 'sales' ? 'sale' : 'purchase', party_id: q.party, currency: q.currency });
      return {
        title: name === 'sales' ? 'گزارش فروش' : 'گزارش خرید',
        cols: [{ label: 'شماره', key: 'no' }, { label: 'تاریخ', value: (d) => fmtDate(d.date) }, { label: name === 'sales' ? 'مشتری' : 'تأمین‌کننده', key: 'party_name' },
          { label: 'مبلغ کل', align: 'e', value: (d) => m(d.total, d.currency) }, { label: 'پرداخت', align: 'e', value: (d) => m(d.paid, d.currency) },
          { label: 'مانده', align: 'e', value: (d) => m(d.balance, d.currency) }, { label: 'ارز', key: 'currency', align: 'c' }, { label: 'وضعیت', key: 'status', align: 'c' }],
        rows: rep.rows,
        totals_list: [['تعداد سند', String(rep.totals.count)], ['جمع کل (هر ارز جدا)', rep.by_currency.map((c) => `${c.currency} ${money(c.amount, c.currency)}`).join(' / ') || '—'],
          ['معادل افغانی', money(rep.totals.base_total, 'AFN')], ['ماندهٔ وصول‌نشده', money(rep.totals.balance, rep.rows[0]?.currency || 'AFN')]],
        note: 'سود و زیان بر پایهٔ مبالغ ثبت‌شده در همین اسناد محاسبه شده است.',
      };
    }
    case 'pl': {
      const rep = reportPL(r.from, r.to);
      return {
        title: 'گزارش سود و زیان',
        cols: [{ label: 'بخش', key: 'k' }, { label: 'معادل افغانی', align: 'e', value: (x) => money(x.v, 'AFN') }],
        rows: [
          { k: 'فروش (درآمد)', v: rep.revenue.base }, { k: 'بهای تمام‌شدهٔ کالای فروخته‌شده', v: -rep.cogs.base },
          { k: 'سود ناخالص', v: rep.gross.base }, { k: 'هزینه‌ها (و درآمد دیگر)', v: -rep.expenses.base },
          { k: 'سود یا زیان خالص', v: rep.net.base },
        ],
        totals_list: [['سود خالص (افغانی)', money(rep.net.base, 'AFN')], ['روش ارزش‌گذاری', 'میانگین موزون'], ['محدوده', `${fmtDate(r.from)} تا ${fmtDate(r.to)}`]],
        note: 'برداشت و آوردهٔ صاحب سرمایه در این گزارش نیامده است، چون سود یا هزینه نیست.',
      };
    }
    case 'expenses': {
      const rep = reportExpenses(r.from, r.to);
      return {
        title: 'گزارش هزینه‌ها',
        cols: [{ label: 'تاریخ', value: (x) => fmtDate(x.date) }, { label: 'دسته', key: 'category_name' }, { label: 'شرح', key: 'title' },
          { label: 'مبلغ', align: 'e', value: (x) => money(x.amount, x.currency) }, { label: 'افغانی', align: 'e', value: (x) => money(x.base_amount, 'AFN') },
          { label: 'حساب', key: 'account_name' }],
        rows: rep.rows,
        totals_list: [['تعداد', String(rep.rows.length)], ['جمع هزینه‌ها (به تفکیک ارز)', rep.by_currency.map((c) => `${c.currency} ${money(c.amount, c.currency)}`).join(' / ') || '—'],
          ['معادل افغانی', money(rep.totals.amount, 'AFN')]],
      };
    }
    case 'receipts':
    case 'payments': {
      const rep = reportPayments(r.from, r.to, name === 'receipts' ? 'in' : 'out');
      return {
        title: name === 'receipts' ? 'گزارش دریافت‌ها' : 'گزارش پرداخت‌ها',
        cols: [{ label: 'تاریخ', value: (x) => fmtDate(x.date) }, { label: 'طرف حساب', key: 'party_name' }, { label: 'سند', key: 'doc_no' },
          { label: 'مبلغ', align: 'e', value: (x) => money(x.amount, x.currency) }, { label: 'افغانی', align: 'e', value: (x) => money(x.base_amount, 'AFN') },
          { label: 'حساب', key: 'account_name' }],
        rows: rep.rows, totals_list: [['جمع', money(rep.totals.amount, rep.rows[0]?.currency || 'AFN')], ['معادل افغانی', money(rep.totals.base, 'AFN')]],
      };
    }
    case 'receivables': {
      const rows = totalsByParty(q.kind === 'supplier' ? 'supplier' : 'customer');
      return {
        title: q.kind === 'supplier' ? 'بدهی به تأمین‌کنندگان' : 'طلب از مشتریان',
        cols: [{ label: 'نام', key: 'name' }, { label: 'تلفن', key: 'phone' }, { label: 'مانده', align: 'e', value: (x) => money(x.bal_micro, x.currency) },
          { label: 'افغانی', align: 'e', value: (x) => money(x.base, 'AFN') }, { label: 'آخرین معامله', value: (x) => fmtDate(x.last) }],
        rows, totals_list: [['جمع معادل افغانی', money(M.sum(rows.map((x) => x.base)), 'AFN')]],
      };
    }
    case 'accounts': {
      const rep = reportAccounts(r.from, r.to);
      return {
        title: 'گردش صندوق و بانک',
        cols: [{ label: 'حساب', key: 'name' }, { label: 'نوع', value: (x) => (x.kind === 'cash' ? 'صندوق' : 'بانک') }, { label: 'ارز', key: 'currency', align: 'c' },
          { label: 'اول دوره', align: 'e', value: (x) => money(x.balance_before, x.currency) }, { label: 'وارد', align: 'e', value: (x) => money(x.moved_in, x.currency) },
          { label: 'خارج', align: 'e', value: (x) => money(x.moved_out, x.currency) }, { label: 'پایان دوره', align: 'e', value: (x) => money(x.balance, x.currency) }],
        rows: rep, totals_list: [['ارزش کل نقدی (افغانی)', money(rep.reduce((t, a) => t + a.base, 0n), 'AFN')]],
      };
    }
    case 'capital': {
      const rep = reportCapital(r.from, r.to);
      return {
        title: 'آورده و برداشت صاحب سرمایه',
        cols: [{ label: 'تاریخ', value: (x) => fmtDate(x.date) }, { label: 'نوع', value: (x) => (x.type === 'contribution' ? 'آورده' : 'برداشت') },
          { label: 'مبلغ', align: 'e', value: (x) => money(x.amount, x.currency) }, { label: 'افغانی', align: 'e', value: (x) => money(x.base_amount, 'AFN') },
          { label: 'حساب', key: 'account_name' }, { label: 'توضیح', key: 'note' }],
        rows: rep.rows,
        totals_list: [['جمع آورده', money(rep.contribution.base, 'AFN')], ['جمع برداشت', money(rep.drawing.base, 'AFN')], ['خالص سرمایه', money(rep.net, 'AFN')]],
        note: 'این مبالغ در سود و زیان حساب نمی‌شوند.',
      };
    }
    case 'inventory': {
      const rep = reportInventory(r.from, r.to);
      return {
        title: 'گردش گدام',
        cols: [{ label: 'تاریخ', value: (x) => fmtDate(x.date) }, { label: 'کالا', key: 'name' }, { label: 'نوع', key: 'kind', align: 'c' },
          { label: 'مقدار', align: 'e', value: (x) => F.fmtQty(x.signed, s) }, { label: 'بهای واحد', align: 'e', value: (x) => money(x.cost, 'AFN') },
          { label: 'سند', key: 'reason' }],
        rows: rep.moves, totals_list: [['تعداد حرکات', String(rep.moves.length)]],
      };
    }
    case 'stock': {
      const rep = reportStockValue();
      return {
        title: 'موجودی و ارزش گدام',
        cols: [{ label: 'کالا', key: 'name' }, { label: 'کد', key: 'code' }, { label: 'موجودی', align: 'e', value: (x) => F.fmtQty(x.qty, s) + ' ' + (x.unit || '') },
          { label: 'میانگین بها', align: 'e', value: (x) => money(x.avg, 'AFN') }, { label: 'ارزش', align: 'e', value: (x) => money(x.value, 'AFN') },
          { label: 'حداقل', align: 'e', value: (x) => F.fmtQty(M.fromDb(x.min_qty), s) }],
        rows: rep.items, totals_list: [['ارزش موجودی (افغانی)', money(rep.totals.value, 'AFN')], ['قیمت فروش', money(rep.totals.retail, 'AFN')], ['کالاهای کم', String(rep.totals.low)]],
        note: 'روش ارزش‌گذاری: میانگین موزون.',
      };
    }
    case 'currency': {
      const rep = reportCurrency();
      return {
        title: 'گزارش چندارزی',
        cols: [{ label: 'ارز', key: 'currency', align: 'c' }, { label: 'نقدی', align: 'e', value: (x) => money(x.cash, x.currency) },
          { label: 'طلب', align: 'e', value: (x) => money(x.receivable, x.currency) }, { label: 'بدهی', align: 'e', value: (x) => money(x.payable, x.currency) },
          { label: 'نرخ امروز', align: 'e', value: (x) => M.fmt(x.rate_today, { decimals: 4, group: false }) },
          { label: 'معادل افغانی', align: 'e', value: (x) => money(x.cash_base, 'AFN') }],
        rows: rep.rows,
        totals_list: [['نقدی (افغانی)', money(rep.totals.cash_base, 'AFN')], ['طلب (افغانی)', money(rep.totals.receivable_base, 'AFN')],
          ['بدهی (افغانی)', money(rep.totals.payable_base, 'AFN')], ['ارزش گدام (افغانی)', money(rep.totals.stock, 'AFN')]],
        note: 'مبالغ هر ارز جدا جمع شده‌اند. معادل افغانیِ اسناد با نرخ همان سند و معادلِ موجودی نقدی با نرخ امروز است.',
      };
    }
    default:
      throw new ApiError('گزارش ناشناخته است.', 404);
  }
}

export function csvFor(name, q) {
  const data = buildReport(name, q);
  const rows = (data.rows || []).map((row) => Object.fromEntries(data.cols.map((c, i) => ['c' + i, typeof c.value === 'function' ? c.value(row) : (row[c.key] ?? '')])));
  return { filename: `${name}-${(q.from || 'all')}-${(q.to || 'all')}.csv`, csv: toCsv(data.cols.map((c, i) => ({ label: c.label, key: 'c' + i })), rows), title: data.title };
}

export const REPORT_NAMES = ['sales', 'purchases', 'pl', 'expenses', 'receipts', 'payments', 'receivables', 'accounts', 'capital', 'inventory', 'stock', 'currency'];
function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export { esc, buildReport };
