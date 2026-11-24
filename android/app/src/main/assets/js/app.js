/* ==========================================================================
   Jarvis AI - Main Application Core (Chat, Sessions, Models & Controllers)
   ========================================================================== */

// $ / $$ / ls / ss / GoogleGenAI: do js/globals.js khai báo (nạp trước file này).
// ==========================================================================
// ALIAS MODEL REGISTRY
// Dữ liệu model + thinking levels đã tách sang js/model-registry.js (nạp trước
// file này trong index.html). Alias dưới đây giữ nguyên mọi tham chiếu cũ.
// ==========================================================================
const AUX_FALLBACK_MODELS = window.AUX_FALLBACK_MODELS;
const THINKING_LEVELS_BY_MODEL = window.THINKING_LEVELS_BY_MODEL;
const THINKING_LEVEL_LABELS = window.THINKING_LEVEL_LABELS;
const DEFAULT_THINKING_LEVELS = window.DEFAULT_THINKING_LEVELS;
const getModelThinkingLevels = window.getModelThinkingLevels;
const resolveThinkingLevel = window.resolveThinkingLevel;
const NVIDIA_DEFAULT_PROXY = window.NVIDIA_DEFAULT_PROXY;
const COMPAT_PROVIDERS = window.COMPAT_PROVIDERS;
const COMPAT_MODEL_OPTS = window.COMPAT_MODEL_OPTS;
const EXPLABS_MODELS = window.EXPLABS_MODELS;
const buildReasoningPayload = window.buildReasoningPayload;
const buildNvidiaThinking = window.buildNvidiaThinking;
const resolveCompatProvider = window.resolveCompatProvider;

// ==========================================================================
// ALIAS CHAT RENDER
// Phần render lịch sử chat đã tách sang js/chat-render.js (nạp trước file này).
// Alias cùng tên giữ nguyên mọi tham chiếu cũ trong app.js.
// ==========================================================================
const thinkingStats = window.thinkingStats;
const buildThinkingDetailsHtml = window.buildThinkingDetailsHtml;
const mergeThinkingSegments = window.mergeThinkingSegments;
const mergeAdjacentThinkingBlocks = window.mergeAdjacentThinkingBlocks;
const renderMsgContent = window.renderMsgContent;
const appendMsg = window.appendMsg;
const captureChatScroll = window.captureChatScroll;
const restoreChatScroll = window.restoreChatScroll;
const reRenderHistory = window.reRenderHistory;
const stripThinkingForCopy = window.stripThinkingForCopy;
const isThinkingHidden = window.isThinkingHidden;

// [escapeHtml: do js/globals.js khai báo]

// [Đã tách sang js/cipher.js: obfuscateKey / deobfuscateKey / sanitizeSessionForBackup]

SAFETY = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_CIVIC_INTEGRITY',
].map(category => ({ category, threshold: 'BLOCK_NONE' }));

// [getNowTime24h: do js/globals.js khai báo]

// [formatGoogleApiError: do js/globals.js khai báo]

// Chỉ trích xuất từ khóa tìm kiếm web khi người dùng bọc trong cặp dấu #từ khóa#.
// Dấu ngoặc kép chỉ còn là nhấn mạnh; # không bị markdown gạch ngang và rất hiếm khi xuất hiện trong câu văn.
const extractHashKeywords = t => {
  const m = Array.from((t || '').matchAll(/(?:^|[^\w#])#([^#\n]+)#(?!#)/g))
    .map(x => x[1].trim())
    .filter(Boolean);
  return m.length ? m.join(' ') : null;
};

// --- SEARCH CACHE ENGINE (Đã chuyển sang js/tools.js) ---

// --- FONT SIZE CONTROLLER ---
let currentFontSize = parseInt(ls.getItem('chat_font_size') || '16', 10);
const applyFontSize = sz => {
  currentFontSize = Math.min(Math.max(sz, 12), 26);
  document.documentElement.style.setProperty('--chat-font-size', currentFontSize + 'px');
  ls.setItem('chat_font_size', currentFontSize);
  if ($('font-size-label')) $('font-size-label').innerText = currentFontSize + 'px';
};
$('btn-font-dec').onclick = () => applyFontSize(currentFontSize - 1);
$('btn-font-inc').onclick = () => applyFontSize(currentFontSize + 1);
$('btn-font-reset').onclick = () => applyFontSize(16);
applyFontSize(currentFontSize);

// --- STREAM RENDERER WITH REQUEST ANIMATION FRAME ---
function createStreamRenderer(targetEl) {
  let pending = false,
    latest = '',
    rafId = null;
  return {
    push: text => {
      latest = text;
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(() => {
          try {
            let toRender = latest;
            const hideThinking = isThinkingHidden();
            if (hideThinking) {
              toRender = toRender
                .replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>/gi, '')
                .replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '');
            } else {
              toRender = toRender.replace(
                /<(?:thinking|thought)>([\s\S]*?)<\/(?:thinking|thought)>/gi,
                (m, p1) => buildThinkingDetailsHtml(p1)
              );
              toRender = mergeAdjacentThinkingBlocks(toRender);
            }
            targetEl.innerHTML = marked.parse(toRender, { sanitize: true });
          } catch (_) {}
          pending = false;
        });
      }
    },
    flush: async finalText => {
      if (rafId) cancelAnimationFrame(rafId);
      pending = false;
      await renderMsgContent(targetEl, finalText);
    },
  };
}

// --- REASONING ACCORDION & THINKING FORMATTER (GEMINI & DEEPSEEK) ---
function formatThinkingResponse(currentThinking, currentContent, modelDisplayName = 'AI') {
  const hideThinking = isThinkingHidden();

  // Gộp mọi đoạn suy luận (reasoning_content + thinking/thought trong content) về một chuỗi duy nhất
  const mergedSegments = mergeThinkingSegments(currentThinking, currentContent);
  let displayThinking = mergedSegments.thinking;
  let displayContent = mergedSegments.content;

  if (hideThinking) {
    if (displayContent) {
      return displayContent;
    } else {
      return `<div class="thinking-streaming"><span class="thinking-spinner">⏳</span> <em>${modelDisplayName} đang suy nghĩ...</em></div>`;
    }
  } else {
    const clean = displayThinking.trim();
    const { words, tokens } = thinkingStats(clean);

    if (displayContent) {
      const thinkingBlock = buildThinkingDetailsHtml(clean);
      return mergeAdjacentThinkingBlocks(
        thinkingBlock ? thinkingBlock + '\n\n' + displayContent : displayContent
      );
    } else if (clean) {
      return `<div class="thinking-streaming"><span class="thinking-spinner">⏳</span> <em>${modelDisplayName} đang suy luận (${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens)...</em></div>`;
    }
    return '';
  }
}

function formatFinalThinkingResponse(currentThinking, currentContent, modelDisplayName = 'AI') {
  const hideThinking = isThinkingHidden();

  // Gộp mọi đoạn suy luận (reasoning_content + thinking/thought trong content) về một chuỗi duy nhất
  const mergedSegments = mergeThinkingSegments(currentThinking, currentContent);
  let displayThinking = mergedSegments.thinking;
  let displayContent = mergedSegments.content;

  // FAIL-SAFE CHỐNG LỖI CHỈ CÓ SUY LUẬN MÀ KHÔNG CÓ CÂU TRẢ LỜI:
  // Nếu mô hình chỉ xuất phần suy luận mà quên xuất câu trả lời người dùng,
  // chuyển ngay nội dung suy luận thành câu trả lời để người dùng luôn nhận được kết quả hoàn chỉnh!
  if (!displayContent.trim() && displayThinking.trim()) {
    displayContent = displayThinking.trim();
    displayThinking = '';
  }

  if (hideThinking) {
    return displayContent;
  } else {
    const thinkingBlock = buildThinkingDetailsHtml(displayThinking);
    return mergeAdjacentThinkingBlocks(
      thinkingBlock ? thinkingBlock + '\n\n' + displayContent : displayContent
    );
  }
}

// --- EXPORT & TOOLS PROXIES (Đã chuyển sang js/export.js và js/tools.js) ---

// [Đã tách sang js/api-keys.js: render container 10 API keys + init + handlers]
// cfgMap vẫn giữ tại đây (getExternalConfigsObj dùng) và publish lên window
cfgMap = [
  ['global-context-input', 'jarvis_global_context'],
  ['tavily-key-input', 'tavily_api_key'],
  ['serper-key-input', 'serper_api_key'],
  ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
  ['web-extract-engine-input', 'web_extract_engine', 'auto'],
  ['nvidia-proxy-url', 'nvidia_proxy_url'],
  ['live-temperature', 'live_temperature', '0.7'],
];
if (typeof cfgMap !== 'undefined') window.cfgMap = cfgMap;

// Rút gọn lỗi thô của provider: OpenRouter thường trả metadata.raw là 1 khối JSON
// (vd Google: {"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}).
// Chỉ lấy message + mã lỗi để toast gọn, không dump cả JSON vào thông báo.
function formatUpstreamError(raw, httpStatus) {
  const text = String(raw || '').trim();
  if (!text) return httpStatus ? `HTTP ${httpStatus}` : '';
  let msg = '';
  let code = '';
  try {
    const j = JSON.parse(text);
    msg = j?.error?.message || j?.message || j?.detail || '';
    const c = j?.error?.code ?? j?.error?.status ?? j?.code ?? j?.status;
    if (c !== undefined && c !== null && c !== '') code = String(c);
  } catch (_) {
    // Không phải JSON: bắt cặp "message"/"code" dạng text, còn lại coi là message
    const mMsg = text.match(/"message"\s*:\s*"([^"]+)"/i);
    const mCode = text.match(/"code"\s*:\s*"?([A-Za-z0-9_.-]+)"?/i);
    msg = mMsg ? mMsg[1] : text;
    if (mCode) code = mCode[1];
  }
  msg = String(msg).replace(/\s+/g, ' ').trim();
  if (msg.length > 300) msg = msg.slice(0, 297) + '…';
  if (!code && httpStatus) code = String(httpStatus);
  if (!msg) return code ? `HTTP ${code}` : '';
  return code ? `${msg} (${code})` : msg;
}
if (typeof formatUpstreamError !== 'undefined') window.formatUpstreamError = formatUpstreamError;

// [Đã tách sang js/api-keys.js: initAPIKeys / initExternalConfigs + 3 button handlers + auto-init]
// [Đã tách sang js/database.js: IndexedDB engine (db, initDB, saveToDB, getAllFromDB, clearAllDB, file/TTS stores)]
// Giữ lại: syncSessionsToNative (native-only) + expose window.db/getDB do js/database.js gán khi initDB xong
let _nativeSyncTimer = null;
function syncSessionsToNative() {
  if (!window.JarvisNativeBridge) return;
  clearTimeout(_nativeSyncTimer);
  _nativeSyncTimer = setTimeout(async () => {
    try {
      const all = await getAllFromDB();
      if (all && all.length > 0) {
        saveToNativeBridge('jarvis_sessions_backup', JSON.stringify(all));
      }
    } catch {}
  }, 300);
}
if (typeof syncSessionsToNative !== 'undefined') window.syncSessionsToNative = syncSessionsToNative;

// --- DOM REFERENCES ---
DOM = {
  chat: $('chat-container'),
  input: $('user-input'),
  sendBtn: $('send-button'),
  fileUpload: $('file-upload'),
  previewBox: $('image-preview-container'),
  previewGrid: $('image-preview-grid'),
  textFileList: $('text-files-list'),
  clearFilesBtn: $('clear-all-images'),
  fileCount: $('file-count'),
  toast: $('toast'),
  folderSelect: null,
  btnNewFolder: null,
  btnDeleteFolder: null,
  selSession: $('session-select'),
  sysInst: $('system-instruction-input'),
  globContext: $('global-context-input'),
  model: $('model-select'),
  engineSel: $('engine-select'),
  apiKeySel: null, // Deprecated: use getGoogleKeySlot()/setGoogleKeySlot()
  toggleGlob: $('toggle-global-context'),
  toggleSearch: $('toggle-search'),
  searchEngineBox: $('search-engine-box'),
  searchEngineSel: $('search-engine-select'),
  toggleMemory: $('toggle-memory'),
  contextMsgCount: $('context-message-count'),
  toggleAutoSummary: $('toggle-auto-summary'),
  compactThreshold: $('compact-message-threshold'),
  btnManualCompact: $('btn-manual-compact'),
  compactStatusMsg: $('compact-status-msg'),
  compactSummaryPreview: $('compact-summary-preview'),
  btnResummarizeCompact: $('btn-resummarize-compact'),
  btnClearCompact: $('btn-clear-compact'),
  toggleRagEmbedding: $('toggle-rag-embedding'),
  btnToggleSessionMem: $('btn-toggle-session-memory'),
  sessionMemState: $('session-memory-state'),
  btnToggleRag: $('btn-toggle-rag-memory'),
  ragMemoryState: $('rag-memory-state'),
  temp: $('temperature') || { value: 0.5, addEventListener: () => {} },
  tempVal: $('temp-val') || { innerText: '' },
  topP: $('top-p') || { value: 0.9, addEventListener: () => {} },
  toppVal: $('topp-val') || { innerText: '' },
  topK: $('top-k') || { value: 40, addEventListener: () => {} },
  topkVal: $('topk-val') || { innerText: '' },
  thinking: $('thinking-level'),
  searchInput: $('search-chat-input'),
  scrollTopBtn: $('scroll-to-top'),
  snippetsContainer: $('snippets-container') || { style: {}, innerHTML: '' },
  btnToggleSnippets: $('btn-toggle-snippets') || { addEventListener: () => {}, onclick: null },
  btnFileLibrary: $('btn-file-library') || {
    addEventListener: () => {},
    click: () => {},
    onclick: null,
  },
  btnAddUrl: $('btn-add-url') || { addEventListener: () => {}, click: () => {}, onclick: null },
  btnTheme: $('btn-theme'),
  tabsContainer: $('tabs-container'),
};

// --- NGƯỠNG TIN NHẮN TỰ ĐỘNG NÉN NGỮ CẢNH (lưu vào localStorage) ---
let autoSummaryThreshold = parseInt(ls.getItem('jarvis_auto_summary_threshold') || '16', 10);
if (!Number.isFinite(autoSummaryThreshold) || autoSummaryThreshold < 6) autoSummaryThreshold = 16;
if (autoSummaryThreshold > 200) autoSummaryThreshold = 200;
if (DOM.compactThreshold) {
  DOM.compactThreshold.value = autoSummaryThreshold;
  DOM.compactThreshold.addEventListener('change', () => {
    const v = parseInt(DOM.compactThreshold.value, 10);
    if (Number.isFinite(v) && v >= 6 && v <= 200) {
      autoSummaryThreshold = v;
      ls.setItem('jarvis_auto_summary_threshold', String(v));
    } else {
      DOM.compactThreshold.value = autoSummaryThreshold;
    }
  });
}
if (DOM.btnManualCompact) {
  DOM.btnManualCompact.addEventListener('click', async () => {
    const cs = sessions.find(x => x.id === activeId);
    if (!cs) {
      showToast('⚠️ Chưa có phiên nào đang mở!', 'warning');
      return;
    }
    if (!chatHistory || chatHistory.length < 4) {
      showToast('⚠️ Cần ít nhất 4 tin nhắn để nén ngữ cảnh!', 'warning');
      return;
    }
    const label = DOM.btnManualCompact.innerHTML;
    DOM.btnManualCompact.disabled = true;
    DOM.btnManualCompact.innerHTML = '⏳ Đang nén ngữ cảnh...';
    if (DOM.compactStatusMsg) DOM.compactStatusMsg.textContent = 'Đang tóm tắt các tin nhắn cũ...';
    const ok = await condenseSessionMemory(cs, true);
    DOM.btnManualCompact.disabled = false;
    DOM.btnManualCompact.innerHTML = label;
    if (DOM.compactStatusMsg)
      DOM.compactStatusMsg.textContent = ok
        ? '✅ Đã cập nhật bộ nhớ tóm tắt cho phiên này.'
        : '⚠️ Chưa nén được — cần Google API Key hoặc phiên chưa đủ tin nhắn.';
  });
}
if (DOM.btnResummarizeCompact) {
  DOM.btnResummarizeCompact.addEventListener('click', async () => {
    const cs = sessions.find(x => x.id === activeId);
    if (!cs) {
      showToast('⚠️ Chưa có phiên nào đang mở!', 'warning');
      return;
    }
    if (!chatHistory || chatHistory.length < 4) {
      showToast('⚠️ Cần ít nhất 4 tin nhắn để tóm tắt lại!', 'warning');
      return;
    }
    const label = DOM.btnResummarizeCompact.innerHTML;
    const oldSummary = cs.summaryMemory;
    const oldLastCond = cs.lastCondensedLength;
    DOM.btnResummarizeCompact.disabled = true;
    DOM.btnResummarizeCompact.innerHTML = '⏳ Đang tóm tắt...';
    if (DOM.compactStatusMsg)
      DOM.compactStatusMsg.textContent = 'Đang tóm tắt lại toàn bộ hội thoại...';
    cs.summaryMemory = '';
    cs.lastCondensedLength = 0;
    const ok = await condenseSessionMemory(cs, true);
    if (!ok) {
      cs.summaryMemory = oldSummary;
      cs.lastCondensedLength = oldLastCond;
      await saveToDB(cs);
    }
    DOM.btnResummarizeCompact.disabled = false;
    DOM.btnResummarizeCompact.innerHTML = label;
    if (!ok && DOM.compactStatusMsg)
      DOM.compactStatusMsg.textContent = '⚠️ Nén thất bại — đã khôi phục bộ nhớ cũ.';
  });
}
if (DOM.btnClearCompact) {
  DOM.btnClearCompact.addEventListener('click', async () => {
    const cs = sessions.find(x => x.id === activeId);
    if (!cs) {
      showToast('⚠️ Chưa có phiên nào đang mở!', 'warning');
      return;
    }
    if (!cs.summaryMemory && !cs.lastCondensedLength) {
      showToast('Phiên này chưa có bộ nhớ tóm tắt.', 'info');
      return;
    }
    cs.summaryMemory = '';
    cs.lastCondensedLength = 0;
    await saveToDB(cs);
    renderCompactSummary();
    if (DOM.compactStatusMsg)
      DOM.compactStatusMsg.textContent = 'Đã xoá bộ nhớ tóm tắt của phiên này.';
    showToast('🗑️ Đã xoá bộ nhớ tóm tắt!', 'success');
  });
}

// --- SỐ TIN NHẮN NGỮ CẢNH GỬI ĐI KÈM CHO generateContentStream (lưu vào localStorage) ---
let contextMsgCount = parseInt(ls.getItem('jarvis_context_messages') || '10', 10);
if (!contextMsgCount || contextMsgCount < 1) contextMsgCount = 10;
if (DOM.contextMsgCount) {
  DOM.contextMsgCount.value = contextMsgCount;
  DOM.contextMsgCount.addEventListener('change', () => {
    const v = parseInt(DOM.contextMsgCount.value, 10);
    if (Number.isFinite(v) && v >= 1 && v <= 200) {
      contextMsgCount = v;
      ls.setItem('jarvis_context_messages', String(contextMsgCount));
    } else {
      DOM.contextMsgCount.value = contextMsgCount;
    }
  });
}

// --- GOOGLE KEY SLOT HELPERS (replaces DOM.apiKeySel) ---
const GOOGLE_SLOT_KEY = 'jarvis_selected_google_slot';
function getGoogleKeySlot() {
  return ls.getItem(GOOGLE_SLOT_KEY) || 'auto';
}
function setGoogleKeySlot(val) {
  ls.setItem(GOOGLE_SLOT_KEY, val);
  // Sync unified key-pool-select if it's currently showing Google keys
  const kpSel = $('key-pool-select');
  if (kpSel && activeKeyPoolKind() === 'google') {
    if ([...kpSel.options].some(o => o.value === val)) kpSel.value = val;
  }
}

// Helper to get active key pool kind (mirrors api-keys.js)
// Ưu tiên data-provider của option trong #model-select (optgroup), fallback resolveCompatProvider
function activeKeyPoolKind() {
  const model = (DOM.model?.value || '').trim();
  if (typeof window.DynamicProviders?.getSelectedModelProvider === 'function') {
    const providerFromSelect = window.DynamicProviders.getSelectedModelProvider();
    if (providerFromSelect) return providerFromSelect;
  }
  const compat =
    typeof window.resolveCompatProvider === 'function' ? window.resolveCompatProvider(model) : null;
  if (compat && compat.provider) return compat.provider.id;
  const expModels = Array.isArray(window.EXPLABS_MODELS) ? window.EXPLABS_MODELS : [];
  return expModels.includes(model) ? 'explabs' : 'google';
}

// Export for quota.js and other modules
if (typeof getGoogleKeySlot !== 'undefined') window.getGoogleKeySlot = getGoogleKeySlot;
if (typeof setGoogleKeySlot !== 'undefined') window.setGoogleKeySlot = setGoogleKeySlot;
if (typeof activeKeyPoolKind !== 'undefined') window.activeKeyPoolKind = activeKeyPoolKind;

// Global bindings & live proxies for modular access across js/live.js, js/arena.js, js/tts.js, js/quota.js, js/medication.js
if (typeof DOM !== 'undefined') window.DOM = DOM;
if (typeof SAFETY !== 'undefined') window.SAFETY = SAFETY;
if (typeof FLASH_LITE_MODEL !== 'undefined') window.FLASH_LITE_MODEL = FLASH_LITE_MODEL;
// [window.DB_NAME / STORE_NAME / FILE_STORE / TTS_STORE: do js/database.js expose]
window.getSessionApiKey = (cs, forceRotate) => getSessionApiKey(cs, forceRotate);
// DEBUG: gọi jarvisDebug() trong Console để lấy số liệu chẩn đoán.
// (Không dùng copy() vì app đã định nghĩa window.copy riêng cho nút Copy Code.)
window.jarvisDebug = () => console.log(JSON.stringify(window.__jarvisTurnDebug || null, null, 1));

window.fallbackBrowserDownload = (blob, fn) => fallbackBrowserDownload(blob, fn);
// [window.saveToDB / getAllFromDB / clearAllDB / initDB / getDB: do js/database.js expose]
window.switchSess = id => switchSess(id);
window.renderSel = () => renderSel();
window.updateTokenCount = () => updateTokenCount();
window.newSess = () => newSess();

// --- TIỆN ÍCH CUỘN VÀ KÉO NGANG BẰNG CHUỘT TRÊN PC (HORIZONTAL MOUSE WHEEL & SAFE GRAB SCROLL) ---
function enableHorizontalScrollAndDrag(el) {
  if (!el || el._hScrollInit) return;
  el._hScrollInit = true;

  // 1. Chặn trình duyệt kéo chữ mặc định (HTML5 drag) làm đơ chuột khi rê qua tab
  el.addEventListener('dragstart', e => {
    e.preventDefault();
  });

  // 2. Chuyển đổi con lăn chuột dọc sang cuộn ngang mượt mà trên PC
  el.addEventListener(
    'wheel',
    e => {
      if (e.deltaY !== 0) {
        if (el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaY * 1.2;
        }
      } else if (e.deltaX !== 0) {
        el.scrollLeft += e.deltaX;
      }
    },
    { passive: false }
  );

  // 3. Kéo thả chuột ngang an toàn (Grab-to-scroll, không chặn click thông thường)
  let isDown = false;
  let isDragging = false;
  let suppressClick = false;
  let startX = 0;
  let scrollStart = 0;

  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return; // Chỉ nhận chuột trái
    if (e.target.tagName === 'INPUT' || e.target.classList.contains('tab-close')) return;

    isDown = true;
    isDragging = false;
    suppressClick = false;
    startX = e.pageX;
    scrollStart = el.scrollLeft;
  });

  window.addEventListener('mousemove', e => {
    if (!isDown) return;
    const dx = e.pageX - startX;

    // Chỉ chuyển sang trạng thái Drag khi rê chuột vượt quá 10px (tránh kích hoạt nhầm khi bấm click)
    if (!isDragging && Math.abs(dx) > 10) {
      isDragging = true;
      suppressClick = true;
      el.classList.add('is-dragging-scroll');
    }

    if (isDragging) {
      el.scrollLeft = scrollStart - dx;
    }
  });

  const endDrag = () => {
    if (!isDown) return;
    isDown = false;
    if (isDragging) {
      el.classList.remove('is-dragging-scroll');
      // Giữ cờ chặn click trong 80ms để hủy sự kiện click xuất hiện ngay sau khi thả chuột
      setTimeout(() => {
        isDragging = false;
        suppressClick = false;
      }, 80);
    } else {
      isDragging = false;
      suppressClick = false;
    }
  };

  window.addEventListener('mouseup', endDrag);

  // Chặn sự kiện click DUY NHẤT khi người dùng thực hiện thao tác kéo rê chuột
  el.addEventListener(
    'click',
    e => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        suppressClick = false;
      }
    },
    true
  );
}

if (typeof enableHorizontalScrollAndDrag !== 'undefined')
  window.enableHorizontalScrollAndDrag = enableHorizontalScrollAndDrag;
