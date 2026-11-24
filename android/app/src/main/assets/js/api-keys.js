/* ==========================================================================
   Jarvis AI - API Keys Management (js/api-keys.js)
   Quản lý 10 Google API keys, validation, checking status và cấu hình ngoài.
   Load sau js/app.js (giữ proxy window.apiKeys/globalKeyIndex/liveKeyIndex/
   liveRetryCount để live.js & rag.js/translate.js đọc được).

   Single Source of Truth: provider-registry.js (nạp TRƯỚC file này)
   ========================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;
  const deobfuscateKey = k =>
    typeof window.deobfuscateKey === 'function' ? window.deobfuscateKey(k) : k;
  const showToast = (m, t) =>
    typeof window.showToast === 'function'
      ? window.showToast(m, t)
      : console.log(`[toast:${t}] ${m}`);

  // --- cfgMap từ PROVIDER_REGISTRY + config hệ thống ---
  // provider-registry.js export window.buildCfgMap() cho OpenAI-compat providers
  // System configs (global context, search engines, proxy, temperature) vẫn khai báo ở đây
  const SYSTEM_CFG_MAP = [
    ['global-context-input', 'jarvis_global_context'],
    ['tavily-key-input', 'tavily_api_key'],
    ['serper-key-input', 'serper_api_key'],
    ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
    ['web-extract-engine-input', 'web_extract_engine', 'auto'],
    ['nvidia-proxy-url', 'nvidia_proxy_url'],
    ['live-temperature', 'live_temperature', '0.7'],
    ['stall-timeout-input', 'jarvis_stall_timeout_sec', '45'],
    ['lite-fallback-input', 'jarvis_lite_fallback_sec', '8'],
  ];

  // Lấy cfgMap đầy đủ: system + dynamic providers
  function getFullCfgMap() {
    const providerMap = typeof window.buildCfgMap === 'function' ? window.buildCfgMap() : [];
    return [...SYSTEM_CFG_MAP, ...providerMap];
  }

  // Key counts từ PROVIDER_REGISTRY
  const getKeyCount = providerId => {
    const p = typeof window.getProvider === 'function' ? window.getProvider(providerId) : null;
    return p ? p.keyCount : 0;
  };
  const OR_KEY_COUNT = () => getKeyCount('openrouter');
  const EL_KEY_COUNT = () => getKeyCount('explabs');
  const NV_KEY_COUNT = () => getKeyCount('nvidia');
  const CO_KEY_COUNT = () => getKeyCount('cohere');

  // --- RENDER CONTAINERS (dynamic based on keyCount) ---

  // Google: luôn 10 keys
  const container = $('api-keys-container');
  if (container) {
    container.innerHTML = Array.from(
      { length: 10 },
      (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i + 1}</span>
        <input type="text" id="api-key-name-${i + 1}" placeholder="Tên gợi nhớ ${i + 1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Key ${i + 1} (Ví dụ: Gmail A, Key chính, Dự phòng...)">
        <input type="password" id="api-key-${i + 1}" placeholder="Google API Key ${i + 1} (AIzaSy...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Google AI Studio API Key vào đây">
        <span id="api-key-badge-${i + 1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;" title="Hạn ngạch hôm nay (20 RPD mỗi model)"><span style="color:#a855f7;">H4: 0/20</span> | <span style="color:#10b981;">3.6: 0/20</span> | <span style="color:#3b82f6;">3.8: 0/20</span></span>
      </div>
    `
    ).join('');
  }

  function renderOpenRouterKeysContainer() {
    const orContainer = $('openrouter-keys-container');
    if (!orContainer) return;
    const count = OR_KEY_COUNT();
    orContainer.innerHTML = Array.from(
      { length: count },
      (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i + 1}</span>
        <input type="text" id="openrouter-key-name-${i + 1}" placeholder="Tên gợi nhớ ${i + 1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho OpenRouter Key ${i + 1}">
        <input type="password" id="openrouter-key-${i + 1}" placeholder="OpenRouter API Key ${i + 1} (sk-or-v1...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán OpenRouter API Key vào đây">
        <span id="openrouter-key-badge-${i + 1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">OR: 0 req</span>
      </div>
    `
    ).join('');
  }

  function renderExplabsKeysContainer() {
    const elContainer = $('explabs-keys-container');
    if (!elContainer) return;
    const count = EL_KEY_COUNT();
    elContainer.innerHTML = Array.from(
      { length: count },
      (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i + 1}</span>
        <input type="text" id="explabs-key-name-${i + 1}" placeholder="Tên gợi nhớ ${i + 1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Experiential Labs Key ${i + 1}">
        <input type="password" id="explabs-key-${i + 1}" placeholder="Experiential Labs API Key ${i + 1} (xpl_...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Experiential Labs API Key vào đây">
        <span id="explabs-key-badge-${i + 1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">EL: 0 req</span>
      </div>
    `
    ).join('');
  }

  function renderNvidiaKeysContainer() {
    const nvContainer = $('nvidia-keys-container');
    if (!nvContainer) return;
    const count = NV_KEY_COUNT();
    nvContainer.innerHTML = Array.from(
      { length: count },
      (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i + 1}</span>
        <input type="text" id="nvidia-key-name-${i + 1}" placeholder="Tên gợi nhớ ${i + 1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho NVIDIA Key ${i + 1}">
        <input type="password" id="nvidia-key-${i + 1}" placeholder="NVIDIA API Key ${i + 1} (nvapi-...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán NVIDIA API Key vào đây">
        <span id="nvidia-key-badge-${i + 1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">NV: 0 req</span>
      </div>
    `
    ).join('');
  }

  function renderCohereKeysContainer() {
    const coContainer = $('cohere-keys-container');
    if (!coContainer) return;
    const count = CO_KEY_COUNT();
    coContainer.innerHTML = Array.from(
      { length: count },
      (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i + 1}</span>
        <input type="text" id="cohere-key-name-${i + 1}" placeholder="Tên gợi nhớ ${i + 1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Cohere Key ${i + 1}">
        <input type="password" id="cohere-key-${i + 1}" placeholder="Cohere API Key ${i + 1} (co-...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Cohere API Key vào đây">
        <span id="cohere-key-badge-${i + 1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">CO: 0 req</span>
      </div>
    `
    ).join('');
  }

  // Gọi render khi module load (DOM có thể chưa sẵn sàng, guard bằng if)
  renderOpenRouterKeysContainer();
  renderExplabsKeysContainer();
  renderNvidiaKeysContainer();
  renderCohereKeysContainer();

  // --- READ HELPERS ---
  const readRawKey = i =>
    (
      ls.getItem(`jarvis_api_${i}`) ||
      ls.getItem(`huanmu_api_${i}`) ||
      ls.getItem(`javiss_api_${i}`) ||
      ''
    ).trim();
  const readRawName = i =>
    (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || '').trim();

  function makeReadHelpers(providerId, keyPrefix, namePrefix, keyCount) {
    const readKey = i => (ls.getItem(`${keyPrefix}_${i}`) || '').trim();
    const readName = i => (ls.getItem(`${namePrefix}_${i}`) || '').trim();
    const findSlot = key => {
      if (!key) return 1;
      for (let i = 1; i <= keyCount; i++) {
        let k = readKey(i);
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        if (k === key) return i;
      }
      return 1;
    };
    return { readKey, readName, findSlot };
  }

  // Built-in providers: keyPrefix/namePrefix từ registry hoặc fallback
  const getProviderMeta = providerId => {
    const p = typeof window.getProvider === 'function' ? window.getProvider(providerId) : null;
    if (p) return p;
    // Fallback hardcoded (để tương thích ngược)
    const fallbacks = {
      openrouter: {
        keyPrefix: 'jarvis_openrouter_api',
        keyNamePrefix: 'jarvis_openrouter_api_name',
        keyCount: 5,
      },
      explabs: {
        keyPrefix: 'jarvis_explabs_api',
        keyNamePrefix: 'jarvis_explabs_api_name',
        keyCount: 5,
      },
      nvidia: {
        keyPrefix: 'jarvis_nvidia_api',
        keyNamePrefix: 'jarvis_nvidia_api_name',
        keyCount: 3,
      },
      cohere: {
        keyPrefix: 'jarvis_cohere_api',
        keyNamePrefix: 'jarvis_cohere_api_name',
        keyCount: 3,
      },
    };
    return fallbacks[providerId] || fallbacks.openrouter;
  };

  const OR_META = getProviderMeta('openrouter');
  const EL_META = getProviderMeta('explabs');
  const NV_META = getProviderMeta('nvidia');
  const CO_META = getProviderMeta('cohere');

  const {
    readKey: readRawOrKey,
    readName: readRawOrName,
    findSlot: findOpenRouterSlotIndexForKey,
  } = makeReadHelpers('openrouter', OR_META.keyPrefix, OR_META.keyNamePrefix, OR_META.keyCount);
  const {
    readKey: readRawElKey,
    readName: readRawElName,
    findSlot: findExplabsSlotIndexForKey,
  } = makeReadHelpers('explabs', EL_META.keyPrefix, EL_META.keyNamePrefix, EL_META.keyCount);
  const {
    readKey: readRawNvKey,
    readName: readRawNvName,
    findSlot: findNvidiaSlotIndexForKey,
  } = makeReadHelpers('nvidia', NV_META.keyPrefix, NV_META.keyNamePrefix, NV_META.keyCount);
  const {
    readKey: readRawCoKey,
    readName: readRawCoName,
    findSlot: findCohereSlotIndexForKey,
  } = makeReadHelpers('cohere', CO_META.keyPrefix, CO_META.keyNamePrefix, CO_META.keyCount);

  // --- SLOT SELECT GROUPS (dynamic from registry) ---
  const SLOT_SELECT_GROUPS = [
    {
      kind: 'openrouter',
      storage: 'jarvis_selected_openrouter_slot',
      count: OR_META.keyCount,
      readKey: readRawOrKey,
      readName: readRawOrName,
      ids: ['openrouter-key-select-settings'],
      icon: '🛰️',
      short: 'OR',
      usageFn: 'getOpenRouterUsageCount',
      indexVar: 'openRouterKeyIndex',
    },
    {
      kind: 'explabs',
      storage: 'jarvis_selected_explabs_slot',
      count: EL_META.keyCount,
      readKey: readRawElKey,
      readName: readRawElName,
      ids: ['explabs-key-select-settings'],
      icon: '⚡',
      short: 'EL',
      usageFn: 'getExplabsUsageCount',
      indexVar: 'explabsKeyIndex',
    },
    {
      kind: 'nvidia',
      storage: 'jarvis_selected_nvidia_slot',
      count: NV_META.keyCount,
      readKey: readRawNvKey,
      readName: readRawNvName,
      ids: ['nvidia-key-select-settings'],
      icon: '🟢',
      short: 'NV',
      usageFn: 'getNvidiaUsageCount',
      indexVar: 'nvidiaKeyIndex',
    },
    {
      kind: 'cohere',
      storage: 'jarvis_selected_cohere_slot',
      count: CO_META.keyCount,
      readKey: readRawCoKey,
      readName: readRawCoName,
      ids: ['cohere-key-select-settings'],
      icon: '🤝',
      short: 'CO',
      usageFn: 'getCohereUsageCount',
      indexVar: 'cohereKeyIndex',
    },
  ];

  function getSlotUsage(group, slot) {
    const fn = window[group.usageFn];
    return typeof fn === 'function' ? Number(fn(slot)) || 0 : 0;
  }

  function collectSlotKeys(group) {
    const list = [];
    for (let i = 1; i <= group.count; i++) {
      let k = group.readKey(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (k) list.push({ slot: i, key: k, name: group.readName(i) });
    }
    return list;
  }

  // Vẽ lại dropdown: mỗi ô hiển thị tên gợi nhớ + số lượt đã gọi, kèm gợi ý key kế tiếp khi xoay tua.
  function renderSlotSelects(group) {
    const keys = collectSlotKeys(group);
    const stored = ls.getItem(group.storage) || 'auto';
    const value =
      stored === 'auto' || keys.some(x => String(x.slot - 1) === stored) ? stored : 'auto';
    if (value !== stored) ls.setItem(group.storage, value);

    const options = keys
      .map(x => {
        const label = x.name
          ? `${x.name} (${x.key.substring(0, 5)}...)`
          : `${group.short} Key ${x.slot} (${x.key.substring(0, 5)}...)`;
        return `<option value="${x.slot - 1}">${group.icon} ${label} · ${getSlotUsage(group, x.slot)} req</option>`;
      })
      .join('');

    group.ids.forEach(id => {
      const sel = $(id);
      if (!sel) return;
      sel.innerHTML = '<option value="auto">🔄 Tự động xoay tua</option>' + options;
      sel.value = value;
      if (!sel.dataset.slotWired) {
        sel.dataset.slotWired = '1';
        sel.onchange = () => {
          ls.setItem(group.storage, sel.value);
          group.ids.forEach(otherId => {
            const other = $(otherId);
            if (other && other !== sel) other.value = sel.value;
          });
          renderSlotSelects(group);
        };
      }
    });
    renderKeyPoolMenu();
  }

  function refreshSlotKeySelects(kind) {
    SLOT_SELECT_GROUPS.forEach(g => {
      if (!kind || g.kind === kind) renderSlotSelects(g);
    });
  }

  // --- MENU KEY DÙNG CHUNG (sidebar) ---
  const KEY_POOL_MENUS = {
    google: { label: '🔑 Google API Key:', selectId: 'api-key-select', hintFn: googleKeyPoolHint },
    openrouter: {
      label: '🛰️ OpenRouter API Key:',
      selectId: 'openrouter-key-select-settings',
      hintFn: v => slotHint('openrouter', v),
    },
    explabs: {
      label: '⚡ Experiential Labs Key:',
      selectId: 'explabs-key-select-settings',
      hintFn: v => slotHint('explabs', v),
    },
    nvidia: {
      label: '🟢 NVIDIA API Key:',
      selectId: 'nvidia-key-select-settings',
      hintFn: v => slotHint('nvidia', v),
    },
    cohere: {
      label: '🤝 Cohere API Key:',
      selectId: 'cohere-key-select-settings',
      hintFn: v => slotHint('cohere', v),
    },
  };

  function activeKeyPoolKind() {
    const model = ($('model-select')?.value || '').trim();
    // 1. Ưu tiên provider từ optgroup của option đang chọn (data-provider)
    if (typeof window.DynamicProviders?.getSelectedModelProvider === 'function') {
      const providerFromSelect = window.DynamicProviders.getSelectedModelProvider();
      if (providerFromSelect) return providerFromSelect;
    }
    // 2. Fallback: resolveCompatProvider (dựa trên registry)
    const compat =
      typeof window.resolveCompatProvider === 'function'
        ? window.resolveCompatProvider(model)
        : null;
    if (compat && compat.provider) return compat.provider.id;
    // 3. Fallback: Explabs / Google
    const expModels = Array.isArray(window.EXPLABS_MODELS) ? window.EXPLABS_MODELS : [];
    return expModels.includes(model) ? 'explabs' : 'google';
  }

  function googleKeyPoolHint(value) {
    const slots = [];
    for (let i = 1; i <= 10; i++) if (readRawKey(i)) slots.push(i);
    if (!slots.length) return 'Chưa có key nào';
    if (value === 'auto') return `🔄 Tự động xoay tua · ${slots.length} Google Key`;
    const slot = parseInt(value, 10) + 1;
    const name = readRawName(slot);
    return `📌 Đang khóa vào Key #${slot}${name ? ' · ' + name : ''}`;
  }

  function slotHint(kind, value) {
    const group = SLOT_SELECT_GROUPS.find(g => g.kind === kind);
    if (!group) return 'Chưa có key nào';
    const keys = collectSlotKeys(group);
    if (!keys.length) return 'Chưa có key nào';
    if (value === 'auto') {
      const idx = (Number(window[group.indexVar]) || 0) % keys.length;
      return `🔄 Kế tiếp: Key #${keys[idx].slot} · ${getSlotUsage(group, keys[idx].slot)} req (${keys.length} key xoay)`;
    }
    const slot = parseInt(value, 10) + 1;
    return `📌 Đang khóa vào Key #${slot} · ${getSlotUsage(group, slot)} req`;
  }

  function renderKeyPoolMenu() {
    const sel = $('key-pool-select');
    if (!sel) return;
    const kind = activeKeyPoolKind();
    const pool = KEY_POOL_MENUS[kind] || KEY_POOL_MENUS.google;
    const label = $('key-pool-label');
    if (label) label.innerText = pool.label;
    if (!sel.dataset.wired) {
      sel.dataset.wired = '1';
      sel.onchange = () => {
        const target = $(KEY_POOL_MENUS[activeKeyPoolKind()]?.selectId);
        if (target) {
          target.value = sel.value;
          target.dispatchEvent(new Event('change'));
        } else if (kind === 'google') {
          // Google keys: store selection directly in localStorage
          ls.setItem('jarvis_selected_google_slot', sel.value);
        }
        renderKeyPoolMenu();
      };
    }

    if (kind === 'google') {
      // Google keys: build options from window.apiKeys
      const keys = Array.isArray(window.apiKeys) ? window.apiKeys : [];
      const stored = ls.getItem('jarvis_selected_google_slot') || 'auto';
      const value =
        stored === 'auto' || keys.some((_, i) => String(i) === stored) ? stored : 'auto';
      if (value !== stored) ls.setItem('jarvis_selected_google_slot', value);

      const options = keys
        .map((k, i) => {
          const n = ls.getItem(`jarvis_api_name_${i + 1}`) || '';
          const label = n
            ? `🔑 ${n} (${k.substring(0, 5)}...)`
            : `🔑 Key ${i + 1} (${k.substring(0, 5)}...)`;
          return `<option value="${i}">${label}</option>`;
        })
        .join('');

      if (sel.innerHTML !== '<option value="auto">🔄 Tự động xoay tua</option>' + options) {
        sel.innerHTML = '<option value="auto">🔄 Tự động xoay tua</option>' + options;
      }
      if ([...sel.options].some(o => o.value === value)) sel.value = value;

      const hint = $('key-pool-hint');
      if (hint) hint.innerText = googleKeyPoolHint(sel.value);
      return;
    }

    // Non-Google: copy from settings select
    const src = $(pool.selectId);
    if (!src) {
      sel.innerHTML = '';
      const hint = $('key-pool-hint');
      if (hint) hint.innerText = 'Chưa có key nào';
      return;
    }
    if (sel.innerHTML !== src.innerHTML) sel.innerHTML = src.innerHTML;
    if ([...sel.options].some(o => o.value === src.value)) sel.value = src.value;
    const hint = $('key-pool-hint');
    if (hint && pool.hintFn) hint.innerText = pool.hintFn(sel.value);
  }

  // --- VALIDATION UX CHO GOOGLE API KEY ---
  function validateGoogleKeyFormat(raw) {
    const k = String(raw || '').trim();
    if (!k) return { valid: false, empty: true, message: '' };
    if (k.startsWith('AIza') && k.length >= 35) {
      return { valid: true, empty: false, message: '✅ Định dạng hợp lệ (AIza…)' };
    }
    if (k.startsWith('AQ.') && k.length >= 20) {
      return { valid: true, empty: false, message: '✅ Định dạng hợp lệ (AQ.…)' };
    }
    if (/^(sk-|nvapi-|co-|xpl_|tvly-|serper)/i.test(k)) {
      return {
        valid: false,
        empty: false,
        message: '⚠️ Đây là key của nhà cung cấp khác — dán vào đúng ô bên dưới.',
      };
    }
    return {
      valid: false,
      empty: false,
      message: '⚠️ Key Google thường bắt đầu bằng "AIza" hoặc "AQ." — kiểm tra lại.',
    };
  }
  window.validateGoogleKeyFormat = validateGoogleKeyFormat;

  function applyKeyValidationHint(i) {
    const input = $(`api-key-${i}`);
    if (!input) return;
    const res = validateGoogleKeyFormat(input.value);
    input.setAttribute('aria-invalid', !res.valid && !res.empty ? 'true' : 'false');
    input.style.borderColor = res.empty ? '' : res.valid ? 'var(--success)' : '#f59e0b';

    const row = input.closest('.api-key-row');
    if (!row) return;
    row.style.flexWrap = 'wrap';
    let hint = $(`api-key-hint-${i}`);
    if (!hint) {
      hint = document.createElement('span');
      hint.id = `api-key-hint-${i}`;
      hint.className = 'key-validate-hint';
      hint.style.cssText =
        'flex:1 0 100%;margin-left:36px;font-size:0.68rem;font-weight:600;line-height:1.3;';
      hint.setAttribute('aria-live', 'polite');
      row.appendChild(hint);
    }
    hint.innerText = res.empty ? '' : res.message;
    hint.style.color = res.valid ? 'var(--success)' : '#f59e0b';
  }

  function wireGoogleKeyValidation() {
    for (let i = 1; i <= 10; i++) {
      const input = $(`api-key-${i}`);
      if (!input || input.dataset.validationWired === '1') continue;
      input.dataset.validationWired = '1';
      input.addEventListener('input', () => applyKeyValidationHint(i));
    }
    for (let i = 1; i <= 10; i++) applyKeyValidationHint(i);
  }

  // --- INIT API KEYS FROM LOCALSTORAGE ---
  function initAPIKeys() {
    const keys = [];
    for (let i = 1; i <= 10; i++) {
      let k = readRawKey(i);
      const n = readRawName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`jarvis_api_${i}`, k);
      }
      const el = $(`api-key-${i}`);
      if (el) el.value = k;
      const nameEl = $(`api-key-name-${i}`);
      if (nameEl) nameEl.value = n;
      if (k) keys.push(k);
    }
    // app.js giữ `let apiKeys` + proxy defineProperty → gán qua window để
    // live.js (assign bare) và rag.js/translate.js (window.apiKeys) đọc chung 1 array
    window.apiKeys = keys;
    window.globalKeyIndex = 0;
    window.liveKeyIndex = 0;
    window.liveRetryCount = 0;

    const s = $('key-status-msg');
    if (s) {
      s.innerText = keys.length ? `✅ Có ${keys.length} Google Key` : '⚠️ Chưa có Key';
      s.style.color = keys.length ? 'var(--success)' : 'var(--danger)';
    }
    const liveSel = $('live-key-select');
    if (liveSel) {
      const cur = liveSel.value;
      liveSel.innerHTML = '<option value="auto">🔄 Tự động xoay Key</option>';
      for (let i = 1; i <= 10; i++) {
        let k = readRawKey(i);
        const n = readRawName(i);
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        if (k) {
          const label = n
            ? `🔑 ${n} (${k.substring(0, 5)}...)`
            : `🔑 Key ${i} (${k.substring(0, 5)}...)`;
          liveSel.innerHTML += `<option value="${i - 1}">${label}</option>`;
        }
      }
      if ([...liveSel.options].some(o => o.value === cur)) liveSel.value = cur;
    }
    renderKeyPoolMenu();
    wireGoogleKeyValidation();
    if (typeof window.updateKeyQuotaUI === 'function') window.updateKeyQuotaUI();
  }

  // --- INIT OPENROUTER KEYS FROM LOCALSTORAGE ---
  function initOpenRouterKeys() {
    const keys = [];
    const count = OR_META.keyCount;
    for (let i = 1; i <= count; i++) {
      let k = readRawOrKey(i);
      const n = readRawOrName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`${OR_META.keyPrefix}_${i}`, k);
      }
      const el = $(`openrouter-key-${i}`);
      if (el) el.value = k;
      const nameEl = $(`openrouter-key-name-${i}`);
      if (nameEl) nameEl.value = n;
      if (k) keys.push(k);
    }
    window.openRouterKeys = keys;
    window.openRouterKeyIndex = 0;

    const s = $('openrouter-key-status-msg');
    if (s) {
      s.innerText = keys.length ? `✅ Có ${keys.length} OpenRouter Key` : '⚠️ Chưa có Key';
      s.style.color = keys.length ? 'var(--success)' : 'var(--danger)';
    }
    renderSlotSelects(SLOT_SELECT_GROUPS[0]);
    if (typeof window.updateOpenRouterQuotaUI === 'function') window.updateOpenRouterQuotaUI();
  }

  // --- INIT EXPERIENTIAL LABS KEYS FROM LOCALSTORAGE ---
  function initExplabsKeys() {
    // Di trú key đơn cũ (explabs_api_key) sang ô #1 nếu 5 ô còn trống
    let hasAnySlot = false;
    for (let i = 1; i <= EL_META.keyCount; i++) if (readRawElKey(i)) hasAnySlot = true;
    if (!hasAnySlot) {
      let legacy = (ls.getItem('explabs_api_key') || '').trim();
      if (legacy.startsWith('JVENC_') || legacy.startsWith('ENC_')) legacy = deobfuscateKey(legacy);
      if (legacy) {
        ls.setItem(`${EL_META.keyPrefix}_1`, legacy);
        ls.removeItem('explabs_api_key');
      }
    }

    const keys = [];
    for (let i = 1; i <= EL_META.keyCount; i++) {
      let k = readRawElKey(i);
      const n = readRawElName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`${EL_META.keyPrefix}_${i}`, k);
      }
      const el = $(`explabs-key-${i}`);
      if (el) el.value = k;
      const nameEl = $(`explabs-key-name-${i}`);
      if (nameEl) nameEl.value = n;
      if (k) keys.push(k);
    }
    window.explabsKeys = keys;
    window.explabsKeyIndex = 0;

    const s = $('explabs-key-status-msg');
    if (s) {
      s.innerText = keys.length ? `✅ Có ${keys.length} Experiential Labs Key` : '⚠️ Chưa có Key';
      s.style.color = keys.length ? 'var(--success)' : 'var(--danger)';
    }
    renderSlotSelects(SLOT_SELECT_GROUPS[1]);
    if (typeof window.updateExplabsQuotaUI === 'function') window.updateExplabsQuotaUI();
  }

  // --- INIT NVIDIA KEYS FROM LOCALSTORAGE ---
  function initNvidiaKeys() {
    // Di trú key đơn cũ (nvidia_api_key) sang ô #1 nếu 3 ô còn trống
    let hasAnySlot = false;
    for (let i = 1; i <= NV_META.keyCount; i++) if (readRawNvKey(i)) hasAnySlot = true;
    if (!hasAnySlot) {
      let legacy = (ls.getItem('nvidia_api_key') || '').trim();
      if (legacy.startsWith('JVENC_') || legacy.startsWith('ENC_')) legacy = deobfuscateKey(legacy);
      if (legacy) {
        ls.setItem(`${NV_META.keyPrefix}_1`, legacy);
        ls.removeItem('nvidia_api_key');
      }
    }

    const keys = [];
    for (let i = 1; i <= NV_META.keyCount; i++) {
      let k = readRawNvKey(i);
      const n = readRawNvName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`${NV_META.keyPrefix}_${i}`, k);
      }
      const el = $(`nvidia-key-${i}`);
      if (el) el.value = k;
      const nameEl = $(`nvidia-key-name-${i}`);
      if (nameEl) nameEl.value = n;
      if (k) keys.push(k);
    }
    window.nvidiaKeys = keys;
    window.nvidiaKeyIndex = 0;

    const s = $('nvidia-key-status-msg');
    if (s) {
      s.innerText = keys.length ? `✅ Có ${keys.length} NVIDIA Key` : '⚠️ Chưa có Key';
      s.style.color = keys.length ? 'var(--success)' : 'var(--danger)';
    }
    renderSlotSelects(SLOT_SELECT_GROUPS.find(g => g.kind === 'nvidia'));
    if (typeof window.updateNvidiaQuotaUI === 'function') window.updateNvidiaQuotaUI();
  }

  // --- INIT COHERE KEYS FROM LOCALSTORAGE ---
  function initCohereKeys() {
    const keys = [];
    for (let i = 1; i <= CO_META.keyCount; i++) {
      let k = readRawCoKey(i);
      const n = readRawCoName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`${CO_META.keyPrefix}_${i}`, k);
      }
      const el = $(`cohere-key-${i}`);
      if (el) el.value = k;
      const nameEl = $(`cohere-key-name-${i}`);
      if (nameEl) nameEl.value = n;
      if (k) keys.push(k);
    }
    window.cohereKeys = keys;
    window.cohereKeyIndex = 0;

    const s = $('cohere-key-status-msg');
    if (s) {
      s.innerText = keys.length ? `✅ Có ${keys.length} Cohere Key` : '⚠️ Chưa có Key';
      s.style.color = keys.length ? 'var(--success)' : 'var(--danger)';
    }
    renderSlotSelects(SLOT_SELECT_GROUPS.find(g => g.kind === 'cohere'));
    if (typeof window.updateCohereQuotaUI === 'function') window.updateCohereQuotaUI();
  }

  // --- INIT EXTERNAL CONFIGURATIONS ---
  function initExternalConfigs() {
    const cfgMap = getFullCfgMap();
    cfgMap.forEach(([id, k, def = '']) => {
      const el = $(id);
      if (el) {
        let val =
          ls.getItem(k) ||
          (k === 'jarvis_global_context'
            ? ls.getItem('huanmu_global_context') || ls.getItem('javiss_global_context') || ''
            : '') ||
          def;
        if (typeof val === 'string' && (val.startsWith('JVENC_') || val.startsWith('ENC_'))) {
          val = deobfuscateKey(val);
        }
        el.value = val;
      }
    });
    if ($('live-temp-val')) $('live-temp-val').innerText = ls.getItem('live_temperature') || '0.7';
    if ($('lite-fallback-enabled'))
      $('lite-fallback-enabled').checked = ls.getItem('jarvis_lite_fallback_enabled') !== 'false';
    if ($('live-toggle-search'))
      $('live-toggle-search').checked = ls.getItem('live_search_enabled') !== 'false';
    if ($('live-toggle-context'))
      $('live-toggle-context').checked = ls.getItem('live_context_enabled') !== 'false';
    if ($('hide-deepseek-thinking-checkbox')) {
      $('hide-deepseek-thinking-checkbox').checked =
        ls.getItem('jarvis_hide_deepseek_thinking') === 'true';
      $('hide-deepseek-thinking-checkbox').onchange = e => {
        ls.setItem('jarvis_hide_deepseek_thinking', e.target.checked ? 'true' : 'false');
      };
    }
  }

  // --- LIVE TEMPERATURE + GLOBAL CONTEXT INPUT LISTENERS ---
  const tempInput = $('live-temperature');
  if (tempInput) {
    tempInput.oninput = e => {
      if ($('live-temp-val')) $('live-temp-val').innerText = e.target.value;
    };
  }
  const ctxInput = $('global-context-input');
  if (ctxInput) {
    ctxInput.oninput = e => {
      ls.setItem('jarvis_global_context', e.target.value);
      ls.setItem('huanmu_global_context', e.target.value);
    };
  }

  // --- SAVE KEYS BUTTON HANDLER ---
  function handleSaveKeys() {
    // Google 10 keys
    for (let i = 1; i <= 10; i++) {
      const val = $(`api-key-${i}`)?.value.trim() || '';
      const nameVal = $(`api-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`jarvis_api_${i}`, val);
      ls.setItem(`huanmu_api_${i}`, val);
      ls.setItem(`jarvis_api_name_${i}`, nameVal);
      ls.setItem(`huanmu_api_name_${i}`, nameVal);
    }
    // System configs
    getFullCfgMap().forEach(([id, k]) => ls.setItem(k, $(id)?.value.trim() || ''));
    ls.setItem(
      'jarvis_lite_fallback_enabled',
      $('lite-fallback-enabled')?.checked ? 'true' : 'false'
    );
    ls.setItem('live_search_enabled', $('live-toggle-search')?.checked ? 'true' : 'false');
    ls.setItem('live_context_enabled', $('live-toggle-context')?.checked ? 'true' : 'false');
    ls.setItem(
      'jarvis_hide_deepseek_thinking',
      $('hide-deepseek-thinking-checkbox')?.checked ? 'true' : 'false'
    );

    // OpenRouter keys
    for (let i = 1; i <= OR_META.keyCount; i++) {
      const orVal = $(`openrouter-key-${i}`)?.value.trim() || '';
      const orName = $(`openrouter-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`${OR_META.keyPrefix}_${i}`, orVal);
      ls.setItem(`${OR_META.keyNamePrefix}_${i}`, orName);
    }
    // Experiential Labs keys
    for (let i = 1; i <= EL_META.keyCount; i++) {
      const elVal = $(`explabs-key-${i}`)?.value.trim() || '';
      const elName = $(`explabs-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`${EL_META.keyPrefix}_${i}`, elVal);
      ls.setItem(`${EL_META.keyNamePrefix}_${i}`, elName);
    }
    // NVIDIA keys
    for (let i = 1; i <= NV_META.keyCount; i++) {
      const nvVal = $(`nvidia-key-${i}`)?.value.trim() || '';
      const nvName = $(`nvidia-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`${NV_META.keyPrefix}_${i}`, nvVal);
      ls.setItem(`${NV_META.keyNamePrefix}_${i}`, nvName);
    }
    // Cohere keys
    for (let i = 1; i <= CO_META.keyCount; i++) {
      const coVal = $(`cohere-key-${i}`)?.value.trim() || '';
      const coName = $(`cohere-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`${CO_META.keyPrefix}_${i}`, coVal);
      ls.setItem(`${CO_META.keyNamePrefix}_${i}`, coName);
    }

    initAPIKeys();
    initExternalConfigs();
    initOpenRouterKeys();
    initExplabsKeys();
    initNvidiaKeys();
    initCohereKeys();

    // Đẩy ngay API key ngoài lên Cloud Gist
    if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
      window.JarvisSync.scheduleAutoSync(3000);
    }
    const badSlots = [];
    for (let i = 1; i <= 10; i++) {
      const v = $(`api-key-${i}`)?.value.trim() || '';
      if (!v) continue;
      if (!validateGoogleKeyFormat(v).valid) badSlots.push(i);
    }
    if (badSlots.length) {
      showToast(
        `Đã lưu! ⚠️ Google Key #${badSlots.join(', #')} sai định dạng — kiểm tra lại.`,
        'warning'
      );
    } else {
      showToast('Đã lưu cấu hình Google & Hệ thống!');
    }
  }

  // --- CHECK KEYS BUTTON HANDLER ---
  async function handleCheckKeys() {
    const b = $('btn-check-keys');
    b.innerText = '⏳ Đang kiểm tra...';
    b.disabled = true;
    const GoogleGenAI = window.GoogleGenAI;
    let ok = 0,
      leaked = 0,
      quota = 0,
      invalid = 0,
      tot = 0;
    const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

    for (let i = 1; i <= 10; i++) {
      const el = $(`api-key-${i}`),
        k = el?.value.trim();
      const nameEl = $(`api-key-name-${i}`);
      const kn = nameEl?.value.trim() || `Key ${i}`;
      if (!k) continue;
      tot++;
      try {
        await new GoogleGenAI({ apiKey: k }).models.generateContent({
          model: FLASH_LITE_MODEL,
          contents: 'hi',
          config: { maxOutputTokens: 1 },
        });
        el.style.border = '2px solid var(--success)';
        if (nameEl) nameEl.style.border = '2px solid var(--success)';
        el.title = `${kn}: ✅ Hoạt động tốt`;
        ok++;
      } catch (err) {
        const errStr = (err.message || String(err)).toLowerCase();
        if (
          errStr.includes('leak') ||
          errStr.includes('403') ||
          errStr.includes('permission_denied')
        ) {
          el.style.border = '2px solid #ef4444';
          if (nameEl) nameEl.style.border = '2px solid #ef4444';
          el.title = `${kn}: 🚫 BỊ GOOGLE KHÓA (Reported as leaked - 403). Cần xóa và tạo key mới!`;
          leaked++;
        } else if (
          errStr.includes('quota') ||
          errStr.includes('429') ||
          errStr.includes('rate') ||
          errStr.includes('resource_exhausted')
        ) {
          el.style.border = '2px solid #f59e0b';
          if (nameEl) nameEl.style.border = '2px solid #f59e0b';
          el.title = `${kn}: ⚠️ Hết Quota tạm thời (429). Key vẫn sống!`;
          quota++;
        } else {
          el.style.border = '2px solid var(--danger)';
          if (nameEl) nameEl.style.border = '2px solid var(--danger)';
          el.title = `${kn}: ❌ Lỗi (${err.message || 'Không hợp lệ'})`;
          invalid++;
        }
      }
    }
    b.innerText = '🔍 Kiểm tra Keys';
    b.disabled = false;

    let msg = `Hoạt động: ${ok}/${tot} Keys.`;
    if (leaked > 0) msg += ` 🚫 ${leaked} key bị Google khóa (Leaked 403).`;
    if (quota > 0) msg += ` ⚠️ ${quota} key hết quota tạm thời.`;
    showToast(msg, ok > 0 ? (leaked > 0 ? 'warning' : 'success') : 'danger');
  }

  async function handleCheckOpenRouterKeys() {
    const b = $('btn-check-openrouter-keys');
    if (!b) return;
    b.innerText = '⏳ Đang kiểm tra...';
    b.disabled = true;
    let ok = 0,
      invalid = 0,
      tot = 0;
    for (let i = 1; i <= OR_META.keyCount; i++) {
      const el = $(`openrouter-key-${i}`),
        k = el?.value.trim();
      const nameEl = $(`openrouter-key-name-${i}`);
      const kn = nameEl?.value.trim() || `OR Key ${i}`;
      if (!k) continue;
      tot++;
      try {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: 'Bearer ' + k },
        });
        if (res.ok) {
          el.style.border = '2px solid var(--success)';
          if (nameEl) nameEl.style.border = '2px solid var(--success)';
          el.title = `${kn}: ✅ Hoạt động tốt`;
          ok++;
        } else {
          el.style.border = '2px solid var(--danger)';
          if (nameEl) nameEl.style.border = '2px solid var(--danger)';
          el.title = `${kn}: ❌ Lỗi (HTTP ${res.status})`;
          invalid++;
        }
      } catch (err) {
        el.style.border = '2px solid var(--danger)';
        if (nameEl) nameEl.style.border = '2px solid var(--danger)';
        el.title = `${kn}: ❌ Lỗi (${err.message || 'Không hợp lệ'})`;
        invalid++;
      }
    }
    b.innerText = '🔍 Kiểm tra OpenRouter';
    b.disabled = false;
    showToast(
      `OpenRouter: Hoạt động ${ok}/${tot} Keys.${invalid ? ' ❌ ' + invalid + ' lỗi' : ''}`,
      ok > 0 ? 'success' : 'danger'
    );
  }

  function handleCheckOpenRouterDuplicates() {
    const m = {},
      dups = [];
    for (let i = 1; i <= OR_META.keyCount; i++) {
      const v = $(`openrouter-key-${i}`)?.value.trim();
      const kn = $(`openrouter-key-name-${i}`)?.value.trim() || `OR Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : (m[v] = kn);
    }
    showToast(
      dups.length ? `⚠️ OpenRouter trùng: ${dups.join(', ')}!` : '✅ OpenRouter không có key trùng.'
    );
  }

  function handleCheckNvidiaDuplicates() {
    const m = {},
      dups = [];
    for (let i = 1; i <= NV_META.keyCount; i++) {
      const v = $(`nvidia-key-${i}`)?.value.trim();
      const kn = $(`nvidia-key-name-${i}`)?.value.trim() || `NV Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : (m[v] = kn);
    }
    showToast(
      dups.length ? `⚠️ NVIDIA trùng: ${dups.join(', ')}!` : '✅ NVIDIA không có key trùng.'
    );
  }

  function handleCheckExplabsDuplicates() {
    const m = {},
      dups = [];
    for (let i = 1; i <= EL_META.keyCount; i++) {
      const v = $(`explabs-key-${i}`)?.value.trim();
      const kn = $(`explabs-key-name-${i}`)?.value.trim() || `EL Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : (m[v] = kn);
    }
    showToast(
      dups.length
        ? `⚠️ Experiential Labs trùng: ${dups.join(', ')}!`
        : '✅ Experiential Labs không có key trùng.'
    );
  }

  function handleCheckCohereDuplicates() {
    const m = {},
      dups = [];
    for (let i = 1; i <= CO_META.keyCount; i++) {
      const v = $(`cohere-key-${i}`)?.value.trim();
      const kn = $(`cohere-key-name-${i}`)?.value.trim() || `CO Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : (m[v] = kn);
    }
    showToast(
      dups.length ? `⚠️ Cohere trùng: ${dups.join(', ')}!` : '✅ Cohere không có key trùng.'
    );
  }

  // --- CHECK DUPLICATES BUTTON HANDLER ---
  function handleCheckDuplicates() {
    const m = {},
      dups = [];
    for (let i = 1; i <= 10; i++) {
      const v = $(`api-key-${i}`)?.value.trim();
      const kn = $(`api-key-name-${i}`)?.value.trim() || `Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : (m[v] = kn);
    }
    showToast(dups.length ? `⚠️ Phát hiện trùng: ${dups.join(', ')}!` : '✅ Không có key trùng.');
  }

  // Wiring buttons (guarded - chỉ chạy khi DOM đã có)
  const modelSelEl = $('model-select');
  if (modelSelEl) modelSelEl.addEventListener('change', () => renderKeyPoolMenu());

  const saveBtn = $('btn-save-keys');
  if (saveBtn) saveBtn.onclick = () => handleSaveKeys();
  const checkBtn = $('btn-check-keys');
  if (checkBtn) checkBtn.onclick = async () => await handleCheckKeys();
  const dupBtn = $('btn-check-duplicates');
  if (dupBtn) dupBtn.onclick = () => handleCheckDuplicates();
  const checkOrBtn = $('btn-check-openrouter-keys');
  if (checkOrBtn) checkOrBtn.onclick = async () => await handleCheckOpenRouterKeys();
  const dupOrBtn = $('btn-check-openrouter-duplicates');
  if (dupOrBtn) dupOrBtn.onclick = () => handleCheckOpenRouterDuplicates();
  const dupElBtn = $('btn-check-explabs-duplicates');
  if (dupElBtn) dupElBtn.onclick = () => handleCheckExplabsDuplicates();
  const dupNvBtn = $('btn-check-nvidia-duplicates');
  if (dupNvBtn) dupNvBtn.onclick = () => handleCheckNvidiaDuplicates();
  const dupCoBtn = $('btn-check-cohere-duplicates');
  if (dupCoBtn) dupCoBtn.onclick = () => handleCheckCohereDuplicates();

  // --- TEST NVIDIA CONNECTION ---
  async function testNvidiaConnection() {
    const s = $('nvidia-key-status-msg');
    const setMsg = (t, color) => {
      if (s) {
        s.innerText = t;
        s.style.color = color;
      }
    };
    const typedProxy = (($('nvidia-proxy-url') && $('nvidia-proxy-url').value) || '')
      .trim()
      .replace(/\/+$/, '');
    const base =
      typedProxy ||
      (window.COMPAT_PROVIDERS?.nvidia?.getBaseUrl
        ? window.COMPAT_PROVIDERS.nvidia.getBaseUrl()
        : '');
    let key = (ls.getItem(`${NV_META.keyPrefix}_1`) || '').trim();
    if (key.startsWith('JVENC_') || key.startsWith('ENC_')) key = deobfuscateKey(key);
    if (!key) return setMsg('❌ Chưa có NVIDIA Key ở ô #1', 'var(--danger)');
    setMsg('⏳ Đang kiểm tra proxy + key...', 'var(--text-muted)');
    const started = performance.now();
    try {
      const r = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nvidia/nemotron-3.5-bolt-e4b',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
          stream: false,
        }),
      });
      const ms = Math.round(performance.now() - started);
      if ([401, 403].includes(r.status)) {
        return setMsg(
          `❌ Proxy OK nhưng NVIDIA từ chối key (HTTP ${r.status}): key sai/hết hạn hoặc không có quyền. (${ms}ms)`,
          'var(--danger)'
        );
      }
      if (!r.ok)
        return setMsg(
          `❌ Kết nối được nhưng NVIDIA trả HTTP ${r.status} (${ms}ms)`,
          'var(--danger)'
        );
      return setMsg(`✅ Kết nối OK: proxy + key hợp lệ (${ms}ms)`, 'var(--success)');
    } catch (e) {
      return setMsg(
        `❌ Không kết nối được proxy: ${e.message}. Kiểm tra URL/mạng.`,
        'var(--danger)'
      );
    }
  }
  const testNvBtn = $('btn-test-nvidia');
  if (testNvBtn) testNvBtn.onclick = async () => await testNvidiaConnection();

  // --- PUBLIC API ---
  window.initAPIKeys = initAPIKeys;
  window.initExternalConfigs = initExternalConfigs;
  window.initOpenRouterKeys = initOpenRouterKeys;
  window.findOpenRouterSlotIndexForKey = findOpenRouterSlotIndexForKey;
  window.initExplabsKeys = initExplabsKeys;
  window.findExplabsSlotIndexForKey = findExplabsSlotIndexForKey;
  window.initNvidiaKeys = initNvidiaKeys;
  window.findNvidiaSlotIndexForKey = findNvidiaSlotIndexForKey;
  window.initCohereKeys = initCohereKeys;
  window.findCohereSlotIndexForKey = findCohereSlotIndexForKey;
  window.refreshSlotKeySelects = refreshSlotKeySelects;
  window.renderKeyPoolMenu = renderKeyPoolMenu;
  window.handleCheckExplabsDuplicates = handleCheckExplabsDuplicates;
  window.handleCheckNvidiaDuplicates = handleCheckNvidiaDuplicates;
  window.handleCheckCohereDuplicates = handleCheckCohereDuplicates;
  window.handleSaveKeys = handleSaveKeys;
  window.handleCheckKeys = handleCheckKeys;
  window.handleCheckDuplicates = handleCheckDuplicates;
  window.handleCheckOpenRouterKeys = handleCheckOpenRouterKeys;
  window.handleCheckOpenRouterDuplicates = handleCheckOpenRouterDuplicates;

  // Tự khởi tạo khi module chạy
  initAPIKeys();
  initExternalConfigs();
  initOpenRouterKeys();
  initExplabsKeys();
  initNvidiaKeys();
  initCohereKeys();
})();
