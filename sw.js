// Jarvis AI Service Worker for PWA Offline Caching
const CACHE_NAME = 'jarvis-ai-pwa-v1';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json'
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
  // Pass-through API calls and WebSockets directly
  const url = event.request.url;
  if (url.includes('googleapis.com') || url.includes('tavily.com') || url.includes('jina.ai') || url.includes('serper.dev') || url.includes('brave.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
