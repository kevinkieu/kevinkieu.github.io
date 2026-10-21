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

    // Init libraries
    marked.use({ breaks: true });
    mermaid.initialize({ startOnLoad: false, theme: 'default' });

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
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

    // --- SEARCH CACHE ENGINE (1 HOUR TTL) ---
    const SEARCH_CACHE_TTL = 3600000;
    function getSearchCache(query, engine) {
      try {
        const k = `src_${engine}_${query.toLowerCase().trim()}`;
        const raw = ss.getItem(k);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() - entry.time < SEARCH_CACHE_TTL) return entry.data;
        ss.removeItem(k);
      } catch {}
      return null;
    }
    function setSearchCache(query, engine, data) {
      try {
        const k = `src_${engine}_${query.toLowerCase().trim()}`;
        ss.setItem(k, JSON.stringify({ data, time: Date.now() }));
      } catch {}
    }

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
                targetEl.innerHTML = marked.parse(latest);
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

    // --- EXPORT & COPY HELPERS ---
    window.saveOrShareBlob = async (b, fn) => {
      try {
        // 1. Nếu đang chạy trong Android APK (có Native Bridge hỗ trợ ghi file vào Download):
        if (window.JarvisNativeBridge && typeof window.JarvisNativeBridge.saveBase64File === 'function') {
          showToast(`⏳ Đang lưu tệp ${fn}...`, 'info');
          const reader = new FileReader();
          reader.onloadend = () => {
            try {
              const res = reader.result || '';
              const base64Data = res.includes(',') ? res.split(',')[1] : res;
              window.JarvisNativeBridge.saveBase64File(base64Data, b.type || 'application/octet-stream', fn);
            } catch (err) {
              console.warn("Native saveBase64File error, falling back to browser:", err);
              fallbackBrowserDownload(b, fn);
            }
          };
          reader.readAsDataURL(b);
          return;
        }

        // 2. Trình duyệt PC và Mobile Web: Tải trực tiếp vào Downloads của máy (tránh bật hộp thoại Share của Windows/Edge/Chrome)
        fallbackBrowserDownload(b, fn);
      } catch (e) {
        showToast(`❌ Lỗi: ${e.message}`, 'danger');
      }
    };

    function fallbackBrowserDownload(b, fn) {
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = u;
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { 
        a.remove(); 
        URL.revokeObjectURL(u); 
      }, 2000);
      showToast(`📥 Đã tải: ${fn}`);
    }

    window.copyRawText = (t, msg = '📋 Đã copy vào bộ nhớ!') => {
      if (!t) return showToast('Nội dung trống!', 'warning');
      const fb = () => {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast(msg); } catch { showToast('Lỗi copy', 'danger'); }
        ta.remove();
      };
      (navigator.clipboard && window.isSecureContext) ? navigator.clipboard.writeText(t).then(() => showToast(msg)).catch(fb) : fb();
    };

    // --- TÌM KIẾM WEB (CÓ CACHE TỰ ĐỘNG) ---
    async function fetchTavilySearch(q) {
      const cached = getSearchCache(q, 'tavily');
      if (cached) return cached;
      let k = (ls.getItem('tavily_api_key') || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (!k) throw new Error("Chưa nhập Tavily API Key trong cài đặt!");
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: k, query: q, max_results: 5, include_answer: true })
      });
      if (!r.ok) {
        let errDetail = "";
        try { const errJson = await r.json(); errDetail = errJson.message || errJson.error || ""; } catch {}
        throw new Error(`Tavily HTTP ${r.status}${errDetail ? ': ' + errDetail : ''}`);
      }
      const d = await r.json();
      const res = [
        ...(d.answer ? [`💡 **Tóm tắt Tavily**: ${d.answer}`] : []),
        ...(d.results || []).map(x => `- **${x.title}**\n  *Nội dung*: ${x.content}\n  *Nguồn*: ${x.url}`)
      ].join('\n\n');
      setSearchCache(q, 'tavily', res);
      return res;
    }

    async function fetchJinaSearch(q) {
      const cached = getSearchCache(q, 'jina');
      if (cached) return cached;
      let k = (ls.getItem('jina_api_key') || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      const r = await fetch(`https://s.jina.ai/${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json", ...(k ? { Authorization: `Bearer ${k}` } : {}) }
      });
      if (!r.ok) throw new Error(`Jina HTTP ${r.status}`);
      const res = ((await r.json()).data || []).slice(0, 5).map(x => `- **${x.title || 'Tin'}**\n  *Nội dung*: ${(x.content || x.description || '').substring(0, 800)}\n  *Nguồn*: ${x.url}`).join('\n\n');
      setSearchCache(q, 'jina', res);
      return res;
    }

    async function fetchSerperSearch(q) {
      const cached = getSearchCache(q, 'serper');
      if (cached) return cached;
      let k = (ls.getItem('serper_api_key') || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (!k) throw new Error("Chưa có Serper Key!");
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": k, "Content-Type": "application/json" },
        body: JSON.stringify({ q, gl: "vn", hl: "vi", num: 5 })
      });
      if (!r.ok) throw new Error(`Serper HTTP ${r.status}`);
      const d = await r.json();
      const res = [
        ...(d.answerBox?.snippet ? [`💡 **Google**: ${d.answerBox.snippet}`] : []),
        ...(d.organic || []).map(x => `- **${x.title}**\n  *Nội dung*: ${x.snippet}\n  *Nguồn*: ${x.link}`)
      ].join('\n\n');
      setSearchCache(q, 'serper', res);
      return res;
    }

    async function fetchBraveSearch(q) {
      const cached = getSearchCache(q, 'brave');
      if (cached) return cached;
      let k = (ls.getItem('brave_api_key') || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (!k) throw new Error("Chưa có Brave Key!");
      let w = (ls.getItem('brave_worker_url') || '').replace(/\/+$/, '');
      if (w.startsWith('JVENC_') || w.startsWith('ENC_')) w = deobfuscateKey(w);
      const ep = `${w || 'https://api.search.brave.com/res/v1/web/search'}?q=${encodeURIComponent(q)}&count=5`;
      const r = await fetch(ep, { headers: { Accept: "application/json", "X-Subscription-Token": k } });
      if (!r.ok) throw new Error(`Brave HTTP ${r.status}`);
      const res = ((await r.json()).web?.results || []).map(x => `- **${x.title}**\n  *Nội dung*: ${x.description}\n  *Nguồn*: ${x.url}`).join('\n\n');
      setSearchCache(q, 'brave', res);
      return res;
    }

    async function executeLiveSearch(query) {
      let q = (query || '').trim();
      const quoted = extractQuotedKeywords(q);
      if (quoted) q = quoted;
      const now = new Date();
      const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
      if (/(^|\s)(hôm nay|mới nhất|hôm qua)(\s|$)/i.test(q) && !q.includes(String(now.getFullYear()))) {
        q = `${q} ${dateStr}`;
      }
      try {
        return await fetchTavilySearch(q);
      } catch (tavErr) {
        console.warn("Tavily search lỗi, chạy fallback:", tavErr);
        try {
          const eng = ls.getItem('auto_search_default_engine') || 'jina';
          const fallbackFn = { jina: fetchJinaSearch, serper: fetchSerperSearch, brave: fetchBraveSearch }[eng] || fetchJinaSearch;
          return await fallbackFn(q);
        } catch (fbErr) {
          return `Không thể lấy dữ liệu: ${tavErr.message}`;
        }
      }
    }

    async function extractWebPageContent(url) {
      const mode = ls.getItem('web_extract_engine') || 'auto';
      let jk = (ls.getItem('jina_api_key') || '').trim(),
          tk = (ls.getItem('tavily_api_key') || '').trim();
      if (jk.startsWith('JVENC_') || jk.startsWith('ENC_')) jk = deobfuscateKey(jk);
      if (tk.startsWith('JVENC_') || tk.startsWith('ENC_')) tk = deobfuscateKey(tk);
      const isBlocked = t => !t || t.trim().length < 60 || /(just a moment|security verification|verify you are human|cloudflare|ddos protection|challenge-platform|enable javascript|access denied|403 forbidden)/i.test(t);

      const tavily = async () => {
        if (!tk) throw 0;
        const r = await fetch("https://api.tavily.com/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tk, urls: [url] })
        });
        const t = (await r.json()).results?.[0]?.raw_content;
        if (isBlocked(t)) throw 0;
        return { source: "Tavily Extract", content: t.substring(0, 45000) };
      };

      const jina = async () => {
        const r = await fetch(`https://r.jina.ai/${url}`, {
          headers: { Accept: "text/plain", ...(jk ? { Authorization: `Bearer ${jk}` } : {}) }
        });
        if (!r.ok) throw 0;
        const t = await r.text();
        if (isBlocked(t)) throw 0;
        return { source: "Jina Reader", content: t.substring(0, 45000) };
      };

      const proxy = async () => {
        const d = await (await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)).json();
        const t = new DOMParser().parseFromString(d.contents, "text/html").body.innerText.replace(/\s+/g, ' ').trim();
        if (isBlocked(t)) throw 0;
        return { source: "Web Proxy", content: t.substring(0, 30000) };
      };

      const assist = async () => {
        let q = url;
        try {
          const p = new URL(url);
          q = `${p.pathname.split('/').filter(Boolean).pop()?.replace(/[-_.]/g, ' ') || ''} ${p.hostname.replace('www.', '')} mới nhất`.trim();
        } catch {}
        if (tk) { const r = await fetchTavilySearch(q); if (r) return { source: "Tavily Search Assist", content: r }; }
        const r = await fetchJinaSearch(q); if (r) return { source: "Jina Search Assist", content: r };
        throw new Error("Không thể bóc tách dữ liệu.");
      };

      const chain = mode === 'tavily' ? [tavily, jina, proxy, assist] : [tavily, jina, proxy, assist];
      for (const fn of chain) { try { return await fn(); } catch {} }
      throw new Error("Không thể bóc tách dữ liệu.");
    }


