/**
 * api.js — رفت‌وآمد با سرور + صف آفلاین.
 * اگر اتصال نبود، نوشتن‌ها در localStorage نگه داشته و پس از اتصال ارسال می‌شوند.
 */
const KEY = 'hesab.outbox.v1';
const listeners = new Set();
export const onNet = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (s) => listeners.forEach((f) => f(s));

let online = navigator.onLine !== false;
addEventListener('online', () => { online = true; emit('online'); flush(); });
addEventListener('offline', () => { online = false; emit('offline'); });

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (l) => localStorage.setItem(KEY, JSON.stringify(l));
export const pending = () => read().length;
export const isOnline = () => online;

async function raw(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e = new Error((data && data.error) || `خطای ${res.status}`);
    e.status = res.status; e.code = data && data.code; e.field = data && data.field; e.hint = data && data.hint;
    throw e;
  }
  return data;
}

/** GET همیشه زنده؛ نوشتن‌ها در آفلاین صف می‌شوند */
export async function get(path) {
  try { const d = await raw('GET', path); if (!online) { online = true; emit('online'); } return d; }
  catch (e) { if (online) { online = false; emit('offline'); } throw e; }
}
export async function send(method, path, body) {
  if (!online) {
    const q = read(); q.push({ id: Math.random().toString(36).slice(2), method, path, body, at: Date.now() });
    write(q);
    emit('queued');
    return { queued: true };
  }
  const d = await raw(method, path, body);
  return d;
}

export async function flush() {
  const q = read();
  if (!q.length) return { sent: 0 };
  const rest = [];
  let sent = 0;
  for (const item of q) {
    try { await raw(item.method, item.path, item.body); sent += 1; }
    catch (e) { if (e.status >= 400 && e.status < 500) { item.error = e.message; rest.push(item); } else rest.push(item); }
  }
  write(rest);
  emit(rest.length ? 'partial' : 'flushed');
  return { sent, left: rest.length, failed: rest };
}

export const failedQueue = () => read().filter((x) => x.error);
export const clearQueue = () => write([]);
export const api = {
  get,
  post: (p, b) => send('POST', p, b ?? {}),
  put: (p, b) => send('PUT', p, b ?? {}),
  del: (p) => send('DELETE', p),
};
export default api;
