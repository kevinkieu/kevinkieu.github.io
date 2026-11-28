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
      integrity: 'sha384-lrb5efVIYR2lZw+OsuztHZzP9wpGNrhui+0VlpiHb/iPcZSCDT3CeETsL9EMQ8ih',
      get: () => window.pdfjsLib,
    },
    html2pdf: {
      label: 'html2pdf',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
      integrity: 'sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc',
      get: () => window.html2pdf,
    },
    // KaTeX: chỉ tải khi tin nhắn thực sự có công thức toán (~270KB)
    katex: {
      label: 'KaTeX',
      url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
      integrity: 'sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUb0ZY0l8',
      get: () => window.katex,
    },
    katexAutoRender: {
      label: 'KaTeX auto-render',
      url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
      integrity: 'sha384-+VBxd3r6XgURycqtZ117nYw44OOcIax56Z4dCRWbxyPt0Koah1uHoK0o4+/RRE05',
      dependsOn: 'katex',
      get: () => window.renderMathInElement,
    },
    // highlight.js: chỉ cần ở luồng fallback khi Web Worker không render được
    highlight: {
      label: 'highlight.js',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
      integrity: 'sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp',
      get: () => window.hljs,
    },
    // lamejs: chỉ dùng khi xuất audio TTS thành MP3
    lamejs: {
      label: 'lamejs (MP3 encoder)',
      url: 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js',
      integrity: 'sha384-xuasJXVcyv3hZq0eYpelEkBC8l4yufatZXDsKuyCU2rqfhDCb+ftuE/mSfZAteiK',
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
      // SRI: tra cứu integrity từ LIBS theo url để chặn CDN bị thay thế.
      const libEntry = Object.values(LIBS).find(l => l.url === url);
      if (libEntry && libEntry.integrity) {
        s.integrity = libEntry.integrity;
        s.crossOrigin = 'anonymous';
      }
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