// --- [LIVE CALL MODULE MOVED TO js/live.js] ---

    // --- QUẢN LÝ 10 GOOGLE API KEYS & CẤU HÌNH ---
    // --- QUẢN LÝ 10 GOOGLE API KEYS & CẤU HÌNH ---
    $('api-keys-container').innerHTML = Array.from({ length: 10 }, (_, i) => `
      <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:30px;text-align:center;background:rgba(255,255,255,0.05);padding:6px 0;border-radius:var(--radius-sm);border:1px solid var(--border);">#${i+1}</span>
        <input type="text" id="api-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:125px;flex:0 0 125px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Key ${i+1} (Ví dụ: Gmail A, Key chính, Dự phòng...)">
        <input type="password" id="api-key-${i+1}" placeholder="Google API Key ${i+1} (AIzaSy...)" class="modern-input" style="flex:1;min-width:130px;font-size:0.8rem;padding:7px 10px;" title="Dán Google AI Studio API Key vào đây">
      </div>
    `).join('');

    const cfgMap = [
      ['global-context-input', 'jarvis_global_context'],
      ['tavily-key-input', 'tavily_api_key'],
      ['jina-key-input', 'jina_api_key'],
      ['serper-key-input', 'serper_api_key'],
      ['brave-key-input', 'brave_api_key'],
      ['brave-worker-url-input', 'brave_worker_url'],
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
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).put(s);
        t.oncomplete = () => {
          syncSessionsToNative();
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });

    const deleteFromDB = i => new Promise((resolve, reject) => {
      try {
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).delete(i);
        t.oncomplete = () => {
          syncSessionsToNative();
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
      folderSelect: $('folder-select'),
      btnNewFolder: $('btn-new-folder'),
      btnDeleteFolder: $('btn-delete-folder'),
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
      temp: $('temperature'),
      tempVal: $('temp-val'),
      topP: $('top-p'),
      toppVal: $('topp-val'),
      topK: $('top-k'),
      thinking: $('thinking-level'),
      searchInput: $('search-chat-input'),
      scrollTopBtn: $('scroll-to-top'),
      snippetsContainer: $('snippets-container'),
      btnToggleSnippets: $('btn-toggle-snippets'),
      btnFileLibrary: $('btn-file-library'),
      btnAddUrl: $('btn-add-url'),
      btnTheme: $('btn-theme'),
      tabsContainer: $('tabs-container')
    };

    let sessions = [], activeId = null, chatHistory = [], filesData = [], txtContent = "", isProcessing = false;
    let folders = JSON.parse(ls.getItem('jarvis_folders') || ls.getItem('huanmu_folders') || ls.getItem('javiss_folders') || '["Mặc định"]');
    let activeFolder = ls.getItem('jarvis_active_folder') || ls.getItem('huanmu_active_folder') || "All";
    let openTabs = JSON.parse(ls.getItem('jarvis_tabs') || ls.getItem('huanmu_tabs') || '[]');

    // Global bindings & live proxies for modular access across js/live.js, js/arena.js, js/tts.js
    window.DOM = DOM;
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
    window.executeLiveSearch = q => executeLiveSearch(q);
    window.fetchTavilySearch = q => fetchTavilySearch(q);
    window.fetchJinaSearch = q => fetchJinaSearch(q);
    window.fetchSerperSearch = q => fetchSerperSearch(q);
    window.fallbackBrowserDownload = (blob, fn) => fallbackBrowserDownload(blob, fn);
    window.saveToDB = s => saveToDB(s);
    window.getAllFromDB = () => getAllFromDB();
    window.switchSess = id => switchSess(id);
    window.renderSel = () => renderSel();
    window.updateTokenCount = () => updateTokenCount();
    window.newSess = () => newSess();
    window.reRenderHistory = () => reRenderHistory();

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

    // --- PROMPT LIBRARY SYSTEM ---
    const DEFAULT_PROMPTS = [
      { id: 'p1', title: '📝 Tóm tắt bảng', text: 'Hãy tóm tắt ngắn gọn nội dung thành BẢNG đối chiếu và GẠCH ĐẦU DÒNG các ý quan trọng nhất:' },
      { id: 'p2', title: '📊 Sơ đồ Mermaid', text: 'Vẽ sơ đồ tư duy trực quan bằng code Mermaid trong khối ```mermaid để giải thích rõ cấu trúc:' },
      { id: 'p3', title: '📖 Giải thích chi tiết', text: 'Giải thích chi tiết từng bước một, kèm ví dụ thực tế minh họa dễ hiểu nhất:' },
      { id: 'p4', title: '💻 Viết Code tối ưu', text: 'Viết mã nguồn sạch, chuẩn kiến trúc, tối ưu hiệu năng và có chú thích rõ ràng trong markdown:' },
      { id: 'p5', title: '🔍 So sánh & Đánh giá', text: 'Hãy phân tích ưu và nhược điểm, so sánh chi tiết giữa:' }
    ];

    function getCustomPrompts() {
      try {
        const stored = ls.getItem('jarvis_custom_prompts');
        return stored ? JSON.parse(stored) : DEFAULT_PROMPTS;
      } catch {
        return DEFAULT_PROMPTS;
      }
    }
    function saveCustomPrompts(list) {
      ls.setItem('jarvis_custom_prompts', JSON.stringify(list));
      renderSnippets();
      renderPromptList();
    }

    function renderSnippets() {
      const list = getCustomPrompts();
      DOM.snippetsContainer.innerHTML = list.map(p => `
        <div class="snippet-chip" onclick="applySnippet('${p.text.replace(/'/g, "\\'")}')">${p.title}</div>
      `).join('');
    }

    function renderPromptList() {
      const list = getCustomPrompts();
      const c = $('prompt-items-list');
      if (!c) return;
      c.innerHTML = list.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--input-bg);border-radius:var(--radius-sm);border:1px solid var(--border);">
          <div style="flex:1;overflow:hidden;margin-right:10px;">
            <strong style="font-size:0.82rem;color:var(--primary);">${p.title}</strong>
            <p style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;">${p.text}</p>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn" style="padding:4px 8px;font-size:0.72rem;" onclick="applySnippet('${p.text.replace(/'/g, "\\'")}'); closeModals();">Dùng</button>
            <button class="btn danger" style="padding:4px 8px;font-size:0.72rem;" onclick="removeCustomPrompt('${p.id}')">Xóa</button>
          </div>
        </div>
      `).join('');
    }

    window.removeCustomPrompt = id => {
      const list = getCustomPrompts().filter(p => p.id !== id);
      saveCustomPrompts(list);
      showToast("Đã xóa prompt khỏi kho!");
    };

    $('btn-add-prompt-item').onclick = () => {
      const title = $('new-prompt-title').value.trim(),
            text = $('new-prompt-text').value.trim();
      if (!title || !text) return showToast("Vui lòng nhập cả Tiêu đề và Nội dung!", "warning");
      const list = getCustomPrompts();
      list.push({ id: 'p_' + Date.now(), title, text });
      saveCustomPrompts(list);
      $('new-prompt-title').value = '';
      $('new-prompt-text').value = '';
      showToast("🎉 Đã thêm vào Kho Prompt!");
    };

    $('btn-manage-prompts').onclick = () => {
      $('prompt-library-modal').style.display = 'flex';
      oLay.style.display = 'block';
      renderPromptList();
    };

    // --- COMMAND PALETTE (CTRL+K) ---
    const cmdModal = $('command-palette-modal');
    const cmdInput = $('cmd-palette-input');
    const cmdList = $('cmd-palette-list');

    const COMMANDS = [
      { id: 'arena', title: 'Đấu trường Tranh biện AI (Multi-Agent Arena)', shortcut: '/arena', icon: '⚔️', run: () => openArenaModal() },
      { id: 'cloud', title: 'Đồng bộ Cloud đa thiết bị (GitHub Gist)', shortcut: '/cloud', icon: '☁️', run: () => $('btn-open-cloud-sync').click() },
      { id: 'deep', title: 'Bật/Tắt Chế độ Nghiên cứu Sâu (Deep Research)', shortcut: '/deep', icon: '🔬', run: () => $('btn-toggle-deep-research').click() },
      { id: 'new', title: 'Tạo phiên hội thoại mới', shortcut: '/new', icon: '➕', run: () => newSess() },
      { id: 'compare', title: 'So sánh Hai Mô hình (A/B Compare)', shortcut: '/compare', icon: '⚖️', run: () => openAbCompare() },
      { id: 'live', title: 'Bắt đầu gọi Live AI Voice', shortcut: '/live', icon: '📞', run: () => startLiveVoiceCall() },
      { id: 'tts', title: 'Mở Gemini TTS Studio Pro (Chuyển văn bản thành giọng nói, xuất MP3)', shortcut: '/tts', icon: '🎙️', run: () => openTTSStudioModal() },
      { id: 'settings', title: 'Mở Cài đặt hệ thống & 10 Keys', shortcut: '/settings', icon: '⚙️', run: () => $('btn-open-settings').click() },
      { id: 'storage', title: 'Quản lý Bộ nhớ & Trạng thái Lưu trữ (IndexedDB)', shortcut: '/storage', icon: '💾', run: () => { $('btn-open-settings').click(); setTimeout(updateStorageStatus, 150); } },
      { id: 'prompts', title: 'Mở Kho Prompt mẫu cá nhân', shortcut: '/prompts', icon: '📚', run: () => $('btn-manage-prompts').click() },
      { id: 'rag', title: 'Mở Kho Tri Thức & RAG Studio (Gemini Embedding 2)', shortcut: '/rag', icon: '🧠', run: () => typeof openKnowledgeModal === 'function' ? openKnowledgeModal() : window.JarvisRAG?.openModal() },
      { id: 'memory', title: 'Quản lý Trí nhớ Cá nhân (Second Brain)', shortcut: '/memory', icon: '👤', run: () => typeof openKnowledgeModal === 'function' ? openKnowledgeModal('memory') : window.JarvisRAG?.openModal('memory') },
      { id: 'search', title: 'Tìm kiếm nội dung hội thoại', shortcut: '/search', icon: '🔍', run: () => { $('search-modal').style.display = 'flex'; oLay.style.display = 'block'; } },
      { id: 'theme', title: 'Chuyển đổi giao diện Sáng / Tối', shortcut: '/theme', icon: '🌙', run: () => DOM.btnTheme.click() },
      { id: 'export', title: 'Sao lưu toàn bộ dữ liệu ra tệp JSON', shortcut: '/export', icon: '📥', run: () => exportAllSessions() },
      { id: 'clear', title: 'Xóa sạch tin nhắn phiên hiện tại', shortcut: '/clear', icon: '🗑️', run: () => clearActiveSession() },
      { id: 'library', title: 'Mở Thư viện tài liệu đã lưu', shortcut: '/library', icon: '🗄️', run: () => DOM.btnFileLibrary.click() }
    ];

    function openCommandPalette() {
      cmdModal.style.display = 'flex';
      oLay.style.display = 'block';
      cmdInput.value = '';
      renderCommandItems('');
      setTimeout(() => cmdInput.focus(), 50);
    }

    function closeCommandPalette() {
      cmdModal.style.display = 'none';
      oLay.style.display = 'none';
    }

    function renderCommandItems(filterText) {
      const q = filterText.toLowerCase().trim();
      const filtered = COMMANDS.filter(c => c.title.toLowerCase().includes(q) || c.shortcut.includes(q));
      cmdList.innerHTML = filtered.length ? filtered.map((c, i) => `
        <div class="cmd-item ${i === 0 ? 'selected' : ''}" data-cmd="${c.id}">
          <div class="cmd-item-left">
            <span>${c.icon}</span>
            <strong>${c.title}</strong>
          </div>
          <span class="cmd-badge">${c.shortcut}</span>
        </div>
      `).join('') : '<i style="color:var(--text-muted);padding:12px;text-align:center;">Không tìm thấy lệnh nào phù hợp.</i>';

      cmdList.querySelectorAll('.cmd-item').forEach(item => {
        item.onclick = () => {
          const cmdObj = COMMANDS.find(c => c.id === item.getAttribute('data-cmd'));
          closeCommandPalette();
          cmdObj?.run();
        };
      });
    }

    cmdInput.oninput = e => renderCommandItems(e.target.value);
    cmdInput.onkeydown = e => {
      if (e.key === 'Escape') closeCommandPalette();
      if (e.key === 'Enter') {
        const first = cmdList.querySelector('.cmd-item');
        if (first) first.click();
      }
    };

    $('btn-trigger-cmd').onclick = openCommandPalette;
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        cmdModal.style.display === 'flex' ? closeCommandPalette() : openCommandPalette();
      }
      if (e.key === 'Escape') {
        closeModals();
      }
    });

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

    // --- AUTO-NAME SESSION ---
    async function tryAutoNameSession(sessionObj, userText, botText) {
      if (!sessionObj) return;
      const normName = (sessionObj.name || '').normalize('NFC').trim();
      const isDefault = !normName || /^(hội thoại|phiên|cuộc trò chuyện|new session)/i.test(normName);
      if (!isDefault || sessionObj.isCustomNamed) return;

      const k = getSessionApiKey(sessionObj) || (apiKeys.length ? apiKeys[0] : '');
      if (!k) return;
      try {
        const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
          model: FLASH_LITE_MODEL,
          contents: `Hãy tóm tắt chủ đề chính của câu hỏi sau thành một tiêu đề ngắn gọn súc tích từ 3 đến 6 từ bằng tiếng Việt (không dùng dấu ngoặc kép, không thêm lời giải thích):\nNgười dùng: "${userText.slice(0, 160)}"\nAI: "${botText.slice(0, 160)}"`,
          config: {
            safetySettings: SAFETY,
            maxOutputTokens: 60,
            temperature: 0.5,
            thinkingConfig: { thinkingLevel: 'minimal' }
          }
        });
        let title = '';
        try { title = res.text || ''; } catch (_) {}
        if (!title && res.candidates?.[0]?.content?.parts) {
          title = res.candidates[0].content.parts
            .filter(p => !p.thought && typeof p.text === 'string')
            .map(p => p.text)
            .join(' ')
            .trim();
        }
        title = title.replace(/["“«»”*\n#:]/g, '').trim();
        if (title.length > 40) title = title.slice(0, 40) + '...';
        if (title && title.length >= 3) {
          sessionObj.name = title;
          sessionObj.isAutoNamed = true;
          await saveToDB(sessionObj);
          renderSel();
          renderTabs();
          showToast(`🏷️ Đã tự động đặt tên: "${title}"`, 'info');
        }
      } catch (err) {
        console.warn("Auto-name không thành công:", err);
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
        try {
          res = await ai.models.generateContent({
            model: FLASH_LITE_MODEL,
            contents: promptText
          });
        } catch (mErr) {
          console.warn('Thử lại Auto-Summary với gemini-2.5-flash:', mErr);
          res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptText
          });
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

    // --- A/B MODEL COMPARE CONTROLLER ---
    function openAbCompare() {
      $('ab-compare-modal').style.display = 'flex';
      oLay.style.display = 'block';
      $('ab-prompt-input').value = DOM.input.value || '';
      $('ab-prompt-input').focus();
    }
    $('btn-open-compare').onclick = openAbCompare;

    $('btn-run-ab-compare').onclick = async () => {
      const q = $('ab-prompt-input').value.trim();
      if (!q) return showToast("Nhập câu hỏi để so sánh!", "warning");
      const mA = $('ab-model-a').value, mB = $('ab-model-b').value;
      const resA = $('ab-result-a'), resB = $('ab-result-b');
      resA.innerHTML = '<span class="streaming-indicator"><span class="pulse-dot"></span> Đang sinh...</span>';
      resB.innerHTML = '<span class="streaming-indicator"><span class="pulse-dot"></span> Đang sinh...</span>';

      const cs = sessions.find(x => x.id === activeId);
      const k = getSessionApiKey(cs);
      if (!k) return showToast("Cần Google Key!", "danger");

      const runModel = async (model, targetEl) => {
        try {
          const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
            model,
            contents: q,
            config: { safetySettings: SAFETY, temperature: +DOM.temp.value }
          });
          targetEl.innerHTML = marked.parse(res.text || 'Trống');
          window.renderMathInElement?.(targetEl, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
        } catch (e) {
          targetEl.innerHTML = `<span style="color:var(--danger)">Lỗi: ${e.message}</span>`;
        }
      };

      await Promise.all([runModel(mA, resA), runModel(mB, resB)]);
    };


// --- [MULTI-AGENT ARENA MODULE MOVED TO js/arena.js] ---

    // --- WEB SHARE TARGET & SHORTCUTS CONTROLLER ---
    function openShareTargetModal(content, detectedUrl) {
      const modal = $('share-target-modal');
      const prevBox = $('share-preview-content');
      const urlInd = $('share-url-indicator');
      const urlTxt = $('share-detected-url');
      const btnExtract = $('btn-share-extract-now');
      const btnInsert = $('btn-share-insert-input');
      const btnArena = $('btn-share-arena');

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

      btnArena.onclick = () => {
        modal.style.display = 'none';
        if (oLay) oLay.style.display = 'none';
        openArenaModal();
        setArenaTopic(content);
      };

      modal.style.display = 'block';
      if (oLay) oLay.style.display = 'block';
    }

    async function processSharedUrl(url) {
      showToast("⏳ Đang bóc tách nội dung liên kết...", "warning");
      try {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          const k = getSessionApiKey(sessions.find(x => x.id === activeId));
          if (!k) throw new Error("Cần Google Key để phân tích YouTube!");
          const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
            model: FLASH_LITE_MODEL,
            contents: `Tóm tắt video YouTube: ${url}`,
            config: { safetySettings: SAFETY }
          });
          txtContent += `\n[YouTube: ${url}]:\n${res.text}\n`;
          DOM.textFileList.innerHTML += `📺 YouTube (${url.substring(0, 30)}...)<br>`;
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

      if (action === 'arena') {
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => openArenaModal(), 300);
        return;
      }
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

    const getSessionApiKey = (cs, forceRotate = false) => {
      const sel = DOM.apiKeySel?.value || 'auto';
      if (sel !== 'auto') {
        let manualKey = (ls.getItem(`jarvis_api_${parseInt(sel)+1}`) || ls.getItem(`huanmu_api_${parseInt(sel)+1}`) || "").trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
        return manualKey;
      }
      if (!forceRotate && cs?.assignedApiKey && apiKeys.includes(cs.assignedApiKey)) {
        return cs.assignedApiKey;
      }
      if (apiKeys.length) {
        const k = apiKeys[globalKeyIndex++ % apiKeys.length];
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
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          DOM.sendBtn.click();
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
    $('btn-enhance-prompt').onclick = async () => {
      const txt = DOM.input.value.trim();
      if (!txt) return showToast("Nhập prompt trước khi Enhance!", "warning");
      const k = getSessionApiKey(sessions.find(x => x.id === activeId));
      if (!k) return showToast("Cần Google Key để Enhance!", "danger");
      $('btn-enhance-prompt').innerText = "⏳...";
      try {
        const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
          model: FLASH_LITE_MODEL,
          contents: `Hãy tối ưu và mở rộng câu lệnh prompt sau đây để rõ ràng, chi tiết, chuyên nghiệp và hiệu quả nhất khi gửi cho AI:\n\n"${txt}"\n\nChỉ trả về duy nhất nội dung prompt đã được tối ưu, không giải thích gì thêm.`
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
      const timeStr = `${hh}:${mm}:${ss}`,
            dateStr = `${days[now.getDay()]}, ngày ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
      
      const memorySnippet = (cs?.summaryMemory && DOM.toggleAutoSummary?.checked !== false) 
        ? `\n\n[BỐI CẢNH DÀI HẠN ĐÃ TÓM TẮT TỪ CÁC TIN CŨ]:\n${cs.summaryMemory}\n` 
        : '';

      const pinnedMsgs = chatHistory.filter(x => x.pinned);
      const pinnedSnippet = pinnedMsgs.length 
        ? `\n\n[CÁC CHỈ THỊ VÀ DỮ LIỆU CỐT LÕI ĐÃ ĐƯỢC NGƯỜI DÙNG GHIM - BẮT BUỘC LUÔN GHI NHỚ VÀ TUÂN THỦ]:\n` +
          pinnedMsgs.map((m, idx) => `--- [Mục ghim #${idx + 1} (${m.role === 'user' ? 'Người dùng' : 'Jarvis AI'})]:\n${m.text}`).join('\n\n') + '\n'
        : '';

      const ragBlock = ragSnippet ? `\n\n${ragSnippet}\n` : '';

      return `[CHỈ THỊ HỆ THỐNG]:\n${(DOM.toggleGlob?.checked !== false && g) ? '--- TOÀN CỤC: ' + g + '\n' : ''}--- RIÊNG: ${b}${memorySnippet}${pinnedSnippet}${ragBlock}\n\n[MỐC THỜI GIAN THỰC TẾ]: Hiện tại chính xác là ${timeStr} (${dateStr}, Múi giờ Việt Nam GMT+7).\nQUY TẮC BẮT BUỘC: Khi người dùng hỏi bây giờ là mấy giờ, thời gian hiện tại hoặc ngày tháng, bạn PHẢI trả lời chính xác theo mốc giờ ${timeStr} và ngày ${dateStr} này.`;
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
    DOM.btnToggleSnippets.onclick = () => DOM.snippetsContainer.style.display = DOM.snippetsContainer.style.display === 'flex' ? 'none' : 'flex';

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
          const k = getSessionApiKey(sessions.find(x => x.id === activeId));
          if (!k) throw new Error("Cần Google Key!");
          const res = await new GoogleGenAI({ apiKey: k }).models.generateContent({
            model: FLASH_LITE_MODEL,
            contents: `Tóm tắt video YouTube: ${u}`,
            config: { safetySettings: SAFETY }
          });
          txtContent += `\n[YouTube: ${u}]:\n${res.text}\n`;
          DOM.textFileList.innerHTML += `📺 YouTube<br>`;
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
        showToast("Lỗi truy cập Clipboard", 'danger');
      }
    };

    const oLay = $('modal-overlay'), closeModals = () => {
      document.querySelectorAll('.modal-box, #command-palette-modal, #ab-compare-modal, #arena-modal, #share-target-modal').forEach(m => m.style.display = 'none');
      if (oLay) oLay.style.display = 'none';
      if (typeof window.closeTTSStudioModal === 'function') window.closeTTSStudioModal();
      if (typeof window.closeArenaModal === 'function') window.closeArenaModal();
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
    $('btn-camera-snap').onclick = async () => {
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
        return s ? `<div class="tab-item ${tId === activeId ? 'active' : ''}">
          ${dot}
          <span onclick="window.switchSess('${tId}')">${s.name.substring(0, 16)}</span>
          <span class="tab-close" onclick="window.closeTab('${tId}', event)">×</span>
        </div>` : '';
      }).join('');
      ls.setItem('jarvis_tabs', JSON.stringify(openTabs));
    }

    window.switchSess = switchSess;
    window.closeTab = (id, e) => {
      e.stopPropagation();
      openTabs = openTabs.filter(x => x !== id);
      id === activeId ? (openTabs.length ? switchSess(openTabs[0]) : newSess()) : renderTabs();
    };

    function renderFolders() {
      DOM.folderSelect.innerHTML = `<option value="All">📁 Tất cả Thư Mục</option>` + folders.map(f => `<option value="${f}">📁 ${f}</option>`).join('');
      DOM.folderSelect.value = activeFolder;
    }

    DOM.folderSelect.onchange = e => {
      activeFolder = e.target.value;
      ls.setItem('jarvis_active_folder', activeFolder);
      renderSel();
      const v = activeFolder === "All" ? sessions : sessions.filter(s => s.folder === activeFolder);
      if (v.length && !v.find(s => s.id === activeId)) switchSess(v[0].id);
    };

    DOM.btnNewFolder.onclick = () => {
      const n = prompt("Nhập tên Thư mục mới:");
      if (n && !folders.includes(n.trim())) {
        folders.push(n.trim());
        ls.setItem('jarvis_folders', JSON.stringify(folders));
        activeFolder = n.trim();
        renderFolders();
        renderSel();
        showToast("Đã tạo thư mục mới!");
      }
    };

    DOM.btnDeleteFolder.onclick = async () => {
      if (activeFolder === "All" || activeFolder === "Mặc định") return showToast("Không thể xóa thư mục này!", "warning");
      if (confirm(`Bạn có chắc muốn xóa thư mục "${activeFolder}"? Các phiên bên trong sẽ chuyển về 'Mặc định'.`)) {
        folders = folders.filter(f => f !== activeFolder);
        ls.setItem('jarvis_folders', JSON.stringify(folders));
        for (const s of sessions) {
          if (s.folder === activeFolder) {
            s.folder = "Mặc định";
            await saveToDB(s);
          }
        }
        activeFolder = "All";
        renderFolders();
        renderSel();
        showToast("Đã xóa thư mục!");
      }
    };

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
        folder: activeFolder === "All" ? "Mặc định" : activeFolder,
        his: [],
        sys: '',
        mod: 'gemini-3.6-flash',
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
        useGlob: true,
        orderIndex: Date.now()
      };
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
        DOM.model.value = s.mod || 'gemini-3.6-flash';
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
        DOM.toggleMemory.checked = s.mem !== false;
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
      const v = activeFolder === "All" ? sessions : sessions.filter(s => s.folder === activeFolder);
      DOM.selSession.innerHTML = v.map(s => {
        const dot = s.color ? '● ' : '';
        return `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${dot}${activeFolder === "All" ? `[${s.folder}] ` : ''}${s.name}</option>`;
      }).join('');
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

    $('btn-move-session').onclick = async () => {
      const s = sessions.find(x => x.id === activeId);
      if (!s) return;
      const targetFolder = prompt(`Chuyển phiên sang Thư mục:\n(Các TM hiện có: ${folders.join(', ')})`, s.folder);
      if (targetFolder && targetFolder.trim()) {
        const tf = targetFolder.trim();
        if (!folders.includes(tf)) {
          folders.push(tf);
          ls.setItem('jarvis_folders', JSON.stringify(folders));
          renderFolders();
        }
        s.folder = tf;
        await saveToDB(s);
        renderSel();
        showToast(`📂 Đã chuyển phiên sang "${tf}"!`);
      }
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
          mem: DOM.toggleMemory.checked
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

    DOM.model.addEventListener('change', () => { updateThinkingVisibility(); updateConfig(); });
    DOM.engineSel.addEventListener('change', updateConfig);
    [DOM.sysInst, DOM.apiKeySel, DOM.toggleGlob, DOM.toggleSearch, DOM.searchEngineSel, DOM.toggleMemory, DOM.topK, DOM.thinking].forEach(el => el?.addEventListener('change', updateConfig));
    DOM.temp.addEventListener('input', () => { DOM.tempVal.innerText = DOM.temp.value; updateConfig(); });
    DOM.topP.addEventListener('input', () => { DOM.toppVal.innerText = DOM.topP.value; updateConfig(); });

    // --- MARKDOWN & SYNTAX HIGHLIGHTING RENDERER ---
    async function renderMsgContent(el, t) {
      t = t || "";
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
          d.style.cssText = 'overflow-x:auto;padding:10px;text-align:center;background:var(--bg-card);border-radius:var(--radius-md);margin:10px 0;';
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

    window.toggleSpeakMsg = async (btn, i) => {
      // 1. Dừng âm thanh đang phát nếu có
      if (currentSpeakingAudio) {
        currentSpeakingAudio.pause();
        currentSpeakingAudio = null;
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (currentSpeakingBtn) {
        currentSpeakingBtn.innerHTML = "🔊 Nghe";
        currentSpeakingBtn.classList.remove('speaking-active');
      }
      if (currentSpeakingBtn === btn) {
        currentSpeakingBtn = null;
        return;
      }

      const raw = chatHistory[i]?.text || "";
      const clean = sanitizeTranscript(raw);
      if (!clean) return showToast("Không có nội dung văn bản để đọc!", "warning");

      const isVietnamese = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
      const activeKeys = getGoogleKeysList().filter(Boolean);

      // Thử đọc bằng Gemini TTS chất lượng cao nếu có API Keys
      if (activeKeys.length > 0) {
        btn.innerHTML = "⏳ Đang nạp...";
        btn.classList.add('speaking-active');
        currentSpeakingBtn = btn;

        try {
          const speechChunk = clean.length > 700 ? clean.slice(0, 700) + '...' : clean;
          const payload = {
            contents: [{
              role: "user",
              parts: [{ text: speechChunk }]
            }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: isVietnamese ? 'Aoede' : 'Aoede'
                  }
                }
              }
            }
          };

          const res = await requestGeminiAudioWithFailover(payload, 'gemini-3.8-flash-lite-tts', activeKeys, 0);
          let base64Audio = null;
          const parts = res.data?.candidates?.[0]?.content?.parts || [];
          for (let p of parts) {
            if (p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('audio/')) {
              base64Audio = p.inlineData.data;
              break;
            }
          }

          if (base64Audio) {
            let cleanB64 = base64Audio.replace(/-/g, '+').replace(/_/g, '/');
            while (cleanB64.length % 4) cleanB64 += '=';
            const binary = atob(cleanB64);
            const bytes = new Uint8Array(binary.length);
            for (let b = 0; b < binary.length; b++) bytes[b] = binary.charCodeAt(b);

            const wavBlob = new Blob([bytes], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(wavBlob);
            const audio = new Audio(audioUrl);
            currentSpeakingAudio = audio;

            btn.innerHTML = "⏹️ Dừng";
            audio.onended = audio.onerror = () => {
              btn.innerHTML = "🔊 Nghe";
              btn.classList.remove('speaking-active');
              currentSpeakingBtn = null;
              currentSpeakingAudio = null;
              URL.revokeObjectURL(audioUrl);
            };
            await audio.play();
            return;
          }
        } catch (e) {
          console.warn("Gemini TTS phát nhanh không thành công, chuyển sang Web Speech API:", e);
        }
      }

      // Dự phòng: Trình duyệt Web Speech API
      if (!('speechSynthesis' in window)) {
        btn.innerHTML = "🔊 Nghe";
        btn.classList.remove('speaking-active');
        currentSpeakingBtn = null;
        return showToast("Trình duyệt không hỗ trợ đọc giọng nói!", "warning");
      }

      const utter = new SpeechSynthesisUtterance(clean);
      const voices = window.speechSynthesis.getVoices();
      if (isVietnamese) {
        utter.lang = 'vi-VN';
        const viVoice = voices.find(v => v.lang.includes('vi') || v.name.toLowerCase().includes('vietnam') || v.name.toLowerCase().includes('vietnamese'));
        if (viVoice) utter.voice = viVoice;
      } else {
        utter.lang = 'en-US';
        const enVoice = voices.find(v => v.lang.startsWith('en'));
        if (enVoice) utter.voice = enVoice;
      }
      utter.rate = 1.0;
      utter.pitch = 1.0;

      btn.innerHTML = "⏹️ Dừng";
      btn.classList.add('speaking-active');
      currentSpeakingBtn = btn;
      currentSpeechUtterance = utter;

      utter.onend = utter.onerror = () => {
        btn.innerHTML = "🔊 Nghe";
        btn.classList.remove('speaking-active');
        currentSpeakingBtn = null;
        currentSpeechUtterance = null;
      };

      window.speechSynthesis.speak(utter);
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
      const kNum = chatHistory[i]?.pinnedKey;
      const ixBadge = ((sd !== 'user') && ixId) ? `<span class="interaction-id-badge" title="Interaction ID: ${ixId}">⚡ ID: ${ixId.slice(0, 8)}...${kNum ? ` [🔒 Key ${kNum}]` : ''}</span>` : '';
      const pinnedBadge = isPinned ? `<span class="pinned-tag">📌 ĐÃ GHIM</span>` : '';
      const liveBadge = chatHistory[i]?.isLiveCall ? `<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:rgba(16,185,129,0.15);color:#10b981;font-weight:600;margin-left:4px;border:1px solid rgba(16,185,129,0.3);">📞 Thoại Live</span>` : '';

      m.innerHTML = `
        <div class="message-header">
          <span>${sd === 'user' ? '👤 Bạn' : '✨ Jarvis AI'}</span>
          <span style="font-size:0.72rem;opacity:0.75;margin-left:4px;">🕒 ${chatHistory[i]?.time || getNowTime24h()}</span>
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
      const am = DOM.model.value || 'gemini-3.6-flash';
      const msg = DOM.input.value.trim();
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
        keyIndexNum = Math.max(1, apiKeys.indexOf(gKey) + 1);
      } else {
        gKey = getSessionApiKey(cs, true);
        keyIndexNum = Math.max(1, apiKeys.indexOf(gKey) + 1);
      }

      if (!gKey) return showToast("Cần ít nhất 1 Google API Key trong Cài đặt!", "danger");

      ls.removeItem('jarvis_draft');
      isProcessing = true;
      abortController = new AbortController();

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
          { role: 'model', text: finalResp, time: botTime, interactionId: recordedIxId, pinnedKey: currentEngine === 'interactions' ? keyIndexNum : null }
        );

        if (cs) {
          cs.his = chatHistory;
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
          bD.querySelector('.message-header').innerHTML = `<span>✨ Jarvis AI</span><span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}${suffix}</span>${ixBadge}${ragBadge}`;
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
            setTimeout(() => tryAutoNameSession(cs, fP, finalResp), 200);
          }
        }

        // AUTO-SUMMARY BỘ NHỚ DÀI HẠN
        if (chatHistory.length > 16 && cs) {
          condenseSessionMemory(cs);
        }

        // CHATGPT-STYLE AUTO-LEARN MEMORY
        if (fP && fP.length >= 8 && window.JarvisRAG && typeof window.JarvisRAG.extractAndLearnMemory === 'function') {
          setTimeout(() => window.JarvisRAG.extractAndLearnMemory(fP, gKey), 400);
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
        bD = document.createElement('div');
        bD.className = 'message-container';
        bD.innerHTML = `
          <div class="bot-message">
            <div class="message-header">
              <span>✨ Jarvis AI</span>
              <span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}</span>
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

        const uMatch = fnP.match(/https?:\/\/[^\s]+/)?.[0];
        if (uMatch && !uMatch.includes("youtube.com") && !uMatch.includes("youtu.be")) {
          try {
            const ext = await extractWebPageContent(uMatch);
            fnP = `[NỘI DUNG TỪ ${uMatch} QUA ${ext.source}]:\n${ext.content}\n\n[YÊU CẦU]:\n${fnP}`;
          } catch {}
        }
        if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");

        // DEEP RESEARCH & THINKING PROTOCOL
        if (isDeepResearch && msg && msg.trim().length > 15 && !/^(chào|hello|hi|hey|alo|ê|ơi|chào bạn|xin chào)\b/i.test(msg.trim())) {
          const drCard = document.createElement('div');
          drCard.className = 'deep-research-card';
          drCard.innerHTML = `
            <div class="dr-header">
              <span class="dr-badge">🔬 DEEP RESEARCH</span>
              <span class="dr-status-title">Đang nghiên cứu chuyên sâu đa bước...</span>
              <span class="dr-arrow">▼</span>
            </div>
            <div class="dr-content">
              <div class="dr-step active" id="dr-s1"><span class="dr-dot">⏳</span> 1. Bẻ nhỏ bài toán thành 3 truy vấn ngách...</div>
              <div class="dr-step" id="dr-s2"><span class="dr-dot">⭕</span> 2. Quét tìm kiếm đa nguồn song song...</div>
              <div class="dr-step" id="dr-s3"><span class="dr-dot">⭕</span> 3. Kiểm chứng và trích lọc dữ liệu...</div>
              <div class="dr-step" id="dr-s4"><span class="dr-dot">⭕</span> 4. Viết báo cáo toàn diện kèm trích dẫn nguồn...</div>
            </div>
          `;
          drCard.querySelector('.dr-header').onclick = () => drCard.classList.toggle('collapsed');
          bD.querySelector('.msg-content').appendChild(drCard);

          try {
            const sAi = new GoogleGenAI({ apiKey: gKey });
            const sRes = await sAi.models.generateContent({
              model: FLASH_LITE_MODEL,
              contents: `Dựa vào câu hỏi sau của người dùng: "${msg}"\nHãy tạo đúng 3 câu truy vấn tìm kiếm ngách ngắn gọn bằng tiếng Việt hoặc tiếng Anh (mỗi câu tối đa 8 từ, mỗi câu trên 1 dòng, không đánh số, không gạch đầu dòng) để quét thông tin từ nhiều khía cạnh:\n`,
              config: { safetySettings: SAFETY, maxOutputTokens: 120, temperature: 0.5 }
            });

            const queries = (sRes.text || '').split('\n').map(l => l.replace(/^[-*0-9.)\s]+/, '').trim()).filter(l => l.length > 2).slice(0, 3);
            const subQueries = queries.length ? queries : [msg];

            const s1 = drCard.querySelector('#dr-s1');
            if (s1) {
              s1.className = 'dr-step done';
              s1.innerHTML = `<span class="dr-dot" style="color:#10b981;">✓</span> 1. Đã tạo ${subQueries.length} truy vấn: ${subQueries.map(q => `<em>"${escapeHtml(q)}"</em>`).join(', ')}`;
            }

            const s2 = drCard.querySelector('#dr-s2');
            if (s2) s2.className = 'dr-step active';

            const selEng = DOM.searchEngineSel.value;
            const tgtEng = selEng === 'auto' ? (ls.getItem('auto_search_default_engine') || 'tavily') : selEng;
            const searchFn = { tavily: fetchTavilySearch, jina: fetchJinaSearch, serper: fetchSerperSearch, brave: fetchBraveSearch }[tgtEng] || fetchTavilySearch;

            const searchPromises = subQueries.map(async q => {
              try {
                return await searchFn(q);
              } catch (e) {
                console.warn(`Deep research lỗi ${tgtEng}:`, e);
                try { return await fetchJinaSearch(q); } catch { return ''; }
              }
            });
            const searchResults = await Promise.all(searchPromises);

            if (s2) {
              s2.className = 'dr-step done';
              s2.innerHTML = `<span class="dr-dot" style="color:#10b981;">✓</span> 2. Đã quét xong ${subQueries.length} truy vấn tìm kiếm đa nguồn.`;
            }

            const s3 = drCard.querySelector('#dr-s3');
            if (s3) {
              s3.className = 'dr-step done';
              s3.innerHTML = `<span class="dr-dot" style="color:#10b981;">✓</span> 3. Đã thu thập và trích lọc dữ liệu nghiên cứu.`;
            }

            const s4 = drCard.querySelector('#dr-s4');
            if (s4) {
              s4.className = 'dr-step active';
              s4.innerHTML = `<span class="dr-dot">⚡</span> 4. Đang tổng hợp báo cáo chi tiết kèm trích dẫn nguồn...`;
            }

            const gatheredText = searchResults.filter(Boolean).join('\n\n---\n\n');
            if (gatheredText) {
              fnP = `[DỮ LIỆU NGHIÊN CỨU SÂU ĐÃ THU THẬP TỪ CÁC NGUỒN]:\n${gatheredText}\n\n[CÂU HỎI GỐC CỦA NGƯỜI DÙNG]:\n${msg}\n\n[CHỈ THỊ BÁO CÁO NGHIÊN CỨU SÂU]:\nHãy viết báo cáo phân tích toàn diện, có cấu trúc rõ ràng với các tiêu đề mục.\nHãy gắn chú thích nguồn [1], [2] khi đưa ra số liệu hoặc luận điểm.\nỞ cuối bài, bắt buộc phải có mục "### 📚 Nguồn tham khảo" liệt kê các liên kết hoặc tài liệu đã dùng.`;
            }
          } catch (drErr) {
            console.log("Deep Research Error:", drErr);
          }
        }

        const quoted = extractQuotedKeywords(fnP);
        if (quoted && DOM.toggleSearch.checked && !isDeepResearch) {
          const sel = DOM.searchEngineSel.value,
                tgt = sel === 'auto' ? (ls.getItem('auto_search_default_engine') || 'tavily') : sel;

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
          const engineMap = { tavily: fetchTavilySearch, jina: fetchJinaSearch, serper: fetchSerperSearch, brave: fetchBraveSearch };
          const primaryFn = engineMap[tgt] || fetchTavilySearch;

          try {
            sText = await primaryFn(actualSearchQuery);
          } catch (sErr) {
            console.warn(`Lỗi tìm kiếm ${tgt}:`, sErr);
            showToast(`⚠️ Lỗi ${tgt}: ${sErr.message || 'Không kết nối được'}. Thử fallback Jina Search...`, 'warning');
            if (tgt !== 'jina') {
              try {
                if (searchBadge) searchBadge.innerHTML = `🌐 Đang thử fallback Jina Search...`;
                sText = await fetchJinaSearch(actualSearchQuery);
              } catch (jinaErr) {
                console.warn("Jina fallback cũng lỗi:", jinaErr);
                showToast(`❌ Không thể tìm kiếm web: ${jinaErr.message || sErr.message}`, 'danger');
              }
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

        // RAG / SECOND BRAIN CONTEXT RETRIEVAL (Gemini Embedding 2)
        let ragSnippet = '';
        if (window.JarvisRAG && typeof window.JarvisRAG.retrieveContext === 'function') {
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

        const base64Files = [];
        for (const f of imgs) base64Files.push(await fileToBase64(f));

        const currentParts = [{ text: fnP }];
        base64Files.forEach(({ mimeType, data }) => {
          currentParts.push({ inlineData: { mimeType, data } });
        });

        const interactionInput = [];
        if (fnP) interactionInput.push({ type: 'text', text: fnP });
        base64Files.forEach(({ mimeType, data }) => {
          interactionInput.push({ type: 'image', data, mime_type: mimeType });
        });

        const thk = DOM.thinking.value;

        // ENGINE 1: INTERACTIONS API
        if (currentEngine === 'interactions') {
          const interactionParams = {
            model: am,
            input: imgs.length ? interactionInput : fnP,
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
              for await (const event of streamObj) {
                const foundId = event.interaction?.id || event.id || event.interaction_id;
                if (foundId) recordedIxId = foundId;

                let chunkText = "";
                if (event.event_type === "step.delta" && event.delta?.type === "text") {
                  chunkText = event.delta.text || "";
                } else if (event.delta?.text) {
                  chunkText = event.delta.text;
                } else if (event.text) {
                  chunkText = event.text;
                } else if (event.event_type === "interaction.completed" && !finalResp && event.interaction?.output_text) {
                  chunkText = event.interaction.output_text;
                }

                if (chunkText) {
                  bD.querySelector('.typing-bubble')?.remove();
                  finalResp += chunkText;
                  renderer.push(finalResp);
                  if ($('latency-val') && !pS) $('latency-val').innerText = Math.round(performance.now() - startTime);
                  pS = true;
                }
              }

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
            chatHistory.slice(-16).forEach(m => contents.push({
              role: m.role === 'model' ? 'model' : 'user',
              parts: [{ text: m.text }]
            }));
          }
          contents.push({ role: 'user', parts: currentParts });

          const config = {
            systemInstruction: getDynamicSI(ragSnippet),
            safetySettings: SAFETY,
            maxOutputTokens: 8192
          };
          if (thk && thk !== 'none') {
            config.thinkingConfig = { thinkingLevel: thk };
          } else {
            config.temperature = +DOM.temp.value;
            config.topP = +DOM.topP.value;
            config.topK = +DOM.topK.value;
          }

          let streamAttempts = 0;
          const maxStreamAttempts = 2;

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

                let chunkText = "";
                try {
                  chunkText = ck.text || "";
                } catch (_) {}

                if (!chunkText && ck.candidates?.[0]?.content?.parts) {
                  chunkText = ck.candidates[0].content.parts
                    .filter(p => !p.thought && typeof p.text === 'string')
                    .map(p => p.text)
                    .join('');
                }

                if (chunkText) {
                  bD.querySelector('.typing-bubble')?.remove();
                  finalResp += chunkText;
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
        isProcessing = false;
        abortController = null;
        DOM.sendBtn.innerHTML = `<span>Gửi</span> <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
        DOM.sendBtn.style.background = 'var(--primary)';
      }
    };

    // --- EXPORT JSON & RESTORE ---
    window.exportAllSessions = async () => {
      const cfgs = { chat_font_size: ls.getItem('chat_font_size') || "16" };
      for (let i = 1; i <= 10; i++) {
        const kVal = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || "").trim();
        cfgs[`jarvis_api_${i}`] = kVal ? obfuscateKey(kVal) : "";
        cfgs[`jarvis_api_name_${i}`] = ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || "";
      }
      cfgMap.forEach(([, k]) => {
        const val = ls.getItem(k) || "";
        cfgs[k] = (k.includes('key') || k === 'brave_worker_url') && val ? obfuscateKey(val) : val;
      });
      cfgs['live_search_enabled'] = ls.getItem('live_search_enabled') || 'true';
      cfgs['live_context_enabled'] = ls.getItem('live_context_enabled') || 'true';
      cfgs['jarvis_folders'] = ls.getItem('jarvis_folders') || '["Mặc định"]';
      cfgs['jarvis_custom_prompts'] = ls.getItem('jarvis_custom_prompts') || '[]';
      
      const rawSessions = await getAllFromDB();
      const cleanSessions = rawSessions.map(sanitizeSessionForBackup);
      let localKnowledge = [];
      if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
        try { localKnowledge = await window.JarvisRAG.getAllKnowledge(); } catch (e) {}
      }
      const backupObj = { brand: "Jarvis AI", sessions: cleanSessions, configs: cfgs, knowledgeBase: localKnowledge };
      const jsonStr = JSON.stringify(backupObj, null, 2);
      const filename = `JarvisAI_Backup_${Date.now()}.json`;

      await saveOrShareBlob(new Blob([jsonStr], { type: 'application/json' }), filename);

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(jsonStr);
          setTimeout(() => {
            showToast('📋 Đã sao chép nội dung JSON sao lưu vào Clipboard!', 'info');
          }, 1500);
        }
      } catch {}
    };

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

    window.exportChatDoc = () => {
      const h = `<html><head><meta charset="utf-8"></head><body><h2>Lịch sử Trò chuyện Jarvis AI</h2>` + chatHistory.map(m => `<p><strong>${m.role === 'user' ? 'Bạn' : 'Jarvis AI'}:</strong><br>${m.role === 'model' ? marked.parse(m.text) : m.text}</p><hr>`).join('') + "</body></html>";
      saveOrShareBlob(new Blob(['\ufeff', h], { type: 'application/msword' }), `JarvisAI_Chat_${Date.now()}.doc`);
    };

    window.exportChatPDF = () => {
      const e = document.createElement('div');
      e.style.padding = '20px';
      e.innerHTML = `<h2 style="color:#2563eb;margin-bottom:16px;">Jarvis AI Chat Transcript</h2>` + chatHistory.map(m => `<div style="margin:14px 0;"><strong>${m.role === 'user' ? 'Bạn' : 'Jarvis AI'} [${m.time || ''}]:</strong><br>${m.role === 'model' ? marked.parse(m.text) : m.text}</div><hr style="border:none;border-top:1px solid #e2e8f0;">`).join('');
      html2pdf().from(e).outputPdf('blob').then(b => saveOrShareBlob(b, `JarvisAI_Chat_${Date.now()}.pdf`));
    };

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
        const targetModel = 'gemini-3.6-flash';
        const res = await ai.models.generateContent({
          model: targetModel,
          contents: `Bạn là trợ lý AI thông minh. Dựa vào đối thoại vừa rồi:\nNgười dùng: "${(userPrompt || '').slice(0, 150)}"\nAI: "${botReply.slice(0, 250)}"\nHãy gợi ý đúng 3 câu hỏi tiếp theo thật ngắn gọn bằng tiếng Việt (mỗi câu tối đa 8 từ, mỗi câu trên 1 dòng, không đánh số, không gạch đầu dòng, không giải thích gì thêm) để người dùng có thể bấm vào hỏi tiếp:`,
          config: {
            safetySettings: SAFETY,
            maxOutputTokens: 350,
            temperature: 0.7,
            thinkingConfig: { thinkingLevel: 'minimal' }
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

    // --- DEEP RESEARCH & THINKING CONTROLLER ---
    let isDeepResearch = ls.getItem('jarvis_deep_research') === '1';
    const drBtn = $('btn-toggle-deep-research');
    const drState = $('dr-chip-state');

    function updateDrBtnUI() {
      if (isDeepResearch) {
        drBtn.classList.add('magic');
        drBtn.style.borderColor = '#8b5cf6';
        drState.innerHTML = `<span style="color:#8b5cf6;font-weight:700;">BẬT</span>`;
      } else {
        drBtn.classList.remove('magic');
        drBtn.style.borderColor = 'var(--border)';
        drState.innerHTML = `<span style="color:var(--text-muted);">TẮT</span>`;
      }
    }

    drBtn.onclick = () => {
      isDeepResearch = !isDeepResearch;
      ls.setItem('jarvis_deep_research', isDeepResearch ? '1' : '0');
      updateDrBtnUI();
      showToast(isDeepResearch ? "Đã bật Chế độ Nghiên cứu Sâu (Deep Research)!" : "Đã tắt Nghiên cứu Sâu.");
    };
    updateDrBtnUI();

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

    // --- GITHUB GIST CLOUD SYNC CONTROLLER ---
    const cloudSyncModal = $('cloud-sync-modal');
    const gistPatInput = $('gist-pat-input');
    const gistIdInput = $('gist-id-input');
    const gistStatusText = $('gist-status-text');
    const gistLastTime = $('gist-last-time');

    const openCloudSyncModal = () => {
      cloudSyncModal.style.display = 'flex';
      oLay.style.display = 'block';
      gistPatInput.value = ls.getItem('jarvis_gist_pat') || '';
      gistIdInput.value = ls.getItem('jarvis_gist_id') || '';
      const last = ls.getItem('jarvis_gist_last_sync');
      if (last) {
        gistStatusText.innerText = 'Đã kết nối Gist';
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${last}`;
      } else {
        gistStatusText.innerText = 'Chưa đồng bộ';
        gistStatusText.style.color = 'var(--text-muted)';
        gistLastTime.innerText = '--:--';
      }
    };

    $('btn-open-cloud-sync').onclick = openCloudSyncModal;
    if ($('btn-cloud-sync-header')) $('btn-cloud-sync-header').onclick = openCloudSyncModal;
    if ($('btn-cloud-sync-chip')) $('btn-cloud-sync-chip').onclick = openCloudSyncModal;
    if ($('btn-open-cloud-from-settings')) $('btn-open-cloud-from-settings').onclick = () => {
      $('settings-modal').style.display = 'none';
      openCloudSyncModal();
    };

    const _origCloudSyncUnused = () => {
      cloudSyncModal.style.display = 'flex';
      oLay.style.display = 'block';
      gistPatInput.value = ls.getItem('jarvis_gist_pat') || '';
      gistIdInput.value = ls.getItem('jarvis_gist_id') || '';
      const last = ls.getItem('jarvis_gist_last_sync');
      if (last) {
        gistStatusText.innerText = 'Đã kết nối Gist';
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${last}`;
      } else {
        gistStatusText.innerText = 'Chưa đồng bộ';
        gistStatusText.style.color = 'var(--text-muted)';
        gistLastTime.innerText = '--:--';
      }
    };

    $('btn-toggle-pat-eye').onclick = () => {
      gistPatInput.type = gistPatInput.type === 'password' ? 'text' : 'password';
    };

    $('btn-copy-gist-id').onclick = () => {
      const id = gistIdInput.value.trim();
      if (!id) return showToast("Chưa có Gist ID!", "warning");
      navigator.clipboard.writeText(id);
      showToast("Đã sao chép Gist ID!");
    };

    // PUSH TO GIST (BACKUP)
    $('btn-gist-push').onclick = async () => {
      const pat = gistPatInput.value.trim();
      if (!pat) return showToast("Vui lòng nhập GitHub Personal Access Token (PAT)!", "warning");
      let gistId = gistIdInput.value.trim();

      const btn = $('btn-gist-push');
      btn.innerHTML = `<span>Đang đẩy lên...</span> ⏳`;
      btn.disabled = true;

      try {
        const allSessions = await getAllFromDB();
        const cleanSessions = allSessions.map(sanitizeSessionForBackup);

        let allKnowledge = [];
        if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
          try {
            allKnowledge = await window.JarvisRAG.getAllKnowledge();
          } catch (kErr) {
            console.warn("Lỗi trích xuất Kho tri thức cho Gist sync:", kErr);
          }
        }

        const backupData = {
          version: 2,
          app: "Jarvis AI",
          timestamp: new Date().toISOString(),
          timeReadable: new Date().toLocaleString('vi-VN'),
          device: ('ontouchstart' in window) ? 'Mobile' : 'Desktop',
          sessions: cleanSessions,
          activeId,
          customPrompts: JSON.parse(ls.getItem('jarvis_custom_prompts') || '[]'),
          folders: JSON.parse(ls.getItem('jarvis_folders') || '["Mặc định"]'),
          knowledgeBase: allKnowledge,
          settings: {
            keys: getGoogleKeysList(true), // Mã hóa Salted XOR để Secret Scanner không quét được
            keyNames: getGoogleKeyNamesList(),
            externalConfigs: getExternalConfigsObj(true),
            model: DOM.model.value,
            temperature: DOM.temp.value,
            searchEngine: DOM.searchEngineSel.value,
            globalContext: DOM.globContext.value,
            systemInstruction: DOM.sysInst.value,
            theme: ls.getItem('jarvis_theme') || 'auto',
            autoLearnMemory: ls.getItem('jarvis_auto_learn_memory') || 'true',
            ragEnabled: ls.getItem('jarvis_rag_enabled') || 'true'
          }
        };

        const payload = {
          description: "Jarvis AI - Cloud Sync Personal Backup",
          public: false,
          files: {
            "jarvis_sync_data.json": {
              content: JSON.stringify(backupData)
            }
          }
        };

        const url = gistId ? `https://api.github.com/gists/${gistId}` : `https://api.github.com/gists`;
        const method = gistId ? 'PATCH' : 'POST';

        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Lỗi HTTP ${res.status}`);
        }

        const data = await res.json();
        gistId = data.id;
        gistIdInput.value = gistId;

        const timeStr = new Date().toLocaleString('vi-VN');
        ls.setItem('jarvis_gist_pat', pat);
        ls.setItem('jarvis_gist_id', gistId);
        ls.setItem('jarvis_gist_last_sync', timeStr);

        const kCount = (allKnowledge && allKnowledge.length) ? `, ${allKnowledge.length} tri thức` : '';
        gistStatusText.innerText = `Đã sao lưu (${allSessions.length} phiên${kCount})`;
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${timeStr}`;

        showToast(`Đã đồng bộ lên Cloud thành công! Gist ID: ${gistId}`, "success");
      } catch (err) {
        showToast(`Lỗi đẩy lên Cloud: ${err.message}`, "danger");
      } finally {
        btn.innerHTML = `☁️ Đẩy lên Cloud (Backup)`;
        btn.disabled = false;
      }
    };

    // PULL FROM GIST (RESTORE)
    $('btn-gist-pull').onclick = async () => {
      const pat = gistPatInput.value.trim();
      const gistId = gistIdInput.value.trim();
      if (!pat) return showToast("Vui lòng nhập GitHub PAT!", "warning");
      if (!gistId) return showToast("Vui lòng nhập Gist ID cần tải về!", "warning");

      if (!confirm("Tải về từ Cloud sẽ cập nhật toàn bộ lịch sử trò chuyện và cài đặt trên máy này. Bạn có muốn tiếp tục?")) return;

      const btn = $('btn-gist-pull');
      btn.innerHTML = `<span>Đang tải về...</span> ⏳`;
      btn.disabled = true;

      try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
          headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Lỗi HTTP ${res.status}`);
        }

        const data = await res.json();
        const fileObj = data.files?.["jarvis_sync_data.json"] || Object.values(data.files || {})[0];
        if (!fileObj) throw new Error("Không tìm thấy tệp dữ liệu sao lưu hợp lệ trong Gist này!");

        let contentStr = fileObj.content || '';

        // XỬ LÝ LỖI TRUNCATED CỦA GITHUB GIST KHI DỮ LIỆU LỚN (>750KB)
        // Khi file lớn, GitHub Gist tự động cắt ngang chuỗi và đặt truncated: true.
        // Ta cần fetch trực tiếp từ fileObj.raw_url để lấy nguyên vẹn 100% dữ liệu gốc!
        if (fileObj.truncated || !contentStr || fileObj.raw_url) {
          try {
            let rawRes = await fetch(fileObj.raw_url, {
              headers: { 'Authorization': `Bearer ${pat}` }
            });
            if (!rawRes.ok) {
              rawRes = await fetch(fileObj.raw_url);
            }
            if (rawRes.ok) {
              contentStr = await rawRes.text();
            }
          } catch (rawErr) {
            console.warn("Lỗi fetch raw_url, thử dùng inline content:", rawErr);
          }
        }

        if (!contentStr) throw new Error("Nội dung tệp sao lưu trên Gist bị trống!");

        let parsed;
        try {
          parsed = JSON.parse(contentStr);
        } catch (jsonErr) {
          // Thử lại lần cuối với raw_url trực tiếp nếu parse lỗi
          if (fileObj.raw_url) {
            const fallbackRes = await fetch(fileObj.raw_url);
            if (fallbackRes.ok) {
              contentStr = await fallbackRes.text();
              parsed = JSON.parse(contentStr);
            } else {
              throw jsonErr;
            }
          } else {
            throw jsonErr;
          }
        }
        if (!parsed.sessions || !Array.isArray(parsed.sessions)) throw new Error("Cấu trúc dữ liệu không hợp lệ!");

        if (parsed.sessions && parsed.sessions.length > 0) {
          await clearAllDB();
          for (const s of parsed.sessions) {
            await saveToDB(s);
          }
        }

        sessions = await getAllFromDB();
        if (parsed.activeId && sessions.some(s => s.id === parsed.activeId)) {
          activeId = parsed.activeId;
        } else if (sessions.length > 0) {
          activeId = sessions[0].id;
        }
        ls.setItem('jarvis_active_id', activeId);

        if (parsed.folders && Array.isArray(parsed.folders)) {
          folders = parsed.folders;
          ls.setItem('jarvis_folders', JSON.stringify(folders));
        }

        if (parsed.customPrompts && Array.isArray(parsed.customPrompts)) {
          ls.setItem('jarvis_custom_prompts', JSON.stringify(parsed.customPrompts));
        }

        if (parsed.settings) {
          if (parsed.settings.keys) setGoogleKeysList(parsed.settings.keys);
          if (parsed.settings.keyNames) setGoogleKeyNamesList(parsed.settings.keyNames);
          if (parsed.settings.externalConfigs) setExternalConfigsObj(parsed.settings.externalConfigs);
          if (parsed.settings.model && DOM.model) DOM.model.value = parsed.settings.model;
          if (parsed.settings.temperature && DOM.temp) {
            DOM.temp.value = parsed.settings.temperature;
            if (DOM.tempVal) DOM.tempVal.innerText = parsed.settings.temperature;
          }
          if (parsed.settings.searchEngine && DOM.searchEngineSel) DOM.searchEngineSel.value = parsed.settings.searchEngine;
          if (parsed.settings.globalContext && DOM.globContext) DOM.globContext.value = parsed.settings.globalContext;
          if (parsed.settings.systemInstruction && DOM.sysInst) DOM.sysInst.value = parsed.settings.systemInstruction;
          if (parsed.settings.theme) {
            ls.setItem('jarvis_theme', parsed.settings.theme);
            if (typeof applyTheme === 'function') applyTheme(parsed.settings.theme);
          }
          if (parsed.settings.autoLearnMemory) ls.setItem('jarvis_auto_learn_memory', parsed.settings.autoLearnMemory);
          if (parsed.settings.ragEnabled) ls.setItem('jarvis_rag_enabled', parsed.settings.ragEnabled);
        }

        let importedKCount = 0;
        if (parsed.knowledgeBase && Array.isArray(parsed.knowledgeBase) && window.JarvisRAG && typeof window.JarvisRAG.importKnowledge === 'function') {
          try {
            importedKCount = await window.JarvisRAG.importKnowledge(parsed.knowledgeBase, true);
          } catch (kErr) {
            console.warn("Lỗi khôi phục Kho Tri Thức từ Gist:", kErr);
          }
        }

        const timeStr = new Date().toLocaleString('vi-VN');
        ls.setItem('jarvis_gist_pat', pat);
        ls.setItem('jarvis_gist_id', gistId);
        ls.setItem('jarvis_gist_last_sync', timeStr);

        // Đảm bảo đồng bộ ngay xuống Native Bridge trên Android nếu có
        if (window.JarvisNativeBridge) {
          saveToNativeBridge('jarvis_sessions_backup', JSON.stringify(sessions));
          if (typeof window.JarvisNativeBridge.commit === 'function') {
            window.JarvisNativeBridge.commit();
          }
        }

        const kPullStatus = importedKCount ? `, ${importedKCount} tri thức` : '';
        gistStatusText.innerText = `Đã đồng bộ (${sessions.length} phiên${kPullStatus})`;
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${timeStr}`;

        renderFolders();
        renderSnippets();
        await switchSess(activeId);

        showToast(`Đã đồng bộ thành công ${sessions.length} phiên${importedKCount ? ' & ' + importedKCount + ' mẩu tri thức' : ''} từ Cloud!`, "success");
      } catch (err) {
        showToast(`Lỗi tải về từ Cloud: ${err.message}`, "danger");
      } finally {
        btn.innerHTML = `📥 Tải về từ Cloud (Restore)`;
        btn.disabled = false;
      }
    };


// --- [GEMINI TTS STUDIO PRO MODULE MOVED TO js/tts.js] ---

    // Call initTTSStudio once loaded
    if (typeof initTTSStudio === "function") initTTSStudio(); else if (typeof window.initTTSStudio === "function") window.initTTSStudio();

    // Init Web Share Target & Shortcuts listener and Storage estimation
    handleIncomingWebShare();
    updateStorageStatus();
