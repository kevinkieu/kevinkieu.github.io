/* ==========================================================================
   Jarvis AI - Web Search Engine (js/search.js)
   Cache tìm kiếm (sessionStorage, 1h TTL), Tavily, Serper, điều phối live search.
   Nạp trước js/extract.js và js/app.js trong index.html. Xuất qua window.
   ========================================================================== */
(function () {
  'use strict';

  const ls = window.ls || localStorage;
  const ss = window.sessionStorage;
  const deobfuscateKey = k =>
    typeof window.deobfuscateKey === 'function' ? window.deobfuscateKey(k) : k;

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

  function extractQuotedKeywords(t) {
    const m = Array.from((t || '').matchAll(/[\"“«]([^\"”»]+)[\"”»]/g))
      .map(x => x[1].trim())
      .filter(Boolean);
    return m.length ? m.join(' ') : null;
  }

  // --- TÌM KIẾM WEB (TAVILY) ---
  async function fetchTavilySearch(q) {
    const cached = getSearchCache(q, 'tavily');
    if (cached) return cached;
    let k = (ls.getItem('tavily_api_key') || '').trim();
    if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
    if (!k) throw new Error('Chưa nhập Tavily API Key trong cài đặt!');
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: k, query: q, max_results: 5, include_answer: true }),
    });
    if (!r.ok) {
      let errDetail = '';
      try {
        const errJson = await r.json();
        errDetail = errJson.message || errJson.error || '';
      } catch {}
      throw new Error(`Tavily HTTP ${r.status}${errDetail ? ': ' + errDetail : ''}`);
    }
    const d = await r.json();
    const res = [
      ...(d.answer ? [`💡 **Tóm tắt Tavily**: ${d.answer}`] : []),
      ...(d.results || []).map(
        x => `- **${x.title}**\n  *Nội dung*: ${x.content}\n  *Nguồn*: ${x.url}`
      ),
    ].join('\n\n');
    setSearchCache(q, 'tavily', res);
    return res;
  }

  // --- TÌM KIẾM WEB (SERPER GOOGLE) ---
  async function fetchSerperSearch(q) {
    const cached = getSearchCache(q, 'serper');
    if (cached) return cached;
    let k = (ls.getItem('serper_api_key') || '').trim();
    if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
    if (!k) throw new Error('Chưa có Serper API Key trong Cài đặt!');
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 5 }),
    });
    if (!r.ok) throw new Error(`Serper HTTP ${r.status}`);
    const d = await r.json();
    const res = [
      ...(d.answerBox?.snippet ? [`💡 **Google**: ${d.answerBox.snippet}`] : []),
      ...(d.organic || []).map(
        x => `- **${x.title}**\n  *Nội dung*: ${x.snippet}\n  *Nguồn*: ${x.link}`
      ),
    ].join('\n\n');
    setSearchCache(q, 'serper', res);
    return res;
  }

  // --- ĐIỀU PHỐI TÌM KIẾM TRỰC TIẾP (LIVE SEARCH) ---
  async function executeLiveSearch(query, preferredEngine = 'tavily') {
    let q = (query || '').trim();
    const quoted = extractQuotedKeywords(q);
    if (quoted) q = quoted;
    const now = new Date();
    const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    if (
      /(^|\s)(hôm nay|mới nhất|hôm qua)(\s|$)/i.test(q) &&
      !q.includes(String(now.getFullYear()))
    ) {
      q = `${q} ${dateStr}`;
    }
    if (preferredEngine === 'serper') {
      try {
        return await fetchSerperSearch(q);
      } catch (serpErr) {
        try {
          return await fetchTavilySearch(q);
        } catch (fbErr) {
          return `Không thể lấy dữ liệu tìm kiếm`;
        }
      }
    } else {
      try {
        return await fetchTavilySearch(q);
      } catch (tavErr) {
        try {
          return await fetchSerperSearch(q);
        } catch (fbErr) {
          return `Không thể lấy dữ liệu tìm kiếm`;
        }
      }
    }
  }

  // --- TRÍCH XUẤT TỪ KHÓA TÌM KIẾM BẰNG GEMINI 3.5 FLASH LITE ---
  // Dùng khi người dùng gõ chữ "tìm kiếm" trong input (không dùng #kw#).
  // Trả về chuỗi từ khóa hoặc null nếu không trích xuất được.
  async function extractSearchKeywords(text, googleKey) {
    const key = String(googleKey || '').trim();
    const fallbackKey =
      key ||
      (Array.isArray(window.apiKeys) && window.apiKeys.length
        ? String(window.apiKeys[0] || '').trim()
        : '');
    // Giải mã nếu bị obfuscate
    let finalKey = fallbackKey;
    if (finalKey.startsWith('JVENC_') || finalKey.startsWith('ENC_')) {
      finalKey =
        typeof window.deobfuscateKey === 'function' ? window.deobfuscateKey(finalKey) : finalKey;
    }
    if (!finalKey) {
      if (typeof window.showToast === 'function')
        window.showToast('Cần Google API Key để trích xuất từ khóa tìm kiếm.', 'warning');
      return null;
    }
    const GoogleGenAI = window.GoogleGenAI;
    if (!GoogleGenAI) {
      if (typeof window.showToast === 'function')
        window.showToast('Chưa nạp thư viện GoogleGenAI.', 'warning');
      return null;
    }
    const hint =
      (window.filesData && window.filesData.length
        ? ` (người dùng có đính kèm ${window.filesData.length} tệp)`
        : '') || '';
    const prompt = `Bạn là bộ trích xuất từ khóa tìm kiếm web. Từ yêu cầu của người dùng, trả về MỘT cụm từ khóa ngắn (tối đa 8 từ) để tìm kiếm web. Chỉ trả về từ khóa, không giải thích, không dấu ngoặc, không xuống dòng.\n\nYêu cầu${hint}: ${String(text || '').trim()}`;
    const tryCall = async cfg => {
      const ai = new GoogleGenAI({ apiKey: finalKey });
      const res = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: prompt,
        config: cfg,
      });
      return (res && res.text ? res.text : '').trim();
    };
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    try {
      let txt = '';
      try {
        txt = await withTimeout(
          tryCall({
            temperature: 0.1,
            thinkingConfig: { thinkingLevel: 'minimal' },
            safetySettings: window.SAFETY || [],
          }),
          8000
        );
      } catch (e1) {
        // Fallback: bỏ thinkingConfig nếu model/API không hỗ trợ
        txt = await withTimeout(
          tryCall({
            temperature: 0.1,
            safetySettings: window.SAFETY || [],
          }),
          8000
        );
      }
      const kw = String(txt || '')
        .trim()
        .replace(/^["'`“”«»]+|["'`“”«»]+$/g, '')
        .replace(/\s+/g, ' ');
      return kw || null;
    } catch (e) {
      console.warn('extractSearchKeywords failed:', e);
      if (typeof window.showToast === 'function')
        window.showToast(
          '⚠️ Không trích xuất được từ khóa — dùng nguyên văn câu hỏi để tìm.',
          'warning'
        );
      const fallback = String(text || '')
        .trim()
        .slice(0, 80);
      return fallback || null;
    }
  }

  // Window exports
  window.getSearchCache = getSearchCache;
  window.setSearchCache = setSearchCache;
  window.fetchTavilySearch = fetchTavilySearch;
  window.fetchSerperSearch = fetchSerperSearch;
  window.executeLiveSearch = executeLiveSearch;
  window.extractQuotedKeywords = extractQuotedKeywords;
  window.extractSearchKeywords = extractSearchKeywords;
})();
