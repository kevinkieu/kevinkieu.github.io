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
    // KaTeX: chỉ tải khi tin nhắn thực sự có công thức toán (~270KB)
    katex: {
      label: 'KaTeX',
      url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
      get: () => window.katex,
    },
    katexAutoRender: {
      label: 'KaTeX auto-render',
      url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
      dependsOn: 'katex',
      get: () => window.renderMathInElement,
    },
    // highlight.js: chỉ cần ở luồng fallback khi Web Worker không render được
    highlight: {
      label: 'highlight.js',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
      get: () => window.hljs,
    },
    // lamejs: chỉ dùng khi xuất audio TTS thành MP3
    lamejs: {
      label: 'lamejs (MP3 encoder)',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js',
      get: () => window.lamejs,
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
  // Hỗ trợ dependsOn: tự tải thư viện phụ thuộc trước.
  // Hỗ trợ readyCheck: hàm tùy chỉnh để kiểm tra thư viện thực sự sẵn sàng (không chỉ object tồn tại).
  window.ensureLib = async function ensureLib(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('Thư viện không được hỗ trợ: ' + name));

    // Check if already ready (using custom readyCheck or default get)
    const isReady = lib.readyCheck ? lib.readyCheck() : !!lib.get();
    if (isReady) return lib.get();
    if (pending[name]) return pending[name];

    // Tải dependency trước nếu có
    if (lib.dependsOn) {
      await ensureLib(lib.dependsOn);
    }

    pending[name] = injectScript(lib.url)
      .then(() => {
        // Wait for readyCheck if provided, otherwise just check get()
        if (lib.readyCheck) {
          return new Promise((resolve, reject) => {
            const checkReady = () => {
              if (lib.readyCheck()) {
                resolve(lib.get());
              } else {
                setTimeout(checkReady, 50);
              }
            };
            checkReady();
            // Timeout after 10 seconds
            setTimeout(
              () => reject(new Error('Timeout waiting for ' + lib.label + ' to be ready')),
              10000
            );
          });
        } else {
          const value = lib.get();
          if (!value) throw new Error('Đã tải ' + lib.url + ' nhưng không tìm thấy ' + lib.label);
          return value;
        }
      })
      .catch(err => {
        delete pending[name];
        throw err;
      });
    return pending[name];
  };

  window.__lazyLibs = LIBS;
})();
