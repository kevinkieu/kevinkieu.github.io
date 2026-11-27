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
// Đã tách sang js/chat-format.js nhưng vẫn dùng tên ngắn trong file này
const createStreamRenderer = window.createStreamRenderer;
const formatThinkingResponse = window.formatThinkingResponse;
const formatFinalThinkingResponse = window.formatFinalThinkingResponse;
const formatUpstreamError = window.formatUpstreamError;

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
  ls.setItem('chat_font_size', String(currentFontSize));
  if ($('font-size-label')) $('font-size-label').innerText = currentFontSize + 'px';
};
$('btn-font-dec').onclick = () => applyFontSize(currentFontSize - 1);
$('btn-font-inc').onclick = () => applyFontSize(currentFontSize + 1);
$('btn-font-reset').onclick = () => applyFontSize(16);
applyFontSize(currentFontSize);

// --- STREAM RENDERER WITH REQUEST ANIMATION FRAME ---
// --- REASONING ACCORDION & THINKING FORMATTER (GEMINI & DEEPSEEK) ---
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
if (typeof formatUpstreamError !== 'undefined') window.formatUpstreamError = formatUpstreamError;

// [Đã tách sang js/api-keys.js: initAPIKeys / initExternalConfigs + 3 button handlers + auto-init]
// [Đã tách sang js/database.js: IndexedDB engine (db, initDB, saveToDB, getAllFromDB, clearAllDB, file/TTS stores)]
// Giữ lại: syncSessionsToNative (native-only) + expose window.db/getDB do js/database.js gán khi initDB xong
let _nativeSyncTimer = null;

// --- OFFLINE QUEUE UI ALIASES (js/offline-queue-ui.js) ---
const renderPendingQueue = window.renderPendingQueue;
const flushOfflineQueue = window.flushOfflineQueue;
const dropQueuedItem = window.dropQueuedItem;
const sendQueuedNow = window.sendQueuedNow;

// --- HANDS-FREE ALIASES (js/hands-free.js) ---
const stopHandsFreeVoice = window.stopHandsFreeVoice;
const processHandsFreeAudioBlob = window.processHandsFreeAudioBlob;
const startHandsFreeRecorder = window.startHandsFreeRecorder;
const commitAndSendHandsFree = window.commitAndSendHandsFree;
const toggleHandsFreeVoice = window.toggleHandsFreeVoice;

// --- MESSAGE TTS ALIASES (js/message-tts.js) ---
const stopCurrentSpeaking = window.stopCurrentSpeaking;
const playTextAudio = window.playTextAudio;

// --- SESSION MANAGER ALIASES (js/session-manager.js) ---
const tryAutoNameSession = window.tryAutoNameSession;
const renderCompactSummary = window.renderCompactSummary;
const condenseSessionMemory = window.condenseSessionMemory;
const renderTabs = window.renderTabs;
const renderFolders = window.renderFolders;
const loadSess = window.loadSess;
const newSess = window.newSess;
const switchSess = window.switchSess;
const sessionMatchesFilter = window.sessionMatchesFilter;
const renderSel = window.renderSel;

// --- UI NOTIFY ALIASES (js/ui-notify.js) ---
const showToast = window.showToast;
const notifyUser = window.notifyUser;

// --- CHAT UI HELPERS ALIASES (js/chat-ui-helpers.js) ---
const updateThinkingVisibility = window.updateThinkingVisibility;

// --- NATIVE SYNC ALIASES (js/native-sync.js) ---
const syncSessionsToNative = window.syncSessionsToNative;
const updateConfig = window.updateConfig;
const scheduleAutoSync = window.scheduleAutoSync;

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
window.enableHorizontalScrollAndDrag(DOM.tabsContainer);
window.enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
window.enableHorizontalScrollAndDrag($('image-preview-grid'));

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
// --- AUTO-NAME SESSION ---
// --- CONVERSATION BRANCHING (RẼ NHÁNH HỘI THOẠI) ---
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

