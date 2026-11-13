// Test simulation for browser environment in Node.js
const fs = require('fs');
const vm = require('vm');

const domElements = {};
const getOrCreateElement = (id) => {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      value: '',
      innerText: '',
      innerHTML: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
        toggle: () => {}
      },
      setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      removeAttribute: () => {},
      appendChild: (c) => c,
      removeChild: (c) => c,
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      blur: () => {},
      click: () => {},
      options: []
    };
  }
  return domElements[id];
};

const localStorageData = {};
const localStorage = {
  getItem: (k) => localStorageData[k] || null,
  setItem: (k, v) => { localStorageData[k] = String(v); },
  removeItem: (k) => { delete localStorageData[k]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); }
};

const sessionStorageData = {};
const sessionStorage = {
  getItem: (k) => sessionStorageData[k] || null,
  setItem: (k, v) => { sessionStorageData[k] = String(v); },
  removeItem: (k) => { delete sessionStorageData[k]; },
  clear: () => { Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]); }
};

const sandbox = {
  window: {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
    getElementById: getOrCreateElement,
    querySelector: (sel) => getOrCreateElement(sel.replace(/^[#.]/, '')),
    querySelectorAll: () => [],
    createElement: (tag) => getOrCreateElement(tag),
    documentElement: { style: { setProperty: () => {} } },
    body: getOrCreateElement('body'),
    addEventListener: () => {}
  },
  navigator: {
    storage: { persist: () => Promise.resolve(true), estimate: () => Promise.resolve({ quota: 1000000, usage: 1000 }) },
    clipboard: { writeText: () => Promise.resolve() },
    mediaDevices: { getUserMedia: () => Promise.resolve() }
  },
  localStorage,
  sessionStorage,
  indexedDB: {
    open: () => {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction: () => ({
            objectStore: () => ({
              getAll: () => {
                const r = { onsuccess: null, onerror: null, result: [] };
                setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: r }); }, 10);
                return r;
              },
              put: () => ({ onsuccess: null, onerror: null }),
              get: () => ({ onsuccess: null, onerror: null }),
              delete: () => ({ onsuccess: null, onerror: null }),
              clear: () => ({ onsuccess: null, onerror: null })
            })
          })
        }
      };
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 10);
      return req;
    }
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  marked: { parse: (s) => s, use: () => {} },
  mermaid: { initialize: () => {} },
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  Blob: class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
  FileReader: class {
    readAsText() { setTimeout(() => { if (this.onload) this.onload({ target: { result: '{}' } }); }, 10); }
    readAsDataURL() { setTimeout(() => { if (this.onloadend) this.onloadend(); }, 10); }
  },
  console
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

const files = [
  'js/tools.js',
  'js/export.js',
  'js/quota.js',
  'js/medication.js',
  'js/commands.js',
  'js/briefing.js',
  'js/app.js'
];

for (const file of files) {
  console.log('Testing execution of:', file);
  try {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/import\s+.*?from\s+.*?;/g, 'const GoogleGenAI = class {};');
    vm.runInContext(code, context, { filename: file });
    console.log('[SUCCESS]', file);
  } catch (err) {
    console.error('[CRASH IN ' + file + ']', err.stack);
    process.exit(1);
  }
}
console.log('ALL FILES EXECUTED CLEANLY WITH NO CRASHES!');
