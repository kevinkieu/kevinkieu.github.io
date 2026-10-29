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
        <input type="text" id="api-key-name-${i+1}" placeholder="Tên gợi nhớ ${i+1}" class="modern-input" style="width:115px;flex:0 0 115px;font-size:0.8rem;padding:7px 10px;" title="Tên gợi nhớ cho Key ${i+1} (Ví dụ: Gmail A, Key chính, Dự phòng...)">
        <input type="password" id="api-key-${i+1}" placeholder="Google API Key ${i+1} (AIzaSy...)" class="modern-input" style="flex:1;min-width:110px;font-size:0.8rem;padding:7px 10px;" title="Dán Google AI Studio API Key vào đây">
        <span id="api-key-badge-${i+1}" style="font-size:0.7rem;font-weight:700;padding:4px 7px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.05);white-space:nowrap;border:1px solid var(--border);flex-shrink:0;" title="Hạn ngạch hôm nay (20 RPD mỗi model)"><span style="color:#10b981;">3.6: 0/20</span> | <span style="color:#3b82f6;">3.8: 0/20</span></span>
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
      toggleRagEmbedding: $('toggle-rag-embedding'),
      btnToggleSessionMem: $('btn-toggle-session-memory'),
      sessionMemState: $('session-memory-state'),
      btnToggleRag: $('btn-toggle-rag-memory'),
      ragMemoryState: $('rag-memory-state'),
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

    function openKeyQuotaModal() {
      const quotaModal = $('key-quota-modal') || $('key-quota-popover');
      if (!quotaModal) return;
      if (typeof closeModals === 'function') closeModals();
      if (typeof updateKeyQuotaUI === 'function') updateKeyQuotaUI();
      if (typeof renderKeyQuotaPopoverList === 'function') renderKeyQuotaPopoverList();
      quotaModal.style.display = 'flex';
      const overlay = $('modal-overlay');
      if (overlay) overlay.style.display = 'block';
    }
    window.openKeyQuotaModal = openKeyQuotaModal;

    function closeKeyQuotaModal() {
      const quotaModal = $('key-quota-modal') || $('key-quota-popover');
      if (quotaModal) quotaModal.style.display = 'none';
      const overlay = $('modal-overlay');
      if (overlay) overlay.style.display = 'none';
    }
    window.closeKeyQuotaModal = closeKeyQuotaModal;

    const COMMANDS = [
      { id: 'quota', title: 'Xem hạn ngạch 10 Key (20 RPD cho 3.6/3.8 Flash)', shortcut: '/quota', icon: '🔑', run: () => openKeyQuotaModal() },
      { id: 'cloud', title: 'Đồng bộ Cloud đa thiết bị (GitHub Gist)', shortcut: '/cloud', icon: '☁️', run: () => $('btn-open-cloud-sync').click() },
      { id: 'deep', title: 'Bật/Tắt Chế độ Nghiên cứu Sâu (Deep Research)', shortcut: '/deep', icon: '🔬', run: () => $('btn-toggle-deep-research').click() },
      { id: 'new', title: 'Tạo phiên hội thoại mới', shortcut: '/new', icon: '➕', run: () => newSess() },
      { id: 'brief', title: 'Bản tin Ngày Mới (Thời tiết, Tin tức AI/Tech, Kế hoạch)', shortcut: '/brief', icon: '🌅', run: () => openDailyBriefing() },
      { id: 'voice', title: 'Trò chuyện Rảnh tay Liên tục (Hands-Free Voice Flow)', shortcut: '/voice', icon: '🎙️', run: () => toggleHandsFreeVoice() },
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

    function executeChatSlashCommand(rawText) {
      const text = (rawText || '').trim();
      if (!text.startsWith('/')) return false;

      const parts = text.split(/\s+/);
      const cmdWord = parts[0].toLowerCase();

      // 1. Direct aliases for quota & keys
      if (cmdWord === '/quota' || cmdWord === '/key' || cmdWord === '/keys') {
        openKeyQuotaModal();
        return true;
      }
      if (cmdWord === '/brief' || cmdWord === '/briefing' || cmdWord === '/morning') {
        openDailyBriefing();
        return true;
      }
      if (cmdWord === '/voice' || cmdWord === '/handsfree' || cmdWord === '/ranhtay') {
        toggleHandsFreeVoice();
        return true;
      }
      if (cmdWord === '/brain' || cmdWord === '/mind') {
        if (window.JarvisRAG && typeof window.JarvisRAG.openModal === 'function') window.JarvisRAG.openModal('memory');
        return true;
      }
      if (cmdWord === '/help' || cmdWord === '/cmd' || cmdWord === '/commands') {
        openCommandPalette();
        return true;
      }
      if (cmdWord === '/sync') {
        $('btn-open-cloud-sync')?.click();
        return true;
      }

      // 2. Check COMMANDS array
      const matched = COMMANDS.find(c => c.shortcut.toLowerCase() === cmdWord);
      if (matched && typeof matched.run === 'function') {
        matched.run();
        return true;
      }

      // 3. Single-word command that is unknown -> show helpful warning & don't ask AI
      if (parts.length === 1) {
        showToast(`Không tìm thấy lệnh "${cmdWord}". Gõ /help hoặc nhấn Ctrl+K để xem danh sách lệnh!`, "warning");
        return true;
      }

      // 4. Multi-word prompt starting with slash -> pass through to AI
      return false;
    }
    window.executeChatSlashCommand = executeChatSlashCommand;

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

      // Cố gắng gọi AI: Thử model siêu nhẹ FLASH_LITE_MODEL trước, nếu lỗi thì thử model chính của phiên
      const candidateModels = [
        FLASH_LITE_MODEL,
        sessionObj.mod || 'gemini-3.6-flash',
        'gemini-3.1-flash-lite'
      ];

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
              // KHÔNG dùng thinkingConfig ở đây để tránh lỗi 400 Bad Request trên Flash-Lite và tránh tràn token
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
        try {
          res = await ai.models.generateContent({
            model: FLASH_LITE_MODEL,
            contents: promptText
          });
        } catch (mErr) {
          console.warn('Thử lại Auto-Summary với gemini-3.1-flash-lite:', mErr);
          res = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
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

    // --- FEATURE 2: DAILY BRIEFING & MORNING ASSISTANT CONTROLLER ---
    let currentDailyBriefingMarkdown = '';

    const VIETNAM_CITIES = [
      'Hà Nội', 'TP. Hồ Chí Minh', 'TP.HCM', 'Hồ Chí Minh', 'Sài Gòn',
      'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Nha Trang', 'Huế',
      'Vũng Tàu', 'Đà Lạt', 'Biên Hòa', 'Bình Dương', 'Đồng Nai',
      'Buôn Ma Thuột', 'Quy Nhơn', 'Long Xuyên', 'Thái Nguyên',
      'Nam Định', 'Rạch Giá', 'Bắc Ninh', 'Bắc Giang', 'Quảng Ninh',
      'Hạ Long', 'Vinh', 'Phan Thiết', 'Thanh Hóa', 'Bến Tre', 'Tiền Giang'
    ];

    async function detectUserCityFromSecondBrain() {
      if (!window.JarvisRAG || typeof window.JarvisRAG.getAllKnowledge !== 'function') return null;
      try {
        const mems = await window.JarvisRAG.getAllKnowledge('memory');
        if (!mems || !mems.length) return null;

        for (const m of mems) {
          const fullText = `${m.title || ''} ${m.text || ''}`.toLowerCase();
          for (const city of VIETNAM_CITIES) {
            if (fullText.includes(city.toLowerCase())) {
              return (city === 'Sài Gòn' || city === 'TP.HCM') ? 'TP. Hồ Chí Minh' : city;
            }
          }
        }
      } catch (e) {
        console.warn("Lỗi đọc vị trí từ Second Brain:", e);
      }
      return null;
    }

    async function resolveUserLocation() {
      // 1. Vị trí đã lưu trong cài đặt
      const savedCity = ls.getItem('jarvis_user_city');
      const savedLat = ls.getItem('jarvis_user_lat');
      const savedLon = ls.getItem('jarvis_user_lon');
      if (savedCity && savedCity.trim()) {
        return { city: savedCity.trim(), lat: savedLat, lon: savedLon, source: 'saved' };
      }

      // 2. Tự động nhận diện từ Trí nhớ cá nhân (Second Brain)
      const brainCity = await detectUserCityFromSecondBrain();
      if (brainCity) {
        ls.setItem('jarvis_user_city', brainCity);
        return { city: brainCity, source: 'brain' };
      }

      // 3. Tự động nhận diện nhanh qua IP Geolocation
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const ipRes = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=vi', { signal: controller.signal });
        clearTimeout(timer);
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          const detected = ipData.city || ipData.principalSubdivision;
          if (detected) {
            const cleanCity = detected.replace(/Tỉnh |Thành phố /g, '').trim();
            ls.setItem('jarvis_user_city', cleanCity);
            if (ipData.latitude && ipData.longitude) {
              ls.setItem('jarvis_user_lat', ipData.latitude);
              ls.setItem('jarvis_user_lon', ipData.longitude);
            }
            return { city: cleanCity, lat: ipData.latitude, lon: ipData.longitude, source: 'ip' };
          }
        }
      } catch (e) {
        console.warn("IP Location fallback failed:", e);
      }

      // 4. Mặc định
      return { city: 'Hà Nội', source: 'default' };
    }

    async function fetchWeatherForLocation(loc) {
      let lat = loc.lat;
      let lon = loc.lon;
      let cityName = loc.city || 'Hà Nội';

      if (!lat || !lon) {
        try {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=vi&format=json`;
          const geoRes = await fetch(geoUrl);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.results && geoData.results[0]) {
              lat = geoData.results[0].latitude;
              lon = geoData.results[0].longitude;
              cityName = geoData.results[0].name || cityName;
            }
          }
        } catch (gErr) {
          console.warn("Geocoding failed:", gErr);
        }
      }

      if (!lat || !lon) {
        lat = 21.0245;
        lon = 105.8412;
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
      const wRes = await fetch(weatherUrl);
      if (!wRes.ok) throw new Error("Open-Meteo HTTP " + wRes.status);
      const wData = await wRes.json();

      const cur = wData.current || {};
      const daily = wData.daily || {};

      const weatherCodeMap = {
        0: 'Trời quang đãng, nắng đẹp ☀️',
        1: 'Quang đãng, ít mây 🌤️',
        2: 'Mây rải rác ⛅',
        3: 'Nhiều mây, âm u ☁️',
        45: 'Có sương mù 🌫️',
        48: 'Sương mù đọng sương 🌫️',
        51: 'Mưa phùn nhẹ 🌦️',
        53: 'Mưa phùn vừa 🌦️',
        55: 'Mưa phùn dày hạt 🌧️',
        61: 'Mưa nhỏ rải rác 🌧️',
        63: 'Mưa vừa 🌧️',
        65: 'Mưa to 🌧️',
        71: 'Có tuyết rơi nhẹ 🌨️',
        80: 'Mưa rào nhẹ 🌦️',
        81: 'Mưa rào vừa 🌦️',
        82: 'Mưa rào rất to ⛈️',
        95: 'Dông sét rải rác ⛈️',
        96: 'Dông sét kèm mưa đá ⛈️',
        99: 'Dông bão mạnh ⛈️'
      };

      const condition = weatherCodeMap[cur.weather_code] || 'Trời nhiều mây, nắng ráo ⛅';
      const temp = cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : 29;
      const feel = cur.apparent_temperature !== undefined ? Math.round(cur.apparent_temperature) : temp;
      const humidity = cur.relative_humidity_2m !== undefined ? cur.relative_humidity_2m : 65;
      const wind = cur.wind_speed_10m !== undefined ? Math.round(cur.wind_speed_10m) : 5;
      const minTemp = daily.temperature_2m_min?.[0] !== undefined ? Math.round(daily.temperature_2m_min[0]) : temp - 4;
      const maxTemp = daily.temperature_2m_max?.[0] !== undefined ? Math.round(daily.temperature_2m_max[0]) : temp + 4;

      return {
        cityName,
        lat,
        lon,
        text: `Thời tiết tại ${cityName} hôm nay: ${condition}. Nhiệt độ hiện tại: ${temp}°C (cảm nhận như ${feel}°C). Biên độ nhiệt trong ngày: ${minTemp}°C - ${maxTemp}°C. Độ ẩm: ${humidity}%, sức gió: ${wind} km/h.`
      };
    }

    async function generateDailyBriefing(forceRefresh = false) {
      const loadingEl = $('briefing-loading-state');
      const contentEl = $('briefing-content-body');
      const statusEl = $('briefing-loading-status');
      const speakBtn = $('btn-speak-briefing');

      if (speakBtn) speakBtn.innerHTML = "<span>🔊 Nghe bản tin (Jarvis TTS)</span>";

      const now = new Date();
      const dateOptions = { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' };
      const dateStr = now.toLocaleDateString('vi-VN', dateOptions);
      const todayKey = now.toISOString().slice(0, 10);

      const dateLabel = $('briefing-date-label');
      if (dateLabel) dateLabel.innerText = `${dateStr} · Báo cáo tổng hợp tự động`;

      const userCity = ls.getItem('jarvis_user_city');
      const locationLabel = $('briefing-location-label');
      if (locationLabel && userCity) locationLabel.innerText = userCity;

      // 1. Kiểm tra cache hôm nay nếu không yêu cầu làm mới
      if (!forceRefresh) {
        const cached = ls.getItem('jarvis_briefing_' + todayKey);
        if (cached) {
          currentDailyBriefingMarkdown = cached;
          if (loadingEl) loadingEl.style.display = 'none';
          if (contentEl) {
            contentEl.style.display = 'block';
            contentEl.innerHTML = marked.parse(cached);
            window.renderMathInElement?.(contentEl, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
          }
          return;
        }
      }

      // 2. Bắt đầu luồng tổng hợp
      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) {
        contentEl.style.display = 'none';
        contentEl.innerHTML = '';
      }

      try {
        const cs = sessions.find(x => x.id === activeId);
        const activeKeys = getGoogleKeysList().filter(Boolean);
        const key = getSessionApiKey(cs) || activeKeys[0];
        if (!key) {
          throw new Error("Cần có Google API Key để tổng hợp Bản tin Ngày mới!");
        }

        // Bước A: Xác định vị trí thông minh & Lấy thời tiết chuẩn xác
        if (statusEl) statusEl.innerText = "Đang xác định vị trí & tra cứu thời tiết chính xác...";
        const loc = await resolveUserLocation();
        if (locationLabel) locationLabel.innerText = loc.city;

        let weatherInfo = `Thời tiết hôm nay tại ${loc.city}: Nắng ráo, nhiệt độ dao động 25°C - 32°C.`;
        try {
          const wRes = await fetchWeatherForLocation(loc);
          weatherInfo = wRes.text;
          if (locationLabel) locationLabel.innerText = wRes.cityName;
        } catch (wErr) {
          console.warn("Lỗi tra cứu thời tiết chi tiết:", wErr);
        }

        let newsInfo = "";
        try {
          if (statusEl) statusEl.innerText = "Đang quét tin tức AI & Công nghệ nổi bật hôm nay...";
          if (typeof fetchTavilySearch === 'function' && ls.getItem('tavily_api_key')) {
            newsInfo = await fetchTavilySearch("tin tức AI trí tuệ nhân tạo công nghệ mới nhất hôm nay");
          } else if (typeof fetchJinaSearch === 'function') {
            newsInfo = await fetchJinaSearch("tin tức AI trí tuệ nhân tạo công nghệ mới nhất hôm nay");
          }
        } catch (nErr) {
          console.warn("Không lấy được tin tức tìm kiếm web:", nErr);
        }

        // Bước B: Đọc trí nhớ từ Second Brain
        if (statusEl) statusEl.innerText = "Đang trích xuất mục tiêu & công việc từ Second Brain...";
        let memoryContext = "";
        if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
          try {
            const allMems = await window.JarvisRAG.getAllKnowledge('memory');
            if (allMems && allMems.length) {
              memoryContext = allMems.slice(0, 12).map((m, idx) => `[${m.category || 'personal'}] ${m.title}: ${m.text}`).join('\n');
            }
          } catch (mErr) {
            console.warn("Lỗi đọc Second Brain:", mErr);
          }
        }

        // Bước C: Biên soạn bản tin bằng mô hình Flash tối ưu tốc độ: gemini-3.6-flash (fallback gemini-3.5-flash-lite)
        if (statusEl) statusEl.innerText = "Jarvis (Gemini 3.6 Flash) đang biên soạn bản tin hoàn chỉnh...";

        const currentCityName = locationLabel ? locationLabel.innerText : loc.city;
        const synthesisPrompt = `Bạn là Jarvis - Trợ lý AI cá nhân cao cấp.
Hôm nay là: ${dateStr}.
Vị trí của người dùng: ${currentCityName}.

Thông tin thời tiết thực tế tại ${currentCityName}:
${weatherInfo}

Thông tin tin tức công nghệ / AI thời gian thực thu thập được:
${newsInfo ? newsInfo.slice(0, 2000) : "Các diễn biến phát triển AI mới nhất: Gemini 3.6 Flash, các mô hình Agentic AI, tự động hóa quy trình làm việc và các công cụ phát triển phần mềm đang bùng nổ."}

Dữ liệu trí nhớ Second Brain về người dùng (mục tiêu, sở thích, dự án):
${memoryContext ? memoryContext : "Người dùng là một chuyên gia/kỹ sư công nghệ đam mê AI, tập trung vào hiệu suất cao và ứng dụng AI vào cuộc sống thực tế."}

Nhiệm vụ:
Hãy tạo một "Bản Tin Ngày Mới (Daily Briefing)" cực kỳ truyền cảm hứng, ngắn gọn, súc tích, mang tính thực tế cao cho người dùng:
1. ☀️ **Chào buổi sáng & Thời tiết tại ${currentCityName}:** Lời chào tràn đầy năng lượng, cập nhật ngắn gọn thời tiết và lưu ý trang phục/sức khỏe khi ra ngoài.
2. 🚀 **Điểm tin Công nghệ & AI nóng:** Chọn lọc 2-3 điểm tin công nghệ/AI đáng chú ý nhất.
3. 🎯 **Mục tiêu & Trọng tâm của bạn:** Dựa trên trí nhớ Second Brain, nhắc nhở và đề xuất 1-2 việc ưu tiên cần hoàn thành hôm nay.
4. 💡 **Châm ngôn & Gợi ý hành động:** 1 câu danh ngôn đắt giá và 1 mẹo nhỏ tăng năng suất hôm nay.

Định dạng Markdown đẹp mắt, phân đoạn rõ ràng bằng tiêu đề và bullet points, icon sinh động. Giữ giọng văn tự tin, tinh tế, tận tụy chuẩn phong cách Jarvis.`;

        const ai = new GoogleGenAI({ apiKey: key });
        const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
        let generatedText = '';
        let lastError = null;

        for (const m of modelsToTry) {
          try {
            const res = await ai.models.generateContent({
              model: m,
              contents: synthesisPrompt,
              config: {
                temperature: 0.35,
                safetySettings: SAFETY
              }
            });
            if (res.text) {
              generatedText = res.text;
              break;
            }
          } catch (err) {
            console.warn(`Briefing generation failed on ${m}:`, err);
            lastError = err;
          }
        }

        if (!generatedText) {
          throw lastError || new Error("Không thể tạo bản tin ngày mới lúc này.");
        }

        currentDailyBriefingMarkdown = generatedText;
        ls.setItem('jarvis_briefing_' + todayKey, generatedText);

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) {
          contentEl.style.display = 'block';
          contentEl.innerHTML = marked.parse(generatedText);
          window.renderMathInElement?.(contentEl, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
        }
      } catch (err) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) {
          contentEl.style.display = 'block';
          contentEl.innerHTML = `<div style="color:var(--danger);padding:16px;text-align:center;">
            <strong>Không thể tải bản tin ngày mới:</strong> ${escapeHtml(err.message)}
            <div style="margin-top:10px;"><button type="button" class="btn" onclick="window.generateDailyBriefing(true)">Thử lại</button></div>
          </div>`;
        }
      }
    }
    window.generateDailyBriefing = generateDailyBriefing;

    function openDailyBriefing() {
      const modal = $('daily-briefing-modal');
      if (!modal) return;
      modal.style.display = 'flex';
      if (oLay) oLay.style.display = 'block';
      generateDailyBriefing(false);
    }
    window.openDailyBriefing = openDailyBriefing;

    // Header buttons
    const btnOpenBriefing = $('btn-open-briefing');
    if (btnOpenBriefing) btnOpenBriefing.onclick = openDailyBriefing;

    const btnOpenMemoryHeader = $('btn-open-memory-header');
    if (btnOpenMemoryHeader) {
      btnOpenMemoryHeader.onclick = () => {
        if (window.JarvisRAG && typeof window.JarvisRAG.openModal === 'function') {
          window.JarvisRAG.openModal('memory');
        } else {
          const kModal = $('knowledge-modal');
          if (kModal) kModal.style.display = 'flex';
          if (oLay) oLay.style.display = 'block';
        }
      };
    }

    // Modal action buttons
    const btnRefreshBriefing = $('btn-refresh-briefing');
    if (btnRefreshBriefing) btnRefreshBriefing.onclick = () => generateDailyBriefing(true);

    const btnSpeakBriefing = $('btn-speak-briefing');
    if (btnSpeakBriefing) {
      btnSpeakBriefing.onclick = () => {
        if (currentSpeakingBtn === btnSpeakBriefing) {
          stopCurrentSpeaking();
          return;
        }
        if (!currentDailyBriefingMarkdown) {
          return showToast("Chưa có nội dung bản tin để phát giọng nói!", "warning");
        }
        playTextAudio(currentDailyBriefingMarkdown, { btn: btnSpeakBriefing });
      };
    }

    const btnCopyBriefing = $('btn-copy-briefing');
    if (btnCopyBriefing) {
      btnCopyBriefing.onclick = async () => {
        if (!currentDailyBriefingMarkdown) return showToast("Chưa có nội dung để sao chép!", "warning");
        try {
          await navigator.clipboard.writeText(currentDailyBriefingMarkdown);
          showToast("📋 Đã sao chép bản tin ngày mới vào Clipboard!", "success");
        } catch (e) {
          showToast("Không thể sao chép: " + e.message, "danger");
        }
      };
    }

    const btnDiscussBriefing = $('btn-discuss-briefing');
    if (btnDiscussBriefing) {
      btnDiscussBriefing.onclick = () => {
        const modal = $('daily-briefing-modal');
        if (modal) modal.style.display = 'none';
        if (oLay) oLay.style.display = 'none';
        DOM.input.value = "Tôi vừa xem Bản Tin Ngày Mới. Hãy cùng tôi phân tích sâu hơn về các mục tiêu công việc hôm nay: ";
        DOM.input.dispatchEvent(new Event('input'));
        DOM.input.focus();
      };
    }

    // Location configuration buttons
    const btnChangeLocation = $('btn-change-location');
    if (btnChangeLocation) {
      btnChangeLocation.onclick = () => {
        const currentCity = ls.getItem('jarvis_user_city') || 'Hà Nội';
        const newCity = prompt("Nhập tên thành phố / tỉnh của bạn để nhận dự báo thời tiết chính xác:\n(Ví dụ: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Cần Thơ, Hải Phòng, Nha Trang, Huế...)", currentCity);
        if (newCity && newCity.trim() && newCity.trim() !== currentCity) {
          ls.setItem('jarvis_user_city', newCity.trim());
          ls.removeItem('jarvis_user_lat');
          ls.removeItem('jarvis_user_lon');
          const todayKey = new Date().toISOString().slice(0, 10);
          ls.removeItem('jarvis_briefing_' + todayKey);
          showToast(`📍 Đã đổi vị trí sang: ${newCity.trim()}`, "success");
          generateDailyBriefing(true);
        }
      };
    }

    const btnGpsLocation = $('btn-gps-location');
    if (btnGpsLocation) {
      btnGpsLocation.onclick = () => {
        if (!navigator.geolocation) {
          return showToast("Trình duyệt không hỗ trợ Geolocation!", "warning");
        }
        btnGpsLocation.disabled = true;
        btnGpsLocation.innerText = "⏳ Đang định vị...";
        showToast("Đang xin quyền định vị GPS từ trình duyệt...", "info");

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            btnGpsLocation.disabled = false;
            btnGpsLocation.innerText = "🎯 Định vị GPS";
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            ls.setItem('jarvis_user_lat', lat);
            ls.setItem('jarvis_user_lon', lon);

            let detectedCity = 'Vị trí hiện tại';
            try {
              const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=vi`);
              if (r.ok) {
                const d = await r.json();
                detectedCity = d.city || d.principalSubdivision || d.locality || detectedCity;
                detectedCity = detectedCity.replace(/Tỉnh |Thành phố /g, '').trim();
              }
            } catch (e) {}

            ls.setItem('jarvis_user_city', detectedCity);
            const todayKey = new Date().toISOString().slice(0, 10);
            ls.removeItem('jarvis_briefing_' + todayKey);
            showToast(`🎯 Định vị GPS thành công: ${detectedCity}!`, "success");
            generateDailyBriefing(true);
          },
          (err) => {
            btnGpsLocation.disabled = false;
            btnGpsLocation.innerText = "🎯 Định vị GPS";
            console.warn("GPS error:", err);
            showToast("Không thể lấy toạ độ GPS: " + (err.message || "Bị từ chối quyền"), "warning");
          },
          { timeout: 10000, enableHighAccuracy: true }
        );
      };
    }

    // --- FEATURE 3: HANDS-FREE VOICE FLOW CONTROLLER ---
    let isHandsFreeActive = false;
    let handsFreeRecognition = null;
    let handsFreeSilenceTimer = null;
    let isHandsFreeSpeaking = false;
    let handsFreeCurrentTranscript = '';

    function stopHandsFreeVoice() {
      isHandsFreeActive = false;
      isHandsFreeSpeaking = false;
      clearTimeout(handsFreeSilenceTimer);
      handsFreeSilenceTimer = null;
      handsFreeCurrentTranscript = '';

      if (handsFreeRecognition) {
        try { handsFreeRecognition.abort(); } catch (e) {}
        handsFreeRecognition = null;
      }
      stopCurrentSpeaking();

      const banner = $('hands-free-banner');
      if (banner) banner.style.display = 'none';

      const micBtn = $('btn-hands-free-voice');
      if (micBtn) micBtn.classList.remove('active');

      const chipBtn = $('btn-toggle-hands-free-chip');
      if (chipBtn) chipBtn.classList.remove('active');
    }
    window.stopHandsFreeVoice = stopHandsFreeVoice;

    function toggleHandsFreeVoice(forceState) {
      const shouldActivate = forceState !== undefined ? forceState : !isHandsFreeActive;

      if (!shouldActivate) {
        stopHandsFreeVoice();
        showToast("Đã tắt chế độ rảnh tay.", "info");
        return;
      }

      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        return showToast("Trình duyệt không hỗ trợ Web Speech Recognition! Vui lòng dùng Chrome hoặc Edge.", "warning");
      }

      stopHandsFreeVoice();
      isHandsFreeActive = true;

      const banner = $('hands-free-banner');
      if (banner) banner.style.display = 'flex';

      const micBtn = $('btn-hands-free-voice');
      if (micBtn) micBtn.classList.add('active');

      const chipBtn = $('btn-toggle-hands-free-chip');
      if (chipBtn) chipBtn.classList.add('active');

      const statusText = $('hf-status-text');
      if (statusText) statusText.innerText = "Đang lắng nghe...";

      const preview = $('hf-transcript-preview');
      if (preview) preview.innerText = "";

      try {
        handsFreeRecognition = new SpeechRec();
        handsFreeRecognition.continuous = true;
        handsFreeRecognition.interimResults = true;
        handsFreeRecognition.lang = 'vi-VN';
        handsFreeRecognition.maxAlternatives = 1;

        handsFreeRecognition.onresult = (event) => {
          if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;

          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }

          handsFreeCurrentTranscript = (final || interim || '').trim();
          if (preview && handsFreeCurrentTranscript) {
            preview.innerText = `"${handsFreeCurrentTranscript}"`;
          }

          // Voice Activity Detection (VAD) silence pause trigger
          clearTimeout(handsFreeSilenceTimer);
          handsFreeSilenceTimer = setTimeout(() => {
            const textToSend = handsFreeCurrentTranscript.trim();
            if (textToSend && isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
              handsFreeCurrentTranscript = '';
              if (statusText) statusText.innerText = "Đang gửi câu hỏi...";
              try { handsFreeRecognition.stop(); } catch (e) {}

              DOM.input.value = textToSend;
              DOM.input.dispatchEvent(new Event('input'));
              DOM.sendBtn.click();
            }
          }, 1300);
        };

        handsFreeRecognition.onerror = (e) => {
          console.warn("HandsFree Speech error:", e.error);
          if (e.error === 'not-allowed') {
            showToast("Chưa cấp quyền Microphone! Vui lòng cho phép truy cập mic.", "danger");
            stopHandsFreeVoice();
          }
        };

        handsFreeRecognition.onend = () => {
          if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
            setTimeout(() => {
              if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                try { handsFreeRecognition.start(); } catch (e) {}
              }
            }, 150);
          }
        };

        handsFreeRecognition.start();
        showToast("🎙️ Đã bật Trò chuyện 2 chiều Rảnh tay liên tục!", "success");
      } catch (err) {
        console.error("HandsFree start error:", err);
        showToast("Không thể khởi động Microphone: " + err.message, "danger");
        stopHandsFreeVoice();
      }
    }
    window.toggleHandsFreeVoice = toggleHandsFreeVoice;

    // Hands-Free triggers
    const btnHandsFreeVoice = $('btn-hands-free-voice');
    if (btnHandsFreeVoice) btnHandsFreeVoice.onclick = () => toggleHandsFreeVoice();

    const btnToggleHfChip = $('btn-toggle-hands-free-chip');
    if (btnToggleHfChip) btnToggleHfChip.onclick = () => toggleHandsFreeVoice();

    const btnStopHf = $('btn-stop-hands-free');
    if (btnStopHf) btnStopHf.onclick = () => toggleHandsFreeVoice(false);

    // --- [MULTI-AGENT ARENA MODULE MOVED TO js/arena.js] ---

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
    // DISTRIBUTED KEY QUOTA TRACKER (10 GOOGLE FREE KEYS • 20 RPD EACH FOR 3.6 & 3.8 • 4 DEVICES)
    // ==========================================================================

    function getMyDeviceId() {
      let devId = ls.getItem('jarvis_device_id');
      if (!devId) {
        const prefix = ('ontouchstart' in window) ? 'mob_' : 'pc_';
        devId = prefix + Math.random().toString(36).substring(2, 8);
        ls.setItem('jarvis_device_id', devId);
      }
      return devId;
    }

    // 14:00 giờ Việt Nam (UTC+7) làm mốc chuyển giao chu kỳ 24h của Google AI Studio (00:00 Pacific Time)
    function getCurrentQuotaCycle() {
      const now = new Date();
      const vnTimeMs = now.getTime() + (now.getTimezoneOffset() * 60000) + (7 * 3600000);
      const shifted = new Date(vnTimeMs - 14 * 3600000);
      const y = shifted.getFullYear();
      const m = String(shifted.getMonth() + 1).padStart(2, '0');
      const d = String(shifted.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    function getFlashModelBucket(modelName) {
      const m = (modelName || '').toLowerCase();
      if (m.includes('3.8-flash') || m.includes('3.8')) return '3.8';
      if (m.includes('3.6-flash') || m.includes('3.6')) return '3.6';
      return null;
    }

    function getSelectedFlashModelBucket() {
      try {
        const modEl = $('model-select');
        const modVal = modEl ? modEl.value : 'gemini-3.8-flash';
        return getFlashModelBucket(modVal) || '3.8';
      } catch (_) {
        return '3.8';
      }
    }

    function normalizeSlotData(slotObj) {
      if (!slotObj || typeof slotObj !== 'object') return { '3.6': {}, '3.8': {} };
      if (slotObj['3.6'] || slotObj['3.8']) {
        return {
          '3.6': (typeof slotObj['3.6'] === 'object' && slotObj['3.6']) ? slotObj['3.6'] : {},
          '3.8': (typeof slotObj['3.8'] === 'object' && slotObj['3.8']) ? slotObj['3.8'] : {}
        };
      }
      // Khả năng tương thích ngược (legacy flat structure): gán về 3.8
      const legacyMap = {};
      for (const [k, v] of Object.entries(slotObj)) {
        if (typeof v === 'number') legacyMap[k] = v;
      }
      return { '3.6': {}, '3.8': legacyMap };
    }

    function loadKeyUsageData() {
      const curCycle = getCurrentQuotaCycle();
      try {
        const raw = ls.getItem('jarvis_key_usage_flash');
        if (raw) {
          const data = JSON.parse(raw);
          if (data && data.cycle === curCycle && data.keys) {
            return data;
          }
        }
      } catch (_) {}
      const fresh = { cycle: curCycle, keys: {} };
      ls.setItem('jarvis_key_usage_flash', JSON.stringify(fresh));
      return fresh;
    }

    function saveKeyUsageData(data) {
      try {
        ls.setItem('jarvis_key_usage_flash', JSON.stringify(data));
      } catch (_) {}
    }

    function getKeyUsageCount(slotIndex, specificModelBucket = null) {
      const data = loadKeyUsageData();
      const rawSlot = data.keys[String(slotIndex)];
      const normSlot = normalizeSlotData(rawSlot);
      const targetBucket = specificModelBucket || getSelectedFlashModelBucket();
      const bucketObj = normSlot[targetBucket] || {};
      return Object.values(bucketObj).reduce((sum, v) => sum + (Number(v) || 0), 0);
    }

    function isLocalKeyUsageAhead(remoteUsage) {
      if (!remoteUsage || !remoteUsage.keys) return true;
      const curCycle = getCurrentQuotaCycle();
      if (remoteUsage.cycle !== curCycle) return false;
      const localData = loadKeyUsageData();
      for (const [slotKey, localSlotRaw] of Object.entries(localData.keys)) {
        const localNorm = normalizeSlotData(localSlotRaw);
        const remoteNorm = normalizeSlotData(remoteUsage.keys?.[slotKey]);
        for (const b of ['3.6', '3.8']) {
          for (const [devId, count] of Object.entries(localNorm[b] || {})) {
            const remoteCount = remoteNorm[b]?.[devId] || 0;
            if (count > remoteCount) return true;
          }
        }
      }
      return false;
    }

    function mergeRemoteKeyUsage(remoteUsage) {
      if (!remoteUsage || !remoteUsage.cycle || !remoteUsage.keys) return false;
      const curCycle = getCurrentQuotaCycle();
      let localData = loadKeyUsageData();
      let changed = false;

      if (remoteUsage.cycle === curCycle) {
        for (const [slotKey, remoteSlotRaw] of Object.entries(remoteUsage.keys)) {
          if (!localData.keys[slotKey]) localData.keys[slotKey] = { '3.6': {}, '3.8': {} };
          else localData.keys[slotKey] = normalizeSlotData(localData.keys[slotKey]);

          const remoteNorm = normalizeSlotData(remoteSlotRaw);
          for (const b of ['3.6', '3.8']) {
            if (!localData.keys[slotKey][b]) localData.keys[slotKey][b] = {};
            for (const [devId, remoteCount] of Object.entries(remoteNorm[b] || {})) {
              const localCount = localData.keys[slotKey][b][devId] || 0;
              if (remoteCount > localCount) {
                localData.keys[slotKey][b][devId] = remoteCount;
                changed = true;
              }
            }
          }
        }
      }
      if (changed) {
        saveKeyUsageData(localData);
        updateKeyQuotaUI();
      }
      return changed;
    }

    function recordKeyRequest(slotIndex, model) {
      const bucket = getFlashModelBucket(model);
      if (!bucket) return; // Chỉ tính model 3.6 và 3.8 Flash (20 RPD mỗi con)

      const data = loadKeyUsageData();
      const devId = getMyDeviceId();
      const slotKey = String(slotIndex);
      if (!data.keys[slotKey]) data.keys[slotKey] = { '3.6': {}, '3.8': {} };
      else data.keys[slotKey] = normalizeSlotData(data.keys[slotKey]);

      if (!data.keys[slotKey][bucket]) data.keys[slotKey][bucket] = {};
      data.keys[slotKey][bucket][devId] = (data.keys[slotKey][bucket][devId] || 0) + 1;

      saveKeyUsageData(data);
      updateKeyQuotaUI();
      if (typeof window.JarvisSync?.scheduleAutoSync === 'function') {
        window.JarvisSync.scheduleAutoSync(5000);
      }
    }

    function resetKeyUsageToday() {
      const curCycle = getCurrentQuotaCycle();
      const fresh = { cycle: curCycle, keys: {} };
      saveKeyUsageData(fresh);
      updateKeyQuotaUI();
      if (typeof window.JarvisSync?.scheduleAutoSync === 'function') {
        window.JarvisSync.scheduleAutoSync(2000);
      }
    }

    function findSlotIndexForKey(key) {
      if (!key) return 1;
      for (let i = 1; i <= 10; i++) {
        let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || "").trim();
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        if (k === key) return i;
      }
      return 1;
    }

    function getActiveKeySlot() {
      try {
        const selEl = $('api-key-select');
        const sel = selEl ? selEl.value : 'auto';
        if (sel !== 'auto') {
          return parseInt(sel, 10) + 1;
        }
        if (typeof sessions !== 'undefined' && Array.isArray(sessions) && typeof activeId !== 'undefined') {
          const cs = sessions.find(x => x.id === activeId);
          if (cs?.assignedApiKey) {
            return findSlotIndexForKey(cs.assignedApiKey);
          }
        }
      } catch (_) {}
      return 1;
    }

    function updateKeyQuotaUI() {
      const curSlot = getActiveKeySlot();
      const curBucket = getSelectedFlashModelBucket(); // '3.8' | '3.6'
      const count = getKeyUsageCount(curSlot, curBucket);
      const name = (ls.getItem(`jarvis_api_name_${curSlot}`) || ls.getItem(`huanmu_api_name_${curSlot}`) || `Key ${curSlot}`).trim();

      // 1. Cập nhật Chip trên Header: Hiển thị rõ model đang active (3.6 hay 3.8)
      const quotaLabel = $('key-quota-label');
      const quotaDot = $('key-quota-dot');
      const quotaBtn = $('btn-key-quota-header');

      if (quotaLabel && quotaDot && quotaBtn) {
        const shortName = name.length > 7 ? name.slice(0, 7) + '..' : name;
        quotaLabel.innerText = `🔑 ${shortName}: ${count}/20 (${curBucket})`;
        if (count < 15) {
          quotaDot.style.background = '#10b981';
          quotaBtn.style.borderColor = 'var(--border)';
        } else if (count < 20) {
          quotaDot.style.background = '#f59e0b';
          quotaBtn.style.borderColor = 'rgba(245,158,11,0.5)';
        } else {
          quotaDot.style.background = '#ef4444';
          quotaBtn.style.borderColor = 'rgba(239,68,68,0.5)';
        }
      }

      // 2. Cập nhật các badge trong modal Cấu hình (api-key-badge-1..10): Hiển thị cả 3.6 và 3.8
      for (let i = 1; i <= 10; i++) {
        const badge = $(`api-key-badge-${i}`);
        if (badge) {
          const u36 = getKeyUsageCount(i, '3.6');
          const u38 = getKeyUsageCount(i, '3.8');
          badge.innerHTML = `<span style="color:${u36 >= 20 ? '#ef4444' : u36 >= 15 ? '#f59e0b' : '#10b981'}">3.6: ${u36}/20</span> | <span style="color:${u38 >= 20 ? '#ef4444' : u38 >= 15 ? '#f59e0b' : '#3b82f6'}">3.8: ${u38}/20</span>`;
        }
      }

      // 3. Nếu Popover đang mở, re-render danh sách 10 Key
      renderKeyQuotaPopoverList();
    }

    function getKeyBadgeHtml(keyNum, modelName = null) {
      if (!keyNum) return '';
      const n = (ls.getItem(`jarvis_api_name_${keyNum}`) || ls.getItem(`huanmu_api_name_${keyNum}`) || '').trim();
      const label = n ? `Key #${keyNum} (${n})` : `Key #${keyNum}`;
      const bucket = modelName ? getFlashModelBucket(modelName) : getSelectedFlashModelBucket();
      const bucketTag = bucket ? ` · ${bucket}` : '';
      return `<span class="key-indicator-badge" title="Tin nhắn này được phản hồi bằng Google ${escapeHtml(label)}${bucketTag}" style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:rgba(59,130,246,0.12);color:#3b82f6;font-weight:600;margin-left:6px;border:1px solid rgba(59,130,246,0.3);display:inline-flex;align-items:center;gap:3px;vertical-align:middle;cursor:default;">🔑 ${escapeHtml(label)}${bucketTag}</span>`;
    }
    window.getKeyBadgeHtml = getKeyBadgeHtml;

    function renderKeyQuotaPopoverList() {
      const listEl = $('key-quota-list');
      if (!listEl) return;
      const curSlot = getActiveKeySlot();
      const curBucket = getSelectedFlashModelBucket(); // '3.8' | '3.6'

      let html = '';
      let hasAnyKey = false;

      for (let i = 1; i <= 10; i++) {
        let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || "").trim();
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || `Key ${i}`).trim();
        if (!k) continue;

        hasAnyKey = true;
        const u36 = getKeyUsageCount(i, '3.6');
        const u38 = getKeyUsageCount(i, '3.8');
        const isCurrent = (i === curSlot);

        // Highlight badge của model đang chọn
        const badge36Style = curBucket === '3.6' 
          ? `background:${u36 >= 20 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};color:${u36 >= 20 ? '#ef4444' : '#10b981'};font-weight:800;border:1.5px solid ${u36 >= 20 ? '#ef4444' : '#10b981'}`
          : `background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border)`;

        const badge38Style = curBucket === '3.8'
          ? `background:${u38 >= 20 ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'};color:${u38 >= 20 ? '#ef4444' : '#3b82f6'};font-weight:800;border:1.5px solid ${u38 >= 20 ? '#ef4444' : '#3b82f6'}`
          : `background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border)`;

        const activeBorder = isCurrent ? 'border:1.5px solid var(--primary);background:rgba(59,130,246,0.08);' : 'border:1px solid var(--border);background:var(--bg-card);';

        html += `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 9px;border-radius:var(--radius-sm);${activeBorder}font-size:0.78rem;">
            <div style="display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;min-width:0;">
              <span style="font-weight:700;color:${isCurrent ? 'var(--primary)' : 'var(--text-muted)'};min-width:20px;">#${i}</span>
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                <strong style="color:var(--text-main);">${escapeHtml(n)}</strong>
                <span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px;">(${k.slice(0, 5)}...)</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
              <span title="Hạn ngạch 3.6 Flash (20 RPD)" style="font-size:0.68rem;padding:2px 5px;border-radius:4px;${badge36Style}">
                3.6: ${u36}/20
              </span>
              <span title="Hạn ngạch 3.8 Flash (20 RPD)" style="font-size:0.68rem;padding:2px 5px;border-radius:4px;${badge38Style}">
                3.8: ${u38}/20
              </span>
              ${isCurrent ? '<span style="font-size:0.7rem;color:var(--primary);font-weight:700;margin-left:2px;">●</span>' : `<button class="btn" onclick="window.selectKeySlotQuick(${i})" style="padding:2px 6px;font-size:0.7rem;margin-left:2px;">Chọn</button>`}
            </div>
          </div>
        `;
      }

      if (!hasAnyKey) {
        html = '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:12px;">Chưa có Google API Key nào được cấu hình.</div>';
      }

      listEl.innerHTML = html;
    }

    window.selectKeySlotQuick = (slotIndex) => {
      if (DOM.apiKeySel) {
        DOM.apiKeySel.value = String(slotIndex - 1);
        DOM.apiKeySel.dispatchEvent(new Event('change'));
      }
      const cs = sessions.find(x => x.id === activeId);
      if (cs) {
        let manualKey = (ls.getItem(`jarvis_api_${slotIndex}`) || ls.getItem(`huanmu_api_${slotIndex}`) || "").trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
        cs.assignedApiKey = manualKey;
        cs.keySel = String(slotIndex - 1);
        saveToDB(cs);
      }
      updateKeyQuotaUI();
      showToast(`🔑 Đã chuyển sang Key #${slotIndex}!`, "info");
    };

    // Expose to window for sync.js and global bindings
    window.loadKeyUsageData = loadKeyUsageData;
    window.saveKeyUsageData = saveKeyUsageData;
    window.getKeyUsageCount = getKeyUsageCount;
    window.recordKeyRequest = recordKeyRequest;
    window.mergeRemoteKeyUsage = mergeRemoteKeyUsage;
    window.isLocalKeyUsageAhead = isLocalKeyUsageAhead;
    window.updateKeyQuotaUI = updateKeyQuotaUI;
    window.getFlashModelBucket = getFlashModelBucket;

    const getSessionApiKey = (cs, forceRotate = false) => {
      const selEl = $('api-key-select');
      const sel = selEl ? selEl.value : 'auto';
      if (sel !== 'auto') {
        let manualKey = (ls.getItem(`jarvis_api_${parseInt(sel)+1}`) || ls.getItem(`huanmu_api_${parseInt(sel)+1}`) || "").trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
        return manualKey;
      }

      // Kiểm tra model đang sử dụng có phải 20 RPD (3.6 hoặc 3.8 Flash) không:
      const activeModEl = $('model-select');
      const activeMod = activeModEl ? activeModEl.value : 'gemini-3.8-flash';
      const flashBucket = getFlashModelBucket(activeMod); // '3.8' | '3.6' | null
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
            showToast(`⚠️ Tất cả các Google Key đều đã đạt 20/20 RPD cho Gemini ${flashBucket} Flash hôm nay!`, "warning");
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

      return `${timeInstruction}\n\n[CHỈ THỊ HỆ THỐNG]:\n${(DOM.toggleGlob?.checked !== false && g) ? '--- TOÀN CỤC: ' + g + '\n' : ''}--- RIÊNG: ${b}${memorySnippet}${pinnedSnippet}${ragBlock}\n\n[QUY TẮC ỨNG XỬ TẾ NHỊ]: Khi người dùng hỏi các câu hỏi kiến thức khoa học, nấu ăn, công nghệ, học tập hoặc câu hỏi phổ thông (như thịt gà, kỹ thuật, thời tiết...), TUYỆT ĐỐI KHÔNG tự tiện nhắc đến thông tin gia đình, đời tư, con cái (như bé Bắp, bé Tiền) nếu người dùng không chủ động hỏi hay yêu cầu.`;
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
      document.querySelectorAll('.modal-box, #command-palette-modal, #daily-briefing-modal, #arena-modal, #share-target-modal').forEach(m => m.style.display = 'none');
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
      if (s && activeFolder !== 'All' && s.folder && s.folder !== activeFolder) {
        activeFolder = 'All';
        ls.setItem('jarvis_active_folder', activeFolder);
        renderFolders();
      }
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
      const v = activeFolder === "All" ? sessions : sessions.filter(s => s.folder === activeFolder);
      DOM.selSession.innerHTML = v.map(s => {
        const dot = s.color ? '● ' : '';
        return `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${dot}${activeFolder === "All" ? `[${s.folder}] ` : ''}${s.name}</option>`;
      }).join('');
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
    [DOM.sysInst, DOM.apiKeySel, DOM.toggleGlob, DOM.toggleSearch, DOM.searchEngineSel, DOM.topK, DOM.thinking].forEach(el => el?.addEventListener('change', updateConfig));

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

    function stopCurrentSpeaking() {
      if (currentSpeakingAudio) {
        currentSpeakingAudio.pause();
        currentSpeakingAudio = null;
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
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

      const isVietnamese = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
      const activeKeys = getGoogleKeysList().filter(Boolean);

      // 1. Thử đọc bằng Gemini TTS chất lượng cao (gemini-3.8-flash-lite-tts)
      if (activeKeys.length > 0) {
        try {
          const speechChunk = clean.length > 950 ? clean.slice(0, 950) + '...' : clean;
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
                    voiceName: 'Aoede'
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

            if (btn) btn.innerHTML = "⏹️ Dừng";

            const cleanup = () => {
              if (btn) {
                btn.innerHTML = btn.getAttribute('data-original-html') || "🔊 Nghe";
                btn.classList.remove('speaking-active');
                currentSpeakingBtn = null;
              }
              currentSpeakingAudio = null;
              URL.revokeObjectURL(audioUrl);
              if (onEnd) onEnd();
            };

            audio.onended = cleanup;
            audio.onerror = (e) => {
              cleanup();
              if (onError) onError(e);
            };

            await audio.play();
            return;
          }
        } catch (e) {
          console.warn("Gemini TTS phát nhanh lỗi, chuyển sang Web Speech API:", e);
        }
      }

      // 2. Dự phòng: Web Speech API của trình duyệt
      if (!('speechSynthesis' in window)) {
        if (btn) {
          btn.innerHTML = btn.getAttribute('data-original-html') || "🔊 Nghe";
          btn.classList.remove('speaking-active');
          currentSpeakingBtn = null;
        }
        if (onError) onError(new Error("No Web Speech"));
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
      utter.rate = 1.05;

      if (btn) btn.innerHTML = "⏹️ Dừng";

      const handleWebSpeechEnd = () => {
        if (btn) {
          btn.innerHTML = btn.getAttribute('data-original-html') || "🔊 Nghe";
          btn.classList.remove('speaking-active');
          currentSpeakingBtn = null;
        }
        if (onEnd) onEnd();
      };

      utter.onend = handleWebSpeechEnd;
      utter.onerror = (e) => {
        handleWebSpeechEnd();
        if (onError) onError(e);
      };

      window.speechSynthesis.speak(utter);
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
      const am = DOM.model.value || 'gemini-3.6-flash';
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
        if (isHandsFreeActive && finalResp && !wasAborted) {
          isHandsFreeSpeaking = true;
          const statusText = $('hf-status-text');
          if (statusText) statusText.innerText = "Jarvis đang trả lời...";

          playTextAudio(finalResp, {
            onEnd: () => {
              isHandsFreeSpeaking = false;
              if (isHandsFreeActive) {
                const status = $('hf-status-text');
                if (status) status.innerText = "Đang lắng nghe...";
                const prev = $('hf-transcript-preview');
                if (prev) prev.innerText = "";
                setTimeout(() => {
                  if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                    try { handsFreeRecognition?.start(); } catch (e) {}
                  }
                }, 200);
              }
            },
            onError: () => {
              isHandsFreeSpeaking = false;
              if (isHandsFreeActive) {
                const status = $('hf-status-text');
                if (status) status.innerText = "Đang lắng nghe...";
                setTimeout(() => {
                  if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                    try { handsFreeRecognition?.start(); } catch (e) {}
                  }
                }, 200);
              }
            }
          });
        }
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
        const targetModel = FLASH_LITE_MODEL; // Tiết kiệm quota 20 RPD của 3.6 Flash, dùng Flash-Lite (500 RPD)
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


    // --- KEY QUOTA MODAL & EVENT HANDLERS ---
    const quotaBtn = $('btn-key-quota-header');
    if (quotaBtn) {
      quotaBtn.onclick = (e) => {
        e.stopPropagation();
        openKeyQuotaModal();
      };
    }
    $('btn-close-quota-modal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeKeyQuotaModal();
    });
    $('btn-close-quota-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeKeyQuotaModal();
    });

    const toggleSkipExhausted = $('toggle-skip-exhausted-keys');
    if (toggleSkipExhausted) {
      toggleSkipExhausted.checked = ls.getItem('jarvis_skip_exhausted_keys') !== 'false';
      toggleSkipExhausted.onchange = () => {
        ls.setItem('jarvis_skip_exhausted_keys', toggleSkipExhausted.checked ? 'true' : 'false');
        showToast(toggleSkipExhausted.checked ? "Đã bật tự động né key đạt 20/20 RPD!" : "Đã tắt tự động né key", "info");
      };
    }

    $('btn-reset-quota-manual')?.addEventListener('click', () => {
      if (confirm("Bạn có chắc chắn muốn reset bộ đếm hôm nay của tất cả các key về 0/20 không?")) {
        resetKeyUsageToday();
        updateKeyQuotaUI();
        showToast("🔄 Đã reset bộ đếm hôm nay về 0/20!", "success");
      }
    });

    $('btn-open-settings-keys')?.addEventListener('click', () => {
      closeKeyQuotaModal();
      $('btn-open-settings')?.click();
      setTimeout(() => {
        $('api-keys-container')?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    });

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
