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
let txtContent = '';
let isProcessing = false;
let abortController = null;

let apiKeys = [];
let globalKeyIndex = 0;
let liveKeyIndex = 0;
let liveRetryCount = 0;

let folders = [];
let activeFolder = 'All';
let customPrompts = [];
let openTabs = [];

let oLay = null;
let currentSelectedText = '';

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
let FLASH_LITE_MODEL = '';
let DOM = {};

let closeModals = null;

// --- EXPOSE GLOBAL STATE VIA Object.defineProperty (for reactivity) ---
Object.defineProperty(window, 'sessions', {
  get: () => sessions,
  set: v => {
    sessions = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'activeId', {
  get: () => activeId,
  set: v => {
    activeId = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'chatHistory', {
  get: () => chatHistory,
  set: v => {
    chatHistory = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'filesData', {
  get: () => filesData,
  set: v => {
    filesData = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'txtContent', {
  get: () => txtContent,
  set: v => {
    txtContent = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'apiKeys', {
  get: () => apiKeys,
  set: v => {
    apiKeys = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'globalKeyIndex', {
  get: () => globalKeyIndex,
  set: v => {
    globalKeyIndex = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'folders', {
  get: () => folders,
  set: v => {
    folders = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'activeFolder', {
  get: () => activeFolder,
  set: v => {
    activeFolder = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'customPrompts', {
  get: () => customPrompts,
  set: v => {
    customPrompts = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'oLay', {
  get: () => oLay,
  set: v => {
    oLay = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'openRouterKeys', {
  get: () => openRouterKeys,
  set: v => {
    openRouterKeys = Array.isArray(v) ? v : [];
  },
  configurable: true,
});
Object.defineProperty(window, 'openRouterKeyIndex', {
  get: () => openRouterKeyIndex,
  set: v => {
    openRouterKeyIndex = Number(v) || 0;
  },
  configurable: true,
});
Object.defineProperty(window, 'nvidiaKeys', {
  get: () => nvidiaKeys,
  set: v => {
    nvidiaKeys = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'nvidiaKeyIndex', {
  get: () => nvidiaKeyIndex,
  set: v => {
    nvidiaKeyIndex = Number(v) || 0;
  },
  configurable: true,
});
Object.defineProperty(window, 'cohereKeys', {
  get: () => cohereKeys,
  set: v => {
    cohereKeys = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'cohereKeyIndex', {
  get: () => cohereKeyIndex,
  set: v => {
    cohereKeyIndex = Number(v) || 0;
  },
  configurable: true,
});
Object.defineProperty(window, 'explabsKeys', {
  get: () => explabsKeys,
  set: v => {
    explabsKeys = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'explabsKeyIndex', {
  get: () => explabsKeyIndex,
  set: v => {
    explabsKeyIndex = Number(v) || 0;
  },
  configurable: true,
});
Object.defineProperty(window, 'cfgMap', {
  get: () => cfgMap,
  set: v => {
    cfgMap = v;
  },
  configurable: true,
});

// window.$ / $$ / ls / ss / lsRef / ssRef được gán trực tiếp ở trên (const, không dùng setter).
Object.defineProperty(window, 'SAFETY', {
  get: () => SAFETY,
  set: v => {
    SAFETY = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'FLASH_LITE_MODEL', {
  get: () => FLASH_LITE_MODEL,
  set: v => {
    FLASH_LITE_MODEL = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'DOM', {
  get: () => DOM,
  set: v => {
    DOM = v;
  },
  configurable: true,
});

// --- CORE UTILITY FUNCTIONS (minimal implementations for early access) ---
window.escapeHtml = function (str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.getNowTime24h = function () {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

window.formatGoogleApiError = function (e) {
  const m = e?.message || '';
  return m.includes('429') || m.includes('RESOURCE_EXHAUSTED')
    ? '⚠️ Hết Quota (429).'
    : m.includes('503') || m.includes('UNAVAILABLE')
      ? '⚠️ Máy chủ quá tải (503).'
      : m
        ? '❌ Lỗi: ' + m
        : '❌ Lỗi máy chủ Google.';
};

window.showToast = function (m, t) {
  if (t === undefined) t = 'success';
  const toast = $('toast');
  if (!toast) return console.log('[' + t + '] ' + m);
  clearTimeout(window._toastTO);
  toast.innerText = m;
  toast.className = 'toast ' + t + ' show';
  window._toastTO = setTimeout(function () {
    toast.classList.remove('show');
  }, 3200);
};

// --- COLLAPSIBLE SECTION UTILITY ---
/**
 * Tạo section có thể collapse/expand cho settings
 * @param {string} sectionId - ID của section (để lưu localStorage)
 * @param {string} headerSelector - Selector cho header element (mặc định tìm .settings-group legend hoặc .section-header)
 * @param {string} contentSelector - Selector cho content element (mặc định tìm nội dung sau header)
 */
window.makeCollapsibleSection = function (sectionId, headerSelector, contentSelector) {
  const storageKey = 'jarvis_section_collapsed_' + sectionId;
  let header = document.querySelector(headerSelector);
  let content = document.querySelector(contentSelector);

  // Nếu không tìm thấy header/content, thử tìm theo cấu trúc mặc định
  if (!header) {
    header = document.querySelector(
      '#' +
        sectionId +
        ' .settings-group legend, #' +
        sectionId +
        ' .section-header, #' +
        sectionId +
        ' fieldset legend'
    );
  }
  if (!content) {
    // Tìm content: phần tử tiếp theo sau header, hoặc tất cả các element con trừ legend/header
    if (header && header.parentElement) {
      content = header.parentElement.querySelector(
        '.settings-group > *:not(legend), .section-content, .collapsible-content'
      );
    }
  }

  if (!header || !content) {
    console.warn('[makeCollapsibleSection] Không tìm thấy header/content cho', sectionId);
    return;
  }

  // Thêm class và attribute cho header
  header.classList.add('collapsible-header');
  header.style.cursor = 'pointer';
  header.style.userSelect = 'none';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');

  // Thêm icon toggle nếu chưa có
  let toggleIcon = header.querySelector('.section-toggle-icon');
  if (!toggleIcon) {
    toggleIcon = document.createElement('span');
    toggleIcon.className = 'section-toggle-icon';
    toggleIcon.innerHTML = '▼';
    toggleIcon.style.marginLeft = '8px';
    toggleIcon.style.display = 'inline-block';
    toggleIcon.style.transition = 'transform 0.2s ease';
    header.appendChild(toggleIcon);
  }

  // Thêm class cho content
  content.classList.add('collapsible-content');
  content.style.transition =
    'max-height 0.3s ease-out, opacity 0.3s ease-out, padding 0.3s ease-out, margin 0.3s ease-out';
  content.style.overflow = 'hidden';

  // Khôi phục trạng thái từ localStorage
  const storageKey = 'jarvis_section_collapsed_' + sectionId;
  const saved = localStorage.getItem('jarvis_section_collapsed_' + sectionId);
  if (saved === '1') {
    content.classList.add('collapsed');
    header.setAttribute('aria-expanded', 'false');
    if (content.querySelector('.section-toggle-icon')) {
      content.querySelector('.section-toggle-icon').style.transform = 'rotate(-90deg)';
    } else {
      const icon = header.querySelector('.section-toggle-icon');
      if (icon) icon.style.transform = 'rotate(-90deg)';
    }
  }

  // Click handler
  header.onclick = function (e) {
    // Không toggle nếu click vào input/button/link
    if (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'SELECT' ||
      e.target.tagName === 'A' ||
      e.target.tagName === 'LABEL' ||
      e.target.closest('label')
    ) {
      return;
    }

    const isCollapsed = content.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', !isCollapsed);

    // Rotate icon
    const icon = header.querySelector('.section-toggle-icon');
    if (icon) {
      icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    }

    // Lưu trạng thái
    try {
      localStorage.setItem('jarvis_section_collapsed_' + sectionId, isCollapsed ? '1' : '0');
    } catch (_) {}
  };

  // Thêm style hover
  header.style.transition = 'background 0.15s ease';
  header.addEventListener('mouseenter', () => {
    header.style.background = 'rgba(99, 102, 241, 0.08)';
    header.style.borderRadius = 'var(--radius-sm)';
    header.style.padding = '4px 8px';
    header.style.margin = '-4px -8px';
  });
  header.addEventListener('mouseleave', () => {
    header.style.background = '';
    header.style.borderRadius = '';
    header.style.padding = '';
    header.style.margin = '';
  });

  return { header, content };
};

// Hàm helper để áp dụng cho tất cả fieldset trong settings modal
window.initAllCollapsibleSections = function () {
  // Tìm tất cả fieldset trong settings modal
  const settingsModal = document.getElementById('settings-modal');
  if (!settingsModal) return;

  const fieldsets = settingsModal.querySelectorAll('fieldset.settings-group');
  fieldsets.forEach((fieldset, index) => {
    const legend = fieldset.querySelector('legend');
    if (!legend) return;

    // Tạo section ID
    const sectionId = 'settings_section_' + index;
    fieldset.id = fieldset.id || sectionId;

    // Tạo content wrapper cho nội dung fieldset (trừ legend)
    let contentWrapper = fieldset.querySelector('.collapsible-content-wrapper');
    if (!contentWrapper) {
      contentWrapper = document.createElement('div');
      contentWrapper.className = 'collapsible-content-wrapper';
      // Di chuyển tất cả children trừ legend vào wrapper
      const children = Array.from(fieldset.children).filter(child => child !== legend);
      children.forEach(child => contentWrapper.appendChild(child));
      fieldset.appendChild(contentWrapper);
    }

    window.makeCollapsibleSection(
      sectionId,
      '#' + sectionId + ' legend',
      '#' + sectionId + ' .collapsible-content-wrapper'
    );
  });
};

// Auto-init khi DOM ready
document.addEventListener('DOMContentLoaded', function () {
  // Delay để các modal đã được render
  setTimeout(window.initAllCollapsibleSections, 500);
});

// --- PERSISTENT STORAGE & NATIVE BRIDGE ---
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(function () {});
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
      console.warn('syncFromNativeBridge error:', e);
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
      console.warn('saveToNativeBridge error:', e);
    }
  }
}

if (window.JarvisNativeBridge) {
  syncFromNativeBridge();
}

const _nativeOrigSetItem = localStorage.setItem.bind(localStorage);
const _nativeOrigRemoveItem = localStorage.removeItem.bind(localStorage);
localStorage.setItem = function (k, v) {
  try {
    _nativeOrigSetItem(k, v);
  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      console.warn('LocalStorage Quota Exceeded on key:', k);
      if (typeof window.showToast === 'function') {
        window.showToast(
          '⚠️ LocalStorage (5MB) đã đầy. Dữ liệu chat được lưu an toàn trên IndexedDB!',
          'warning'
        );
      }
    }
  }
  if (window.JarvisNativeBridge) {
    saveToNativeBridge(k, v);
  }
};
localStorage.removeItem = function (k) {
  try {
    _nativeOrigRemoveItem(k);
  } catch {}
  if (window.JarvisNativeBridge) {
    saveToNativeBridge(k, null);
  }
};

// --- EXPOSE FOR EARLY ACCESS ---
window.syncFromNativeBridge = syncFromNativeBridge;
window.saveToNativeBridge = saveToNativeBridge;
window.getGoogleKeysList = function () {
  return [];
}; // placeholder
window.setGoogleKeysList = function () {}; // placeholder
window.getExternalConfigsObj = function () {
  return {};
}; // placeholder
window.setExternalConfigsObj = function () {}; // placeholder

// --- INIT LIBRARIES ---
marked.use({ breaks: true });
mermaid.initialize({ startOnLoad: false, theme: 'default' });

// --- REGISTER PWA SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  if (window.JarvisNativeBridge) {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        for (const reg of regs) reg.unregister();
      })
      .catch(function () {});
  } else {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

// --- GOOGLE GENAI PROXY (loaded from CDN in index.html) ---
const GoogleGenAI = new Proxy(function () {}, {
  construct: function (_target, args) {
    if (!window.GoogleGenAI) throw new Error('GoogleGenAI chưa được tải từ CDN.');
    return new window.GoogleGenAI(...args);
  },
  get: function (_target, prop) {
    if (!window.GoogleGenAI) throw new Error('GoogleGenAI chưa được tải từ CDN.');
    return window.GoogleGenAI[prop];
  },
});

// --- PWA INSTALL PROMPT ---
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  _deferredInstallPrompt = e;
  const btn = $('btn-pwa-install');
  const txt = $('pwa-install-text');
  if (
    btn &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    !window.navigator.standalone
  ) {
    btn.style.display = 'flex';
    if (txt) txt.innerText = 'Cài đặt ứng dụng';
  }
});

window.addEventListener('appinstalled', function () {
  const btn = $('btn-pwa-install');
  if (btn) btn.style.display = 'none';
  _deferredInstallPrompt = null;
  console.log('[PWA] Ứng dụng đã được cài đặt');
});

function installPWA() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(function (choice) {
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
window.addEventListener('error', function (e) {
  const err = e.error || new Error(e.message || 'Unknown error');
  err.name = err.name || 'UncaughtError';
  console.error('[GlobalError]', err);
  // Ghi vào IndexedDB nếu sẵn sàng (async, không chặn)
  if (typeof window.saveErrorLog === 'function') {
    window.saveErrorLog(err).catch(function () {});
  }
});

window.addEventListener('unhandledrejection', function (e) {
  const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
  err.name = 'UnhandledRejection';
  console.error('[GlobalError] Unhandled rejection:', err);
  if (typeof window.saveErrorLog === 'function') {
    window.saveErrorLog(err).catch(function () {});
  }
});

console.log('[globals.js] Global variables initialized');
