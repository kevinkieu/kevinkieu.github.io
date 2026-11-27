/* ==========================================================================
   Jarvis AI - Model Registry & Thinking Levels
   Dữ liệu "tĩnh" của tầng model: bảng mức suy luận theo model, registry các
   provider OpenAI-compatible (NVIDIA / OpenRouter / Cohere), thông số riêng
   từng model, và các builder tham số reasoning.

   Tách ra khỏi js/app.js (trước đây ~340 dòng nằm giữa file) và nạp TRƯỚC
   js/app.js trong index.html. Mọi thứ được xuất qua window để các module khác
   (quota.js, api-keys.js, sync.js...) dùng chung như trước.
   ========================================================================== */
(function () {
  'use strict';
  const ls = localStorage;

  // CENTRAL CONSTANT FOR SECONDARY & BACKGROUND TASKS (FLASH LITE)
  const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';
  const AUX_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

  // --- CHUỖI DỰ PHÒNG KHI PROVIDER QUÁ TẢI (failover, xem js/failover.js) ---
  // Thứ tự = thứ tự thử. Model không khai báo ở đây (mọi model gateway) dùng
  // chuỗi mặc định Gemini Flash Lite trong js/failover.js.
  const FAILOVER_CHAINS = {
    'gemini-4-hydrogen': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    'gemini-3.8-flash': ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
    'gemini-3.7-flash': ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
    'gemini-3.6-flash': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    'gemma-4': ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  };

  // --- MỨC SUY LUẬN (thinkingLevel) HỢP LỆ CỦA TỪNG MODEL ---
  // Nguồn: ai.google.dev/gemini-api/docs/generate-content/thinking (bảng thinkingLevel)
  // + ai.google.dev/gemini-api/docs/thinking (mức mặc định từng model).
  //   Gemini 4 Hydrogen      : low, medium, high (xhigh) - KHÔNG nhận 'minimal', mặc định high
  //   Gemini 3.8 / 3.7 Flash : low, medium, high - KHÔNG nhận 'minimal' (gửi vào là lỗi 400), mặc định medium
  //   Gemini 3.6 Flash       : minimal, low, medium, high - mặc định medium
  //   Gemini 3.5/3.1 Flash-Lite: minimal, low, medium, high - mặc định minimal
  // Chỉ được gửi đúng mức model hỗ trợ; mức không hỗ trợ phải hạ về mức thấp nhất model nhận.
  const THINKING_LEVELS_BY_MODEL = [
    [/^gemini-4-hydrogen/, ['low', 'medium', 'high']],
    [/^gemini-4-/, ['low', 'medium', 'high']],
    [/^gemini-3\.[78]-flash/, ['low', 'medium', 'high']],
    [/^gemini-3\.6-flash/, ['minimal', 'low', 'medium', 'high']],
    [/^gemini-3\.5-flash-lite/, ['minimal', 'low', 'medium', 'high']],
    [/^gemini-3\.1-flash-lite/, ['minimal', 'low', 'medium', 'high']],
    [/^gemini-(3|4)/, ['minimal', 'low', 'medium', 'high']],
  ];
  const THINKING_LEVEL_LABELS = {
    minimal: 'Min (Tối thiểu)',
    low: 'Low (Thấp)',
    medium: 'Med (Chuẩn)',
    high: 'High (Sâu)',
    xhigh: 'XHigh (Tối đa)',
  };
  const DEFAULT_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'];

  // Danh sách mức Think Depth của 1 model Gemini (rỗng = model không dùng thinkingLevel).
  function getModelThinkingLevels(model) {
    const m = String(model || '').trim();
    for (const [re, levels] of THINKING_LEVELS_BY_MODEL) {
      if (/** @type {any} */ (re).test(m)) return /** @type {any[]} */ (levels).slice();
    }
    return [];
  }

  // Ép mức người dùng chọn về mức model thật sự nhận: không hỗ trợ thì lấy mức thấp nhất
  // (vd 'minimal' với 3.8 Flash / 4 Hydrogen -> 'low'). Trả null khi model không dùng thinkingLevel.
  function resolveThinkingLevel(model, level) {
    const levels = getModelThinkingLevels(model);
    if (!levels.length) return null;
    if (level && levels.includes(level)) return level;
    return levels[0];
  }
  window.getModelThinkingLevels = getModelThinkingLevels;
  window.resolveThinkingLevel = resolveThinkingLevel;

  // Proxy NVIDIA mặc định: máy mới không cần nhập gì vẫn chat được; nhập URL khác trong
  // Cấu hình (localStorage nvidia_proxy_url) để ghi đè.
  const NVIDIA_DEFAULT_PROXY = 'https://jarvis-nvidia-proxy-9klgal-preview.freebuff.site/v1';

  // --- REGISTRY TỪ PROVIDER_REGISTRY (Single Source of Truth) ---
  // COMPAT_PROVIDERS và COMPAT_MODEL_OPTS được build từ window.PROVIDER_REGISTRY
  // provider-registry.js PHẢI nạp TRƯỚC file này trong index.html
  const COMPAT_PROVIDERS =
    typeof window.buildCompatProviders === 'function' ? window.buildCompatProviders() : {};
  const COMPAT_MODEL_OPTS =
    typeof window.buildCompatModelOpts === 'function' ? window.buildCompatModelOpts() : {};
  const EXPLABS_MODELS =
    typeof window.getExplabsModels === 'function'
      ? window.getExplabsModels()
      : ['gpt-6-luna', 'deepseek-v4.1-flash', 'qwen4-max:free'];

  // Gán lên window để các module khác dùng (dynamic-providers.js sẽ ghi đè sau khi init)
  window.COMPAT_PROVIDERS = COMPAT_PROVIDERS;
  window.COMPAT_MODEL_OPTS = COMPAT_MODEL_OPTS;
  window.EXPLABS_MODELS = EXPLABS_MODELS;

  // Dựng object `reasoning` gửi OpenRouter theo Think Depth đang chọn.
  // null = không gửi tham số reasoning, để model tự quyết định.
  function buildReasoningPayload(mOpts, thk) {
    // Model NVIDIA (integrate.api.nvidia.com) không nhận tham số reasoning kiểu OpenRouter
    // (dùng buildNvidiaThinking -> chat_template_kwargs)
    if (mOpts && (mOpts.noReasoning || mOpts.nvThinking)) return null;
    // ERNIE: reasoning luôn bật, effort cố định (high) -> chỉ xin trả về reasoning
    if (mOpts && mOpts.reasoningAlwaysOn) return { exclude: false };
    // Nemotron 3.5 Lightning / Super VL (free): endpoint không có reasoning_effort -> chỉ bật/tắt
    if (mOpts && mOpts.reasoningToggle) return { enabled: thk !== 'none' };
    // Nemotron 3 Nano Omni: không có effort, điều khiển bằng ngân sách token suy luận
    if (mOpts && mOpts.reasoningBudgets) {
      const budget = mOpts.reasoningBudgets[thk];
      return budget ? { max_tokens: budget } : { enabled: false };
    }
    if (thk && thk !== 'none') return { effort: thk };
    // Model mặc định BẬT reasoning (Particle-1 = high): muốn tắt phải gửi tường minh
    if (mOpts && mOpts.offEffort) return { effort: mOpts.offEffort };
    return null;
  }
  window.buildReasoningPayload = buildReasoningPayload;

  // Dựng tham số suy luận cho NVIDIA integrate.api.nvidia.com: thinking bật/tắt qua
  // chat_template_kwargs.enable_thinking, mức sâu qua reasoning_effort (Gemma 4, Super VL)
  // hoặc reasoning_budget (Nano Omni - ngân sách trần cho phần suy luận).
  // null = model không có bộ điều khiển riêng (giữ nguyên hành vi cũ).
  function buildNvidiaThinking(mOpts, thk) {
    const nv = mOpts && mOpts.nvThinking;
    if (!nv) return null;
    const on = !!thk && thk !== 'none';
    const ctk = { enable_thinking: on };
    const body = { chat_template_kwargs: ctk };
    if (!on) return body;
    // reasoning_effort chỉ nhận low/medium/high
    if (nv.effort) body.reasoning_effort = thk === 'minimal' ? 'low' : thk;
    if (nv.budget && nv.budget[thk]) body.reasoning_budget = nv.budget[thk];
    return body;
  }
  window.buildNvidiaThinking = buildNvidiaThinking;

  // Một model ID chỉ được thuộc MỘT nền tảng. Bể key Experiential Labs được ưu tiên:
  // nếu ID vô tình nằm cả trong COMPAT_PROVIDERS thì resolveCompatProvider trả null,
  // để nhánh compat không "nuốt" model Explabs (gửi nhầm API key).
  const explabsModelSet = new Set(EXPLABS_MODELS);
  function resolveCompatProvider(modelId) {
    const m = (modelId || '').trim();
    if (!m || explabsModelSet.has(m)) return null;
    // Đọc window.COMPAT_PROVIDERS lúc gọi: DynamicProviders.init() (DOMContentLoaded)
    // đã ghi đè nó bằng registry động (provider/model do người dùng thêm), nên
    // hàm này vẫn trả provider/model mới dù app.js giữ hàm snapshot từ lúc load.
    const providers =
      window.COMPAT_PROVIDERS && typeof window.COMPAT_PROVIDERS === 'object'
        ? window.COMPAT_PROVIDERS
        : COMPAT_PROVIDERS;
    // Ưu tiên provider động (do người dùng thêm) hơn provider legacy (nvidia/openrouter/cohere từ DEFAULT_MODELS).
    // Lấy danh sách provider ID từ window.DYNAMIC_PROVIDERS, loại trừ built-in (google, explabs).
    const dynamicProviderIds =
      window.DYNAMIC_PROVIDERS && typeof window.DYNAMIC_PROVIDERS === 'object'
        ? Object.keys(window.DYNAMIC_PROVIDERS).filter(id => id !== 'google' && id !== 'explabs')
        : [];
    // 1. Kiểm tra provider động trước (theo thứ tự thêm)
    for (const pid of dynamicProviderIds) {
      const p = providers[pid];
      if (p && p.models.includes(m)) return { provider: p, model: m };
    }
    // 2. Fallback: kiểm tra tất cả provider (backwards compatibility)
    for (const p of Object.values(providers)) {
      if (p.models.includes(m)) return { provider: p, model: m };
    }
    return null;
  }
  window.resolveCompatProvider = resolveCompatProvider;

  // Cảnh báo một lần lúc load nếu ID Explabs bị khai trùng trong COMPAT_PROVIDERS.
  (function checkExplabsCompatOverlap() {
    const dup = [];
    for (const p of Object.values(COMPAT_PROVIDERS)) {
      for (const id of p.models) if (explabsModelSet.has(id)) dup.push(`${id} (${p.id})`);
    }
    if (dup.length) {
      console.warn(
        '[Jarvis] Model ID Explabs khai trùng trong COMPAT_PROVIDERS: ' +
          dup.join(', ') +
          ' — Explabs được ưu tiên; hãy bỏ các ID này khỏi COMPAT_PROVIDERS.'
      );
    }
  })();

  // --- XUẤT RA WINDOW CHO CÁC MODULE KHÁC & CHO CÁC ALIAS BÊN APP.JS ---
  window.FLASH_LITE_MODEL = FLASH_LITE_MODEL;
  window.AUX_FALLBACK_MODELS = AUX_FALLBACK_MODELS;
  window.FAILOVER_CHAINS = FAILOVER_CHAINS;
  window.THINKING_LEVELS_BY_MODEL = THINKING_LEVELS_BY_MODEL;
  window.THINKING_LEVEL_LABELS = THINKING_LEVEL_LABELS;
  window.DEFAULT_THINKING_LEVELS = DEFAULT_THINKING_LEVELS;
  window.getModelThinkingLevels = getModelThinkingLevels;
  window.resolveThinkingLevel = resolveThinkingLevel;
  window.NVIDIA_DEFAULT_PROXY = NVIDIA_DEFAULT_PROXY;
  window.COMPAT_PROVIDERS = COMPAT_PROVIDERS;
  window.COMPAT_MODEL_OPTS = COMPAT_MODEL_OPTS;
  window.EXPLABS_MODELS = EXPLABS_MODELS;
  window.buildReasoningPayload = buildReasoningPayload;
  window.buildNvidiaThinking = buildNvidiaThinking;
  window.resolveCompatProvider = resolveCompatProvider;
})();
