// Jarvis AI Service Worker for PWA
const CACHE_NAME = 'jarvis-ai-pwa-v98';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './css/style.css',
  './css/live.css',
  './css/tts.css',
  './css/translate.css',
  './css/rag.css',
  './css/debug-overlay.css',
  './js/perf-marks.js',
  './js/module-loader.js',
  './js/lazy-libs.js',
  './js/sanitize.js',
  './js/sync-merge.js',
  './js/globals.js',
  './js/model-registry.js',
  './js/failover.js',
  './js/offline-queue.js',
  './js/chat-render.js',
  './js/persona-config.js',
  './js/app.js',
  './js/sync.js',
  './js/live.js',
  './js/tts.js',
  './js/translate.js',
  './js/rag.js',
  './js/search.js',
  './js/extract.js',
  './js/blob.js',
  './js/markdown.worker.js',
];

// CDN libs to pre-cache at install (stale-while-revalidate at fetch)
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js',
  'https://cdn.jsdelivr.net/npm/@google/genai@3.6.1/+esm',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
];

// Danh sách asset được suy ra từ chính index.html (không còn lệch khi thêm file mới).
async function discoverAssets() {
  const urls = new Set([
    './',
    './index.html',
    './manifest.json',
    './icon-180.png',
    './icon-192.png',
    './icon-512.png',
  ]);
  try {
    const res = await fetch('./index.html', { cache: 'no-store' });
    if (res.ok) {
      const html = await res.text();
      const re = /(?:src|href)="(\.\/[^"?#]+\.(?:js|css|json|png|svg|webp))(?:\?[^"]*)?"/g;
      let m;
      while ((m = re.exec(html))) urls.add(m[1]);
      // Các module nạp theo nhu cầu qua module-loader.js (không nằm trong index.html)
      [
        './js/tts.js',
        './js/translate.js',
        './js/rag-core.js',
        './js/rag.js',
        './js/rag.worker.js',
        './js/sync.js',
        './js/markdown.worker.js',
        './js/audio-worklet-processor.js',
      ].forEach(u => urls.add(u));
    }
  } catch (e) {
    console.warn('[SW] Không đọc được index.html, dùng danh sách dự phòng:', e);
  }
  return Array.from(urls);
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      let assets = STATIC_ASSETS;
      try {
        const discovered = await discoverAssets();
        if (discovered.length > STATIC_ASSETS.length) assets = discovered;
      } catch (_) {}
      // Precache từng file: một file lỗi không làm hỏng toàn bộ install.
      const results = await Promise.allSettled(assets.map(u => cache.add(u)));
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed) console.warn(`[SW] ${failed}/${assets.length} asset precache thất bại`);
      // CDN là best-effort (app vẫn chạy online nếu CDN lỗi lúc install).
      await Promise.allSettled(CDN_LIBS.map(u => cache.add(u)));
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Query ?v= chỉ để bust cache; precache lưu không query nên phải chuẩn hoá key.
function cacheKeyFor(url) {
  try {
    const u = new URL(url, self.location.href);
    u.searchParams.delete('v');
    return u.toString();
  } catch (_) {
    return url;
  }
}

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

  // Stale-while-revalidate for CDN libs (marked, katex, highlight, lamejs, @google/genai, pdf.js, html2pdf)
  if (
    url.includes('esm.run') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(cacheKeyFor(event.request.url)).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Stale-while-revalidate for JS & CSS (instant load, background update)
  const isScriptOrStyle =
    url.includes('/js/') || url.includes('/css/') || url.endsWith('.js') || url.endsWith('.css');
  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';

  if (isScriptOrStyle) {
    event.respondWith(
      caches.match(cacheKeyFor(event.request.url)).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise; // stale-while-revalidate
      })
    );
    return;
  }

  // Network-First for HTML (documents) so updates on GitHub Pages take effect immediately!
  if (isDocument) {
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
          return caches.match(cacheKeyFor(event.request.url)).then(cached => {
            if (cached) return cached;
            return caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Cache-first for other static assets (icons, manifest)
  event.respondWith(
    caches.match(cacheKeyFor(event.request.url)).then(response => response || fetch(event.request))
  );
});

// Background Sync: flush offline queue when connectivity returns
self.addEventListener('sync', event => {
  if (event.tag === 'flush-offline-queue') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(c => {
          try {
            c.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' });
          } catch (_) {}
        });
      })
    );
  }
});

// Notification click: focus existing tab or open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients && clients.length) {
        return clients[0].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});

// Allow clients to trigger a notification via message
self.addEventListener('message', event => {
  const data = event.data || {};
  if (
    data.type === 'SHOW_NOTIFICATION' &&
    self.Notification &&
    Notification.permission === 'granted'
  ) {
    self.registration.showNotification(data.title || 'Jarvis AI', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'jarvis',
      renotify: !!data.renotify,
    });
  }
});
