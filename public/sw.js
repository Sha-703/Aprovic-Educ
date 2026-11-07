/* Aprovic Educ — service worker : cache du squelette, reseau pour l'API */
const CACHE = 'aprovic-v1';
const ASSETS = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // L'API n'est jamais mise en cache (resultats, comptes, etc.)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }
  // Strategie reseau d'abord, puis cache (mode hors-ligne)
  event.respondWith(
    fetch(event.request)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copie)).catch(() => {});
        return reponse;
      })
      .catch(() => caches.match(event.request).then((cache) => cache || caches.match('/')))
  );
});
