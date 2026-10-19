// Jarvis AI Service Worker for PWA (v13 with TTS Studio Mobile UI & Scrolling Fixes)
const CACHE_NAME = 'jarvis-ai-pwa-v13';
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Pass-through API calls, CDNs, and WebSockets directly
  if (
    url.includes('googleapis.com') ||
    url.includes('tavily.com') ||
    url.includes('jina.ai') ||
    url.includes('serper.dev') ||
    url.includes('brave.com') ||
    url.includes('api.github.com') ||
    url.includes('esm.run') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net')
  ) {
    return;
  }

  // Network-First for HTML navigation so updates on GitHub Pages take effect immediately!
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for other static assets (icons, manifest)
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