// Theme scheduler owns initialization; app only wires the toggle button
DOM.btnTheme.onclick = () => window.ThemeScheduler?.cycleMode?.();

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
  // "Con người" của Jarvis lấy từ js/persona-config.js (Settings → Tính cách),
  // không còn viết cứng chuỗi quy tắc trong file này.
  const persona =
    window.PersonaConfig && typeof window.PersonaConfig.get === 'function'
      ? window.PersonaConfig.get()
      : null;
  const b =
      DOM.sysInst?.value?.trim() ||
      (persona ? persona.identity : '') ||
      'Bạn là Jarvis AI - trợ lý thông minh và chuẩn xác.',
    g =
      DOM.globContext?.value ||
      ls.getItem('jarvis_global_context') ||
      ls.getItem('huanmu_global_context') ||
      '';

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

  const timeInstruction =
    !persona || persona.timeRule !== false
      ? window.PersonaConfig && typeof window.PersonaConfig.buildTimeRule === 'function'
        ? window.PersonaConfig.buildTimeRule(new Date())
        : ''
      : '';

  const extraRules = [];
  if (persona && persona.tone) {
    extraRules.push(
      window.PersonaConfig && typeof window.PersonaConfig.buildToneRule === 'function'
        ? window.PersonaConfig.buildToneRule(persona.tone)
        : `[PHONG CÁCH & CÁCH XƯNG HÔ NGƯỜI DÙNG MUỐN]:\n${persona.tone}`
    );
  }
  if (!persona || persona.privacyRule !== false) {
    extraRules.push(
      window.PersonaConfig && typeof window.PersonaConfig.buildPrivacyRule === 'function'
        ? window.PersonaConfig.buildPrivacyRule()
        : '[QUY TẮC ỨNG XỬ TẾ NHỊ]: Không tự tiện nhắc đến thông tin gia đình, đời tư, con cái hay người thân nếu người dùng không chủ động hỏi.'
    );
  }
  if (!persona || persona.thinkingRule !== false) {
    extraRules.push(
      window.PersonaConfig && typeof window.PersonaConfig.buildThinkingRule === 'function'
        ? window.PersonaConfig.buildThinkingRule()
        : '[QUY TẮC TRẢ LỜI CỦA MÔ HÌNH SUY LUẬN (THINKING)]: Sau khi hoàn tất suy luận nội bộ, bạn BẮT BUỘC PHẢI viết câu trả lời hoàn chỉnh cho người dùng.'
    );
  }
  const extraBlock = extraRules.filter(Boolean).join('\n\n');

  const personalBlock = window.Personalization?.buildPromptBlock?.() || '';

  const card =
    persona && window.PersonaConfig && typeof window.PersonaConfig.buildCard === 'function'
      ? window.PersonaConfig.buildCard(persona)
      : '';

  return `${timeInstruction ? timeInstruction + '\n\n' : ''}[CHỈ THỊ HỆ THỐNG]:\n${card ? card + '\n\n' : ''}${DOM.toggleGlob?.checked !== false && g ? '--- TOÀN CỤC: ' + g + '\n' : ''}--- RIÊNG: ${b}${memorySnippet}${pinnedSnippet}${ragBlock}${extraBlock ? '\n\n' + extraBlock : ''}${personalBlock ? '\n\n' + personalBlock : ''}`;
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

DOM.fileUpload.onchange = async e => {
  await processUploadFiles(Array.from(e.target.files));
  DOM.fileUpload.value = '';
};

