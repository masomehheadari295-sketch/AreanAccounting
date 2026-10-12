import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp-shapes');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const PORT = Number(process.env.TEST_PORT || 4799);
const B = `http://127.0.0.1:${PORT}`;
const child = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HESAB_DB: path.join(TMP, 's.db'), HESAB_DATA: TMP }, stdio: ['ignore', 'pipe', 'pipe'] });
const up = async () => { const t0 = Date.now(); while (Date.now() - t0 < 15000) { try { if ((await fetch(B + '/api/health')).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 120)); } return false; };
if (!await up()) { console.log('server down'); process.exit(1); }
const j = async (p, opt) => { const r = await fetch(B + p, opt); const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 160); } };
await j('/api/demo/seed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

const shape = (v, d = 0) => {
  if (Array.isArray(v)) return v.length ? '[' + shape(v[0], d + 1) + ']' : '[]';
  if (v && typeof v === 'object') {
    if (d > 1) return '{…}';
    return '{' + Object.entries(v).map(([k, x]) => `${k}:${shape(x, d + 1)}`).join(',') + '}';
  }
  return typeof v === 'string' ? JSON.stringify(v.slice(0, 12)) : String(v);
};
const eps = process.argv[2] ? [process.argv[2]] : [
  '/api/bootstrap', '/api/accounts', '/api/tx?limit=2', '/api/rates', '/api/reports/pl', '/api/reports/sales',
  '/api/reports/expenses', '/api/reports/receipts', '/api/reports/payments', '/api/reports/accounts',
  '/api/reports/capital', '/api/reports/inventory', '/api/reports/stock', '/api/reports/currency',
  '/api/reports/receivables', '/api/reports/ledger?from=2026-01-01&to=2026-12-31', '/api/search?q=a',
  '/api/inventory', '/api/items?limit=2', '/api/docs?limit=2', '/api/docs/1', '/api/currencies', '/api/methods',
  '/api/categories', '/api/parties?kind=all', '/api/dashboard',
];
for (const e of eps) console.log('\n###', e, '\n', shape(await j(e)));
for (const p of ['/print/doc/1', '/print/report/pl?from=2026-01-01&to=2026-12-31', '/api/csv/sales?from=2026-01-01&to=2026-12-31', '/api/backup.sqlite']) {
  const r = await fetch(B + p); console.log('###', p, r.status, r.headers.get('content-type'));
}
child.kill(); fs.rmSync(TMP, { recursive: true, force: true });
process.exit(0);
