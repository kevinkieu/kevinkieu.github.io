/* ==========================================================================
   Jarvis AI - API Keys Management (js/api-keys.js)
   Quản lý 10 Google API keys, validation, checking status và cấu hình ngoài.
   ========================================================================== */

(function() {
  'use strict';

  const ls = window.ls || localStorage;
  const $ = id => document.getElementById(id);
  const SAFETY = [
    'HARM_CATEGORY_HARASSMENT',
    'HARM_CATEGORY_HATE_SPEECH',
    'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    'HARM_CATEGORY_DANGEROUS_CONTENT',
    'HARM_CATEGORY_CIVIC_INTEGRITY'
  ].map(category => ({ category, threshold: 'BLOCK_NONE' }));

  const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';
  const AUX_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

  // --- INIT API KEYS FROM LOCALStorage ---
  function initAPIKeys() {
    // Will be overwritten/appended by app.js init, but provide standalone capability
    apiKeys = [];
    globalKeyIndex = 0;
    liveKeyIndex = 0;
    liveRetryCount = 0;

    for (let i = 1; i <= 10; i++) {
      let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || '').trim();
      const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        k = deobfuscateKey(k);
        ls.setItem(`jarvis_api_${i}`, k);
      }
      if ($( `api-key-${i}` )) $(`api-key-${i}`).value = k;
      if ($( `api-key-name-${i}` )) $(`api-key-name-${i}`).value = n;
      if (k) apiKeys.push(k);
    }

    const s = $('key-status-msg');
    if (s) {
      s.innerText = apiKeys.length ? `✅ Có ${apiKeys.length} Google Key` : "⚠️ Chưa có Key";
      s.style.color = apiKeys.length ? "var(--success)" : "var(--danger)";
    }

    $('api-key-select').forEach(d => {
      if (!d) return;
      const cur = d.value;
      d.innerHTML = '<option value="auto">🔄 Tự động xoay Key</option>';
      for (let i = 1; i <= 10; i++) {
        let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || '').trim();
        const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || '').trim();
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        if (k) {
          const label = n ? `🔑 ${n} (${k.substring(0, 5)}...)` : `🔑 Key ${i} (${k.substring(0, 5)}...)`;
          d.innerHTML += `<option value="${i-1}">${label}</option>`;
        }
      }
      if ([...d.options].some(o => o.value === cur)) d.value = cur;
    });

    $('live-key-select').forEach(d => {
      if (!d) return;
      const cur = d.value;
      d.innerHTML = '<option value="auto">🔄 Tự động xoay Key</option>';
      for (let i = 1; i <= 10; i++) {
        let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || '').trim();
        const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || '').trim();
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        if (k) {
          const label = n ? `🔑 ${n} (${k.substring(0, 5)}...)` : `🔑 Key ${i} (${k.substring(0, 5)}...)`;
          d.innerHTML += `<option value="${i-1}">${label}</option>`;
        }
      }
      if ([...d.options].some(o => o.value === cur)) d.value = cur;
    });

    if (typeof updateKeyQuotaUI === 'function') updateKeyQuotaUI();
  }

  // --- INIT EXTERNAL CONFIGURATIONS ---
  function initExternalConfigs() {
    cfgMap = [
      ['global-context-input', 'jarvis_global_context'],
      ['tavily-key-input', 'tavily_api_key'],
      ['serper-key-input', 'serper_api_key'],
      ['explabs-key-input', 'explabs_api_key'],
      ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
      ['web-extract-engine-input', 'web_extract_engine', 'auto'],
      ['live-temperature', 'live_temperature', '0.7']
    ];

    cfgMap.forEach(([id, k, def = '']) => {
      if ($(id)) {
        let val = ls.getItem(k) || (k === 'jarvis_global_context' ? (ls.getItem('huanmu_global_context') || ls.getItem('javiss_global_context') || '') : '') || def;
        if (typeof val === 'string' && (val.startsWith('JVENC_') || val.startsWith('ENC_'))) {
          val = deobfuscateKey(val);
        }
        $(id).value = val;
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

  // --- SAVE KEYS BUTTON HANDLER ---
  function handleSaveKeys() {
    if (!$('btn-save-keys')) return;
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
    if (typeof showToast === 'function') showToast("Đã lưu cấu hình Google & Hệ thống!");
  }

  // --- CHECK KEYS BUTTON HANDLER ---
  async function handleCheckKeys() {
    if (!$('btn-check-keys')) return;
    const b = $('btn-check-keys');
    b.innerText = "⏳ Đang kiểm tra...";
    b.disabled = true;
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
    if (!$('btn-check-duplicates')) return;
    const m = {}, dups = [];
    for (let i = 1; i <= 10; i++) {
      const v = $(`api-key-${i}`)?.value.trim();
      const kn = $(`api-key-name-${i}`)?.value.trim() || `Key ${i}`;
      if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : m[v] = kn;
    }
    showToast(dups.length ? `⚠️ Phát hiện trùng: ${dups.join(', ')}!` : "✅ Không có key trùng.");
  }

  // --- PUBLIC API ---
  window.initAPIKeys = initAPIKeys;
  window.initExternalConfigs = initExternalConfigs;
  window.handleSaveKeys = handleSaveKeys;
  window.handleCheckKeys = handleCheckKeys;
  window.handleCheckDuplicates = handleCheckDuplicates;

})();