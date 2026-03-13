
// sw.js - smart cache
const VERSION = 'v1.0.0-20260312';
const CACHE_STATIC = `static-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_STATIC && caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Strategy helpers
async function networkFirst(request) {
  try {
    const resp = await fetch(request);
    const cache = await caches.open(CACHE_STATIC);
    cache.put(request, resp.clone());
    return resp;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);
  const network = fetch(request).then((resp) => { cache.put(request, resp.clone()); return resp; }).catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // HTML navigations -> network first
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(networkFirst(req));
    return;
  }

  // CSS/JS -> stale-while-revalidate
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Images & icons -> cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/)) {
    event.respondWith(caches.match(req).then((c) => c || fetch(req).then((r) => { const t = r.clone(); caches.open(CACHE_STATIC).then((ca) => ca.put(req, t)); return r; }))); 
    return;
  }

  // Default
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
