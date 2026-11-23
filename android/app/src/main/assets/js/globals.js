/* ==========================================================================
   Jarvis AI - Global Variables & Early Initialization
   This file MUST load FIRST (before all other modules) to define global
   variables that other modules depend on.
   ========================================================================== */

// --- CORE UTILITIES ---
const $ = id => document.getElementById(id);
const ls = localStorage;
const ss = sessionStorage;

// Minimal window bindings
window.$ = $;
window.$$ = $;
window.ls = ls;
window.ss = ss;
window.lsRef = ls;
window.ssRef = ss;

// --- GLOBAL STATE VARIABLES (initialized early for modules) ---
// These are declared with let/var so they can be reassigned later by app.js
let sessions = [];
let activeId = null;
let chatHistory = [];
let filesData = [];
let txtContent = "";
let isProcessing = false;
let abortController = null;

let apiKeys = [];
let globalKeyIndex = 0;
let liveKeyIndex = 0;
let liveRetryCount = 0;

let folders = [];
let activeFolder = "All";
let customPrompts = [];
let openTabs = [];

let oLay = null;
let currentSelectedText = "";

let openRouterKeys = [];
let openRouterKeyIndex = 0;

let nvidiaKeys = [];
let nvidiaKeyIndex = 0;

let cohereKeys = [];
let cohereKeyIndex = 0;

let explabsKeys = [];
let explabsKeyIndex = 0;

let cfgMap = [];

let SAFETY = [];
let FLASH_LITE_MODEL = "";
let DOM = {};


let closeModals = null;























// --- EXPOSE GLOBAL STATE VIA Object.defineProperty (for reactivity) ---
Object.defineProperty(window, 'sessions', { get: () => sessions, set: v => { sessions = v; }, configurable: true });
Object.defineProperty(window, 'activeId', { get: () => activeId, set: v => { activeId = v; }, configurable: true });
Object.defineProperty(window, 'chatHistory', { get: () => chatHistory, set: v => { chatHistory = v; }, configurable: true });
Object.defineProperty(window, 'filesData', { get: () => filesData, set: v => { filesData = v; }, configurable: true });
Object.defineProperty(window, 'txtContent', { get: () => txtContent, set: v => { txtContent = v; }, configurable: true });
Object.defineProperty(window, 'apiKeys', { get: () => apiKeys, set: v => { apiKeys = v; }, configurable: true });
Object.defineProperty(window, 'globalKeyIndex', { get: () => globalKeyIndex, set: v => { globalKeyIndex = v; }, configurable: true });
Object.defineProperty(window, 'folders', { get: () => folders, set: v => { folders = v; }, configurable: true });
Object.defineProperty(window, 'activeFolder', { get: () => activeFolder, set: v => { activeFolder = v; }, configurable: true });
Object.defineProperty(window, 'customPrompts', { get: () => customPrompts, set: v => { customPrompts = v; }, configurable: true });
Object.defineProperty(window, 'oLay', { get: () => oLay, set: v => { oLay = v; }, configurable: true });
Object.defineProperty(window, 'openRouterKeys', { get: () => openRouterKeys, set: v => { openRouterKeys = Array.isArray(v) ? v : []; }, configurable: true });
Object.defineProperty(window, 'openRouterKeyIndex', { get: () => openRouterKeyIndex, set: v => { openRouterKeyIndex = Number(v) || 0; }, configurable: true });
Object.defineProperty(window, 'nvidiaKeys', { get: () => nvidiaKeys, set: v => { nvidiaKeys = v; }, configurable: true });
Object.defineProperty(window, 'nvidiaKeyIndex', { get: () => nvidiaKeyIndex, set: v => { nvidiaKeyIndex = Number(v) || 0; }, configurable: true });
Object.defineProperty(window, 'cohereKeys', { get: () => cohereKeys, set: v => { cohereKeys = v; }, configurable: true });
Object.defineProperty(window, 'cohereKeyIndex', { get: () => cohereKeyIndex, set: v => { cohereKeyIndex = Number(v) || 0; }, configurable: true });
Object.defineProperty(window, 'explabsKeys', { get: () => explabsKeys, set: v => { explabsKeys = v; }, configurable: true });
Object.defineProperty(window, 'explabsKeyIndex', { get: () => explabsKeyIndex, set: v => { explabsKeyIndex = Number(v) || 0; }, configurable: true });
Object.defineProperty(window, 'cfgMap', { get: () => cfgMap, set: v => { cfgMap = v; }, configurable: true });

// window.$ / $$ / ls / ss / lsRef / ssRef được gán trực tiếp ở trên (const, không dùng setter).
Object.defineProperty(window, 'SAFETY', { get: () => SAFETY, set: v => { SAFETY = v; }, configurable: true });
Object.defineProperty(window, 'FLASH_LITE_MODEL', { get: () => FLASH_LITE_MODEL, set: v => { FLASH_LITE_MODEL = v; }, configurable: true });
Object.defineProperty(window, 'DOM', { get: () => DOM, set: v => { DOM = v; }, configurable: true });

// --- CORE UTILITY FUNCTIONS (minimal implementations for early access) ---
window.escapeHtml = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.getNowTime24h = function() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

window.formatGoogleApiError = function(e) {
  const m = e?.message || "";
  return (m.includes("429") || m.includes("RESOURCE_EXHAUSTED")) ? "⚠️ Hết Quota (429)."
       : (m.includes("503") || m.includes("UNAVAILABLE")) ? "⚠️ Máy chủ quá tải (503)."
       : m ? "❌ Lỗi: " + m : "❌ Lỗi máy chủ Google.";
};

