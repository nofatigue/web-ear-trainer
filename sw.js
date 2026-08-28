// Offline support: cache the shell on install, serve from cache, refresh in
// the background. The app has no backend, so once it has loaded once there is
// no reason it should ever need the network again.

const CACHE = 'ear-trainer-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './src/app.js',
  './src/theory.js',
  './src/parse.js',
  './src/rhythm.js',
  './src/voicing.js',
  './src/melody.js',
  './src/generator.js',
  './src/grading.js',
  './src/stats.js',
  './src/audio/engine.js',
  './src/audio/scheduler.js',
  './src/audio/player.js',
  './src/ui/answer-sheet.js',
  './src/ui/rhythm-picker.js',
  './src/ui/melody-input.js',
  './src/ui/review.js',
  './src/ui/stats-panel.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // Only same-origin responses are worth keeping; the font CDN can
          // look after itself.
          if (response.ok && new URL(request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
