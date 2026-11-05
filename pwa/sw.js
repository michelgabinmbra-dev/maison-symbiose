// Service worker minimal : rend l'application installable et affiche un message hors connexion.
const CACHE = 'maison-symbiose-v2';
const FICHIERS = ['./', './index.html', './manifest.webmanifest', './icone-192.png', './icone-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // l'application elle-même (Google) n'est jamais mise en cache
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
