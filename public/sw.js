const CACHE_NAME = 'zarix-v9';
const SYNC_TAG = 'zarix-sync';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/logo-formats/android-chrome-192x192.png',
  '/logo-formats/android-chrome-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Non-GET requests are handled app-side via the offline queue
  if (request.method !== 'GET') return;

  // Next.js hashed chunks/CSS — never cache-first in SW (stale HTML + old hashes → 404 on chunks).
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(fetch(request));
    return;
  }



  // Other API routes: network-only, return offline indicator on failure
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Navigation: network-only for authenticated shells (no leftover user HTML).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response('Sin conexión.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Background Sync: triggered by the browser when connection restores
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'SYNC_QUEUE' }));
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
    );
  }
});
