// Jarvis AI Service Worker for PWA
const CACHE_NAME = 'jarvis-ai-pwa-v75';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/style.css',
  './css/live.css',
  './css/tts.css',
  './css/translate.css',
  './css/rag.css',
  './js/model-registry.js',
  './js/chat-render.js',
  './js/app.js',
  './js/sync.js',
  './js/live.js',
  './js/tts.js',
  './js/translate.js',
  './js/rag.js',
  './js/search.js',
  './js/extract.js',
  './js/blob.js',
  './js/markdown.worker.js'
];

// CDN libs to pre-cache at install (stale-while-revalidate at fetch)const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
  'https://cdn.jsdelivr.net/npm/mermaid@10.8.0/dist/mermaid.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js',
  'https://esm.run/@google/genai',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      Promise.all([
        cache.addAll(STATIC_ASSETS),
        cache.addAll(CDN_LIBS).catch(() => {}) // CDN libs pre-cache (best effort)      ])    ).catch(() => {})
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

  // Pass-through live API calls, search endpoints, and WebSockets directly
  if (
    url.includes('googleapis.com') ||
    url.includes('tavily.com') ||
    url.includes('jina.ai') ||
    url.includes('serper.dev') ||
    url.includes('brave.com') ||
    url.includes('api.github.com') ||
    url.includes('gist.githubusercontent.com') ||
    url.includes('integrate.api.nvidia.com') ||
    url.includes('freebuff.site')
  ) {
    return;
  }

    // Stale-while-revalidate for CDN libs (marked, katex, mermaid, highlight, lamejs, @google/genai, pdf.js, html2pdf)
  if (
    url.includes('esm.run') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {          if (response && response.status === 200) {            const clone = response.clone();            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));          }          return response;        }).catch(() => cached);        return cached || fetchPromise;      })    );    return;
  }

    // Stale-while-revalidate for JS & CSS (instant load, background update)
  const isScriptOrStyle = url.includes('/js/') || url.includes('/css/') || url.endsWith('.js') || url.endsWith('.css');
  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';

  if (isScriptOrStyle) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {          if (response && response.status === 200) {            const clone = response.clone();            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));          }          return response;        }).catch(() => cached);        return cached || fetchPromise; // stale-while-revalidate      })    );    return;
  }

  // Network-First for HTML (documents) so updates on GitHub Pages take effect immediately!
  if (isDocument) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));          }          return response;        })        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) return cached;            return caches.match('./index.html');          });        })    );    return;
  }

  // Cache-first for other static assets (icons, manifest)
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