enableHorizontalScrollAndDrag(DOM.tabsContainer);
enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
enableHorizontalScrollAndDrag($('image-preview-grid'));

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
Object.defineProperty(window, 'liveKeyIndex', {
  get: () => liveKeyIndex,
  set: v => {
    liveKeyIndex = v;
  },
  configurable: true,
});
Object.defineProperty(window, 'liveRetryCount', {
  get: () => liveRetryCount,
  set: v => {
    liveRetryCount = v;
  },
  configurable: true,
});
// OpenRouter 5-key state: js/api-keys.js gán qua setter, app.js đọc qua getter
// (không được tham chiếu window.* trong getter/setter của chính nó → đệ quy vô hạn).
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
// [window.db: do js/database.js gán trực tiếp khi initDB xong]
Object.defineProperty(window, 'oLay', {
  get: () => oLay,
  set: v => {
    oLay = v;
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
// [window.deobfuscateKey / obfuscateKey: do js/cipher.js expose]

// --- PROMPT LIBRARY & COMMAND PALETTE (Đã chuyển sang js/commands.js) ---

// --- SWIPE GESTURES FOR MOBILE ---
let touchStartX = 0,
  touchStartY = 0;
window.addEventListener(
  'touchstart',
  e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);

window.addEventListener(
  'touchend',
  e => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    if (touchStartX < 40 && diffX > 70 && Math.abs(diffY) < 60) {
      $('sidebar').classList.add('active');
      $('sidebar-overlay').classList.add('active');
    }
    if ($('sidebar').classList.contains('active') && diffX < -70 && Math.abs(diffY) < 60) {
      $('sidebar').classList.remove('active');
      $('sidebar-overlay').classList.remove('active');
    }
  },
  { passive: true }
);

// --- LOCAL FALLBACK TITLE GENERATOR ---
function generateLocalFallbackTitle(text) {
  if (!text) return '';
  let clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/["'“”«»#*_\n\r\t]/g, ' ')
    .trim();
  let prev;
  do {
    prev = clean;
    clean = clean
      .replace(
        /^(hãy|bạn hãy|xin hãy|cho tôi hỏi|cho hỏi|nhờ bạn|giúp tôi|làm sao để|làm thế nào để|hướng dẫn|giải thích|tóm tắt|viết|tạo|cách|tìm|so sánh|vui lòng|please|how to|can you|explain|what is)\s+/i,
        ''
      )
      .trim();
  } while (clean !== prev);

  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const title = words.slice(0, 5).join(' ');
  return title.charAt(0).toUpperCase() + title.slice(1);
}
if (typeof generateLocalFallbackTitle !== 'undefined')
  window.generateLocalFallbackTitle = generateLocalFallbackTitle;

// --- AUTO-NAME SESSION ---
async function tryAutoNameSession(sessionObj, userText, botText, preferredKey = null) {
  if (!sessionObj) return;
  const normName = (sessionObj.name || '').normalize('NFC').trim();
  const isDefault = !normName || /^(hội thoại|phiên|cuộc trò chuyện|new session)/i.test(normName);
  if (!isDefault || sessionObj.isCustomNamed || sessionObj.isAutoNamed) return;

  const k = preferredKey || getSessionApiKey(sessionObj) || (apiKeys.length ? apiKeys[0] : '');
  if (!k) return;

  const promptUserPart = (userText || '').slice(0, 180).trim();
  const promptBotPart = (botText || '').slice(0, 180).trim();
  const promptText = `Tóm tắt chủ đề chính của câu hỏi người dùng thành một tiêu đề ngắn gọn súc tích từ 3 đến 6 từ bằng tiếng Việt (chỉ trả về đúng tiêu đề, không dùng dấu ngoặc kép, không thêm lời giải thích hay tiền tố):\nNgười dùng: "${promptUserPart}"\nAI: "${promptBotPart}"`;

  let title = '';

  // Cố gắng gọi AI: Bắt buộc dùng Flash-Lite với thinking tắt hoàn toàn để tiết kiệm quota
  const candidateModels = AUX_FALLBACK_MODELS;

  for (const mod of candidateModels) {
    if (!mod) continue;
    try {
      const ai = new GoogleGenAI({ apiKey: k });
      const res = await ai.models.generateContent({
        model: mod,
        contents: promptText,
        config: {
          safetySettings: SAFETY,
          maxOutputTokens: 100,
          temperature: 0.4,
        },
      });

      let raw = '';
      try {
        raw = res.text || '';
      } catch (_) {}
      if (!raw && res.candidates?.[0]?.content?.parts) {
        raw = res.candidates[0].content.parts
          .filter(p => !p.thought && typeof p.text === 'string')
          .map(p => p.text)
          .join(' ')
          .trim();
      }

      raw = raw
        .replace(/["“«»”*\n#:]/g, '')
        .replace(/^(tiêu đề|chủ đề|tóm tắt):\s*/i, '')
        .trim();

      if (raw && raw.length >= 2) {
        title = raw;
        break;
      }
    } catch (mErr) {
      console.warn(`[Auto-Name] Thử model ${mod} không thành công:`, mErr?.message || mErr);
    }
  }

  // Nếu tất cả AI models đều không trả về được, dùng Local Fallback từ câu hỏi đầu tiên
  if (!title || title.length < 2) {
    title = generateLocalFallbackTitle(userText);
  }

  if (title.length > 35) title = title.slice(0, 35).trim() + '...';

  if (title && title.length >= 2) {
    sessionObj.name = title;
    sessionObj.isAutoNamed = true;
    await saveToDB(sessionObj);
    renderSel();
    renderTabs();
    showToast(`🏷️ Đã tự động đặt tên: "${title}"`, 'info');
  }
}

// --- HIỂN THỊ BỘ NHỚ TÓM TẮT CỦA PHIÊN ĐANG MỞ ---
function renderCompactSummary() {
  const box = DOM.compactSummaryPreview;
  if (!box) return;
  const cs = sessions.find(x => x.id === activeId);
  const txt = (cs?.summaryMemory || '').trim();
  box.textContent = txt || 'Chưa có bộ nhớ tóm tắt cho phiên này.';
  box.style.fontStyle = txt ? 'normal' : 'italic';
  box.style.opacity = txt ? '1' : '0.7';
}

// --- AUTO-SUMMARY LONG-TERM MEMORY (NÉN LỊCH SỬ DÀI) ---
// force = true khi người dùng bấm nút nén thủ công (bỏ qua ngưỡng + checkbox)
async function condenseSessionMemory(sessionObj, force = false) {
  if (!sessionObj || !chatHistory || chatHistory.length < 4) return false;
  if (
    !force &&
    (chatHistory.length <= autoSummaryThreshold || DOM.toggleAutoSummary?.checked === false)
  )
    return false;
  const lastCond = sessionObj.lastCondensedLength || 0;
  if (!force && chatHistory.length - lastCond < 10) return false;

  const k = getSessionApiKey(sessionObj);
  if (!k) {
    if (force) showToast('⚠️ Cần Google API Key để nén ngữ cảnh!', 'warning');
    return false;
  }

  const keepRecent = Math.min(10, Math.max(2, chatHistory.length - 2));
  try {
    const toSummarize = chatHistory
      .slice(0, chatHistory.length - keepRecent)
      .map(
        m => `${m.role === 'model' ? 'AI' : 'User'}: ${stripThinkingForCopy(m.text).slice(0, 300)}`
      )
      .join('\n');
    const prevSummary = sessionObj.summaryMemory
      ? `[Bối cảnh cốt lõi trước đó]:\n${sessionObj.summaryMemory}\n\n[Diễn biến mới cần cập nhật]:\n`
      : '';
    const promptText = `Hãy cập nhật và cô đọng các thông tin quan trọng, ngữ cảnh và các quyết định cốt lõi trong đoạn hội thoại sau thành 1 đoạn ngắn gọn (khoảng 3-5 gạch đầu dòng):\n\n${prevSummary}${toSummarize}`;

    const ai = new GoogleGenAI({ apiKey: k });
    let res = null;
    for (const m of AUX_FALLBACK_MODELS) {
      try {
        res = await ai.models.generateContent({
          model: m,
          contents: promptText,
          config: {
            safetySettings: SAFETY,
            temperature: 0.3,
          },
        });
        if (res && res.text) break;
      } catch (mErr) {
        console.warn(`[Auto-Summary] Model ${m} lỗi:`, mErr?.message || mErr);
      }
    }

    if (res && res.text) {
      sessionObj.summaryMemory = res.text.trim();
      sessionObj.lastCondensedLength = chatHistory.length;
      await saveToDB(sessionObj);
      console.log('[Auto-Summary] Đã nén trí nhớ dài hạn thành công:', sessionObj.summaryMemory);
      if (force) showToast('🗜️ Đã nén ngữ cảnh thành công!', 'success');
      renderCompactSummary();
      return true;
    }
    if (force) showToast('⚠️ Model không trả về nội dung tóm tắt.', 'warning');
    return false;
  } catch (e) {
    console.warn('Lỗi tóm tắt bộ nhớ dài:', e);
    if (force) showToast('⚠️ Lỗi khi nén ngữ cảnh: ' + (e?.message || e), 'danger');
    return false;
  }
}

// --- CONVERSATION BRANCHING (RẼ NHÁNH HỘI THOẠI) ---
window.forkSessionAt = async index => {
  const curS = sessions.find(x => x.id === activeId);
  if (!curS || index < 0 || index >= chatHistory.length) return;

  const newForkId = 's_fork_' + Date.now();
  const forkedHistory = JSON.parse(JSON.stringify(chatHistory.slice(0, index + 1)));
  const baseName = curS.name.replace(/\s*\(Nhánh.*?\)$/, '');

  const newS = {
    ...curS,
    id: newForkId,
    name: `🌿 ${baseName} (Nhánh ${index + 1})`,
    his: forkedHistory,
    lastInteractionId: null,
    assignedApiKey: null,
    orderIndex: Date.now(),
  };

  sessions.unshift(newS);
  await saveToDB(newS);
  await switchSess(newForkId);
  showToast(`🌿 Đã rẽ nhánh sang phiên mới từ tin #${index + 1}!`);
};

// --- FEATURE 2: DAILY BRIEFING (Đã chuyển sang js/briefing.js) ---

// --- FEATURE 3: HANDS-FREE VOICE FLOW CONTROLLER (HARDWARE-GRADE getUserMedia + GEMINI STT) ---
let isHandsFreeActive = false;
let isHandsFreeSpeaking = false;
let handsFreeMediaStream = null;
let handsFreeAudioCtx = null;
let handsFreeAnalyser = null;
let handsFreeRecorder = null;
let handsFreeAudioChunks = [];
let handsFreeVadInterval = null;
let isHandsFreeUserTalking = false;
let handsFreeSpeechStartTime = 0;
let handsFreeTranscribeController = null;

function stopHandsFreeVoice() {
  if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
  }
  isHandsFreeActive = false;
  isHandsFreeSpeaking = false;
  isHandsFreeUserTalking = false;
  handsFreeSpeechStartTime = 0;

  if (handsFreeVadInterval) {
    clearInterval(handsFreeVadInterval);
    handsFreeVadInterval = null;
  }

  if (handsFreeTranscribeController) {
    try {
      handsFreeTranscribeController.abort();
    } catch (_) {}
    handsFreeTranscribeController = null;
  }

  if (handsFreeRecorder && handsFreeRecorder.state !== 'inactive') {
    try {
      handsFreeRecorder.onstop = null;
      handsFreeRecorder.stop();
    } catch (_) {}
  }
  handsFreeRecorder = null;
  handsFreeAudioChunks = [];

  if (handsFreeMediaStream) {
    try {
      handsFreeMediaStream.getTracks().forEach(track => track.stop());
    } catch (_) {}
    handsFreeMediaStream = null;
  }

  if (handsFreeAudioCtx && handsFreeAudioCtx.state !== 'closed') {
    try {
      handsFreeAudioCtx.close();
    } catch (_) {}
    handsFreeAudioCtx = null;
  }
  handsFreeAnalyser = null;
  stopCurrentSpeaking();

  const banner = $('hands-free-banner');
  if (banner) banner.style.display = 'none';

  const micBtn = $('btn-hands-free-voice');
  if (micBtn) micBtn.classList.remove('active');

  const chipBtn = $('btn-toggle-hands-free-chip');
  if (chipBtn) chipBtn.classList.remove('active');

  const btnSendHf = $('btn-send-hands-free');
  if (btnSendHf) btnSendHf.style.display = 'none';
}
if (typeof stopHandsFreeVoice !== 'undefined') window.stopHandsFreeVoice = stopHandsFreeVoice;

async function processHandsFreeAudioBlob(blob) {
  if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;
  const statusText = $('hf-status-text');
  const preview = $('hf-transcript-preview');
  const btnSendHf = $('btn-send-hands-free');
  if (btnSendHf) btnSendHf.style.display = 'none';

  try {
    if (statusText)
      statusText.innerHTML =
        '<span style="color:#8b5cf6;font-weight:600;">⚡ Đang chuyển giọng nói thành chữ...</span>';

    // 1. Chuyển Blob sang base64
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const res = reader.result;
        const b64 = typeof res === 'string' ? res.split(',')[1] : '';
        resolve(b64);
      };
      reader.onerror = reject;
    });
    reader.readAsDataURL(blob);
    const base64Data = await base64Promise;

    if (!base64Data) throw new Error('Không thể đọc dữ liệu âm thanh');

    // 2. Chuẩn hóa MIME type bare (Gemini API bắt buộc MIME type thuần, không có tham số ;codecs=...)
    let rawType = (blob.type || handsFreeRecorder?.mimeType || 'audio/webm').toLowerCase();
    let cleanMime = rawType.split(';')[0].trim();
    if (cleanMime.includes('webm')) cleanMime = 'audio/webm';
    else if (cleanMime.includes('mp4') || cleanMime.includes('m4a') || cleanMime.includes('aac'))
      cleanMime = 'audio/mp4';
    else if (cleanMime.includes('wav')) cleanMime = 'audio/wav';
    else if (cleanMime.includes('ogg')) cleanMime = 'audio/ogg';
    else cleanMime = 'audio/webm';

    // 3. Lấy danh sách API Key hợp lệ (Giải mã nếu có tiền tố mã hóa, tuyệt đối không gọi getGoogleKeysList(true))
    let availableKeys =
      typeof apiKeys !== 'undefined' && Array.isArray(apiKeys) && apiKeys.length
        ? [...apiKeys]
        : [];
    if (!availableKeys.length) {
      const raw = getGoogleKeysList(false).filter(Boolean);
      availableKeys = raw
        .map(k => {
          let clean = (k || '').trim();
          if (clean.startsWith('JVENC_') || clean.startsWith('ENC_')) clean = deobfuscateKey(clean);
          return clean;
        })
        .filter(Boolean);
    }

    if (!availableKeys.length) {
      showToast('Cần ít nhất 1 Google API Key trong Cài đặt!', 'danger');
      stopHandsFreeVoice();
      return;
    }

    // Ưu tiên key đang gán cho phiên hiện tại, sau đó đến các key còn lại
    const currentSession = sessions.find(x => x.id === activeId);
    const preferredKey =
      typeof getSessionApiKey === 'function' ? getSessionApiKey(currentSession) : null;
    const candidateKeys = [];
    if (preferredKey && availableKeys.includes(preferredKey)) candidateKeys.push(preferredKey);
    for (const k of availableKeys) {
      if (!candidateKeys.includes(k)) candidateKeys.push(k);
    }

    // 4. Chuyển giọng nói sang văn bản tiếng Việt với cơ chế Xoay Key & Fallback Model Flash-Lite (thinking tắt hoàn toàn)
    handsFreeTranscribeController = new AbortController();
    const candidateTranscribeModels = AUX_FALLBACK_MODELS;
    let spokenText = '';
    let lastErr = null;

    keyLoop: for (let kIdx = 0; kIdx < candidateKeys.length; kIdx++) {
      const activeKey = candidateKeys[kIdx];
      let ai;
      try {
        ai = new GoogleGenAI({ apiKey: activeKey });
      } catch (initErr) {
        lastErr = initErr;
        continue;
      }

      for (const mod of candidateTranscribeModels) {
        try {
          const res = await ai.models.generateContent({
            model: mod,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: base64Data,
                    },
                  },
                  {
                    text: 'Nghe đoạn ghi âm tiếng Việt này và chỉ chép lại đúng văn bản những gì người nói. Tuyệt đối không thêm lời dẫn, không giải thích, không dùng ngoặc kép.',
                  },
                ],
              },
            ],
            config: {
              maxOutputTokens: 500,
            },
          });
          spokenText = (res.text || '').trim();
          if (!spokenText && res.candidates?.[0]?.content?.parts) {
            spokenText = res.candidates[0].content.parts
              .map(p => p.text || '')
              .join('')
              .trim();
          }
          if (spokenText) break keyLoop;
        } catch (tErr) {
          lastErr = tErr;
          console.warn(
            `[HandsFree STT] Key #${kIdx + 1} (${activeKey.substring(0, 6)}...) - Model ${mod} lỗi (${cleanMime}):`,
            tErr.message
          );
        }
      }
    }

    // Nếu tất cả key & model đều lỗi (ví dụ rớt mạng hoàn toàn)
    if (!spokenText && lastErr) {
      console.error('[HandsFree STT] Thất bại chuyển âm thanh:', lastErr);
      if (statusText)
        statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">❌ Lỗi: ${lastErr.message || 'Thất bại'}</span>`;
      setTimeout(() => {
        if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
          startHandsFreeRecorder();
        }
      }, 1200);
      return;
    }

    spokenText = spokenText
      .replace(
        /^(người dùng nói|người nói|câu nói|văn bản|nội dung|bản chép|transcript|transcription):\s*/i,
        ''
      )
      .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
      .trim();

    // 5. Nếu không có từ nào rõ ràng (tiếng thở, tiếng ồn nhẹ): Tiếp tục lắng nghe
    if (!spokenText) {
      console.info('[HandsFree] Không phát hiện từ ngữ rõ ràng.');
      if (statusText)
        statusText.innerHTML =
          '<span style="color:var(--text-muted);">👂 Chưa nghe rõ, đang lắng nghe lại...</span>';
      setTimeout(() => {
        if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
          startHandsFreeRecorder();
        }
      }, 350);
      return;
    }

    // 6. Cập nhật giao diện & gán nội dung vào ô nhập text
    if (preview) {
      preview.innerText = `"${spokenText}"`;
      preview.title = spokenText;
    }
    if (statusText) {
      statusText.innerHTML = `<span style="color:#6366f1;font-weight:600;">✍️ Đã nghe: "${spokenText.slice(0, 32)}${spokenText.length > 32 ? '...' : ''}"</span>`;
    }

    DOM.input.value = spokenText;
    DOM.input.style.height = 'auto';
    DOM.input.style.height = Math.min(DOM.input.scrollHeight, 180) + 'px';
    DOM.input.dispatchEvent(new Event('input'));

    if (statusText)
      statusText.innerHTML =
        '<span style="color:#8b5cf6;font-weight:600;">🚀 Đang gửi cho Jarvis...</span>';
    DOM.sendBtn.click();
  } catch (err) {
    console.error('Lỗi chuyển đổi giọng nói rảnh tay:', err);
    if (statusText)
      statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">⚠️ Lỗi: ${err.message || 'Thử lại'}</span>`;
    setTimeout(() => {
      if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
        startHandsFreeRecorder();
      }
    }, 800);
  } finally {
    handsFreeTranscribeController = null;
  }
}

async function startHandsFreeRecorder() {
  if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;

  const statusText = $('hf-status-text');
  const btnSendHf = $('btn-send-hands-free');

  try {
    // Dừng recorder cũ nếu còn đang chạy
    if (handsFreeRecorder && handsFreeRecorder.state !== 'inactive') {
      try {
        handsFreeRecorder.onstop = null;
        handsFreeRecorder.stop();
      } catch (_) {}
    }
    if (handsFreeVadInterval) {
      clearInterval(handsFreeVadInterval);
      handsFreeVadInterval = null;
    }

    // Khởi tạo MediaStream (chuẩn micro phần cứng, chạy mượt trên Android/iOS Safari/PWA)
    if (!handsFreeMediaStream || !handsFreeMediaStream.active) {
      handsFreeMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }

    // Khởi tạo AudioContext để phân tích năng lượng giọng nói thời gian thực (VAD)
    if (!handsFreeAudioCtx || handsFreeAudioCtx.state === 'closed') {
      handsFreeAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (handsFreeAudioCtx.state === 'suspended') {
      await handsFreeAudioCtx.resume();
    }

    const source = handsFreeAudioCtx.createMediaStreamSource(handsFreeMediaStream);
    handsFreeAnalyser = handsFreeAudioCtx.createAnalyser();
    handsFreeAnalyser.fftSize = 512;
    source.connect(handsFreeAnalyser);

    // Tìm mimeType hỗ trợ trên thiết bị (ưu tiên Opus WebM, fallback MP4 cho iOS)
    let mimeType = 'audio/webm;codecs=opus';
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }
    }

    handsFreeAudioChunks = [];
    const options = mimeType ? { mimeType } : undefined;
    handsFreeRecorder = new MediaRecorder(handsFreeMediaStream, options);

    handsFreeRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        handsFreeAudioChunks.push(e.data);
      }
    };

    handsFreeRecorder.onstop = async () => {
      if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;
      const blobType = handsFreeRecorder?.mimeType || mimeType || 'audio/webm';
      const recordedBlob = new Blob(handsFreeAudioChunks, { type: blobType });
      handsFreeAudioChunks = [];

      if (recordedBlob.size > 300 && isHandsFreeUserTalking) {
        await processHandsFreeAudioBlob(recordedBlob);
      } else {
        // Chưa có âm thanh hợp lệ, tiếp tục lượt nghe mới
        if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
          setTimeout(() => startHandsFreeRecorder(), 150);
        }
      }
    };

    handsFreeRecorder.start(250);
    isHandsFreeUserTalking = false;
    handsFreeSpeechStartTime = 0;

    if (statusText)
      statusText.innerHTML =
        '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
    if (btnSendHf) btnSendHf.style.display = 'none';

    // Voice Activity Detection (VAD) Loop: kiểm tra mỗi 60ms
    const pcmData = new Uint8Array(handsFreeAnalyser.frequencyBinCount);
    let consecutiveSilenceMs = 0;
    const VAD_THRESHOLD = 7; // Ngưỡng âm lượng nhạy cho dải tần số tiếng người (80Hz - 3800Hz)
    const SILENCE_COMMIT_MS = 950; // Gần 1 giây im lặng là hoàn tất câu nói

    handsFreeVadInterval = setInterval(() => {
      if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing || !handsFreeAnalyser) {
        return;
      }

      handsFreeAnalyser.getByteFrequencyData(pcmData);
      // Tập trung vào dải tần số tiếng người (80Hz - 3800Hz, bins 1 đến 45)
      let voiceSum = 0;
      const voiceBins = Math.min(45, pcmData.length);
      for (let i = 1; i < voiceBins; i++) voiceSum += pcmData[i];
      const voiceEnergy = voiceSum / (voiceBins - 1);

      if (voiceEnergy > VAD_THRESHOLD) {
        consecutiveSilenceMs = 0;
        if (!isHandsFreeUserTalking) {
          isHandsFreeUserTalking = true;
          handsFreeSpeechStartTime = Date.now();
          if (statusText)
            statusText.innerHTML =
              '<span style="color:#3b82f6;font-weight:600;">🎙️ Đang nghe giọng nói...</span>';
          if (btnSendHf) btnSendHf.style.display = 'inline-flex';
        }
      } else if (isHandsFreeUserTalking) {
        consecutiveSilenceMs += 60;
        const isOverMax = Date.now() - handsFreeSpeechStartTime > 25000;
        if (consecutiveSilenceMs >= SILENCE_COMMIT_MS || isOverMax) {
          clearInterval(handsFreeVadInterval);
          handsFreeVadInterval = null;
          if (statusText)
            statusText.innerHTML =
              '<span style="color:#f59e0b;font-weight:600;">⏳ Đang hoàn tất câu nói...</span>';
          if (handsFreeRecorder && handsFreeRecorder.state === 'recording') {
            handsFreeRecorder.stop();
          }
        }
      }
    }, 60);
  } catch (err) {
    console.error('Lỗi bật micro phần cứng:', err);
    if (statusText)
      statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">❌ Lỗi Micro: ${err.message || 'Bị chặn quyền'}</span>`;
    showToast(
      'Không thể truy cập Microphone! Hãy cấp quyền micro trong cài đặt điện thoại hoặc trình duyệt.',
      'danger'
    );
    stopHandsFreeVoice();
  }
}
if (typeof startHandsFreeRecorder !== 'undefined')
  window.startHandsFreeRecorder = startHandsFreeRecorder;
window.startHandsFreeListener = startHandsFreeRecorder;

function commitAndSendHandsFree() {
  if (handsFreeVadInterval) {
    clearInterval(handsFreeVadInterval);
    handsFreeVadInterval = null;
  }
  isHandsFreeUserTalking = true;
  if (handsFreeRecorder && handsFreeRecorder.state === 'recording') {
    const statusText = $('hf-status-text');
    if (statusText)
      statusText.innerHTML =
        '<span style="color:#f59e0b;font-weight:600;">⏳ Đang gửi ngay...</span>';
    handsFreeRecorder.stop();
  }
}
if (typeof commitAndSendHandsFree !== 'undefined')
  window.commitAndSendHandsFree = commitAndSendHandsFree;

async function toggleHandsFreeVoice(forceState) {
  if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
    showToast('Đã dừng đàm thoại Live rảnh tay.', 'info');
    return;
  }

  if (forceState === false) {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
    stopHandsFreeVoice();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return showToast('Thiết bị không hỗ trợ truy cập Microphone phần cứng!', 'warning');
  }

  if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
    return showToast('Microphone yêu cầu kết nối bảo mật (HTTPS hoặc localhost)!', 'warning');
  }

  // Kích hoạt engine Live Call dạng Mini-Bar trực tiếp trong giao diện chat
  if (typeof window.startLiveVoiceCall === 'function') {
    window.startLiveVoiceCall({ miniBar: true });
    showToast('⚡ Đã bật Đàm thoại Live siêu tốc (WebSocket 2 chiều)!', 'success');
    return;
  }

  // Dự phòng nếu Live Call chưa sẵn sàng
  stopHandsFreeVoice();
  isHandsFreeActive = true;

  const banner = $('hands-free-banner');
  if (banner) banner.style.display = 'flex';

  const micBtn = $('btn-hands-free-voice');
  if (micBtn) micBtn.classList.add('active');

  const chipBtn = $('btn-toggle-hands-free-chip');
  if (chipBtn) chipBtn.classList.add('active');

  const statusText = $('hf-status-text');
  if (statusText)
    statusText.innerHTML =
      '<span style="color:#10b981;font-weight:600;">🟢 Đang kết nối micro...</span>';

  const preview = $('hf-transcript-preview');
  if (preview) preview.innerText = '';

  const btnSendHf = $('btn-send-hands-free');
  if (btnSendHf) btnSendHf.style.display = 'none';

  // Mở khóa âm thanh trước cho trình duyệt điện thoại (iOS Safari & Android Chrome)
  try {
    const unlockAudio = new Audio(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
    );
    unlockAudio.play().catch(() => {});
  } catch (_) {}

  await startHandsFreeRecorder();
  showToast('🎙️ Đã bật Đàm thoại Rảnh tay 2 chiều liên tục!', 'success');
}
if (typeof toggleHandsFreeVoice !== 'undefined') window.toggleHandsFreeVoice = toggleHandsFreeVoice;

// Hands-Free triggers
const btnHandsFreeVoice = $('btn-hands-free-voice');
if (btnHandsFreeVoice) btnHandsFreeVoice.onclick = () => toggleHandsFreeVoice();

const btnToggleHfChip = $('btn-toggle-hands-free-chip');
if (btnToggleHfChip) btnToggleHfChip.onclick = () => toggleHandsFreeVoice();

const btnStopHf = $('btn-stop-hands-free');
if (btnStopHf)
  btnStopHf.onclick = () => {
    if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
      if (typeof window.endLiveCall === 'function') window.endLiveCall();
    } else {
      toggleHandsFreeVoice(false);
    }
  };

const btnSendHf = $('btn-send-hands-free');
if (btnSendHf) btnSendHf.onclick = () => commitAndSendHandsFree();

// --- COLOR TAGS CONTROLLER ---
initColorTags();

// [Quản lý Key Quota Tracker đã được chuyển sang js/quota.js]

window.selectKeySlotQuick = slotIndex => {
  const val = String(slotIndex - 1);
  setGoogleKeySlot(val);
  const cs = sessions.find(x => x.id === activeId);
  if (cs) {
    let manualKey = (
      ls.getItem(`jarvis_api_${slotIndex}`) ||
      ls.getItem(`huanmu_api_${slotIndex}`) ||
      ''
    ).trim();
    if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_'))
      manualKey = deobfuscateKey(manualKey);
    cs.assignedApiKey = manualKey;
    cs.keySel = val;
    saveToDB(cs);
  }
  window.updateKeyQuotaUI();
  showToast(`🔑 Đã chuyển sang Key #${slotIndex}!`, 'info');
};

const getSessionApiKey = (cs, forceRotate = false) => {
  const sel = cs?.keySel ?? getGoogleKeySlot();
  if (sel !== 'auto') {
    let manualKey = (
      ls.getItem(`jarvis_api_${parseInt(sel) + 1}`) ||
      ls.getItem(`huanmu_api_${parseInt(sel) + 1}`) ||
      ''
    ).trim();
    if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_'))
      manualKey = deobfuscateKey(manualKey);
    return manualKey;
  }

  // Kiểm tra model đang sử dụng có phải 20 RPD (Hydrogen, 3.6 hoặc 3.8 Flash) không:
  const activeModEl = $('model-select');
  const activeMod = activeModEl ? activeModEl.value : 'gemini-4-hydrogen';
  const flashBucket = window.getFlashModelBucket(activeMod); // 'hydrogen' | '3.8' | '3.6' | null
  const shouldAvoidExhausted = ls.getItem('jarvis_skip_exhausted_keys') !== 'false';

  // Nếu không forceRotate và phiên đã gán key (Interactions API cần giữ key cố định cho interactionId):
  if (!forceRotate && cs?.assignedApiKey && apiKeys.includes(cs.assignedApiKey)) {
    if (!flashBucket || !shouldAvoidExhausted) {
      return cs.assignedApiKey;
    }
    const assignedSlot = window.findSlotIndexForKey(cs.assignedApiKey);
    if (window.getKeyUsageCount(assignedSlot, flashBucket) < 20) {
      return cs.assignedApiKey;
    }
  }

  if (apiKeys.length) {
    // 1. Lọc danh sách các key hợp lệ cho riêng model này
    let candidates = [...apiKeys];
    if (flashBucket && shouldAvoidExhausted) {
      const notExhausted = apiKeys.filter(k => {
        const slot = window.findSlotIndexForKey(k);
        return window.getKeyUsageCount(slot, flashBucket) < 20;
      });
      if (notExhausted.length > 0) {
        candidates = notExhausted;
      } else {
        const modelLabel =
          flashBucket === 'hydrogen' ? 'Gemini 4 Hydrogen' : `Gemini ${flashBucket} Flash`;
        showToast(
          `⚠️ Tất cả các Google Key đều đã đạt 20/20 RPD cho ${modelLabel} hôm nay!`,
          'warning'
        );
      }
    }

    // 2. THUẬT TOÁN CÂN BẰNG TẢI TRẢI ĐỀU (LEAST-USED FIRST):
    // Tìm số lượt gọi của model này trên từng key ứng viên
    const usageList = candidates.map(k => {
      const slot = window.findSlotIndexForKey(k);
      return { key: k, slot, usage: flashBucket ? window.getKeyUsageCount(slot, flashBucket) : 0 };
    });

    // Tìm mức lượt dùng nhỏ nhất hiện tại của model này
    const minUsage = Math.min(...usageList.map(u => u.usage));

    // Lọc ra tất cả các key đang có cùng số lượt dùng nhỏ nhất đó
    const leastUsed = usageList.filter(u => u.usage === minUsage);

    // Bốc ngẫu nhiên trong nhóm các key ít dùng nhất đó để dàn đều 100%
    const chosen = leastUsed[Math.floor(Math.random() * leastUsed.length)];
    const k = chosen.key;

    if (cs && !forceRotate) cs.assignedApiKey = k;
    return k;
  }
  return '';
};

