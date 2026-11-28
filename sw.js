/* KJV Study PWA - Service Worker  v7.0.45
   Network-first for app shell so updates apply on the first reload.
   IndexedDB data is never cached by the SW.
   version.json is never written to Cache Storage.
   Large lexicon files are not in the install shell; they cache on first use.
*/
const CACHE_NAME = "kjv-study-v7.0.45";
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
  './name-variants.js',
  './topics-search.js',
  './precision.js',
  './literary-structures.js',
  './sample-genesis.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './leaflet.js',
  './html2canvas.min.js',
  './leaflet.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
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

function isServiceWorkerScript(req) {
  try {
    return new URL(req.url).pathname.endsWith('/sw.js') || new URL(req.url).pathname.endsWith('sw.js');
  } catch (_) {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!req.url || req.url.indexOf('http') !== 0) return;
  if (isServiceWorkerScript(req)) return;

  if (isVersionManifest(req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, copy).catch(() => {});
          }).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
