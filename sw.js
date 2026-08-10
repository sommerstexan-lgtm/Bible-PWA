/* NASB Study PWA – Service Worker  v3.9.0
   Caches app shell only. All Bible text, highlights, notes, learning data
   live in IndexedDB and never leave the device.
*/
const CACHE_NAME = 'nasb-study-v3.9.0';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './storage.js',
  './bible.js',
  './analyze.js',
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
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});
