/* ==========================================================================
   Jarvis AI - Dynamic Provider & Model Management (js/dynamic-providers.js)
   Cho phép thêm/sửa/xóa Provider (tên, base URL, 5 ô API key) và Model
   (tên model, provider, max input/output, generation params) hoàn toàn
   qua giao diện UI, không cần sửa code. Lưu trong localStorage + sync Gist.
   ========================================================================== */

(function () {
  'use strict';

  const ls = window.ls || localStorage;
  const $ = id => document.getElementById(id);

  // --- STORAGE KEYS ---
  const STORAGE_KEYS = {
    PROVIDERS: 'jarvis_dynamic_providers',
    MODELS: 'jarvis_dynamic_models',
    PROVIDER_KEYS_PREFIX: 'jarvis_provider_',     // jarvis_provider_<providerId>_1..5
    PROVIDER_KEY_NAMES_PREFIX: 'jarvis_provider_<providerId>_name_', // jarvis_provider_<providerId>_name_1..5
    PROVIDER_USAGE_PREFIX: 'jarvis_provider_<providerId>_usage'    // usage counter per key
  };

  // --- DEFAULT STATIC PROVIDERS (fallback khi chưa có config động) ---
  // Dùng để seed lần đầu, sau đó toàn bộ quản lý qua dynamic config
  const DEFAULT_PROVIDERS = {
    google: {
      id: 'google',
      label: 'Google Gemini',
      type: 'gemini',
      baseUrl: '',
      keyCount: 10,
      keyPrefix: 'jarvis_api',
      keyNamePrefix: 'jarvis_api_name',
      models: [
        { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', thinkingLevels: ['low','medium','high'], defaultThinking: 'high' },
        { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', thinkingLevels: ['minimal','low','medium','high'], defaultThinking: 'medium' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', thinkingLevels: ['low','medium','high'], defaultThinking: 'medium' },
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', thinkingLevels: ['minimal','low','medium','high'], defaultThinking: 'minimal' },
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', thinkingLevels: ['minimal','low','medium','high'], defaultThinking: 'minimal' }
      ]
    },
    explabs: {
      id: 'explabs',
      label: 'Experiential Labs',
      type: 'openai_compat',
      baseUrl: 'https://api.experiential.ai/v1',
      keyCount: 5,
      keyPrefix: 'jarvis_explabs_api',
      keyNamePrefix: 'jarvis_explabs_api_name',
      extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
      includeReasoning: true,
      models: [
        { id: 'gpt-6-luna', label: 'GPT-6 Luna', reasoning: true },
        { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', reasoning: true },
        { id: 'qwen4-max:free', label: 'Qwen4 Max', reasoning: true }
      ]
    }
  };

  const DEFAULT_MODELS = {
    'nvidia/nemotron-3.5-lightning-30b-a3b': { provider: 'nvidia', label: 'Nemotron 3.5 Lightning 30B', maxTokens: 65536, contextWindow: 1000000, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text'], noReasoning: true },
    'nvidia/nemotron-3.5-bolt-e4b': { provider: 'nvidia', label: 'Nemotron 3.5 Bolt E4B', maxTokens: 65536, contextWindow: 1000000, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text'], noReasoning: true },
    'nvidia/nemotron-3.5-super-vl-120b-a12b': { provider: 'nvidia', label: 'Nemotron 3.5 Super VL 120B', maxTokens: 1048576, contextWindow: 1048576, temperature: 0.6, topP: 0.9, topK: 40, inputModalities: ['text','image','video'], nvThinking: { effort: true }, levels: [['high','High'],['medium','Med'],['low','Low'],['none','Tắt']], defaultEffort: 'high' },
    'nvidia/nemotron-3-ultra-550b-a55b': { provider: 'nvidia', label: 'Nemotron 3 Ultra 550B', maxTokens: 32768, contextWindow: 1048576, temperature: 0.6, topP: 0.9, topK: 40, inputModalities: ['text'], nvThinking: {}, levels: [['high','Bật'],['none','Tắt']], defaultEffort: 'high' },
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': { provider: 'nvidia', label: 'Nemotron 3 Nano Omni 30B', maxTokens: 131072, contextWindow: 262144, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text','image','audio','video'], nvThinking: { budget: { minimal: 1024, low: 4096, medium: 8192, high: 16384 } }, levels: [['high','High (16K)'],['medium','Med (8K)'],['low','Low (4K)'],['minimal','Min (1K)'],['none','Tắt']], defaultEffort: 'high' },
    'nvidia/nemotron-3.5-lightning:free': { provider: 'openrouter', label: 'Nemotron 3.5 Lightning (Free)', maxTokens: 65536, contextWindow: 1000000, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text'], reasoningToggle: true, levels: [['high','Bật'],['none','Tắt']], defaultEffort: 'high' },
    'nvidia/nemotron-3.5-super-vl:free': { provider: 'openrouter', label: 'Nemotron 3.5 Super VL (Free)', maxTokens: 131072, contextWindow: 1000000, temperature: 0.6, topP: 0.9, topK: 40, inputModalities: ['text','image','video'], reasoningToggle: true, levels: [['high','Bật'],['none','Tắt']], defaultEffort: 'high' },
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': { provider: 'openrouter', label: 'Nemotron 3 Nano Omni (Free)', maxTokens: 65536, contextWindow: 256000, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text','image','audio','video'], reasoningBudgets: { minimal: 1024, low: 4096, medium: 8192, high: 16384 }, levels: [['high','High (~16K)'],['medium','Med (~8K)'],['low','Low (~4K)'],['minimal','Min (~1K)'],['none','Tắt']], defaultEffort: 'high' },
    'particle-ai/particle-1:free': { provider: 'openrouter', label: 'Particle-1 (Free)', maxTokens: 131072, contextWindow: 1048576, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text','image'], offEffort: 'none', efforts: ['none','minimal','low','medium','high','xhigh','max','ultra'], defaultEffort: 'high' },
    'baidu/ernie-5.5-flash-preview:free': { provider: 'openrouter', label: 'ERNIE-5.5-Flash (Free)', maxTokens: 921600, contextWindow: 1024000, apiMaxCompletionTokens: 921600, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text'], reasoningAlwaysOn: true, canDisable: false, efforts: ['high'], defaultEffort: 'high' },
    'command-a-plus-05-2026': { provider: 'cohere', label: 'Command A+', maxTokens: 64000, contextWindow: 128000, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text','image','video'], reasoningToggle: true, levels: [['high','Bật'],['none','Tắt']], defaultEffort: 'high' },
    'command-a-reasoning-08-2025': { provider: 'cohere', label: 'Command A Reasoning', maxTokens: 32000, contextWindow: 256000, temperature: 0.7, topP: 0.9, topK: 40, inputModalities: ['text'], reasoningToggle: true, levels: [['high','Bật'],['none','Tắt']], defaultEffort: 'high' }
  };

  // --- HELPERS ---
  function generateId(prefix = 'prov') {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // --- PROVIDER MANAGEMENT ---
  function getProviders() {
    try {
      const data = ls.getItem(STORAGE_KEYS.PROVIDERS);
      if (data) return JSON.parse(data);
    } catch (e) { console.warn('[DynamicProviders] Lỗi đọc providers:', e); }
    return deepClone(DEFAULT_PROVIDERS);
  }

  function setProviders(providers) {
    ls.setItem(STORAGE_KEYS.PROVIDERS, JSON.stringify(providers));
    window.DYNAMIC_PROVIDERS = providers;
  }

  function getProvider(id) {
    const providers = getProviders();
    return providers[id] || null;
  }

  function addProvider(provider) {
    const providers = getProviders();
    const id = provider.id || generateId('prov');
    if (providers[id]) throw new Error('Provider ID đã tồn tại: ' + id);
    const newProvider = {
      id,
      label: provider.label || id,
      type: provider.type || 'openai_compat',
      baseUrl: provider.baseUrl || '',
      keyCount: Math.min(Math.max(provider.keyCount || 5, 1), 10),
      keyPrefix: provider.keyPrefix || `jarvis_provider_${id}_api`,
      keyNamePrefix: provider.keyNamePrefix || `jarvis_provider_${id}_name`,
      extraHeaders: provider.extraHeaders || null,
      includeReasoning: provider.includeReasoning !== false,
      unsupportedParams: provider.unsupportedParams || [],
      reasoningEffortParam: provider.reasoningEffortParam || 'reasoning_effort',
      models: []
    };
    providers[id] = newProvider;
    setProviders(providers);
    return newProvider;
  }

  function updateProvider(id, updates) {
    const providers = getProviders();
    if (!providers[id]) throw new Error('Provider không tồn tại: ' + id);
    const allowed = ['label', 'type', 'baseUrl', 'keyCount', 'extraHeaders', 'includeReasoning', 'unsupportedParams', 'reasoningEffortParam'];
    allowed.forEach(k => { if (updates[k] !== undefined) providers[id][k] = updates[k]; });
    if (updates.keyCount) providers[id].keyCount = Math.min(Math.max(updates.keyCount, 1), 10);
    setProviders(providers);
    return providers[id];
  }

  function deleteProvider(id) {
    const providers = getProviders();
    if (!providers[id]) return false;
    // Xóa key storage của provider này
    const prefix = providers[id].keyPrefix;
    const namePrefix = providers[id].keyNamePrefix;
    const keyCount = providers[id].keyCount;
    for (let i = 1; i <= keyCount; i++) {
      ls.removeItem(`${prefix}_${i}`);
      ls.removeItem(`${namePrefix}_${i}`);
    }
    // Xóa usage
    const usageKey = STORAGE_KEYS.PROVIDER_USAGE_PREFIX.replace('<providerId>', id);
    ls.removeItem(usageKey);
    delete providers[id];
    setProviders(providers);
    // Cần xóa model thuộc provider này
    const models = getModels();
    Object.keys(models).forEach(mid => {
      if (models[mid].provider === id) delete models[mid];
    });
    setModels(models);
    return true;
  }

  // --- MODEL MANAGEMENT ---
  // Internal storage uses composite key: "provider/modelId" to allow same model name across providers
  function makeModelKey(providerId, modelId) {
    return providerId + '/' + modelId;
  }

  function parseModelKey(key) {
    const idx = key.indexOf('/');
    if (idx < 0) return { provider: '', modelId: key };
    return { provider: key.slice(0, idx), modelId: key.slice(idx + 1) };
  }

  function getModels() {
    try {
      const data = ls.getItem(STORAGE_KEYS.MODELS);
      if (data) return JSON.parse(data);
    } catch (e) { console.warn('[DynamicProviders] Lỗi đọc models:', e); }
    // Migrate old format (flat modelId keys) to new composite format
    const oldModels = deepClone(DEFAULT_MODELS);
    const newModels = {};
    Object.entries(oldModels).forEach(([modelId, m]) => {
      const key = makeModelKey(m.provider, modelId);
      newModels[key] = { ...m, id: modelId };
    });
    return newModels;
  }

  function setModels(models) {
    ls.setItem(STORAGE_KEYS.MODELS, JSON.stringify(models));
    window.DYNAMIC_MODELS = models;
  }

  function getModelByKey(key) {
    const models = getModels();
    return models[key] || null;
  }

  function getModel(providerId, modelId) {
    return getModelByKey(makeModelKey(providerId, modelId));
  }

  function findModelById(modelId) {
    // Find model by user-facing ID across all providers (returns first match)
    const models = getModels();
    for (const [key, m] of Object.entries(models)) {
      if (m.id === modelId) return { key, model: m };
    }
    return null;
  }

  function addModel(model) {
    const models = getModels();
    const providerId = model.provider;
    const modelId = model.id;
    if (!modelId) throw new Error('Model ID là bắt buộc');
    if (!providerId) throw new Error('Provider là bắt buộc');
    const key = makeModelKey(providerId, modelId);
    if (models[key]) throw new Error('Model đã tồn tại trong provider này: ' + key);
    const provider = getProvider(providerId);
    if (!provider) throw new Error('Provider không tồn tại: ' + providerId);
    const newModel = {
      id: modelId,
      provider: providerId,
      label: model.label || modelId,
      maxTokens: model.maxTokens || 65536,
      contextWindow: model.contextWindow || 100000,
      temperature: model.temperature ?? 0.7,
      topP: model.topP ?? 0.9,
      topK: model.topK ?? 40,
      inputModalities: model.inputModalities || ['text'],
      // Reasoning / thinking config
      noReasoning: model.noReasoning || false,
      reasoningToggle: model.reasoningToggle || false,
      reasoningAlwaysOn: model.reasoningAlwaysOn || false,
      canDisable: model.canDisable !== false,
      reasoningBudgets: model.reasoningBudgets || null,
      nvThinking: model.nvThinking || null,
      offEffort: model.offEffort || null,
      efforts: model.efforts || null,
      levels: model.levels || null,
      defaultEffort: model.defaultEffort || 'high',
      apiMaxCompletionTokens: model.apiMaxCompletionTokens || null,
      notes: model.notes || ''
    };
    models[key] = newModel;
    setModels(models);
    return newModel;
  }

  function updateModel(key, updates) {
    const models = getModels();
    if (!models[key]) throw new Error('Model không tồn tại: ' + key);
    const allowed = ['label', 'provider', 'maxTokens', 'contextWindow', 'temperature', 'topP', 'topK', 'inputModalities',
      'noReasoning', 'reasoningToggle', 'reasoningAlwaysOn', 'canDisable', 'reasoningBudgets', 'nvThinking',
      'offEffort', 'efforts', 'levels', 'defaultEffort', 'apiMaxCompletionTokens', 'notes'];
    allowed.forEach(k => { if (updates[k] !== undefined) models[key][k] = updates[k]; });
    // Nếu đổi provider, kiểm tra provider mới tồn tại
    if (updates.provider && !getProvider(updates.provider)) throw new Error('Provider mới không tồn tại: ' + updates.provider);
    // Nếu đổi model id (id field), cần đổi key storage
    if (updates.id && updates.id !== models[key].id) {
      const newKey = makeModelKey(models[key].provider, updates.id);
      if (models[newKey]) throw new Error('Model ID mới đã tồn tại trong provider này: ' + newKey);
      models[newKey] = { ...models[key], id: updates.id };
      delete models[key];
      setModels(models);
      return models[newKey];
    }
    setModels(models);
    return models[key];
  }

  function deleteModel(key) {
    const models = getModels();
    if (!models[key]) return false;
    delete models[key];
    setModels(models);
    return true;
  }

  // --- KEY MANAGEMENT PER PROVIDER ---
  function getProviderKeyCount(providerId) {
    const p = getProvider(providerId);
    return p ? p.keyCount : 5;
  }

  function getProviderKeyPrefix(providerId) {
    const p = getProvider(providerId);
    return p ? p.keyPrefix : `jarvis_provider_${providerId}_api`;
  }

  function getProviderKeyNamePrefix(providerId) {
    const p = getProvider(providerId);
    return p ? p.keyNamePrefix : `jarvis_provider_${providerId}_name`;
  }

  function readProviderKey(providerId, slot) {
    const prefix = getProviderKeyPrefix(providerId);
    const raw = (ls.getItem(`${prefix}_${slot}`) || '').trim();
    if (raw.startsWith('JVENC_') || raw.startsWith('ENC_')) {
      return window.deobfuscateKey ? window.deobfuscateKey(raw) : raw;
    }
    return raw;
  }

  function readProviderKeyName(providerId, slot) {
    const prefix = getProviderKeyNamePrefix(providerId);
    return (ls.getItem(`${prefix}_${slot}`) || '').trim();
  }

  function writeProviderKey(providerId, slot, key, name) {
    const prefix = getProviderKeyPrefix(providerId);
    const namePrefix = getProviderKeyNamePrefix(providerId);
    ls.setItem(`${prefix}_${slot}`, key);
    ls.setItem(`${namePrefix}_${slot}`, name || '');
  }

  function getProviderKeysList(providerId, obfuscate = false) {
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyPrefix(providerId);
    return Array.from({ length: count }, (_, i) => {
      const raw = (ls.getItem(`${prefix}_${i + 1}`) || '').trim();
      let key = raw.startsWith('JVENC_') || raw.startsWith('ENC_') ? (window.deobfuscateKey ? window.deobfuscateKey(raw) : raw) : raw;
      return obfuscate && key ? (window.obfuscateKey ? window.obfuscateKey(key) : key) : key;
    });
  }

  function getProviderKeyNamesList(providerId) {
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyNamePrefix(providerId);
    return Array.from({ length: count }, (_, i) => (ls.getItem(`${prefix}_${i + 1}`) || '').trim());
  }

  function setProviderKeysList(providerId, keys, afterCb) {
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyPrefix(providerId);
    const namePrefix = getProviderKeyNamePrefix(providerId);
    if (!Array.isArray(keys)) return;
    for (let i = 1; i <= count; i++) {
      let key = (keys[i - 1] || '').trim();
      if (key.startsWith('JVENC_') || key.startsWith('ENC_')) key = window.deobfuscateKey ? window.deobfuscateKey(key) : key;
      ls.setItem(`${prefix}_${i}`, key);
      const input = $(`${prefix.replace('jarvis_', '')}-${i}`) || $(`provider-key-${providerId}-${i}`);
      if (input) input.value = key;
    }
    if (typeof afterCb === 'function') afterCb();
  }

  function setProviderKeyNamesList(providerId, names, afterCb) {
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyNamePrefix(providerId);
    if (!Array.isArray(names)) return;
    for (let i = 1; i <= count; i++) {
      const name = (names[i - 1] || '').trim();
      ls.setItem(`${prefix}_${i}`, name);
      const input = $(`${prefix.replace('jarvis_', '').replace('_name', '')}-name-${i}`) || $(`provider-key-name-${providerId}-${i}`);
      if (input) input.value = name;
    }
    if (typeof afterCb === 'function') afterCb();
  }

  // --- USAGE COUNTER PER PROVIDER ---
  function getProviderUsageKey(providerId) {
    return STORAGE_KEYS.PROVIDER_USAGE_PREFIX.replace('<providerId>', providerId);
  }

  function loadProviderUsage(providerId) {
    const key = getProviderUsageKey(providerId);
    try { return JSON.parse(ls.getItem(key) || '{}'); } catch { return {}; }
  }

  function saveProviderUsage(providerId, usage) {
    ls.setItem(getProviderUsageKey(providerId), JSON.stringify(usage));
  }

  function incrementProviderUsage(providerId, slot) {
    const usage = loadProviderUsage(providerId);
    usage[slot] = (usage[slot] || 0) + 1;
    saveProviderUsage(providerId, usage);
    // Trigger UI update
    if (window.updateProviderQuotaUI) window.updateProviderQuotaUI(providerId);
  }

  function getProviderUsageCount(providerId, slot) {
    const usage = loadProviderUsage(providerId);
    return usage[slot] || 0;
  }

  // --- BUILD RUNTIME REGISTRY (cho model-registry.js / app.js dùng) ---
  function buildRuntimeRegistry() {
    const providers = getProviders();
    const models = getModels(); // keyed by composite key "provider/modelId"

    // COMPAT_PROVIDERS cho gateway OpenAI-compatible
    const compatProviders = {};
    Object.values(providers).forEach(p => {
      if (p.type === 'gemini' || p.id === 'explabs') return; // Google + Experiential Labs không qua gateway OpenAI-compatible
      const keyPrefix = p.keyPrefix;
      const keyCount = p.keyCount;
      // Get model IDs for this provider (user-facing model IDs)
      const providerModelIds = Object.values(models)
        .filter(m => m.provider === p.id)
        .map(m => m.id);
      compatProviders[p.id] = {
        id: p.id,
        label: p.label,
        baseUrl: p.baseUrl,
        keyStorage: keyPrefix + '_1', // legacy compat
        // Trả tên các ô localStorage của provider (hoạt động với provider động
        // và cả NVIDIA/OpenRouter/Cohere sẵn có)
        keyStorageMultiple: (function (prefix, count) {
          return function () {
            return Array.from({ length: count }, (_, i) => `${prefix}_${i + 1}`);
          };
        })(keyPrefix, keyCount),
        keyCount: keyCount,
        keyIndexVar: `${p.id}KeyIndex`,
        keyLabel: p.label,
        getBaseUrl: typeof p.baseUrl === 'function' ? p.baseUrl : () => p.baseUrl,
        models: providerModelIds,
        extraHeaders: p.extraHeaders,
        includeReasoning: p.includeReasoning,
        unsupportedParams: p.unsupportedParams,
        reasoningEffortParam: p.reasoningEffortParam,
        modelLabel: mId => {
          // Find model by user-facing ID in this provider
          const m = Object.values(models).find(m => m.provider === p.id && m.id === mId);
          return m ? m.label : mId;
        }
      };
    });

    // COMPAT_MODEL_OPTS - keyed by user-facing model ID
    // If same model ID exists in multiple providers, last one wins (usually same model)
    const compatModelOpts = {};
    Object.values(models).forEach(m => {
      if (getProvider(m.provider)?.type === 'gemini') return; // Gemini dùng THINKING_LEVELS_BY_MODEL
      compatModelOpts[m.id] = {
        maxTokens: m.maxTokens,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxTokens,
        temperature: m.temperature,
        topP: m.topP,
        topK: m.topK,
        inputModalities: m.inputModalities,
        noReasoning: m.noReasoning,
        reasoningToggle: m.reasoningToggle,
        reasoningAlwaysOn: m.reasoningAlwaysOn,
        canDisable: m.canDisable,
        reasoningBudgets: m.reasoningBudgets,
        nvThinking: m.nvThinking,
        offEffort: m.offEffort,
        efforts: m.efforts,
        levels: m.levels,
        defaultEffort: m.defaultEffort,
        apiMaxCompletionTokens: m.apiMaxCompletionTokens,
        notes: m.notes
      };
    });

    // EXPLABS_MODELS
    const explabsProvider = providers.explabs;
    const explabsModels = explabsProvider ? Object.values(models).filter(m => m.provider === 'explabs').map(m => m.id) : [];

    // Also expose a map from composite key to model for internal use
    const modelsByCompositeKey = {};
    Object.entries(models).forEach(([key, m]) => {
      modelsByCompositeKey[key] = m;
    });

    return {
      providers,
      models: modelsByCompositeKey, // internal: composite key -> model
      compatProviders,
      compatModelOpts,
      explabsModels,
      flashLiteModel: 'gemini-3.5-flash-lite',
      auxFallbackModels: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
    };
  }

  // --- INIT / REBUILD ---
  function init() {
    // Ensure defaults exist
    if (!ls.getItem(STORAGE_KEYS.PROVIDERS)) setProviders(deepClone(DEFAULT_PROVIDERS));
    if (!ls.getItem(STORAGE_KEYS.MODELS)) setModels(deepClone(DEFAULT_MODELS));

    const registry = buildRuntimeRegistry();
    window.DYNAMIC_PROVIDERS = registry.providers;
    window.DYNAMIC_MODELS = registry.models;
    window.COMPAT_PROVIDERS = registry.compatProviders;
    window.COMPAT_MODEL_OPTS = registry.compatModelOpts;
    window.EXPLABS_MODELS = registry.explabsModels;
    window.FLASH_LITE_MODEL = registry.flashLiteModel;
    window.AUX_FALLBACK_MODELS = registry.auxFallbackModels;

    // Expose key arrays for ALL OpenAI-compatible providers (static + dynamic)
    // This enables the generic retry logic in app.js
    // Use same naming convention as api-keys.js for known static providers
    const keyVarMap = {
      nvidia: 'nvidiaKeys',
      openrouter: 'openRouterKeys',  // api-keys.js uses camelCase with capital R
      cohere: 'cohereKeys'
    };
    const keyIndexVarMap = {
      nvidia: 'nvidiaKeyIndex',
      openrouter: 'openRouterKeyIndex',
      cohere: 'cohereKeyIndex'
    };
    Object.values(registry.compatProviders).forEach(p => {
      const keyNames = p.keyStorageMultiple();
      const keys = keyNames.map(name => {
        let v = (ls.getItem(name) || '').trim();
        if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = window.deobfuscateKey ? window.deobfuscateKey(v) : v;
        return v;
      }).filter(Boolean);
      const varName = keyVarMap[p.id] || (p.id + 'Keys');
      const indexVarName = keyIndexVarMap[p.id] || p.keyIndexVar;
      window[varName] = keys;
      window[indexVarName] = 0;
    });

    // Rebuild model select options in UI
    rebuildModelSelect();

    // Nếu trang có bảng quản lý provider/model (Settings) thì vẽ ra
    setupDynamicProvidersUI();

    console.log('[DynamicProviders] Initialized:', Object.keys(registry.providers).length, 'providers,', Object.keys(registry.models).length, 'models');
    return registry;
  }

  function rebuildModelSelect() {
    const sel = $('model-select');
    if (!sel) return;
    const providers = getProviders();
    const models = getModels();

    // Preserve current value
    const currentValue = sel.value;

    // Build optgroups
    const groups = {};
    Object.values(models).forEach(m => {
      const p = providers[m.provider];
      if (!p) return;
      const groupLabel = p.label;
      if (!groups[groupLabel]) groups[groupLabel] = [];
      groups[groupLabel].push({ id: m.id, label: m.label });
    });

    // Google models always first (special handling)
    const googleProvider = providers.google;
    let html = '';
    if (googleProvider) {
      html += '<optgroup label="🤖 Google Gemini">';
      googleProvider.models.forEach(m => {
        html += `<option value="${m.id}">${m.label}</option>`;
      });
      html += '</optgroup>';
    }

    // Other providers
    Object.entries(groups).forEach(([label, list]) => {
      if (label === 'Google Gemini') return; // already done
      const icon = label.includes('NVIDIA') ? '🟢' : label.includes('OpenRouter') ? '🛰️' : label.includes('Cohere') ? '🤝' : label.includes('Experiential') ? '🌐' : '📦';
      html += `<optgroup label="${icon} ${label}">`;
      list.forEach(m => {
        html += `<option value="${m.id}">${m.label}</option>`;
      });
      html += '</optgroup>';
    });

    sel.innerHTML = html;
    // Restore value if still exists
    if ([...sel.options].some(o => o.value === currentValue)) sel.value = currentValue;

    // Trigger key pool menu refresh
    if (window.renderKeyPoolMenu) window.renderKeyPoolMenu();
  }

  // --- UI QUẢN LÝ PROVIDER / MODEL (trong Settings) ---

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function escapeHtmlAttr(text) {
    return String(text == null ? '' : text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dpToast(msg, type = 'info') {
    if (typeof showToast === 'function') showToast(msg, type);
    else console.log(`[DynamicProviders] ${msg}`);
  }

  function renderProviderKeyInputs(count, providerId) {
    const box = $('dp-provider-keys');
    if (!box) return;
    count = Math.max(1, Math.min(20, parseInt(count, 10) || 5));
    const prefixEl = $('dp-provider-keyprefix');
    const prefix = (prefixEl && prefixEl.value.trim()) ? prefixEl.value.trim() : `jarvis_provider_${providerId || 'new-provider'}_api`;
    let html = '';
    for (let i = 1; i <= count; i++) {
      const raw = (ls.getItem(`${prefix}_${i}`) || '').trim();
      let key = raw.startsWith('JVENC_') || raw.startsWith('ENC_') ? (window.deobfuscateKey ? window.deobfuscateKey(raw) : raw) : raw;
      html += `<div style="display:flex;gap:6px;align-items:center;margin:4px 0;">
        <span style="min-width:24px;text-align:center;font-size:0.72rem;color:var(--text-muted);">#${i}</span>
        <input type="password" id="dp-key-input-${escapeHtmlAttr(providerId)}-${i}" value="${escapeHtmlAttr(key)}" placeholder="API Key ${i}" class="modern-input" style="flex:1;font-size:0.8rem;padding:6px 8px;">
      </div>`;
    }
    box.innerHTML = html;
  }

  function renderProvidersList() {
    const box = $('dp-provider-list');
    if (!box) return;
    const providers = getProviders();
    let html = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><thead><tr style="text-align:left;"><th style="padding:6px;border-bottom:2px solid var(--border);">ID</th><th style="padding:6px;border-bottom:2px solid var(--border);">Nhãn</th><th style="padding:6px;border-bottom:2px solid var(--border);">Loại</th><th style="padding:6px;border-bottom:2px solid var(--border);">Base URL</th><th style="padding:6px;border-bottom:2px solid var(--border);">Key</th><th style="padding:6px;border-bottom:2px solid var(--border);text-align:center;">Hành động</th></tr></thead><tbody>';
    Object.values(providers).forEach(p => {
      const builtIn = p.id === 'google' || p.id === 'explabs';
      html += `<tr>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);font-family:monospace;font-size:0.78rem;">${escapeHtml(p.id)}${builtIn ? ' <span style="font-size:0.68rem;color:var(--text-muted);">(built-in)</span>' : ''}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${escapeHtml(p.label || p.id)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${p.type}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);font-size:0.78rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(String(p.baseUrl || ''))}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${p.keyCount}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);text-align:center;">
          ${builtIn ? '' : `<button class="dp-btn dp-btn-edit" data-id="${escapeHtmlAttr(p.id)}">Sửa</button> <button class="dp-btn dp-btn-del" data-id="${escapeHtmlAttr(p.id)}">Xoá</button>`}
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    box.innerHTML = html || '<p style="font-size:0.8rem;color:var(--text-muted);">Chưa có provider nào.</p>';

    box.querySelectorAll('.dp-btn-edit').forEach(btn => {
      btn.onclick = e => { const id = e.currentTarget.dataset.id; loadProviderIntoForm(id); };
    });
    box.querySelectorAll('.dp-btn-del').forEach(btn => {
      btn.onclick = e => { const id = e.currentTarget.dataset.id; if (confirm(`Xoá provider "${escapeHtml(id)}? Các model thuộc provider này cũng sẽ bị xoá.`)) { deleteProvider(id); dpToast('Đã xoá provider ' + escapeHtml(id), 'success'); renderAll(); window.DynamicProviders.init(); } };
    });
  }

  function renderModelsList() {
    const box = $('dp-model-list');
    if (!box) return;
    const providers = getProviders();
    const models = getModels(); // keyed by composite key "provider/modelId"
    let html = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><thead><tr style="text-align:left;"><th style="padding:6px;border-bottom:2px solid var(--border);">ID</th><th style="padding:6px;border-bottom:2px solid var(--border);">Nhãn</th><th style="padding:6px;border-bottom:2px solid var(--border);">Provider</th><th style="padding:6px;border-bottom:2px solid var(--border);">Max input</th><th style="padding:6px;border-bottom:2px solid var(--border);">Max output</th><th style="padding:6px;border-bottom:2px solid var(--border);text-align:center;">Hành động</th></tr></thead><tbody>';
    Object.entries(models).forEach(([compositeKey, m]) => {
      const p = providers[m.provider];
      // Show composite key in ID column for clarity
      const displayId = m.id;
      html += `<tr>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);font-family:monospace;font-size:0.78rem;">${escapeHtml(displayId)}<br><span style="font-size:0.65rem;color:var(--text-muted);">(${escapeHtml(compositeKey)})</span></td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${escapeHtml(m.label || m.id)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${p ? escapeHtml(p.label) : escapeHtml(m.provider)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${m.contextWindow || '-'}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);">${m.maxTokens || '-'}</td>
        <td style="padding:6px 4px;border-bottom:1px solid var(--border);text-align:center;">
          <button class="dp-btn dp-btn-edit" data-mkey="${escapeHtmlAttr(compositeKey)}">Sửa</button> <button class="dp-btn dp-btn-del" data-mkey="${escapeHtmlAttr(compositeKey)}">Xoá</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    box.innerHTML = html || '<p style="font-size:0.8rem;color:var(--text-muted);">Chưa có model nào.</p>';

    box.querySelectorAll('.dp-btn-edit').forEach(btn => {
      btn.onclick = e => { const mkey = e.currentTarget.dataset.mkey; loadModelIntoForm(mkey); };
    });
    box.querySelectorAll('.dp-btn-del').forEach(btn => {
      btn.onclick = e => { const mkey = e.currentTarget.dataset.mkey; if (confirm(`Xoá model "${escapeHtml(mkey)}"?`)) { deleteModel(mkey); dpToast('Đã xoá model ' + escapeHtml(mkey), 'success'); renderAll(); window.DynamicProviders.init(); } };
    });
  }

  function renderProviderTypeOptions() {
    const sel = $('dp-provider-type');
    if (!sel) return;
    sel.innerHTML = '<option value="openai_compat">OpenAI-compatible (gateway /chat/completions)</option>';
  }

  function renderProviderModelSelect() {
    const sel = $('dp-model-provider');
    if (!sel) return;
    const providers = getProviders();
    let html = '<option value="">-- Chọn provider --</option>';
    Object.values(providers).forEach(p => {
      html += `<option value="${escapeHtmlAttr(p.id)}">${escapeHtml(p.label || p.id)} (${escapeHtml(p.id)})</option>`;
    });
    sel.innerHTML = html;
  }

  let $dpEditProviderId = null;
  let $dpEditModelKey = null;

  function clearProviderForm() {
    ['dp-provider-id','dp-provider-label','dp-provider-baseurl','dp-provider-keyprefix'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    const elCnt = $('dp-provider-keycount'); if (elCnt) elCnt.value = 5;
    const elType = $('dp-provider-type'); if (elType) elType.value = 'openai_compat';
    const elBox = $('dp-provider-keys'); if (elBox) elBox.innerHTML = '';
    const elMsg = $('dp-provider-msg'); if (elMsg) elMsg.innerText = '';
    $dpEditProviderId = null;
    const elSave = $('dp-save-provider'); if (elSave) elSave.innerText = 'Lưu provider';
  }

  function loadProviderIntoForm(id) {
    const p = getProvider(id); if (!p) return;
    $('dp-provider-id').value = p.id;
    $('dp-provider-label').value = p.label || '';
    $('dp-provider-baseurl').value = p.baseUrl || '';
    $('dp-provider-type').value = p.type || 'openai_compat';
    $('dp-provider-keycount').value = p.keyCount || 5;
    $('dp-provider-keyprefix').value = p.keyPrefix || `jarvis_provider_${id}_api`;
    renderProviderKeyInputs(p.keyCount || 5, id);
    const elMsg = $('dp-provider-msg'); if (elMsg) elMsg.innerText = `Chỉnh sửa provider "${escapeHtml(id)}".`;
    $dpEditProviderId = id;
    const elSave = $('dp-save-provider'); if (elSave) elSave.innerText = 'Cập nhật provider';
  }

  function saveProviderFromUI() {
    const id = $('dp-provider-id')?.value.trim();
    const label = $('dp-provider-label')?.value.trim();
    const type = $('dp-provider-type')?.value.trim() || 'openai_compat';
    const baseUrl = $('dp-provider-baseurl')?.value.trim();
    const keyCount = Math.max(1, Math.min(20, parseInt($('dp-provider-keycount')?.value || '5', 10)));
    const keyPrefix = $('dp-provider-keyprefix')?.value.trim() || `jarvis_provider_${id}_api`;
    const keyNamePrefix = keyPrefix + '_name';
    if (!id || !label || !baseUrl) return dpToast('Vui lòng nhập ID, nhãn và Base URL', 'warning');
    if (!/^[a-z0-9_-]+$/.test(id)) return dpToast('ID chỉ được chứa chữ thường, số, gạch dưới và gạch ngang', 'warning');
    try {
      const updates = { label, type, baseUrl, keyCount, keyPrefix, keyNamePrefix };
      if ($dpEditProviderId) {
        if ($dpEditProviderId !== id && getProvider(id)) return dpToast(`Provider ID "${id}" đã tồn tại`, 'warning');
        updateProvider($dpEditProviderId, updates);
        if ($dpEditProviderId !== id) {
          deleteProvider($dpEditProviderId);
          addProvider({ id, label, type, baseUrl, keyCount, keyPrefix, keyNamePrefix });
        }
      } else {
        if (getProvider(id)) return dpToast(`Provider ID "${id}" đã tồn tại`, 'warning');
        addProvider({ id, label, type, baseUrl, keyCount, keyPrefix, keyNamePrefix });
      }
      for (let i = 1; i <= keyCount; i++) {
        const el = $(`dp-key-input-${escapeHtmlAttr(id)}-${i}`);
        const val = el ? el.value.trim() : '';
        if (val) writeProviderKey(id, i, val, '');
      }
      dpToast($dpEditProviderId ? 'Đã cập nhật provider' : 'Đã thêm provider', 'success');
      clearProviderForm();
      renderAll();
      // Refresh runtime registry so new provider's keys & models are available immediately
      window.DynamicProviders.init();
    } catch (e) {
      dpToast('Lỗi: ' + e.message, 'danger');
    }
  }

  function clearModelForm() {
    ['dp-model-id','dp-model-label','dp-model-provider','dp-model-maxin','dp-model-maxout','dp-model-params'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    const elBox = $('dp-model-modalities'); if (elBox) elBox.innerHTML = '';
    const elReasoning = $('dp-model-reasoning'); if (elReasoning) elReasoning.value = '';
    const elMsg = $('dp-model-msg'); if (elMsg) elMsg.innerText = '';
    $dpEditModelKey = null;
    const elSave = $('dp-save-model'); if (elSave) elSave.innerText = 'Lưu model';
  }

  function loadModelIntoForm(compositeKey) {
    const m = getModelByKey(compositeKey); if (!m) return;
    $('dp-model-id').value = m.id;
    $('dp-model-label').value = m.label || '';
    $('dp-model-provider').value = m.provider || '';
    $('dp-model-maxin').value = m.contextWindow || '';
    $('dp-model-maxout').value = m.maxTokens || '';
    $('dp-model-params').value = JSON.stringify({ temperature: m.temperature, topP: m.topP, topK: m.topK }, null, 2);
    const elBox = $('dp-model-modalities'); if (elBox) {
      elBox.innerHTML = ['text', 'image', 'audio', 'video'].map(mod =>
        `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:10px;font-size:0.8rem;"><input type="checkbox" value="${mod}" ${(m.inputModalities || ['text']).includes(mod) ? 'checked' : ''} style="width:14px;height:14px;">${mod}</label>`).join('');
    }
    const elReasoning = $('dp-model-reasoning'); if (elReasoning) {
      elReasoning.innerHTML = '<option value="">-- Mặc định --</option><option value="none">Không suy luận (noReasoning)</option><option value="toggle">Bật/tắt suy luận (reasoningToggle)</option><option value="always">Luôn suy luận (reasoningAlwaysOn)</option><option value="budget">Ngân sách suy luận (reasoningBudgets)</option>';
      elReasoning.value = '';
    }
    const elMsg = $('dp-model-msg'); if (elMsg) elMsg.innerText = `Chỉnh sửa model "${escapeHtml(compositeKey)}".`;
    $dpEditModelKey = compositeKey;
    const elSave = $('dp-save-model'); if (elSave) elSave.innerText = 'Cập nhật model';
  }

  function saveModelFromUI() {
    const id = $('dp-model-id')?.value.trim();
    const label = $('dp-model-label')?.value.trim();
    const provider = $('dp-model-provider')?.value.trim();
    const maxIn = parseInt($('dp-model-maxin')?.value || '0', 10) || undefined;
    const maxOut = parseInt($('dp-model-maxout')?.value || '0', 10) || undefined;
    let params = {};
    try { params = JSON.parse($('dp-model-params')?.value || '{}'); } catch { return dpToast('Tham số phải là JSON hợp lệ', 'warning'); }
    const modalities = [...($('dp-model-modalities')?.querySelectorAll('input:checked') || [])].map(cb => cb.value);
    const reasoning = $('dp-model-reasoning')?.value;
    if (!id || !label || !provider) return dpToast('Vui lòng nhập ID, nhãn và provider', 'warning');
    if (!getProvider(provider)) return dpToast('Provider chưa tồn tại', 'warning');
    try {
      const updates = { label, provider };
      if (maxIn) updates.contextWindow = maxIn;
      if (maxOut) updates.maxTokens = maxOut;
      if (params.temperature !== undefined) updates.temperature = params.temperature;
      if (params.topP !== undefined) updates.topP = params.topP;
      if (params.topK !== undefined) updates.topK = params.topK;
      if (modalities.length) updates.inputModalities = modalities;
      if (reasoning === 'none') updates.noReasoning = true;
      else if (reasoning === 'toggle') updates.reasoningToggle = true;
      else if (reasoning === 'always') updates.reasoningAlwaysOn = true;
      else if (reasoning === 'budget') {
        updates.reasoningBudgets = { minimal: 1024, low: 4096, medium: 8192, high: 16384 };
        updates.levels = [['high','Cao'],['medium','Trung bình'],['low','Thấp'],['minimal','Tối thiểu'],['none','Tắt']];
        updates.defaultEffort = 'high';
      }
      if ($dpEditModelKey) {
        const existing = getModelByKey($dpEditModelKey);
        const currentId = existing ? existing.id : '';
        if ($dpEditModelKey !== makeModelKey(provider, id) && getModel(provider, id)) return dpToast(`Model ID "${id}" đã tồn tại trong provider này`, 'warning');
        updateModel($dpEditModelKey, updates);
        // If model ID or provider changed, the updateModel function handles key change
      } else {
        if (getModel(provider, id)) return dpToast(`Model ID "${id}" đã tồn tại trong provider này`, 'warning');
        addModel({ id, label, provider, ...updates });
      }
      dpToast($dpEditModelKey ? 'Đã cập nhật model' : 'Đã thêm model', 'success');
      clearModelForm();
      renderAll();
      rebuildModelSelect();
      // Refresh runtime registry so new model is available immediately
      window.DynamicProviders.init();
    } catch (e) {
      dpToast('Lỗi: ' + e.message, 'danger');
    }
  }

  function renderAll() {
    renderProvidersList();
    renderModelsList();
    renderProviderModelSelect();
  }

  function setupDynamicProvidersUI() {
    if (!$('dp-provider-list')) return; // Trang này không có bảng quản lý provider/model
    renderProviderTypeOptions();
    renderProviderModelSelect();
    const onKeyChange = () => renderProviderKeyInputs($('dp-provider-id')?.value.trim() || 'new-provider', $('dp-provider-id')?.value.trim() || 'new-provider');
    const elCnt = $('dp-provider-keycount'); if (elCnt) elCnt.oninput = onKeyChange;
    const elPre = $('dp-provider-keyprefix'); if (elPre) elPre.oninput = onKeyChange;
    const elSaveP = $('dp-save-provider'); if (elSaveP) elSaveP.onclick = saveProviderFromUI;
    const elClearP = $('dp-clear-provider'); if (elClearP) elClearP.onclick = clearProviderForm;
    const elSaveM = $('dp-save-model'); if (elSaveM) elSaveM.onclick = saveModelFromUI;
    const elClearM = $('dp-clear-model'); if (elClearM) elClearM.onclick = clearModelForm;
    const elRebuild = $('dp-rebuild-select'); if (elRebuild) elRebuild.onclick = () => { rebuildModelSelect(); dpToast('Đã cập nhật danh sách model trong select', 'success'); };
    renderAll();
  }

  // --- EXPORT / IMPORT FOR BACKUP & SYNC ---
  function exportConfig(obfuscate = false) {
    const providers = getProviders();
    const models = getModels();
    const exportedProviders = {};
    const exportedModels = {};

    Object.entries(providers).forEach(([id, p]) => {
      exportedProviders[id] = { ...p };
      // Include keys + names
      const count = p.keyCount;
      const keyPrefix = p.keyPrefix;
      const namePrefix = p.keyNamePrefix;
      exportedProviders[id].keys = Array.from({ length: count }, (_, i) => {
        let key = (ls.getItem(`${keyPrefix}_${i + 1}`) || '').trim();
        if (key.startsWith('JVENC_') || key.startsWith('ENC_')) key = window.deobfuscateKey ? window.deobfuscateKey(key) : key;
        return obfuscate && key ? (window.obfuscateKey ? window.obfuscateKey(key) : key) : key;
      });
      exportedProviders[id].keyNames = Array.from({ length: count }, (_, i) =>
        (ls.getItem(`${namePrefix}_${i + 1}`) || '').trim()
      );
      // Usage
      exportedProviders[id].usage = loadProviderUsage(id);
    });

    Object.entries(models).forEach(([id, m]) => {
      exportedModels[id] = { ...m };
    });

    return { providers: exportedProviders, models: exportedModels };
  }

  function importConfig(data, { merge = true } = {}) {
    if (!data || typeof data !== 'object') return false;

    if (data.providers) {
      const currentProviders = merge ? getProviders() : {};
      Object.entries(data.providers).forEach(([id, p]) => {
        // Don't overwrite Google/Experiential Labs defaults unless forced
        if (merge && (id === 'google' || id === 'explabs') && currentProviders[id]) return;
        currentProviders[id] = p;
        // Restore keys
        if (p.keys && Array.isArray(p.keys)) {
          const count = p.keyCount || p.keys.length;
          const keyPrefix = p.keyPrefix || `jarvis_provider_${id}_api`;
          const namePrefix = p.keyNamePrefix || `jarvis_provider_${id}_name`;
          p.keys.forEach((key, i) => {
            if (i >= count) return;
            let k = key;
            if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = window.deobfuscateKey ? window.deobfuscateKey(k) : k;
            ls.setItem(`${keyPrefix}_${i + 1}`, k);
          });
          if (p.keyNames && Array.isArray(p.keyNames)) {
            p.keyNames.forEach((name, i) => {
              if (i >= count) return;
              const namePrefix = p.keyNamePrefix || `jarvis_provider_${id}_name`;
              ls.setItem(`${namePrefix}_${i + 1}`, name || '');
            });
          }
        }
        // Restore usage
        if (p.usage) saveProviderUsage(id, p.usage);
      });
      setProviders(currentProviders);
    }

    if (data.models) {
      const currentModels = merge ? getModels() : {};
      Object.entries(data.models).forEach(([id, m]) => {
        if (merge && currentModels[id]) return; // Keep local edits
        currentModels[id] = m;
      });
      setModels(currentModels);
    }

    // Rebuild runtime registry
    init();
    return true;
  }

  // --- MIGRATION FROM OLD STATIC CONFIG ---
  function migrateFromStatic() {
    // Called once to move from hardcoded COMPAT_PROVIDERS/COMPAT_MODEL_OPTS to dynamic
    const migrated = ls.getItem('jarvis_dynamic_migrated');
    if (migrated) return;

    const providers = getProviders();
    const models = getModels();

    // Add NVIDIA, OpenRouter, Cohere if not exist
    if (!providers.nvidia) {
      providers.nvidia = {
        id: 'nvidia', label: 'NVIDIA', type: 'openai_compat',
        baseUrl: 'https://integrate.api.nvidia.com/v1', keyCount: 3,
        keyPrefix: 'jarvis_nvidia_api', keyNamePrefix: 'jarvis_nvidia_api_name',
        extraHeaders: null, includeReasoning: true, unsupportedParams: [], reasoningEffortParam: 'reasoning_effort'
      };
    }
    if (!providers.openrouter) {
      providers.openrouter = {
        id: 'openrouter', label: 'OpenRouter', type: 'openai_compat',
        baseUrl: 'https://openrouter.ai/api/v1', keyCount: 5,
        keyPrefix: 'jarvis_openrouter_api', keyNamePrefix: 'jarvis_openrouter_api_name',
        extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
        includeReasoning: true, unsupportedParams: [], reasoningEffortParam: 'reasoning_effort'
      };
    }
    if (!providers.cohere) {
      providers.cohere = {
        id: 'cohere', label: 'Cohere', type: 'openai_compat',
        baseUrl: 'https://api.cohere.ai/compatibility/v1', keyCount: 3,
        keyPrefix: 'jarvis_cohere_api', keyNamePrefix: 'jarvis_cohere_api_name',
        extraHeaders: () => ({ 'HTTP-Referer': location.origin, 'X-Title': 'Jarvis AI' }),
        includeReasoning: true, unsupportedParams: ['top_k', 'stream_options'],
        reasoningEffortParam: 'reasoning_effort'
      };
    }
    setProviders(providers);

    // Models already in DEFAULT_MODELS cover all static ones
    // No need to add again since DEFAULT_MODELS is used as fallback

    ls.setItem('jarvis_dynamic_migrated', 'true');
    console.log('[DynamicProviders] Migrated from static config');
  }

  // --- PUBLIC API ---
  window.DynamicProviders = {
    // Provider
    getProviders,
    getProvider,
    addProvider,
    updateProvider,
    deleteProvider,
    // Model
    getModels,
    getModel,           // getModel(providerId, modelId) -> model
    getModelByKey,      // getModelByKey(compositeKey) -> model
    findModelById,      // findModelById(modelId) -> { key, model } | null
    makeModelKey,
    parseModelKey,
    addModel,
    updateModel,
    deleteModel,
    // Keys
    getProviderKeyCount,
    getProviderKeysList,
    getProviderKeyNamesList,
    readProviderKey,
    readProviderKeyName,
    writeProviderKey,
    setProviderKeysList,
    setProviderKeyNamesList,
    // Usage
    loadProviderUsage,
    saveProviderUsage,
    incrementProviderUsage,
    getProviderUsageCount,
    // Runtime registry
    buildRuntimeRegistry,
    init,
    rebuildModelSelect,
    // Backup/Sync
    exportConfig,
    importConfig,
    migrateFromStatic,
    // UI management (provider/model trong Settings)
    renderProvidersList,
    renderModelsList,
    renderAll,
    setupDynamicProvidersUI,
    clearProviderForm,
    loadProviderIntoForm,
    saveProviderFromUI,
    clearModelForm,
    loadModelIntoForm,
    saveModelFromUI
  };

  // Auto-init khi DOM ready (luôn chờ DOMContentLoaded: phải chạy SAU khi TẤT CẢ
  // module scripts — kể cả model-registry.js — đã xuất config tĩnh ra window,
  // tránh việc init() ghi đè registry tĩnh trước khi nó được sử dụng)
  document.addEventListener('DOMContentLoaded', () => {
    try {
      window.DynamicProviders.migrateFromStatic();
      window.DynamicProviders.init();
    } catch (e) {
      console.error('[DynamicProviders] init failed', e);
    }
  }, { once: true });

})();