/* ==========================================================================
   Jarvis AI - Nạp module nặng theo nhu cầu (js/module-loader.js)

   Các module lớn nhưng không cần cho màn hình chat đầu tiên (TTS studio, phiên
   dịch trực tiếp, RAG, đồng bộ Gist) KHÔNG còn nằm trong index.html. Chúng được
   nạp khi:
     1. Người dùng bấm vào tính năng (stub bên dưới tự nạp rồi gọi lại), hoặc
     2. Lúc rảnh (requestIdleCallback / sau 2s) để không chặn first paint.

   Dùng:  await window.ensureModule('rag');
   ========================================================================== */
(function () {
  'use strict';

  // Thứ tự file quan trọng: rag-core.js phải chạy trước rag.js.
  const MODULES = {
    tts: { files: ['./js/tts.js?v=77'], label: 'TTS Studio' },
    translate: { files: ['./js/translate.js?v=76'], label: 'Phiên dịch trực tiếp' },
    rag: { files: ['./js/rag-core.js?v=76', './js/rag.js?v=77'], label: 'Trí nhớ RAG' },
    sync: { files: ['./js/sync.js?v=85'], label: 'Đồng bộ Gist' },
  };

  // Hàm công khai của các module trên được index.html gọi trực tiếp qua onclick.
  // Cài stub để cú bấm đầu tiên vẫn hoạt động: nạp module rồi gọi lại hàm thật.
  const STUBS = {
    tts: [
      'openTTSStudioModal',
      'closeTTSStudioModal',
      'initTTSStudio',
      'stopSpeaking',
      'pauseSpeaking',
      'resumeSpeaking',
      'playTTSHistoryItem',
      'downloadTTSHistoryItem',
      'deleteTTSHistoryItem',
    ],
    translate: ['openLiveTranslateModal', 'closeLiveTranslateModal'],
    rag: ['openKnowledgeModal'],
    sync: ['openCloudSyncModal'],
  };

  const loaded = Object.create(null);
  const pending = Object.create(null);

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-module-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Không tải được ' + src)), {
          once: true,
        });
        return;
      }
      const s = document.createElement('script');
      s.type = 'module';
      s.src = src;
      s.dataset.moduleSrc = src;
      s.onload = () => {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = () => reject(new Error('Không tải được ' + src));
      document.body.appendChild(s);
    });
  }

  /**
   * Bảo đảm module đã nạp. Gọi nhiều lần chỉ tải một lần.
   * @param {'tts'|'translate'|'rag'|'sync'} name
   */
  function ensureModule(name) {
    const mod = MODULES[name];
    if (!mod) return Promise.reject(new Error('Module không hỗ trợ: ' + name));
    if (loaded[name]) return Promise.resolve(true);
    if (pending[name]) return pending[name];

    const started = performance.now();
    pending[name] = mod.files
      .reduce((chain, src) => chain.then(() => injectScript(src)), Promise.resolve())
      .then(() => {
        loaded[name] = true;
        try {
          window.JarvisPerf?.mark('lazy:' + name, {
            ms: Math.round(performance.now() - started),
          });
        } catch (_) {}
        return true;
      })
      .catch(err => {
        delete pending[name];
        console.warn('[ModuleLoader] Không nạp được ' + name + ':', err);
        throw err;
      });
    return pending[name];
  }

  function installStub(moduleName, fnName) {
    const current = /** @type {any} */ (window[fnName]);
    if (typeof current === 'function' && !current.__jarvisStub) return; // đã có hàm thật
    const stub = function (...args) {
      return ensureModule(moduleName).then(() => {
        const real = /** @type {any} */ (window[fnName]);
        if (typeof real === 'function' && !real.__jarvisStub) return real.apply(window, args);
      });
    };
    stub.__jarvisStub = true;
    /** @type {any} */ (window)[fnName] = stub;
  }

  Object.keys(STUBS).forEach(name => STUBS[name].forEach(fn => installStub(name, fn)));

  // Nạp lúc rảnh: ưu tiên requestIdleCallback, không thì sau 2s. Nhờ vậy tính năng
  // dùng ngay được mà first paint không phải chờ 200KB JS.
  const IDLE_PRELOAD = ['sync', 'tts', 'translate', 'rag'];
  function preloadIdle() {
    IDLE_PRELOAD.forEach((name, idx) => {
      const run = () => ensureModule(/** @type {any} */ (name)).catch(() => {});
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 4000 + idx * 1500 });
      } else {
        setTimeout(run, 2000 + idx * 1200);
      }
    });
  }

  window.JarvisModules = {
    MODULES,
    ensureModule,
    isLoaded: name => !!loaded[name],
    preloadIdle,
  };
  window.ensureModule = ensureModule;

  if (document.readyState === 'complete') preloadIdle();
  else window.addEventListener('load', preloadIdle, { once: true });
})();
