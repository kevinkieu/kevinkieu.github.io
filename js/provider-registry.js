/* ==========================================================================
   Jarvis AI - Provider Registry (Single Source of Truth)
   Nguồn duy nhất cho toàn bộ metadata provider: Google, NVIDIA, OpenRouter,
   Cohere, Experiential Labs, và provider động.
   ========================================================================== */

(function () {
  'use strict';

  // --- LOẠI PROVIDER ---
  const PROVIDER_TYPE = {
    GEMINI: 'gemini',
    OPENAI_COMPAT: 'openai_compat',
    EXPERIENTIAL_LABS: 'explabs',
  };

  // --- ICON / MÀU MẶC ĐỊNH ---
  const DEFAULT_PROVIDER_ICONS = {
    google: '🤖',
    nvidia: '🟢',
    openrouter: '🛰️',
    cohere: '🤝',
    explabs: '🌐',
  };

  // --- REGISTRY CHÍNH ---
  // Mỗi provider chứa: id, label, type, baseUrl, keyCount, keyPrefix, keyNamePrefix,
  // usagePrefix, extraHeaders, includeReasoning, unsupportedParams, reasoningEffortParam,
  // models (mảng object model metadata)
  const PROVIDER_REGISTRY = {
    google: {
      id: 'google',
      label: 'Google Gemini',
      type: PROVIDER_TYPE.GEMINI,
      baseUrl: '',
      keyCount: 10,
      keyPrefix: 'jarvis_api',
      keyNamePrefix: 'jarvis_api_name',
      usagePrefix: 'jarvis_api_usage',
      icon: '🤖',
      // Google models không dùng COMPAT_PROVIDERS/COMPAT_MODEL_OPTS
      // Chỉ định thinkingLevels + defaultThinking cho UI
      models: [
        {
          id: 'gemini-4-hydrogen',
          label: 'Gemini 4 Hydrogen',
          thinkingLevels: ['low', 'medium', 'high'],
          defaultThinking: 'high',
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          inputModalities: ['text', 'image', 'audio', 'video'],
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
        {
          id: 'gemini-3.6-flash',
          label: 'Gemini 3.6 Flash',
          thinkingLevels: ['minimal', 'low', 'medium', 'high'],
          defaultThinking: 'medium',
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          inputModalities: ['text', 'image', 'audio', 'video'],
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
        {
          id: 'gemini-3.8-flash',
          label: 'Gemini 3.8 Flash',
          thinkingLevels: ['low', 'medium', 'high'],
          defaultThinking: 'medium',
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          inputModalities: ['text', 'image', 'audio', 'video'],
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
        {
          id: 'gemini-3.5-flash-lite',
          label: 'Gemini 3.5 Flash Lite',
          thinkingLevels: ['minimal', 'low', 'medium', 'high'],
          defaultThinking: 'minimal',
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          inputModalities: ['text', 'image', 'audio', 'video'],
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
        {
          id: 'gemini-3.1-flash-lite',
          label: 'Gemini 3.1 Flash Lite',
          thinkingLevels: ['minimal', 'low', 'medium', 'high'],
          defaultThinking: 'minimal',
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          inputModalities: ['text', 'image', 'audio', 'video'],
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        },
      ],
    },

    nvidia: {
      id: 'nvidia',
      label: 'NVIDIA',
      type: PROVIDER_TYPE.OPENAI_COMPAT,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      keyCount: 3,
      keyPrefix: 'jarvis_nvidia_keys',
      keyNamePrefix: 'jarvis_nvidia_keys_name',
      usagePrefix: 'jarvis_nvidia_usage',
      icon: '🟢',
      extraHeaders: null,
      includeReasoning: false,
      unsupportedParams: [],
      reasoningEffortParam: 'reasoning_effort',
      models: [
        {
          id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
          label: 'Nemotron 3.5 Lightning 30B A3B',
          maxTokens: 65536,
          contextWindow: 1000000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text'],
          noReasoning: true,
          levels: [['none', 'Tắt (NVIDIA)']],
          defaultEffort: 'none',
        },
        {
          id: 'nvidia/nemotron-3.5-bolt-e4b',
          label: 'Nemotron 3.5 Bolt E4B',
          maxTokens: 65536,
          contextWindow: 1000000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text'],
          noReasoning: true,
          levels: [['none', 'Tắt (NVIDIA)']],
          defaultEffort: 'none',
        },
        {
          id: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
          label: 'Nemotron 3.5 Super VL 120B A12B',
          maxTokens: 1048576,
          contextWindow: 1048576,
          temperature: 0.6,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image', 'video'],
          nvThinking: { effort: true },
          levels: [
            ['high', 'High (Sâu)'],
            ['medium', 'Med (Chuẩn)'],
            ['low', 'Low (Thấp)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
        {
          id: 'nvidia/nemotron-3-ultra-550b-a55b',
          label: 'Nemotron 3 Ultra 550B A55B',
          maxTokens: 32768,
          contextWindow: 1048576,
          temperature: 0.6,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text'],
          nvThinking: {},
          levels: [
            ['high', 'Bật (mặc định)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
        {
          id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
          label: 'Nemotron 3 Nano Omni 30B A3B',
          maxTokens: 131072,
          contextWindow: 262144,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image', 'audio', 'video'],
          nvThinking: { budget: { minimal: 1024, low: 4096, medium: 8192, high: 16384 } },
          levels: [
            ['high', 'High (trần 16K)'],
            ['medium', 'Med (trần 8K)'],
            ['low', 'Low (trần 4K)'],
            ['minimal', 'Min (trần 1K)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
      ],
    },

    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      type: PROVIDER_TYPE.OPENAI_COMPAT,
      baseUrl: 'https://openrouter.ai/api/v1',
      keyCount: 5,
      keyPrefix: 'jarvis_openrouter_keys',
      keyNamePrefix: 'jarvis_openrouter_keys_name',
      usagePrefix: 'jarvis_openrouter_usage',
      icon: '🛰️',
      extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
      includeReasoning: true,
      unsupportedParams: [],
      reasoningEffortParam: 'reasoning_effort',
      models: [
        {
          id: 'nvidia/nemotron-3.5-lightning:free',
          label: 'Nemotron 3.5 Lightning (Free)',
          maxTokens: 65536,
          contextWindow: 1000000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text'],
          reasoningToggle: true,
          levels: [
            ['high', 'Bật (mặc định)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
        {
          id: 'nvidia/nemotron-3.5-super-vl:free',
          label: 'Nemotron 3.5 Super VL (Free)',
          maxTokens: 131072,
          contextWindow: 1000000,
          temperature: 0.6,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image', 'video'],
          reasoningToggle: true,
          levels: [
            ['high', 'Bật (mặc định)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
        {
          id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
          label: 'Nemotron 3 Nano Omni (Free)',
          maxTokens: 65536,
          contextWindow: 256000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image', 'audio', 'video'],
          reasoningBudgets: { minimal: 1024, low: 4096, medium: 8192, high: 16384 },
          levels: [
            ['high', 'High (~16K)'],
            ['medium', 'Med (~8K)'],
            ['low', 'Low (~4K)'],
            ['minimal', 'Min (~1K)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
        {
          id: 'particle-ai/particle-1:free',
          label: 'Particle-1 (Free)',
          maxTokens: 131072,
          contextWindow: 1048576,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image'],
          offEffort: 'none',
          efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
          defaultEffort: 'high',
        },
        {
          id: 'baidu/ernie-5.5-flash-preview:free',
          label: 'ERNIE-5.5-Flash (Free)',
          maxTokens: 921600,
          contextWindow: 1024000,
          apiMaxCompletionTokens: 921600,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text'],
          reasoningAlwaysOn: true,
          canDisable: false,
          efforts: ['high'],
          defaultEffort: 'high',
        },
      ],
    },

    cohere: {
      id: 'cohere',
      label: 'Cohere',
      type: PROVIDER_TYPE.OPENAI_COMPAT,
      baseUrl: 'https://api.cohere.ai/compatibility/v1',
      keyCount: 3,
      keyPrefix: 'jarvis_cohere_keys',
      keyNamePrefix: 'jarvis_cohere_keys_name',
      usagePrefix: 'jarvis_cohere_usage',
      icon: '🤝',
      extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
      includeReasoning: true,
      unsupportedParams: ['top_k', 'stream_options'],
      reasoningEffortParam: 'reasoning_effort',
      models: [
        {
          id: 'command-a-plus-05-2026',
          label: 'Command A+',
          maxTokens: 64000,
          contextWindow: 128000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image', 'video'],
          reasoningToggle: true,
          levels: [
            ['high', 'Bật (mặc định)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
        {
          id: 'command-a-reasoning-08-2025',
          label: 'Command A Reasoning',
          maxTokens: 32000,
          contextWindow: 256000,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text'],
          reasoningToggle: true,
          levels: [
            ['high', 'Bật (mặc định)'],
            ['none', 'Tắt'],
          ],
          defaultEffort: 'high',
        },
      ],
    },

    explabs: {
      id: 'explabs',
      label: 'Experiential Labs',
      type: PROVIDER_TYPE.EXPERIENTIAL_LABS,
      baseUrl: 'https://api.experiential.ai/v1',
      keyCount: 5,
      keyPrefix: 'jarvis_explabs_api',
      keyNamePrefix: 'jarvis_explabs_api_name',
      usagePrefix: 'jarvis_explabs_usage',
      icon: '🌐',
      extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
      includeReasoning: true,
      unsupportedParams: [],
      reasoningEffortParam: 'reasoning_effort',
      models: [
        {
          id: 'gpt-6-luna',
          label: 'GPT-6 Luna',
          maxTokens: 131072,
          contextWindow: 1048576,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image'],
          reasoning: true,
        },
        {
          id: 'deepseek-v4.1-flash',
          label: 'DeepSeek V4.1 Flash',
          maxTokens: 131072,
          contextWindow: 1048576,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image'],
          reasoning: true,
        },
        {
          id: 'qwen4-max:free',
          label: 'Qwen4 Max',
          maxTokens: 131072,
          contextWindow: 1048576,
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          inputModalities: ['text', 'image'],
          reasoning: true,
        },
      ],
    },
  };

  // --- HELPER FUNCTIONS ---

  // Lấy provider theo ID
  function getProvider(id) {
    return PROVIDER_REGISTRY[id] || null;
  }

  // Lấy tất cả provider (trừ built-in nếu cần)
  function getAllProviders(includeBuiltIn = true) {
    const providers = { ...PROVIDER_REGISTRY };
    if (!includeBuiltIn) {
      delete providers.google;
      delete providers.explabs;
    }
    return providers;
  }

  // Lấy model của provider
  function getProviderModels(providerId) {
    const p = getProvider(providerId);
    return p ? p.models : [];
  }

  // Tìm provider chứa model ID
  function findProviderByModelId(modelId) {
    for (const p of Object.values(PROVIDER_REGISTRY)) {
      if (p.models.some(m => m.id === modelId)) return p;
    }
    return null;
  }

  // Lấy metadata model (provider + model object)
  function getModelMeta(modelId) {
    for (const p of Object.values(PROVIDER_REGISTRY)) {
      const model = p.models.find(m => m.id === modelId);
      if (model) return { provider: p, model };
    }
    return null;
  }

  // Sinh COMPAT_PROVIDERS từ registry (dùng cho gateway OpenAI-compat)
  function buildCompatProviders() {
    const compat = {};
    for (const p of Object.values(PROVIDER_REGISTRY)) {
      if (p.type !== PROVIDER_TYPE.OPENAI_COMPAT) continue;
      const modelIds = p.models.map(m => m.id);
      compat[p.id] = {
        id: p.id,
        label: p.label,
        baseUrl: p.baseUrl,
        keyStorage: `${p.keyPrefix}_1`, // legacy compat
        keyNamePrefix: p.keyNamePrefix,
        keyStorageMultiple: (() => {
          const prefix = p.keyPrefix;
          const count = p.keyCount;
          return () => Array.from({ length: count }, (_, i) => `${prefix}_${i + 1}`);
        })(),
        keyCount: p.keyCount,
        keyIndexVar: `${p.id}KeyIndex`,
        keyLabel: p.label,
        getBaseUrl: () => p.baseUrl,
        models: modelIds,
        extraHeaders: p.extraHeaders,
        includeReasoning: p.includeReasoning,
        unsupportedParams: p.unsupportedParams,
        reasoningEffortParam: p.reasoningEffortParam,
        modelLabel: mId => {
          const m = p.models.find(m => m.id === mId);
          return m ? m.label : mId;
        },
      };
    }
    return compat;
  }

  // Sinh COMPAT_MODEL_OPTS từ registry
  function buildCompatModelOpts() {
    const opts = {};
    for (const p of Object.values(PROVIDER_REGISTRY)) {
      if (p.type !== PROVIDER_TYPE.OPENAI_COMPAT) continue;
      for (const m of p.models) {
        const o = { ...m };
        // Đảm bảo các field cần thiết cho COMPAT_MODEL_OPTS
        o.maxOutputTokens = o.maxOutputTokens || o.maxTokens;
        opts[m.id] = o;
      }
    }
    return opts;
  }

  // Lấy EXPLABS_MODELS
  function getExplabsModels() {
    const p = getProvider('explabs');
    return p ? p.models.map(m => m.id) : [];
  }

  // Sinh cfgMap cho api-keys.js / key-config-sync.js
  // Trả về mảng [elementId, storageKey, defaultValue]
  function buildCfgMap() {
    const map = [];
    for (const p of Object.values(PROVIDER_REGISTRY)) {
      if (p.type === PROVIDER_TYPE.GEMINI) continue; // Google keys handled separately
      if (p.type === PROVIDER_TYPE.EXPERIENTIAL_LABS) continue; // Explabs keys handled separately
      for (let i = 1; i <= p.keyCount; i++) {
        const keyId = `provider-key-${p.id}-${i}`;
        const nameId = `provider-key-name-${p.id}-${i}`;
        map.push([keyId, `${p.keyPrefix}_${i}`, '']);
        map.push([nameId, `${p.keyNamePrefix}_${i}`, '']);
      }
    }
    return map;
  }

  // Lấy key storage names cho provider
  function getProviderKeyStorageNames(providerId) {
    const p = getProvider(providerId);
    if (!p) return [];
    return Array.from({ length: p.keyCount }, (_, i) => `${p.keyPrefix}_${i + 1}`);
  }

  // Lấy usage prefix
  function getProviderUsagePrefix(providerId) {
    const p = getProvider(providerId);
    return p ? p.usagePrefix : `jarvis_provider_${providerId}_usage`;
  }

  // Kiểm tra provider có phải built-in không
  function isBuiltInProvider(id) {
    return id === 'google' || id === 'explabs';
  }

  // Lấy icon của provider
  function getProviderIcon(id) {
    const p = getProvider(id);
    return p ? p.icon : DEFAULT_PROVIDER_ICONS[id] || '📦';
  }

  // Xuất ra window
  window.PROVIDER_REGISTRY = PROVIDER_REGISTRY;
  window.PROVIDER_TYPE = PROVIDER_TYPE;
  window.getProvider = getProvider;
  window.getAllProviders = getAllProviders;
  window.getProviderModels = getProviderModels;
  window.findProviderByModelId = findProviderByModelId;
  window.getModelMeta = getModelMeta;
  window.buildCompatProviders = buildCompatProviders;
  window.buildCompatModelOpts = buildCompatModelOpts;
  window.getExplabsModels = getExplabsModels;
  window.buildCfgMap = buildCfgMap;
  window.getProviderKeyStorageNames = getProviderKeyStorageNames;
  window.getProviderUsagePrefix = getProviderUsagePrefix;
  window.isBuiltInProvider = isBuiltInProvider;
  window.getProviderIcon = getProviderIcon;
})();
