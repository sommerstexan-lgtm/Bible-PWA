/* KJV Study PWA – Service Worker  v6.49.0
   Network-first for app shell so updates apply on the first reload.
   IndexedDB data is never cached by the SW.
   version.json is never written to Cache Storage.
*/
const CACHE_NAME = 'kjv-study-v6.49.0';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './storage.js',
  './bible.js',
  './analyze.js',
  './kjv-english.js',
  './then-kind-now.js',
  './context-data.js',
  './subject-aliases.js',
  './topics-search.js',
  './sample-genesis.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isVersionManifest(req) {
  try {
    const u = new URL(req.url);
    return u.pathname.endsWith('/version.json') || u.pathname.endsWith('version.json');
  } catch (_) {
    return false;
  }
}

// Network-first: try live files, fall back to cache (offline / flaky network)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isVersionManifest(req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try { cache.put(req, copy); } catch (_) {}
          });
        }
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
