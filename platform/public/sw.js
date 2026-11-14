// Offline shell: the app opens on the show floor without signal; captures queue locally and sync later.
const C = 'roi-shell-v1';
const SHELL = ['/', '/index.html', '/js/app.js', '/assets/style.css', '/assets/platform.css', '/assets/img/bilievent_primary_horizontal_cream.svg', '/assets/img/bilievent_emblem_black.svg', '/assets/fonts/IBMPlexSansArabic-Regular.woff2', '/assets/fonts/IBMPlexSansArabic-SemiBold.woff2', '/assets/fonts/ReemKufi-600.woff2', '/assets/fonts/IBMPlexMono-Regular.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
