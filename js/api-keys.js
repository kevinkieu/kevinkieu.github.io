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
    ['explabs-key-input', 'explabs_api_key'],
    ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
    ['web-extract-engine-input', 'web_extract_engine', 'auto'],
    ['live-temperature', 'live_temperature', '0.7']
  ];

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

  // Đọc key + tên từ localStorage (hỗ trợ 3 bộ key cũ: jarvis_/huanmu_/javiss_)
  const readRawKey = i => (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || "").trim();
  const readRawName = i => (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || "").trim();

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
    if (typeof window.updateKeyQuotaUI === 'function') window.updateKeyQuotaUI();
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
    initAPIKeys();
    initExternalConfigs();
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
  const saveBtn = $('btn-save-keys');
  if (saveBtn) saveBtn.onclick = () => { handleSaveKeys(); };
  const checkBtn = $('btn-check-keys');
  if (checkBtn) checkBtn.onclick = async () => { await handleCheckKeys(); };
  const dupBtn = $('btn-check-duplicates');
  if (dupBtn) dupBtn.onclick = () => { handleCheckDuplicates(); };

  // --- PUBLIC API ---
  window.initAPIKeys = initAPIKeys;
  window.initExternalConfigs = initExternalConfigs;
  window.handleSaveKeys = handleSaveKeys;
  window.handleCheckKeys = handleCheckKeys;
  window.handleCheckDuplicates = handleCheckDuplicates;

  // Tự khởi tạo khi module chạy (app.js load xong → proxy + window.* đã sẵn sàng)
  initAPIKeys();
  initExternalConfigs();

})();