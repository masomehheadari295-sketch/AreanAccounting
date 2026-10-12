/**
 * router.js — مسیریابی با هَش (کار می‌کند وقتی فایل را محلی باز کنید یا آفلاین باشید).
 */
const routes = new Map();
const cache = new Map();
let current = null;
let renderToken = 0;

export function route(pattern, loader) { routes.set(pattern, loader); }
export const parse = (hash) => {
  const raw = String(hash || location.hash || '#/home').replace(/^#/, '');
  const [path, qs] = raw.split('?');
  const segs = path.split('/').filter(Boolean);
  return { path: '/' + segs.join('/'), segs, query: Object.fromEntries(new URLSearchParams(qs || '')) };
};

function match(segs) {
  const exact = routes.get('/' + segs.join('/'));
  if (exact) return { loader: exact, params: {}, key: '/' + segs.join('/') };
  for (const [pattern, loader] of routes) {
    const ps = pattern.split('/').filter(Boolean);
    if (ps.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < ps.length; i += 1) {
      if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (ps[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { loader, params, key: pattern };
  }
  return null;
}

/** رenderها را صف می‌کند تا دو ناوبری پشت‌سرهم، DOM یکدیگر را خراب نکنند */
let chain = Promise.resolve();
export function render() {
  chain = chain.then(() => doRender()).catch((e) => { console.error('[router]', e); });
  return chain;
}

async function doRender() {
  const { segs, query } = parse();
  const m = match(segs.length ? segs : ['home']);
  /** ظرف نما را با یک گرهٔ تازه عوض می‌کنیم: گوشیدهنده‌های رندر قبلی روی همان گره نمی‌مانند
   *  (وگرنه هر بار که کاربر وارد صفحه می‌شود، یک بار دیگر هم اجرا می‌شود). */
  const old = document.getElementById('view');
  const root = old.cloneNode(false);
  old.replaceWith(root);
  renderToken += 1;
  const token = renderToken;
  if (!m) {
    root.innerHTML = `<div class="wrap"><section class="card"><header class="card-head"><h3>صفحه پیدا نشد</h3></header>
      <div class="card-body"><p class="muted">نشانی <code>/${segs.join('/')}</code> در برنامه نیست.</p>
      <a class="btn btn-primary" href="#/home">برو به خانه</a></div></section></div>`;
    document.getElementById('page-title').textContent = 'یافت نشد';
    return;
  }
  let view = cache.get(m.key);
  try {
    if (!view) { view = await m.loader(); cache.set(m.key, view); }
  } catch (e) {
    root.innerHTML = `<div class="wrap"><div class="errbox"><div><h4>بارگیری این بخش نشد</h4><p>${(e && e.message) || 'خطا'}</p></div></div></div>`;
    return;
  }
  const v = view.default || view;
  current = { key: m.key, name: v.name || m.key, view: v };
  document.getElementById('page-title').textContent = typeof v.title === 'function' ? v.title(query) : (v.title || '');
  const sub = typeof v.sub === 'function' ? v.sub(query) : v.sub;
  const subEl = document.getElementById('page-sub');
  subEl.innerHTML = sub || '';
  subEl.hidden = !sub;
  document.getElementById('btn-back').hidden = !v.back;
  document.title = `${(typeof v.title === 'function' ? v.title(query) : v.title) || 'حساب'} — حساب`;
  root.scrollTop = 0;
  window.scrollTo({ top: 0 });
  try {
    await v.render({ root, params: m.params, query, token });
  } catch (e) {
    console.error('[view]', e);
    root.innerHTML = `<div class="wrap"><div class="errbox" role="alert"><span class="err-ic"><svg class="ic"><use href="#i-alert"/></svg></span>
      <div><h4>نمایش این صفحه ممکن نشد</h4><p>${(e && (e.userMessage || e.message)) || 'خطای ناشناخته'}</p>
      ${e?.hint ? `<p class="muted small">${e.hint}</p>` : ''}</div>
      <button class="btn btn-soft small" data-act="retry">تلاش دوباره</button></div></div>`;
    root.querySelector('[data-act=retry]')?.addEventListener('click', () => render());
  }
}

export const start = () => {
  addEventListener('hashchange', () => render());
  if (!location.hash) location.hash = '#/home';
  render();
};
export const go = (hash, replace = false) => {
  const h = hash.startsWith('#') ? hash : '#' + hash;
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (!replace && parse(h).path === parse().path) render();
};
export const reload = () => render();
export const currentRoute = () => current;
export const invalidate = (key) => cache.delete(key);
export const invalidateAll = () => cache.clear();