let sHideTO;
DOM.chat.addEventListener('scroll', () => {
  if (DOM.chat.scrollTop > 250) {
    DOM.scrollTopBtn.classList.add('visible');
    clearTimeout(sHideTO);
    sHideTO = setTimeout(() => DOM.scrollTopBtn.classList.remove('visible'), 2500);
  } else {
    DOM.scrollTopBtn.classList.remove('visible');
  }
});
if (DOM.scrollTopBtn) {
  DOM.scrollTopBtn.onclick = () => DOM.chat.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateThinkingVisibility() {
  const m = DOM.model?.value || '',
    t = DOM.thinking;
  if (!t) return;
  const prev = t.value;
  // Mọi model Gemini 3.x/4 (kể cả 3.5 và 3.1 Flash Lite) đều nhận thinkingLevel và không tắt
  // hoàn toàn được -> danh sách mức lấy theo bảng tài liệu, không có mục "Tắt".
  // Model gateway có bộ mức Think Depth riêng (vd Nemotron free: chỉ Bật/Tắt hoặc ngân sách token)
  const mOpts = (window.COMPAT_MODEL_OPTS || {})[m];
  if (mOpts && Array.isArray(mOpts.levels) && mOpts.levels.length) {
    t.innerHTML = mOpts.levels.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    t.value = mOpts.levels.some(([v]) => v === prev) ? prev : mOpts.levels[0][0];
    t.disabled = mOpts.levels.length === 1;
    return;
  }
  t.disabled = false;
  // Gemini 3.x/4: chỉ hiện đúng các mức model hỗ trợ (3.8 Flash & 4 Hydrogen không có 'minimal')
  const modelLevels = getModelThinkingLevels(m);
  const opts = (modelLevels.length ? modelLevels : DEFAULT_THINKING_LEVELS).map(v => [
    v,
    THINKING_LEVEL_LABELS[v] || v,
  ]);
  t.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  t.value = opts.some(([v]) => v === prev) ? prev : opts[0][0];
}

const updateTokenCount = () => {
  const count = Math.ceil(((DOM.input?.value.length || 0) + (txtContent?.length || 0)) / 3.2);
  if ($('token-count')) $('token-count').innerText = count.toLocaleString('vi-VN');

  const bar = $('token-bar-fill');
  if (bar) {
    const pct = Math.min(Math.max((count / 15000) * 100, 4), 100);
    bar.style.width = pct + '%';
    bar.style.background =
      pct > 80 ? 'var(--danger)' : pct > 50 ? 'var(--warning)' : 'var(--success)';
  }
};

const applyTheme = m => {
  const t =
    m === 'auto'
      ? new Date().getHours() >= 18 || new Date().getHours() < 6
        ? 'dark'
        : 'light'
      : m;
  const tIcons = { auto: '🌙', dark: '🌙', light: '☀️' },
    tLabels = { auto: 'Tự động', dark: 'Tối', light: 'Sáng' };
  DOM.btnTheme.innerHTML = `${tIcons[m] || '🌙'} <span class="mobile-hidden">${tLabels[m] || 'Tự động'}</span>`;
  document.documentElement.setAttribute('data-theme', t);
  ls.setItem('theme', m);
};
applyTheme(ls.getItem('theme') || 'auto');
DOM.btnTheme.onclick = () => {
  const c = ls.getItem('theme') || 'auto';
  applyTheme(c === 'auto' ? 'dark' : c === 'dark' ? 'light' : 'auto');
};

if (DOM.input) {
  DOM.input.value = ls.getItem('jarvis_draft') || '';
  updateTokenCount();
  DOM.input.oninput = () => {
    ls.setItem('jarvis_draft', DOM.input.value);
    DOM.input.style.height = 'auto';
    DOM.input.style.height = Math.min(DOM.input.scrollHeight, 150) + 'px';
    updateTokenCount();
  };
  DOM.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = DOM.input.value.trim();
      if (val.startsWith('/') && window.executeChatSlashCommand(val)) {
        e.preventDefault();
        DOM.input.value = '';
        DOM.input.style.height = 'auto';
        ls.removeItem('jarvis_draft');
        updateTokenCount();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        DOM.sendBtn.click();
      }
    }
  });
}

// --- DESKTOP DRAG & DROP SUPPORT ---
const dropOverlay = $('drop-overlay');
let dragCounter = 0;
window.addEventListener('dragenter', e => {
  e.preventDefault();
  dragCounter++;
  if (e.dataTransfer?.types?.includes('Files')) {
    dropOverlay.style.display = 'flex';
  }
});
window.addEventListener('dragleave', e => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.style.display = 'none';
  }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.style.display = 'none';
  if (e.dataTransfer?.files?.length) {
    await processUploadFiles(Array.from(e.dataTransfer.files));
    showToast(`📎 Đã đính kèm ${e.dataTransfer.files.length} tệp từ kéo thả!`);
  }
});

// --- PROMPT ENHANCE BUTTON ---
if ($('btn-enhance-prompt'))
  $('btn-enhance-prompt').onclick = async () => {
    const txt = DOM.input.value.trim();
    if (!txt) return showToast('Nhập prompt trước khi Enhance!', 'warning');
    const k = getSessionApiKey(sessions.find(x => x.id === activeId));
    if (!k) return showToast('Cần Google Key để Enhance!', 'danger');
    $('btn-enhance-prompt').innerText = '⏳...';
    try {
      const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
        model: FLASH_LITE_MODEL,
        contents: `Hãy tối ưu và mở rộng câu lệnh prompt sau đây để rõ ràng, chi tiết, chuyên nghiệp và hiệu quả nhất khi gửi cho AI:\n\n"${txt}"\n\nChỉ trả về duy nhất nội dung prompt đã được tối ưu, không giải thích gì thêm.`,
        config: { safetySettings: SAFETY, maxOutputTokens: 400 },
      });
      if (res.text) {
        DOM.input.value = res.text.trim();
        DOM.input.dispatchEvent(new Event('input'));
        showToast('🪄 Đã tối ưu hóa Prompt!');
      }
    } catch (err) {
      showToast('Lỗi Enhance: ' + err.message, 'danger');
    } finally {
      $('btn-enhance-prompt').innerHTML =
        `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Enhance`;
    }
  };

$('toggle-sidebar-btn').onclick = () => {
  $('sidebar').classList.add('active');
  $('sidebar-overlay').classList.add('active');
};
$('close-sidebar-btn').onclick = $('sidebar-overlay').onclick = () => {
  $('sidebar').classList.remove('active');
  $('sidebar-overlay').classList.remove('active');
};
$('btn-open-settings').onclick = () => {
  $('settings-modal').style.display = 'flex';
  $('modal-overlay').style.display = 'block';
  renderCompactSummary();
};

const getDynamicSI = (ragSnippet = '') => {
  const cs = sessions.find(x => x.id === activeId);
  const b = DOM.sysInst?.value || 'Bạn là Jarvis AI - trợ lý thông minh và chuẩn xác.',
    g =
      DOM.globContext?.value ||
      ls.getItem('jarvis_global_context') ||
      ls.getItem('huanmu_global_context') ||
      '',
    now = new Date(),
    days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const hh = String(now.getHours()).padStart(2, '0'),
    mm = String(now.getMinutes()).padStart(2, '0'),
    ss = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hh}:${mm}:${ss}`;
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dateStr = `${days[now.getDay()]}, ngày ${day}/${month}/${year}`;

  const memorySnippet =
    cs?.summaryMemory && DOM.toggleAutoSummary?.checked !== false
      ? `\n\n[BỐI CẢNH DÀI HẠN ĐÃ TÓM TẮT TỪ CÁC TIN CŨ]:\n${cs.summaryMemory}\n`
      : '';

  const pinnedMsgs = chatHistory.filter(x => x.pinned);
  const pinnedSnippet = pinnedMsgs.length
    ? `\n\n[CÁC CHỈ THỊ VÀ DỮ LIỆU CỐT LÕI ĐÃ ĐƯỢC NGƯỜI DÙNG GHIM - BẮT BUỘC LUÔN GHI NHỚ VÀ TUÂN THỦ]:\n` +
      pinnedMsgs
        .map(
          (m, idx) =>
            `--- [Mục ghim #${idx + 1} (${m.role === 'user' ? 'Người dùng' : 'Jarvis AI'})]:\n${stripThinkingForCopy(m.text)}`
        )
        .join('\n\n') +
      '\n'
    : '';

  const ragBlock = ragSnippet ? `\n\n${ragSnippet}\n` : '';

  const timeInstruction = `[MỐC THỜI GIAN THỰC TẾ & NGUYÊN TẮC SUY LUẬN THỜI GIAN BẮT BUỘC]:
- Hôm nay là: ${dateStr}. Bây giờ là: ${timeStr} (Múi giờ Việt Nam GMT+7).
- NĂM HIỆN TẠI BẮT BUỘC LÀ NĂM ${year}. TUYỆT ĐỐI KHÔNG coi năm nay là năm 2024 hay 2025 (đó chỉ là thời điểm dữ liệu huấn luyện cũ).
- NGUYÊN TẮC SUY LUẬN THỜI GIAN & TÍNH TUỔI:
  + Mọi phép tính toán số tuổi, thời gian đã trôi qua kể từ một mốc quá khứ (ví dụ: mốc sinh năm 2024, các sự kiện trong quá khứ) hay tính thời gian đến tương lai ĐỀU BẮT BUỘC PHẢI lấy mốc thời điểm HIỆN TẠI LÀ THÁNG ${month}/${year} (NĂM ${year}).
  + Ví dụ: Một người hoặc đứa trẻ sinh vào tháng 01/2024, tính đến thời điểm hiện tại tháng ${month}/${year} đã là ${year - 2024} năm ${month - 1} tháng (khoảng ${(year - 2024) * 12 + month - 1} tháng tuổi), TUYỆT ĐỐI KHÔNG được tính nhầm là 10 tháng tuổi!`;

  return `${timeInstruction}\n\n[CHỈ THỊ HỆ THỐNG]:\n${DOM.toggleGlob?.checked !== false && g ? '--- TOÀN CỤC: ' + g + '\n' : ''}--- RIÊNG: ${b}${memorySnippet}${pinnedSnippet}${ragBlock}\n\n[QUY TẮC ỨNG XỬ TẾ NHỊ]: Khi người dùng hỏi các câu hỏi kiến thức khoa học, nấu ăn, công nghệ, học tập hoặc câu hỏi phổ thông (như thịt gà, kỹ thuật, thời tiết...), TUYỆT ĐỐI KHÔNG tự tiện nhắc đến thông tin gia đình, đời tư, con cái (như bé Bắp, bé Tiền) nếu người dùng không chủ động hỏi hay yêu cầu.\n\n[QUY TẮC TRẢ LỜI CỦA MÔ HÌNH SUY LUẬN (THINKING)]: Sau khi hoàn tất quá trình suy luận nội bộ, bạn BẮT BUỘC PHẢI viết toàn bộ nội dung câu trả lời hoàn chỉnh, chi tiết, logic và thân thiện để gửi trực tiếp cho người dùng. TUYỆT ĐỐI KHÔNG kết thúc phản hồi khi chưa viết phần câu trả lời cho người dùng.`;
};

window.exportCleanArticle = () => {
  const m = chatHistory.filter(x => x.role === 'model').map(x => x.text);
  m.length
    ? window.saveOrShareBlob(
        new Blob([`# Jarvis AI - Bài viết trích xuất\n\n` + m.join('\n\n---\n\n')], {
          type: 'text/markdown',
        }),
        `JarvisAI_Export_${Date.now()}.md`
      )
    : showToast('Hội thoại trống!', 'warning');
};

window.applySnippet = p => {
  if (DOM.input) {
    DOM.input.value = p + '\n' + DOM.input.value;
    DOM.input.dispatchEvent(new Event('input'));
    DOM.input.focus();
  }
  DOM.snippetsContainer.style.display = 'none';
};
if (DOM.btnToggleSnippets?.onclick)
  DOM.btnToggleSnippets.onclick = () =>
    (DOM.snippetsContainer.style.display =
      DOM.snippetsContainer.style.display === 'flex' ? 'none' : 'flex');

async function readPDF(f) {
  const pdfjsLib =
    typeof window.ensureLib === 'function' ? await window.ensureLib('pdfjs') : window.pdfjsLib;
  if (!pdfjsLib) throw new Error('Chưa tải được thư viện PDF.js');
  const p = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
  let t = '';
  for (let i = 1; i <= p.numPages; i++) {
    t += (await (await p.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
  }
  return t;
}
if (typeof readPDF !== 'undefined') window.readPDF = readPDF;

async function compressImageIfNeeded(f) {
  if (!f.type.startsWith('image/') || f.type === 'image/gif' || f.type === 'image/svg+xml')
    return f;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1600;
      let { width, height } = img;
      if (width <= MAX_DIM && height <= MAX_DIM && f.size < 800 * 1024) return resolve(f);
      if (width > height) {
        if (width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (blob && blob.size < f.size) {
            resolve(
              new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
            );
          } else {
            resolve(f);
          }
        },
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => resolve(f);
    img.src = url;
  });
}

async function processUploadFiles(fs) {
  DOM.fileCount.innerText = '⏳';
  for (let f of fs) {
    if (f.type.startsWith('image/')) {
      f = await compressImageIfNeeded(f);
      if (filesData.length < 20) filesData.push(f);
    } else if (f.type.startsWith('video/')) {
      if (filesData.length < 20) filesData.push(f);
    } else if (f.type.startsWith('audio/')) {
      // Audio gửi base64 nguyên tệp -> chặn tệp quá lớn để không nổ payload
      if (f.size > 25 * 1024 * 1024) {
        showToast(`Tệp audio quá lớn (tối đa 25MB): ${f.name}`, 'danger');
        continue;
      }
      if (filesData.length < 20) filesData.push(f);
    } else if (f.type === 'application/pdf') {
      txtContent += `\n[PDF: ${f.name}]:\n${(await readPDF(f)).substring(0, 50000)}\n`;
      DOM.textFileList.innerHTML += `📑 ${f.name}<br>`;
    } else {
      txtContent += `\n[Văn bản: ${f.name}]:\n${(await f.text()).substring(0, 50000)}\n`;
      DOM.textFileList.innerHTML += `📄 ${f.name}<br>`;
    }
  }
  renderFiles();
  updateTokenCount();
}

DOM.fileUpload.onchange = async e => {
  await processUploadFiles(Array.from(e.target.files));
  DOM.fileUpload.value = '';
};

DOM.btnAddUrl.onclick = async () => {
  const u = prompt('Nhập link URL website hoặc YouTube:');
  if (!u?.match(/https?:\/\//)) return;
  DOM.btnAddUrl.innerHTML = '⏳...';
  try {
    if (u.includes('youtube.com') || u.includes('youtu.be')) {
      const yt = await window.extractYouTubeContent(u);
      const k = getSessionApiKey(sessions.find(x => x.id === activeId));
      let summary = '';
      if (k) {
        try {
          const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
            model: FLASH_LITE_MODEL,
            contents: `Phân tích và tóm tắt chi tiết video YouTube sau:\n- Tiêu đề: ${yt.title}\n- Kênh: ${yt.author}\n- Link: ${u}\n${yt.content ? yt.content : ''}\nHãy nêu rõ chủ đề chính, các luận điểm nổi bật và ý nghĩa của video. Tuyệt đối KHÔNG từ chối là không xem được video.`,
            config: { safetySettings: SAFETY, maxOutputTokens: 700 },
          });
          summary = res.text;
        } catch (e) {
          summary = `Tiêu đề: ${yt.title} (Kênh: ${yt.author})`;
        }
      } else {
        summary = `Tiêu đề: ${yt.title} (Kênh: ${yt.author})`;
      }
      txtContent += `\n[YouTube: ${yt.title} - ${yt.author} (${u})]:\n${summary}\n`;
      DOM.textFileList.innerHTML += `📺 YouTube: ${escapeHtml(yt.title.substring(0, 24))}...<br>`;
    } else {
      const ext = await window.extractWebPageContent(u);
      txtContent += `\n[Nội dung ${u} qua ${ext.source}]:\n${ext.content}\n`;
      DOM.textFileList.innerHTML += `🌐 ${ext.source}<br>`;
    }
    DOM.previewBox.style.display = 'block';
    DOM.fileCount.innerText = filesData.length + (txtContent ? 1 : 0);
    updateTokenCount();
    showToast('Đã bóc tách nội dung link!');
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'danger');
  }
  DOM.btnAddUrl.innerHTML = `<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Đọc Link/YT`;
};

if ($('btn-paste-clipboard'))
  $('btn-paste-clipboard').onclick = async () => {
    try {
      const is = await navigator.clipboard.read();
      let h = false;
      for (const i of is) {
        if (i.types.some(t => t.startsWith('image/'))) {
          const b = await i.getType('image/png');
          filesData.push(new File([b], 'paste.png', { type: b.type }));
          renderFiles();
          h = true;
        }
      }
      if (!h) {
        const t = await navigator.clipboard.readText();
        if (t && DOM.input) {
          DOM.input.value += (DOM.input.value ? '\n' : '') + t;
          h = true;
        }
      }
      if (h) {
        DOM.input?.dispatchEvent(new Event('input'));
        showToast('Đã dán từ Clipboard!');
      }
    } catch {
      showToast('Lỗi truy cập Clipboard', 'danger');
    }
  };

oLay = $('modal-overlay');
closeModals = () => {
  if (typeof closeModals !== 'undefined') window.closeModals = closeModals;
  document
    .querySelectorAll(
      '.modal-box, #command-palette-modal, #daily-briefing-modal, #share-target-modal'
    )
    .forEach(m => (m.style.display = 'none'));
  if (oLay) oLay.style.display = 'none';
  if (typeof window.closeTTSStudioModal === 'function') window.closeTTSStudioModal();
};
const closeBtns = document.querySelectorAll('.close-btn');
closeBtns.forEach(b => b && (b.onclick = closeModals));
if (oLay) oLay.onclick = closeModals;

// [Storage Manager: js/storage-manager.js tự khởi tạo]

// CLIPBOARD PASTE (SCREENSHOTS & IMAGES)
window.addEventListener('paste', async e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imgs = [];
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      const fl = it.getAsFile();
      if (fl) imgs.push(fl);
    }
  }
  if (imgs.length) {
    await processUploadFiles(imgs);
    showToast(`Đã dán ${imgs.length} ảnh từ Clipboard!`, 'info');
  }
});

// CAMERA SNAP: TOUCH OPENS NATIVE CAMERA, PC OPENS MODAL
if ($('btn-camera-snap'))
  $('btn-camera-snap').onclick = async () => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch && $('camera-file-input')) {
      $('camera-file-input').click();
    } else {
      $('camera-modal').style.display = 'flex';
      oLay.style.display = 'block';
      try {
        $('camera-preview').srcObject = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch (e) {
        showToast(e.message, 'danger');
      }
    }
  };

if ($('camera-file-input')) {
  $('camera-file-input').onchange = async e => {
    if (e.target.files.length) {
      await processUploadFiles(Array.from(e.target.files));
      e.target.value = '';
      showToast('Đã chụp và đính kèm ảnh!');
    }
  };
}

const btnTakePhoto = $('btn-take-photo');
if (btnTakePhoto) {
  btnTakePhoto.onclick = () => {
    const v = $('camera-preview');
    if (!v || !v.srcObject) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(
      b => {
        processUploadFiles([new File([b], `Cam_${Date.now()}.jpg`, { type: 'image/jpeg' })]);
        v.srcObject?.getTracks().forEach(t => t.stop());
        closeModals();
        showToast('Đã chụp và đính kèm ảnh!');
      },
      'image/jpeg',
      0.85
    );
  };
}

DOM.btnFileLibrary.onclick = () => {
  $('file-library-modal').style.display = 'flex';
  oLay.style.display = 'block';
  renderLibrary();
};

const libraryUploadInput = $('library-upload-input');
if (libraryUploadInput) {
  libraryUploadInput.onchange = async e => {
    for (const f of e.target.files) {
      if (f.size <= 50 * 1024 * 1024) {
        await saveFileToLib({
          id: Date.now() + Math.random().toString().slice(2, 7),
          name: f.name,
          type: f.type,
          size: f.size,
          blob: f,
          added: new Date().toISOString(),
        });
      }
    }
    showToast('Đã thêm tệp vào thư viện!');
    renderLibrary();
    e.target.value = '';
  };
}