window.showToast = function(m, t) {
  if (t === undefined) t = 'success';
  const toast = $('toast');
  if (!toast) return console.log('[' + t + '] ' + m);
  clearTimeout(window._toastTO);
  toast.innerText = m;
  toast.className = 'toast ' + t + ' show';
  window._toastTO = setTimeout(function() { toast.classList.remove('show'); }, 3200);
};

// --- PERSISTENT STORAGE & NATIVE BRIDGE ---
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(function() {});
}

function syncFromNativeBridge() {
  if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.getAllDataJson === 'function') {
    try {
      const raw = window.JarvisNativeBridge.getAllDataJson();
      if (raw) {
        const data = JSON.parse(raw);
        for (const k in data) {
          const v = data[k];
          if (v !== null && v !== undefined && !ls.getItem(k)) {
            ls.setItem(k, v);
          }
        }
      }
    } catch (e) {
      console.warn("syncFromNativeBridge error:", e);
    }
  }
}

function saveToNativeBridge(key, val) {
  if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.setItem === 'function') {
    try {
      if (val === null || val === undefined) {
        window.JarvisNativeBridge.removeItem(key);
      } else {
        window.JarvisNativeBridge.setItem(key, String(val));
      }
    } catch (e) {
      console.warn("saveToNativeBridge error:", e);
    }
  }
}

if (window.JarvisNativeBridge) {
  syncFromNativeBridge();
}

const _nativeOrigSetItem = localStorage.setItem.bind(localStorage);
const _nativeOrigRemoveItem = localStorage.removeItem.bind(localStorage);
localStorage.setItem = function(k, v) {
  try { _nativeOrigSetItem(k, v); }
  catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      console.warn("LocalStorage Quota Exceeded on key:", k);
      if (typeof window.showToast === 'function') {
        window.showToast("⚠️ LocalStorage (5MB) đã đầy. Dữ liệu chat được lưu an toàn trên IndexedDB!", "warning");
      }
    }
  }
  if (window.JarvisNativeBridge) { saveToNativeBridge(k, v); }
};
localStorage.removeItem = function(k) {
  try { _nativeOrigRemoveItem(k); } catch {}
  if (window.JarvisNativeBridge) { saveToNativeBridge(k, null); }
};

// --- EXPOSE FOR EARLY ACCESS ---
window.syncFromNativeBridge = syncFromNativeBridge;
window.saveToNativeBridge = saveToNativeBridge;
window.getGoogleKeysList = function() { return []; }; // placeholder
window.setGoogleKeysList = function() {}; // placeholder
window.getExternalConfigsObj = function() { return {}; }; // placeholder
window.setExternalConfigsObj = function() {}; // placeholder

// --- INIT LIBRARIES ---
marked.use({ breaks: true });
mermaid.initialize({ startOnLoad: false, theme: 'default' });

// --- REGISTER PWA SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  if (window.JarvisNativeBridge) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      for (const reg of regs) reg.unregister();
    }).catch(function() {});
  } else {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  }
}

// --- GOOGLE GENAI PROXY (loaded from CDN in index.html) ---
const GoogleGenAI = new Proxy(function() {}, {
  construct: function(_target, args) {
    if (!window.GoogleGenAI) throw new Error('GoogleGenAI chưa được tải từ CDN.');
    return new window.GoogleGenAI(...args);
  },
  get: function(_target, prop) {
    if (!window.GoogleGenAI) throw new Error('GoogleGenAI chưa được tải từ CDN.');
    return window.GoogleGenAI[prop];
  }
});

// --- PWA INSTALL PROMPT ---
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _deferredInstallPrompt = e;
  const btn = $('btn-pwa-install');
  const txt = $('pwa-install-text');
  if (btn && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
    btn.style.display = 'flex';
    if (txt) txt.innerText = 'Cài đặt ứng dụng';
  }
});

window.addEventListener('appinstalled', function() {
  const btn = $('btn-pwa-install');
  if (btn) btn.style.display = 'none';
  _deferredInstallPrompt = null;
  console.log('[PWA] Ứng dụng đã được cài đặt');
});

function installPWA() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(function(choice) {
    if (choice.outcome === 'accepted') {
      console.log('[PWA] Người dùng đồng ý cài đặt');
    } else {
      console.log('[PWA] Người dùng từ chối cài đặt');
    }
    _deferredInstallPrompt = null;
    const btn = $('btn-pwa-install');
    if (btn) btn.style.display = 'none';
  });
}

const pwaBtn = $('btn-pwa-install');
if (pwaBtn) {
  pwaBtn.onclick = installPWA;
}

// Kiểm tra đã cài PWA chưa (standalone mode)
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
  const btn = $('btn-pwa-install');
  if (btn) btn.style.display = 'none';
}

// --- GLOBAL ERROR HANDLERS ---
window.addEventListener('error', function(e) {
  const err = e.error || new Error(e.message || 'Unknown error');
  err.name = err.name || 'UncaughtError';
  console.error('[GlobalError]', err);
  // Ghi vào IndexedDB nếu sẵn sàng (async, không chặn)
  if (typeof window.saveErrorLog === 'function') {
    window.saveErrorLog(err).catch(function() {});
  }
});

window.addEventListener('unhandledrejection', function(e) {
  const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
  err.name = 'UnhandledRejection';
  console.error('[GlobalError] Unhandled rejection:', err);
  if (typeof window.saveErrorLog === 'function') {
    window.saveErrorLog(err).catch(function() {});
  }
});

console.log('[globals.js] Global variables initialized');