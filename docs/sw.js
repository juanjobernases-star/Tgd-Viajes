// Service worker mínimo de Andanzas — solo para que la PWA instalada en el
// móvil detecte y adopte cada deploy nuevo automáticamente.
//
// IMPORTANTE: sube este número en CADA deploy que quieras que los móviles
// con la app instalada refresquen. Si no lo subes, el SW considera que no
// hay nada nuevo y no dispara la actualización.
const CACHE_VERSION = 'v8';
const CACHE_NAME = 'andanzas-' + CACHE_VERSION;

// Solo cacheamos el HTML principal como fallback offline. Todo lo demás
// (llamadas a la API, fuentes externas, mapas) pasa siempre por red.
const PRECACHE_URL = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(PRECACHE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo intervenimos en navegaciones GET al propio origen (el HTML de la
  // app). Todo lo demás (API del backend, fuentes de Google, iframes de
  // mapas, etc.) se deja pasar sin tocar para no interferir con cookies de
  // sesión ni con peticiones cross-origin.
  const isSameOrigin = new URL(req.url).origin === self.location.origin;
  const isNavigation = req.mode === 'navigate' ||
    (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

  if (!isSameOrigin || !isNavigation) return;

  // Network-first: si hay red, siempre servimos y cacheamos lo último.
  // Solo si la red falla (offline) caemos al último HTML cacheado.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(PRECACHE_URL, resClone));
        return res;
      })
      .catch(() => caches.match(PRECACHE_URL))
  );
});
