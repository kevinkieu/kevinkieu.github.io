// Jarvis AI Service Worker for PWA (v57 - Distributed Key Quota & Optimized Auxiliary Models)
const CACHE_NAME = 'jarvis-ai-pwa-v60';
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/style.css',
  './css/live.css',
  './css/tts.css',
  './css/translate.css',
  './css/rag.css',
  './js/app.js',
  './js/sync.js',
  './js/live.js',
  './js/tts.js',
  './js/translate.js',
  './js/rag.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
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
    url.includes('gist.githubusercontent.com') ||
    url.includes('esm.run') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net')
  ) {
    return;
  }

  // Network-First for HTML, JS & CSS so updates on GitHub Pages take effect immediately!
  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';
  const isScriptOrStyle = url.includes('/js/') || url.includes('/css/') || url.endsWith('.js') || url.endsWith('.css');

  if (isDocument || isScriptOrStyle) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            if (isDocument) return caches.match('./index.html');
            return null;
          });
        })
    );
    return;
  }

  // Cache-first for other static assets (icons, manifest)
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