DOM.btnAddUrl.onclick = async () => {
  const u = await window.appPrompt('Nhập link URL website hoặc YouTube:');
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
    /** @type {any} */ (c.getContext('2d')).drawImage(v, 0, 0);
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
            <strong>${escapeHtml(f.name)}</strong><br>
            <small style="color:var(--text-muted);">${(f.size / 1024).toFixed(1)} KB • ${new Date(f.added).toLocaleDateString('vi-VN')}</small>
          </div>
          <button class="btn primary" data-file-id="${encodeURIComponent(f.id)}" onclick="addFileFromLib(decodeURIComponent(this.dataset.fileId))">➕ Đính</button>
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

$('btn-new-session').onclick = () => newSess();

$('btn-rename-session').onclick = async () => {
  const s = sessions.find(x => x.id === activeId);
  if (!s) return;
  const n = await window.appPrompt('Nhập tên mới cho phiên:', s.name);
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
  if (await window.appConfirm(`Bạn có chắc muốn xóa phiên "${s?.name || ''}"?`)) {
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
  if (await window.appConfirm(`Bạn có chắc muốn xóa ${selected.length} tin nhắn đã chọn?`)) {
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
  const clean = window.sanitizeTranscript(cleanRaw);
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

let currentSpeakingAbort = false;
let currentSpeakingUrls = [];

window.clearActiveSession = async () => {
  if (await window.appConfirm('Bạn có chắc muốn xóa sạch toàn bộ tin nhắn trong phiên này?')) {
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

// --- HÀNG ĐỢI NGOẠI TUYẾN (xem js/offline-queue.js) ---

// --- SEND MESSAGE (STREAM / INTERACTIONS) ---

// --- EXPORT JSON & RESTORE ---
// [exportAllSessions đã được chuyển sang js/export.js]

$('import-all-input').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = async ev => {
    try {
      const d = JSON.parse(String(ev.target.result));
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
            // Chỉ nhận key nằm trong danh sách cho phép — chặn file backup bị làm nhọ
            // ghi đè jarvis_gist_pat / key lạ / biến hệ thống.
            const allowed =
              k === 'chat_font_size' ||
              k === 'tavily_api_key' ||
              k === 'serper_api_key' ||
              k === 'brave_api_key' ||
              k === 'groq_api_key' ||
              k === 'deepseek_api_key' ||
              k === 'jina_api_key' ||
              k === 'brave_worker_url' ||
              /^jarvis_/.test(k) ||
              /^huanmu_/.test(k) ||
              /^javiss_/.test(k);
            const blocked = k === 'jarvis_gist_pat';
            if (!allowed || blocked) {
              console.warn('[Backup] Bỏ qua key không được phép:', k);
              return;
            }
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
      const b64 = String(rd.result || '').split(',')[1] || '';
      r({ mimeType: f.type || 'image/jpeg', data: b64 });
    };
    rd.readAsDataURL(f);
  });
const fileToInteractionPart = fileToBase64;

// [exportChatDoc & exportChatPDF đã được chuyển sang js/export.js]

// --- TOAST NOTIFIER ---

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
  // Gõ là lọc ngay danh sách phiên (tên, model, nội dung tin nhắn)
  sideSearchInput.addEventListener('input', () => {
    window.sessionFilter = sideSearchInput.value;
    renderSel();
  });
  sideSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      sideSearchInput.value = '';
      window.sessionFilter = '';
      renderSel();
      sideSearchInput.blur();
      return;
    }
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
  if (!sBar.contains(/** @type {any} */ (e.target))) sBar.classList.remove('active');
});

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

if (DOM.selSession) DOM.selSession.onchange = e => switchSess(e.target.value);

// BOOTSTRAP APP
loadSess();

initSelectionToolbar();

// --- [GITHUB GIST CLOUD SYNC & 2-WAY SMART MERGE MOVED TO js/sync.js] ---
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
// getGoogleKeysList được js/api-keys.js xuất qua window.

// --- [GEMINI TTS STUDIO PRO MODULE MOVED TO js/tts.js] ---

// Call initTTSStudio once loaded
if (typeof window.initTTSStudio === 'function') window.initTTSStudio();

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
    window.enableHorizontalScrollAndDrag($('tabs-container'));
    window.enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
    window.enableHorizontalScrollAndDrag($('image-preview-grid'));
  });
} else {
  window.enableHorizontalScrollAndDrag($('tabs-container'));
  window.enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
  window.enableHorizontalScrollAndDrag($('image-preview-grid'));
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

// Mốc đo: app.js đã chạy xong (handler Gửi, toàn bộ sự kiện UI đã gắn)
window.JarvisPerf?.mark('app-ready');
