/* ==========================================================================
   Jarvis AI - Main Application Core (Chat, Sessions, Models & Controllers)
   ========================================================================== */

import { GoogleGenAI } from "@google/genai";

    const $ = id => document.getElementById(id), ls = localStorage, ss = sessionStorage;
    window.$ = $;
    window.ls = ls;
    window.ss = ss;
    window.GoogleGenAI = GoogleGenAI;
    
    // --- ANDROID NATIVE BRIDGE & PERSISTENCE ENGINE ---
    // Yêu cầu trình duyệt / WebView cấp quyền lưu trữ vĩnh viễn (Persistent Storage)
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    function syncFromNativeBridge() {
      if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.getAllDataJson === 'function') {
        try {
          const raw = window.JarvisNativeBridge.getAllDataJson();
          if (raw) {
            const data = JSON.parse(raw);
            for (const [k, v] of Object.entries(data)) {
              if (v !== null && v !== undefined && !ls.getItem(k)) {
                ls.setItem(k, v);
              }
            }
          }
        } catch (e) {
          console.warn("syncFromNativeBridge error:", e);
        }
      }
    }

    function saveToNativeBridge(key, val) {
      if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.setItem === 'function') {
        try {
          if (val === null || val === undefined) {
            window.JarvisNativeBridge.removeItem(key);
          } else {
            window.JarvisNativeBridge.setItem(key, String(val));
          }
        } catch (e) {
          console.warn("saveToNativeBridge error:", e);
        }
      }
    }

    // Persistent Storage & Safe LocalStorage Wrapper with Quota Protection & Native Bridge Sync
    if (window.JarvisNativeBridge) {
      syncFromNativeBridge();
    }
    const _nativeOrigSetItem = localStorage.setItem.bind(localStorage);
    const _nativeOrigRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function(k, v) {
      try {
        _nativeOrigSetItem(k, v);
      } catch (err) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
          console.warn("LocalStorage Quota Exceeded on key:", k);
          if (typeof showToast === 'function') {
            showToast("⚠️ LocalStorage (5MB) đã đầy. Dữ liệu chat được lưu an toàn trên IndexedDB!", "warning");
          }
        }
      }
      if (window.JarvisNativeBridge) {
        saveToNativeBridge(k, v);
      }
    };
    localStorage.removeItem = function(k) {
      try {
        _nativeOrigRemoveItem(k);
      } catch {}
      if (window.JarvisNativeBridge) {
        saveToNativeBridge(k, null);
      }
    };

    // CENTRAL CONSTANT FOR SECONDARY & BACKGROUND TASKS (FLASH LITE)
    const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';
    const AUX_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

    // Init libraries
    marked.use({ breaks: true });
    mermaid.initialize({ startOnLoad: false, theme: 'default' });

    // Register PWA Service Worker (only for web browser, disabled in Native Android app)
    if ('serviceWorker' in navigator) {
      if (window.JarvisNativeBridge) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          for (const reg of regs) reg.unregister();
        }).catch(() => {});
      } else {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    window.escapeHtml = escapeHtml;


    // --- KEY CIPHER & SECURITY HELPERS ---
    const CIPHER_SECRET = "JarvisAI_SecretKey_Protect_2026_X9!";

    function obfuscateKey(k) {
      if (!k || typeof k !== 'string') return '';
      try {
        const salt = Math.random().toString(36).slice(2, 10);
        const fullKey = CIPHER_SECRET + salt;
        const utf8Bytes = new TextEncoder().encode(k);
        const outBytes = new Uint8Array(utf8Bytes.length);
        for (let i = 0; i < utf8Bytes.length; i++) {
          outBytes[i] = utf8Bytes[i] ^ fullKey.charCodeAt(i % fullKey.length) ^ ((i * 31 + 17) & 0xFF);
        }
        let binStr = '';
        for (let i = 0; i < outBytes.length; i++) {
          binStr += String.fromCharCode(outBytes[i]);
        }
        return 'JVENC_' + salt + '_' + btoa(binStr);
      } catch (e) {
        try {
          return 'ENC_' + btoa(unescape(encodeURIComponent(k.split('').reverse().join(''))));
        } catch {
          return 'ENC_' + btoa(k.split('').reverse().join(''));
        }
      }
    }

    function deobfuscateKey(k) {
      if (!k || typeof k !== 'string') return '';
      if (k.startsWith('JVENC_')) {
        try {
          const parts = k.slice(6).split('_');
          if (parts.length >= 2) {
            const salt = parts[0];
            const b64 = parts.slice(1).join('_');
            const fullKey = CIPHER_SECRET + salt;
            const binStr = atob(b64);
            const outBytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) {
              outBytes[i] = binStr.charCodeAt(i) ^ ((i * 31 + 17) & 0xFF) ^ fullKey.charCodeAt(i % fullKey.length);
            }
            return new TextDecoder().decode(outBytes);
          }
        } catch (e) {
          console.warn('JVENC decode failed:', e);
        }
      }
      if (k.startsWith('ENC_')) {
        try {
          const rawB64 = k.slice(4);
          return decodeURIComponent(escape(atob(rawB64))).split('').reverse().join('');
        } catch {
          try {
            return atob(k.slice(4)).split('').reverse().join('');
          } catch {
            return k;
          }
        }
      }
      return k;
    }

    function sanitizeSessionForBackup(session) {
      if (!session || typeof session !== 'object') return session;
      const clean = JSON.parse(JSON.stringify(session));
      clean.assignedApiKey = null;
      if (Array.isArray(clean.his)) {
        clean.his.forEach(msg => {
          if (typeof msg.text === 'string') {
            msg.text = msg.text
              .replace(/AIzaSy[A-Za-z0-9_-]{30,40}/g, 'AIzaSy[PROTECTED_BY_JARVIS]')
              .replace(/tvly-[A-Za-z0-9_-]{20,40}/g, 'tvly-[PROTECTED_BY_JARVIS]')
              .replace(/jina_[A-Za-z0-9_-]{20,}/g, 'jina_[PROTECTED_BY_JARVIS]')
              .replace(/ghp_[A-Za-z0-9]{30,45}/g, 'ghp_[PROTECTED_BY_JARVIS]')
              .replace(/github_pat_[A-Za-z0-9_]{30,}/g, 'github_pat_[PROTECTED_BY_JARVIS]');
          }
        });
      }
      return clean;
    }

    let apiKeys = [], globalKeyIndex = 0, liveKeyIndex = 0, liveRetryCount = 0, abortController = null;
    const SAFETY = [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
      'HARM_CATEGORY_CIVIC_INTEGRITY'
    ].map(category => ({ category, threshold: 'BLOCK_NONE' }));

    const getNowTime24h = () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const formatGoogleApiError = e => {
      const m = e?.message || "";
      return (m.includes("429") || m.includes("RESOURCE_EXHAUSTED")) ? "⚠️ Hết Quota (429)." 
           : (m.includes("503") || m.includes("UNAVAILABLE")) ? "⚠️ Máy chủ quá tải (503)." 
           : m ? `❌ Lỗi: ${m}` : "❌ Lỗi máy chủ Google.";
    };

    const extractQuotedKeywords = t => {
      const m = Array.from((t || '').matchAll(/["“«]([^"”»]+)["”»]/g)).map(x => x[1].trim()).filter(Boolean);
      return m.length ? m.join(' ') : null;
    };

    // --- SEARCH CACHE ENGINE (Đã chuyển sang js/tools.js) ---
    const getSearchCache = (q, e) => (typeof window.getSearchCache === 'function') ? window.getSearchCache(q, e) : null;
    const setSearchCache = (q, e, d) => (typeof window.setSearchCache === 'function') ? window.setSearchCache(q, e, d) : null;

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
      let pending = false, latest = "", rafId = null;
      return {
        push: text => {
          latest = text;
          if (!pending) {
            pending = true;
            rafId = requestAnimationFrame(() => {
              try {
                let toRender = latest;
                const hideThinking = ls.getItem('jarvis_hide_deepseek_thinking') === 'true' || ls.getItem('jarvis_hide_thinking') === 'true';
                if (hideThinking) {
                  toRender = toRender.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '')
                                     .replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '');
                } else {
                  toRender = toRender.replace(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi, (m, p1) => {
                    const clean = p1.trim();
                    if (!clean) return '';
                    const words = clean.split(/\s+/).filter(Boolean).length;
                    const chars = clean.length;
                    const tokens = Math.max(1, Math.round(chars / 4));
                    return `<details class="thinking-block"><summary class="thinking-summary"><span class="thinking-icon">💭</span> Quá trình suy luận <span class="thinking-count">(${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens - bấm để xem)</span></summary><div class="thinking-content">${escapeHtml(clean)}</div></details>`;
                  });
                }
                targetEl.innerHTML = marked.parse(toRender);
              } catch (_) {}
              pending = false;
            });
          }
        },
        flush: async finalText => {
          if (rafId) cancelAnimationFrame(rafId);
          pending = false;
          await renderMsgContent(targetEl, finalText);
        }
      };
    }

    // --- REASONING ACCORDION & THINKING FORMATTER (GEMINI & DEEPSEEK) ---
    function formatThinkingResponse(currentThinking, currentContent, modelDisplayName = 'AI') {
      const hideThinking = ls.getItem('jarvis_hide_deepseek_thinking') === 'true' || ls.getItem('jarvis_hide_thinking') === 'true';

      let displayThinking = currentThinking || '';
      let displayContent = currentContent || '';

      if (!displayThinking && (displayContent.includes('<think>') || displayContent.includes('<thought>'))) {
        const match = displayContent.match(/<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$)/i);
        if (match) {
          displayThinking = match[1];
          displayContent = displayContent.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/i, '').trim();
        }
      }

      if (hideThinking) {
        if (displayContent) {
          return displayContent;
        } else {
          return `<div class="thinking-streaming"><span class="thinking-spinner">⏳</span> <em>${modelDisplayName} đang suy nghĩ...</em></div>`;
        }
      } else {
        const clean = displayThinking.trim();
        const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
        const chars = clean.length;
        const tokens = Math.max(1, Math.round(chars / 4));

        if (displayContent) {
          const thinkingBlock = clean
            ? `<details class="thinking-block"><summary class="thinking-summary"><span class="thinking-icon">💭</span> Quá trình suy luận <span class="thinking-count">(${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens - bấm để xem)</span></summary><div class="thinking-content">${escapeHtml(clean)}</div></details>\n\n`
            : '';
          return thinkingBlock + displayContent;
        } else if (clean) {
          return `<div class="thinking-streaming"><span class="thinking-spinner">⏳</span> <em>${modelDisplayName} đang suy luận (${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens)...</em></div>`;
        }
        return '';
      }
    }

    function formatFinalThinkingResponse(currentThinking, currentContent, modelDisplayName = 'AI') {
      const hideThinking = ls.getItem('jarvis_hide_deepseek_thinking') === 'true' || ls.getItem('jarvis_hide_thinking') === 'true';

      let displayThinking = currentThinking || '';
      let displayContent = currentContent || '';

      if (!displayThinking && (displayContent.includes('<think>') || displayContent.includes('<thought>'))) {
        const match = displayContent.match(/<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$)/i);
        if (match) {
          displayThinking = match[1];
          displayContent = displayContent.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/i, '').trim();
        }
      }

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
        const clean = displayThinking.trim();
        const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
        const chars = clean.length;
        const tokens = Math.max(1, Math.round(chars / 4));

        const thinkingBlock = clean
          ? `<details class="thinking-block"><summary class="thinking-summary"><span class="thinking-icon">💭</span> Quá trình suy luận <span class="thinking-count">(${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens - bấm để xem)</span></summary><div class="thinking-content">${escapeHtml(clean)}</div></details>\n\n`
          : '';
        return thinkingBlock + displayContent;
      }
    }

    // --- EXPORT & COPY HELPERS (Đã chuyển sang js/export.js) ---
    const saveOrShareBlob = (b, fn) => (typeof window.saveOrShareBlob === 'function') ? window.saveOrShareBlob(b, fn) : null;
    const copyRawText = (t, m) => (typeof window.copyRawText === 'function') ? window.copyRawText(t, m) : null;

    // --- TÌM KIẾM WEB & YOUTUBE INTEL (Đã chuyển sang js/tools.js) ---
    const fetchTavilySearch = (q) => (typeof window.fetchTavilySearch === 'function') ? window.fetchTavilySearch(q) : Promise.reject('No Tavily');
    const fetchSerperSearch = (q) => (typeof window.fetchSerperSearch === 'function') ? window.fetchSerperSearch(q) : Promise.reject('No Serper');
    const executeLiveSearch = (q, p) => (typeof window.executeLiveSearch === 'function') ? window.executeLiveSearch(q, p) : Promise.resolve('');
    const extractYouTubeContent = (u) => (typeof window.extractYouTubeContent === 'function') ? window.extractYouTubeContent(u) : Promise.reject('No YT');
    const extractWebPageContent = (u) => (typeof window.extractWebPageContent === 'function') ? window.extractWebPageContent(u) : Promise.reject('No Extract');

    // --- QUẢN LÝ 10 GOOGLE API KEYS & CẤU HÌNH ---
    // --- QUẢN LÝ 10 GOOGLE API KEYS & CẤU HÌNH ---
    $('api-keys-container').innerHTML = Array.from({ length: 10 }, (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i+1}</span>
        <input type="text" id="api-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Key ${i+1} (Ví dụ: Gmail A, Key chính, Dự phòng...)">
        <input type="password" id="api-key-${i+1}" placeholder="Google API Key ${i+1} (AIzaSy...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Google AI Studio API Key vào đây">
        <span id="api-key-badge-${i+1}" style="font-size:0.68rem;font-weight:700;padding:4px 6px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;" title="Hạn ngạch hôm nay (20 RPD mỗi model)"><span style="color:#a855f7;">H4: 0/20</span> | <span style="color:#10b981;">3.6: 0/20</span> | <span style="color:#3b82f6;">3.8: 0/20</span></span>
      </div>
    `).join('');

    const cfgMap = [
      ['global-context-input', 'jarvis_global_context'],
      ['tavily-key-input', 'tavily_api_key'],
      ['serper-key-input', 'serper_api_key'],
      ['explabs-key-input', 'explabs_api_key', 'xpl_71c47c840e1af2b6e28d3f04909884a5eaf35752'],
      ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
      ['web-extract-engine-input', 'web_extract_engine', 'auto'],
      ['live-temperature', 'live_temperature', '0.7']
    ];

    function initAPIKeys() {
      apiKeys = [];
      for (let i = 1; i <= 10; i++) {
        let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || "").trim();
        const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || "").trim();
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
          k = deobfuscateKey(k);
          ls.setItem(`jarvis_api_${i}`, k);
        }
        if ($(`api-key-${i}`)) $(`api-key-${i}`).value = k;
        if ($(`api-key-name-${i}`)) $(`api-key-name-${i}`).value = n;
        if (k) apiKeys.push(k);
      }
      const s = $('key-status-msg');
      if (s) {
        s.innerText = apiKeys.length ? `✅ Có ${apiKeys.length} Google Key` : "⚠️ Chưa có Key";
        s.style.color = apiKeys.length ? "var(--success)" : "var(--danger)";
      }
      [$('api-key-select'), $('live-key-select')].forEach(d => {
        if (!d) return;
        const cur = d.value;
        d.innerHTML = '<option value="auto">🔄 Tự động xoay Key</option>';
        for (let i = 1; i <= 10; i++) {
          let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || "").trim();
          const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || "").trim();
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

    function initExternalConfigs() {
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

    $('live-temperature').oninput = e => { if ($('live-temp-val')) $('live-temp-val').innerText = e.target.value; };

    if ($('global-context-input')) {
      $('global-context-input').oninput = e => {
        ls.setItem('jarvis_global_context', e.target.value);
        ls.setItem('huanmu_global_context', e.target.value);
      };
    }

    $('btn-save-keys').onclick = () => {
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
    };

    $('btn-check-keys').onclick = async () => {
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
    };

    $('btn-check-duplicates').onclick = () => {
      const m = {}, dups = [];
      for (let i = 1; i <= 10; i++) {
        const v = $(`api-key-${i}`)?.value.trim();
        const kn = $(`api-key-name-${i}`)?.value.trim() || `Key ${i}`;
        if (v) m[v] ? dups.push(`${kn} trùng với ${m[v]}`) : m[v] = kn;
      }
      showToast(dups.length ? `⚠️ Phát hiện trùng: ${dups.join(', ')}!` : "✅ Không có key trùng.");
    };

    initAPIKeys();
    initExternalConfigs();

    // --- INDEXED DB ENGINE ---
    const DB_NAME = "JavissUltimateOS_DB", STORE_NAME = "chat_sessions", FILE_STORE = "file_library", TTS_STORE = "tts_audio_library";
    let db;
    function initDB() {
      return new Promise((res, rej) => {
        const rq = indexedDB.open(DB_NAME, 7);
        rq.onupgradeneeded = e => {
          let d = e.target.result;
          if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME, { keyPath: "id" });
          if (!d.objectStoreNames.contains(FILE_STORE)) d.createObjectStore(FILE_STORE, { keyPath: "id" });
          if (!d.objectStoreNames.contains(TTS_STORE)) d.createObjectStore(TTS_STORE, { keyPath: "id", autoIncrement: true });
        };
        rq.onsuccess = async e => {
          db = e.target.result;
          try {
            const checkHuan = indexedDB.open("HuanMU_DB", 6);
            checkHuan.onsuccess = () => {
              const hDb = checkHuan.result;
              if (hDb.objectStoreNames.contains(STORE_NAME)) {
                const getItems = hDb.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
                getItems.onsuccess = () => {
                  const hSessions = getItems.result || [];
                  if (hSessions.length) {
                    const wrTrans = db.transaction(STORE_NAME, "readwrite");
                    hSessions.forEach(hs => {
                      if (hs.his && hs.his.length > 0) wrTrans.objectStore(STORE_NAME).put(hs);
                    });
                  }
                };
              }
            };
          } catch {}
          res();
        };
        rq.onerror = e => rej(e);
      });
    }

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

    const saveToDB = s => new Promise((resolve, reject) => {
      try {
        if (s && typeof s === 'object') {
          s.updatedAt = Date.now();
        }
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).put(s);
        t.oncomplete = () => {
          syncSessionsToNative();
          if (typeof scheduleAutoSync === 'function') {
            scheduleAutoSync(10000);
          }
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });

    function recordDeletedSessionId(id) {
      if (!id) return;
      try {
        const list = JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]');
        if (!list.includes(id)) {
          list.push(id);
          if (list.length > 200) list.shift();
          ls.setItem('jarvis_deleted_session_ids', JSON.stringify(list));
        }
      } catch (e) {}
    }

    const deleteFromDB = i => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).delete(i);
        t.oncomplete = () => {
          recordDeletedSessionId(i);
          syncSessionsToNative();
          if (typeof scheduleAutoSync === 'function') {
            scheduleAutoSync(6000);
          }
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });

    const getAllFromDB = () => new Promise((resolve, reject) => {
      try {
        const rq = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });

    const clearAllDB = () => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).clear();
        t.oncomplete = () => {
          if (window.JarvisNativeBridge) saveToNativeBridge('jarvis_sessions_backup', '[]');
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });

    const saveFileToLib = f => new Promise(r => { const t = db.transaction(FILE_STORE, "readwrite"); t.objectStore(FILE_STORE).put(f); t.oncomplete = () => r(); });
    const getAllFilesFromLib = () => new Promise(r => { const rq = db.transaction(FILE_STORE, "readonly").objectStore(FILE_STORE).getAll(); rq.onsuccess = () => r(rq.result); });

    // --- DOM REFERENCES ---
    const DOM = {
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
      apiKeySel: $('api-key-select'),
      toggleGlob: $('toggle-global-context'),
      toggleSearch: $('toggle-search'),
      searchEngineBox: $('search-engine-box'),
      searchEngineSel: $('search-engine-select'),
      toggleMemory: $('toggle-memory'),
      toggleAutoSummary: $('toggle-auto-summary'),
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
      thinking: $('thinking-level'),
      searchInput: $('search-chat-input'),
      scrollTopBtn: $('scroll-to-top'),
      snippetsContainer: $('snippets-container') || { style: {}, innerHTML: '' },
      btnToggleSnippets: $('btn-toggle-snippets') || { addEventListener: () => {}, onclick: null },
      btnFileLibrary: $('btn-file-library') || { addEventListener: () => {}, click: () => {}, onclick: null },
      btnAddUrl: $('btn-add-url') || { addEventListener: () => {}, click: () => {}, onclick: null },
      btnTheme: $('btn-theme'),
      tabsContainer: $('tabs-container')
    };

    let sessions = [], activeId = null, chatHistory = [], filesData = [], txtContent = "", isProcessing = false;
    let folders = JSON.parse(ls.getItem('jarvis_folders') || ls.getItem('huanmu_folders') || ls.getItem('javiss_folders') || '["Mặc định"]');
    let activeFolder = ls.getItem('jarvis_active_folder') || ls.getItem('huanmu_active_folder') || "All";
    let openTabs = JSON.parse(ls.getItem('jarvis_tabs') || ls.getItem('huanmu_tabs') || '[]');

    // Global bindings & live proxies for modular access across js/live.js, js/arena.js, js/tts.js, js/quota.js, js/medication.js
    window.DOM = DOM;
    try {
      Object.defineProperty(window, 'sessions', { get: () => sessions, set: (v) => { sessions = v; }, configurable: true });
      Object.defineProperty(window, 'activeId', { get: () => activeId, set: (v) => { activeId = v; }, configurable: true });
      Object.defineProperty(window, 'chatHistory', { get: () => chatHistory, set: (v) => { chatHistory = v; }, configurable: true });
    } catch (_) {
      window.sessions = sessions;
      window.activeId = activeId;
    }
    window.SAFETY = SAFETY;
    window.FLASH_LITE_MODEL = FLASH_LITE_MODEL;
    window.DB_NAME = DB_NAME;
    window.STORE_NAME = STORE_NAME;
    window.FILE_STORE = FILE_STORE;
    window.TTS_STORE = TTS_STORE;
    window.getSessionApiKey = (cs, forceRotate) => getSessionApiKey(cs, forceRotate);
    window.showToast = (msg, type) => showToast(msg, type);
    window.getNowTime24h = () => getNowTime24h();
    window.formatGoogleApiError = err => formatGoogleApiError(err);
    window.extractWebPageContent = url => extractWebPageContent(url);
    window.extractYouTubeContent = url => extractYouTubeContent(url);
    window.executeLiveSearch = (q, engine) => executeLiveSearch(q, engine);
    window.fetchTavilySearch = q => fetchTavilySearch(q);
    window.fetchSerperSearch = q => fetchSerperSearch(q);
    window.fallbackBrowserDownload = (blob, fn) => fallbackBrowserDownload(blob, fn);
    window.saveToDB = saveToDB;
    window.getAllFromDB = getAllFromDB;
    window.clearAllDB = clearAllDB;
    window.initDB = initDB;
    window.getDB = () => db;
    window.switchSess = id => switchSess(id);
    window.renderSel = () => renderSel();
    window.updateTokenCount = () => updateTokenCount();
    window.newSess = () => newSess();
    window.reRenderHistory = () => reRenderHistory();

    // --- TIỆN ÍCH CUỘN VÀ KÉO NGANG BẰNG CHUỘT TRÊN PC (HORIZONTAL MOUSE WHEEL & SAFE GRAB SCROLL) ---
    function enableHorizontalScrollAndDrag(el) {
      if (!el || el._hScrollInit) return;
      el._hScrollInit = true;

      // 1. Chặn trình duyệt kéo chữ mặc định (HTML5 drag) làm đơ chuột khi rê qua tab
      el.addEventListener('dragstart', (e) => {
        e.preventDefault();
      });

      // 2. Chuyển đổi con lăn chuột dọc sang cuộn ngang mượt mà trên PC
      el.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          if (el.scrollWidth > el.clientWidth) {
            e.preventDefault();
            el.scrollLeft += e.deltaY * 1.2;
          }
        } else if (e.deltaX !== 0) {
          el.scrollLeft += e.deltaX;
        }
      }, { passive: false });

      // 3. Kéo thả chuột ngang an toàn (Grab-to-scroll, không chặn click thông thường)
      let isDown = false;
      let isDragging = false;
      let suppressClick = false;
      let startX = 0;
      let scrollStart = 0;

      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Chỉ nhận chuột trái
        if (e.target.tagName === 'INPUT' || e.target.classList.contains('tab-close')) return;

        isDown = true;
        isDragging = false;
        suppressClick = false;
        startX = e.pageX;
        scrollStart = el.scrollLeft;
      });

      window.addEventListener('mousemove', (e) => {
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
      el.addEventListener('click', (e) => {
        if (suppressClick) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          suppressClick = false;
        }
      }, true);
    }

    window.enableHorizontalScrollAndDrag = enableHorizontalScrollAndDrag;
    enableHorizontalScrollAndDrag(DOM.tabsContainer);
    enableHorizontalScrollAndDrag(document.querySelector('.input-tools-scroll'));
    enableHorizontalScrollAndDrag($('image-preview-grid'));

    Object.defineProperty(window, 'sessions', { get: () => sessions, set: v => { sessions = v; }, configurable: true });
    Object.defineProperty(window, 'activeId', { get: () => activeId, set: v => { activeId = v; }, configurable: true });
    Object.defineProperty(window, 'chatHistory', { get: () => chatHistory, set: v => { chatHistory = v; }, configurable: true });
    Object.defineProperty(window, 'apiKeys', { get: () => apiKeys, set: v => { apiKeys = v; }, configurable: true });
    Object.defineProperty(window, 'globalKeyIndex', { get: () => globalKeyIndex, set: v => { globalKeyIndex = v; }, configurable: true });
    Object.defineProperty(window, 'liveKeyIndex', { get: () => liveKeyIndex, set: v => { liveKeyIndex = v; }, configurable: true });
    Object.defineProperty(window, 'liveRetryCount', { get: () => liveRetryCount, set: v => { liveRetryCount = v; }, configurable: true });
    Object.defineProperty(window, 'db', { get: () => db, set: v => { db = v; }, configurable: true });
    Object.defineProperty(window, 'oLay', { get: () => oLay, set: v => { oLay = v; }, configurable: true });
    Object.defineProperty(window, 'filesData', { get: () => filesData, set: v => { filesData = v; }, configurable: true });
    Object.defineProperty(window, 'txtContent', { get: () => txtContent, set: v => { txtContent = v; }, configurable: true });
    window.deobfuscateKey = deobfuscateKey;

    // --- PROMPT LIBRARY & COMMAND PALETTE (Đã chuyển sang js/commands.js) ---
    const executeChatSlashCommand = (t) => (typeof window.executeChatSlashCommand === 'function') ? window.executeChatSlashCommand(t) : false;
    const openPromptLibraryModal = () => (typeof window.openPromptLibraryModal === 'function') ? window.openPromptLibraryModal() : null;
    const openCommandPalette = () => (typeof window.openCommandPalette === 'function') ? window.openCommandPalette() : null;
    const closeCommandPalette = () => (typeof window.closeCommandPalette === 'function') ? window.closeCommandPalette() : null;

    // --- SWIPE GESTURES FOR MOBILE ---
    let touchStartX = 0, touchStartY = 0;
    window.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', e => {
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
    }, { passive: true });

    // --- LOCAL FALLBACK TITLE GENERATOR ---
    function generateLocalFallbackTitle(text) {
      if (!text) return '';
      let clean = text.replace(/```[\s\S]*?```/g, '')
                      .replace(/https?:\/\/\S+/g, '')
                      .replace(/["'“”«»#*_\n\r\t]/g, ' ')
                      .trim();
      let prev;
      do {
        prev = clean;
        clean = clean.replace(/^(hãy|bạn hãy|xin hãy|cho tôi hỏi|cho hỏi|nhờ bạn|giúp tôi|làm sao để|làm thế nào để|hướng dẫn|giải thích|tóm tắt|viết|tạo|cách|tìm|so sánh|vui lòng|please|how to|can you|explain|what is)\s+/i, '').trim();
      } while (clean !== prev);

      const words = clean.split(/\s+/).filter(Boolean);
      if (!words.length) return '';
      const title = words.slice(0, 5).join(' ');
      return title.charAt(0).toUpperCase() + title.slice(1);
    }
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
              temperature: 0.4
            }
          });

          let raw = '';
          try { raw = res.text || ''; } catch (_) {}
          if (!raw && res.candidates?.[0]?.content?.parts) {
            raw = res.candidates[0].content.parts
              .filter(p => !p.thought && typeof p.text === 'string')
              .map(p => p.text)
              .join(' ')
              .trim();
          }

          raw = raw.replace(/["“«»”*\n#:]/g, '')
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

    // --- AUTO-SUMMARY LONG-TERM MEMORY (NÉN LỊCH SỬ DÀI) ---
    async function condenseSessionMemory(sessionObj) {
      if (!sessionObj || chatHistory.length <= 16 || DOM.toggleAutoSummary?.checked === false) return;
      const lastCond = sessionObj.lastCondensedLength || 0;
      if (chatHistory.length - lastCond < 10) return;

      const k = getSessionApiKey(sessionObj);
      if (!k) return;

      try {
        const toSummarize = chatHistory.slice(0, chatHistory.length - 10).map(m => `${m.role === 'model' ? 'AI' : 'User'}: ${m.text.slice(0, 300)}`).join('\n');
        const prevSummary = sessionObj.summaryMemory ? `[Bối cảnh cốt lõi trước đó]:\n${sessionObj.summaryMemory}\n\n[Diễn biến mới cần cập nhật]:\n` : '';
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
                temperature: 0.3
              }
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
        }
      } catch (e) {
        console.warn('Lỗi tóm tắt bộ nhớ dài:', e);
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
        orderIndex: Date.now()
      };

      sessions.unshift(newS);
      await saveToDB(newS);
      await switchSess(newForkId);
      showToast(`🌿 Đã rẽ nhánh sang phiên mới từ tin #${index + 1}!`);
    };

    // --- FEATURE 2: DAILY BRIEFING (Đã chuyển sang js/briefing.js) ---
    const openDailyBriefing = (f) => (typeof window.openDailyBriefing === 'function') ? window.openDailyBriefing(f) : null;
    const generateDailyBriefing = (f) => (typeof window.generateDailyBriefing === 'function') ? window.generateDailyBriefing(f) : null;

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
        try { handsFreeTranscribeController.abort(); } catch (_) {}
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
        try { handsFreeAudioCtx.close(); } catch (_) {}
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
    window.stopHandsFreeVoice = stopHandsFreeVoice;

    async function processHandsFreeAudioBlob(blob) {
      if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;
      const statusText = $('hf-status-text');
      const preview = $('hf-transcript-preview');
      const btnSendHf = $('btn-send-hands-free');
      if (btnSendHf) btnSendHf.style.display = 'none';

      try {
        if (statusText) statusText.innerHTML = '<span style="color:#8b5cf6;font-weight:600;">⚡ Đang chuyển giọng nói thành chữ...</span>';

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

        if (!base64Data) throw new Error("Không thể đọc dữ liệu âm thanh");

        // 2. Chuẩn hóa MIME type bare (Gemini API bắt buộc MIME type thuần, không có tham số ;codecs=...)
        let rawType = (blob.type || handsFreeRecorder?.mimeType || 'audio/webm').toLowerCase();
        let cleanMime = rawType.split(';')[0].trim();
        if (cleanMime.includes('webm')) cleanMime = 'audio/webm';
        else if (cleanMime.includes('mp4') || cleanMime.includes('m4a') || cleanMime.includes('aac')) cleanMime = 'audio/mp4';
        else if (cleanMime.includes('wav')) cleanMime = 'audio/wav';
        else if (cleanMime.includes('ogg')) cleanMime = 'audio/ogg';
        else cleanMime = 'audio/webm';

        // 3. Lấy danh sách API Key hợp lệ (Giải mã nếu có tiền tố mã hóa, tuyệt đối không gọi getGoogleKeysList(true))
        let availableKeys = (typeof apiKeys !== 'undefined' && Array.isArray(apiKeys) && apiKeys.length) ? [...apiKeys] : [];
        if (!availableKeys.length) {
          const raw = getGoogleKeysList(false).filter(Boolean);
          availableKeys = raw.map(k => {
            let clean = (k || '').trim();
            if (clean.startsWith('JVENC_') || clean.startsWith('ENC_')) clean = deobfuscateKey(clean);
            return clean;
          }).filter(Boolean);
        }

        if (!availableKeys.length) {
          showToast("Cần ít nhất 1 Google API Key trong Cài đặt!", "danger");
          stopHandsFreeVoice();
          return;
        }

        // Ưu tiên key đang gán cho phiên hiện tại, sau đó đến các key còn lại
        const currentSession = sessions.find(x => x.id === activeId);
        const preferredKey = (typeof getSessionApiKey === 'function') ? getSessionApiKey(currentSession) : null;
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

        keyLoop:
        for (let kIdx = 0; kIdx < candidateKeys.length; kIdx++) {
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
                          data: base64Data
                        }
                      },
                      {
                        text: "Nghe đoạn ghi âm tiếng Việt này và chỉ chép lại đúng văn bản những gì người nói. Tuyệt đối không thêm lời dẫn, không giải thích, không dùng ngoặc kép."
                      }
                    ]
                  }
                ],
                config: {
                  maxOutputTokens: 500
                }
              });
              spokenText = (res.text || '').trim();
              if (!spokenText && res.candidates?.[0]?.content?.parts) {
                spokenText = res.candidates[0].content.parts.map(p => p.text || '').join('').trim();
              }
              if (spokenText) break keyLoop;
            } catch (tErr) {
              lastErr = tErr;
              console.warn(`[HandsFree STT] Key #${kIdx + 1} (${activeKey.substring(0, 6)}...) - Model ${mod} lỗi (${cleanMime}):`, tErr.message);
            }
          }
        }

        // Nếu tất cả key & model đều lỗi (ví dụ rớt mạng hoàn toàn)
        if (!spokenText && lastErr) {
          console.error("[HandsFree STT] Thất bại chuyển âm thanh:", lastErr);
          if (statusText) statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">❌ Lỗi: ${lastErr.message || 'Thất bại'}</span>`;
          setTimeout(() => {
            if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
              startHandsFreeRecorder();
            }
          }, 1200);
          return;
        }

        spokenText = spokenText
          .replace(/^(người dùng nói|người nói|câu nói|văn bản|nội dung|bản chép|transcript|transcription):\s*/i, '')
          .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
          .trim();

        // 5. Nếu không có từ nào rõ ràng (tiếng thở, tiếng ồn nhẹ): Tiếp tục lắng nghe
        if (!spokenText) {
          console.info("[HandsFree] Không phát hiện từ ngữ rõ ràng.");
          if (statusText) statusText.innerHTML = '<span style="color:var(--text-muted);">👂 Chưa nghe rõ, đang lắng nghe lại...</span>';
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

        if (statusText) statusText.innerHTML = '<span style="color:#8b5cf6;font-weight:600;">🚀 Đang gửi cho Jarvis...</span>';
        DOM.sendBtn.click();

      } catch (err) {
        console.error("Lỗi chuyển đổi giọng nói rảnh tay:", err);
        if (statusText) statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">⚠️ Lỗi: ${err.message || 'Thử lại'}</span>`;
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
              autoGainControl: true
            }
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

        handsFreeRecorder.ondataavailable = (e) => {
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

        if (statusText) statusText.innerHTML = '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
        if (btnSendHf) btnSendHf.style.display = 'none';

        // Voice Activity Detection (VAD) Loop: kiểm tra mỗi 60ms
        const pcmData = new Uint8Array(handsFreeAnalyser.frequencyBinCount);
        let consecutiveSilenceMs = 0;
        const VAD_THRESHOLD = 7;        // Ngưỡng âm lượng nhạy cho dải tần số tiếng người (80Hz - 3800Hz)
        const SILENCE_COMMIT_MS = 950;  // Gần 1 giây im lặng là hoàn tất câu nói

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
              if (statusText) statusText.innerHTML = '<span style="color:#3b82f6;font-weight:600;">🎙️ Đang nghe giọng nói...</span>';
              if (btnSendHf) btnSendHf.style.display = 'inline-flex';
            }
          } else if (isHandsFreeUserTalking) {
            consecutiveSilenceMs += 60;
            const isOverMax = Date.now() - handsFreeSpeechStartTime > 25000;
            if (consecutiveSilenceMs >= SILENCE_COMMIT_MS || isOverMax) {
              clearInterval(handsFreeVadInterval);
              handsFreeVadInterval = null;
              if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;font-weight:600;">⏳ Đang hoàn tất câu nói...</span>';
              if (handsFreeRecorder && handsFreeRecorder.state === 'recording') {
                handsFreeRecorder.stop();
              }
            }
          }
        }, 60);

      } catch (err) {
        console.error("Lỗi bật micro phần cứng:", err);
        if (statusText) statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">❌ Lỗi Micro: ${err.message || 'Bị chặn quyền'}</span>`;
        showToast("Không thể truy cập Microphone! Hãy cấp quyền micro trong cài đặt điện thoại hoặc trình duyệt.", "danger");
        stopHandsFreeVoice();
      }
    }
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
        if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;font-weight:600;">⏳ Đang gửi ngay...</span>';
        handsFreeRecorder.stop();
      }
    }
    window.commitAndSendHandsFree = commitAndSendHandsFree;

    async function toggleHandsFreeVoice(forceState) {
      if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
        if (typeof window.endLiveCall === 'function') window.endLiveCall();
        showToast("Đã dừng đàm thoại Live rảnh tay.", "info");
        return;
      }

      if (forceState === false) {
        if (typeof window.endLiveCall === 'function') window.endLiveCall();
        stopHandsFreeVoice();
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return showToast("Thiết bị không hỗ trợ truy cập Microphone phần cứng!", "warning");
      }

      if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
        return showToast("Microphone yêu cầu kết nối bảo mật (HTTPS hoặc localhost)!", "warning");
      }

      // Kích hoạt engine Live Call dạng Mini-Bar trực tiếp trong giao diện chat
      if (typeof window.startLiveVoiceCall === 'function') {
        window.startLiveVoiceCall({ miniBar: true });
        showToast("⚡ Đã bật Đàm thoại Live siêu tốc (WebSocket 2 chiều)!", "success");
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
      if (statusText) statusText.innerHTML = '<span style="color:#10b981;font-weight:600;">🟢 Đang kết nối micro...</span>';

      const preview = $('hf-transcript-preview');
      if (preview) preview.innerText = "";

      const btnSendHf = $('btn-send-hands-free');
      if (btnSendHf) btnSendHf.style.display = 'none';

      // Mở khóa âm thanh trước cho trình duyệt điện thoại (iOS Safari & Android Chrome)
      try {
        const unlockAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
        unlockAudio.play().catch(() => {});
      } catch (_) {}

      await startHandsFreeRecorder();
      showToast("🎙️ Đã bật Đàm thoại Rảnh tay 2 chiều liên tục!", "success");
    }
    window.toggleHandsFreeVoice = toggleHandsFreeVoice;

    // Hands-Free triggers
    const btnHandsFreeVoice = $('btn-hands-free-voice');
    if (btnHandsFreeVoice) btnHandsFreeVoice.onclick = () => toggleHandsFreeVoice();

    const btnToggleHfChip = $('btn-toggle-hands-free-chip');
    if (btnToggleHfChip) btnToggleHfChip.onclick = () => toggleHandsFreeVoice();

    const btnStopHf = $('btn-stop-hands-free');
    if (btnStopHf) btnStopHf.onclick = () => {
      if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
        if (typeof window.endLiveCall === 'function') window.endLiveCall();
      } else {
        toggleHandsFreeVoice(false);
      }
    };

    const btnSendHf = $('btn-send-hands-free');
    if (btnSendHf) btnSendHf.onclick = () => commitAndSendHandsFree();

    // --- WEB SHARE TARGET & SHORTCUTS CONTROLLER ---
    function openShareTargetModal(content, detectedUrl) {
      const modal = $('share-target-modal');
      const prevBox = $('share-preview-content');
      const urlInd = $('share-url-indicator');
      const urlTxt = $('share-detected-url');
      const btnExtract = $('btn-share-extract-now');
      const btnInsert = $('btn-share-insert-input');
      
      if (!modal) return;
      prevBox.innerText = content;

      if (detectedUrl) {
        urlInd.style.display = 'block';
        urlTxt.innerText = detectedUrl;
        btnExtract.style.display = 'block';
        btnExtract.onclick = async () => {
          modal.style.display = 'none';
          if (oLay) oLay.style.display = 'none';
          await processSharedUrl(detectedUrl);
        };
      } else {
        urlInd.style.display = 'none';
        btnExtract.style.display = 'none';
      }

      btnInsert.onclick = () => {
        modal.style.display = 'none';
        if (oLay) oLay.style.display = 'none';
        DOM.input.value = (DOM.input.value ? DOM.input.value + '\n\n' : '') + content;
        DOM.input.focus();
        showToast("💬 Đã đưa nội dung vào ô nhập liệu!");
      };

      

      modal.style.display = 'block';
      if (oLay) oLay.style.display = 'block';
    }

    async function processSharedUrl(url) {
      showToast("⏳ Đang bóc tách nội dung liên kết...", "warning");
      try {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          const yt = await extractYouTubeContent(url);
          const k = getSessionApiKey(sessions.find(x => x.id === activeId));
          let summary = "";
          if (k) {
            try {
              const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
                model: FLASH_LITE_MODEL,
                contents: `Phân tích và tóm tắt chi tiết video YouTube sau:\n- Tiêu đề: ${yt.title}\n- Kênh: ${yt.author}\n- Link: ${url}\n${yt.content ? yt.content : ''}\nHãy nêu rõ chủ đề chính, các luận điểm nổi bật và ý nghĩa của video. Tuyệt đối KHÔNG từ chối là không xem được video.`,
                config: { safetySettings: SAFETY, maxOutputTokens: 700 }
              });
              summary = res.text;
            } catch(e) {
              summary = `Tiêu đề: ${yt.title} (Kênh: ${yt.author})`;
            }
          } else {
            summary = `Tiêu đề: ${yt.title} (Kênh: ${yt.author})`;
          }
          txtContent += `\n[YouTube: ${yt.title} - ${yt.author} (${url})]:\n${summary}\n`;
          DOM.textFileList.innerHTML += `📺 YouTube: ${escapeHtml(yt.title.substring(0, 24))}...<br>`;
        } else {
          const ext = await extractWebPageContent(url);
          txtContent += `\n[Nội dung ${url} qua ${ext.source}]:\n${ext.content}\n`;
          DOM.textFileList.innerHTML += `🌐 ${ext.source} (${url.substring(0, 30)}...)<br>`;
        }
        DOM.previewBox.style.display = 'block';
        DOM.fileCount.innerText = filesData.length + (txtContent ? 1 : 0);
        updateTokenCount();
        showToast("✅ Đã bóc tách nội dung liên kết chia sẻ!", "success");
      } catch (e) {
        showToast(`Lỗi bóc tách: ${e.message}`, 'danger');
      }
    }

    function handleIncomingWebShare() {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');

      
      if (action === 'live') {
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => startLiveVoiceCall(), 300);
        return;
      }
      if (action === 'tts') {
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => openTTSStudioModal(), 300);
        return;
      }

      const shareTitle = params.get('share_title') || '';
      const shareText = params.get('share_text') || '';
      const shareUrl = params.get('share_url') || '';

      if (shareTitle || shareText || shareUrl) {
        window.history.replaceState({}, document.title, window.location.pathname);

        const parts = [];
        if (shareTitle) parts.push(shareTitle);
        if (shareText && shareText !== shareTitle) parts.push(shareText);
        if (shareUrl && !shareText.includes(shareUrl)) parts.push(shareUrl);
        const full = parts.join('\n\n').trim();

        const match = full.match(/https?:\/\/[^\s]+/i);
        const detUrl = match ? match[0] : (shareUrl ? shareUrl.trim() : '');

        setTimeout(() => openShareTargetModal(full, detUrl), 400);
      }
    }

    // --- STORAGE & MEMORY MANAGEMENT CONTROLLER ---
    async function updateStorageStatus() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          const usedBytes = est.usage || 0;
          const quotaBytes = est.quota || 0;
          const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
          const quotaGB = (quotaBytes / (1024 * 1024 * 1024)).toFixed(1);
          const pct = quotaBytes > 0 ? ((usedBytes / quotaBytes) * 100).toFixed(2) : '0';

          const usedEl = $('storage-used-txt');
          const quotaEl = $('storage-quota-txt');
          const barEl = $('storage-bar-progress');

          if (usedEl) usedEl.innerText = `${usedMB} MB (${pct}%)`;
          if (quotaEl) quotaEl.innerText = `Khả dụng: ${quotaGB} GB`;
          if (barEl) {
            barEl.style.width = `${Math.min(Math.max(parseFloat(pct), 1), 100)}%`;
            if (parseFloat(pct) > 80) barEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
            else if (parseFloat(pct) > 50) barEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
            else barEl.style.background = 'linear-gradient(90deg, #10b981, #059669)';
          }
        }

        if (navigator.storage && navigator.storage.persisted) {
          const isPersisted = await navigator.storage.persisted();
          const statusEl = $('storage-persist-status');
          const btnPersist = $('btn-request-persist');
          if (statusEl) {
            if (isPersisted) {
              statusEl.innerText = "🟢 Đã kích hoạt (Vĩnh viễn)";
              statusEl.style.color = "var(--success)";
              if (btnPersist) btnPersist.style.display = "none";
            } else {
              statusEl.innerText = "⚪ Chưa bật";
              statusEl.style.color = "var(--warning)";
              if (btnPersist) btnPersist.style.display = "inline-block";
            }
          }
        }
      } catch (e) {
        console.warn("Lỗi kiểm tra bộ nhớ:", e);
      }
    }

    $('btn-refresh-storage')?.addEventListener('click', () => {
      updateStorageStatus();
      showToast("🔄 Đã cập nhật trạng thái bộ nhớ!", "success");
    });

    $('btn-request-persist')?.addEventListener('click', async () => {
      if (navigator.storage && navigator.storage.persist) {
        const ok = await navigator.storage.persist();
        if (ok) {
          showToast("🛡️ Đã kích hoạt Lưu trữ Vĩnh viễn (Persistent Storage)!", "success");
        } else {
          showToast("Trình duyệt chưa cho phép cấp quyền vĩnh viễn.", "warning");
        }
        updateStorageStatus();
      }
    });

    $('btn-clear-temp-cache')?.addEventListener('click', () => {
      if (confirm("Bạn có muốn dọn sạch bộ nhớ đệm tìm kiếm (search cache) và dữ liệu tạm thời không?\n(Toàn bộ Lịch sử chat và API keys sẽ được BẢO TỒN NGUYÊN VẸN 100%)")) {
        try {
          const keys = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && (k.startsWith('src_') || k.startsWith('cache_'))) keys.push(k);
          }
          keys.forEach(k => sessionStorage.removeItem(k));
          updateStorageStatus();
          showToast(`🧹 Đã dọn sạch ${keys.length} mục bộ đệm tạm thời!`, "success");
        } catch (e) {
          showToast(`Lỗi dọn cache: ${e.message}`, "danger");
        }
      }
    });

    // Wire up settings open to refresh storage status
    $('btn-open-settings')?.addEventListener('click', () => {
      setTimeout(updateStorageStatus, 100);
    });

    // --- COLOR TAGS CONTROLLER ---
    document.querySelectorAll('#session-color-picker .color-chip-btn').forEach(chip => {
      chip.onclick = async () => {
        const color = chip.getAttribute('data-color');
        const s = sessions.find(x => x.id === activeId);
        if (s) {
          s.color = color === 'none' ? null : color;
          await saveToDB(s);
          updateColorPickerUI();
          renderSel();
          renderTabs();
          showToast('Đã gán nhãn màu phiên!');
        }
      };
    });

    function updateColorPickerUI() {
      const s = sessions.find(x => x.id === activeId);
      const curColor = s?.color || 'none';
      document.querySelectorAll('#session-color-picker .color-chip-btn').forEach(chip => {
        const c = chip.getAttribute('data-color');
        chip.classList.toggle('active', c === curColor);
      });
    }

    
    // ==========================================================================
    // DISTRIBUTED KEY QUOTA TRACKER (Đã tách sang js/quota.js)
    // ==========================================================================
    const getMyDeviceId = () => (typeof window.getMyDeviceId === 'function') ? window.getMyDeviceId() : 'pc_default';
    const getCurrentQuotaCycle = () => (typeof window.getCurrentQuotaCycle === 'function') ? window.getCurrentQuotaCycle() : '';
    const getFlashModelBucket = (m) => (typeof window.getFlashModelBucket === 'function') ? window.getFlashModelBucket(m) : null;
    const getSelectedFlashModelBucket = () => (typeof window.getSelectedFlashModelBucket === 'function') ? window.getSelectedFlashModelBucket() : 'hydrogen';
    const loadKeyUsageData = () => (typeof window.loadKeyUsageData === 'function') ? window.loadKeyUsageData() : { cycle: '', keys: {} };
    const saveKeyUsageData = (d) => (typeof window.saveKeyUsageData === 'function') ? window.saveKeyUsageData(d) : null;
    const getKeyUsageCount = (s, b) => (typeof window.getKeyUsageCount === 'function') ? window.getKeyUsageCount(s, b) : 0;
    const recordKeyRequest = (k, b) => (typeof window.recordKeyRequest === 'function') ? window.recordKeyRequest(k, b) : null;
    const updateKeyQuotaUI = () => (typeof window.updateKeyQuotaUI === 'function') ? window.updateKeyQuotaUI() : null;
    const resetKeyUsageToday = () => (typeof window.resetKeyUsageToday === 'function') ? window.resetKeyUsageToday() : null;
    const findSlotIndexForKey = (k) => (typeof window.findSlotIndexForKey === 'function') ? window.findSlotIndexForKey(k) : -1;
    const getActiveKeySlot = () => (typeof window.getActiveKeySlot === 'function') ? window.getActiveKeySlot() : null;
    const getKeyBadgeHtml = (s) => (typeof window.getKeyBadgeHtml === 'function') ? window.getKeyBadgeHtml(s) : '';

    window.selectKeySlotQuick = (slotIndex) => {
      if (DOM.apiKeySel) {
        DOM.apiKeySel.value = String(slotIndex - 1);
        DOM.apiKeySel.dispatchEvent(new Event('change'));
      }
      const cs = sessions.find(x => x.id === activeId);
      if (cs) {
        let manualKey = (ls.getItem(`jarvis_api_${slotIndex}`) || ls.getItem(`huanmu_api_${slotIndex}`) || '').trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
        cs.assignedApiKey = manualKey;
        cs.keySel = String(slotIndex - 1);
        saveToDB(cs);
      }
      updateKeyQuotaUI();
      showToast(`🔑 Đã chuyển sang Key #${slotIndex}!`, 'info');
    };

    const getSessionApiKey = (cs, forceRotate = false) => {
      const selEl = $('api-key-select');
      const sel = selEl ? selEl.value : 'auto';
      if (sel !== 'auto') {
        let manualKey = (ls.getItem(`jarvis_api_${parseInt(sel)+1}`) || ls.getItem(`huanmu_api_${parseInt(sel)+1}`) || "").trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
        return manualKey;
      }

      // Kiểm tra model đang sử dụng có phải 20 RPD (Hydrogen, 3.6 hoặc 3.8 Flash) không:
      const activeModEl = $('model-select');
      const activeMod = activeModEl ? activeModEl.value : 'gemini-4-hydrogen';
      const flashBucket = getFlashModelBucket(activeMod); // 'hydrogen' | '3.8' | '3.6' | null
      const shouldAvoidExhausted = ls.getItem('jarvis_skip_exhausted_keys') !== 'false';

      // Nếu không forceRotate và phiên đã gán key (Interactions API cần giữ key cố định cho interactionId):
      if (!forceRotate && cs?.assignedApiKey && apiKeys.includes(cs.assignedApiKey)) {
        if (!flashBucket || !shouldAvoidExhausted) {
          return cs.assignedApiKey;
        }
        const assignedSlot = findSlotIndexForKey(cs.assignedApiKey);
        if (getKeyUsageCount(assignedSlot, flashBucket) < 20) {
          return cs.assignedApiKey;
        }
      }

      if (apiKeys.length) {
        // 1. Lọc danh sách các key hợp lệ cho riêng model này
        let candidates = [...apiKeys];
        if (flashBucket && shouldAvoidExhausted) {
          const notExhausted = apiKeys.filter(k => {
            const slot = findSlotIndexForKey(k);
            return getKeyUsageCount(slot, flashBucket) < 20;
          });
          if (notExhausted.length > 0) {
            candidates = notExhausted;
          } else {
            const modelLabel = flashBucket === 'hydrogen' ? 'Gemini 4 Hydrogen' : `Gemini ${flashBucket} Flash`;
            showToast(`⚠️ Tất cả các Google Key đều đã đạt 20/20 RPD cho ${modelLabel} hôm nay!`, "warning");
          }
        }

        // 2. THUẬT TOÁN CÂN BẰNG TẢI TRẢI ĐỀU (LEAST-USED FIRST):
        // Tìm số lượt gọi của model này trên từng key ứng viên
        const usageList = candidates.map(k => {
          const slot = findSlotIndexForKey(k);
          return { key: k, slot, usage: flashBucket ? getKeyUsageCount(slot, flashBucket) : 0 };
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
      return "";
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
    DOM.scrollTopBtn.onclick = () => DOM.chat.scrollTo({ top: 0, behavior: 'smooth' });

    function updateThinkingVisibility() {
      const m = DOM.model?.value || '', t = DOM.thinking;
      if (!t) return;
      const prev = t.value;
      const opts = (m === 'gemini-3.8-flash') 
        ? [['low', 'Low (Thấp)'], ['medium', 'Med (Chuẩn)'], ['high', 'High (Sâu)']] 
        : [['minimal', 'Min (Tối thiểu)'], ['low', 'Low (Thấp)'], ['medium', 'Med (Chuẩn)'], ['high', 'High (Sâu)']];
      t.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
      t.value = opts.some(([v]) => v === prev) ? prev : (m === 'gemini-3.5-flash-lite' ? 'minimal' : opts[0][0]);
    }

    const updateTokenCount = () => {
      const count = Math.ceil(((DOM.input?.value.length || 0) + (txtContent?.length || 0)) / 3.2);
      if ($('token-count')) $('token-count').innerText = count.toLocaleString('vi-VN');
      
      const bar = $('token-bar-fill');
      if (bar) {
        const pct = Math.min(Math.max((count / 15000) * 100, 4), 100);
        bar.style.width = pct + '%';
        bar.style.background = pct > 80 ? 'var(--danger)' : pct > 50 ? 'var(--warning)' : 'var(--success)';
      }
    };

    const applyTheme = m => {
      const t = m === 'auto' ? ((new Date().getHours() >= 18 || new Date().getHours() < 6) ? 'dark' : 'light') : m;
      const tIcons = { auto: '🌙', dark: '🌙', light: '☀️' }, tLabels = { auto: 'Tự động', dark: 'Tối', light: 'Sáng' };
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
          if (val.startsWith('/') && executeChatSlashCommand(val)) {
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
    if ($('btn-enhance-prompt')) $('btn-enhance-prompt').onclick = async () => {
      const txt = DOM.input.value.trim();
      if (!txt) return showToast("Nhập prompt trước khi Enhance!", "warning");
      const k = getSessionApiKey(sessions.find(x => x.id === activeId));
      if (!k) return showToast("Cần Google Key để Enhance!", "danger");
      $('btn-enhance-prompt').innerText = "⏳...";
      try {
        const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
          model: FLASH_LITE_MODEL,
          contents: `Hãy tối ưu và mở rộng câu lệnh prompt sau đây để rõ ràng, chi tiết, chuyên nghiệp và hiệu quả nhất khi gửi cho AI:\n\n"${txt}"\n\nChỉ trả về duy nhất nội dung prompt đã được tối ưu, không giải thích gì thêm.`,
          config: { safetySettings: SAFETY, maxOutputTokens: 400 }
        });
        if (res.text) {
          DOM.input.value = res.text.trim();
          DOM.input.dispatchEvent(new Event('input'));
          showToast("🪄 Đã tối ưu hóa Prompt!");
        }
      } catch (err) {
        showToast("Lỗi Enhance: " + err.message, "danger");
      } finally {
        $('btn-enhance-prompt').innerHTML = `<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Enhance`;
      }
    };

    $('toggle-sidebar-btn').onclick = () => { $('sidebar').classList.add('active'); $('sidebar-overlay').classList.add('active'); };
    $('close-sidebar-btn').onclick = $('sidebar-overlay').onclick = () => { $('sidebar').classList.remove('active'); $('sidebar-overlay').classList.remove('active'); };
    $('btn-open-settings').onclick = () => { $('settings-modal').style.display = 'flex'; $('modal-overlay').style.display = 'block'; };

    const getDynamicSI = (ragSnippet = '') => {
      const cs = sessions.find(x => x.id === activeId);
      const b = DOM.sysInst?.value || "Bạn là Jarvis AI - trợ lý thông minh và chuẩn xác.",
            g = DOM.globContext?.value || ls.getItem('jarvis_global_context') || ls.getItem('huanmu_global_context') || '',
            now = new Date(),
            days = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
      const hh = String(now.getHours()).padStart(2, '0'),
            mm = String(now.getMinutes()).padStart(2, '0'),
            ss = String(now.getSeconds()).padStart(2, '0');
      const timeStr = `${hh}:${mm}:${ss}`;
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const dateStr = `${days[now.getDay()]}, ngày ${day}/${month}/${year}`;
      
      const memorySnippet = (cs?.summaryMemory && DOM.toggleAutoSummary?.checked !== false) 
        ? `\n\n[BỐI CẢNH DÀI HẠN ĐÃ TÓM TẮT TỪ CÁC TIN CŨ]:\n${cs.summaryMemory}\n` 
        : '';

      const pinnedMsgs = chatHistory.filter(x => x.pinned);
      const pinnedSnippet = pinnedMsgs.length 
        ? `\n\n[CÁC CHỈ THỊ VÀ DỮ LIỆU CỐT LÕI ĐÃ ĐƯỢC NGƯỜI DÙNG GHIM - BẮT BUỘC LUÔN GHI NHỚ VÀ TUÂN THỦ]:\n` +
          pinnedMsgs.map((m, idx) => `--- [Mục ghim #${idx + 1} (${m.role === 'user' ? 'Người dùng' : 'Jarvis AI'})]:\n${m.text}`).join('\n\n') + '\n'
        : '';

      const ragBlock = ragSnippet ? `\n\n${ragSnippet}\n` : '';

      const timeInstruction = `[MỐC THỜI GIAN THỰC TẾ & NGUYÊN TẮC SUY LUẬN THỜI GIAN BẮT BUỘC]:
- Hôm nay là: ${dateStr}. Bây giờ là: ${timeStr} (Múi giờ Việt Nam GMT+7).
- NĂM HIỆN TẠI BẮT BUỘC LÀ NĂM ${year}. TUYỆT ĐỐI KHÔNG coi năm nay là năm 2024 hay 2025 (đó chỉ là thời điểm dữ liệu huấn luyện cũ).
- NGUYÊN TẮC SUY LUẬN THỜI GIAN & TÍNH TUỔI:
  + Mọi phép tính toán số tuổi, thời gian đã trôi qua kể từ một mốc quá khứ (ví dụ: mốc sinh năm 2024, các sự kiện trong quá khứ) hay tính thời gian đến tương lai ĐỀU BẮT BUỘC PHẢI lấy mốc thời điểm HIỆN TẠI LÀ THÁNG ${month}/${year} (NĂM ${year}).
  + Ví dụ: Một người hoặc đứa trẻ sinh vào tháng 01/2024, tính đến thời điểm hiện tại tháng ${month}/${year} đã là ${(year - 2024)} năm ${(month - 1)} tháng (khoảng ${((year - 2024) * 12 + month - 1)} tháng tuổi), TUYỆT ĐỐI KHÔNG được tính nhầm là 10 tháng tuổi!`;

      return `${timeInstruction}\n\n[CHỈ THỊ HỆ THỐNG]:\n${(DOM.toggleGlob?.checked !== false && g) ? '--- TOÀN CỤC: ' + g + '\n' : ''}--- RIÊNG: ${b}${memorySnippet}${pinnedSnippet}${ragBlock}\n\n[QUY TẮC ỨNG XỬ TẾ NHỊ]: Khi người dùng hỏi các câu hỏi kiến thức khoa học, nấu ăn, công nghệ, học tập hoặc câu hỏi phổ thông (như thịt gà, kỹ thuật, thời tiết...), TUYỆT ĐỐI KHÔNG tự tiện nhắc đến thông tin gia đình, đời tư, con cái (như bé Bắp, bé Tiền) nếu người dùng không chủ động hỏi hay yêu cầu.\n\n[QUY TẮC TRẢ LỜI CỦA MÔ HÌNH SUY LUẬN (THINKING)]: Sau khi hoàn tất quá trình suy luận nội bộ, bạn BẮT BUỘC PHẢI viết toàn bộ nội dung câu trả lời hoàn chỉnh, chi tiết, logic và thân thiện để gửi trực tiếp cho người dùng. TUYỆT ĐỐI KHÔNG kết thúc phản hồi khi chưa viết phần câu trả lời cho người dùng.`;
    };

    window.exportCleanArticle = () => {
      const m = chatHistory.filter(x => x.role === 'model').map(x => x.text);
      m.length ? saveOrShareBlob(new Blob([`# Jarvis AI - Bài viết trích xuất\n\n` + m.join('\n\n---\n\n')], { type: 'text/markdown' }), `JarvisAI_Export_${Date.now()}.md`) : showToast("Hội thoại trống!", "warning");
    };

    window.applySnippet = p => {
      if (DOM.input) {
        DOM.input.value = p + "\n" + DOM.input.value;
        DOM.input.dispatchEvent(new Event('input'));
        DOM.input.focus();
      }
      DOM.snippetsContainer.style.display = 'none';
    };
    if (DOM.btnToggleSnippets?.onclick) DOM.btnToggleSnippets.onclick = () => DOM.snippetsContainer.style.display = DOM.snippetsContainer.style.display === 'flex' ? 'none' : 'flex';

    async function readPDF(f) {
      const p = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
      let t = "";
      for (let i = 1; i <= p.numPages; i++) {
        t += (await (await p.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + "\n";
      }
      return t;
    }
    window.readPDF = readPDF;

    async function compressImageIfNeeded(f) {
      if (!f.type.startsWith('image/') || f.type === 'image/gif' || f.type === 'image/svg+xml') return f;
      return new Promise((resolve) => {
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
          canvas.toBlob(blob => {
            if (blob && blob.size < f.size) {
              resolve(new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
            } else {
              resolve(f);
            }
          }, 'image/jpeg', 0.82);
        };
        img.onerror = () => resolve(f);
        img.src = url;
      });
    }

    async function processUploadFiles(fs) {
      DOM.fileCount.innerText = "⏳";
      for (let f of fs) {
        if (f.type.startsWith('image/')) {
          f = await compressImageIfNeeded(f);
          if (filesData.length < 20) filesData.push(f);
        } else if (f.type === 'video/mp4') {
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
      const u = prompt("Nhập link URL website hoặc YouTube:");
      if (!u?.match(/https?:\/\//)) return;
      DOM.btnAddUrl.innerHTML = "⏳...";
      try {
        if (u.includes("youtube.com") || u.includes("youtu.be")) {
          const yt = await extractYouTubeContent(u);
          const k = getSessionApiKey(sessions.find(x => x.id === activeId));
          let summary = "";
          if (k) {
            try {
              const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
                model: FLASH_LITE_MODEL,
                contents: `Phân tích và tóm tắt chi tiết video YouTube sau:\n- Tiêu đề: ${yt.title}\n- Kênh: ${yt.author}\n- Link: ${u}\n${yt.content ? yt.content : ''}\nHãy nêu rõ chủ đề chính, các luận điểm nổi bật và ý nghĩa của video. Tuyệt đối KHÔNG từ chối là không xem được video.`,
                config: { safetySettings: SAFETY, maxOutputTokens: 700 }
              });
              summary = res.text;
            } catch(e) {
              summary = `Tiêu đề: ${yt.title} (Kênh: ${yt.author})`;
            }
          } else {
            summary = `Tiêu đề: ${yt.title} (Kênh: ${yt.author})`;
          }
          txtContent += `\n[YouTube: ${yt.title} - ${yt.author} (${u})]:\n${summary}\n`;
          DOM.textFileList.innerHTML += `📺 YouTube: ${escapeHtml(yt.title.substring(0, 24))}...<br>`;
        } else {
          const ext = await extractWebPageContent(u);
          txtContent += `\n[Nội dung ${u} qua ${ext.source}]:\n${ext.content}\n`;
          DOM.textFileList.innerHTML += `🌐 ${ext.source}<br>`;
        }
        DOM.previewBox.style.display = 'block';
        DOM.fileCount.innerText = filesData.length + (txtContent ? 1 : 0);
        updateTokenCount();
        showToast("Đã bóc tách nội dung link!");
      } catch (e) {
        showToast(`Lỗi: ${e.message}`, 'danger');
      }
      DOM.btnAddUrl.innerHTML = `<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Đọc Link/YT`;
    };

    if ($('btn-paste-clipboard')) $('btn-paste-clipboard').onclick = async () => {
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
        showToast("Lỗi truy cập Clipboard", 'danger');
      }
    };

    const oLay = $('modal-overlay'), closeModals = () => {
    window.closeModals = closeModals;
      document.querySelectorAll('.modal-box, #command-palette-modal, #daily-briefing-modal, #share-target-modal').forEach(m => m.style.display = 'none');
      if (oLay) oLay.style.display = 'none';
      if (typeof window.closeTTSStudioModal === 'function') window.closeTTSStudioModal();
    };
    document.querySelectorAll('.close-btn').forEach(b => b.onclick = closeModals);
    oLay.onclick = closeModals;

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
    if ($('btn-camera-snap')) $('btn-camera-snap').onclick = async () => {
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (isTouch && $('camera-file-input')) {
        $('camera-file-input').click();
      } else {
        $('camera-modal').style.display = 'flex';
        oLay.style.display = 'block';
        try {
          $('camera-preview').srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
          showToast("Đã chụp và đính kèm ảnh!");
        }
      };
    }

    $('btn-take-photo').onclick = () => {
      const v = $('camera-preview');
      if (!v.srcObject) return;
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      c.toBlob(b => {
        processUploadFiles([new File([b], `Cam_${Date.now()}.jpg`, { type: 'image/jpeg' })]);
        v.srcObject?.getTracks().forEach(t => t.stop());
        closeModals();
        showToast("Đã chụp và đính kèm ảnh!");
      }, 'image/jpeg', 0.85);
    };

    DOM.btnFileLibrary.onclick = () => {
      $('file-library-modal').style.display = 'flex';
      oLay.style.display = 'block';
      renderLibrary();
    };

    $('library-upload-input').onchange = async e => {
      for (const f of e.target.files) {
        if (f.size <= 50 * 1024 * 1024) {
          await saveFileToLib({
            id: Date.now() + Math.random().toString().slice(2, 7),
            name: f.name,
            type: f.type,
            size: f.size,
            blob: f,
            added: new Date().toISOString()
          });
        }
      }
      showToast("Đã thêm tệp vào thư viện!");
      renderLibrary();
      e.target.value = '';
    };

    async function renderLibrary() {
      const c = $('library-files-container'), fs = await getAllFilesFromLib();
      c.innerHTML = fs.length ? fs.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-radius:var(--radius-md);background:var(--input-bg);border:1px solid var(--border);">
          <div>
            <strong>${f.name}</strong><br>
            <small style="color:var(--text-muted);">${(f.size/1024).toFixed(1)} KB • ${new Date(f.added).toLocaleDateString('vi-VN')}</small>
          </div>
          <button class="btn primary" onclick="addFileFromLib('${f.id}')">➕ Đính</button>
        </div>
      `).join('') : "<i style='color:var(--text-muted);padding:10px;'>Thư viện hiện đang trống.</i>";
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
      DOM.tabsContainer.innerHTML = openTabs.map(tId => {
        const s = sessions.find(x => x.id === tId);
        const dot = s?.color ? `<span class="color-dot" style="background:${s.color};"></span>` : '';
        return s ? `<div class="tab-item ${tId === activeId ? 'active' : ''}" onclick="window.switchSess('${tId}')" title="${escapeHtml(s.name)}">
          ${dot}
          <span>${escapeHtml(s.name.substring(0, 16))}</span>
          <span class="tab-close" onclick="window.closeTab('${tId}', event)" title="Đóng tab">×</span>
        </div>` : '';
      }).join('');
      ls.setItem('jarvis_tabs', JSON.stringify(openTabs));
      requestAnimationFrame(() => {
        const activeTab = DOM.tabsContainer?.querySelector('.tab-item.active');
        if (activeTab) {
          activeTab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
        }
      });
    }

    window.switchSess = switchSess;
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
            console.warn("Khôi phục phiên từ native bridge lỗi:", e);
          }
        }
        if (d && d.length > 0) {
          sessions = d.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
          renderFolders();
          renderSnippets();
          activeId = ls.getItem('jarvis_active_id') || ls.getItem('huanmu_active_id') || ls.getItem('javiss_active_id') || sessions[0].id;
          if (!sessions.find(s => s.id === activeId)) activeId = sessions[0].id;
          await switchSess(activeId);
        } else {
          renderFolders();
          renderSnippets();
          await newSess();
        }
      } catch (e) {
        console.error("Lỗi khởi động loadSess:", e);
        renderFolders();
        renderSnippets();
      }
    }

    async function newSess(n) {
      const id = 's_' + Date.now(), s = {
        id,
        name: n || `Hội thoại ${sessions.length + 1}`,
        folder: "Mặc định",
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
        sch: false,
        schEngine: 'tavily',
        mem: true,
        rag: true,
        useGlob: true,
        updatedAt: Date.now(),
        orderIndex: 0
      };
      sessions.forEach(sess => { if (typeof sess.orderIndex === 'number') sess.orderIndex++; });
      sessions.unshift(s);
      await saveToDB(s);
      await switchSess(id);
      showToast("➕ Đã tạo phiên mới!");
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
      chatHistory = (s && Array.isArray(s.his)) ? [...s.his] : [];

      if (s) {
        DOM.sysInst.value = s.sys || '';
        DOM.model.value = s.mod || 'gemini-4-hydrogen';
        DOM.engineSel.value = s.engine || 'stream';
        DOM.apiKeySel.value = s.keySel || 'auto';
        DOM.temp.value = s.tmp || 0.5;
        DOM.tempVal.innerText = DOM.temp.value;
        DOM.topP.value = s.tpp || 0.9;
        DOM.toppVal.innerText = DOM.topP.value;
        DOM.topK.value = s.top || 40;
        updateThinkingVisibility();
        DOM.thinking.value = s.thk || 'minimal';
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
          await appendMsg(chatHistory[j].role === 'model' ? 'bot' : 'user', chatHistory[j].text || '', j, true);
        } catch (err) {
          console.error("Lỗi vẽ tin nhắn " + j, err);
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
      DOM.selSession.innerHTML = v.length ? v.map(s => {
        const dot = s.pinned ? '📌 ' : (s.color ? '● ' : '');
        return `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${dot}${s.name}</option>`;
      }).join('') : '<option value="">(Chưa có phiên nào)</option>';
      if (activeId) DOM.selSession.value = activeId;
      const curS = sessions.find(x => x.id === activeId);
      const kInfo = (curS?.engine === 'interactions' && curS?.assignedApiKey) ? ` • 🔒 Ghim Key ${apiKeys.indexOf(curS.assignedApiKey) + 1}` : '';
      $('session-msg-count').innerText = `${chatHistory.length} tin nhắn${kInfo}`;
      updateColorPickerUI();
    }

    $('btn-new-session').onclick = () => newSess();

    $('btn-rename-session').onclick = async () => {
      const s = sessions.find(x => x.id === activeId);
      if (!s) return;
      const n = prompt("Nhập tên mới cho phiên:", s.name);
      if (n && n.trim()) {
        s.name = n.trim();
        s.isCustomNamed = true;
        await saveToDB(s);
        renderSel();
        renderTabs();
        showToast("✏️ Đã đổi tên phiên!");
      }
    };

    window.continueMsg = () => {
      if (isProcessing) return;
      DOM.input.value = "Hãy tiếp tục viết tiếp phần nội dung còn dang dở ở trên, không lặp lại các đoạn đã viết.";
      DOM.input.dispatchEvent(new Event('input'));
      DOM.sendBtn.click();
    };

    $('btn-delete-session').onclick = async () => {
      if (sessions.length <= 1) return showToast("Cần giữ lại ít nhất 1 phiên!", "warning");
      const s = sessions.find(x => x.id === activeId);
      if (confirm(`Bạn có chắc muốn xóa phiên "${s?.name || ''}"?`)) {
        await deleteFromDB(activeId);
        sessions = sessions.filter(x => x.id !== activeId);
        openTabs = openTabs.filter(x => x !== activeId);
        await switchSess(sessions[0].id);
        showToast("🗑️ Đã xóa phiên!");
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
        showToast("⬆️ Đã di chuyển phiên lên!");
      } else {
        showToast("Phiên đã ở vị trí trên cùng!", "info");
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
        showToast("⬇️ Đã di chuyển phiên xuống!");
      } else {
        showToast("Phiên đã ở vị trí dưới cùng!", "info");
      }
    };

    $('btn-bulk-edit').onclick = () => {
      const modal = $('bulk-edit-modal'), list = $('bulk-edit-list');
      if (!chatHistory.length) return showToast("Phiên này chưa có tin nhắn nào!", "warning");
      list.innerHTML = chatHistory.map((m, i) => `
        <label style="display:flex;align-items:flex-start;gap:10px;padding:8px;border-radius:var(--radius-sm);background:var(--input-bg);border:1px solid var(--border);cursor:pointer;">
          <input type="checkbox" class="bulk-check" value="${i}" style="margin-top:3px;">
          <div style="flex:1;overflow:hidden;">
            <strong style="color:var(--primary);font-size:0.78rem;">${m.role === 'user' ? '👤 Bạn' : '✨ Jarvis AI'} [${m.time || ''}]</strong>
            <p style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.82rem;color:var(--text-muted);margin:0;">${(m.text || '').replace(/<[^>]+>/g, '').substring(0, 70)}</p>
          </div>
        </label>
      `).join('');
      modal.style.display = 'flex';
      oLay.style.display = 'block';
    };

    let allChecked = false;
    $('btn-select-all-bulk').onclick = () => {
      allChecked = !allChecked;
      document.querySelectorAll('.bulk-check').forEach(ck => ck.checked = allChecked);
      $('btn-select-all-bulk').innerText = allChecked ? "✖️ Bỏ chọn hết" : "☑️ Chọn tất cả";
    };

    $('btn-delete-selected-bulk').onclick = async () => {
      const selected = Array.from(document.querySelectorAll('.bulk-check:checked')).map(ck => parseInt(ck.value)).sort((a, b) => b - a);
      if (!selected.length) return showToast("Chưa chọn tin nhắn nào!", "warning");
      if (confirm(`Bạn có chắc muốn xóa ${selected.length} tin nhắn đã chọn?`)) {
        selected.forEach(idx => chatHistory.splice(idx, 1));
        const s = sessions.find(x => x.id === activeId);
        if (s) { s.lastInteractionId = null; await saveToDB(s); }
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
          engine: DOM.engineSel.value,
          keySel: DOM.apiKeySel.value,
          tmp: DOM.temp.value,
          tpp: DOM.topP.value,
          top: DOM.topK.value,
          thk: DOM.thinking.value,
          useGlob: DOM.toggleGlob.checked,
          sch: DOM.toggleSearch.checked,
          schEngine: DOM.searchEngineSel.value,
          mem: DOM.toggleMemory.checked,
          rag: DOM.toggleRagEmbedding ? DOM.toggleRagEmbedding.checked : true
        });
        if (DOM.engineSel.value === 'stream') {
          s.assignedApiKey = null;
        } else if (DOM.engineSel.value === 'interactions') {
          if (DOM.apiKeySel.value !== 'auto') {
            const idx = parseInt(DOM.apiKeySel.value, 10) + 1;
            let mk = (ls.getItem(`jarvis_api_${idx}`) || ls.getItem(`huanmu_api_${idx}`) || ls.getItem(`javiss_api_${idx}`) || "").trim();
            if (mk.startsWith('JVENC_') || mk.startsWith('ENC_')) mk = deobfuscateKey(mk);
            if (mk) s.assignedApiKey = mk;
          }
        }
        await saveToDB(s);
        renderSel();
      }
      DOM.searchEngineBox.style.display = DOM.toggleSearch.checked ? 'block' : 'none';
    }

    DOM.model.addEventListener('change', () => { updateThinkingVisibility(); updateConfig(); updateKeyQuotaUI(); });
    DOM.engineSel.addEventListener('change', updateConfig);
    [DOM.sysInst, DOM.apiKeySel, DOM.toggleGlob, DOM.toggleSearch, DOM.searchEngineSel, DOM.thinking].forEach(el => el?.addEventListener?.('change', updateConfig));

    if (DOM.btnToggleSessionMem) {
      DOM.btnToggleSessionMem.onclick = () => {
        const s = sessions.find(x => x.id === activeId);
        const cur = s ? (s.mem !== false) : DOM.toggleMemory.checked;
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
        showToast(`Ngữ cảnh trò chuyện [Phiên này]: ${next ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`, next ? 'success' : 'warning');
      };
    }

    DOM.toggleMemory?.addEventListener('change', () => {
      const next = DOM.toggleMemory.checked;
      if (DOM.sessionMemState) {
        DOM.sessionMemState.innerText = next ? 'BẬT' : 'TẮT';
        DOM.sessionMemState.style.color = next ? 'var(--success)' : 'var(--text-muted)';
      }
      updateConfig();
      showToast(`Ngữ cảnh trò chuyện [Phiên này]: ${next ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`, next ? 'success' : 'warning');
    });
    DOM.temp?.addEventListener?.('input', () => { if (DOM.tempVal) DOM.tempVal.innerText = DOM.temp.value; updateConfig(); });
    DOM.topP?.addEventListener?.('input', () => { if (DOM.toppVal) DOM.toppVal.innerText = DOM.topP.value; updateConfig(); });

    // --- MARKDOWN & SYNTAX HIGHLIGHTING RENDERER ---
    async function renderMsgContent(el, t) {
      t = t || "";
      const hideThinking = ls.getItem('jarvis_hide_deepseek_thinking') === 'true' || ls.getItem('jarvis_hide_thinking') === 'true';
      if (hideThinking) {
        t = t.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '')
             .replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '');
      } else {
        t = t.replace(/<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi, (m, p1) => {
          const clean = p1.trim();
          if (!clean) return '';
          const words = clean.split(/\s+/).filter(Boolean).length;
          const chars = clean.length;
          const tokens = Math.max(1, Math.round(chars / 4));
          return `<details class="thinking-block"><summary class="thinking-summary"><span class="thinking-icon">💭</span> Quá trình suy luận <span class="thinking-count">(${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens - bấm để xem)</span></summary><div class="thinking-content">${escapeHtml(clean)}</div></details>`;
        });
      }
      el.innerHTML = marked.parse(t.replace(/\[URL:\s*(https?:\/\/[^\s]+)\]/g, '<a href="$1" target="_blank" style="color:var(--primary);text-decoration:underline;">$1</a>'));
      
      // Math KaTeX
      window.renderMathInElement?.(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });

      // Mermaid diagrams
      const mds = el.querySelectorAll('code.language-mermaid');
      for (let i = 0; i < mds.length; i++) {
        try {
          const { svg } = await mermaid.render('m_' + Date.now() + '_' + i, mds[i].textContent);
          const d = document.createElement('div');
          d.style.cssText = 'overflow-x:auto;padding:10px;text-align:center;background:var(--bg-card);border-radius:var(--radius-md);margin:10px 0;max-width:100%;box-sizing:border-box;';
          d.innerHTML = svg;
          mds[i].parentElement.replaceWith(d);
        } catch {}
      }

      // Code blocks beautification & Copy buttons
      el.querySelectorAll('pre code').forEach(block => {
        if (!block.classList.contains('language-mermaid')) {
          hljs.highlightElement(block);
          const pre = block.parentElement;
          if (!pre.parentElement.classList.contains('code-block-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            const lang = (block.className.match(/language-(\w+)/) || [, 'code'])[1];
            const header = document.createElement('div');
            header.className = 'code-block-header';
            header.innerHTML = `<span>${lang}</span><button class="code-copy-btn">📋 Copy Code</button>`;
            header.querySelector('.code-copy-btn').onclick = function() {
              copyRawText(block.innerText, '📋 Đã copy đoạn mã!');
              this.innerText = '✅ Copied!';
              setTimeout(() => this.innerText = '📋 Copy Code', 2000);
            };
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
          }
        }
      });
    }

    let currentSpeakingBtn = null;
    let currentSpeakingAudio = null;
    let currentSpeechUtterance = null;

    function sanitizeTranscript(text) {
      if (!text) return "";
      return text
        .replace(/```[\s\S]*?```/g, ' [đoạn mã] ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/[#*_~>]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();
    }
    window.sanitizeTranscript = sanitizeTranscript;

    window.openMsgInTTSStudio = (btnOrIdx, directIdx) => {
      let raw = "";
      let idx = directIdx;
      if (typeof btnOrIdx === 'number') {
        idx = btnOrIdx;
      }
      if (idx !== undefined && idx !== null && chatHistory && chatHistory[idx]) {
        raw = chatHistory[idx].text || "";
      }
      if (!raw && btnOrIdx instanceof Element) {
        const container = btnOrIdx.closest('.message-container');
        const msgEl = container?.querySelector('.bot-message, .msg-content');
        raw = msgEl?.getAttribute('data-raw') || msgEl?.innerText || "";
      }
      if (!raw && chatHistory && chatHistory.length > 0) {
        const lastBot = [...chatHistory].reverse().find(m => m.role === 'model');
        if (lastBot) raw = lastBot.text || "";
      }
      const clean = sanitizeTranscript(raw);
      const textToSend = clean || raw;
      if (!textToSend.trim()) {
        showToast("Không tìm thấy nội dung tin nhắn để mở Studio!", "warning");
        return;
      }
      if (typeof window.openTTSStudioModal === 'function') {
        window.openTTSStudioModal(textToSend);
      } else {
        showToast("Đang mở TTS Studio...", "info");
        setTimeout(() => {
          if (typeof window.openTTSStudioModal === 'function') {
            window.openTTSStudioModal(textToSend);
          }
        }, 200);
      }
    };

    function splitTextIntoSmartChunks(text, maxChars = 850) {
      if (!text || text.length <= maxChars) return [text || ""];
      const chunks = [];
      const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
      let cur = "";
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
    window.splitTextIntoSmartChunks = splitTextIntoSmartChunks;

    let currentSpeakingAbort = false;
    let currentSpeakingUrls = [];

    function stopCurrentSpeaking() {
      currentSpeakingAbort = true;
      if (currentSpeakingAudio) {
        try {
          currentSpeakingAudio.pause();
          currentSpeakingAudio.currentTime = 0;
          currentSpeakingAudio.src = "";
        } catch {}
        currentSpeakingAudio = null;
      }
      currentSpeakingUrls.forEach(u => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      currentSpeakingUrls = [];
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
      if (currentSpeakingBtn) {
        currentSpeakingBtn.innerHTML = currentSpeakingBtn.getAttribute('data-original-html') || "🔊 Nghe";
        currentSpeakingBtn.classList.remove('speaking-active');
        currentSpeakingBtn = null;
      }
    }
    window.stopCurrentSpeaking = stopCurrentSpeaking;

    async function playTextAudio(rawText, options = {}) {
      const { btn = null, onStart = null, onEnd = null, onError = null } = options;
      stopCurrentSpeaking();

      const clean = sanitizeTranscript(rawText);
      if (!clean) {
        if (btn) showToast("Không có nội dung văn bản để đọc!", "warning");
        if (onError) onError(new Error("Empty text"));
        return;
      }

      if (btn) {
        if (!btn.getAttribute('data-original-html')) {
          btn.setAttribute('data-original-html', btn.innerHTML);
        }
        btn.innerHTML = "⏳ Đang nạp...";
        btn.classList.add('speaking-active');
        currentSpeakingBtn = btn;
      }
      if (onStart) onStart();

      currentSpeakingAbort = false;
      const chunks = splitTextIntoSmartChunks(clean, 850);
      const isVietnamese = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
      const activeKeys = getGoogleKeysList().filter(Boolean);

      // 1. Thử đọc bằng Gemini TTS chất lượng cao với chuỗi đoạn liên tục (Pipeline Streaming Queue)
      if (activeKeys.length > 0) {
        try {
          const voicePref = $('tts-voice-select')?.value || ls.getItem('jarvis_tts_voice') || 'Charon';
          const ttsModel = $('tts-model-select')?.value || 'gemini-3.8-flash-lite-tts';

          const reqFn = window.requestGeminiAudioWithFailover || (typeof requestGeminiAudioWithFailover === 'function' ? requestGeminiAudioWithFailover : null);
          if (!reqFn) throw new Error("Thư viện Gemini TTS chưa sẵn sàng");

          const fetchChunkAudioUrl = async (textChunk) => {
            if (currentSpeakingAbort) return null;
            const payload = {
              systemInstruction: {
                parts: [{
                  text: "Bạn là trợ lý AI Jarvis với giọng nam giới Nam Bộ. Hãy đọc toàn bộ văn bản được cung cấp với phát âm tiếng Việt chuẩn phương ngữ Nam Bộ (miền Nam Việt Nam), ngữ điệu tự nhiên, ấm áp, thân thiện, gần gũi, rõ ràng từng chữ, tuyệt đối không dùng giọng robot hay giọng người nước ngoài."
                }]
              },
              contents: [{
                role: "user",
                parts: [{ text: textChunk }]
              }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: voicePref
                    }
                  }
                }
              }
            };
            const res = await reqFn(payload, ttsModel, activeKeys, 0);
            let base64Audio = res.outputAudioData || res.data?.output_audio?.data || null;
            if (!base64Audio) {
              const parts = res.data?.candidates?.[0]?.content?.parts || [];
              for (let p of parts) {
                if (p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('audio/')) {
                  base64Audio = p.inlineData.data;
                  break;
                }
              }
            }
            if (!base64Audio) throw new Error("Không nhận được dữ liệu âm thanh");

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
              btn.innerHTML = chunks.length > 1 ? `⏹️ Dừng (${currentChunkIdx + 1}/${chunks.length})` : `⏹️ Dừng`;
            }

            audio.onended = async () => {
              if (currentSpeakingAbort) return;
              currentChunkIdx++;
              if (currentChunkIdx < chunks.length) {
                try {
                  currentAudioUrl = nextChunkPromise ? await nextChunkPromise : await fetchChunkAudioUrl(chunks[currentChunkIdx]);
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

            audio.onerror = (e) => {
              stopCurrentSpeaking();
              if (onError) onError(e);
            };

            await audio.play();
          };

          await playCurrentChunk();
          return;
        } catch (e) {
          console.warn("Gemini TTS phát nhanh lỗi, chuyển sang Web Speech API:", e);
        }
      }

      // 2. Dự phòng: Web Speech API của trình duyệt (đọc tuần tự từng đoạn, không bao giờ ngắt ngang)
      if (!('speechSynthesis' in window)) {
        stopCurrentSpeaking();
        if (onError) onError(new Error("No Web Speech"));
        return showToast("Trình duyệt không hỗ trợ đọc giọng nói!", "warning");
      }

      const voices = window.speechSynthesis.getVoices();
      let viVoice = null;
      if (isVietnamese) {
        viVoice = voices.find(v => (v.lang && (v.lang.startsWith('vi') || v.lang.includes('vi'))) || (v.name && (v.name.toLowerCase().includes('vietnam') || v.name.toLowerCase().includes('vietnamese') || v.name.toLowerCase().includes('tiếng việt') || v.name.toLowerCase().includes('an') || v.name.toLowerCase().includes('linh') || v.name.toLowerCase().includes('mai'))));
        if (!viVoice) {
          stopCurrentSpeaking();
          if (onError) onError(new Error("Không có giọng đọc tiếng Việt"));
          return showToast("⚠️ Trình duyệt chưa có sẵn giọng đọc tiếng Việt và Gemini TTS chưa phản hồi. Vui lòng kiểm tra kết nối API Key!", "warning");
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

        utter.onerror = (e) => {
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
    window.playTextAudio = playTextAudio;

    window.toggleSpeakMsg = async (btn, i) => {
      if (currentSpeakingBtn === btn) {
        stopCurrentSpeaking();
        return;
      }
      const raw = chatHistory[i]?.text || "";
      playTextAudio(raw, { btn });
    };

    window.togglePinMsg = async i => {
      if (!chatHistory[i]) return;
      chatHistory[i].pinned = !chatHistory[i].pinned;
      const s = sessions.find(x => x.id === activeId);
      if (s) { s.his = chatHistory; await saveToDB(s); }
      await reRenderHistory();
      showToast(chatHistory[i].pinned ? "Đã ghim tin nhắn! AI sẽ luôn ghi nhớ nội dung này." : "Đã bỏ ghim tin nhắn.", "info");
    };

    async function appendMsg(sd, t, i, iHL = false) {
      t = t || "";
      const c = document.createElement('div');
      c.className = 'message-container';
      const isPinned = !!chatHistory[i]?.pinned;
      if (isPinned) c.classList.add('pinned-msg');

      const m = document.createElement('div');
      m.className = sd === 'user' ? 'user-message' : 'bot-message';
      m.setAttribute('data-raw', t);

      const ixId = chatHistory[i]?.interactionId;
      const kNum = chatHistory[i]?.keyIndex || chatHistory[i]?.pinnedKey;
      const msgModel = chatHistory[i]?.model;
      const keyBadge = (sd !== 'user' && kNum) ? getKeyBadgeHtml(kNum, msgModel) : '';
      const ixBadge = ((sd !== 'user') && ixId) ? `<span class="interaction-id-badge" title="Interaction ID: ${ixId}">⚡ ID: ${ixId.slice(0, 8)}...</span>` : '';
      const pinnedBadge = isPinned ? `<span class="pinned-tag">📌 ĐÃ GHIM</span>` : '';
      const liveBadge = chatHistory[i]?.isLiveCall ? `<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:rgba(16,185,129,0.15);color:#10b981;font-weight:600;margin-left:4px;border:1px solid rgba(16,185,129,0.3);">📞 Thoại Live</span>` : '';

      m.innerHTML = `
        <div class="message-header">
          <span>${sd === 'user' ? '👤 Bạn' : '✨ Jarvis AI'}</span>
          <span style="font-size:0.72rem;opacity:0.75;margin-left:4px;">🕒 ${chatHistory[i]?.time || getNowTime24h()}</span>
          ${keyBadge}
          ${liveBadge}
          ${pinnedBadge}
          ${ixBadge}
        </div>
        <div class="msg-content"></div>
      `;

      const a = document.createElement('div');
      a.className = 'msg-actions';
      a.innerHTML = `
        <button class="action-btn" onclick="copy(this)" title="Sao chép toàn bộ">📋 Copy</button>
        <button class="action-btn ${isPinned ? 'pinned-active' : ''}" onclick="togglePinMsg(${i})" title="${isPinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn này để AI luôn nhớ'}">${isPinned ? '📌 Bỏ ghim' : '📌 Ghim'}</button>
        <button class="action-btn" onclick="forkSessionAt(${i})" title="Rẽ nhánh tạo phiên mới từ điểm này">🌿 Rẽ nhánh</button>
        ${sd !== 'user' ? `<button class="action-btn tts-btn" onclick="toggleSpeakMsg(this, ${i})" title="Đọc to bằng giọng nói">🔊 Nghe</button><button class="action-btn" onclick="openMsgInTTSStudio(this, ${i})" title="Chuyển nội dung vào Gemini TTS Studio">🎙️ Studio</button>` : ''}
        ${sd === 'user' 
          ? `<button class="action-btn" onclick="editMsg(${i})" title="Chỉnh sửa câu hỏi này">✏️ Sửa</button>` 
          : `<button class="action-btn" onclick="retryMsg(${i})" title="Tạo lại câu trả lời này">🔄 Thử lại</button>`}
        <button class="action-btn" style="color:var(--danger);" onclick="deleteMsg(${i})" title="Xóa tin nhắn này">🗑️ Xóa</button>
      `;

      c.append(m, a);
      DOM.chat.appendChild(c);

      if (!iHL && sd === 'user') DOM.chat.scrollTop = DOM.chat.scrollHeight;
      await renderMsgContent(m.querySelector('.msg-content'), sd === 'user' ? t.replace(/\n/g, '<br>') : t);
    }

    async function reRenderHistory() {
      const s = sessions.find(x => x.id === activeId);
      if (s) { s.his = chatHistory; await saveToDB(s); renderSel(); }
      DOM.chat.innerHTML = '';
      for (let j = 0; j < chatHistory.length; j++) {
        await appendMsg(chatHistory[j].role === 'model' ? 'bot' : 'user', chatHistory[j].text, j, true);
      }
    }
    window.reRenderHistory = reRenderHistory;

    window.copy = b => {
      const c = b.closest('.message-container').querySelector('.user-message, .bot-message');
      if (c) copyRawText(c.getAttribute('data-raw') || c.innerText || '');
    };

    window.deleteMsg = async i => {
      if (confirm("Xóa tin nhắn này?")) {
        chatHistory.splice(i, 1);
        const s = sessions.find(x => x.id === activeId);
        if (s) {
          const prevBot = chatHistory.slice().reverse().find(m => m.role === 'model' && m.interactionId);
          s.lastInteractionId = prevBot?.interactionId || null;
          await saveToDB(s);
        }
        await reRenderHistory();
      }
    };

    window.retryMsg = async i => {
      if (isProcessing || i <= 0 || chatHistory[i - 1].role !== 'user') return;
      const up = chatHistory[i - 1].text;
      chatHistory.splice(i - 1, 2);
      const s = sessions.find(x => x.id === activeId);
      if (s) {
        const prevBot = chatHistory.slice().reverse().find(m => m.role === 'model' && m.interactionId);
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
      chatHistory = chatHistory.slice(0, i);
      const s = sessions.find(x => x.id === activeId);
      if (s) {
        const prevBot = chatHistory.slice().reverse().find(m => m.role === 'model' && m.interactionId);
        s.lastInteractionId = prevBot?.interactionId || null;
        await saveToDB(s);
      }
      await reRenderHistory();
    };

    window.clearActiveSession = async () => {
      if (confirm("Bạn có chắc muốn xóa sạch toàn bộ tin nhắn trong phiên này?")) {
        chatHistory = [];
        const s = sessions.find(x => x.id === activeId);
        if (s) { s.lastInteractionId = null; s.summaryMemory = ''; await saveToDB(s); }
        await reRenderHistory();
        showToast('Đã dọn sạch hội thoại phiên này!');
      }
    };

    // --- SEND MESSAGE (STREAM / INTERACTIONS) ---
    DOM.sendBtn.onclick = async () => {
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

      let gKey = "";
      let keyIndexNum = 1;

      const manualSel = DOM.apiKeySel?.value || cs?.keySel || 'auto';
      if (manualSel !== 'auto') {
        const idx = parseInt(manualSel, 10) + 1;
        let manualKey = (ls.getItem(`jarvis_api_${idx}`) || ls.getItem(`huanmu_api_${idx}`) || ls.getItem(`javiss_api_${idx}`) || "").trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
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

      if (!gKey) return showToast("Cần ít nhất 1 Google API Key trong Cài đặt!", "danger");

      ls.removeItem('jarvis_draft');
      isProcessing = true;
      abortController = new AbortController();
      recordKeyRequest(keyIndexNum, am);

      DOM.sendBtn.innerHTML = `<span>Dừng</span> 🛑`;
      DOM.sendBtn.style.background = 'var(--danger)';

      let finalResp = "",
          botTime = getNowTime24h(),
          dispText = msg || "📎 [Gửi tệp]",
          fP = (txtContent ? (msg ? msg + "\n\n" + txtContent : txtContent) : msg).trim() || "Hãy phân tích nội dung này.",
          bD;
      let recordedIxId = null;
      let streamFinishReason = null;
      let pS = false, lastErr = null;
      let ragMatches = [];
      const startTime = performance.now();

      const saveTurn = async (suffix = '') => {
        if (!finalResp.trim()) return bD?.remove();
        chatHistory.push(
          { role: 'user', text: fP },
          { role: 'model', text: finalResp, time: botTime, interactionId: recordedIxId, keyIndex: keyIndexNum, model: am, pinnedKey: keyIndexNum }
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
          const ixBadge = recordedIxId ? `<span class="interaction-id-badge" title="ID: ${recordedIxId}">⚡ ID: ${recordedIxId.slice(0, 8)}... [🔒 Key ${keyIndexNum}]</span>` : '';
          let ragBadge = '';
          if (ragMatches && ragMatches.length > 0) {
            const topMatch = ragMatches[0];
            const topPct = Math.round(topMatch.similarity * 100);
            const topTitle = topMatch.item?.title || topMatch.item?.docName || 'Tri thức';
            const payload = encodeURIComponent(JSON.stringify(ragMatches.map(m => ({
              title: m.item?.title || m.item?.docName || 'Tri thức',
              type: m.item?.type || 'memory',
              similarity: m.similarity,
              text: m.item?.text || ''
            }))));
            ragBadge = `<span class="rag-status-badge" onclick="window.JarvisRAG.showRetrievedDetails('${payload}')" title="Trích xuất từ: ${escapeHtml(topTitle)} (${topPct}% khớp). Bấm để xem chi tiết!">🧠 Trí nhớ RAG (${ragMatches.length} mục · ${topPct}%)</span>`;
          }
          const keyBadge = getKeyBadgeHtml(keyIndexNum, am);
          bD.querySelector('.message-header').innerHTML = `<span>✨ Jarvis AI</span><span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}${suffix}</span>${keyBadge}${ixBadge}${ragBadge}`;
          const currentBotIdx = chatHistory.length - 1, aDiv = document.createElement('div');
          aDiv.className = 'msg-actions';
          const continueBtn = (streamFinishReason === 'MAX_TOKENS' || (lastErr && pS)) 
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
          const isDefaultSessName = !normName || /^(hội thoại|phiên|cuộc trò chuyện|new session)/i.test(normName);
          if (isDefaultSessName && !cs.isCustomNamed) {
            setTimeout(() => tryAutoNameSession(cs, fP, finalResp, gKey), 200);
          }
        }

        // AUTO-SUMMARY BỘ NHỚ DÀI HẠN
        if (chatHistory.length > 16 && cs) {
          condenseSessionMemory(cs);
        }

        // CHATGPT-STYLE AUTO-LEARN MEMORY (Chỉ kích hoạt khi phiên này đang BẬT Trí nhớ RAG)
        const isRagSessionForLearn = cs ? (cs.rag !== false) : (DOM.toggleRagEmbedding ? DOM.toggleRagEmbedding.checked : true);
        if (isRagSessionForLearn && fP && fP.length >= 8 && window.JarvisRAG && typeof window.JarvisRAG.extractAndLearnMemory === 'function') {
          setTimeout(() => window.JarvisRAG.extractAndLearnMemory(fP, gKey), 400);
        }

        // TỰ ĐỘNG ĐỒNG BỘ NGẦM LÊN CLOUD SAU KHI CHAT XONG (DEBOUNCE 10 GIÂY)
        if (typeof scheduleAutoSync === 'function') {
          scheduleAutoSync(10000);
        }
      };

      try {
        await appendMsg('user', dispText + (filesData.length ? ` [${filesData.length} tệp]` : ''), chatHistory.length, false);
        DOM.input.value = '';
        DOM.input.style.height = '38px';
        updateTokenCount();
        const imgs = [...filesData];
        DOM.clearFilesBtn.click();

        // TYPING INDICATOR BUBBLE
        const currentKeyBadge = getKeyBadgeHtml(keyIndexNum, am);
        bD = document.createElement('div');
        bD.className = 'message-container';
        bD.innerHTML = `
          <div class="bot-message">
            <div class="message-header">
              <span>✨ Jarvis AI</span>
              <span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}</span>
              ${currentKeyBadge}
              <div class="typing-bubble">
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
          const isYt = uMatch.includes("youtube.com") || uMatch.includes("youtu.be");
          let urlBadge = null;
          const msgHdr = bD?.querySelector('.message-header');
          if (msgHdr) {
            urlBadge = document.createElement('span');
            urlBadge.className = 'search-status-badge';
            urlBadge.style.cssText = 'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
            urlBadge.innerHTML = isYt ? `📺 Đang bóc tách video YouTube...` : `🌐 Đang bóc tách liên kết...`;
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
        if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");

        // WEB SEARCH (TAVILY / SERPER)
        const quoted = extractQuotedKeywords(fnP);
        if (quoted && DOM.toggleSearch.checked) {
          const tgt = DOM.searchEngineSel.value === 'serper' ? 'serper' : 'tavily';

          let actualSearchQuery = quoted;
          const now = new Date();
          const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
          if (/(^|\s)(hôm nay|mới nhất|hôm qua)(\s|$)/i.test(quoted) && !quoted.includes(String(now.getFullYear()))) {
            actualSearchQuery = `${quoted} ${dateStr}`;
          }

          let searchBadge = null;
          const msgHdr = bD?.querySelector('.message-header');
          if (msgHdr) {
            searchBadge = document.createElement('span');
            searchBadge.className = 'search-status-badge';
            searchBadge.style.cssText = 'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
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
            showToast(`⚠️ Lỗi ${tgt}: ${sErr.message || 'Không kết nối được'}. Thử fallback...`, 'warning');
            try {
              if (searchBadge) searchBadge.innerHTML = `🌐 Đang thử fallback...`;
              sText = await fallbackFn(actualSearchQuery);
            } catch (fbErr) {
              console.warn("Fallback search cũng lỗi:", fbErr);
              showToast(`❌ Không thể tìm kiếm web: ${fbErr.message || sErr.message}`, 'danger');
            }
          }

          if (sText) {
            if (searchBadge) {
              searchBadge.style.background = 'rgba(16,185,129,0.15)';
              searchBadge.style.color = '#10b981';
              searchBadge.innerHTML = `✓ Đã cập nhật Web: "${escapeHtml(quoted)}"`;
              setTimeout(() => { if (searchBadge) searchBadge.remove(); }, 5000);
            }
            fnP = `[DỮ LIỆU TÌM ĐƯỢC TỪ INTERNET CHO TỪ KHÓA "${quoted}"]:\n${sText}\n\n[HÃY TỔNG HỢP THÔNG TIN TÌM ĐƯỢC Ở TRÊN ĐỂ TRẢ LỜI CÂU HỎI SAU]:\n${fnP}`;
          } else if (searchBadge) {
            searchBadge.style.background = 'rgba(239,68,68,0.15)';
            searchBadge.style.color = '#ef4444';
            searchBadge.innerHTML = `⚠️ Không lấy được dữ liệu web`;
            setTimeout(() => { if (searchBadge) searchBadge.remove(); }, 4000);
          }
        }
        if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");

        // RAG / SECOND BRAIN CONTEXT RETRIEVAL (Gemini Embedding 2 - Chỉ kích hoạt khi phiên này đang BẬT Trí nhớ RAG)
        let ragSnippet = '';
        const isRagSessionForQuery = cs ? (cs.rag !== false) : (DOM.toggleRagEmbedding ? DOM.toggleRagEmbedding.checked : true);
        if (isRagSessionForQuery && window.JarvisRAG && typeof window.JarvisRAG.retrieveContext === 'function') {
          try {
            const ragRes = await window.JarvisRAG.retrieveContext(fP, gKey);
            if (typeof ragRes === 'string') {
              ragSnippet = ragRes;
            } else if (ragRes) {
              ragSnippet = ragRes.text || '';
              ragMatches = ragRes.matches || [];
            }
          } catch (rErr) {
            console.warn("[RAG] Lỗi truy vấn ngữ cảnh:", rErr);
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
              liveBadge.style.cssText = 'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(139,92,246,0.15);color:#8b5cf6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:6px;';
              liveBadge.innerHTML = `🧠 Đã nạp ${ragMatches.length} mục tri thức (${Math.round(ragMatches[0].similarity * 100)}%)`;
              msgHdr.appendChild(liveBadge);
            }
          }
        }

        const base64Files = [];
        for (const f of imgs) base64Files.push(await fileToBase64(f));

        const nowForTurn = new Date();
        const curDateText = `${nowForTurn.getDate()}/${nowForTurn.getMonth() + 1}/${nowForTurn.getFullYear()}`;
        const promptWithTime = `[Mốc thời gian gửi tin: ${curDateText} (Năm ${nowForTurn.getFullYear()})]\n${fnP}`;

        const currentParts = [{ text: promptWithTime }];
        base64Files.forEach(({ mimeType, data }) => {
          currentParts.push({ inlineData: { mimeType, data } });
        });

        const interactionInput = [];
        if (fnP) interactionInput.push({ type: 'text', text: promptWithTime });
        base64Files.forEach(({ mimeType, data }) => {
          interactionInput.push({ type: 'image', data, mime_type: mimeType });
        });

        const thk = DOM.thinking.value;

        // --- ENGINE 0: EXPERIENTIAL LABS GATEWAY (gpt-6-luna, deepseek-v4.1-flash, clef) ---
        const isExplabsModel = (am === 'gpt-6-luna' || am === 'deepseek-v4.1-flash' || am === 'clef');
        if (isExplabsModel) {
          const expKey = (ls.getItem('explabs_api_key') || 'xpl_71c47c840e1af2b6e28d3f04909884a5eaf35752').trim();
          if (!expKey) {
            bD.remove();
            showToast("Vui lòng nhập Experiential Labs API Key trong Cài đặt (⚙️)!", "danger");
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
                  'Authorization': 'Bearer ' + expKey
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
                        negative_or_alert: 'Nội dung cảnh báo, sự cố, cần can thiệp khẩn cấp hoặc câu hỏi tiêu cực'
                      }
                    }
                  }
                }),
                signal: abortController.signal
              });

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData?.error?.message || ('HTTP ' + res.status));
              }

              const data = await res.json();
              const ans = data?.answers?.analysis;
              finalResp = "### 🎯 Kết quả Quyết định từ Mô hình Clef (Decision Engine)\n" +
                "- **Quyết định (Choice):** `" + (ans?.choice || 'N/A') + "`\n" +
                "- **Độ tin cậy (Confidence):** `" + (ans?.confidence ? (Math.round(ans.confidence * 100) + '%') : 'N/A') + "`\n" +
                "- **Xác suất phân bổ (Probabilities):**\n" +
                "```json\n" +
                JSON.stringify(ans?.probabilities || {}, null, 2) + "\n" +
                "```\n" +
                "- **Token đã dùng:** `" + (data?.usage?.input_tokens || 0) + "` input tokens (Provider: `" + (data?.provider || 'experiential_cloud') + "`)";

              await renderer.flush(finalResp);
              pS = true;
              if ($('latency-val')) $('latency-val').innerText = Math.round(performance.now() - startTime);
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
                  expMessages.push({
                    role: m.role === 'model' ? 'assistant' : 'user',
                    content: m.text
                  });
                });
              }
              if (base64Files && base64Files.length > 0) {
                const userContent = [{ type: 'text', text: promptWithTime }];
                for (const f of base64Files) {
                  if (f.mimeType && f.mimeType.startsWith('image/')) {
                    userContent.push({
                      type: 'image_url',
                      image_url: {
                        url: `data:${f.mimeType};base64,${f.data}`
                      }
                    });
                  }
                }
                expMessages.push({ role: 'user', content: userContent });
              } else {
                expMessages.push({ role: 'user', content: promptWithTime });
              }

              const expRes = await fetch('https://api.experientiallabs.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + expKey
                },
                body: JSON.stringify({
                  model: am,
                  messages: expMessages,
                  stream: true,
                  max_tokens: 4096
                }),
                signal: abortController.signal
              });

              if (!expRes.ok) {
                const errData = await expRes.json().catch(() => ({}));
                throw new Error(errData?.error?.message || ('HTTP ' + expRes.status));
              }

              const reader = expRes.body.getReader();
              const decoder = new TextDecoder();
              let sseDone = false;
              let sseBuffer = '';
              let currentThinking = '';
              let currentContent = '';

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
                      const deltaThinking = parsed.choices?.[0]?.delta?.reasoning_content || '';
                      const deltaText = parsed.choices?.[0]?.delta?.content || '';
                      if (deltaThinking) currentThinking += deltaThinking;
                      if (deltaText) currentContent += deltaText;
                      if (deltaThinking || deltaText) {
                        finalResp = formatThinkingResponse(currentThinking, currentContent, 'DeepSeek');
                        renderer.push(finalResp);
                        if ($('latency-val') && !pS) $('latency-val').innerText = Math.round(performance.now() - startTime);
                        pS = true;
                      }
                    } catch (_) {}
                  }
                }
              }

              finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'DeepSeek');
              if (currentThinking || currentContent) {
            // FAIL-SAFE: Nếu mô hình chỉ trả về suy luận mà quên xuất câu trả lời cuối:
            if (!currentContent.trim() && currentThinking.trim()) {
              currentContent = currentThinking.trim();
              currentThinking = "";
            }
            finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
          }
          await renderer.flush(finalResp);
              pS = true;
            } catch (expErr) {
              if (expErr.name === 'AbortError' || abortController.signal.aborted) throw expErr;
              lastErr = expErr;
              if (pS) {
                finalResp += `\n\n*(⚠️ Quá trình stream bị ngắt: ${expErr.message})*`;
                if (currentThinking || currentContent) {
            // FAIL-SAFE: Nếu mô hình chỉ trả về suy luận mà quên xuất câu trả lời cuối:
            if (!currentContent.trim() && currentThinking.trim()) {
              currentContent = currentThinking.trim();
              currentThinking = "";
            }
            finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
          }
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

        // ENGINE 1: INTERACTIONS API
        if (currentEngine === 'interactions') {
          const interactionParams = {
            model: am,
            input: imgs.length ? interactionInput : promptWithTime,
            stream: true
          };

          const dynamicSI = getDynamicSI(ragSnippet);
          if (dynamicSI) {
            interactionParams.system_instruction = dynamicSI;
          }

          // Cấu hình GenerationConfig cho Interactions API (không nhận temperature/topP/topK)
          const genConfig = {};
          if (thk && thk !== 'none') {
            genConfig.thinking_level = thk;
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
              const histSummary = chatHistory.slice(-10).map(m => `${m.role === 'model' ? 'AI' : 'Người dùng'}: ${m.text}`).join('\n\n');
              const seededPrompt = `[BỐI CẢNH CÁC LƯỢT TRÒ CHUYỆN TRƯỚC ĐÓ]:\n${histSummary}\n\n[CÂU HỎI TIẾP THEO CỦA NGƯỜI DÙNG]:\n${fnP}`;
              if (imgs.length) {
                interactionParams.input = [
                  { type: 'text', text: seededPrompt },
                  ...base64Files.map(({ mimeType, data }) => ({ type: 'image', data, mime_type: mimeType }))
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

          while (retryCount <= maxRetries) {
            try {
              const ai = new GoogleGenAI({
                apiKey: currentTryKey
              });

              try {
                streamObj = await ai.interactions.create(interactionParams);
              } catch (ixErr) {
                if (interactionParams.previous_interaction_id && (
                  ixErr.message.includes('not found') ||
                  ixErr.message.includes('404') ||
                  ixErr.message.includes('invalid') ||
                  ixErr.message.includes('interaction')
                )) {
                  delete interactionParams.previous_interaction_id;
                  if (cs) {
                    cs.lastInteractionId = null;
                    await saveToDB(cs);
                  }
                  if (chatHistory.length > 0) {
                    const histSummary = chatHistory.slice(-10).map(m => `${m.role === 'model' ? 'AI' : 'Người dùng'}: ${m.text}`).join('\n\n');
                    const seededPrompt = `[BỐI CẢNH CÁC LƯỢT TRÒ CHUYỆN TRƯỚC ĐÓ]:\n${histSummary}\n\n[CÂU HỎI TIẾP THEO CỦA NGƯỜI DÙNG]:\n${fnP}`;
                    if (imgs.length) {
                      interactionParams.input = [
                        { type: 'text', text: seededPrompt },
                        ...base64Files.map(({ mimeType, data }) => ({ type: 'image', data, mime_type: mimeType }))
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
              const isKeyOrQuotaErr = err.message && (
                err.message.includes('API key') ||
                err.message.includes('403') ||
                err.message.includes('429') ||
                err.message.includes('quota') ||
                err.message.includes('RESOURCE_EXHAUSTED')
              );

              if (isKeyOrQuotaErr && apiKeys.length > 1 && retryCount < maxRetries) {
                retryCount++;
                currentTryKey = apiKeys[(apiKeys.indexOf(currentTryKey) + 1) % apiKeys.length];
                delete interactionParams.previous_interaction_id;
                if (cs) cs.lastInteractionId = null;
                console.warn(`Interactions: Key lỗi, xoay sang Key tiếp theo (lần ${retryCount}):`, err.message);
                continue;
              } else {
                break;
              }
            }
          }

          if (streamObj) {
            try {
              let currentThinking = "";
              let currentContent = "";

              for await (const event of streamObj) {
                const foundId = event.interaction?.id || event.id || event.interaction_id;
                if (foundId) recordedIxId = foundId;

                let chunkText = "";
                let chunkThought = "";
                if (event.event_type === "step.delta") {
                  if (event.delta?.type === "thought" || event.delta?.type === "reasoning") {
                    chunkThought = event.delta.text || "";
                  } else if (event.delta?.type === "text") {
                    chunkText = event.delta.text || "";
                  }
                } else if (event.delta?.thought) {
                  chunkThought = event.delta.thought;
                } else if (event.delta?.text) {
                  chunkText = event.delta.text;
                } else if (event.text) {
                  chunkText = event.text;
                } else if (event.event_type === "interaction.completed" && !currentContent && event.interaction?.output_text) {
                  chunkText = event.interaction.output_text;
                }

                if (chunkThought) currentThinking += chunkThought;
                if (chunkText) currentContent += chunkText;

                if (chunkThought || chunkText) {
                  bD.querySelector('.typing-bubble')?.remove();
                  finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
                  renderer.push(finalResp);
                  if ($('latency-val') && !pS) $('latency-val').innerText = Math.round(performance.now() - startTime);
                  pS = true;
                }
              }

              finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
              await renderer.flush(finalResp);
            } catch (streamErr) {
              lastErr = streamErr;
              if (pS) {
                console.warn("Interactions stream lỗi giữa chừng:", streamErr);
                finalResp += `\n\n*(⚠️ Quá trình tạo chữ bị ngắt giữa chừng do lỗi stream: ${streamErr.message || 'Mất kết nối'})`;
                await renderer.flush(finalResp);
                showToast("Đường truyền stream bị ngắt giữa chừng!", "warning");
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
              const unaryText = ixResult?.output_text || ixResult?.outputs?.find(o => o.type === 'text')?.text || "";
              if (unaryText) {
                bD.querySelector('.typing-bubble')?.remove();
                finalResp = unaryText;
                renderer.push(finalResp);
                await renderer.flush(finalResp);
                if ($('latency-val') && !pS) $('latency-val').innerText = Math.round(performance.now() - startTime);
                pS = true;
              }
            } catch (uErr) {
              lastErr = uErr;
            }
          }

          // Tự động dự phòng chuyển sang Stream Engine nếu Interactions API không phản hồi
          if (!pS) {
            const errDetail = lastErr?.message ? ` (${lastErr.message})` : '';
            console.warn("Interactions API gặp sự cố" + errDetail + ", tự động dùng Stream Engine dự phòng:", lastErr);
            showToast("Interactions API gặp sự cố" + errDetail + ", tự động dùng Stream Engine dự phòng.", "warning");
          }
        }

        // ENGINE 2: GENERATECONTENTSTREAM
        if (!pS) {
          const contents = [];
          if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
            chatHistory.slice(-16).forEach(m => {
              let cleanText = (m.text || '');
              // Loại bỏ khối HTML details hoặc thẻ think khỏi ngữ cảnh gửi cho AI để tránh làm nhiễu mô hình
              cleanText = cleanText.replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '').trim();
              cleanText = cleanText.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, '').trim();
              if (!cleanText && m.role === 'model') {
                // Nếu tin nhắn cũ từng chỉ có suy luận, lọc thẻ HTML lấy văn bản thuần
                cleanText = (m.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              }
              if (cleanText) {
                contents.push({
                  role: m.role === 'model' ? 'model' : 'user',
                  parts: [{ text: cleanText }]
                });
              }
            });
          }
          contents.push({ role: 'user', parts: currentParts });

          const budgetMap = { minimal: 1024, low: 2048, medium: 4096, high: 8192 };
          const config = {
            systemInstruction: getDynamicSI(ragSnippet),
            safetySettings: SAFETY,
            maxOutputTokens: 32768
          };
          if (thk && thk !== 'none') {
            const b = budgetMap[thk] || 4096;
            config.thinkingConfig = {
              thinkingBudget: b,
              includeThoughts: true
            };
          } else {
            config.temperature = DOM.temp?.value !== undefined ? +DOM.temp.value : 0.5;
            config.topP = DOM.topP?.value !== undefined ? +DOM.topP.value : 0.9;
            config.topK = DOM.topK?.value !== undefined ? +DOM.topK.value : 40;
          }

          let streamAttempts = 0;
          const maxStreamAttempts = Math.max(Math.min(apiKeys.length || 1, 3), 2);
          let currentThinking = "";
          let currentContent = "";

          while (streamAttempts < maxStreamAttempts) {
            streamAttempts++;
            try {
              const resStream = await new GoogleGenAI({ apiKey: gKey }).models.generateContentStream({
                model: am,
                contents,
                config,
                abortSignal: abortController.signal
              });

              for await (const ck of resStream) {
                const reason = ck.candidates?.[0]?.finishReason;
                if (reason && reason !== 'STOP') streamFinishReason = reason;

                let deltaThought = "";
                let deltaText = "";

                if (ck.candidates?.[0]?.content?.parts) {
                  for (const part of ck.candidates[0].content.parts) {
                    if (part.thought) {
                      const t = typeof part.thought === 'string' ? part.thought : (typeof part.text === 'string' ? part.text : '');
                      if (t) deltaThought += t;
                    } else if (typeof part.text === 'string') {
                      deltaText += part.text;
                    }
                  }
                } else {
                  try {
                    deltaText = ck.text || "";
                  } catch (_) {}
                }

                if (deltaThought) currentThinking += deltaThought;
                if (deltaText) currentContent += deltaText;

                if (deltaThought || deltaText) {
                  bD.querySelector('.typing-bubble')?.remove();
                  finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
                  renderer.push(finalResp);
                  if ($('latency-val') && !pS) $('latency-val').innerText = Math.round(performance.now() - startTime);
                  pS = true;
                }
              }

              lastErr = null;
              break;
            } catch (e) {
              if (e.name === 'AbortError' || abortController.signal.aborted) throw e;
              lastErr = e;

              // 1. Nếu lỗi xảy ra trước khi nhận chữ (!pS): Tự phục hồi thông minh
              if (!pS) {
                console.warn(`generateContentStream lần ${streamAttempts} lỗi:`, e.message);

                // A. Nếu lỗi do thinkingConfig (400 Bad Request): Thử chuyển sang thinkingBudget hoặc gỡ bỏ
                if (config.thinkingConfig && (e.message?.includes('thinking') || e.message?.includes('400') || e.message?.includes('INVALID_ARGUMENT'))) {
                  if (config.thinkingConfig.thinkingLevel) {
                    const budgetMap = { minimal: 1024, low: 2048, medium: 4096, high: 8192 };
                    const b = budgetMap[config.thinkingConfig.thinkingLevel] || -1;
                    config.thinkingConfig = { thinkingBudget: b, includeThoughts: true };
                    console.info(`[Fallback] Thử lại thinkingConfig với thinkingBudget: ${b}...`);
                    continue;
                  }
                  delete config.thinkingConfig;
                  config.temperature = 0.5;
                  console.info("[Fallback] Gỡ thinkingConfig, thử lại với cấu hình chuẩn...");
                  continue;
                }

                // B. Nếu lỗi do Model không tìm thấy hoặc khai tử (404 Not Found): Chuyển sang Flash-Lite / 3.8 Flash
                if (e.message?.includes('404') || e.message?.includes('not found')) {
                  am = (am === 'gemini-3.8-flash') ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';
                  console.warn(`[Fallback] Chuyển sang model dự phòng: ${am}`);
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
                  showToast(`⚠️ Key #${keyIndexNum} bận hoặc hết hạn ngạch, đang xoay sang Key tiếp theo...`, 'warning');
                  continue;
                }
                break;
              }

              // 2. Nếu đã nhận được chữ (pS) mà bị đứt stream giữa chừng
              const isStreamCutoff = e.message && (
                e.message.includes('Incomplete JSON') ||
                e.message.includes('network') ||
                e.message.includes('fetch') ||
                e.message.includes('Failed to fetch') ||
                e.message.includes('429') ||
                e.message.includes('quota')
              );

              if (pS && isStreamCutoff && streamAttempts < maxStreamAttempts && !abortController.signal.aborted) {
                console.warn(`Stream bị ngắt giữa chừng (${e.message}), tự động xoay key và nối tiếp luồng...`);
                showToast("⚡ Đang tự động kết nối lại để viết tiếp...", "info");

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
                  chatHistory.slice(-6).forEach(m => contents.push({
                    role: m.role === 'model' ? 'model' : 'user',
                    parts: [{ text: m.text }]
                  }));
                }
                contents.push({
                  role: 'user',
                  parts: [{ text: `Câu hỏi ban đầu: "${fP}"\n\nBạn đang trả lời dở đến đoạn sau:\n"...${lastTail}"\n\nHãy tiếp tục viết phần còn lại ngay từ điểm dừng trên, không lặp lại đoạn đã viết để hoàn tất câu trả lời.` }]
                });

                continue;
              } else {
                if (pS) {
                  console.warn("Lỗi stream giữa chừng:", e);
                  finalResp += `\n\n*(⚠️ Quá trình tạo chữ bị ngắt giữa chừng: ${e.message || 'Mất kết nối stream'})*`;
                  showToast("Đường truyền stream bị ngắt giữa chừng!", "warning");
                }
                break;
              }
            }
          }

          if (streamFinishReason === 'MAX_TOKENS') {
            finalResp += '\n\n*(⚠️ Đã đạt giới hạn độ dài phản hồi của mô hình - Max Tokens)*';
            showToast("Phản hồi đạt giới hạn độ dài tối đa!", "warning");
          } else if (streamFinishReason === 'SAFETY') {
            finalResp += '\n\n*(⚠️ Nội dung tiếp theo bị ngắt bởi bộ lọc an toàn của Google - Safety)*';
            showToast("Nội dung bị dừng bởi bộ lọc an toàn của Google!", "warning");
          } else if (streamFinishReason === 'RECITATION') {
            finalResp += '\n\n*(⚠️ Nội dung tiếp theo bị ngắt do phát hiện trùng lặp bản quyền - Recitation)*';
            showToast("Nội dung bị dừng do phát hiện trùng lặp bản quyền!", "warning");
          }

          if (currentThinking || currentContent) {
            // FAIL-SAFE: Nếu mô hình chỉ trả về suy luận mà quên xuất câu trả lời cuối:
            if (!currentContent.trim() && currentThinking.trim()) {
              currentContent = currentThinking.trim();
              currentThinking = "";
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
          showToast("Đã dừng phản hồi!", "warning");
          await saveTurn(' (Đã dừng)');
        } else {
          showToast("Lỗi: " + err.message, 'danger');
          bD?.remove();
        }
      } finally {
        const wasAborted = abortController?.signal?.aborted;
        isProcessing = false;
        abortController = null;
        DOM.sendBtn.innerHTML = `<span>Gửi</span> <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
        DOM.sendBtn.style.background = 'var(--primary)';

        // --- HANDS-FREE VOICE FLOW COMPLETION HOOK ---
        if (isHandsFreeActive) {
          if (finalResp && !wasAborted) {
            isHandsFreeSpeaking = true;
            const statusText = $('hf-status-text');
            if (statusText) statusText.innerHTML = '<span style="color:#8b5cf6;font-weight:600;">🔊 Jarvis đang trả lời (Nam Bộ)...</span>';

            playTextAudio(finalResp, {
              onEnd: () => {
                isHandsFreeSpeaking = false;
                if (isHandsFreeActive) {
                  const status = $('hf-status-text');
                  if (status) status.innerHTML = '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
                  const prev = $('hf-transcript-preview');
                  if (prev) prev.innerText = "";
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
                  if (status) status.innerHTML = '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
                  setTimeout(() => {
                    if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                      startHandsFreeListener();
                    }
                  }, 300);
                }
              }
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
            if (d.knowledgeBase && Array.isArray(d.knowledgeBase) && window.JarvisRAG && typeof window.JarvisRAG.importKnowledge === 'function') {
              try { await window.JarvisRAG.importKnowledge(d.knowledgeBase, true); } catch (e) {}
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
                try { folders = JSON.parse(d.configs.jarvis_folders); } catch {}
              }
            }
            initAPIKeys();
            initExternalConfigs();
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
      DOM.previewBox.style.display = (filesData.length || txtContent) ? 'block' : 'none';
      DOM.fileCount.innerText = filesData.length + (txtContent ? 1 : 0);
      DOM.previewGrid.innerHTML = filesData.map((f, i) => `
        <div style="position:relative;width:50px;height:50px;background:#1e293b;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;overflow:hidden;border:1px solid var(--border);">
          ${f.type.startsWith('image') ? `<img src="${URL.createObjectURL(f)}" style="width:100%;height:100%;object-fit:cover;">` : '📄 FILE'}
          <button onclick="rmImg(${i})" style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,0.9);color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">×</button>
        </div>
      `).join('');
    }

    window.rmImg = i => {
      filesData.splice(i, 1);
      renderFiles();
      updateTokenCount();
    };

    DOM.clearFilesBtn.onclick = () => {
      filesData = [];
      txtContent = "";
      DOM.textFileList.innerHTML = "";
      renderFiles();
      updateTokenCount();
    };

    const fileToBase64 = f => new Promise(r => {
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
  
    // --- FLOATING SELECTION TOOLBAR CONTROLLER ---
    const selToolbar = $('selection-toolbar');
    let currentSelectedText = "";

    function hideSelectionToolbar() {
      if (selToolbar) selToolbar.style.display = 'none';
    }

    const checkSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        hideSelectionToolbar();
        return;
      }
      const txt = sel.toString().trim();
      if (txt.length < 2) {
        hideSelectionToolbar();
        return;
      }

      const anchor = sel.anchorNode;
      if (!DOM.chat || !DOM.chat.contains(anchor)) {
        hideSelectionToolbar();
        return;
      }

      currentSelectedText = txt;
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        let top = rect.top - 44;
        let left = rect.left + (rect.width / 2) - 140;

        if (top < 10) top = rect.bottom + 8;
        if (left < 10) left = 10;
        if (left + 290 > window.innerWidth) left = window.innerWidth - 300;

        selToolbar.style.top = `${top}px`;
        selToolbar.style.left = `${left}px`;
        selToolbar.style.display = 'flex';
      } catch (e) {}
    };

    document.addEventListener('selectionchange', checkSelection);
    document.addEventListener('mouseup', checkSelection);
    document.addEventListener('touchend', checkSelection);

    const runQuickActionOnText = instruction => {
      if (!currentSelectedText) return;
      hideSelectionToolbar();
      DOM.input.value = `${instruction}\n> "${currentSelectedText}"`;
      DOM.input.dispatchEvent(new Event('input'));
      DOM.sendBtn.click();
    };

    $('sel-btn-explain').onclick = () => runQuickActionOnText("Hãy giải thích chi tiết, dễ hiểu đoạn văn bản sau:");
    $('sel-btn-translate').onclick = () => runQuickActionOnText("Hãy dịch đoạn văn bản sau sang tiếng Việt chuẩn xác (hoặc tiếng Anh nếu gốc đã là tiếng Việt):");
    $('sel-btn-summarize').onclick = () => runQuickActionOnText("Hãy tóm tắt ngắn gọn các ý cốt lõi của đoạn văn bản sau thành các gạch đầu dòng:");
    $('sel-btn-copy').onclick = () => {
      copyRawText(currentSelectedText);
      hideSelectionToolbar();
      showToast("Đã sao chép đoạn chọn!", "success");
    };

    // --- SMART FOLLOW-UP QUESTIONS GENERATOR (TẠM THỜI TRÊN DOM, KHÔNG LƯU INDEXEDDB) ---
    function renderFollowUpChips(lines) {
      if (!lines || !lines.length) return null;
      const fBox = document.createElement('div');
      fBox.className = 'follow-up-container';
      fBox.innerHTML = `
        <span class="follow-up-title">💡 Gợi ý câu hỏi tiếp theo:</span>
        ${lines.map(q => `<button class="follow-up-chip" type="button"><span>👉</span> ${escapeHtml(q)}</button>`).join('')}
      `;
      fBox.querySelectorAll('.follow-up-chip').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const query = btn.innerText.replace(/^👉\s*/, '').trim();
          fBox.remove();
          DOM.input.value = query;
          DOM.input.dispatchEvent(new Event('input'));
          DOM.input.focus();
          DOM.sendBtn.click();
        };
      });
      return fBox;
    }

    async function generateFollowUpSuggestions(userPrompt, botReply, botContainer) {
      if (!botReply || botReply.trim().length < 4) return;
      try {
        const cs = sessions.find(x => x.id === activeId);
        const k = getSessionApiKey(cs) || (apiKeys.length ? apiKeys[0] : '');
        if (!k) return;
        const ai = new GoogleGenAI({ apiKey: k });
        const targetModel = FLASH_LITE_MODEL; // Tiết kiệm quota 20 RPD của 3.6 Flash, dùng Flash-Lite (500 RPD)
        const res = await ai.models.generateContent({
          model: targetModel,
          contents: `Bạn là trợ lý AI thông minh. Dựa vào đối thoại vừa rồi:\nNgười dùng: "${(userPrompt || '').slice(0, 150)}"\nAI: "${botReply.slice(0, 250)}"\nHãy gợi ý đúng 3 câu hỏi tiếp theo thật ngắn gọn bằng tiếng Việt (mỗi câu tối đa 8 từ, mỗi câu trên 1 dòng, không đánh số, không gạch đầu dòng, không giải thích gì thêm) để người dùng có thể bấm vào hỏi tiếp:`,
          config: {
            safetySettings: SAFETY,
            maxOutputTokens: 350,
            temperature: 0.7
          }
        });

        let text = '';
        try {
          text = res.text || '';
        } catch (_) {}
        if (!text && res.candidates?.[0]?.content?.parts) {
          text = res.candidates[0].content.parts.map(p => p.text || '').join('\n').trim();
        }

        const lines = text.split('\n')
          .map(l => l.replace(/^[-*0-9.)\s👉💡]+/, '').trim())
          .filter(l => l.length >= 2 && l.length <= 60)
          .slice(0, 3);

        if (lines.length > 0) {
          document.querySelectorAll('.follow-up-container').forEach(el => el.remove());
          const fBox = renderFollowUpChips(lines);
          const container = botContainer || DOM.chat.querySelector('.message-container:last-child');
          const target = container?.querySelector('.msg-content') || container?.querySelector('.bot-message') || container;
          if (fBox && target) {
            target.appendChild(fBox);
          }
        }
      } catch (err) {
        console.warn("Lỗi tạo follow-up suggestions:", err);
      }
    }



    // --- KEY & CONFIG SYNC HELPERS (PROTECTED AGAINST SECRET SCANNER) ---

    window.getGoogleKeysList = (obfuscate = false) => getGoogleKeysList(obfuscate);
    function getGoogleKeysList(obfuscate = false) {
      const list = [];
      for (let i = 1; i <= 10; i++) {
        const val = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || "").trim();
        list.push(obfuscate && val ? obfuscateKey(val) : val);
      }
      return list;
    }

    function setGoogleKeysList(keys) {
      if (!Array.isArray(keys)) return;
      for (let i = 1; i <= 10; i++) {
        let val = (keys[i - 1] || "").trim();
        if (val.startsWith('JVENC_') || val.startsWith('ENC_')) val = deobfuscateKey(val);
        ls.setItem(`jarvis_api_${i}`, val);
        ls.setItem(`huanmu_api_${i}`, val);
        if ($(`api-key-${i}`)) $(`api-key-${i}`).value = val;
      }
      initAPIKeys();
    }

    function getGoogleKeyNamesList() {
      const list = [];
      for (let i = 1; i <= 10; i++) {
        const val = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || "").trim();
        list.push(val);
      }
      return list;
    }

    function setGoogleKeyNamesList(names) {
      if (!Array.isArray(names)) return;
      for (let i = 1; i <= 10; i++) {
        const val = (names[i - 1] || "").trim();
        ls.setItem(`jarvis_api_name_${i}`, val);
        ls.setItem(`huanmu_api_name_${i}`, val);
        if ($(`api-key-name-${i}`)) $(`api-key-name-${i}`).value = val;
      }
      initAPIKeys();
    }

    function getExternalConfigsObj(obfuscate = false) {
      const obj = {};
      cfgMap.forEach(([_, k]) => {
        const val = ls.getItem(k) || '';
        obj[k] = (obfuscate && val) ? obfuscateKey(val) : val;
      });
      obj['live_search_enabled'] = ls.getItem('live_search_enabled') || 'true';
      obj['live_context_enabled'] = ls.getItem('live_context_enabled') || 'true';
      return obj;
    }

    function setExternalConfigsObj(obj) {
      if (!obj || typeof obj !== 'object') return;
      Object.entries(obj).forEach(([k, val]) => {
        let v = val;
        if (typeof v === 'string' && (v.startsWith('JVENC_') || v.startsWith('ENC_'))) {
          v = deobfuscateKey(v);
        }
        ls.setItem(k, v);
      });
      initExternalConfigs();
    }

    // --- [GITHUB GIST CLOUD SYNC & 2-WAY SMART MERGE MOVED TO js/sync.js] ---
    function scheduleAutoSync(delay = 10000) {
      if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
        window.JarvisSync.scheduleAutoSync(delay);
      }
    }

    // Global shared states for modular extensions (live.js, sync.js, rag.js, tts.js)
    try {
      Object.defineProperty(window, 'sessions', { get: () => sessions, set: v => { sessions = v; }, configurable: true });
      Object.defineProperty(window, 'activeId', { get: () => activeId, set: v => { activeId = v; }, configurable: true });
      Object.defineProperty(window, 'chatHistory', { get: () => chatHistory, set: v => { chatHistory = v; }, configurable: true });
      Object.defineProperty(window, 'folders', { get: () => folders, set: v => { folders = v; }, configurable: true });
      Object.defineProperty(window, 'activeFolder', { get: () => activeFolder, set: v => { activeFolder = v; }, configurable: true });
      Object.defineProperty(window, 'customPrompts', { get: () => customPrompts, set: v => { customPrompts = v; }, configurable: true });
    } catch (e) {
      console.warn("Property definition error:", e);
    }

    window.clearAllDB = clearAllDB;
    window.sanitizeSessionForBackup = sanitizeSessionForBackup;
    window.renderFolders = renderFolders;
    window.renderSnippets = renderSnippets;
    window.renderTabs = renderTabs;
    window.appendMsg = appendMsg;
    window.getGoogleKeyNamesList = getGoogleKeyNamesList;
    window.getExternalConfigsObj = getExternalConfigsObj;
    window.setExternalConfigsObj = setExternalConfigsObj;
    window.setGoogleKeysList = setGoogleKeysList;
    window.obfuscateKey = obfuscateKey;
    window.getDB = () => db;
    window.saveToNativeBridge = saveToNativeBridge;
    window.STORE_NAME = STORE_NAME;

// --- [GEMINI TTS STUDIO PRO MODULE MOVED TO js/tts.js] ---

    // Call initTTSStudio once loaded
    if (typeof initTTSStudio === "function") initTTSStudio(); else if (typeof window.initTTSStudio === "function") window.initTTSStudio();

    // Init Web Share Target & Shortcuts listener and Storage estimation
    handleIncomingWebShare();
    updateStorageStatus();


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
    window.closeActiveModal = function() {
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
        else { $('tts-studio-modal').style.display = 'none'; $('modal-overlay').style.display = 'none'; }
        return true;
      }
      if ($('knowledge-modal') && $('knowledge-modal').style.display === 'flex') {
        if (typeof window.closeKnowledgeModal === 'function') window.closeKnowledgeModal();
        else { $('knowledge-modal').style.display = 'none'; $('modal-overlay').style.display = 'none'; }
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
        else { $('live-call-modal').style.display = 'none'; $('modal-overlay').style.display = 'none'; }
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
        try { window.JarvisNativeBridge.onAppReady(); } catch (e) {}
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', launchAppInits);
    } else {
      setTimeout(launchAppInits, 80);
    }

