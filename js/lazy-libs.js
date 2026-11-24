/* ==========================================================================
   Jarvis AI - On-Demand CDN Library Loader (js/lazy-libs.js)
   Các thư viện nặng nhưng ít dùng (PDF.js, html2pdf) chỉ được tải khi thật sự
   cần, giúp giảm khối lượng script phải tải lúc mở app.

   Dùng:  const pdfjsLib = await window.ensureLib('pdfjs');
   ========================================================================== */
(function () {
  'use strict';

  const LIBS = {
    pdfjs: {
      label: 'PDF.js',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
      get: () => window.pdfjsLib,
    },
    html2pdf: {
      label: 'html2pdf',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
      get: () => window.html2pdf,
    },
  };

  const pending = Object.create(null);

  function injectScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lazy-src="' + url + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Không tải được ' + url)), {
          once: true,
        });
        return;
      }
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.dataset.lazySrc = url;
      s.onload = () => {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = () => reject(new Error('Không tải được ' + url));
      document.head.appendChild(s);
    });
  }

  // Trả về thư viện đã tải (hoặc tải mới). Không bao giờ gọi 2 lần song song.
  window.ensureLib = function ensureLib(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('Thư viện không được hỗ trợ: ' + name));
    const ready = lib.get();
    if (ready) return Promise.resolve(ready);
    if (pending[name]) return pending[name];
    pending[name] = injectScript(lib.url)
      .then(() => {
        const value = lib.get();
        if (!value) throw new Error('Đã tải ' + lib.url + ' nhưng không tìm thấy ' + lib.label);
        return value;
      })
      .catch(err => {
        delete pending[name];
        throw err;
      });
    return pending[name];
  };

  window.__lazyLibs = LIBS;
})();
