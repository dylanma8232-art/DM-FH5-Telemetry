const CACHE_NAME = 'fh5-telemetry-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  // 对 API、Socket 及高频请求直接放行，不走缓存
  if (e.request.url.includes('/api/') || e.request.url.includes('/socket.io/')) {
    return;
  }

  // 核心优化：采用 Network First 策略，保障更新即时生效
  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return networkRes;
      })
      .catch(() => {
        // 网络失败时退回缓存
        return caches.match(e.request);
      })
  );
});
