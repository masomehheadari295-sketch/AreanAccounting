/**
 * index.js — سرور HTTP بدون وابستگی خارجی (فقط SQLite برای داده).
 * کارها: سرو کردن فایل‌های ثابت، API، پیوست‌ها، صفحهٔ چاپ و پشتیبان‌گیری.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, ROOT, UPLOAD_DIR, DB_PATH, stats } from './db.js';
import { routes, serialize, ApiError, printDocHtml, printReportHtml, csvFor, REPORT_NAMES } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 16 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8',
};

/* مسیرها را یک‌بار به الگوی منظم تبدیل می‌کنیم */
const COMPILED = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const names = [];
  const re = new RegExp('^' + pattern.replace(/\/+$/, '').split('/').map((seg) => {
    if (seg.startsWith(':')) { names.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/') + '/?$');
  return { method, re, names, handler, pattern };
});

function findRoute(method, pathname) {
  for (const r of COMPILED) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (m) {
      const params = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { r, params };
    }
  }
  return null;
}

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { reject(new ApiError('حجم ارسالی خیلی زیاد است. تصویر کوچک‌تری انتخاب کنید.', 413)); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); } catch { reject(new ApiError('دادهٔ ارسالی خوانا نبود. دوباره تلاش کنید.', 400)); }
  });
  req.on('error', reject);
});

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
};
const sendJson = (res, status, obj) => send(res, status, serialize(obj), {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
});

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname.replace(/^\/+/, ''));
  if (rel === '') rel = 'index.html';
  const full = path.join(PUBLIC, rel);
  if (!full.startsWith(PUBLIC)) return send(res, 403, 'دسترسی مجاز نیست');
  let st;
  try { st = await fsp.stat(full); } catch {
    // مسیرهای SPA که فایلشان نیست → index.html
    if (!path.extname(rel)) return streamFile(res, path.join(PUBLIC, 'index.html'), 'text/html; charset=utf-8', 'no-cache');
    return send(res, 404, 'یافت نشد');
  }
  if (st.isDirectory()) return streamFile(res, path.join(full, 'index.html'), 'text/html; charset=utf-8', 'no-cache');
  const ext = path.extname(full).toLowerCase();
  const cache = ext === '.html' || rel === 'sw.js' ? 'no-cache' : 'public, max-age=86400';
  return streamFile(res, full, MIME[ext] || 'application/octet-stream', cache);
}
async function streamFile(res, file, type, cache = 'no-cache') {
  try {
    const st = await fsp.stat(file);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache, ETag: `W/"${st.size}-${Number(st.mtimeMs).toString(36)}"` });
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'یافت نشد');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  try {
    if (req.method === 'OPTIONS') {
      return send(res, 204, '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    }
    /* --- صفحهٔ چاپ --- */
    if (p === '/print/doc' || p.startsWith('/print/doc/')) {
      const id = p.split('/')[3] || q.id;
      return send(res, 200, printDocHtml(id), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (p.startsWith('/print/report/')) {
      const name = p.split('/')[3];
      if (!REPORT_NAMES.includes(name)) return send(res, 404, 'گزارش پیدا نشد');
      return send(res, 200, printReportHtml(name, q), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    /* --- فایل‌های پیوست --- */
    if (p.startsWith('/files/')) {
      const name = path.basename(p);
      const file = path.join(UPLOAD_DIR, name);
      if (!fs.existsSync(file)) return send(res, 404, 'فایل پیدا نشد');
      return streamFile(res, file, MIME[path.extname(name).toLowerCase()] || 'application/octet-stream', 'public, max-age=604800');
    }
    /* --- CSV --- */
    if (p.startsWith('/api/csv/')) {
      const name = p.split('/')[3];
      if (!REPORT_NAMES.includes(name)) return send(res, 404, 'گزارش پیدا نشد');
      const { csv, filename } = csvFor(name, q);
      return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}` });
    }
    /* --- پشتیبان SQLite --- */
    if (p === '/api/backup.sqlite') {
      const tmp = path.join(ROOT, 'backups', `hesab-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      await db.backup(tmp);
      const buf = await fsp.readFile(tmp);
      await fsp.unlink(tmp).catch(() => {});
      res.writeHead(200, { 'Content-Type': 'application/x-sqlite3', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename="hesab-backup-${Date.now()}.db"` });
      return res.end(buf);
    }
    /* --- API --- */
    if (p.startsWith('/api/')) {
      const found = findRoute(req.method, p);
      if (!found) return sendJson(res, 404, { error: 'مسیر API پیدا نشد.', path: p });
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
      const out = await found.r.handler({ req, res, params: found.params, query: q, q, body, url });
      if (out === undefined) return sendJson(res, 204, {});
      return sendJson(res, 200, out);
    }
    /* --- باقی مسیرها: فایل‌های ثابت --- */
    return await serveStatic(res, p);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : (e.status || 500);
    const message = e.userMessage || e.message || 'خطای ناشناخته';
    if (status >= 500) console.error('[خطا]', req.method, p, e);
    return sendJson(res, status, {
      error: message,
      code: e.code || (status >= 500 ? 'server_error' : 'bad_request'),
      field: e.field || null,
      hint: e.hint || (status >= 500 ? 'اگر مشکل ادامه داشت، از تنظیمات «پشتیبان‌گیری» یک فایل پشتیبان بگیرید و برنامه را دوباره باز کنید.' : null),
    });
  }
});

server.listen(PORT, HOST, () => {
  const s = stats();
  console.log(`\n  حساب — برنامهٔ حسابداری کسب‌وکار کوچک`);
  console.log(`  آدرس:      http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  پایگاه داده: ${DB_PATH}`);
  console.log(`  وضعیت:     ${s.docs} سند، ${s.items} کالا، ${s.tx} تراکنش\n`);
});
