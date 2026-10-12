/**
 * db.js — پایگاه دادهٔ SQLite (better-sqlite3) با حالت WAL.
 * همهٔ داده‌ها روی دیسک ذخیره می‌شوند؛ هیچ عدد نمایشی در برنامه hardcode نشده است.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import * as J from '../public/js/lib/jalali.js';
import { mergeSettings } from '../public/js/lib/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.HESAB_DATA || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = process.env.HESAB_DB || path.join(DATA_DIR, 'hesab.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 4000');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, symbol TEXT DEFAULT '',
  decimals INTEGER DEFAULT 2, rate TEXT DEFAULT '1000000',
  active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, date TEXT NOT NULL,
  rate TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (code, date)
);

CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'customer'
    CHECK (kind IN ('customer','supplier','both')),
  name TEXT NOT NULL, contact TEXT DEFAULT '', phone TEXT DEFAULT '',
  email TEXT DEFAULT '', address TEXT DEFAULT '', note TEXT DEFAULT '',
  tax_no TEXT DEFAULT '', active INTEGER DEFAULT 1, is_company INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'cash' CHECK (kind IN ('cash','bank')),
  name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'AFN', opening TEXT DEFAULT '0',
  bank_name TEXT DEFAULT '', account_no TEXT DEFAULT '', card_no TEXT DEFAULT '',
  note TEXT DEFAULT '', active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT DEFAULT 'other',
  account_id INTEGER, note TEXT DEFAULT '', active INTEGER DEFAULT 1, sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'item' CHECK (kind IN ('item','expense')),
  name TEXT NOT NULL, note TEXT DEFAULT '', sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unit TEXT DEFAULT 'عدد', kind TEXT DEFAULT 'goods' CHECK (kind IN ('goods','material','service')),
  buy_price TEXT DEFAULT '0', sell_price TEXT DEFAULT '0',
  track_stock INTEGER DEFAULT 1, min_qty TEXT DEFAULT '0',
  image TEXT DEFAULT '', note TEXT DEFAULT '', active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

-- موجودی جاری؛ از جدول گردش (stock_moves) بازسازی‌شدنی است
CREATE TABLE IF NOT EXISTS stock (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  qty TEXT DEFAULT '0', avg_cost TEXT DEFAULT '0', value TEXT DEFAULT '0', updated_at TEXT
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('in','out','return','waste','adjust','cancel_in','cancel_out')),
  qty TEXT NOT NULL,               -- همیشه مثبت؛ علامت از kind مشخص می‌شود
  cost TEXT DEFAULT '0',           -- بها به میکرو (برای هر واحد)
  doc_type TEXT, doc_id INTEGER,   -- سند متصل: sale | purchase | manual
  date TEXT NOT NULL, reason TEXT DEFAULT '', note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('sale','purchase')),
  no TEXT NOT NULL UNIQUE,
  party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
  party_name TEXT DEFAULT '', party_phone TEXT DEFAULT '',
  date TEXT NOT NULL, due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'AFN', rate TEXT NOT NULL DEFAULT '1000000',
  subtotal TEXT DEFAULT '0', discount TEXT DEFAULT '0', tax TEXT DEFAULT '0',
  fee TEXT DEFAULT '0', total TEXT DEFAULT '0', base_total TEXT DEFAULT '0',
  paid TEXT DEFAULT '0', balance TEXT DEFAULT '0',
  cost TEXT DEFAULT '0',            -- بها‌ی تمام‌شده (برای فروش)
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  method_id INTEGER, warehouse TEXT DEFAULT '',
  note TEXT DEFAULT '', attachment TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  cancelled_at TEXT, cancel_reason TEXT DEFAULT '', origin TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS doc_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  row_no INTEGER DEFAULT 1, item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  name TEXT NOT NULL, unit TEXT DEFAULT '', qty TEXT NOT NULL DEFAULT '0',
  unit_price TEXT NOT NULL DEFAULT '0', discount TEXT DEFAULT '0', line_total TEXT DEFAULT '0',
  cost TEXT DEFAULT '0', note TEXT DEFAULT '', update_stock INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('receipt','payment','expense','other_income','drawing','contribution','transfer','refund')),
  date TEXT NOT NULL, amount TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'AFN', rate TEXT NOT NULL DEFAULT '1000000',
  base_amount TEXT DEFAULT '0',
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  to_currency TEXT, to_amount TEXT,
  fee TEXT DEFAULT '0',
  party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
  doc_id INTEGER REFERENCES docs(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  method_id INTEGER, title TEXT DEFAULT '', note TEXT DEFAULT '', attachment TEXT DEFAULT '',
  void INTEGER DEFAULT 0, void_reason TEXT DEFAULT '', void_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tx_id INTEGER REFERENCES tx(id) ON DELETE CASCADE,
  doc_id INTEGER REFERENCES docs(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  currency TEXT NOT NULL, amount TEXT NOT NULL, date TEXT NOT NULL, memo TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner_type TEXT NOT NULL, owner_id INTEGER,
  name TEXT NOT NULL, mime TEXT, size INTEGER, path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT,
  detail TEXT DEFAULT '', who TEXT DEFAULT 'کاربر', date TEXT, created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER DEFAULT 0);

CREATE INDEX IF NOT EXISTS ix_docs_date ON docs (date);
CREATE INDEX IF NOT EXISTS ix_docs_type ON docs (type, status);
CREATE INDEX IF NOT EXISTS ix_tx_date ON tx (date, type);
CREATE INDEX IF NOT EXISTS ix_tx_doc ON tx (doc_id);
CREATE INDEX IF NOT EXISTS ix_moves_item ON stock_moves (item_id, date);
CREATE INDEX IF NOT EXISTS ix_ledger_acc ON ledger (account_id, date);
CREATE INDEX IF NOT EXISTS ix_audit_ent ON audit (entity, entity_id);
`;

db.exec(SCHEMA);

/* ---------- تنظیمات ---------- */
export function getSettings() {
  const row = db.prepare(`SELECT value FROM meta WHERE key='settings'`).get();
  const parsed = row ? JSON.parse(row.value) : {};
  return mergeSettings(parsed);
}
export function saveSettings(patch) {
  const next = mergeSettings({ ...getSettings(), ...(patch || {}) });
  if (patch?.business) next.business = { ...getSettings().business, ...patch.business };
  db.prepare(`INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(JSON.stringify(next));
  return next;
}
export function getMeta(key, def = null) {
  const row = db.prepare(`SELECT value FROM meta WHERE key=?`).get(key);
  return row ? JSON.parse(row.value) : def;
}
export function setMeta(key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(key, JSON.stringify(value));
}

/* ---------- کمک‌کننده‌ها ---------- */
export function all(sql, params = []) {
  return db.prepare(sql).all(params);
}
export function get(sql, params = []) {
  return db.prepare(sql).get(params);
}
export function run(sql, params = []) {
  return db.prepare(sql).run(params);
}
export function tx(fn) {
  const t = db.transaction(fn);
  return t();
}
export function audit(entity, entityId, action, detail = '', date = null) {
  db.prepare(`INSERT INTO audit (entity, entity_id, action, detail, date) VALUES (?,?,?,?,?)`)
    .run(entity, entityId, action, typeof detail === 'string' ? detail : JSON.stringify(detail), date);
}

/** شمارندهٔ شمارهٔ سند، بر پایهٔ سال جلالی */
export function nextDocNo(type, dateIso) {
  const st = getSettings();
  const prefix = (type === 'sale' ? st.doc_prefix_sale : st.doc_prefix_purchase) || (type === 'sale' ? 'INV' : 'PUR');
  const j = J.jalaliFromIso(dateIso);
  const key = `${type}:${j.jy}`;
  db.prepare(`INSERT INTO counters (key, value) VALUES (?, 0) ON CONFLICT(key) DO NOTHING`).run(key);
  db.prepare(`UPDATE counters SET value = value + 1 WHERE key=?`).run(key);
  const n = db.prepare(`SELECT value FROM counters WHERE key=?`).get(key).value;
  const pad = String(n).padStart(4, '0');
  return `${prefix}-${j.jy}-${pad}`;
}


/* ---------- مقدارهای اولیه (فقط ساختار، نه دادهٔ مالی) ---------- */
export function ensureDefaults() {
  const cur = db.prepare(`SELECT COUNT(*) c FROM currencies`).get().c;
  if (!cur) {
    const ins = db.prepare(`INSERT INTO currencies (code,name,symbol,decimals,rate,active,sort) VALUES (?,?,?,?,?,?,?)`);
    [
      ['AFN', 'افغانی', '؋', 2, '1000000', 1, 0],
      ['USD', 'دالر امریکایی', '$', 2, '70000000', 1, 1],
      ['EUR', 'یورو', '€', 2, '76000000', 1, 2],
    ].forEach((r) => ins.run(...r));
  }
  const m = db.prepare(`SELECT COUNT(*) c FROM methods`).get().c;
  if (!m) {
    const ins = db.prepare(`INSERT INTO methods (name,kind,sort) VALUES (?,?,?)`);
    [['نقدی', 'cash', 0], ['کارت/بانکی', 'bank', 1], ['حواله', 'other', 2]].forEach((r) => ins.run(...r));
  }
  const c = db.prepare(`SELECT COUNT(*) c FROM categories WHERE kind='expense'`).get().c;
  if (!c) {
    const ins = db.prepare(`INSERT INTO categories (kind,name,sort) VALUES ('expense',?,?)`);
    ['کرایهٔ دکان', 'معاش کارکن', 'برق و آب', 'ترانسپورت', 'متفرقه'].forEach((n, i) => ins.run(n, i));
  }
  if (!getMeta('initialized')) setMeta('initialized', { at: new Date().toISOString(), version: 1 });
}
ensureDefaults();

/** خلاصهٔ سلامت داده‌ها برای عیب‌یابی */
export function stats() {
  const t = (sql) => db.prepare(sql).get().c;
  return {
    docs: t(`SELECT COUNT(*) c FROM docs`),
    sales: t(`SELECT COUNT(*) c FROM docs WHERE type='sale'`),
    purchases: t(`SELECT COUNT(*) c FROM docs WHERE type='purchase'`),
    items: t(`SELECT COUNT(*) c FROM items`),
    parties: t(`SELECT COUNT(*) c FROM parties`),
    tx: t(`SELECT COUNT(*) c FROM tx`),
    moves: t(`SELECT COUNT(*) c FROM stock_moves`),
    db_bytes: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0,
  };
}