async function renderLibrary() {
  const c = $('library-files-container'),
    fs = await getAllFilesFromLib();
  c.innerHTML = fs.length
    ? fs
        .map(
          f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:var(--radius-md);background:var(--input-bg);border:1px solid var(--border);">
          <div>
            <strong>${f.name}</strong><br>
            <small style="color:var(--text-muted);">${(f.size / 1024).toFixed(1)} KB • ${new Date(f.added).toLocaleDateString('vi-VN')}</small>
          </div>
          <button class="btn primary" onclick="addFileFromLib('${f.id}')">➕ Đính</button>
        </div>
      `
        )
        .join('')
    : "<i style='color:var(--text-muted);padding:10px;'>Thư viện hiện đang trống.</i>";
}

window.addFileFromLib = async id => {
  const f = (await getAllFilesFromLib()).find(x => x.id === id);
  if (f) {
    await processUploadFiles([new File([f.blob], f.name, { type: f.type })]);
    closeModals();
    showToast(`Đã đính: ${f.name}`);
  }
};

// --- SESSIONS & TABS CONTROLLER ---
function renderTabs() {
  DOM.tabsContainer.innerHTML = openTabs
    .map(tId => {
      const s = sessions.find(x => x.id === tId);
      const dot = s?.color ? `<span class="color-dot" style="background:${s.color};"></span>` : '';
      return s
        ? `<div class="tab-item ${tId === activeId ? 'active' : ''}" onclick="window.switchSess('${tId}')" title="${escapeHtml(s.name)}">
          ${dot}
          <span>${escapeHtml(s.name.substring(0, 16))}</span>
          <span class="tab-close" onclick="window.closeTab('${tId}', event)" title="Đóng tab">×</span>
        </div>`
        : '';
    })
    .join('');
  ls.setItem('jarvis_tabs', JSON.stringify(openTabs));
  requestAnimationFrame(() => {
    const activeTab = DOM.tabsContainer?.querySelector('.tab-item.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  });
}

if (typeof switchSess !== 'undefined') window.switchSess = switchSess;
window.closeTab = (id, e) => {
  e.stopPropagation();
  openTabs = openTabs.filter(x => x !== id);
  id === activeId ? (openTabs.length ? switchSess(openTabs[0]) : newSess()) : renderTabs();
};

function renderFolders() {
  // Folders system pruned for simplicity & performance
}

async function loadSess() {
  try {
    await initDB();
    let d = await getAllFromDB();
    if ((!d || d.length === 0) && window.JarvisNativeBridge) {
      try {
        const raw = window.JarvisNativeBridge.getItem('jarvis_sessions_backup');
        if (raw) {
          const nativeSessions = JSON.parse(raw);
          if (Array.isArray(nativeSessions) && nativeSessions.length > 0) {
            for (const s of nativeSessions) await saveToDB(s);
            d = await getAllFromDB();
          }
        }
      } catch (e) {
        console.warn('Khôi phục phiên từ native bridge lỗi:', e);
      }
    }
    if (d && d.length > 0) {
      sessions = d.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      try {
        renderFolders();
      } catch (_) {}
      try {
        if (typeof window.renderSnippets === 'function') window.renderSnippets();
      } catch (_) {}
      activeId =
        ls.getItem('jarvis_active_id') ||
        ls.getItem('huanmu_active_id') ||
        ls.getItem('javiss_active_id') ||
        sessions[0].id;
      if (!sessions.find(s => s.id === activeId)) activeId = sessions[0].id;
      await switchSess(activeId);
    } else {
      try {
        renderFolders();
      } catch (_) {}
      try {
        if (typeof window.renderSnippets === 'function') window.renderSnippets();
      } catch (_) {}
      await newSess();
    }
  } catch (e) {
    console.error('Lỗi khởi động loadSess:', e);
    try {
      renderFolders();
    } catch (_) {}
    try {
      if (typeof window.renderSnippets === 'function') window.renderSnippets();
    } catch (_) {}
  }
}

async function newSess(n) {
  const id = 's_' + Date.now(),
    s = {
      id,
      name: n || `Hội thoại ${sessions.length + 1}`,
      folder: 'Mặc định',
      his: [],
      sys: '',
      mod: 'gemini-4-hydrogen',
      engine: 'stream',
      lastInteractionId: null,
      assignedApiKey: null,
      keySel: 'auto',
      color: null,
      summaryMemory: '',
      lastCondensedLength: 0,
      tmp: 0.5,
      tpp: 0.9,
      top: 40,
      thk: 'minimal',
      thkMap: {},
      sch: false,
      schEngine: 'tavily',
      mem: true,
      rag: true,
      useGlob: true,
      updatedAt: Date.now(),
      orderIndex: 0,
    };
  sessions.forEach(sess => {
    if (typeof sess.orderIndex === 'number') sess.orderIndex++;
  });
  sessions.unshift(s);
  await saveToDB(s);
  await switchSess(id);
  showToast('➕ Đã tạo phiên mới!');
  if (window.innerWidth <= 768) {
    $('sidebar').classList.remove('active');
    $('sidebar-overlay').classList.remove('active');
  }
}

async function switchSess(id) {
  activeId = id;
  ls.setItem('jarvis_active_id', id);
  ls.setItem('huanmu_active_id', id);
  const s = sessions.find(x => x.id === id);
  chatHistory = s && Array.isArray(s.his) ? [...s.his] : [];

  if (s) {
    DOM.sysInst.value = s.sys || '';
    // Khôi phục model theo cả provider: model id có thể trùng giữa nhiều provider
    // (vd particle-ai/particle-1:free ở OpenRouter và Kilo), chỉ gán .value sẽ chọn
    // nhầm option đầu tiên.
    if (!window.DynamicProviders?.selectModelOption?.(s.mod, s.modProvider)) {
      DOM.model.value = s.mod || 'gemini-4-hydrogen';
    }
    DOM.engineSel.value = s.engine || 'stream';
    setGoogleKeySlot(s.keySel || 'auto');
    // Menu key dùng chung phải theo model của phiên vừa mở (không có sự kiện change)
    if (typeof window.renderKeyPoolMenu === 'function') window.renderKeyPoolMenu();
    DOM.temp.value = s.tmp || 0.5;
    DOM.tempVal.innerText = DOM.temp.value;
    DOM.topP.value = s.tpp || 0.9;
    DOM.toppVal.innerText = DOM.topP.value;
    DOM.topK.value = s.top || 40;
    if (DOM.topkVal) DOM.topkVal.innerText = DOM.topK.value;
    updateThinkingVisibility();
    // s.thk luôn tương ứng với s.mod; thkMap chỉ dùng khi chuyển model trong cùng phiên
    DOM.thinking.value = s.thk || (s.thkMap && s.mod ? s.thkMap[s.mod] : '') || 'minimal';
    // Nếu phiên cũ lưu mức thinking không còn tồn tại (vd 'none' của Flash Lite), rơi về mức hợp lệ đầu tiên
    if (!DOM.thinking.value) DOM.thinking.value = DOM.thinking.options[0]?.value || 'minimal';
    DOM.toggleGlob.checked = s.useGlob !== false;
    DOM.toggleSearch.checked = s.sch || false;
    DOM.searchEngineBox.style.display = s.sch ? 'block' : 'none';
    DOM.searchEngineSel.value = s.schEngine || 'tavily';
    const isMem = s.mem !== false;
    const isRag = s.rag !== false;
    DOM.toggleMemory.checked = isMem;
    if (DOM.sessionMemState) {
      DOM.sessionMemState.innerText = isMem ? 'BẬT' : 'TẮT';
      DOM.sessionMemState.style.color = isMem ? 'var(--success)' : 'var(--text-muted)';
    }
    if (DOM.toggleRagEmbedding) DOM.toggleRagEmbedding.checked = isRag;
    if (DOM.ragMemoryState) {
      DOM.ragMemoryState.innerText = isRag ? 'BẬT' : 'TẮT';
      DOM.ragMemoryState.style.color = isRag ? 'var(--success)' : 'var(--text-muted)';
    }
    if (window.JarvisRAG && typeof window.JarvisRAG.updateRagUI === 'function') {
      window.JarvisRAG.updateRagUI(isRag);
    }
    updateColorPickerUI();
  }

  DOM.chat.innerHTML = '';
  for (let j = 0; j < chatHistory.length; j++) {
    try {
      await appendMsg(
        chatHistory[j].role === 'model' ? 'bot' : 'user',
        chatHistory[j].text || '',
        j,
        true
      );
    } catch (err) {
      console.error('Lỗi vẽ tin nhắn ' + j, err);
    }
  }
  DOM.chat.scrollTop = DOM.chat.scrollHeight;
  renderSel();
  if (!openTabs.includes(id)) openTabs.push(id);
  renderTabs();
}

DOM.selSession.onchange = e => switchSess(e.target.value);

function renderSel() {
  const v = sessions;
  DOM.selSession.innerHTML = v.length
    ? v
        .map(s => {
          const dot = s.pinned ? '📌 ' : s.color ? '● ' : '';
          return `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${dot}${s.name}</option>`;
        })
        .join('')
    : '<option value="">(Chưa có phiên nào)</option>';
  if (activeId) DOM.selSession.value = activeId;
  const curS = sessions.find(x => x.id === activeId);
  const kInfo =
    curS?.engine === 'interactions' && curS?.assignedApiKey
      ? ` • 🔒 Ghim Key ${apiKeys.indexOf(curS.assignedApiKey) + 1}`
      : '';
  $('session-msg-count').innerText = `${chatHistory.length} tin nhắn${kInfo}`;
  updateColorPickerUI();
}

$('btn-new-session').onclick = () => newSess();

$('btn-rename-session').onclick = async () => {
  const s = sessions.find(x => x.id === activeId);
  if (!s) return;
  const n = prompt('Nhập tên mới cho phiên:', s.name);
  if (n && n.trim()) {
    s.name = n.trim();
    s.isCustomNamed = true;
    await saveToDB(s);
    renderSel();
    renderTabs();
    showToast('✏️ Đã đổi tên phiên!');
  }
};

window.continueMsg = () => {
  if (isProcessing) return;
  DOM.input.value =
    'Hãy tiếp tục viết tiếp phần nội dung còn dang dở ở trên, không lặp lại các đoạn đã viết.';
  DOM.input.dispatchEvent(new Event('input'));
  DOM.sendBtn.click();
};

$('btn-delete-session').onclick = async () => {
  if (sessions.length <= 1) return showToast('Cần giữ lại ít nhất 1 phiên!', 'warning');
  const s = sessions.find(x => x.id === activeId);
  if (confirm(`Bạn có chắc muốn xóa phiên "${s?.name || ''}"?`)) {
    // Ghi tombstone phiên đã xóa để Cloud không tải lại phiên này
    try {
      const ids = JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]');
      if (!ids.includes(activeId)) ids.push(activeId);
      const str = JSON.stringify(ids.slice(-500));
      ls.setItem('jarvis_deleted_session_ids', str);
      if (window.saveToNativeBridge) window.saveToNativeBridge('jarvis_deleted_session_ids', str);
    } catch (_) {}
    await deleteFromDB(activeId);
    sessions = sessions.filter(x => x.id !== activeId);
    openTabs = openTabs.filter(x => x !== activeId);
    await switchSess(sessions[0].id);
    showToast('🗑️ Đã xóa phiên!');
  }
};

$('btn-move-up').onclick = async () => {
  const idx = sessions.findIndex(x => x.id === activeId);
  if (idx > 0) {
    const temp = sessions[idx];
    sessions[idx] = sessions[idx - 1];
    sessions[idx - 1] = temp;
    for (let i = 0; i < sessions.length; i++) {
      sessions[i].orderIndex = i;
      await saveToDB(sessions[i]);
    }
    renderSel();
    showToast('⬆️ Đã di chuyển phiên lên!');
  } else {
    showToast('Phiên đã ở vị trí trên cùng!', 'info');
  }
};

$('btn-move-down').onclick = async () => {
  const idx = sessions.findIndex(x => x.id === activeId);
  if (idx >= 0 && idx < sessions.length - 1) {
    const temp = sessions[idx];
    sessions[idx] = sessions[idx + 1];
    sessions[idx + 1] = temp;
    for (let i = 0; i < sessions.length; i++) {
      sessions[i].orderIndex = i;
      await saveToDB(sessions[i]);
    }
    renderSel();
    showToast('⬇️ Đã di chuyển phiên xuống!');
  } else {
    showToast('Phiên đã ở vị trí dưới cùng!', 'info');
  }
};

$('btn-bulk-edit').onclick = () => {
  const modal = $('bulk-edit-modal'),
    list = $('bulk-edit-list');
  if (!chatHistory.length) return showToast('Phiên này chưa có tin nhắn nào!', 'warning');
  list.innerHTML = chatHistory
    .map(
      (m, i) => `
        <label style="display:flex;align-items:flex-start;gap:10px;padding:8px;border-radius:var(--radius-sm);background:var(--input-bg);border:1px solid var(--border);cursor:pointer;">
          <input type="checkbox" class="bulk-check" value="${i}" style="margin-top:3px;">
          <div style="flex:1;overflow:hidden;">
            <strong style="color:var(--primary);font-size:0.78rem;">${m.role === 'user' ? '👤 Bạn' : '✨ Jarvis AI'} [${m.time || ''}]</strong>
            <p style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.82rem;color:var(--text-muted);margin:0;">${(m.text || '').replace(/<[^>]+>/g, '').substring(0, 70)}</p>
          </div>
        </label>
      `
    )
    .join('');
  modal.style.display = 'flex';
  oLay.style.display = 'block';
};

let allChecked = false;
$('btn-select-all-bulk').onclick = () => {
  allChecked = !allChecked;
  document.querySelectorAll('.bulk-check').forEach(ck => (ck.checked = allChecked));
  $('btn-select-all-bulk').innerText = allChecked ? '✖️ Bỏ chọn hết' : '☑️ Chọn tất cả';
};

$('btn-delete-selected-bulk').onclick = async () => {
  const selected = Array.from(document.querySelectorAll('.bulk-check:checked'))
    .map(ck => parseInt(ck.value))
    .sort((a, b) => b - a);
  if (!selected.length) return showToast('Chưa chọn tin nhắn nào!', 'warning');
  if (confirm(`Bạn có chắc muốn xóa ${selected.length} tin nhắn đã chọn?`)) {
    selected.forEach(idx => chatHistory.splice(idx, 1));
    const s = sessions.find(x => x.id === activeId);
    if (s) {
      s.lastInteractionId = null;
      await saveToDB(s);
    }
    await reRenderHistory();
    closeModals();
    showToast(`🗑️ Đã xóa ${selected.length} tin nhắn!`);
  }
};

async function updateConfig() {
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    Object.assign(s, {
      sys: DOM.sysInst.value,
      mod: DOM.model.value,
      // Lưu kèm provider đã chọn để lần mở lại khôi phục đúng option khi trùng model id
      modProvider: window.DynamicProviders?.getSelectedModelProvider?.() || null,
      engine: DOM.engineSel.value,
      keySel: getGoogleKeySlot(),
      tmp: DOM.temp.value,
      tpp: DOM.topP.value,
      top: DOM.topK.value,
      thk: DOM.thinking.value,
      useGlob: DOM.toggleGlob.checked,
      sch: DOM.toggleSearch.checked,
      schEngine: DOM.searchEngineSel.value,
      mem: DOM.toggleMemory.checked,
      rag: DOM.toggleRagEmbedding ? DOM.toggleRagEmbedding.checked : true,
    });
    if (DOM.engineSel.value === 'stream') {
      s.assignedApiKey = null;
    } else if (DOM.engineSel.value === 'interactions') {
      const sel = getGoogleKeySlot();
      if (sel !== 'auto') {
        const idx = parseInt(sel, 10) + 1;
        let mk = (
          ls.getItem(`jarvis_api_${idx}`) ||
          ls.getItem(`huanmu_api_${idx}`) ||
          ls.getItem(`javiss_api_${idx}`) ||
          ''
        ).trim();
        if (mk.startsWith('JVENC_') || mk.startsWith('ENC_')) mk = deobfuscateKey(mk);
        if (mk) s.assignedApiKey = mk;
      }
    }
    await saveToDB(s);
    renderSel();
  }
  DOM.searchEngineBox.style.display = DOM.toggleSearch.checked ? 'block' : 'none';
}

DOM.model.addEventListener('change', () => {
  const s = sessions.find(x => x.id === activeId);
  const nextMod = DOM.model.value;
  // Mỗi model có bộ mức Think Depth khác nhau (effort / bật-tắt / ngân sách token)
  // -> nhớ mức của model vừa rời đi để quay lại không bị mất cấu hình.
  if (s && s.mod && s.mod !== nextMod) {
    s.thkMap = Object.assign({}, s.thkMap || {}, { [s.mod]: s.thk || DOM.thinking.value });
  }
  updateThinkingVisibility();
  // Qwen4 Max mặc định Think Depth = Low khi chọn model này
  if (nextMod === 'qwen4-max:free' && DOM.thinking) DOM.thinking.value = 'low';
  // Khôi phục mức đã lưu cho model này nếu model đó có lưu và mức còn hợp lệ
  const savedThk = s && s.thkMap ? s.thkMap[nextMod] : null;
  if (savedThk && Array.from(DOM.thinking.options).some(o => o.value === savedThk)) {
    DOM.thinking.value = savedThk;
  }
  updateConfig();
  updateKeyQuotaUI();
});
DOM.engineSel.addEventListener('change', updateConfig);
[DOM.sysInst, DOM.toggleGlob, DOM.toggleSearch, DOM.searchEngineSel, DOM.thinking].forEach(el =>
  el?.addEventListener?.('change', updateConfig)
);
// key-pool-select has its own change handler in renderKeyPoolMenu which calls setGoogleKeySlot

if (DOM.btnToggleSessionMem) {
  DOM.btnToggleSessionMem.onclick = () => {
    const s = sessions.find(x => x.id === activeId);
    const cur = s ? s.mem !== false : DOM.toggleMemory.checked;
    const next = !cur;
    DOM.toggleMemory.checked = next;
    if (DOM.sessionMemState) {
      DOM.sessionMemState.innerText = next ? 'BẬT' : 'TẮT';
      DOM.sessionMemState.style.color = next ? 'var(--success)' : 'var(--text-muted)';
    }
    if (s) {
      s.mem = next;
      saveToDB(s);
    }
    showToast(
      `Ngữ cảnh trò chuyện [Phiên này]: ${next ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`,
      next ? 'success' : 'warning'
    );
  };
}

DOM.toggleMemory?.addEventListener('change', () => {
  const next = DOM.toggleMemory.checked;
  if (DOM.sessionMemState) {
    DOM.sessionMemState.innerText = next ? 'BẬT' : 'TẮT';
    DOM.sessionMemState.style.color = next ? 'var(--success)' : 'var(--text-muted)';
  }
  updateConfig();
  showToast(
    `Ngữ cảnh trò chuyện [Phiên này]: ${next ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`,
    next ? 'success' : 'warning'
  );
});
DOM.temp?.addEventListener?.('input', () => {
  if (DOM.tempVal) DOM.tempVal.innerText = DOM.temp.value;
  updateConfig();
});
DOM.topP?.addEventListener?.('input', () => {
  if (DOM.toppVal) DOM.toppVal.innerText = DOM.topP.value;
  updateConfig();
});
DOM.topK?.addEventListener?.('input', () => {
  if (DOM.topkVal) DOM.topkVal.innerText = DOM.topK.value;
  updateConfig();
});

let currentSpeakingBtn = null;
let currentSpeakingAudio = null;
let currentSpeechUtterance = null;

function sanitizeTranscript(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' [đoạn mã] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[#*_~>]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
}
if (typeof sanitizeTranscript !== 'undefined') window.sanitizeTranscript = sanitizeTranscript;

window.openMsgInTTSStudio = (btnOrIdx, directIdx) => {
  let raw = '';
  let idx = directIdx;
  if (typeof btnOrIdx === 'number') {
    idx = btnOrIdx;
  }
  if (idx !== undefined && idx !== null && chatHistory && chatHistory[idx]) {
    raw = chatHistory[idx].text || '';
  }
  if (!raw && btnOrIdx instanceof Element) {
    const container = btnOrIdx.closest('.message-container');
    const msgEl = container?.querySelector('.bot-message, .msg-content');
    raw = msgEl?.getAttribute('data-raw') || msgEl?.innerText || '';
  }
  if (!raw && chatHistory && chatHistory.length > 0) {
    const lastBot = [...chatHistory].reverse().find(m => m.role === 'model');
    if (lastBot) raw = lastBot.text || '';
  }
  const cleanRaw = stripThinkingForCopy(raw);
  const clean = sanitizeTranscript(cleanRaw);
  const textToSend = clean || cleanRaw;
  if (!textToSend.trim()) {
    showToast('Không tìm thấy nội dung tin nhắn để mở Studio!', 'warning');
    return;
  }
  if (typeof window.openTTSStudioModal === 'function') {
    window.openTTSStudioModal(textToSend);
  } else {
    showToast('Đang mở TTS Studio...', 'info');
    setTimeout(() => {
      if (typeof window.openTTSStudioModal === 'function') {
        window.openTTSStudioModal(textToSend);
      }
    }, 200);
  }
};

function splitTextIntoSmartChunks(text, maxChars = 850) {
  if (!text || text.length <= maxChars) return [text || ''];
  const chunks = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > maxChars && cur.trim()) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}
if (typeof splitTextIntoSmartChunks !== 'undefined')
  window.splitTextIntoSmartChunks = splitTextIntoSmartChunks;

let currentSpeakingAbort = false;
let currentSpeakingUrls = [];

function stopCurrentSpeaking() {
  currentSpeakingAbort = true;
  if (currentSpeakingAudio) {
    try {
      currentSpeakingAudio.pause();
      currentSpeakingAudio.currentTime = 0;
      currentSpeakingAudio.src = '';
    } catch {}
    currentSpeakingAudio = null;
  }
  currentSpeakingUrls.forEach(u => {
    try {
      URL.revokeObjectURL(u);
    } catch {}
  });
  currentSpeakingUrls = [];
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (currentSpeakingBtn) {
    currentSpeakingBtn.innerHTML =
      currentSpeakingBtn.getAttribute('data-original-html') || '🔊 Nghe';
    currentSpeakingBtn.classList.remove('speaking-active');
    currentSpeakingBtn = null;
  }
}
if (typeof stopCurrentSpeaking !== 'undefined') window.stopCurrentSpeaking = stopCurrentSpeaking;

async function playTextAudio(rawText, options = {}) {
  const { btn = null, onStart = null, onEnd = null, onError = null } = options;
  stopCurrentSpeaking();

  const clean = sanitizeTranscript(rawText);
  if (!clean) {
    if (btn) showToast('Không có nội dung văn bản để đọc!', 'warning');
    if (onError) onError(new Error('Empty text'));
    return;
  }

  if (btn) {
    if (!btn.getAttribute('data-original-html')) {
      btn.setAttribute('data-original-html', btn.innerHTML);
    }
    btn.innerHTML = '⏳ Đang nạp...';
    btn.classList.add('speaking-active');
    currentSpeakingBtn = btn;
  }
  if (onStart) onStart();

  currentSpeakingAbort = false;
  const chunks = splitTextIntoSmartChunks(clean, 850);
  const isVietnamese =
    /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
  const activeKeys = getGoogleKeysList().filter(Boolean);

  // 1. Thử đọc bằng Gemini TTS chất lượng cao với chuỗi đoạn liên tục (Pipeline Streaming Queue)
  if (activeKeys.length > 0) {
    try {
      const voicePref = $('tts-voice-select')?.value || ls.getItem('jarvis_tts_voice') || 'Charon';
      const ttsModel = $('tts-model-select')?.value || 'gemini-3.8-flash-lite-tts';

      const reqFn =
        window.requestGeminiAudioWithFailover ||
        (typeof requestGeminiAudioWithFailover === 'function'
          ? requestGeminiAudioWithFailover
          : null);
      if (!reqFn) throw new Error('Thư viện Gemini TTS chưa sẵn sàng');

      const fetchChunkAudioUrl = async textChunk => {
        if (currentSpeakingAbort) return null;
        const payload = {
          systemInstruction: {
            parts: [
              {
                text: 'Bạn là trợ lý AI Jarvis với giọng nam giới Nam Bộ. Hãy đọc toàn bộ văn bản được cung cấp với phát âm tiếng Việt chuẩn phương ngữ Nam Bộ (miền Nam Việt Nam), ngữ điệu tự nhiên, ấm áp, thân thiện, gần gũi, rõ ràng từng chữ, tuyệt đối không dùng giọng robot hay giọng người nước ngoài.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: textChunk }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voicePref,
                },
              },
            },
          },
        };
        const res = await reqFn(payload, ttsModel, activeKeys, 0);
        let base64Audio = res.outputAudioData || res.data?.output_audio?.data || null;
        if (!base64Audio) {
          const parts = res.data?.candidates?.[0]?.content?.parts || [];
          for (let p of parts) {
            if (
              p.inlineData &&
              p.inlineData.mimeType &&
              p.inlineData.mimeType.startsWith('audio/')
            ) {
              base64Audio = p.inlineData.data;
              break;
            }
          }
        }
        if (!base64Audio) throw new Error('Không nhận được dữ liệu âm thanh');

        let cleanB64 = base64Audio.replace(/-/g, '+').replace(/_/g, '/');
        while (cleanB64.length % 4) cleanB64 += '=';
        const binary = atob(cleanB64);
        const bytes = new Uint8Array(binary.length);
        for (let b = 0; b < binary.length; b++) bytes[b] = binary.charCodeAt(b);

        const wavBlob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(wavBlob);
        currentSpeakingUrls.push(url);
        return url;
      };

      // Tải trước đoạn 1
      let currentAudioUrl = await fetchChunkAudioUrl(chunks[0]);
      if (currentSpeakingAbort || !currentAudioUrl) return;

      let currentChunkIdx = 0;
      let nextChunkPromise = chunks.length > 1 ? fetchChunkAudioUrl(chunks[1]) : null;

      const playCurrentChunk = async () => {
        if (currentSpeakingAbort) return;

        const audio = new Audio(currentAudioUrl);
        currentSpeakingAudio = audio;
        if (btn) {
          btn.innerHTML =
            chunks.length > 1 ? `⏹️ Dừng (${currentChunkIdx + 1}/${chunks.length})` : `⏹️ Dừng`;
        }

        audio.onended = async () => {
          if (currentSpeakingAbort) return;
          currentChunkIdx++;
          if (currentChunkIdx < chunks.length) {
            try {
              currentAudioUrl = nextChunkPromise
                ? await nextChunkPromise
                : await fetchChunkAudioUrl(chunks[currentChunkIdx]);
            } catch (cErr) {
              console.warn(`Lỗi nạp đoạn âm thanh ${currentChunkIdx + 1}:`, cErr);
              currentAudioUrl = null;
            }

            if (currentChunkIdx + 1 < chunks.length) {
              nextChunkPromise = fetchChunkAudioUrl(chunks[currentChunkIdx + 1]).catch(() => null);
            } else {
              nextChunkPromise = null;
            }

            if (currentAudioUrl && !currentSpeakingAbort) {
              await playCurrentChunk();
            } else {
              stopCurrentSpeaking();
              if (onEnd) onEnd();
            }
          } else {
            stopCurrentSpeaking();
            if (onEnd) onEnd();
          }
        };

        audio.onerror = e => {
          stopCurrentSpeaking();
          if (onError) onError(e);
        };

        await audio.play();
      };

      await playCurrentChunk();
      return;
    } catch (e) {
      console.warn('Gemini TTS phát nhanh lỗi, chuyển sang Web Speech API:', e);
    }
  }

  // 2. Dự phòng: Web Speech API của trình duyệt (đọc tuần tự từng đoạn, không bao giờ ngắt ngang)
  if (!('speechSynthesis' in window)) {
    stopCurrentSpeaking();
    if (onError) onError(new Error('No Web Speech'));
    return showToast('Trình duyệt không hỗ trợ đọc giọng nói!', 'warning');
  }

  const voices = window.speechSynthesis.getVoices();
  let viVoice = null;
  if (isVietnamese) {
    viVoice = voices.find(
      v =>
        (v.lang && (v.lang.startsWith('vi') || v.lang.includes('vi'))) ||
        (v.name &&
          (v.name.toLowerCase().includes('vietnam') ||
            v.name.toLowerCase().includes('vietnamese') ||
            v.name.toLowerCase().includes('tiếng việt') ||
            v.name.toLowerCase().includes('an') ||
            v.name.toLowerCase().includes('linh') ||
            v.name.toLowerCase().includes('mai')))
    );
    if (!viVoice) {
      stopCurrentSpeaking();
      if (onError) onError(new Error('Không có giọng đọc tiếng Việt'));
      return showToast(
        '⚠️ Trình duyệt chưa có sẵn giọng đọc tiếng Việt và Gemini TTS chưa phản hồi. Vui lòng kiểm tra kết nối API Key!',
        'warning'
      );
    }
  }

  let wsIdx = 0;
  const playNextWebSpeech = () => {
    if (currentSpeakingAbort || wsIdx >= chunks.length) {
      stopCurrentSpeaking();
      if (onEnd) onEnd();
      return;
    }

    const utter = new SpeechSynthesisUtterance(chunks[wsIdx]);
    if (isVietnamese) {
      utter.lang = 'vi-VN';
      if (viVoice) utter.voice = viVoice;
    } else {
      utter.lang = 'en-US';
      const enVoice = voices.find(v => v.lang && v.lang.startsWith('en'));
      if (enVoice) utter.voice = enVoice;
    }
    utter.rate = 1.05;

    utter.onend = () => {
      if (currentSpeakingAbort) return;
      wsIdx++;
      playNextWebSpeech();
    };

    utter.onerror = e => {
      stopCurrentSpeaking();
      if (onError) onError(e);
    };

    if (btn) {
      btn.innerHTML = chunks.length > 1 ? `⏹️ Dừng (${wsIdx + 1}/${chunks.length})` : `⏹️ Dừng`;
    }

    window.speechSynthesis.speak(utter);
  };

  playNextWebSpeech();
}
if (typeof playTextAudio !== 'undefined') window.playTextAudio = playTextAudio;

window.toggleSpeakMsg = async (btn, i) => {
  if (currentSpeakingBtn === btn) {
    stopCurrentSpeaking();
    return;
  }
  const raw = chatHistory[i]?.text || '';
  const cleanRaw = stripThinkingForCopy(raw);
  playTextAudio(cleanRaw, { btn });
};

window.togglePinMsg = async i => {
  if (!chatHistory[i]) return;
  chatHistory[i].pinned = !chatHistory[i].pinned;
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    s.his = chatHistory;
    await saveToDB(s);
  }
  await reRenderHistory();
  showToast(
    chatHistory[i].pinned
      ? 'Đã ghim tin nhắn! AI sẽ luôn ghi nhớ nội dung này.'
      : 'Đã bỏ ghim tin nhắn.',
    'info'
  );
};

// --- TOMBSTONE: dấu vết tin nhắn đã xóa để Smart Sync không hồi sinh từ Cloud ---
const DELETED_MSGS_KEY = 'jarvis_deleted_msgs';
const TOMBSTONE_TTL = 90 * 24 * 3600 * 1000; // giữ 90 ngày
function msgSig(m) {
  const t = String((m && m.text) || '');
  return ((m && m.role) || '') + '|' + t.length + '|' + t.slice(0, 160) + '|' + t.slice(-60);
}
function readDeletedMsgs() {
  try {
    const o = JSON.parse(ls.getItem(DELETED_MSGS_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}
function writeDeletedMsgs(map) {
  try {
    const str = JSON.stringify(map);
    ls.setItem(DELETED_MSGS_KEY, str);
    if (window.saveToNativeBridge) window.saveToNativeBridge(DELETED_MSGS_KEY, str);
  } catch (_) {}
}
function addDeletedMsgs(sessionId, msgs) {
  if (!sessionId || !Array.isArray(msgs) || !msgs.length) return;
  const map = readDeletedMsgs();
  const now = Date.now();
  const arr = Array.isArray(map[sessionId])
    ? map[sessionId].filter(x => x && x.t > now - TOMBSTONE_TTL)
    : [];
  msgs.forEach(m => {
    if (!m) return;
    const s = msgSig(m);
    if (s) arr.push({ s, t: now });
  });
  map[sessionId] = arr.slice(-800);
  writeDeletedMsgs(map);
}
function filterDeletedMsgs(sessionId, his) {
  const list = Array.isArray(his) ? his : [];
  const arr = readDeletedMsgs()[sessionId];
  if (!Array.isArray(arr) || !arr.length) return { his: list, removed: 0 };
  const sigs = new Set(arr.map(x => x.s));
  const out = list.filter(m => !sigs.has(msgSig(m)));
  return { his: out, removed: list.length - out.length };
}
function readAllDeletedMsgs() {
  return readDeletedMsgs();
}
function mergeAllDeletedMsgs(remote) {
  if (!remote || typeof remote !== 'object') return false;
  const map = readDeletedMsgs();
  const now = Date.now();
  let changed = false;
  Object.keys(remote).forEach(sid => {
    const incoming = Array.isArray(remote[sid]) ? remote[sid] : [];
    const arr = Array.isArray(map[sid]) ? map[sid].slice() : [];
    const seen = new Set(arr.map(x => x && x.s));
    incoming.forEach(x => {
      if (!x || !x.s) return;
      if ((x.t || 0) < now - TOMBSTONE_TTL) return;
      if (!seen.has(x.s)) {
        arr.push({ s: x.s, t: x.t || now });
        seen.add(x.s);
        changed = true;
      }
    });
    if (arr.length) map[sid] = arr.slice(-800);
  });
  if (changed) writeDeletedMsgs(map);
  return changed;
}
// Gọi lại khi Restore từ Cloud (js/sync.js)
window.jarvisMsgTombstones = {
  add: addDeletedMsgs,
  filter: filterDeletedMsgs,
  readAll: readAllDeletedMsgs,
  mergeAll: mergeAllDeletedMsgs,
  sig: msgSig,
};

window.deleteMsg = async i => {
  if (confirm('Xóa tin nhắn này?')) {
    // Ghi tombstone để Smart Sync không hồi sinh tin vừa xóa từ Cloud
    if (window.jarvisMsgTombstones && chatHistory[i])
      window.jarvisMsgTombstones.add(activeId, [chatHistory[i]]);
    const keepScroll = captureChatScroll();
    chatHistory.splice(i, 1);
    const s = sessions.find(x => x.id === activeId);
    if (s) {
      const prevBot = chatHistory
        .slice()
        .reverse()
        .find(m => m.role === 'model' && m.interactionId);
      s.lastInteractionId = prevBot?.interactionId || null;
      await saveToDB(s);
    }
    await reRenderHistory();
    restoreChatScroll(keepScroll);
  }
};

window.retryMsg = async i => {
  if (isProcessing || i <= 0 || chatHistory[i - 1].role !== 'user') return;
  const up = chatHistory[i - 1].text;
  if (window.jarvisMsgTombstones)
    window.jarvisMsgTombstones.add(activeId, chatHistory.slice(Math.max(0, i - 1), i + 1));
  chatHistory.splice(i - 1, 2);
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    const prevBot = chatHistory
      .slice()
      .reverse()
      .find(m => m.role === 'model' && m.interactionId);
    s.lastInteractionId = prevBot?.interactionId || null;
    await saveToDB(s);
  }
  await reRenderHistory();
  DOM.input.value = up;
  DOM.input.dispatchEvent(new Event('input'));
  DOM.sendBtn.click();
};

window.editMsg = async i => {
  DOM.input.value = chatHistory[i].text;
  DOM.input.dispatchEvent(new Event('input'));
  if (window.jarvisMsgTombstones) window.jarvisMsgTombstones.add(activeId, chatHistory.slice(i));
  chatHistory = chatHistory.slice(0, i);
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    const prevBot = chatHistory
      .slice()
      .reverse()
      .find(m => m.role === 'model' && m.interactionId);
    s.lastInteractionId = prevBot?.interactionId || null;
    await saveToDB(s);
  }
  await reRenderHistory();
};

window.clearActiveSession = async () => {
  if (confirm('Bạn có chắc muốn xóa sạch toàn bộ tin nhắn trong phiên này?')) {
    if (window.jarvisMsgTombstones) window.jarvisMsgTombstones.add(activeId, chatHistory.slice());
    chatHistory = [];
    const s = sessions.find(x => x.id === activeId);
    if (s) {
      s.lastInteractionId = null;
      s.summaryMemory = '';
      await saveToDB(s);
    }
    await reRenderHistory();
    showToast('Đã dọn sạch hội thoại phiên này!');
  }
};

// --- SEND MESSAGE (STREAM / INTERACTIONS) ---
DOM.sendBtn.onclick = async () => {
  // bD (bong bóng trả lời) phải khai báo TRƯỚC khối chọn key: các nhánh "thiếu key"
  // bên dưới đã gọi bD?.remove() trước khi khối let ở cuối handler chạy -> TDZ.
  let bD;
  if (isProcessing) return abortController?.abort();
  const rawMsg = DOM.input.value.trim();
  if (rawMsg.startsWith('/') && executeChatSlashCommand(rawMsg)) {
    DOM.input.value = '';
    DOM.input.style.height = 'auto';
    ls.removeItem('jarvis_draft');
    updateTokenCount();
    return;
  }
  let am = DOM.model.value || 'gemini-3.6-flash';
  const msg = rawMsg;
  if (!msg && !filesData.length && !txtContent) return;
  document.querySelectorAll('.follow-up-container').forEach(el => el.remove());

  const cs = sessions.find(x => x.id === activeId);
  const currentEngine = cs?.engine || DOM.engineSel?.value || 'stream';
  // DEBUG: dấu vết lượt gửi (đọc bằng: copy(JSON.stringify(window.__jarvisTurnDebug)))
  window.__jarvisTurnDebug = {
    model: am,
    engine: currentEngine,
    startedAt: new Date().toISOString(),
    startedAtMs: performance.now(),
  };

  // --- ẢNH: mọi model đều được gửi kèm ảnh; nếu provider/nền tảng từ chối thì báo
  // toast theo đúng TÊN model đang chọn và gửi lại lượt đó không kèm ảnh. ---
  // Helper: lấy provider cho modelId — ưu tiên data-provider của option trong #model-select (optgroup),
  // fallback resolveCompatProvider
  const getModelProvider = modelId => {
    const mid = String(modelId || '').trim();
    // 1. Nếu là model ĐANG CHỌN trong dropdown: lấy đúng option đang được chọn.
    //    Model id có thể trùng giữa nhiều provider (vd particle-ai/particle-1:free
    //    ở OpenRouter và Kilo) — .find() theo value sẽ luôn lấy option đầu tiên.
    const selOpt = DOM.model?.options?.[DOM.model.selectedIndex];
    if (selOpt && String(selOpt.value).trim() === mid && selOpt.dataset?.provider)
      return selOpt.dataset.provider;
    // 2. Model không phải model đang chọn (tin nhắn cũ): tìm option theo value
    const opt = Array.from(DOM.model?.options || []).find(o => o.value === mid);
    if (opt?.dataset?.provider) return opt.dataset.provider;
    // 3. Fallback to resolveCompatProvider
    const cp = typeof resolveCompatProvider === 'function' ? resolveCompatProvider(mid) : null;
    if (cp?.provider) return cp.provider.id;
    // 4. Check Explabs
    const expModels = Array.isArray(window.EXPLABS_MODELS) ? window.EXPLABS_MODELS : [];
    if (expModels.includes(mid)) return 'explabs';
    return 'google';
  };

  const modelLabelOf = id => {
    const mid = String(id || '').trim();
    const providerId = getModelProvider(mid);
    // Try to get modelLabel from provider if available
    if (providerId && window.COMPAT_PROVIDERS?.[providerId]?.modelLabel) {
      try {
        return window.COMPAT_PROVIDERS[providerId].modelLabel(mid);
      } catch (_) {}
    }
    const opt = Array.from(DOM.model?.options || []).find(o => o.value === mid);
    return (opt?.text || mid || 'Model').trim();
  };
  // Chỉ bắt lỗi "model không nhận ảnh" (không bắt lỗi ảnh hỏng/quá lớn/mất mạng)
  const isImageRejection = msg => {
    const s = String(msg || '');
    if (!s) return false;
    return (
      /(does not|doesn't|do not|cannot|can't|unable to|not able to)\s+(process|support|accept|handle|read)\s+[^.\n]{0,30}(image|vision|visual|photo|picture)/i.test(
        s
      ) ||
      /(image|vision|visual|multimodal)[^.\n]{0,40}(not supported|is not supported|unsupported|not accepted|not allowed)/i.test(
        s
      ) ||
      /unsupported[_\s](media|modality|content[_\s]?type)/i.test(s) ||
      /(only|text-only)[^.\n]{0,30}(text|language)[^.\n]{0,30}(input|model|supported)/i.test(s)
    );
  };
  const notifyImagesUnsupported = label => {
    showToast(
      `⚠️ ${label} does not process images (không xử lý ảnh) — đã gửi lại không kèm ảnh.`,
      'warning'
    );
    console.warn('[Ảnh] Provider từ chối ảnh:', label);
  };

  let gKey = '';
  let keyIndexNum = 1;

  const manualSel = getGoogleKeySlot();
  if (manualSel !== 'auto') {
    const idx = parseInt(manualSel, 10) + 1;
    let manualKey = (
      ls.getItem(`jarvis_api_${idx}`) ||
      ls.getItem(`huanmu_api_${idx}`) ||
      ls.getItem(`javiss_api_${idx}`) ||
      ''
    ).trim();
    if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_'))
      manualKey = deobfuscateKey(manualKey);
    gKey = manualKey;
    keyIndexNum = idx;
    if (cs && currentEngine === 'interactions') {
      cs.assignedApiKey = gKey;
      await saveToDB(cs);
      renderSel();
      if (typeof scheduleAutoSync === 'function') {
        scheduleAutoSync(15000);
      }
    }
  } else if (currentEngine === 'interactions') {
    if (!cs?.assignedApiKey || !apiKeys.includes(cs.assignedApiKey)) {
      gKey = getSessionApiKey(cs, true);
      if (cs) {
        cs.assignedApiKey = gKey;
        await saveToDB(cs);
        renderSel();
      }
    } else {
      gKey = cs.assignedApiKey;
    }
    keyIndexNum = findSlotIndexForKey(gKey);
  } else {
    gKey = getSessionApiKey(cs, true);
    keyIndexNum = findSlotIndexForKey(gKey);
  }

  // Model Experiential Labs dùng bể 5 key riêng (xoay tua + đếm lượt).
  // Kiểm tra Explabs TRƯỚC và loại trừ khỏi nhánh compat, để thứ tự nhánh không
  // còn phụ thuộc vào việc ID có nằm trong COMPAT_PROVIDERS hay không.
  const usesExplabs = (window.EXPLABS_MODELS || []).includes(am);
  // Model từ gateway OpenAI-compatible (OpenRouter/NVIDIA/Cohere + dynamic providers) không dùng Google API Key
  const providerId = getModelProvider(am);
  const usesCompatGateway =
    !usesExplabs && providerId !== 'google' && !!window.COMPAT_PROVIDERS?.[providerId];
  if (usesCompatGateway) {
    const compatNow = window.COMPAT_PROVIDERS[providerId];
    // Generic key handling for ALL OpenAI-compatible providers (NVIDIA, Cohere, OpenRouter, dynamic)
    // Use provider's keyStorageMultiple() to get correct localStorage key names
    const keyStorageNames =
      typeof compatNow.keyStorageMultiple === 'function' ? compatNow.keyStorageMultiple() : [];
    const keyCount = keyStorageNames.length;

    const keyAtSlot = slot => {
      if (slot < 1 || slot > keyCount) return '';
      const keyName = keyStorageNames[slot - 1];
      let v = (ls.getItem(keyName) || '').trim();
      if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = deobfuscateKey(v);
      return v;
    };

    const slotOfKey = key => {
      const idx = keyStorageNames.indexOf(key);
      return idx >= 0 ? idx + 1 : 1;
    };

    // Read all keys for this provider
    const allKeys = keyStorageNames
      .map(name => {
        let v = (ls.getItem(name) || '').trim();
        if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = deobfuscateKey(v);
        return v;
      })
      .filter(Boolean);

    // Get selector element if exists (dynamic providers may not have UI selector)
    const selEl = $('' + compatNow.id + '-key-select');
    const sel = selEl ? selEl.value : 'auto';

    if (sel !== 'auto' && keyCount > 0) {
      // Manual slot selection: get key from that slot (sel is 0-based index)
      const slotIdx = parseInt(sel, 10);
      if (!isNaN(slotIdx) && slotIdx >= 0 && slotIdx < keyCount) {
        const picked = keyAtSlot(slotIdx + 1) || allKeys[0] || '';
        if (picked) {
          gKey = picked;
          keyIndexNum = slotOfKey(picked);
        }
      }
    } else if (allKeys.length) {
      // Auto round-robin through available keys
      const providerKeyIndexVar = compatNow.keyIndexVar || compatNow.id + 'KeyIndex';
      const providerKeyIndex = (window[providerKeyIndexVar] || 0) % allKeys.length;
      gKey = allKeys[providerKeyIndex];
      window[providerKeyIndexVar] = (providerKeyIndex + 1) % allKeys.length;
      keyIndexNum = slotOfKey(gKey);
    } else {
      // Fallback to legacy single key if exists
      const legacyKeyName = compatNow.keyStorage || 'jarvis_' + compatNow.id + '_api';
      gKey = (ls.getItem(legacyKeyName) || '').trim();
      if (gKey.startsWith('JVENC_') || gKey.startsWith('ENC_')) gKey = deobfuscateKey(gKey);
      keyIndexNum = 1;
    }

    if (!gKey) {
      bD?.remove();
      return showToast(
        'Vui lòng nhập API Key cho provider ' +
          (compatNow.label || compatNow.id) +
          ' trong Cài đặt (⚙️)!',
        'danger'
      );
    }

    // Record usage if function exists
    const recordFn =
      window['record' + compatNow.id.charAt(0).toUpperCase() + compatNow.id.slice(1) + 'Request'];
    if (typeof recordFn === 'function') recordFn(keyIndexNum, am);
  } else if (usesExplabs) {
    // Xoay tua 5 key Experiential Labs, đọc theo SỐ Ô (slot) để khớp bộ đếm
    const elKeyAtSlot = slot => {
      let v = (ls.getItem(`jarvis_explabs_api_${slot}`) || '').trim();
      if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = deobfuscateKey(v);
      return v;
    };
    const elSlotOfKey = key =>
      typeof window.findExplabsSlotIndexForKey === 'function'
        ? window.findExplabsSlotIndexForKey(key)
        : Math.max(1, (window.explabsKeys || []).indexOf(key) + 1);
    const elKeys =
      typeof window.explabsKeys !== 'undefined' && Array.isArray(window.explabsKeys)
        ? window.explabsKeys.filter(Boolean)
        : [];
    const elSelEl = $('explabs-key-select');
    const elSel = elSelEl ? elSelEl.value : 'auto';

    if (elSel !== 'auto') {
      // Chọn thủ công 1 ô: luôn lấy đúng key của ô đó
      const picked = elKeyAtSlot(parseInt(elSel, 10) + 1) || elKeys[0] || '';
      if (picked) {
        gKey = picked;
        keyIndexNum = elSlotOfKey(picked);
      }
    } else if (elKeys.length) {
      // Tự động xoay tua vòng tròn qua các ô có key
      const elIdx = (window.explabsKeyIndex || 0) % elKeys.length;
      gKey = elKeys[elIdx];
      window.explabsKeyIndex = (elIdx + 1) % elKeys.length;
      keyIndexNum = elSlotOfKey(gKey);
    } else {
      // Fallback về key đơn cũ (nếu 5 ô mới đều trống)
      gKey = (ls.getItem('explabs_api_key') || '').trim();
      if (gKey.startsWith('JVENC_') || gKey.startsWith('ENC_')) gKey = deobfuscateKey(gKey);
      keyIndexNum = 1;
    }
    if (!gKey) {
      bD?.remove();
      return showToast('Vui lòng nhập Experiential Labs API Key trong Cài đặt (⚙️)!', 'danger');
    }
    if (typeof window.recordExplabsRequest === 'function')
      window.recordExplabsRequest(keyIndexNum, am);
  } else {
    if (!gKey) return showToast('Cần ít nhất 1 Google API Key trong Cài đặt!', 'danger');
  }

  ls.removeItem('jarvis_draft');
  isProcessing = true;
  abortController = new AbortController();
  // Gateway OpenAI-compatible (OpenRouter) và Experiential Labs không dùng Google Key
  // nên không ghi quota Google - hai bên có bộ đếm riêng, ghi ở trên khi xoay key
  if (!usesCompatGateway && !usesExplabs) recordKeyRequest(keyIndexNum, am);

  DOM.sendBtn.innerHTML = `<span>Dừng</span> 🛑`;
  DOM.sendBtn.style.background = 'var(--danger)';

  let finalResp = '',
    botTime = getNowTime24h(),
    dispText = msg || '📎 [Gửi tệp]',
    fP =
      (txtContent ? (msg ? msg + '\n\n' + txtContent : txtContent) : msg).trim() ||
      'Hãy phân tích nội dung này.';
  let recordedIxId = null;
  let streamFinishReason = null;
  let pS = false,
    lastErr = null;
  let ragMatches = [];
  const startTime = performance.now();

  const saveTurn = async (suffix = '') => {
    if (!finalResp.trim()) return bD?.remove();
    chatHistory.push(
      { role: 'user', text: fP },
      {
        role: 'model',
        text: finalResp,
        time: botTime,
        interactionId: recordedIxId,
        keyIndex: keyIndexNum,
        model: am,
        pinnedKey: keyIndexNum,
      }
    );

    if (cs) {
      cs.his = chatHistory;
      cs.updatedAt = Date.now();
      if (recordedIxId) cs.lastInteractionId = recordedIxId;
      await saveToDB(cs);
      renderSel();
    }

    if (bD?.querySelector('.bot-message')) {
      bD.querySelector('.bot-message').setAttribute('data-raw', finalResp);
      const ixBadge = recordedIxId
        ? `<span class="interaction-id-badge" title="ID: ${recordedIxId}">⚡ ID: ${recordedIxId.slice(0, 8)}... [🔒 Key ${keyIndexNum}]</span>`
        : '';
      let ragBadge = '';
      if (ragMatches && ragMatches.length > 0) {
        const topMatch = ragMatches[0];
        const topPct = Math.round(topMatch.similarity * 100);
        const topTitle = topMatch.item?.title || topMatch.item?.docName || 'Tri thức';
        const payload = encodeURIComponent(
          JSON.stringify(
            ragMatches.map(m => ({
              title: m.item?.title || m.item?.docName || 'Tri thức',
              type: m.item?.type || 'memory',
              similarity: m.similarity,
              text: m.item?.text || '',
            }))
          )
        );
        ragBadge = `<span class="rag-status-badge" onclick="window.JarvisRAG.showRetrievedDetails('${payload}')" title="Trích xuất từ: ${escapeHtml(topTitle)} (${topPct}% khớp). Bấm để xem chi tiết!">🧠 Trí nhớ RAG (${ragMatches.length} mục · ${topPct}%)</span>`;
      }
      const keyBadge = getKeyBadgeHtml(keyIndexNum, am);
      bD.querySelector('.message-header').innerHTML =
        `<span>✨ Jarvis AI</span><span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}${suffix}</span>${keyBadge}${ixBadge}${ragBadge}`;
      const currentBotIdx = chatHistory.length - 1,
        aDiv = document.createElement('div');
      aDiv.className = 'msg-actions';
      const continueBtn =
        streamFinishReason === 'MAX_TOKENS' || (lastErr && pS)
          ? `<button class="action-btn" style="color:var(--primary);font-weight:600;" onclick="continueMsg()" title="Yêu cầu AI viết tiếp phần còn lại">▶️ Viết tiếp</button>`
          : '';
      aDiv.innerHTML = `
            ${continueBtn}
            <button class="action-btn" onclick="copy(this)">📋 Copy</button>
            <button class="action-btn" onclick="togglePinMsg(${currentBotIdx})" title="Ghim tin nhắn">📌 Ghim</button>
            <button class="action-btn" onclick="forkSessionAt(${currentBotIdx})">🌿 Rẽ nhánh</button>
            <button class="action-btn tts-btn" onclick="toggleSpeakMsg(this, ${currentBotIdx})" title="Đọc to bằng giọng nói">🔊 Nghe</button>
            <button class="action-btn" onclick="openMsgInTTSStudio(this, ${currentBotIdx})" title="Chuyển nội dung vào Gemini TTS Studio">🎙️ Studio</button>
            <button class="action-btn" onclick="retryMsg(${currentBotIdx})">🔄 Thử lại</button>
            <button class="action-btn" style="color:var(--danger);" onclick="deleteMsg(${currentBotIdx})">🗑️ Xóa</button>
          `;
      bD.appendChild(aDiv);

      // SMART FOLLOW-UP CHIPS
      setTimeout(() => generateFollowUpSuggestions(fP, finalResp, bD), 500);
    }

    // AUTO-NAME SESSION NẾU PHIÊN CHƯA ĐẶT TÊN
    if (cs && chatHistory.length >= 2) {
      const normName = (cs.name || '').normalize('NFC').trim();
      const isDefaultSessName =
        !normName || /^(hội thoại|phiên|cuộc trò chuyện|new session)/i.test(normName);
      if (isDefaultSessName && !cs.isCustomNamed) {
        setTimeout(() => tryAutoNameSession(cs, fP, finalResp, gKey), 200);
      }
    }

    // AUTO-SUMMARY BỘ NHỚ DÀI HẠN
    if (chatHistory.length > autoSummaryThreshold && cs) {
      condenseSessionMemory(cs);
    }

    // CHATGPT-STYLE AUTO-LEARN MEMORY (Chỉ kích hoạt khi phiên này đang BẬT Trí nhớ RAG)
    const isRagSessionForLearn = cs
      ? cs.rag !== false
      : DOM.toggleRagEmbedding
        ? DOM.toggleRagEmbedding.checked
        : true;
    if (
      isRagSessionForLearn &&
      fP &&
      fP.length >= 8 &&
      window.JarvisRAG &&
      typeof window.JarvisRAG.extractAndLearnMemory === 'function'
    ) {
      setTimeout(() => window.JarvisRAG.extractAndLearnMemory(fP, gKey), 400);
    }

    // TỰ ĐỘNG ĐỒNG BỘ NGẦM LÊN CLOUD SAU KHI CHAT XONG (DEBOUNCE 10 GIÂY)
    if (typeof scheduleAutoSync === 'function') {
      scheduleAutoSync(10000);
    }
  };

  try {
    await appendMsg(
      'user',
      dispText + (filesData.length ? ` [${filesData.length} tệp]` : ''),
      chatHistory.length,
      false
    );
    DOM.input.value = '';
    DOM.input.style.height = '38px';
    updateTokenCount();
    const imgs = [...filesData];
    DOM.clearFilesBtn.click();

    // TYPING INDICATOR BUBBLE
    const currentKeyBadge = getKeyBadgeHtml(keyIndexNum, am);
    // Nhãn chờ: hiện ngay khi gửi, tự biến mất cùng .typing-bubble khi có chunk đầu tiên.
    // Google thường giữ kết nối 5–17s trước byte đầu nên cần chỉ báo để không tưởng app treo.
    const waitProviderLabel = usesExplabs
      ? 'Experiential Labs'
      : usesCompatGateway
        ? window.COMPAT_PROVIDERS?.[providerId]?.label || providerId
        : 'Google';
    bD = document.createElement('div');
    bD.className = 'message-container';
    bD.innerHTML = `
          <div class="bot-message">
            <div class="message-header">
              <span>✨ Jarvis AI</span>
              <span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}</span>
              ${currentKeyBadge}
              <div class="typing-bubble">
                <span class="wait-label">⏳ Đang chờ ${waitProviderLabel}…</span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
            </div>
            <div class="msg-content"></div>
          </div>
        `;
    DOM.chat.appendChild(bD);
    bD.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const cD = bD.querySelector('.msg-content');
    const renderer = createStreamRenderer(cD);
    let fnP = fP;

    let rawMatch = fnP.match(/https?:\/\/[^\s]+/)?.[0];
    const uMatch = rawMatch ? rawMatch.replace(/[.,!?;:)\]]+$/, '') : null;
    if (uMatch) {
      const isYt = uMatch.includes('youtube.com') || uMatch.includes('youtu.be');
      let urlBadge = null;
      const msgHdr = bD?.querySelector('.message-header');
      if (msgHdr) {
        urlBadge = document.createElement('span');
        urlBadge.className = 'search-status-badge';
        urlBadge.style.cssText =
          'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
        urlBadge.innerHTML = isYt
          ? `📺 Đang bóc tách video YouTube...`
          : `🌐 Đang bóc tách liên kết...`;
        msgHdr.appendChild(urlBadge);
      }
      try {
        if (isYt) {
          const yt = await extractYouTubeContent(uMatch);
          if (urlBadge) {
            urlBadge.innerHTML = `📺 Video: <em>"${escapeHtml(yt.title.substring(0, 26))}..."</em>`;
          }
          fnP = `[THÔNG TIN VIDEO YOUTUBE ĐÃ BÓC TÁCH]:\n- Tiêu đề video: "${yt.title}"\n- Kênh sản xuất: ${yt.author}\n- Link gốc: ${uMatch}\n${yt.content ? yt.content + '\n' : ''}\n[YÊU CẦU CỦA NGƯỜI DÙNG ĐỐI VỚI VIDEO NÀY]:\n${fnP}\n\n(CHỈ DẪN QUAN TRỌNG: Bạn ĐÃ CÓ thông tin tiêu đề, kênh phát hành và ngữ cảnh video YouTube ở trên. Hãy giải thích, tóm tắt và phân tích nội dung, ý nghĩa của video một cách chi tiết, chuyên nghiệp, thông minh và thân thiện theo phong cách Jarvis AI. Tuyệt đối KHÔNG từ chối hoặc trả lời là "hệ thống không thể xem/mở video YouTube")`;
        } else {
          const ext = await extractWebPageContent(uMatch);
          if (urlBadge) {
            urlBadge.innerHTML = `🌐 Nguồn: <em>${escapeHtml(ext.source)}</em>`;
          }
          fnP = `[NỘI DUNG TỪ ${uMatch} QUA ${ext.source}]:\n${ext.content}\n\n[YÊU CẦU]:\n${fnP}`;
        }
      } catch (e) {
        if (urlBadge) urlBadge.remove();
      }
    }
    if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    // WEB SEARCH (TAVILY / SERPER)
    const quoted = extractHashKeywords(fnP);
    if (quoted && DOM.toggleSearch.checked) {
      const tgt = DOM.searchEngineSel.value === 'serper' ? 'serper' : 'tavily';

      let actualSearchQuery = quoted;
      const now = new Date();
      const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
      if (
        /(^|\s)(hôm nay|mới nhất|hôm qua)(\s|$)/i.test(quoted) &&
        !quoted.includes(String(now.getFullYear()))
      ) {
        actualSearchQuery = `${quoted} ${dateStr}`;
      }

      let searchBadge = null;
      const msgHdr = bD?.querySelector('.message-header');
      if (msgHdr) {
        searchBadge = document.createElement('span');
        searchBadge.className = 'search-status-badge';
        searchBadge.style.cssText =
          'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
        searchBadge.innerHTML = `🌐 Đang tìm kiếm (${tgt}): <em>"${escapeHtml(quoted)}"</em>...`;
        msgHdr.appendChild(searchBadge);
      }

      let sText = '';
      const primaryFn = tgt === 'serper' ? fetchSerperSearch : fetchTavilySearch;
      const fallbackFn = tgt === 'serper' ? fetchTavilySearch : fetchSerperSearch;

      try {
        sText = await primaryFn(actualSearchQuery);
      } catch (sErr) {
        console.warn(`Lỗi tìm kiếm ${tgt}:`, sErr);
        showToast(
          `⚠️ Lỗi ${tgt}: ${sErr.message || 'Không kết nối được'}. Thử fallback...`,
          'warning'
        );
        try {
          if (searchBadge) searchBadge.innerHTML = `🌐 Đang thử fallback...`;
          sText = await fallbackFn(actualSearchQuery);
        } catch (fbErr) {
          console.warn('Fallback search cũng lỗi:', fbErr);
          showToast(`❌ Không thể tìm kiếm web: ${fbErr.message || sErr.message}`, 'danger');
        }
      }

      if (sText) {
        if (searchBadge) {
          searchBadge.style.background = 'rgba(16,185,129,0.15)';
          searchBadge.style.color = '#10b981';
          searchBadge.innerHTML = `✓ Đã cập nhật Web: "${escapeHtml(quoted)}"`;
          setTimeout(() => {
            if (searchBadge) searchBadge.remove();
          }, 5000);
        }
        fnP = `[DỮ LIỆU TÌM ĐƯỢC TỪ INTERNET CHO TỪ KHÓA "${quoted}"]:\n${sText}\n\n[HÃY TỔNG HỢP THÔNG TIN TÌM ĐƯỢC Ở TRÊN ĐỂ TRẢ LỜI CÂU HỎI SAU]:\n${fnP}`;
      } else if (searchBadge) {
        searchBadge.style.background = 'rgba(239,68,68,0.15)';
        searchBadge.style.color = '#ef4444';
        searchBadge.innerHTML = `⚠️ Không lấy được dữ liệu web`;
        setTimeout(() => {
          if (searchBadge) searchBadge.remove();
        }, 4000);
      }
    }
    if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    // RAG / SECOND BRAIN CONTEXT RETRIEVAL (Gemini Embedding 2 - Chỉ kích hoạt khi phiên này đang BẬT Trí nhớ RAG)
    let ragSnippet = '';
    const isRagSessionForQuery = cs
      ? cs.rag !== false
      : DOM.toggleRagEmbedding
        ? DOM.toggleRagEmbedding.checked
        : true;
    if (
      isRagSessionForQuery &&
      window.JarvisRAG &&
      typeof window.JarvisRAG.retrieveContext === 'function'
    ) {
      try {
        const ragRes = await window.JarvisRAG.retrieveContext(fP, gKey);
        if (typeof ragRes === 'string') {
          ragSnippet = ragRes;
        } else if (ragRes) {
          ragSnippet = ragRes.text || '';
          ragMatches = ragRes.matches || [];
        }
      } catch (rErr) {
        console.warn('[RAG] Lỗi truy vấn ngữ cảnh:', rErr);
      }
    }

    // BẮT BUỘC TIÊM TRÍ NHỚ RAG TRỰC TIẾP VÀO PROMPT ĐỂ ĐẢM BẢO MODEL LUÔN NHÌN THẤY VÀ ƯU TIÊN TUYỆT ĐỐI
    if (ragSnippet) {
      fnP = `${ragSnippet}\n\n[CÂU HỎI CỦA NGƯỜI DÙNG]:\n${fnP}`;
      if (ragMatches && ragMatches.length > 0) {
        const msgHdr = bD?.querySelector('.message-header');
        if (msgHdr && !msgHdr.querySelector('.rag-live-badge')) {
          const liveBadge = document.createElement('span');
          liveBadge.className = 'rag-live-badge';
          liveBadge.style.cssText =
            'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(139,92,246,0.15);color:#8b5cf6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:6px;';
          liveBadge.innerHTML = `🧠 Đã nạp ${ragMatches.length} mục tri thức (${Math.round(ragMatches[0].similarity * 100)}%)`;
          msgHdr.appendChild(liveBadge);
        }
      }
    }

    const base64Files = [];
    for (const f of imgs) base64Files.push(await fileToBase64(f));

    // KHÔNG chèn mốc thời gian vào tin nhắn người dùng nữa: model hay lặp lại nguyên câu
    // "[Mốc thời gian gửi tin: ...]" / "[Timestamp sent: ...]" ở đầu câu trả lời. Mốc thời
    // gian hiện tại đã nằm trong system instruction (getDynamicSI → timeInstruction).
    const promptWithTime = fnP || '[Người dùng gửi tệp đính kèm]';

    const currentParts = [{ text: promptWithTime }];
    base64Files.forEach(({ mimeType, data }) => {
      currentParts.push({ inlineData: { mimeType, data } });
    });

    // Có ít nhất 1 ảnh trong lượt này? (dùng chung cho mọi nhánh model)
    const hasImageFiles = base64Files.some(f => String(f.mimeType || '').startsWith('image/'));

    const interactionInput = [];
    if (fnP) interactionInput.push({ type: 'text', text: promptWithTime });
    base64Files.forEach(({ mimeType, data }) => {
      // Interactions API chỉ nhận type 'image' cho ảnh thật (video/audio không gửi kiểu này)
      if (String(mimeType || '').startsWith('image/')) {
        interactionInput.push({ type: 'image', data, mime_type: mimeType });
      }
    });

    const thk = DOM.thinking.value;

    // --- ENGINE 0: EXPERIENTIAL LABS GATEWAY (gpt-6-luna, deepseek-v4.1-flash, clef) ---
    const isExplabsModel =
      am === 'gpt-6-luna' || am === 'deepseek-v4.1-flash' || am === 'qwen4-max:free';
    if (isExplabsModel) {
      let expKey = gKey;
      if (!expKey) {
        expKey = (ls.getItem('explabs_api_key') || '').trim();
        if (expKey.startsWith('JVENC_') || expKey.startsWith('ENC_'))
          expKey = deobfuscateKey(expKey);
      }
      if (!expKey) {
        bD.remove();
        showToast('Vui lòng nhập Experiential Labs API Key trong Cài đặt (⚙️)!', 'danger');
        return;
      }

      bD.querySelector('.typing-bubble')?.remove();

      if (am === 'clef') {
        // Clef is Cloudflare Decision Model on /v1/systemone
        try {
          const res = await fetch('https://api.experientiallabs.ai/v1/systemone', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + expKey,
            },
            body: JSON.stringify({
              model: 'clef',
              state: fnP,
              questions: {
                analysis: {
                  type: 'choice',
                  instructions: 'Đánh giá trạng thái hoặc câu hỏi của người dùng',
                  criteria: {
                    positive_or_valid: 'Nội dung tích cực, hợp lệ hoặc yêu cầu xử lý bình thường',
                    negative_or_alert:
                      'Nội dung cảnh báo, sự cố, cần can thiệp khẩn cấp hoặc câu hỏi tiêu cực',
                  },
                },
              },
            }),
            signal: abortController.signal,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.error?.message || 'HTTP ' + res.status);
          }

          const data = await res.json();
          const ans = data?.answers?.analysis;
          finalResp =
            '### 🎯 Kết quả Quyết định từ Mô hình Clef (Decision Engine)\n' +
            '- **Quyết định (Choice):** `' +
            (ans?.choice || 'N/A') +
            '`\n' +
            '- **Độ tin cậy (Confidence):** `' +
            (ans?.confidence ? Math.round(ans.confidence * 100) + '%' : 'N/A') +
            '`\n' +
            '- **Xác suất phân bổ (Probabilities):**\n' +
            '```json\n' +
            JSON.stringify(ans?.probabilities || {}, null, 2) +
            '\n' +
            '```\n' +
            '- **Token đã dùng:** `' +
            (data?.usage?.input_tokens || 0) +
            '` input tokens (Provider: `' +
            (data?.provider || 'experiential_cloud') +
            '`)';

          await renderer.flush(finalResp);
          pS = true;
          if ($('latency-val'))
            $('latency-val').innerText = Math.round(performance.now() - startTime);
        } catch (clefErr) {
          if (clefErr.name === 'AbortError' || abortController.signal.aborted) throw clefErr;
          lastErr = clefErr;
          finalResp = `*(⚠️ Lỗi Experiential Labs [Clef]: ${clefErr.message})*`;
          await renderer.flush(finalResp);
          pS = true;
        }
      } else {
        // Conversational Models (gpt-6-luna, deepseek-v4.1-flash) on /v1/chat/completions (SSE Stream)
        try {
          const expMessages = [];
          const dynamicSI = getDynamicSI(ragSnippet);
          if (dynamicSI) {
            expMessages.push({ role: 'system', content: dynamicSI });
          }
          if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
            chatHistory.slice(-10).forEach(m => {
              // Chỉ gửi phần trả lời, bỏ khối 💭 đã render (dữ liệu lưu vẫn nguyên)
              const txt = stripThinkingForCopy(m.text);
              if (txt)
                expMessages.push({
                  role: m.role === 'model' ? 'assistant' : 'user',
                  content: txt,
                });
            });
          }
          // Ảnh LUÔN được gửi cho mọi model Explabs; model từ chối thì gửi lại không kèm ảnh.
          const expUserContent = withImages => {
            if (!hasImageFiles) return promptWithTime;
            const parts = [{ type: 'text', text: promptWithTime }];
            if (withImages) {
              for (const f of base64Files) {
                if (String(f.mimeType || '').startsWith('image/')) {
                  parts.push({
                    type: 'image_url',
                    image_url: { url: `data:${f.mimeType};base64,${f.data}` },
                  });
                }
              }
            }
            return parts;
          };
          let expWithImages = hasImageFiles;
          expMessages.push({ role: 'user', content: expUserContent(expWithImages) });

          // reasoning_effort cho các model Experiential Labs hỗ trợ (Qwen4 Max, GPT-6 Luna, DeepSeek V4.1 Flash)
          // Think Depth minimal -> none (tắt), low/medium/high giữ nguyên
          const expReasoningMap = { minimal: 'none', low: 'low', medium: 'medium', high: 'high' };
          const expLevel = expReasoningMap[DOM.thinking?.value] || 'low';
          const supportsReasoningEffort =
            am === 'qwen4-max:free' || am === 'gpt-6-luna' || am === 'deepseek-v4.1-flash';
          const sendExp = () =>
            fetch('https://api.experientiallabs.ai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + expKey,
              },
              body: JSON.stringify(
                Object.assign(
                  {
                    model: am,
                    messages: expMessages,
                    stream: true,
                    max_tokens: 4096,
                  },
                  supportsReasoningEffort ? { reasoning_effort: expLevel } : {}
                )
              ),
              signal: abortController.signal,
            });

          let expRes = await sendExp();
          if (!expRes.ok) {
            const errData = await expRes.json().catch(() => ({}));
            const expErrMsg = errData?.error?.message || 'HTTP ' + expRes.status;
            // Model không xử lý ảnh: báo toast theo tên model, gửi lại đúng lượt này không kèm ảnh
            if (expWithImages && isImageRejection(expErrMsg)) {
              expWithImages = false;
              expMessages[expMessages.length - 1].content = expUserContent(false);
              notifyImagesUnsupported(modelLabelOf(am));
              expRes = await sendExp();
            }
            if (!expRes.ok) {
              const errData2 = await expRes.json().catch(() => ({}));
              throw new Error(errData2?.error?.message || expErrMsg);
            }
          }

          const reader = expRes.body.getReader();
          const decoder = new TextDecoder();
          let sseDone = false;
          let sseBuffer = '';
          let currentThinking = '';
          let currentContent = '';
          // Đo cách server chia chunk (Qwen vs DeepSeek)
          let expEvents = 0,
            expThinkEvents = 0,
            expTextEvents = 0,
            firstThinkMs = 0,
            firstTextMs = 0;
          const expModelName =
            am === 'gpt-6-luna'
              ? 'GPT-6 Luna'
              : am === 'gpt-6.2-astra:free'
                ? 'GPT-6.2 Astra'
                : am.includes('qwen')
                  ? 'Qwen4 Max'
                  : am.includes('deepseek')
                    ? 'DeepSeek'
                    : 'AI';

          while (!sseDone) {
            const { value, done: streamDone } = await reader.read();
            if (streamDone) break;
            sseBuffer += decoder.decode(value, { stream: true });

            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.slice(5).trim();
                try {
                  const parsed = JSON.parse(jsonStr);
                  expEvents++;
                  const deltaThinking =
                    parsed.choices?.[0]?.delta?.reasoning_content ||
                    parsed.choices?.[0]?.delta?.reasoning ||
                    parsed.choices?.[0]?.delta?.thought ||
                    '';
                  const deltaText = parsed.choices?.[0]?.delta?.content || '';
                  if (deltaThinking) {
                    currentThinking += deltaThinking;
                    expThinkEvents++;
                    if (!firstThinkMs) firstThinkMs = Math.round(performance.now() - startTime);
                  }
                  if (deltaText) {
                    currentContent += deltaText;
                    expTextEvents++;
                    if (!firstTextMs) firstTextMs = Math.round(performance.now() - startTime);
                  }
                  if (deltaThinking || deltaText) {
                    finalResp = formatThinkingResponse(
                      currentThinking,
                      currentContent,
                      expModelName
                    );
                    renderer.push(finalResp);
                    if ($('latency-val') && !pS)
                      $('latency-val').innerText = Math.round(performance.now() - startTime);
                    pS = true;
                  }
                } catch (_) {}
              }
            }
          }

          // CHẨN ĐOÁN: events = tổng event SSE, thinkEvents = số event mang suy luận.
          // thinkEvents <= 2 nghĩa là server gửi suy luận 1 cục (không phải lỗi renderer).
          console.warn(
            '[ExLabs V73]',
            am,
            '| events =',
            expEvents,
            '| thinkEvents =',
            expThinkEvents,
            '| textEvents =',
            expTextEvents,
            '| firstThink =',
            firstThinkMs,
            'ms | firstText =',
            firstTextMs,
            'ms | thinking =',
            currentThinking.length,
            'ký tự | content =',
            currentContent.length,
            'ký tự'
          );
          window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
            branch: 'exp-stream',
            model: am,
            expEvents,
            expThinkEvents,
            expTextEvents,
            firstThinkMs,
            firstTextMs,
            thinkingChars: currentThinking.length,
            contentChars: currentContent.length,
          });

          finalResp = formatFinalThinkingResponse(currentThinking, currentContent, expModelName);
          if (!currentContent.trim() && currentThinking.trim()) {
            currentContent = currentThinking.trim();
            currentThinking = '';
            finalResp = formatFinalThinkingResponse(currentThinking, currentContent, expModelName);
          }
          await renderer.flush(finalResp);
          pS = true;
        } catch (expErr) {
          if (expErr.name === 'AbortError' || abortController.signal.aborted) throw expErr;
          lastErr = expErr;
          if (pS) {
            finalResp += `\n\n*(⚠️ Quá trình stream bị ngắt: ${expErr.message})*`;
            if (!currentContent.trim() && currentThinking.trim()) {
              currentContent = currentThinking.trim();
              currentThinking = '';
            }
            finalResp = formatFinalThinkingResponse(currentThinking, currentContent, expModelName);
            await renderer.flush(finalResp);
          } else {
            bD.remove();
            return showToast(`Lỗi Experiential Labs: ${expErr.message}`, 'danger');
          }
        }
      }

      if (pS) {
        await saveTurn();
        return;
      }
    }

    // --- ENGINE 0B: GATEWAY OpenAI-COMPATIBLE (OpenRouter/NVIDIA/Cohere/dynamic) ---
    // Tên biến phải KHÁC `providerId` ở phạm vi sendMessage: khai báo lại cùng tên
    // trong khối try sẽ shadow biến ngoài và gây TDZ cho các chỗ dùng trước đó
    // (vd nhãn "Đang chờ <provider>…").
    const compatProviderId = getModelProvider(am);
    const prov = window.COMPAT_PROVIDERS?.[compatProviderId];
    if (prov) {
      // Key đã được chọn + xoay tua ở đầu sendMessage; đây chỉ là lưới an toàn
      let compatKey = gKey;
      if (!compatKey) {
        const orKeys =
          prov.id === 'openrouter' &&
          typeof window.openRouterKeys !== 'undefined' &&
          Array.isArray(window.openRouterKeys)
            ? window.openRouterKeys.filter(Boolean)
            : [];
        if (orKeys.length) {
          const orSelEl = $('openrouter-key-select');
          const orSel = orSelEl ? orSelEl.value : 'auto';
          let orIdx = 0;
          if (orSel !== 'auto') {
            const slot = parseInt(orSel, 10) + 1;
            let slotKey = (ls.getItem(`jarvis_openrouter_api_${slot}`) || '').trim();
            if (slotKey.startsWith('JVENC_') || slotKey.startsWith('ENC_'))
              slotKey = deobfuscateKey(slotKey);
            orIdx = Math.max(0, orKeys.indexOf(slotKey));
          } else {
            orIdx = (window.openRouterKeyIndex || 0) % orKeys.length;
            window.openRouterKeyIndex = (orIdx + 1) % orKeys.length;
          }
          compatKey = orKeys[orIdx];
          keyIndexNum =
            typeof window.findOpenRouterSlotIndexForKey === 'function'
              ? window.findOpenRouterSlotIndexForKey(compatKey)
              : orIdx + 1;
        } else {
          compatKey = (ls.getItem(prov.keyStorage) || '').trim();
          if (compatKey.startsWith('JVENC_') || compatKey.startsWith('ENC_'))
            compatKey = deobfuscateKey(compatKey);
          if (!compatKey && prov.keyCount > 1) {
            for (let i = 1; i <= prov.keyCount; i++) {
              let slotKey = (ls.getItem(`jarvis_${prov.id}_api_${i}`) || '').trim();
              if (slotKey.startsWith('JVENC_') || slotKey.startsWith('ENC_'))
                slotKey = deobfuscateKey(slotKey);
              if (slotKey) {
                compatKey = slotKey;
                keyIndexNum = i;
                break;
              }
            }
          }
        }
      }
      if (!compatKey) {
        bD.remove();
        return showToast(`Vui lòng nhập ${prov.keyLabel} API Key trong Cài đặt (⚙️)!`, 'danger');
      }

      bD.querySelector('.typing-bubble')?.remove();

      // Dựng messages theo chuẩn OpenAI: system + 10 tin gần nhất + lượt hiện tại (kèm tệp nếu model nhận)
      const mOpts = (window.COMPAT_MODEL_OPTS || {})[am] || null;
      const compatMessages = [];
      const compatSI = getDynamicSI(ragSnippet);
      if (compatSI) compatMessages.push({ role: 'system', content: compatSI });
      if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
        chatHistory.slice(-10).forEach(m => {
          // Chỉ gửi phần trả lời, bỏ khối 💭 đã render (dữ liệu lưu vẫn nguyên)
          const txt = stripThinkingForCopy(m.text);
          if (txt)
            compatMessages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: txt });
        });
      }
      if (base64Files && base64Files.length > 0) {
        const compatUserContent = [{ type: 'text', text: promptWithTime }];
        // Ảnh LUÔN gửi cho MỌI model (kể cả model khai báo text-only): provider từ chối thì
        // vòng thử lại bên dưới bắt lỗi, báo toast "<tên model> does not process images"
        // rồi gửi lại không kèm ảnh. Chỉ video/audio còn lọc theo inputModalities.
        const accepts =
          mOpts && Array.isArray(mOpts.inputModalities) ? mOpts.inputModalities : ['text', 'image'];
        const skippedKinds = [];
        for (const f of base64Files) {
          const mt = f.mimeType || '';
          if (mt.startsWith('image/')) {
            compatUserContent.push({
              type: 'image_url',
              image_url: { url: `data:${mt};base64,${f.data}` },
            });
          } else if (mt.startsWith('video/')) {
            if (!accepts.includes('video')) {
              skippedKinds.push('video');
              continue;
            }
            compatUserContent.push({
              type: 'video_url',
              video_url: { url: `data:${mt};base64,${f.data}` },
            });
          } else if (mt.startsWith('audio/')) {
            if (!accepts.includes('audio')) {
              skippedKinds.push('audio');
              continue;
            }
            // audio/mpeg -> mp3, audio/mp4 + audio/x-m4a -> m4a, audio/x-wav -> wav
            const fmt = (mt.split('/')[1] || 'wav')
              .replace('mpeg', 'mp3')
              .replace('x-m4a', 'm4a')
              .replace('mp4', 'm4a')
              .replace('x-wav', 'wav');
            compatUserContent.push({
              type: 'input_audio',
              input_audio: { data: f.data, format: fmt },
            });
          }
        }
        if (skippedKinds.length) {
          showToast(
            `${prov.modelLabel(am)} không nhận ${[...new Set(skippedKinds)].join(', ')} — đã bỏ qua tệp đó.`,
            'danger'
          );
        }
        compatMessages.push({ role: 'user', content: compatUserContent });
      } else {
        compatMessages.push({ role: 'user', content: promptWithTime });
      }

      const compatLabel = prov.modelLabel(am);
      // Ảnh đã gửi kèm lượt này? Nếu provider từ chối, gỡ ảnh rồi gửi lại đúng một lần.
      let compatHasImages = hasImageFiles;
      const dropCompatImages = () => {
        for (let i = compatMessages.length - 1; i >= 0; i--) {
          const cMsg = compatMessages[i];
          if (cMsg.role !== 'user' || !Array.isArray(cMsg.content)) continue;
          const kept = cMsg.content.filter(p => p.type !== 'image_url');
          cMsg.content = kept.length > 1 ? kept : kept[0]?.text || promptWithTime;
          return true;
        }
        return false;
      };
      let compatThinking = '';
      let compatContent = '';

      try {
        const compatHeaders = {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + compatKey,
        };
        if (typeof prov.extraHeaders === 'function' && /^https?:$/.test(location.protocol)) {
          Object.assign(compatHeaders, prov.extraHeaders() || {});
        }

        // --- BẬT SUY LUẬN (REASONING) THEO MỨC "THINK DEPTH" ĐANG CHỌN ---
        // Tham số generation (temperature, top_p, top_k) cho NVIDIA/OpenRouter models
        // Ưu tiên: model-specific defaults (COMPAT_MODEL_OPTS) > UI settings (DOM) > fallback defaults
        const compatTemperature =
          mOpts && typeof mOpts.temperature === 'number'
            ? mOpts.temperature
            : DOM.temp?.value !== undefined
              ? +DOM.temp.value
              : 0.7;
        const compatTopP =
          mOpts && typeof mOpts.topP === 'number'
            ? mOpts.topP
            : DOM.topP?.value !== undefined
              ? +DOM.topP.value
              : 0.9;
        const compatTopK =
          mOpts && typeof mOpts.topK === 'number'
            ? mOpts.topK
            : DOM.topK?.value !== undefined
              ? +DOM.topK.value
              : 40;

        const compatBody = {
          model: am,
          messages: compatMessages,
          stream: true,
          max_tokens: mOpts && mOpts.maxTokens ? mOpts.maxTokens : 8192,
          temperature: compatTemperature,
          top_p: compatTopP,
          top_k: compatTopK,
        };
        // Gateway giới hạn whitelist tham số (Cohere Compatibility: top_k -> HTTP 422)
        if (Array.isArray(prov.unsupportedParams)) {
          for (const p of prov.unsupportedParams) delete compatBody[p];
        }
        const compatReasoning = buildReasoningPayload(mOpts, thk);
        if (prov.reasoningEffortParam) {
          // Cohere: chỉ nhận reasoning_effort 'high' (bật) hoặc không gửi tham số (tắt).
          // Gửi 'none' có thể vẫn khiến Command A+ trả reasoning -> chỉ gửi khi thk !== 'none'.
          if (thk && thk !== 'none') {
            compatBody[prov.reasoningEffortParam] = 'high';
          }
        } else if (compatReasoning) {
          compatBody.reasoning = compatReasoning;
          // enabled: false = đã tắt hẳn -> không cần xin trả reasoning
          if (prov.includeReasoning && compatReasoning.enabled !== false) {
            compatBody.include_reasoning = true;
          }
        }
        // NVIDIA integrate: reasoning đi qua chat_template_kwargs (+ effort / budget)
        const nvThinking = buildNvidiaThinking(mOpts, thk);
        if (nvThinking) Object.assign(compatBody, nvThinking);

        const compatBase = typeof prov.getBaseUrl === 'function' ? prov.getBaseUrl() : prov.baseUrl;
        const compatUrl = `${compatBase}/chat/completions`;
        console.log(`[Gateway ${prov.keyLabel}] Endpoint:`, compatUrl);
        const sendCompat = () =>
          fetch(compatUrl, {
            method: 'POST',
            headers: compatHeaders,
            body: JSON.stringify(compatBody),
            signal: abortController.signal,
          });

        let compatRes = null;
        let compatErrText = '';
        // Bể key của provider: chỉ xoay sang key khác khi đang để "Tự động xoay tua"
        // (khóa thủ công 1 key thì giữ đúng key đó, giống nhánh Google).
        // Use generic key array for ALL OpenAI-compatible providers (NVIDIA, Cohere, OpenRouter, dynamic)
        const compatKeysVar = prov.id + 'Keys';
        const compatPoolSrc = window[compatKeysVar];
        const compatPool = Array.isArray(compatPoolSrc) ? compatPoolSrc.filter(Boolean) : [];
        const compatSelEl = $(prov.id + '-key-select');
        const compatAuto = !compatSelEl || compatSelEl.value === 'auto';
        const compatSlotOf = key => {
          const findSlotFn =
            window['find' + prov.id.charAt(0).toUpperCase() + prov.id.slice(1) + 'SlotIndexForKey'];
          if (typeof findSlotFn === 'function') return findSlotFn(key);
          return keyIndexNum;
        };
        let compatKeySwitches = 0;
        // Provider tạm thời quá tải (Google AI Studio hay trả 503 rồi 200 ngay sau đó) → thử lại vài lần
        const COMPAT_MAX_ATTEMPTS = 4;
        const COMPAT_RETRY_DELAYS = [600, 1500, 2500];
        // Tham số optional có thể bị gateway từ chối (422 "x is not supported") -> được phép gỡ rồi thử lại.
        // Không bao giờ gỡ model/messages/stream vì thiếu là hỏng request.
        const COMPAT_STRIPPABLE_PARAMS = [
          'top_k',
          'top_p',
          'temperature',
          'max_tokens',
          'seed',
          'stop',
          'frequency_penalty',
          'presence_penalty',
          'reasoning_effort',
          'reasoning',
          'include_reasoning',
          'stream_options',
        ];
        let compatParamStrips = 0;
        const compatSleep = ms =>
          new Promise((resolve, reject) => {
            const t = setTimeout(resolve, ms);
            abortController.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                const e = new Error('Aborted');
                e.name = 'AbortError';
                reject(e);
              },
              { once: true }
            );
          });
        for (let attempt = 0; attempt < COMPAT_MAX_ATTEMPTS; attempt++) {
          compatRes = await sendCompat();
          if (compatRes.ok) break;
          compatErrText = await compatRes.text().catch(() => '');
          // Model không xử lý ảnh (text-only): bỏ ảnh khỏi lượt, báo toast theo tên model, thử lại
          if (
            compatHasImages &&
            attempt < COMPAT_MAX_ATTEMPTS - 1 &&
            compatRes.status >= 400 &&
            compatRes.status < 500 &&
            isImageRejection(compatErrText)
          ) {
            compatHasImages = false;
            dropCompatImages();
            notifyImagesUnsupported(compatLabel);
            compatErrText = '';
            continue;
          }
          // Gateway từ chối ĐÚNG một tham số (vd Cohere: "top_k is not supported" - HTTP 422):
          // gỡ tham số đó rồi thử lại thay vì báo lỗi cả lượt.
          const rejectedParam = (() => {
            if (!(compatRes.status >= 400 && compatRes.status < 500)) return '';
            const m =
              compatErrText.match(/['"`]?([a-z][a-z_]{1,40})['"`]?\s+is not supported/i) ||
              compatErrText.match(
                /unsupported\s+(?:parameter|field)?\s*:?\s*['"`]?([a-z][a-z_]{1,40})/i
              ) ||
              compatErrText.match(
                /unrecognized\s+(?:request\s+)?(?:argument|parameter|field)\s*:?\s*['"`]?([a-z][a-z_]{1,40})/i
              );
            const p = m && m[1];
            return p && COMPAT_STRIPPABLE_PARAMS.includes(p) ? p : '';
          })();
          if (rejectedParam && compatParamStrips < 3) {
            delete compatBody[rejectedParam];
            compatParamStrips++;
            console.warn(
              `[Gateway ${prov.keyLabel}] HTTP ${compatRes.status}: gỡ tham số "${rejectedParam}" rồi thử lại.`
            );
            compatErrText = '';
            continue;
          }
          // Gateway không hỗ trợ tham số reasoning (400/4xx + thông báo liên quan): gỡ ra và thử lại
          const rejectedReasoning =
            compatBody.reasoning &&
            compatRes.status >= 400 &&
            compatRes.status < 500 &&
            /reason|unknown|unsupported|unrecogni|invalid.?param|extra/i.test(compatErrText);
          if (rejectedReasoning) {
            delete compatBody.reasoning;
            delete compatBody.include_reasoning;
            compatErrText = '';
            continue;
          }
          // Key bị từ chối / hết hạn ngạch: xoay sang key kế tiếp trong bể thay vì
          // thử lại cùng một key rồi báo lỗi cả lượt.
          const keyRejected = [401, 402, 403, 429].includes(compatRes.status);
          if (
            keyRejected &&
            compatAuto &&
            compatPool.length > 1 &&
            compatKeySwitches < compatPool.length - 1
          ) {
            const curIdx = compatPool.indexOf(compatKey);
            const nextKey = compatPool[(curIdx + 1) % compatPool.length];
            compatKeySwitches++;
            if (nextKey && nextKey !== compatKey) {
              const failedSlot = keyIndexNum;
              compatKey = nextKey;
              compatHeaders.Authorization = 'Bearer ' + compatKey;
              keyIndexNum = compatSlotOf(compatKey);
              // Đẩy con trỏ xoay tua qua key vừa dùng để lượt sau không lặp lại key này
              if (prov.keyIndexVar)
                window[prov.keyIndexVar] = (compatPool.indexOf(compatKey) + 1) % compatPool.length;
              showToast(
                `⚠️ ${prov.keyLabel} Key #${failedSlot} lỗi (HTTP ${compatRes.status}), đang xoay sang Key #${keyIndexNum}...`,
                'warning'
              );
              compatErrText = '';
              continue;
            }
          }
          // 429/502/503/504 = lỗi tạm thời phía provider, chờ rồi thử lại thay vì báo lỗi ngay
          const transient = [429, 502, 503, 504].includes(compatRes.status);
          if (!transient || attempt >= COMPAT_MAX_ATTEMPTS - 1) break;
          const wait = COMPAT_RETRY_DELAYS[Math.min(attempt, COMPAT_RETRY_DELAYS.length - 1)];
          console.warn(
            `[Gateway ${prov.keyLabel}] HTTP ${compatRes.status} - thử lại lần ${attempt + 1}/${COMPAT_MAX_ATTEMPTS - 1} sau ${wait}ms`
          );
          if ($('latency-val'))
            $('latency-val').innerText = `↻ thử lại (${attempt + 1}/${COMPAT_MAX_ATTEMPTS - 1})`;
          compatErrText = '';
          await compatSleep(wait);
        }

        if (!compatRes || !compatRes.ok) {
          let apiMsg = '';
          let rawMsg = '';
          let provName = '';
          try {
            const parsedErr = JSON.parse(compatErrText);
            apiMsg =
              parsedErr?.detail ||
              parsedErr?.error?.message ||
              parsedErr?.message ||
              parsedErr?.title ||
              '';
            // OpenRouter: lý do thật nằm trong error.metadata (raw / provider_name), message chỉ là "Provider returned error"
            rawMsg = parsedErr?.error?.metadata?.raw || parsedErr?.metadata?.raw || '';
            provName =
              parsedErr?.error?.metadata?.provider_name || parsedErr?.metadata?.provider_name || '';
          } catch (_) {}
          if (rawMsg) {
            // Toast chỉ hiện message + mã lỗi của provider, không dump JSON thô
            const via = provName ? `[${provName}] ` : '';
            apiMsg = `${via}${formatUpstreamError(rawMsg, compatRes.status)}`;
          } else if (apiMsg && compatRes.status) {
            apiMsg = `${apiMsg} (HTTP ${compatRes.status})`;
          }
          // 401/403 từ NVIDIA = key bị từ chối, không phải lỗi model/mạng -> nói rõ việc cần làm
          if (prov.id === 'nvidia' && compatRes && [401, 403].includes(compatRes.status)) {
            apiMsg = `Key NVIDIA bị từ chối (HTTP ${compatRes.status}): key sai/hết hạn hoặc không có quyền với model này. Kiểm tra lại key đang chọn (bấm "🔌 Kiểm tra kết nối" trong Cài đặt).`;
          }
          throw new Error(apiMsg || 'HTTP ' + (compatRes ? compatRes.status : '?'));
        }

        const compatReader = compatRes.body.getReader();
        const compatDecoder = new TextDecoder();
        let compatBuffer = '';
        let compatDone = false;

        while (!compatDone) {
          const { value, done: chunkDone } = await compatReader.read();
          if (chunkDone) break;
          compatBuffer += compatDecoder.decode(value, { stream: true });

          const lines = compatBuffer.split('\n');
          compatBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed === 'data: [DONE]') {
              compatDone = true;
              break;
            }
            if (!trimmed.startsWith('data:')) continue;
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim());
              const delta = parsed.choices?.[0]?.delta || {};
              const deltaThinking =
                delta.reasoning_content || delta.reasoning || delta.thought || '';
              const deltaText = delta.content || '';
              if (deltaThinking) compatThinking += deltaThinking;
              if (deltaText) compatContent += deltaText;
              if (deltaThinking || deltaText) {
                finalResp = formatThinkingResponse(compatThinking, compatContent, compatLabel);
                renderer.push(finalResp);
                if ($('latency-val') && !pS)
                  $('latency-val').innerText = Math.round(performance.now() - startTime);
                pS = true;
              }
            } catch (_) {}
          }
        }

        finalResp = formatFinalThinkingResponse(compatThinking, compatContent, compatLabel);
        if (!compatContent.trim() && compatThinking.trim()) {
          compatContent = compatThinking.trim();
          compatThinking = '';
          finalResp = formatFinalThinkingResponse('', compatContent, compatLabel);
        }
        await renderer.flush(finalResp);
        pS = true;
      } catch (compatErr) {
        if (compatErr.name === 'AbortError' || abortController.signal.aborted) throw compatErr;
        lastErr = compatErr;
        if (pS) {
          finalResp =
            formatFinalThinkingResponse(compatThinking, compatContent, compatLabel) +
            `\n\n*(⚠️ Quá trình stream bị ngắt: ${compatErr.message})*`;
          await renderer.flush(finalResp);
        } else {
          bD.remove();
          const networkLike = /failed to fetch|networkerror|load failed/i.test(
            compatErr.message || ''
          );
          if (prov.id === 'nvidia' && networkLike) {
            return showToast(
              `Lỗi NVIDIA: không kết nối được proxy (${compatErr.message}). Kiểm tra mạng hoặc NVIDIA Proxy URL trong Cài đặt.`,
              'danger'
            );
          }
          if (networkLike) {
            // In luôn endpoint để biết base URL của provider đang trỏ đâu (Kilo trên APK
            // hay gặp "Failed to fetch" khi Base URL trỏ thẳng gateway chặn CORS).
            return showToast(
              `Lỗi ${prov.keyLabel}: không kết nối được ${compatUrl} (${compatErr.message}). Kiểm tra Base URL của provider trong Cài đặt.`,
              'danger'
            );
          }
          return showToast(`Lỗi ${prov.keyLabel}: ${compatErr.message}`, 'danger');
        }
      }

      if (pS) {
        await saveTurn();
        return;
      }
    }

    // ENGINE 1: INTERACTIONS API
    if (currentEngine === 'interactions') {
      const interactionParams = {
        model: am,
        input: imgs.length ? interactionInput : promptWithTime,
        stream: true,
      };

      const dynamicSI = getDynamicSI(ragSnippet);
      if (dynamicSI) {
        interactionParams.system_instruction = dynamicSI;
      }

      // Cấu hình GenerationConfig cho Interactions API (không nhận temperature/topP/topK)
      const genConfig = {};
      // Cùng bảng mức như nhánh stream: 3.8 Flash / 4 Hydrogen KHÔNG nhận 'minimal'
      const ixThinkLevel = resolveThinkingLevel(am, thk) || thk;
      if (thk && thk !== 'none' && ixThinkLevel) {
        genConfig.thinking_level = ixThinkLevel;
      }
      if (Object.keys(genConfig).length > 0) {
        interactionParams.generation_config = genConfig;
      }

      // QUẢN LÝ TIẾP NỐI MẠCH HỘI THOẠI (STATEFUL INTERACTIONS)
      const isMemoryEnabled = DOM.toggleMemory?.checked !== false;
      if (isMemoryEnabled) {
        if (cs?.lastInteractionId) {
          // Dùng 100% Google Server State (chỉ gửi previous_interaction_id, input chỉ có câu hỏi hiện tại)
          interactionParams.previous_interaction_id = cs.lastInteractionId;
        } else if (chatHistory.length > 0) {
          // Tiếp tế bối cảnh 1 lần duy nhất cho lượt khởi động nếu chưa có ID trên server Google
          const histSummary = chatHistory
            .slice(-10)
            .map(
              m => `${m.role === 'model' ? 'AI' : 'Người dùng'}: ${stripThinkingForCopy(m.text)}`
            )
            .join('\n\n');
          const seededPrompt = `[BỐI CẢNH CÁC LƯỢT TRÒ CHUYỆN TRƯỚC ĐÓ]:\n${histSummary}\n\n[CÂU HỎI TIẾP THEO CỦA NGƯỜI DÙNG]:\n${fnP}`;
          if (imgs.length) {
            interactionParams.input = [
              { type: 'text', text: seededPrompt },
              ...base64Files.map(({ mimeType, data }) => ({
                type: 'image',
                data,
                mime_type: mimeType,
              })),
            ];
          } else {
            interactionParams.input = seededPrompt;
          }
        }
      }

      let streamObj = null;
      let currentTryKey = gKey;
      let retryCount = 0;
      const maxRetries = Math.min(apiKeys.length, 3);
      // Ảnh đã gửi kèm lượt này? Model từ chối thì bỏ ảnh, báo toast rồi thử lại.
      let ixHasImages = hasImageFiles;

      while (retryCount <= maxRetries) {
        try {
          const ai = new GoogleGenAI({
            apiKey: currentTryKey,
          });

          try {
            streamObj = await ai.interactions.create(interactionParams);
          } catch (ixErr) {
            if (
              interactionParams.previous_interaction_id &&
              (ixErr.message.includes('not found') ||
                ixErr.message.includes('404') ||
                ixErr.message.includes('invalid') ||
                ixErr.message.includes('interaction'))
            ) {
              delete interactionParams.previous_interaction_id;
              if (cs) {
                cs.lastInteractionId = null;
                await saveToDB(cs);
              }
              if (chatHistory.length > 0) {
                const histSummary = chatHistory
                  .slice(-10)
                  .map(
                    m =>
                      `${m.role === 'model' ? 'AI' : 'Người dùng'}: ${stripThinkingForCopy(m.text)}`
                  )
                  .join('\n\n');
                const seededPrompt = `[BỐI CẢNH CÁC LƯỢT TRÒ CHUYỆN TRƯỚC ĐÓ]:\n${histSummary}\n\n[CÂU HỎI TIẾP THEO CỦA NGƯỜI DÙNG]:\n${fnP}`;
                if (imgs.length) {
                  interactionParams.input = [
                    { type: 'text', text: seededPrompt },
                    ...base64Files.map(({ mimeType, data }) => ({
                      type: 'image',
                      data,
                      mime_type: mimeType,
                    })),
                  ];
                } else {
                  interactionParams.input = seededPrompt;
                }
              }
              streamObj = await ai.interactions.create(interactionParams);
            } else {
              throw ixErr;
            }
          }

          if (cs) {
            cs.assignedApiKey = currentTryKey;
            await saveToDB(cs);
          }
          break;
        } catch (err) {
          lastErr = err;
          // Model không xử lý ảnh: bỏ phần ảnh khỏi input, báo toast rồi thử lại
          if (ixHasImages && isImageRejection(err.message)) {
            ixHasImages = false;
            if (Array.isArray(interactionParams.input)) {
              const kept = interactionParams.input.filter(p => p.type !== 'image');
              interactionParams.input = kept.length > 1 ? kept : kept[0]?.text || promptWithTime;
            }
            notifyImagesUnsupported(modelLabelOf(am));
            if (retryCount < maxRetries) {
              retryCount++;
              continue;
            }
          }
          const isKeyOrQuotaErr =
            err.message &&
            (err.message.includes('API key') ||
              err.message.includes('403') ||
              err.message.includes('429') ||
              err.message.includes('quota') ||
              err.message.includes('RESOURCE_EXHAUSTED'));

          if (isKeyOrQuotaErr && apiKeys.length > 1 && retryCount < maxRetries) {
            retryCount++;
            currentTryKey = apiKeys[(apiKeys.indexOf(currentTryKey) + 1) % apiKeys.length];
            delete interactionParams.previous_interaction_id;
            if (cs) cs.lastInteractionId = null;
            console.warn(
              `Interactions: Key lỗi, xoay sang Key tiếp theo (lần ${retryCount}):`,
              err.message
            );
            continue;
          } else {
            break;
          }
        }
      }

      if (streamObj) {
        try {
          let currentThinking = '';
          let currentContent = '';

          for await (const event of streamObj) {
            const foundId = event.interaction?.id || event.id || event.interaction_id;
            if (foundId) recordedIxId = foundId;

            let chunkText = '';
            let chunkThought = '';
            if (event.event_type === 'step.delta') {
              if (event.delta?.type === 'thought' || event.delta?.type === 'reasoning') {
                chunkThought = event.delta.text || '';
              } else if (event.delta?.type === 'text') {
                chunkText = event.delta.text || '';
              }
            } else if (event.delta?.thought) {
              chunkThought = event.delta.thought;
            } else if (event.delta?.text) {
              chunkText = event.delta.text;
            } else if (event.text) {
              chunkText = event.text;
            } else if (
              event.event_type === 'interaction.completed' &&
              !currentContent &&
              event.interaction?.output_text
            ) {
              chunkText = event.interaction.output_text;
            }

            if (chunkThought) currentThinking += chunkThought;
            if (chunkText) currentContent += chunkText;

            if (chunkThought || chunkText) {
              bD.querySelector('.typing-bubble')?.remove();
              finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
              renderer.push(finalResp);
              if ($('latency-val') && !pS)
                $('latency-val').innerText = Math.round(performance.now() - startTime);
              pS = true;
            }
          }

          finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
          await renderer.flush(finalResp);
        } catch (streamErr) {
          lastErr = streamErr;
          if (pS) {
            console.warn('Interactions stream lỗi giữa chừng:', streamErr);
            finalResp += `\n\n*(⚠️ Quá trình tạo chữ bị ngắt giữa chừng do lỗi stream: ${streamErr.message || 'Mất kết nối'})`;
            await renderer.flush(finalResp);
            showToast('Đường truyền stream bị ngắt giữa chừng!', 'warning');
          }
        }
      }

      // Dự phòng 1: Nếu streaming không nhận được ký tự nào, thử gọi unary (stream: false)
      if (!pS && !abortController.signal.aborted) {
        try {
          const aiUnary = new GoogleGenAI({ apiKey: currentTryKey });
          const unaryParams = { ...interactionParams, stream: false };
          const ixResult = await aiUnary.interactions.create(unaryParams);
          const foundId = ixResult?.id || ixResult?.interaction?.id;
          if (foundId) recordedIxId = foundId;
          const unaryText =
            ixResult?.output_text || ixResult?.outputs?.find(o => o.type === 'text')?.text || '';
          if (unaryText) {
            bD.querySelector('.typing-bubble')?.remove();
            finalResp = unaryText;
            renderer.push(finalResp);
            await renderer.flush(finalResp);
            if ($('latency-val') && !pS)
              $('latency-val').innerText = Math.round(performance.now() - startTime);
            pS = true;
          }
        } catch (uErr) {
          lastErr = uErr;
        }
      }

      // Tự động dự phòng chuyển sang Stream Engine nếu Interactions API không phản hồi
      if (!pS) {
        const errDetail = lastErr?.message ? ` (${lastErr.message})` : '';
        console.warn(
          'Interactions API gặp sự cố' + errDetail + ', tự động dùng Stream Engine dự phòng:',
          lastErr
        );
        showToast(
          'Interactions API gặp sự cố' + errDetail + ', tự động dùng Stream Engine dự phòng.',
          'warning'
        );
      }
    }

    // ENGINE 2: GENERATECONTENTSTREAM
    if (!pS) {
      const contents = [];
      if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
        chatHistory.slice(-contextMsgCount).forEach(m => {
          // Lọc bỏ khối 💭 đã render khỏi ngữ cảnh gửi AI (chỉ ảnh hưởng payload, không đổi dữ liệu đã lưu)
          const cleanText = stripThinkingForCopy(m.text);
          if (cleanText) {
            contents.push({
              role: m.role === 'model' ? 'model' : 'user',
              parts: [{ text: cleanText }],
            });
          }
        });
      }
      contents.push({ role: 'user', parts: currentParts });
      // Ảnh đã gửi kèm lượt này? Nếu Google từ chối, bỏ inlineData ảnh rồi gửi lại.
      let googleHasImages = hasImageFiles;

      const isGemma = /^gemma-/.test(am);
      // Model Gemini 3.x/4 dùng thinkingLevel; thinkingBudget là tham số cũ của dòng 2.5.
      const usesThinkingLevel = /^(gemini-(3|4)|gemma-)/.test(am);
      // Mức gửi đi LUÔN phải nằm trong bảng mức model hỗ trợ: gửi 'minimal' cho 3.8 Flash /
      // 4 Hydrogen sẽ bị Google trả lỗi 400, nên hạ về 'low' (mức thấp nhất của các model đó).
      const modelLevels = getModelThinkingLevels(am);
      const thinkingSupported = modelLevels.length > 0 || isGemma;
      // Gemma 4 không nằm trong bảng -> giữ nguyên mức người dùng chọn (chỉ bật/tắt)
      const thinkLevel = resolveThinkingLevel(am, thk) || thk;
      const budgetMap = { minimal: 1024, low: 2048, medium: 4096, high: 8192 };
      const wantsThinking = thinkingSupported && !!thk && thk !== 'none';
      // maxOutputTokens của Gemini tính CHUNG thinking + output. Để 8192 khi bật thinking
      // thì thinking ăn hết hạn mức -> model không còn chỗ xuất chữ và stream bị treo.
      // Vì thế: 8192 khi KHÔNG thinking, 32768 khi CÓ thinking (3.5 Flash Lite giữ 65000).
      const maxOutputTokens = isGemma
        ? 8192
        : am === 'gemini-3.5-flash-lite'
          ? 65000
          : wantsThinking
            ? 32768
            : 8192;
      const config = {
        systemInstruction: getDynamicSI(ragSnippet),
        maxOutputTokens,
      };
      // Gemma 4 không nhận safetySettings -> chỉ gửi với model Gemini
      if (!isGemma) config.safetySettings = SAFETY;
      if (wantsThinking) {
        if (isGemma) {
          // Gemma 4 CHỈ có công tắc bật/tắt (không có mức trung gian):
          // Min = minimal (tắt suy luận), Low/Med/High = high (bật suy luận).
          config.thinkingConfig = { thinkingLevel: thinkLevel === 'minimal' ? 'minimal' : 'high' };
        } else {
          config.thinkingConfig = usesThinkingLevel
            ? { thinkingLevel: thinkLevel, includeThoughts: true }
            : { thinkingBudget: budgetMap[thk] || 4096, includeThoughts: true };
        }
      } else if (!usesThinkingLevel) {
        // Gemini 3/4 đã bỏ temperature/topP/topK -> chỉ gửi sampling params cho dòng 2.5 trở xuống,
        // nếu không request có thể bị 400 rồi rơi vào vòng xoay key vô ích.
        config.temperature = DOM.temp?.value !== undefined ? +DOM.temp.value : 0.5;
        config.topP = DOM.topP?.value !== undefined ? +DOM.topP.value : 0.9;
        config.topK = DOM.topK?.value !== undefined ? +DOM.topK.value : 40;
      }

      let streamAttempts = 0;
      let maxStreamAttempts = Math.max(Math.min(apiKeys.length || 1, 3), 2);
      let currentThinking = '';
      let currentContent = '';
      // Đếm chunk để biết Google có stream thật hay chỉ trả 1 cục
      let mainChunks = 0,
        mainTextChunks = 0;
      // Chẩn đoán: in ra đúng cấu hình gửi Google để đối chiếu khi request bị treo
      console.warn(
        '[Gemini V73] model =',
        am,
        '| thk =',
        thk,
        '| thinking =',
        JSON.stringify(config.thinkingConfig || null),
        '| maxOutputTokens =',
        config.maxOutputTokens
      );
      window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
        branch: 'google-stream',
        thinkingConfig: config.thinkingConfig || null,
        maxOutputTokens: config.maxOutputTokens,
      });

      // Tự chuyển model khi Google xếp hàng: đo thực tế TTFT 23-33s với mọi cấu hình, nên nếu quá
      // ngưỡng ở Cài đặt → Hiệu năng (mặc định 8s, tắt được) mà chưa có chunk đầu thì huỷ attempt
      // và chạy lại bằng Flash Lite — tối đa một lần mỗi lượt để không lặp vô hạn.
      const LITE_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
      const _liteSec = parseInt(ls.getItem('jarvis_lite_fallback_sec'), 10);
      const LITE_FALLBACK_ENABLED = ls.getItem('jarvis_lite_fallback_enabled') !== 'false';
      const FIRST_CHUNK_SWITCH_MS =
        (Number.isFinite(_liteSec) ? Math.min(60, Math.max(3, _liteSec)) : 8) * 1000;
      let liteSwitched = false;

      // Badge nhỏ trên header tin nhắn khi app tự đổi model (404 hoặc quá ngưỡng chờ)
      const showModelFallbackBadge = (model, tone, title) => {
        const tones = {
          amber: ['#f59e0b', 'rgba(245,158,11,.15)', 'rgba(245,158,11,.4)', '🔁'],
          sky: ['#38bdf8', 'rgba(56,189,248,.15)', 'rgba(56,189,248,.4)', '⚡'],
        };
        const [color, bg, border, icon] = tones[tone] || tones.amber;
        try {
          const header = bD?.querySelector('.message-header');
          if (!header || header.querySelector('.model-fallback-badge')) return;
          const badge = document.createElement('span');
          badge.className = 'model-fallback-badge';
          badge.style.cssText = `font-size:.68rem;font-weight:700;padding:2px 6px;border-radius:6px;background:${bg};color:${color};border:1px solid ${border};margin-left:6px;white-space:nowrap;`;
          badge.title = title;
          badge.innerText = icon + ' ' + model;
          header.appendChild(badge);
        } catch (_) {}
      };

      while (streamAttempts < maxStreamAttempts) {
        streamAttempts++;
        // WATCHDOG: Google có thể nhận request nhưng không nhả chunk nào (treo im lặng).
        // Đo thực tế: header có thể mất 9-19s (có lúc >25s) khi Google xếp hàng, nên ngưỡng phải rộng
        // hơn 20s cũ — nếu cắt sớm, request đang xếp hàng bị bỏ và phải chờ lại từ đầu (UI đứng lâu hơn).
        const attemptStart = performance.now();
        const attemptCtrl = new AbortController();
        const relayAbort = () => attemptCtrl.abort();
        abortController.signal.addEventListener('abort', relayAbort, { once: true });
        let stalled = false;
        let gotFirstChunk = false;
        // Cấu hình trong Cài đặt → Hiệu năng (giây, 10–180). Mặc định 45s.
        const _stallSec = parseInt(ls.getItem('jarvis_stall_timeout_sec'), 10);
        const STALL_TIMEOUT_MS =
          (Number.isFinite(_stallSec) ? Math.min(180, Math.max(10, _stallSec)) : 45) * 1000;
        let stallTimer = setTimeout(() => {
          stalled = true;
          attemptCtrl.abort();
        }, STALL_TIMEOUT_MS);
        // Hạn chót chunk đầu tiên (Cài đặt → Hiệu năng, mặc định 8s, tắt được): chỉ áp dụng cho
        // model Gemini 3.x và chỉ đổi model một lần, để không phải ngồi chờ 23-33s khi Google xếp hàng.
        let switchToLite = false;
        const canSwitchLite =
          LITE_FALLBACK_ENABLED &&
          !liteSwitched &&
          am !== LITE_FALLBACK_MODEL &&
          /^gemini-3\./.test(am);
        let firstChunkTimer = canSwitchLite
          ? setTimeout(() => {
              switchToLite = true;
              attemptCtrl.abort();
            }, FIRST_CHUNK_SWITCH_MS)
          : null;
        const stopFirstChunkTimer = () => {
          if (firstChunkTimer) {
            clearTimeout(firstChunkTimer);
            firstChunkTimer = null;
          }
        };
        const stopStallTimer = () => {
          if (stallTimer) {
            clearTimeout(stallTimer);
            stallTimer = null;
          }
        };
        const cleanupAttempt = () => {
          stopStallTimer();
          stopFirstChunkTimer();
          abortController.signal.removeEventListener('abort', relayAbort);
        };
        try {
          // Mốc gửi thật: từ lúc bấm Gửi đến lúc app gọi API. Nếu mốc này lớn thì
          // độ trễ nằm TRONG app (chuẩn bị lịch sử, đồng bộ, RAG...), không phải Google.
          window.__jarvisTurnDebug.reqSentAtMs = performance.now();
          window.__jarvisTurnDebug.prepMs = Math.round(
            window.__jarvisTurnDebug.reqSentAtMs - (window.__jarvisTurnDebug.startedAtMs || 0)
          );
          if (!window.__jarvisTurnDebug.prepFirstMs)
            window.__jarvisTurnDebug.prepFirstMs = window.__jarvisTurnDebug.prepMs;
          console.warn(
            '[Gemini V78] prep (app chuẩn bị trước khi gọi API) =',
            window.__jarvisTurnDebug.prepFirstMs,
            'ms | messageCount =',
            contents.length
          );
          const resStream = await new GoogleGenAI({ apiKey: gKey }).models.generateContentStream({
            model: am,
            contents,
            config,
            abortSignal: attemptCtrl.signal,
          });
          // Mốc headers: nếu mốc này đã trễ ~10s thì độ trễ nằm ở phía Google (xếp hàng/cold start),
          // không phải ở phần suy luận của model.
          const headersMs = Math.round(performance.now() - attemptStart);
          window.__jarvisTurnDebug.headersMs = headersMs;
          window.__jarvisTurnDebug.totalToHeadersMs = Math.round(
            performance.now() - (window.__jarvisTurnDebug.startedAtMs || 0)
          );

          for await (const ck of resStream) {
            if (!gotFirstChunk) {
              gotFirstChunk = true;
              stopStallTimer();
              stopFirstChunkTimer();
              // Tách rõ 2 chặng: chờ headers (phía Google) vs chờ model nghĩ (sau headers)
              console.warn(
                '[Gemini V73] headers =',
                headersMs,
                'ms | chunk đầu sau headers =',
                Math.round(performance.now() - attemptStart) - headersMs,
                'ms | attempt #' + streamAttempts
              );
            }
            const reason = ck.candidates?.[0]?.finishReason;
            if (reason && reason !== 'STOP') streamFinishReason = reason;

            let deltaThought = '';
            let deltaText = '';

            if (ck.candidates?.[0]?.content?.parts) {
              for (const part of ck.candidates[0].content.parts) {
                if (part.thought) {
                  const t =
                    typeof part.thought === 'string'
                      ? part.thought
                      : typeof part.text === 'string'
                        ? part.text
                        : '';
                  if (t) {
                    deltaThought += t;
                    if (!window.__jarvisTurnDebug.firstThinkingAtMs) {
                      window.__jarvisTurnDebug.firstThinkingAtMs = performance.now();
                      window.__jarvisTurnDebug.firstThinkingWaitMs = Math.round(
                        window.__jarvisTurnDebug.firstThinkingAtMs -
                          (window.__jarvisTurnDebug.startedAtMs || 0) || 0
                      );
                    }
                  }
                } else if (typeof part.text === 'string') {
                  if (!window.__jarvisTurnDebug.firstContentAtMs) {
                    window.__jarvisTurnDebug.firstContentAtMs = performance.now();
                  }
                  deltaText += part.text;
                }
              }
            } else {
              try {
                deltaText = ck.text || '';
              } catch (_) {}
            }

            mainChunks++;
            if (deltaText) mainTextChunks++;
            if (deltaThought) currentThinking += deltaThought;
            if (deltaText) currentContent += deltaText;

            if (deltaThought || deltaText) {
              bD.querySelector('.typing-bubble')?.remove();
              finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
              renderer.push(finalResp);
              if ($('latency-val') && !pS)
                $('latency-val').innerText = Math.round(performance.now() - startTime);
              pS = true;
            }
          }

          lastErr = null;
          cleanupAttempt();
          break;
        } catch (e) {
          cleanupAttempt();
          // Ưu tiên xử lý treo stream trước khi xét lỗi thường
          if (stalled && !abortController.signal.aborted) {
            console.warn(
              '[Watchdog] Google không nhả chunk đầu tiên sau ' +
                Math.round(STALL_TIMEOUT_MS / 1000) +
                's, tự phục hồi cấu hình...'
            );
            // Nới hạn mức output để thinking không ăn hết chỗ của phần trả lời
            config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 32768);
            if (config.thinkingConfig && config.thinkingConfig.thinkingLevel) {
              // Hạ về mức thấp nhất mà Gemini 3/4 đều nhận (thay cho thinkingBudget đã deprecated)
              config.thinkingConfig = { thinkingLevel: 'low', includeThoughts: true };
              continue;
            }
            if (config.thinkingConfig) {
              delete config.thinkingConfig;
              if (!usesThinkingLevel) config.temperature = 0.5;
              continue;
            }
            lastErr = new Error(
              'Google không phản hồi sau ' +
                Math.round(STALL_TIMEOUT_MS / 1000) +
                ' giây (stream trò)'
            );
            break;
          }
          // Chưa có chunk đầu trong ngưỡng chờ: đổi sang Gemini 3.5 Flash Lite thay vì chờ tiếp
          if (switchToLite && !pS && !abortController.signal.aborted) {
            const prevModel = am;
            const waitSec = FIRST_CHUNK_SWITCH_MS / 1000;
            liteSwitched = true;
            am = LITE_FALLBACK_MODEL;
            // Flash Lite có hạn mức output riêng (65000) và nhận đủ 4 mức thinking
            config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 65000);
            if (config.thinkingConfig) {
              config.thinkingConfig = {
                thinkingLevel: resolveThinkingLevel(am, thk) || thk,
                includeThoughts: true,
              };
            }
            window.__jarvisTurnDebug.modelSwitchedFrom = prevModel;
            window.__jarvisTurnDebug.modelSwitchedAtMs = Math.round(
              performance.now() - attemptStart
            );
            const switchMsg = `${prevModel} chưa phản hồi sau ${waitSec}s — đã tự chuyển sang Gemini 3.5 Flash Lite`;
            console.warn('[Fallback chờ] ' + switchMsg);
            showToast('⚡ ' + switchMsg, 'warning');
            showModelFallbackBadge(
              am,
              'sky',
              `Model trước đó không phản hồi sau ${waitSec}s, app đã tự chuyển sang model dự phòng`
            );
            // Lượt chạy lại bằng model mới có ngân sách thử riêng, không ăn vào số lần thử của model ban đầu
            maxStreamAttempts += 1;
            continue;
          }
          if (e.name === 'AbortError' || abortController.signal.aborted) throw e;
          lastErr = e;

          // 1. Nếu lỗi xảy ra trước khi nhận chữ (!pS): Tự phục hồi thông minh
          if (!pS) {
            console.warn(`generateContentStream lần ${streamAttempts} lỗi:`, e.message);

            // 0. Model không xử lý ảnh: bỏ ảnh khỏi lượt, báo toast theo tên model rồi gửi lại
            if (googleHasImages && isImageRejection(e.message)) {
              googleHasImages = false;
              const lastUserTurn = contents[contents.length - 1];
              if (lastUserTurn?.parts) {
                lastUserTurn.parts = lastUserTurn.parts.filter(
                  p => !(p.inlineData && String(p.inlineData.mimeType || '').startsWith('image/'))
                );
              }
              notifyImagesUnsupported(modelLabelOf(am));
              maxStreamAttempts += 1;
              continue;
            }

            // A. Nếu lỗi do thinkingConfig (400 Bad Request): thử lại với mức thấp nhất hoặc gỡ bỏ
            if (
              config.thinkingConfig &&
              (e.message?.includes('thinking') ||
                e.message?.includes('400') ||
                e.message?.includes('INVALID_ARGUMENT'))
            ) {
              if (config.thinkingConfig.thinkingLevel) {
                // Gemini 3/4 KHÔNG chuyển sang thinkingBudget nữa: gửi kèm thinkingLevel sẽ 400,
                // gửi một mình thì bị deprecated (Google tự map về level gần nhất).
                // Hạ về 'low' - mức thấp nhất mà mọi model Gemini 3/4 đều nhận - rồi thử lại.
                config.thinkingConfig = { thinkingLevel: 'low', includeThoughts: true };
                console.info('[Fallback] Thử lại thinkingConfig với mức thấp nhất ("low")...');
                continue;
              }
              delete config.thinkingConfig;
              // Gemini 3/4 không nhận temperature nữa -> chỉ đặt lại cho dòng 2.5 trở xuống
              if (!usesThinkingLevel) config.temperature = 0.5;
              console.info('[Fallback] Gỡ thinkingConfig, thử lại với cấu hình chuẩn...');
              continue;
            }

            // B. Nếu lỗi do Model không tìm thấy hoặc khai tử (404 Not Found): Chuyển sang Flash-Lite / 3.8 Flash
            if (e.message?.includes('404') || e.message?.includes('not found')) {
              const fallbackFromModel = am;
              am = am === 'gemini-3.8-flash' ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';
              console.warn(`[Fallback] Chuyển sang model dự phòng: ${am}`);
              showToast(
                `🔁 Model ${fallbackFromModel} không khả dụng — đã tự chuyển sang ${am}`,
                'warning'
              );
              showModelFallbackBadge(
                am,
                'amber',
                'Model yêu cầu không khả dụng, app đã tự chuyển sang model dự phòng'
              );
              continue;
            }

            // C. Nếu lỗi do Key hoặc Quota (429, 403, Quota exceeded): Tự động xoay sang Key kế tiếp
            if (apiKeys.length > 1 && streamAttempts < maxStreamAttempts) {
              gKey = getSessionApiKey(cs, true);
              keyIndexNum = findSlotIndexForKey(gKey);
              recordKeyRequest(keyIndexNum, am);
              const updatedBadge = getKeyBadgeHtml(keyIndexNum, am);
              const headerEl = bD?.querySelector('.message-header');
              if (headerEl) {
                const oldKeyBadge = headerEl.querySelector('.key-indicator-badge');
                if (oldKeyBadge) oldKeyBadge.outerHTML = updatedBadge;
              }
              showToast(
                `⚠️ Key #${keyIndexNum} bận hoặc hết hạn ngạch, đang xoay sang Key tiếp theo...`,
                'warning'
              );
              continue;
            }
            break;
          }

          // 2. Nếu đã nhận được chữ (pS) mà bị đứt stream giữa chừng
          const isStreamCutoff =
            e.message &&
            (e.message.includes('Incomplete JSON') ||
              e.message.includes('network') ||
              e.message.includes('fetch') ||
              e.message.includes('Failed to fetch') ||
              e.message.includes('429') ||
              e.message.includes('quota') ||
              // Google cắt stream giữa chừng khi quá tải: nối tiếp thay vì dừng với ghi chú
              e.message.includes('503') ||
              e.message.includes('UNAVAILABLE'));

          if (
            pS &&
            isStreamCutoff &&
            streamAttempts < maxStreamAttempts &&
            !abortController.signal.aborted
          ) {
            console.warn(
              `Stream bị ngắt giữa chừng (${e.message}), tự động xoay key và nối tiếp luồng...`
            );
            showToast('⚡ Đang tự động kết nối lại để viết tiếp...', 'info');

            if (apiKeys.length > 1) {
              gKey = getSessionApiKey(cs, true);
              keyIndexNum = findSlotIndexForKey(gKey);
              recordKeyRequest(keyIndexNum, am);
              const updatedBadge = getKeyBadgeHtml(keyIndexNum, am);
              const headerEl = bD?.querySelector('.message-header');
              if (headerEl) {
                const oldKeyBadge = headerEl.querySelector('.key-indicator-badge');
                if (oldKeyBadge) oldKeyBadge.outerHTML = updatedBadge;
              }
            }

            const lastTail = finalResp.trim().slice(-150);
            contents.length = 0;
            if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
              chatHistory.slice(-6).forEach(m => {
                const cleanText = stripThinkingForCopy(m.text);
                if (cleanText)
                  contents.push({
                    role: m.role === 'model' ? 'model' : 'user',
                    parts: [{ text: cleanText }],
                  });
              });
            }
            contents.push({
              role: 'user',
              parts: [
                {
                  text: `Câu hỏi ban đầu: "${fP}"\n\nBạn đang trả lời dở đến đoạn sau:\n"...${lastTail}"\n\nHãy tiếp tục viết phần còn lại ngay từ điểm dừng trên, không lặp lại đoạn đã viết để hoàn tất câu trả lời.`,
                },
              ],
            });

            continue;
          } else {
            if (pS) {
              console.warn('Lỗi stream giữa chừng:', e);
              finalResp += `\n\n*(⚠️ Quá trình tạo chữ bị ngắt giữa chừng: ${e.message || 'Mất kết nối stream'})*`;
              showToast('Đường truyền stream bị ngắt giữa chừng!', 'warning');
            }
            break;
          }
        }
      }

      if (streamFinishReason === 'MAX_TOKENS') {
        finalResp += '\n\n*(⚠️ Đã đạt giới hạn độ dài phản hồi của mô hình - Max Tokens)*';
        showToast('Phản hồi đạt giới hạn độ dài tối đa!', 'warning');
      } else if (streamFinishReason === 'SAFETY') {
        finalResp += '\n\n*(⚠️ Nội dung tiếp theo bị ngắt bởi bộ lọc an toàn của Google - Safety)*';
        showToast('Nội dung bị dừng bởi bộ lọc an toàn của Google!', 'warning');
      } else if (streamFinishReason === 'RECITATION') {
        finalResp +=
          '\n\n*(⚠️ Nội dung tiếp theo bị ngắt do phát hiện trùng lặp bản quyền - Recitation)*';
        showToast('Nội dung bị dừng do phát hiện trùng lặp bản quyền!', 'warning');
      }

      console.warn(
        '[Gemini V73] stream chính: ' +
          mainChunks +
          ' chunk, trong đó ' +
          mainTextChunks +
          ' chunk có text | thinking=' +
          currentThinking.length +
          ' ký tự | content=' +
          currentContent.length +
          ' ký tự'
      );
      window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
        mainChunks,
        mainTextChunks,
        thinkingChars: currentThinking.length,
        contentChars: currentContent.length,
      });

      // FAIL-SAFE 2: Model chỉ trả về suy luận mà không có câu trả lời (Gemma 4 hay gặp khi bật
      // thinking) -> hỏi lại 1 lần với thinking TẮT để chắc chắn người dùng có câu trả lời.
      if (!currentContent.trim() && currentThinking.trim() && !abortController.signal.aborted) {
        try {
          console.warn(
            '[Gemma] Chỉ nhận được suy luận -> hỏi lại với thinking TẮT ở dạng STREAM để chữ chạy dần...'
          );
          // Báo trạng thái để UI không "đứng hình" trong lúc chờ request thứ hai (Google có thể xếp hàng ~10s)
          showToast('✍️ Đang lấy câu trả lời (Google chậm phản hồi)…', 'info');
          const retryStatusEl = bD?.querySelector('.thinking-streaming');
          if (retryStatusEl) {
            retryStatusEl.innerHTML =
              '<span class="thinking-spinner">⏳</span> <em>Đang lấy câu trả lời từ Google…</em>';
          }
          const retryCfg = { ...config, maxOutputTokens: 8192 };
          if (isGemma) retryCfg.thinkingConfig = { thinkingLevel: 'minimal' };
          else delete retryCfg.thinkingConfig;
          const retryStream = await new GoogleGenAI({ apiKey: gKey }).models.generateContentStream({
            model: am,
            contents,
            config: retryCfg,
            abortSignal: abortController.signal,
          });
          let retryChunks = 0,
            retryTextChunks = 0;
          for await (const rck of retryStream) {
            retryChunks++;
            let rText = '';
            const rParts = rck.candidates?.[0]?.content?.parts;
            if (rParts) {
              for (const p of rParts) {
                if (!p.thought && typeof p.text === 'string') rText += p.text;
              }
            } else {
              try {
                rText = rck.text || '';
              } catch (_) {}
            }
            if (rText) {
              retryTextChunks++;
              currentContent += rText;
              finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
              renderer.push(finalResp);
              pS = true;
            }
          }
          console.warn(
            '[Gemini V73] stream hỏi lại: ' +
              retryChunks +
              ' chunk, trong đó ' +
              retryTextChunks +
              ' chunk có text'
          );
          window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
            retryChunks,
            retryTextChunks,
          });
        } catch (rErr) {
          console.warn('[Gemma] Lần hỏi lại không thinking lỗi:', rErr?.message || rErr);
        }
      }

      if (currentThinking || currentContent) {
        // FAIL-SAFE: Nếu mô hình chỉ trả về suy luận mà quên xuất câu trả lời cuối:
        if (!currentContent.trim() && currentThinking.trim()) {
          currentContent = currentThinking.trim();
          currentThinking = '';
        }
        finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
      }
      await renderer.flush(finalResp);
    }

    if (!pS) {
      bD.remove();
      return showToast(formatGoogleApiError(lastErr), 'danger');
    }
    await saveTurn();
  } catch (err) {
    if (err.name === 'AbortError' || abortController?.signal.aborted) {
      showToast('Đã dừng phản hồi!', 'warning');
      await saveTurn(' (Đã dừng)');
    } else {
      showToast('Lỗi: ' + err.message, 'danger');
      bD?.remove();
    }
  } finally {
    const wasAborted = abortController?.signal?.aborted;
    // Dọn nhãn chờ/chấm nhấp nháy khi lượt kết thúc mà chưa từng có chunk (vd: người dùng bấm Dừng).
    // Nếu không, "⏳ Đang chờ Google…" sẽ nằm lại vĩnh viễn trên bong bóng tin nhắn.
    bD?.querySelector('.typing-bubble')?.remove();
    isProcessing = false;
    abortController = null;
    DOM.sendBtn.innerHTML = `<span>Gửi</span> <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    DOM.sendBtn.style.background = 'var(--primary)';

    // --- HANDS-FREE VOICE FLOW COMPLETION HOOK ---
    if (isHandsFreeActive) {
      if (finalResp && !wasAborted) {
        isHandsFreeSpeaking = true;
        const statusText = $('hf-status-text');
        if (statusText)
          statusText.innerHTML =
            '<span style="color:#8b5cf6;font-weight:600;">🔊 Jarvis đang trả lời (Nam Bộ)...</span>';

        playTextAudio(finalResp, {
          onEnd: () => {
            isHandsFreeSpeaking = false;
            if (isHandsFreeActive) {
              const status = $('hf-status-text');
              if (status)
                status.innerHTML =
                  '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
              const prev = $('hf-transcript-preview');
              if (prev) prev.innerText = '';
              setTimeout(() => {
                if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                  startHandsFreeListener();
                }
              }, 300);
            }
          },
          onError: () => {
            isHandsFreeSpeaking = false;
            if (isHandsFreeActive) {
              const status = $('hf-status-text');
              if (status)
                status.innerHTML =
                  '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
              setTimeout(() => {
                if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                  startHandsFreeListener();
                }
              }, 300);
            }
          },
        });
      } else {
        setTimeout(() => {
          if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
            startHandsFreeListener();
          }
        }, 300);
      }
    }
  }
};

// --- EXPORT JSON & RESTORE ---
// [exportAllSessions đã được chuyển sang js/export.js]

$('import-all-input').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = async ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.sessions) {
        await clearAllDB();
        for (const s of d.sessions) await saveToDB(s);
        if (
          d.knowledgeBase &&
          Array.isArray(d.knowledgeBase) &&
          window.JarvisRAG &&
          typeof window.JarvisRAG.importKnowledge === 'function'
        ) {
          try {
            await window.JarvisRAG.importKnowledge(d.knowledgeBase, true);
          } catch (e) {}
        }
        if (d.configs) {
          Object.entries(d.configs).forEach(([k, v]) => {
            let val = v;
            if (typeof val === 'string' && (val.startsWith('JVENC_') || val.startsWith('ENC_'))) {
              val = deobfuscateKey(val);
            }
            ls.setItem(k, val);
          });
          if (d.configs.jarvis_folders) {
            try {
              folders = JSON.parse(d.configs.jarvis_folders);
            } catch {}
          }
        }
        initAPIKeys();
        initExternalConfigs();
        // Nạp lại registry provider/model động từ cấu hình vừa khôi phục để select
        // và gateway nhận ngay provider/model tự thêm (không cần reload trang).
        try {
          window.DynamicProviders?.init?.();
        } catch (e) {
          console.warn('[Backup] DynamicProviders init lỗi:', e);
        }
        applyFontSize(parseInt(ls.getItem('chat_font_size') || '16', 10));
        if (typeof window.reloadMaxMedicationsFromStorage === 'function') {
          window.reloadMaxMedicationsFromStorage();
        }
        await loadSess();
        showToast('🎉 Đã khôi phục toàn bộ dữ liệu Jarvis AI thành công!');
      }
    } catch {
      showToast('Lỗi: Tệp JSON sao lưu không hợp lệ', 'danger');
    }
  };
  rd.readAsText(f);
};

function renderFiles() {
  DOM.previewBox.style.display = filesData.length || txtContent ? 'block' : 'none';
  DOM.fileCount.innerText = filesData.length + (txtContent ? 1 : 0);
  DOM.previewGrid.innerHTML = filesData
    .map(
      (f, i) => `
        <div style="position:relative;width:50px;height:50px;background:#1e293b;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;overflow:hidden;border:1px solid var(--border);">
          ${f.type.startsWith('image') ? `<img src="${URL.createObjectURL(f)}" style="width:100%;height:100%;object-fit:cover;">` : f.type.startsWith('video') ? '🎬 VIDEO' : f.type.startsWith('audio') ? '🎵 AUDIO' : '📄 FILE'}
          <button onclick="rmImg(${i})" style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,0.9);color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">×</button>
        </div>
      `
    )
    .join('');
}

window.rmImg = i => {
  filesData.splice(i, 1);
  renderFiles();
  updateTokenCount();
};

DOM.clearFilesBtn.onclick = () => {
  filesData = [];
  txtContent = '';
  DOM.textFileList.innerHTML = '';
  renderFiles();
  updateTokenCount();
};

const fileToBase64 = f =>
  new Promise(r => {
    const rd = new FileReader();
    rd.onloadend = () => {
      const b64 = (rd.result || '').split(',')[1] || '';
      r({ mimeType: f.type || 'image/jpeg', data: b64 });
    };
    rd.readAsDataURL(f);
  });
const fileToInteractionPart = fileToBase64;

// [exportChatDoc & exportChatPDF đã được chuyển sang js/export.js]

// --- TOAST NOTIFIER ---
let tTO;
function showToast(m, t = 'success') {
  clearTimeout(tTO);
  DOM.toast.innerText = m;
  DOM.toast.className = `toast ${t} show`;
  tTO = setTimeout(() => DOM.toast.classList.remove('show'), 3200);
}

// --- SEARCH BAR POPUP & TRIGGER (FIXED ENTER & MOBILE & SEMANTIC) ---
const sBar = document.querySelector('.header-search-bar');
$('btn-global-search').onclick = e => {
  e.stopPropagation();
  const currentVal = DOM.searchInput?.value.trim() || '';

  // Trên mobile hoặc nếu đã có query hoặc đang active:
  if (window.innerWidth <= 768) {
    if (typeof window.openSearchModalWithQuery === 'function') {
      window.openSearchModalWithQuery(currentVal);
    } else {
      $('search-modal').style.display = 'flex';
      oLay.style.display = 'block';
    }
    return;
  }

  if (!sBar.classList.contains('active')) {
    sBar.classList.add('active');
    DOM.searchInput.focus();
  } else if (currentVal) {
    if (typeof window.openSearchModalWithQuery === 'function') {
      window.openSearchModalWithQuery(currentVal);
    } else {
      $('search-modal').style.display = 'flex';
      oLay.style.display = 'block';
      $('global-search-input').value = currentVal;
      $('global-search-input').dispatchEvent(new Event('input'));
    }
  } else {
    if (typeof window.openSearchModalWithQuery === 'function') {
      window.openSearchModalWithQuery('');
    } else {
      $('search-modal').style.display = 'flex';
      oLay.style.display = 'block';
    }
  }
};

DOM.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const currentVal = DOM.searchInput.value.trim();
    if (typeof window.openSearchModalWithQuery === 'function') {
      window.openSearchModalWithQuery(currentVal);
    } else {
      $('search-modal').style.display = 'flex';
      oLay.style.display = 'block';
      $('global-search-input').value = currentVal;
      $('global-search-input').dispatchEvent(new Event('input'));
    }
  } else if (e.key === 'Escape') {
    sBar.classList.remove('active');
    DOM.searchInput.blur();
  }
});

const sideSearchInput = $('sidebar-search-input');
if (sideSearchInput) {
  sideSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = sideSearchInput.value.trim();
      if (typeof window.openSearchModalWithQuery === 'function') {
        window.openSearchModalWithQuery(q);
      }
    }
  });
}

document.addEventListener('click', e => {
  if (!sBar.contains(e.target)) sBar.classList.remove('active');
});

// BOOTSTRAP APP
loadSess();

initSelectionToolbar();

// --- [GITHUB GIST CLOUD SYNC & 2-WAY SMART MERGE MOVED TO js/sync.js] ---
function scheduleAutoSync(delay = 10000) {
  if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
    window.JarvisSync.scheduleAutoSync(delay);
  }
}

// [Trạng thái chia sẻ: js/globals.js đã định nghĩa qua Object.defineProperty]

// [window.clearAllDB / sanitizeSessionForBackup: do js/database.js + js/cipher.js expose]
if (typeof renderFolders !== 'undefined') window.renderFolders = renderFolders;
if (typeof renderTabs !== 'undefined') window.renderTabs = renderTabs;
if (typeof saveToNativeBridge !== 'undefined') window.saveToNativeBridge = saveToNativeBridge;
if (typeof scheduleAutoSync !== 'undefined') window.scheduleAutoSync = scheduleAutoSync;
if (typeof getGoogleKeyNamesList !== 'undefined')
  window.getGoogleKeyNamesList = getGoogleKeyNamesList;
if (typeof setGoogleKeyNamesList !== 'undefined')
  window.setGoogleKeyNamesList = setGoogleKeyNamesList;
if (typeof getExternalConfigsObj !== 'undefined')
  window.getExternalConfigsObj = getExternalConfigsObj;
if (typeof setExternalConfigsObj !== 'undefined')
  window.setExternalConfigsObj = setExternalConfigsObj;
if (typeof setGoogleKeysList !== 'undefined') window.setGoogleKeysList = setGoogleKeysList;
if (typeof updateKeyQuotaUI !== 'undefined') window.updateKeyQuotaUI = updateKeyQuotaUI;
if (typeof showToast !== 'undefined') window.showToast = showToast;
if (typeof deobfuscateKey !== 'undefined') window.deobfuscateKey = deobfuscateKey;
if (typeof stripThinkingForCopy !== 'undefined') window.stripThinkingForCopy = stripThinkingForCopy;
if (typeof getSessionApiKey !== 'undefined') window.getSessionApiKey = getSessionApiKey;
if (typeof updateColorPickerUI !== 'undefined') window.updateColorPickerUI = updateColorPickerUI;
if (typeof renderSel !== 'undefined') window.renderSel = renderSel;
if (typeof updateTokenCount !== 'undefined') window.updateTokenCount = updateTokenCount;
if (typeof newSess !== 'undefined') window.newSess = newSess;
if (typeof processUploadFiles !== 'undefined') window.processUploadFiles = processUploadFiles;
if (typeof formatGoogleApiError !== 'undefined') window.formatGoogleApiError = formatGoogleApiError;
if (typeof getNowTime24h !== 'undefined') window.getNowTime24h = getNowTime24h;
if (typeof isThinkingHidden !== 'undefined') window.isThinkingHidden = isThinkingHidden;
if (typeof mergeThinkingSegments !== 'undefined')
  window.mergeThinkingSegments = mergeThinkingSegments;
if (typeof mergeAdjacentThinkingBlocks !== 'undefined')
  window.mergeAdjacentThinkingBlocks = mergeAdjacentThinkingBlocks;
if (typeof buildThinkingDetailsHtml !== 'undefined')
  window.buildThinkingDetailsHtml = buildThinkingDetailsHtml;
if (typeof thinkingStats !== 'undefined') window.thinkingStats = thinkingStats;
if (typeof renderMsgContent !== 'undefined') window.renderMsgContent = renderMsgContent;
if (typeof appendMsg !== 'undefined') window.appendMsg = appendMsg;
if (typeof reRenderHistory !== 'undefined') window.reRenderHistory = reRenderHistory;
if (typeof captureChatScroll !== 'undefined') window.captureChatScroll = captureChatScroll;
if (typeof restoreChatScroll !== 'undefined') window.restoreChatScroll = restoreChatScroll;
if (typeof copyRawText !== 'undefined') window.copyRawText = copyRawText;
if (typeof getDynamicSI !== 'undefined') window.getDynamicSI = getDynamicSI;
if (typeof tryAutoNameSession !== 'undefined') window.tryAutoNameSession = tryAutoNameSession;
if (typeof condenseSessionMemory !== 'undefined')
  window.condenseSessionMemory = condenseSessionMemory;
if (typeof forkSessionAt !== 'undefined') window.forkSessionAt = forkSessionAt;
if (typeof openShareTargetModal !== 'undefined') window.openShareTargetModal = openShareTargetModal;
if (typeof processSharedUrl !== 'undefined') window.processSharedUrl = processSharedUrl;
if (typeof handleIncomingWebShare !== 'undefined')
  window.handleIncomingWebShare = handleIncomingWebShare;
if (typeof renderFollowUpChips !== 'undefined') window.renderFollowUpChips = renderFollowUpChips;
if (typeof generateFollowUpSuggestions !== 'undefined')
  window.generateFollowUpSuggestions = generateFollowUpSuggestions;
if (typeof initSelectionToolbar !== 'undefined') window.initSelectionToolbar = initSelectionToolbar;
if (typeof currentSelectedText !== 'undefined') window.currentSelectedText = currentSelectedText;
if (typeof hideSelectionToolbar !== 'undefined') window.hideSelectionToolbar = hideSelectionToolbar;
if (typeof renderLibrary !== 'undefined') window.renderLibrary = renderLibrary;
if (typeof addFileFromLib !== 'undefined') window.addFileFromLib = addFileFromLib;
if (typeof saveFileToLib !== 'undefined') window.saveFileToLib = saveFileToLib;
if (typeof getAllFilesFromLib !== 'undefined') window.getAllFilesFromLib = getAllFilesFromLib;
if (typeof deleteFromDB !== 'undefined') window.deleteFromDB = deleteFromDB;
if (typeof getAllFromDB !== 'undefined') window.getAllFromDB = getAllFromDB;
if (typeof saveToDB !== 'undefined') window.saveToDB = saveToDB;
if (typeof initDB !== 'undefined') window.initDB = initDB;
if (typeof fileToBase64 !== 'undefined') window.fileToBase64 = fileToBase64;
if (typeof compressImageIfNeeded !== 'undefined')
  window.compressImageIfNeeded = compressImageIfNeeded;
if (typeof extractYouTubeContent !== 'undefined')
  window.extractYouTubeContent = extractYouTubeContent;
if (typeof extractWebPageContent !== 'undefined')
  window.extractWebPageContent = extractWebPageContent;
if (typeof fetchTavilySearch !== 'undefined') window.fetchTavilySearch = fetchTavilySearch;
if (typeof fetchSerperSearch !== 'undefined') window.fetchSerperSearch = fetchSerperSearch;
if (typeof resolveCompatProvider !== 'undefined')
  window.resolveCompatProvider = resolveCompatProvider;
if (typeof buildReasoningPayload !== 'undefined')
  window.buildReasoningPayload = buildReasoningPayload;
if (typeof buildNvidiaThinking !== 'undefined') window.buildNvidiaThinking = buildNvidiaThinking;
if (typeof AUX_FALLBACK_MODELS !== 'undefined') window.AUX_FALLBACK_MODELS = AUX_FALLBACK_MODELS;
if (typeof EXPLABS_MODELS !== 'undefined') window.EXPLABS_MODELS = EXPLABS_MODELS;
if (typeof COMPAT_PROVIDERS !== 'undefined') window.COMPAT_PROVIDERS = COMPAT_PROVIDERS;
if (typeof COMPAT_MODEL_OPTS !== 'undefined') window.COMPAT_MODEL_OPTS = COMPAT_MODEL_OPTS;
if (typeof THINKING_LEVELS_BY_MODEL !== 'undefined')
  window.THINKING_LEVELS_BY_MODEL = THINKING_LEVELS_BY_MODEL;
if (typeof THINKING_LEVEL_LABELS !== 'undefined')
  window.THINKING_LEVEL_LABELS = THINKING_LEVEL_LABELS;
if (typeof DEFAULT_THINKING_LEVELS !== 'undefined')
  window.DEFAULT_THINKING_LEVELS = DEFAULT_THINKING_LEVELS;
if (typeof getModelThinkingLevels !== 'undefined')
  window.getModelThinkingLevels = getModelThinkingLevels;
if (typeof resolveThinkingLevel !== 'undefined') window.resolveThinkingLevel = resolveThinkingLevel;
if (typeof NVIDIA_DEFAULT_PROXY !== 'undefined') window.NVIDIA_DEFAULT_PROXY = NVIDIA_DEFAULT_PROXY;
if (typeof getFlashModelBucket !== 'undefined') window.getFlashModelBucket = getFlashModelBucket;
if (typeof findSlotIndexForKey !== 'undefined') window.findSlotIndexForKey = findSlotIndexForKey;
if (typeof recordKeyRequest !== 'undefined') window.recordKeyRequest = recordKeyRequest;
if (typeof openRouterKeys !== 'undefined') window.openRouterKeys = openRouterKeys;
if (typeof openRouterKeyIndex !== 'undefined') window.openRouterKeyIndex = openRouterKeyIndex;
if (typeof nvidiaKeys !== 'undefined') window.nvidiaKeys = nvidiaKeys;
if (typeof nvidiaKeyIndex !== 'undefined') window.nvidiaKeyIndex = nvidiaKeyIndex;
if (typeof cohereKeys !== 'undefined') window.cohereKeys = cohereKeys;
if (typeof cohereKeyIndex !== 'undefined') window.cohereKeyIndex = cohereKeyIndex;
if (typeof explabsKeys !== 'undefined') window.explabsKeys = explabsKeys;
if (typeof explabsKeyIndex !== 'undefined') window.explabsKeyIndex = explabsKeyIndex;
if (typeof findOpenRouterSlotIndexForKey !== 'undefined')
  window.findOpenRouterSlotIndexForKey = findOpenRouterSlotIndexForKey;
if (typeof findNvidiaSlotIndexForKey !== 'undefined')
  window.findNvidiaSlotIndexForKey = findNvidiaSlotIndexForKey;
if (typeof findCohereSlotIndexForKey !== 'undefined')
  window.findCohereSlotIndexForKey = findCohereSlotIndexForKey;
if (typeof findExplabsSlotIndexForKey !== 'undefined')
  window.findExplabsSlotIndexForKey = findExplabsSlotIndexForKey;
if (typeof recordOpenRouterRequest !== 'undefined')
  window.recordOpenRouterRequest = recordOpenRouterRequest;
if (typeof recordNvidiaRequest !== 'undefined') window.recordNvidiaRequest = recordNvidiaRequest;
if (typeof recordCohereRequest !== 'undefined') window.recordCohereRequest = recordCohereRequest;
if (typeof recordExplabsRequest !== 'undefined') window.recordExplabsRequest = recordExplabsRequest;
if (typeof getGoogleKeysList !== 'undefined') window.getGoogleKeysList = getGoogleKeysList;

// --- [GEMINI TTS STUDIO PRO MODULE MOVED TO js/tts.js] ---

// Call initTTSStudio once loaded
if (typeof initTTSStudio === 'function') initTTSStudio();
else if (typeof window.initTTSStudio === 'function') window.initTTSStudio();

// Init Web Share Target & Shortcuts listener and Storage estimation
handleIncomingWebShare();

// [Quản lý Key Quota Modal & Events đã được chuyển sang js/quota.js]

// Auto-sync & refresh quota when switching back to tab (Mobile / Desktop)
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    updateKeyQuotaUI();
    const lastSync = Number(ls.getItem('jarvis_gist_last_sync_timestamp') || 0);
    if (Date.now() - lastSync > 30000 && ls.getItem('jarvis_auto_sync_cloud') !== 'false') {
      if (typeof window.JarvisSync?.performSmartSync === 'function') {
        window.JarvisSync.performSmartSync({ silent: true }).catch(() => {});
      }
    }
  }
});

// Đảm bảo cuộn chuột & kéo thả ngang PC được gắn đầy đủ
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    enableHorizontalScrollAndDrag($('tabs-container'));
    enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
    enableHorizontalScrollAndDrag($('image-preview-grid'));
  });
} else {
  enableHorizontalScrollAndDrag($('tabs-container'));
  enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
  enableHorizontalScrollAndDrag($('image-preview-grid'));
}

// ==========================================
// KHỐI: MAX CARE • NHẮC UỐNG THUỐC (Đã tách sang js/medication.js)
// ==========================================

// Đóng Modal đang mở khi nhấn phím Back phần cứng Android
window.closeActiveModal = function () {
  if ($('max-form-modal') && $('max-form-modal').style.display !== 'none') {
    if (typeof window.closeMaxFormModal === 'function') window.closeMaxFormModal();
    return true;
  }
  if ($('max-medication-modal') && $('max-medication-modal').style.display !== 'none') {
    if (typeof window.closeMedicationModal === 'function') window.closeMedicationModal();
    return true;
  }
  if ($('tts-studio-modal') && $('tts-studio-modal').style.display === 'flex') {
    if (typeof window.closeTTSStudioModal === 'function') window.closeTTSStudioModal();
    else {
      $('tts-studio-modal').style.display = 'none';
      $('modal-overlay').style.display = 'none';
    }
    return true;
  }
  if ($('knowledge-modal') && $('knowledge-modal').style.display === 'flex') {
    if (typeof window.closeKnowledgeModal === 'function') window.closeKnowledgeModal();
    else {
      $('knowledge-modal').style.display = 'none';
      $('modal-overlay').style.display = 'none';
    }
    return true;
  }
  if ($('settings-modal') && $('settings-modal').style.display === 'flex') {
    $('settings-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  if ($('key-quota-modal') && $('key-quota-modal').style.display === 'block') {
    closeKeyQuotaModal();
    return true;
  }
  if ($('search-modal') && $('search-modal').style.display === 'flex') {
    $('search-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  if ($('daily-briefing-modal') && $('daily-briefing-modal').style.display === 'block') {
    $('daily-briefing-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  if ($('prompt-library-modal') && $('prompt-library-modal').style.display === 'flex') {
    $('prompt-library-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  if ($('share-target-modal') && $('share-target-modal').style.display === 'block') {
    $('share-target-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  if ($('command-palette-modal') && $('command-palette-modal').style.display === 'block') {
    $('command-palette-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  if ($('live-call-modal') && $('live-call-modal').style.display === 'flex') {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
    else {
      $('live-call-modal').style.display = 'none';
      $('modal-overlay').style.display = 'none';
    }
    return true;
  }
  if ($('live-translate-modal') && $('live-translate-modal').style.display === 'flex') {
    $('live-translate-modal').style.display = 'none';
    $('modal-overlay').style.display = 'none';
    return true;
  }
  return false;
};

// Khởi tạo Max Medication Reminder khi DOM sẵn sàng
const launchAppInits = () => {
  if (typeof window.initMaxMedicationReminder === 'function') window.initMaxMedicationReminder();
  if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.onAppReady === 'function') {
    try {
      window.JarvisNativeBridge.onAppReady();
    } catch (e) {}
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', launchAppInits);
} else {
  setTimeout(launchAppInits, 80);
}
