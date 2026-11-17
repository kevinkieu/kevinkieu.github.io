/* ==========================================================================
   Jarvis AI - Web Search & Media Extraction Tools (js/tools.js)
   Tích hợp tìm kiếm web thời gian thực (Tavily, Serper Google),
   Trích xuất nội dung trang web & thông tin video YouTube siêu tốc.
   ========================================================================== */

(function() {
  'use strict';

  const ls = window.ls || localStorage;
  const ss = window.sessionStorage;
  const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;

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
    const m = Array.from((t || '').matchAll(/["“«]([^"”»]+)["”»]/g)).map(x => x[1].trim()).filter(Boolean);
    return m.length ? m.join(' ') : null;
  }

  // --- TÌM KIẾM WEB (TAVILY) ---
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

  // --- TÌM KIẾM WEB (SERPER GOOGLE) ---
  async function fetchSerperSearch(q) {
    const cached = getSearchCache(q, 'serper');
    if (cached) return cached;
    let k = (ls.getItem('serper_api_key') || '').trim();
    if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
    if (!k) throw new Error("Chưa có Serper API Key trong Cài đặt!");
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

  // --- ĐIỀU PHỐI TÌM KIẾM TRỰC TIẾP (LIVE SEARCH) ---
  async function executeLiveSearch(query, preferredEngine = 'tavily') {
    let q = (query || '').trim();
    const quoted = extractQuotedKeywords(q);
    if (quoted) q = quoted;
    const now = new Date();
    const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    if (/(^|\s)(hôm nay|mới nhất|hôm qua)(\s|$)/i.test(q) && !q.includes(String(now.getFullYear()))) {
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

  // --- TRÍCH XUẤT THÔNG TIN VIDEO YOUTUBE SIÊU TỐC ---
  async function extractYouTubeContent(url) {
    if (!url) throw new Error("Link YouTube không hợp lệ");
    const vidMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i);
    const videoId = vidMatch ? vidMatch[1] : null;

    let title = '';
    let author = '';
    let thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

    // 1. Lấy metadata qua noembed (hỗ trợ CORS mọi trình duyệt, phản hồi < 200ms)
    try {
      const canonical = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonical)}`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const d = await res.json();
        if (d && d.title) {
          title = d.title.trim();
          author = (d.author_name || '').trim();
          if (d.thumbnail_url) thumbnail = d.thumbnail_url;
        }
      }
    } catch (e) {
      console.warn("Lỗi noembed YouTube:", e);
    }

    // 2. Dự phòng qua oEmbed nếu noembed chưa trả về tiêu đề
    if (!title && videoId) {
      try {
        const ytOembed = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`;
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(ytOembed)}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          const d = JSON.parse(data.contents || '{}');
          if (d.title) {
            title = d.title.trim();
            author = (d.author_name || '').trim();
            if (d.thumbnail_url) thumbnail = d.thumbnail_url;
          }
        }
      } catch (e) {}
    }

    // 3. Tra cứu bối cảnh & tóm tắt liên quan nếu có Tavily hoặc Serper
    let extraSearch = '';
    if (title) {
      const searchQ = `"${title}" ${author ? author : ''} tóm tắt nội dung`.trim();
      if (ls.getItem('tavily_api_key')) {
        try {
          extraSearch = await fetchTavilySearch(searchQ);
        } catch (e) {
          console.warn("Tavily assist cho YouTube lỗi:", e);
        }
      } else if (ls.getItem('serper_api_key')) {
        try {
          extraSearch = await fetchSerperSearch(searchQ);
        } catch (e) {
          console.warn("Serper assist cho YouTube lỗi:", e);
        }
      }
    }

    const formattedContent = [
      `🎬 Tiêu đề video: ${title || (videoId ? 'Video YouTube ID ' + videoId : 'Video YouTube')}`,
      `👤 Kênh phát hành: ${author || 'Không rõ'}`,
      `🔗 Link gốc: ${url}`,
      ...(thumbnail ? [`🖼️ Thumbnail: ${thumbnail}`] : []),
      ...(extraSearch ? [`\n📰 Dữ liệu & Ngữ cảnh phân tích từ Web:\n${extraSearch}`] : [])
    ].join('\n');

    return {
      source: "YouTube Video Intel",
      title: title || (videoId ? `Video YouTube (${videoId})` : 'Video YouTube'),
      author: author || 'Kênh YouTube',
      videoId: videoId,
      thumbnail: thumbnail,
      extraSearch: extraSearch,
      content: formattedContent
    };
  }

  // --- TRÍCH XUẤT NỘI DUNG TRANG WEB (TAVILY / JINA / PROXY) ---
  async function extractWebPageContent(url) {
    if (url && (url.includes("youtube.com") || url.includes("youtu.be"))) {
      return await extractYouTubeContent(url);
    }
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
      throw new Error("Không thể bóc tách dữ liệu.");
    };

    const chain = [tavily, jina, proxy, assist];
    for (const fn of chain) { try { return await fn(); } catch {} }
    throw new Error("Không thể bóc tách dữ liệu.");
  }

  // Window exports
  window.getSearchCache = getSearchCache;
  window.setSearchCache = setSearchCache;
  window.fetchTavilySearch = fetchTavilySearch;
  window.fetchSerperSearch = fetchSerperSearch;
  window.executeLiveSearch = executeLiveSearch;
  window.extractYouTubeContent = extractYouTubeContent;
  window.extractWebPageContent = extractWebPageContent;
  window.extractQuotedKeywords = extractQuotedKeywords;

})();
