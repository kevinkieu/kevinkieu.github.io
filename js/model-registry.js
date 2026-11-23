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
      [/^gemini-(3|4)/, ['minimal', 'low', 'medium', 'high']]
    ];
    const THINKING_LEVEL_LABELS = {
      minimal: 'Min (Tối thiểu)', low: 'Low (Thấp)', medium: 'Med (Chuẩn)', high: 'High (Sâu)', xhigh: 'XHigh (Tối đa)'
    };
    const DEFAULT_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'];

    // Danh sách mức Think Depth của 1 model Gemini (rỗng = model không dùng thinkingLevel).
    function getModelThinkingLevels(model) {
      const m = String(model || '').trim();
      for (const [re, levels] of THINKING_LEVELS_BY_MODEL) {
        if (re.test(m)) return levels.slice();
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

    // --- REGISTRY GATEWAY OpenAI-COMPATIBLE (OpenRouter) ---
    // Các model dưới đây gọi chung endpoint /chat/completions (SSE) thay vì Google Gemini.
    const COMPAT_PROVIDERS = {
      nvidia: {
        id: 'nvidia',
        label: 'NVIDIA',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        keyStorage: 'nvidia_api_key',
        keyStorageMultiple: 'nvidia_keys',
        keyCount: 3,
        keyIndexVar: 'nvidiaKeyIndex',
        keyLabel: 'NVIDIA',
        // NVIDIA chặn CORS cho mọi origin lạ -> cho phép dùng proxy chuyển tiếp
        getBaseUrl: () => {
          const proxy = (ls.getItem('nvidia_proxy_url') || '').trim().replace(/\/+$/, '');
          return proxy || NVIDIA_DEFAULT_PROXY;
        },
        models: [
          'nvidia/nemotron-3.5-lightning-30b-a3b',
          'nvidia/nemotron-3.5-bolt-e4b',
          'nvidia/nemotron-3.5-super-vl-120b-a12b',
          'nvidia/nemotron-3-ultra-550b-a55b',
          'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
        ],
        modelLabel: m => {
          if (m.includes('nemotron-3.5-bolt')) return 'Nemotron 3.5 Bolt E4B';
          if (m.includes('nemotron-3.5-lightning')) return 'Nemotron 3.5 Lightning 30B A3B';
          if (m.includes('nemotron-3.5-super-vl')) return 'Nemotron 3.5 Super VL 120B A12B';
          if (m.includes('nemotron-3-ultra')) return 'Nemotron 3 Ultra 550B A55B';
          if (m.includes('nemotron-3-nano-omni')) return 'Nemotron 3 Nano Omni 30B A3B';
          return m;
        }
      },
      openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        keyStorage: 'openrouter_api_key',
        keyStorageMultiple: 'openrouter_keys',
        keyCount: 5,
        keyIndexVar: 'openRouterKeyIndex',
        keyLabel: 'OpenRouter',
        models: [
          'nvidia/nemotron-3.5-lightning:free',
          'nvidia/nemotron-3.5-super-vl:free',
          'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
          'particle-ai/particle-1:free',
          'baidu/ernie-5.5-flash-preview:free'
        ],
        extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
        includeReasoning: true,
        modelLabel: m => {
          if (m.includes('nemotron-3.5-super-vl')) return 'Nemotron 3.5 Super VL';
          if (m.includes('nemotron-3-nano-omni')) return 'Nemotron 3 Nano Omni';
          if (m.includes('nemotron')) return 'Nemotron 3.5 Lightning';
          if (m.includes('particle')) return 'Particle-1';
          if (m.includes('ernie')) return 'ERNIE-5.5-Flash';
          return m;
        }
      },
      cohere: {
        id: 'cohere',
        label: 'Cohere',
        baseUrl: 'https://api.cohere.ai/compatibility/v1',
        keyStorage: 'cohere_api_key',
        keyStorageMultiple: 'cohere_keys',
        keyCount: 3,
        keyIndexVar: 'cohereKeyIndex',
        keyLabel: 'Cohere',
        models: [
          'command-a-plus-05-2026',
          'command-a-reasoning-08-2025'
        ],
        extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
        includeReasoning: true,
        // Compatibility API chỉ nhận whitelist tham số của OpenAI (model, messages, stream,
        // temperature, top_p, max_tokens, stop, seed, reasoning_effort, tools, response_format,
        // frequency_penalty, presence_penalty). Các tham số khác bị trả HTTP 422
        // "unprocessable entity: <param> is not supported" (vd top_k).
        unsupportedParams: ['top_k', 'stream_options'],
        // Reasoning đi qua reasoning_effort ('none' | 'high'), KHÔNG nhận object reasoning kiểu OpenRouter
        reasoningEffortParam: 'reasoning_effort',
        modelLabel: m => {
          if (m.includes('command-a-reasoning')) return 'Command A Reasoning';
          if (m.includes('command-a-plus')) return 'Command A+';
          return m;
        }
      }
    };
    // --- THÔNG SỐ RIÊNG TỪNG MODEL GATEWAY (context / trần output / cách tắt reasoning / generation params) ---
    // Particle-1: context 1.048.576 token, completion tối đa 131.072 token.
    // Particle mặc định reasoning = 'high' khi KHÔNG gửi tham số -> muốn tắt phải gửi 'none' tường minh.
    // Các mức hợp lệ: none, minimal, low, medium, high, xhigh, max, ultra (app chỉ dùng 4 mức đầu).
    const COMPAT_MODEL_OPTS = {
      'nvidia/nemotron-3.5-lightning-30b-a3b': {
        maxTokens: 65536,
        noReasoning: true,
        levels: [['none', 'Tắt (NVIDIA)']],
        defaultEffort: 'none',
        inputModalities: ['text'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: 'NVIDIA integrate.api.nvidia.com - 30B A3B'
      },
      'nvidia/nemotron-3.5-bolt-e4b': {
        maxTokens: 65536,
        noReasoning: true,
        levels: [['none', 'Tắt (NVIDIA)']],
        defaultEffort: 'none',
        inputModalities: ['text'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: 'NVIDIA integrate.api.nvidia.com - E4B'
      },
      // --- 3 model NVIDIA mới: đều nhận thinking qua chat_template_kwargs.enable_thinking ---
      // Nemotron 3.5 Super VL 120B A12B: context 1M, reasoning ON mặc định, effort low/medium/high.
      'nvidia/nemotron-3.5-super-vl-120b-a12b': {
        contextWindow: 1048576,
        maxOutputTokens: 1048576,
        maxTokens: 1048576,
        nvThinking: { effort: true },
        levels: [['high', 'High (Sâu)'], ['medium', 'Med (Chuẩn)'], ['low', 'Low (Thấp)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text', 'image', 'video'],
        temperature: 0.6,
        topP: 0.9,
        topK: 40,
        notes: '120B MoE (12B active), 1M context, text + ảnh + video, reasoning ON mặc định'
      },
      // Nemotron 3 Ultra 550B A55B: context 1M, reasoning ON mặc định.
      // Đo thực tế: chat_template_kwargs.medium_effort gần như không đổi số token suy luận
      // (plain 56/56 vs medium 38/50) -> chỉ giữ bật/tắt thay vì mời mức không tác dụng.
      'nvidia/nemotron-3-ultra-550b-a55b': {
        contextWindow: 1048576,
        maxOutputTokens: 32768,
        maxTokens: 32768,
        nvThinking: {},
        levels: [['high', 'Bật (mặc định)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text'],
        temperature: 0.6,
        topP: 0.9,
        topK: 40,
        notes: '550B (55B active), 1M context, text→text, reasoning ON mặc định'
      },
      // Nemotron 3 Nano Omni 30B A3B: context 256K, omni (text/ảnh/audio/video), reasoning theo ngân sách token.
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': {
        contextWindow: 262144,
        maxOutputTokens: 131072,
        maxTokens: 131072,
        nvThinking: { budget: { minimal: 1024, low: 4096, medium: 8192, high: 16384 } },
        levels: [['high', 'High (trần 16K)'], ['medium', 'Med (trần 8K)'], ['low', 'Low (trần 4K)'], ['minimal', 'Min (trần 1K)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text', 'image', 'audio', 'video'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: '30B A3B omni: text + ảnh + audio + video, ngân sách suy luận 1K-16K'
      },
      'particle-ai/particle-1:free': {
        contextWindow: 1048576,
        maxOutputTokens: 131072,
        maxTokens: 131072,
        offEffort: 'none',
        efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        defaultEffort: 'high',
        inputModalities: ['text', 'image'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: 'Agentic coding, post-trained từ DeepSeek V4.1 Flash, nhận text + ảnh'
      },
      // ERNIE-5.5-Flash-Preview: reasoning LUÔN BẬT, effort không chỉnh được (fixed high),
      // và reasoning token được tính vào max_completion_tokens.
      'baidu/ernie-5.5-flash-preview:free': {
        contextWindow: 1024000,
        maxOutputTokens: 1024000,      // theo model card của Baidu
        apiMaxCompletionTokens: 921600, // trần thực tế OpenRouter công bố cho endpoint này
        maxTokens: 921600,
        reasoningAlwaysOn: true,
        canDisable: false,
        efforts: ['high'],             // effort bị khoá ở high, không nhận mức khác
        defaultEffort: 'high',
        inputModalities: ['text'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: '280B MoE (14B active), text→text, ~200 tok/s, free tier 20 req/phút'
      },
      // Nemotron 3.5 Lightning: endpoint free chỉ nhận `reasoning` bật/tắt,
      // KHÔNG công bố reasoning_effort -> Think Depth chỉ có Bật / Tắt.
      'nvidia/nemotron-3.5-lightning:free': {
        contextWindow: 1000000,
        maxOutputTokens: 65536,
        maxTokens: 65536,
        reasoningToggle: true,
        levels: [['high', 'Bật (mặc định)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: '30B MoE (3B active), text→text, tối ưu throughput agentic'
      },
      // Nemotron 3.5 Super VL: vision-language, cũng chỉ bật/tắt reasoning (không có effort).
      'nvidia/nemotron-3.5-super-vl:free': {
        contextWindow: 1000000,
        maxOutputTokens: 131072,
        maxTokens: 131072,
        reasoningToggle: true,
        levels: [['high', 'Bật (mặc định)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text', 'image', 'video'],
        temperature: 0.6,
        topP: 0.9,
        topK: 40,
        notes: '120B MoE (12B active), nhận text + ảnh + video, đọc cả tài liệu/screenshot'
      },
      // Nemotron 3 Nano Omni: chỉ hỗ trợ reasoning.max_tokens (supports_max_tokens = true,
      // không có reasoning_effort) -> Think Depth ánh xạ sang ngân sách token suy luận.
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': {
        contextWindow: 256000,
        maxOutputTokens: 65536,
        maxTokens: 65536,
        reasoningBudgets: { minimal: 1024, low: 4096, medium: 8192, high: 16384 },
        levels: [['high', 'High (~16K)'], ['medium', 'Med (~8K)'], ['low', 'Low (~4K)'], ['minimal', 'Min (~1K)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text', 'image', 'audio', 'video'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: '30B-A3B omni: text + ảnh + audio + video → text, reasoning bật mặc định'
      },
      // Cohere Command models via Cohere native API (endpoint api.cohere.ai/compatibility/v1)
      // Command A+: Mixture of Experts, 128k context, 64k max output, text + ảnh + video
      'command-a-plus-05-2026': {
        contextWindow: 128000,
        maxOutputTokens: 64000,
        maxTokens: 64000,
        reasoningToggle: true,
        levels: [['high', 'Bật (mặc định)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text', 'image', 'video'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: 'Mixture of Experts, 128k context, text + ảnh + video'
      },
      // Command A Reasoning: 256k context, 32k max output, text-only, reasoning-enabled
      'command-a-reasoning-08-2025': {
        contextWindow: 256000,
        maxOutputTokens: 32000,
        maxTokens: 32000,
        reasoningToggle: true,
        levels: [['high', 'Bật (mặc định)'], ['none', 'Tắt']],
        defaultEffort: 'high',
        inputModalities: ['text'],
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        notes: '256k context, text-only, reasoning-enabled'
      },
    };
    // Model dùng bể 5 key Experiential Labs (quota.js & menu key dùng chung đọc qua window)
    const EXPLABS_MODELS = ['gpt-6-luna', 'deepseek-v4.1-flash', 'qwen4-max:free'];
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
    // để nhánh compat không "nuốt" model Explabs (gửi nhầm API key).    const explabsModelSet = new Set(EXPLABS_MODELS);    function resolveCompatProvider(modelId) {      const m = (modelId || '').trim();      if (!m || explabsModelSet.has(m)) return null;      // Đọc window.COMPAT_PROVIDERS lúc gọi: DynamicProviders.init() (DOMContentLoaded)      // đã ghi đè nó bằng registry động (provider/model do người dùng thêm), nên      // hàm này vẫn trả provider/model mới dù app.js giữ hàm snapshot từ lúc load.      const providers = (window.COMPAT_PROVIDERS && typeof window.COMPAT_PROVIDERS === 'object')        ? window.COMPAT_PROVIDERS : COMPAT_PROVIDERS;      // Ưu tiên provider động (do người dùng thêm) hơn provider legacy (nvidia/openrouter/cohere từ DEFAULT_MODELS).      // Lấy danh sách provider ID từ window.DYNAMIC_PROVIDERS, loại trừ built-in (google, explabs).      const dynamicProviderIds = (window.DYNAMIC_PROVIDERS && typeof window.DYNAMIC_PROVIDERS === 'object')        ? Object.keys(window.DYNAMIC_PROVIDERS).filter(id => id !== 'google' && id !== 'explabs')        : [];      // 1. Kiểm tra provider động trước (theo thứ tự thêm)      for (const pid of dynamicProviderIds) {        const p = providers[pid];        if (p && p.models.includes(m)) return { provider: p, model: m };      }      // 2. Fallback: kiểm tra tất cả provider (backwards compatibility)      for (const p of Object.values(providers)) {        if (p.models.includes(m)) return { provider: p, model: m };      }      return null;    }
    window.resolveCompatProvider = resolveCompatProvider;

    // Cảnh báo một lần lúc load nếu ID Explabs bị khai trùng trong COMPAT_PROVIDERS.
    (function checkExplabsCompatOverlap() {
      const dup = [];
      for (const p of Object.values(COMPAT_PROVIDERS)) {
        for (const id of p.models) if (explabsModelSet.has(id)) dup.push(`${id} (${p.id})`);
      }
      if (dup.length) {
        console.warn('[Jarvis] Model ID Explabs khai trùng trong COMPAT_PROVIDERS: ' + dup.join(', ') + ' — Explabs được ưu tiên; hãy bỏ các ID này khỏi COMPAT_PROVIDERS.');
      }
    })();


  // --- XUẤT RA WINDOW CHO CÁC MODULE KHÁC & CHO CÁC ALIAS BÊN APP.JS ---
  window.FLASH_LITE_MODEL = FLASH_LITE_MODEL;
  window.AUX_FALLBACK_MODELS = AUX_FALLBACK_MODELS;
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
