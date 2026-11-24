// Vitest setup - Mock browser APIs and global state

// Mock localStorage / sessionStorage
const createStorage = () => {
  const store = new Map();
  return {
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: i => Array.from(store.keys())[i] ?? null,
  };
};

Object.defineProperty(global, 'localStorage', {
  value: createStorage(),
  writable: true,
  configurable: true,
});
Object.defineProperty(global, 'sessionStorage', {
  value: createStorage(),
  writable: true,
  configurable: true,
});

// Mock window.deobfuscateKey (used by search.js/extract.js)
global.deobfuscateKey = k => k.replace(/^JVENC_|^ENC_/, 'DEOBF_');

// Mock navigator.clipboard
global.navigator.clipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
};

// Mock navigator.share
global.navigator.share = vi.fn().mockResolvedValue(undefined);

// Mock fetch
global.fetch = vi.fn();

// Mock showToast
global.showToast = vi.fn();

// Mock URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock DOMParser
global.DOMParser = class DOMParser {
  parseFromString(str, type) {
    return {
      body: { innerText: str.replace(/<[^>]+>/g, ''), innerHTML: str },
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }
};

// Mock FileReader
global.FileReader = class FileReader {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.result = null;
  }
  readAsDataURL(blob) {
    setTimeout(() => {
      this.result = `data:${blob.type};base64,dGVzdA==`;
      this.onload?.({ target: this });
    }, 0);
  }
};

// Mock Blob / Uint8Array / atob / btoa
global.Blob = class Blob {
  constructor(parts, options = {}) {
    this.parts = parts;
    this.type = options.type || '';
    this.size = parts.reduce((sum, p) => sum + (p?.length || p?.byteLength || 0), 0);
  }
  slice() {
    return new Blob([], { type: this.type });
  }
};

global.atob = str => Buffer.from(str, 'base64').toString('binary');
global.btoa = str => Buffer.from(str, 'binary').toString('base64');

// Mock highlight.js (hljs)
global.hljs = {
  highlight: vi.fn((code, opts) => ({
    value: `<span class="hljs">${code}</span>`,
    language: opts.language,
  })),
  getLanguage: vi.fn(() => true),
  listLanguages: vi.fn(() => ['javascript', 'python', 'html', 'css']),
};

// Mock marked
global.marked = {
  parse: vi.fn(md =>
    md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^\*\* (.*$)/gim, '<ul><li>$1</li></ul>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
  ),
  setOptions: vi.fn(),
};

// Mock self for worker tests
global.self = {
  addEventListener: vi.fn(),
  postMessage: vi.fn(),
  importScripts: vi.fn(),
};

// Helper to reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  fetch.mockReset();
});
