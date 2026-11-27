// Change the version number every time you deploy
const CACHE = 'tm-factor-v2.5';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('tm-factor-') && n !== CACHE).map(n => caches.delete(n))))
    .then(() => clients.claim())));
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, {ignoreSearch: true})).then(r => r || fetch(e.request)));
});
