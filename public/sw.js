/**
 * sw.js — service worker: پوستهٔ برنامه آفلاین باز می‌شود، داده‌ها شبکه‌محورند.
 * استراتژی: فایل‌های ثابت = کش اول (با به‌روزرسانی در پس‌زمینه)، API = شبکه اول با بازگشت به کش.
 */
const VERSION = 'hesab-v1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/css/app.css', '/css/fonts.css', '/css/print.css',
  '/fonts/Vazirmatn-var.woff2', '/fonts/Vazirmatn-Regular.woff2', '/fonts/Vazirmatn-Bold.woff2',
  '/fonts/Vazirmatn-Medium.woff2', '/fonts/Vazirmatn-SemiBold.woff2',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/favicon.ico',
  '/js/app.js', '/js/core/api.js', '/js/core/router.js', '/js/core/store.js', '/js/core/ui.js',
  '/js/core/fmt.js', '/js/lib/money.js', '/js/lib/jalali.js', '/js/lib/format.js',
  '/js/views/home.js', '/js/views/docs.js', '/js/views/stock.js', '/js/views/money.js',
  '/js/views/reports.js', '/js/views/settings.js', '/js/views/more.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    self.clients.claim();
  })());
});

const isApi = (url) => url.pathname.startsWith('/api/');
const isData = (url) => isApi(url) || url.pathname.startsWith('/files/');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (isData(url)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(VERSION + '-data');
          c.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'بدون اتصال، این داده در دسترس نیست.', offline: true }), {
          status: 503, headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // پوسته و فایل‌های ثابت
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (url.pathname.startsWith('/print/')) {
      try { return await fetch(req); } catch { return cached || Response.error(); }
    }
    if (cached) {
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && req.destination !== 'document') caches.open(VERSION).then((c) => c.put(req, res.clone()));
      return res;
    } catch {
      if (req.mode === 'navigate') { const home = await caches.match('/index.html'); if (home) return home; }
      return new Response('<h1 style="font-family:Tahoma;text-align:center;padding:30px">آفلاین هستید</h1>', {
        status: 503, headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
});
