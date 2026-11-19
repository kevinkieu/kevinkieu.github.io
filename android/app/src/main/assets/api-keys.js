/* ==========================================================================
   Jarvis AI - API Keys Management (js/api-keys.js)
   Quản lý 10 Google API keys, validation, checking status và cấu hình ngoài.
   Load sau js/app.js (giữ proxy window.apiKeys/globalKeyIndex/liveKeyIndex/
   liveRetryCount để live.js & rag.js/translate.js đọc được).
   ========================================================================== */
(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;
  const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;
  const showToast = (m, t) => (typeof window.showToast === 'function') ? window.showToast(m, t) : console.log(`[toast:${t}] ${m}`);
  const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';
  const AUX_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

  const cfgMap = [
    ['global-context-input', 'jarvis_global_context'],
    ['tavily-key-input', 'tavily_api_key'],
    ['serper-key-input', 'serper_api_key'],
    ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
    ['web-extract-engine-input', 'web_extract_engine', 'auto'],
    ['nvidia-proxy-url', 'nvidia_proxy_url'],
    ['live-temperature', 'live_temperature', '0.7']
  ];

  const OR_KEY_COUNT = 5;
  const EL_KEY_COUNT = 5;
  const NV_KEY_COUNT = 3;

  // Render container 10 dòng API keys (giữ nguyên template từ app.js)
  const container = $('api-keys-container');
  if (container) {
    container.innerHTML = Array.from({ length: 10 }, (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i+1}</span>
        <input type="text" id="api-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Key ${i+1} (Ví dụ: Gmail A, Key chính, Dự phòng...)">
        <input type="password" id="api-key-${i+1}" placeholder="Google API Key ${i+1} (AIzaSy...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Google AI Studio API Key vào đây">
        <span id="api-key-badge-${i+1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;" title="Hạn ngạch hôm nay (20 RPD mỗi model)"><span style="color:#a855f7;">H4: 0/20</span> | <span style="color:#10b981;">3.6: 0/20</span> | <span style="color:#3b82f6;">3.8: 0/20</span></span>
      </div>
    `).join('');
  }

  // Render container 5 dòng OpenRouter API keys (xoay tua)
  const orContainer = $('openrouter-keys-container');
  if (orContainer) {
    orContainer.innerHTML = Array.from({ length: OR_KEY_COUNT }, (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i+1}</span>
        <input type="text" id="openrouter-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho OpenRouter Key ${i+1}">
        <input type="password" id="openrouter-key-${i+1}" placeholder="OpenRouter API Key ${i+1} (sk-or-v1-...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán OpenRouter API Key vào đây">
        <span id="openrouter-key-badge-${i+1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">OR: 0 req</span>
      </div>
    `).join('');
  }

  // Render container 5 dòng Experiential Labs API keys (xoay tua)
  const elContainer = $('explabs-keys-container');
  if (elContainer) {
    elContainer.innerHTML = Array.from({ length: EL_KEY_COUNT }, (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i+1}</span>
        <input type="text" id="explabs-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Experiential Labs Key ${i+1}">
        <input type="password" id="explabs-key-${i+1}" placeholder="Experiential Labs API Key ${i+1} (xpl_...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Experiential Labs API Key vào đây">
        <span id="explabs-key-badge-${i+1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">EL: 0 req</span>
      </div>
    `).join('');
  }

  // Render container 3 dòng NVIDIA API keys (xoay tua)
  const nvContainer = $('nvidia-keys-container');
  if (nvContainer) {
    nvContainer.innerHTML = Array.from({ length: NV_KEY_COUNT }, (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i+1}</span>
        <input type="text" id="nvidia-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho NVIDIA Key ${i+1}">
        <input type="password" id="nvidia-key-${i+1}" placeholder="NVIDIA API Key ${i+1} (nvapi-...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán NVIDIA API Key vào đây">
        <span id="nvidia-key-badge-${i+1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;">NV: 0 req</span>
      </div>
    `).join('');
  }

  // Đọc key + tên từ localStorage (hỗ trợ 3 bộ key cũ: jarvis_/huanmu_/javiss_)
  const readRawKey = i => (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || "").trim();
  const readRawName = i => (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || "").trim();
  const readRawOrKey = i => (ls.getItem(`jarvis_openrouter_api_${i}`) || "").trim();
  const readRawOrName = i => (ls.getItem(`jarvis_openrouter_api_name_${i}`) || "").trim();
  const readRawElKey = i => (ls.getItem(`jarvis_explabs_api_${i}`) || "").trim();
  const readRawElName = i => (ls.getItem(`jarvis_explabs_api_name_${i}`) || "").trim();
  const readRawNvKey = i => (ls.getItem(`jarvis_nvidia_api_${i}`) || "").trim();
  const readRawNvName = i => (ls.getItem(`jarvis_nvidia_api_name_${i}`) || "").trim();

  // Tìm số thứ tự ô (1..5) của một Experiential Labs key (giống OpenRouter/Google)
  const findExplabsSlotIndexForKey = key => {
    if (!key) return 1;
    for (let i = 1; i <= EL_KEY_COUNT; i++) {
      let k = readRawElKey(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (k === key) return i;
    }
    return 1;
  };

  // Tìm số thứ tự ô (1..3) của một NVIDIA key (giống OpenRouter/Experiential Labs)
  const findNvidiaSlotIndexForKey = key => {
    if (!key) return 1;
    for (let i = 1; i <= NV_KEY_COUNT; i++) {
      let k = readRawNvKey(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (k === key) return i;
    }
    return 1;
  };

  // Tìm số thứ tự ô (1..5) của một OpenRouter key — giống findSlotIndexForKey của Google,
  // để key thứ N sau khi lọc bỏ ô trống vẫn được đếm đúng vào ô ban đầu.
  const findOpenRouterSlotIndexForKey = key => {
    if (!key) return 1;
    for (let i = 1; i <= OR_KEY_COUNT; i++) {
      let k = readRawOrKey(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (k === key) return i;
    }
    return 1;
  };

  // --- KEY POOL SELECTS (sidebar + Cài đặt) ---
  // Hai bộ chọn cùng đọc/ghi 1 giá trị trong localStorage nên luôn đồng bộ.
  const SLOT_SELECT_GROUPS = [
    {
      kind: 'openrouter', storage: 'jarvis_selected_openrouter_slot',
      count: OR_KEY_COUNT, readKey: readRawOrKey, readName: readRawOrName,
      ids: ['openrouter-key-select', 'openrouter-key-select-settings'],
      hintId: 'openrouter-next-key', icon: '🛰️', short: 'OR',
      usageFn: 'getOpenRouterUsageCount', indexVar: 'openRouterKeyIndex'
    },
    {
      kind: 'explabs', storage: 'jarvis_selected_explabs_slot',
      count: EL_KEY_COUNT, readKey: readRawElKey, readName: readRawElName,
      ids: ['explabs-key-select', 'explabs-key-select-settings'],
      hintId: 'explabs-next-key', icon: '⚡', short: 'EL',
      usageFn: 'getExplabsUsageCount', indexVar: 'explabsKeyIndex'
    },
    {
      kind: 'nvidia', storage: 'jarvis_selected_nvidia_slot',
      count: NV_KEY_COUNT, readKey: readRawNvKey, readName: readRawNvName,
      ids: ['nvidia-key-select', 'nvidia-key-select-settings'],
      hintId: 'nvidia-next-key', icon: '🟢', short: 'NV',
      usageFn: 'getNvidiaUsageCount', indexVar: 'nvidiaKeyIndex'
    }
  ];

  function getSlotUsage(group, slot) {
    const fn = window[group.usageFn];
    return typeof fn === 'function' ? (Number(fn(slot)) || 0) : 0;
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
    const value = (stored === 'auto' || keys.some(x => String(x.slot - 1) === stored)) ? stored : 'auto';
    if (value !== stored) ls.setItem(group.storage, value);

    const options = keys.map(x => {
      const label = x.name ? `${x.name} (${x.key.substring(0, 5)}...)` : `${group.short} Key ${x.slot} (${x.key.substring(0, 5)}...)`;
      return `<option value="${x.slot - 1}">${group.icon} ${label} · ${getSlotUsage(group, x.slot)} req</option>`;
    }).join('');

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

    const hint = $(group.hintId);
    if (hint) {
      if (!keys.length) {
        hint.innerText = 'Chưa có key nào';
      } else if (value === 'auto') {
        const idx = (Number(window[group.indexVar]) || 0) % keys.length;
        hint.innerText = `🔄 Kế tiếp: Key #${keys[idx].slot} · ${getSlotUsage(group, keys[idx].slot)} req (${keys.length} key xoay)`;
      } else {
        const slot = parseInt(value, 10) + 1;
        hint.innerText = `📌 Đang khóa vào Key #${slot} · ${getSlotUsage(group, slot)} req`;
      }
    }
    renderKeyPoolMenu();
  }

  function refreshSlotKeySelects(kind) {
    SLOT_SELECT_GROUPS.forEach(g => { if (!kind || g.kind === kind) renderSlotSelects(g); });
  }

  // --- MENU KEY DÙNG CHUNG (sidebar) ---
  // 4 bể key vốn có 4 menu riêng; nay gộp thành 1 menu tự đổi danh sách key theo nền tảng
  // của model đang chọn. Các <select> gốc vẫn tồn tại (ẩn) vì app.js/quota.js đọc trực tiếp id.
  const KEY_POOL_MENUS = {
    google: { label: '🔑 Google API Key:', selectId: 'api-key-select' },
    openrouter: { label: '🛰️ OpenRouter API Key:', selectId: 'openrouter-key-select', hintId: 'openrouter-next-key' },
    explabs: { label: '⚡ Experiential Labs Key:', selectId: 'explabs-key-select', hintId: 'explabs-next-key' },
    nvidia: { label: '🟢 NVIDIA API Key:', selectId: 'nvidia-key-select', hintId: 'nvidia-next-key' }
  };

  // Nền tảng của model đang chọn: nvidia/openrouter (registry gateway), explabs, còn lại là Google
  function activeKeyPoolKind() {
    const model = ($('model-select')?.value || '').trim();
    const compat = (typeof window.resolveCompatProvider === 'function') ? window.resolveCompatProvider(model) : null;
    if (compat && compat.provider) return compat.provider.id;
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

  function renderKeyPoolMenu() {
    const sel = $('key-pool-select');
    if (!sel) return;
    const pool = KEY_POOL_MENUS[activeKeyPoolKind()] || KEY_POOL_MENUS.google;
    const src = $(pool.selectId);
    const label = $('key-pool-label');
    if (label) label.innerText = pool.label;
    if (!sel.dataset.wired) {
      sel.dataset.wired = '1';
      sel.onchange = () => {
        // Ghi lựa chọn vào đúng select gốc của nền tảng để logic xoay tua/lưu phiên chạy như cũ
        const target = $(KEY_POOL_MENUS[activeKeyPoolKind()]?.selectId || KEY_POOL_MENUS.google.selectId);
        if (!target) return;
        target.value = sel.value;
        target.dispatchEvent(new Event('change'));
        renderKeyPoolMenu();
      };
    }
    const hint = $('key-pool-hint');
    if (!src) {
      sel.innerHTML = '';
      if (hint) hint.innerText = 'Chưa có key nào';
      return;
    }
    if (sel.innerHTML !== src.innerHTML) sel.innerHTML = src.innerHTML;
    if ([...sel.options].some(o => o.value === src.value)) sel.value = src.value;
    if (hint) {
      const hintEl = pool.hintId ? $(pool.hintId) : null;
      hint.innerText = hintEl ? hintEl.innerText : googleKeyPoolHint(sel.value);
    }
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
      s.innerText = keys.length ? `✅ Có ${keys.length} Google Key` : "⚠️ Chưa có Key";
      s.style.color = keys.length ? "var(--success)" : "var(--danger)";
    }
    [$('api-key-select'), $('live-key-select')].forEach(d => {
      if (!d) return;
      const cur = d.value;
      d.innerHTML = '<option value="auto">🔄 Tự động xoay Key</option>';
      for (let i = 1; i <= 10; i++) {
        let k = readRawKey(i);
        const n = readRawName(i);
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        if (k) {
          const label = n ? `🔑 ${n} (${k.substring(0, 5)}...)` : `🔑 Key ${i} (${k.substring(0, 5)}...)`;
          d.innerHTML += `<option value="${i-1}">${label}</option>`;
        }
      }
      if ([...d.options].some(o => o.value === cur)) d.value = cur;
    });
    renderKeyPoolMenu();
    if (typeof window.updateKeyQuotaUI === 'function') window.updateKeyQuotaUI();
  }

  // --- INIT OPENROUTER KEYS FROM LOCALSTORAGE ---
  function initOpenRouterKeys() {
    const keys = [];
    for (let i = 1; i <= OR_KEY_COUNT; i++) {
      let k = readRawOrKey(i);
      const n = readRawOrName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`jarvis_openrouter_api_${i}`, k);
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
      s.innerText = keys.length ? `✅ Có ${keys.length} OpenRouter Key` : "⚠️ Chưa có Key";
      s.style.color = keys.length ? "var(--success)" : "var(--danger)";
    }
    renderSlotSelects(SLOT_SELECT_GROUPS[0]);
    if (typeof window.updateOpenRouterQuotaUI === 'function') window.updateOpenRouterQuotaUI();
  }

  // --- INIT EXPERIENTIAL LABS KEYS FROM LOCALSTORAGE ---
  function initExplabsKeys() {
    // Di trú key đơn cũ (explabs_api_key) sang ô #1 nếu 5 ô còn trống
    let hasAnySlot = false;
    for (let i = 1; i <= EL_KEY_COUNT; i++) if (readRawElKey(i)) hasAnySlot = true;
    if (!hasAnySlot) {
      let legacy = (ls.getItem('explabs_api_key') || '').trim();
      if (legacy.startsWith('JVENC_') || legacy.startsWith('ENC_')) legacy = deobfuscateKey(legacy);
      if (legacy) {
        ls.setItem('jarvis_explabs_api_1', legacy);
        ls.removeItem('explabs_api_key');
      }
    }

    const keys = [];
    for (let i = 1; i <= EL_KEY_COUNT; i++) {
      let k = readRawElKey(i);
      const n = readRawElName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`jarvis_explabs_api_${i}`, k);
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
      s.innerText = keys.length ? `✅ Có ${keys.length} Experiential Labs Key` : "⚠️ Chưa có Key";
      s.style.color = keys.length ? "var(--success)" : "var(--danger)";
    }
    renderSlotSelects(SLOT_SELECT_GROUPS[1]);
    if (typeof window.updateExplabsQuotaUI === 'function') window.updateExplabsQuotaUI();
  }

  // --- INIT NVIDIA KEYS FROM LOCALSTORAGE ---
  function initNvidiaKeys() {
    // Di trú key đơn cũ (nvidia_api_key) sang ô #1 nếu 3 ô còn trống
    let hasAnySlot = false;
    for (let i = 1; i <= NV_KEY_COUNT; i++) if (readRawNvKey(i)) hasAnySlot = true;
    if (!hasAnySlot) {
      let legacy = (ls.getItem('nvidia_api_key') || '').trim();
      if (legacy.startsWith('JVENC_') || legacy.startsWith('ENC_')) legacy = deobfuscateKey(legacy);
      if (legacy) {
        ls.setItem('jarvis_nvidia_api_1', legacy);
        ls.removeItem('nvidia_api_key');
      }
    }

    const keys = [];
    for (let i = 1; i <= NV_KEY_COUNT; i++) {
      let k = readRawNvKey(i);
      const n = readRawNvName(i);
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`jarvis_nvidia_api_${i}`, k);
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
      s.innerText = keys.length ? `✅ Có ${keys.length} NVIDIA Key` : "⚠️ Chưa có Key";
      s.style.color = keys.length ? "var(--success)" : "var(--danger)";
    }
    renderSlotSelects(SLOT_SELECT_GROUPS.find(g => g.kind === 'nvidia'));
    if (typeof window.updateNvidiaQuotaUI === 'function') window.updateNvidiaQuotaUI();
  }

  // --- INIT EXTERNAL CONFIGURATIONS ---
  function initExternalConfigs() {
    cfgMap.forEach(([id, k, def = '']) => {
      const el = $(id);
      if (el) {
        let val = ls.getItem(k) || (k === 'jarvis_global_context' ? (ls.getItem('huanmu_global_context') || ls.getItem('javiss_global_context') || '') : '') || def;
        if (typeof val === 'string' && (val.startsWith('JVENC_') || val.startsWith('ENC_'))) {
          val = deobfuscateKey(val);
        }
        el.value = val;
      }
    });
    if ($('live-temp-val')) $('live-temp-val').innerText = ls.getItem('live_temperature') || '0.7';
    if ($('live-toggle-search')) $('live-toggle-search').checked = ls.getItem('live_search_enabled') !== 'false';
    if ($('live-toggle-context')) $('live-toggle-context').checked = ls.getItem('live_context_enabled') !== 'false';
    if ($('hide-deepseek-thinking-checkbox')) {
      $('hide-deepseek-thinking-checkbox').checked = ls.getItem('jarvis_hide_deepseek_thinking') === 'true';
      $('hide-deepseek-thinking-checkbox').onchange = e => {
        ls.setItem('jarvis_hide_deepseek_thinking', e.target.checked ? 'true' : 'false');
      };
    }
  }

  // --- LIVE TEMPERATURE + GLOBAL CONTEXT INPUT LISTENERS ---
  const tempInput = $('live-temperature');
  if (tempInput) {
    tempInput.oninput = e => { if ($('live-temp-val')) $('live-temp-val').innerText = e.target.value; };
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
    for (let i = 1; i <= 10; i++) {
      const val = $(`api-key-${i}`)?.value.trim() || '';
      const nameVal = $(`api-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`jarvis_api_${i}`, val);
      ls.setItem(`huanmu_api_${i}`, val);
      ls.setItem(`jarvis_api_name_${i}`, nameVal);
      ls.setItem(`huanmu_api_name_${i}`, nameVal);
    }
    cfgMap.forEach(([id, k]) => ls.setItem(k, $(id)?.value.trim() || ''));
    ls.setItem('live_search_enabled', $('live-toggle-search')?.checked ? 'true' : 'false');
    ls.setItem('live_context_enabled', $('live-toggle-context')?.checked ? 'true' : 'false');
    ls.setItem('jarvis_hide_deepseek_thinking', $('hide-deepseek-thinking-checkbox')?.checked ? 'true' : 'false');
    // Lưu 5 OpenRouter keys
    for (let i = 1; i <= OR_KEY_COUNT; i++) {
      const orVal = $(`openrouter-key-${i}`)?.value.trim() || '';
      const orName = $(`openrouter-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`jarvis_openrouter_api_${i}`, orVal);
      ls.setItem(`jarvis_openrouter_api_name_${i}`, orName);
    }
    // Lưu 5 Experiential Labs keys
    for (let i = 1; i <= EL_KEY_COUNT; i++) {
      const elVal = $(`explabs-key-${i}`)?.value.trim() || '';
      const elName = $(`explabs-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`jarvis_explabs_api_${i}`, elVal);
      ls.setItem(`jarvis_explabs_api_name_${i}`, elName);
    }
    // Lưu 3 NVIDIA keys
    for (let i = 1; i <= NV_KEY_COUNT; i++) {
      const nvVal = $(`nvidia-key-${i}`)?.value.trim() || '';
      const nvName = $(`nvidia-key-name-${i}`)?.value.trim() || '';
      ls.setItem(`jarvis_nvidia_api_${i}`, nvVal);
      ls.setItem(`jarvis_nvidia_api_name_${i}`, nvName);
    }
    initAPIKeys();
    initExternalConfigs();
    initOpenRouterKeys();
    initExplabsKeys();
    initNvidiaKeys();
    // Đẩy ngay API key ngoài (Tavily, Serper, Experiential Labs, OpenRouter, NVIDIA...)
    // lên Cloud Gist, không cần chờ có tin nhắn chat mới.
    if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
      window.JarvisSync.scheduleAutoSync(3000);
    }
    showToast("Đã lưu cấu hình Google & Hệ thống!");
  }

  // --- CHECK KEYS BUTTON HANDLER ---
  async function handleCheckKeys() {
    const b = $('btn-check-keys');
    b.innerText = "⏳ Đang kiểm tra...";
    b.disabled = true;
    const GoogleGenAI = window.GoogleGenAI;
    let ok = 0, leaked = 0, quota = 0, invalid = 0, tot = 0;

    for (let i = 1; i <= 10; i++) {
      const el = $(`api-key-${i}`), k = el?.value.trim();
      const nameEl = $(`api-key-name-${i}`);
      const kn = nameEl?.value.trim() || `Key ${i}`;
      if (!k) continue;
      tot++;
      try {
        await new GoogleGenAI({ apiKey: k }).models.generateContent({
          model: FLASH_LITE_MODEL,
          contents: "hi",
          config: { maxOutputTokens: 1 }
        });
        el.style.border = "2px solid var(--success)";
        if (nameEl) nameEl.style.border = "2px solid var(--success)";
        el.title = `${kn}: ✅ Hoạt động tốt`;
        ok++;
      } catch (err) {
        const errStr = (err.message || String(err)).toLowerCase();
        if (errStr.includes("leak") || errStr.includes("403") || errStr.includes("permission_denied")) {
          el.style.border = "2px solid #ef4444";
          if (nameEl) nameEl.style.border = "2px solid #ef4444";
          el.title = `${kn}: 🚫 BỊ GOOGLE KHÓA (Reported as leaked - 403). Cần xóa và tạo key mới!`;
          leaked++;
        } else if (errStr.includes("quota") || errStr.includes("429") || errStr.includes("rate") || errStr.includes("resource_exhausted")) {
          el.style.border = "2px solid #f59e0b";
          if (nameEl) nameEl.style.border = "2px solid #f59e0b";
          el.title = `${kn}: ⚠️ Hết Quota tạm thời (429). Key vẫn sống!`;
          quota++;
        } else {
          el.style.border = "2px solid var(--danger)";
          if (nameEl) nameEl.style.border = "2px solid var(--danger)";
          el.title = `${kn}: ❌ Lỗi (${err.message || 'Không hợp lệ'})`;
          invalid++;
        }
      }
    }
    b.innerText = "🔍 Kiểm tra Keys";
    b.disabled = false;

    let msg = `Hoạt động: ${ok}/${tot} Keys.`;
    if (leaked > 0) msg += ` 🚫 ${leaked} key bị Google khóa (Leaked 403).`;
    if (quota > 0) msg += ` ⚠️ ${quota} key hết quota tạm thời.`;
    showToast(msg, ok > 0 ? (leaked > 0 ? "warning" : "success") : "danger");
  }

  async function handleCheckOpenRouterKeys() {
    const b = $('btn-check-openrouter-keys');
    if (!b) return;
    b.innerText = "⏳ Đang kiểm tra...";
    b.disabled = true;
    let ok = 0, invalid = 0, tot = 0;
    for (let i = 1; i <= OR_KEY_COUNT; i++) {
      const el = $(`openrouter-key-${i}`), k = el?.value.trim();
      const nameEl = $(`openrouter-key-name-${i}`);
      const kn = nameEl?.value.trim() || `OR Key ${i}`;
      if (!k) continue;
      tot++;
      try {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': 'Bearer ' + k }
        });
        if (res.ok) {
          el.style.border = "2px solid var(--success)";
          if (nameEl) nameEl.style.border = "2px solid var(--success)";
          el.title = `${kn}: ✅ Hoạt động tốt`;
          ok++;
        } else {
          el.style.border = "2px solid var(--danger)";
          if (nameEl) nameEl.style.border = "2px solid var(--danger)";
          el.title = `${kn}: ❌ Lỗi (HTTP ${res.status})`;
          invalid++;
        }
      } catch (err) {
        el.style.border = "2px solid var(--danger)";
        if (nameEl) nameEl.style.border = "2px solid var(--danger)";
        el.title = `${kn}: ❌ Lỗi (${err.message || 'Không hợp lệ'})`;
        invalid++;
      }
    }
    b.innerText = "🔍 Kiểm tra OpenRouter";
    b.disabled = false;
    showToast(`OpenRouter: Hoạt động ${ok}/${tot} Keys.${invalid ? ' ❌ ' + invalid + ' lỗi' : ''}`, ok > 0 ? "success" : "danger");
  }

  function handleCheckOpenRouterDuplicates() {
    const m = {}, dups = [];
    for (let i = 1; i <= OR_KEY_COUNT; i++) {
      const v = $(`openrouter-key-${i}`)?.value.trim();
      const kn = $(`openrouter-key-name-${i}`)?.value.trim() || `OR Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : m[v] = kn;
    }
    showToast(dups.length ? `⚠️ OpenRouter trùng: ${dups.join(', ')}!` : "✅ OpenRouter không có key trùng.");
  }

  function handleCheckNvidiaDuplicates() {
    const m = {}, dups = [];
    for (let i = 1; i <= NV_KEY_COUNT; i++) {
      const v = $(`nvidia-key-${i}`)?.value.trim();
      const kn = $(`nvidia-key-name-${i}`)?.value.trim() || `NV Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : m[v] = kn;
    }
    showToast(dups.length ? `⚠️ NVIDIA trùng: ${dups.join(', ')}!` : "✅ NVIDIA không có key trùng.");
  }

  function handleCheckExplabsDuplicates() {
    const m = {}, dups = [];
    for (let i = 1; i <= EL_KEY_COUNT; i++) {
      const v = $(`explabs-key-${i}`)?.value.trim();
      const kn = $(`explabs-key-name-${i}`)?.value.trim() || `EL Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : m[v] = kn;
    }
    showToast(dups.length ? `⚠️ Experiential Labs trùng: ${dups.join(', ')}!` : "✅ Experiential Labs không có key trùng.");
  }

  // --- CHECK DUPLICATES BUTTON HANDLER ---
  function handleCheckDuplicates() {
    const m = {}, dups = [];
    for (let i = 1; i <= 10; i++) {
      const v = $(`api-key-${i}`)?.value.trim();
      const kn = $(`api-key-name-${i}`)?.value.trim() || `Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : m[v] = kn;
    }
    showToast(dups.length ? `⚠️ Phát hiện trùng: ${dups.join(', ')}!` : "✅ Không có key trùng.");
  }

  // Wiring buttons (guarded - chỉ chạy khi DOM đã có)
  // Đổi model chính -> menu key dùng chung đổi sang danh sách key của nền tảng mới
  const modelSelEl = $('model-select');
  if (modelSelEl) modelSelEl.addEventListener('change', () => renderKeyPoolMenu());

  const saveBtn = $('btn-save-keys');
  if (saveBtn) saveBtn.onclick = () => { handleSaveKeys(); };
  const checkBtn = $('btn-check-keys');
  if (checkBtn) checkBtn.onclick = async () => { await handleCheckKeys(); };
  const dupBtn = $('btn-check-duplicates');
  if (dupBtn) dupBtn.onclick = () => { handleCheckDuplicates(); };
  const checkOrBtn = $('btn-check-openrouter-keys');
  if (checkOrBtn) checkOrBtn.onclick = async () => { await handleCheckOpenRouterKeys(); };
  const dupOrBtn = $('btn-check-openrouter-duplicates');
  if (dupOrBtn) dupOrBtn.onclick = () => { handleCheckOpenRouterDuplicates(); };
  const dupElBtn = $('btn-check-explabs-duplicates');
  if (dupElBtn) dupElBtn.onclick = () => { handleCheckExplabsDuplicates(); };
  const dupNvBtn = $('btn-check-nvidia-duplicates');
  if (dupNvBtn) dupNvBtn.onclick = () => { handleCheckNvidiaDuplicates(); };

  // Kiểm tra proxy + key NVIDIA ngay trên thiết bị đang chạy (điện thoại/browser).
  // Dùng giá trị đang gõ trong ô proxy (chưa cần bấm Lưu) để phát hiện URL sai trước khi chat.
  // Phải gửi 1 chat completion tối thiểu: /v1/models của NVIDIA không kiểm tra key (key sai vẫn 200).
  async function testNvidiaConnection() {
    const s = $('nvidia-key-status-msg');
    const setMsg = (t, color) => { if (s) { s.innerText = t; s.style.color = color; } };
    // Ô đang gõ > giá trị đã lưu > proxy mặc định (getBaseUrl xử lý 2 trường hợp sau)
    const typedProxy = (($('nvidia-proxy-url') && $('nvidia-proxy-url').value) || '').trim().replace(/\/+$/, '');
    const base = typedProxy || window.COMPAT_PROVIDERS.nvidia.getBaseUrl();
    let key = (ls.getItem('jarvis_nvidia_api_1') || '').trim();
    if (key.startsWith('JVENC_') || key.startsWith('ENC_')) key = deobfuscateKey(key);
    if (!key) return setMsg('❌ Chưa có NVIDIA Key ở ô #1', 'var(--danger)');
    setMsg('⏳ Đang kiểm tra proxy + key...', 'var(--text-muted)');
    const started = performance.now();
    try {
      const r = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nvidia/nemotron-3.5-bolt-e4b', messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false })
      });
      const ms = Math.round(performance.now() - started);
      if ([401, 403].includes(r.status)) {
        return setMsg(`❌ Proxy OK nhưng NVIDIA từ chối key (HTTP ${r.status}): key sai/hết hạn hoặc không có quyền. (${ms}ms)`, 'var(--danger)');
      }
      if (!r.ok) return setMsg(`❌ Kết nối được nhưng NVIDIA trả HTTP ${r.status} (${ms}ms)`, 'var(--danger)');
      return setMsg(`✅ Kết nối OK: proxy + key hợp lệ (${ms}ms)`, 'var(--success)');
    } catch (e) {
      return setMsg(`❌ Không kết nối được proxy: ${e.message}. Kiểm tra URL/mạng.`, 'var(--danger)');
    }
  }
  const testNvBtn = $('btn-test-nvidia');
  if (testNvBtn) testNvBtn.onclick = async () => { await testNvidiaConnection(); };

  // --- PUBLIC API ---
  window.initAPIKeys = initAPIKeys;
  window.initExternalConfigs = initExternalConfigs;
  window.initOpenRouterKeys = initOpenRouterKeys;
  window.findOpenRouterSlotIndexForKey = findOpenRouterSlotIndexForKey;
  window.initExplabsKeys = initExplabsKeys;
  window.findExplabsSlotIndexForKey = findExplabsSlotIndexForKey;
  window.initNvidiaKeys = initNvidiaKeys;
  window.findNvidiaSlotIndexForKey = findNvidiaSlotIndexForKey;
  window.refreshSlotKeySelects = refreshSlotKeySelects;
  window.renderKeyPoolMenu = renderKeyPoolMenu;
  window.handleCheckExplabsDuplicates = handleCheckExplabsDuplicates;
  window.handleCheckNvidiaDuplicates = handleCheckNvidiaDuplicates;
  window.handleSaveKeys = handleSaveKeys;
  window.handleCheckKeys = handleCheckKeys;
  window.handleCheckDuplicates = handleCheckDuplicates;
  window.handleCheckOpenRouterKeys = handleCheckOpenRouterKeys;
  window.handleCheckOpenRouterDuplicates = handleCheckOpenRouterDuplicates;

  // Tự khởi tạo khi module chạy (app.js load xong → proxy + window.* đã sẵn sàng)
  initAPIKeys();
  initExternalConfigs();
  initOpenRouterKeys();
  initExplabsKeys();
  initNvidiaKeys();

})();