const V = 'capeyron-v1';
const GROS = /\.(glb|hdr|mjs|json)$/;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !GROS.test(u.pathname)) return;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok && r.status === 200) c.put(e.request, r.clone());
    return r;
  }));
});
