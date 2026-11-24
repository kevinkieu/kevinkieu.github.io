/* ==========================================================================
   Jarvis AI - Content Extraction (js/extract.js)
   Trích xuất nội dung Video YouTube & Trang web (Tavily/Jina/Proxy/Assist).
   Yêu cầu js/search.js đã nạp trước (dùng fetchTavilySearch/fetchSerperSearch).
   Xuất qua window để js/app.js dùng alias.
   ========================================================================== */
(function () {
  'use strict';

  const ls = window.ls || localStorage;
  const deobfuscateKey = k =>
    typeof window.deobfuscateKey === 'function' ? window.deobfuscateKey(k) : k;

  // --- TRÍCH XUẤT THÔNG TIN VIDEO YOUTUBE SIÊU TỐC ---
  async function extractYouTubeContent(url) {
    if (!url) throw new Error('Link YouTube không hợp lệ');
    const vidMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i
    );
    const videoId = vidMatch ? vidMatch[1] : null;

    let title = '';
    let author = '';
    let thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

    // 1. Lấy metadata qua noembed (hỗ trợ CORS mọi trình duyệt, phản hồi < 200ms)
    try {
      const canonical = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(canonical)}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const d = await res.json();
        if (d && d.title) {
          title = d.title.trim();
          author = (d.author_name || '').trim();
          if (d.thumbnail_url) thumbnail = d.thumbnail_url;
        }
      }
    } catch (e) {
      console.warn('Lỗi noembed YouTube:', e);
    }

    // 2. Dự phòng qua oEmbed nếu noembed chưa trả về tiêu đề
    if (!title && videoId) {
      try {
        const ytOembed = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`;
        const res = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(ytOembed)}`,
          { signal: AbortSignal.timeout(5000) }
        );
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
          extraSearch = await window.fetchTavilySearch(searchQ);
        } catch (e) {
          console.warn('Tavily assist cho YouTube lỗi:', e);
        }
      } else if (ls.getItem('serper_api_key')) {
        try {
          extraSearch = await window.fetchSerperSearch(searchQ);
        } catch (e) {
          console.warn('Serper assist cho YouTube lỗi:', e);
        }
      }
    }

    const formattedContent = [
      `🎬 Tiêu đề video: ${title || (videoId ? 'Video YouTube ID ' + videoId : 'Video YouTube')}`,
      `👤 Kênh phát hành: ${author || 'Không rõ'}`,
      `🔗 Link gốc: ${url}`,
      ...(thumbnail ? [`🖼️ Thumbnail: ${thumbnail}`] : []),
      ...(extraSearch ? [`\n📰 Dữ liệu & Ngữ cảnh phân tích từ Web:\n${extraSearch}`] : []),
    ].join('\n');

    return {
      source: 'YouTube Video Intel',
      title: title || (videoId ? `Video YouTube (${videoId})` : 'Video YouTube'),
      author: author || 'Kênh YouTube',
      videoId: videoId,
      thumbnail: thumbnail,
      extraSearch: extraSearch,
      content: formattedContent,
    };
  }

  // --- TRÍCH XUẤT NỘI DUNG TRANG WEB (TAVILY / JINA / PROXY) ---
  async function extractWebPageContent(url) {
    if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
      return await extractYouTubeContent(url);
    }
    const mode = ls.getItem('web_extract_engine') || 'auto';
    let jk = (ls.getItem('jina_api_key') || '').trim(),
      tk = (ls.getItem('tavily_api_key') || '').trim();
    if (jk.startsWith('JVENC_') || jk.startsWith('ENC_')) jk = deobfuscateKey(jk);
    if (tk.startsWith('JVENC_') || tk.startsWith('ENC_')) tk = deobfuscateKey(tk);
    const isBlocked = t =>
      !t ||
      t.trim().length < 60 ||
      /(just a moment|security verification|verify you are human|cloudflare|ddos protection|challenge-platform|enable javascript|access denied|403 forbidden)/i.test(
        t
      );

    const tavily = async () => {
      if (!tk) throw 0;
      const r = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tk, urls: [url] }),
      });
      const t = (await r.json()).results?.[0]?.raw_content;
      if (isBlocked(t)) throw 0;
      return { source: 'Tavily Extract', content: t.substring(0, 45000) };
    };

    const jina = async () => {
      const r = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: 'text/plain', ...(jk ? { Authorization: `Bearer ${jk}` } : {}) },
      });
      if (!r.ok) throw 0;
      const t = await r.text();
      if (isBlocked(t)) throw 0;
      return { source: 'Jina Reader', content: t.substring(0, 45000) };
    };

    const proxy = async () => {
      const d = await (
        await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
      ).json();
      const t = new DOMParser()
        .parseFromString(d.contents, 'text/html')
        .body.innerText.replace(/\s+/g, ' ')
        .trim();
      if (isBlocked(t)) throw 0;
      return { source: 'Web Proxy', content: t.substring(0, 30000) };
    };

    const assist = async () => {
      let q = url;
      try {
        const p = new URL(url);
        q =
          `${p.pathname.split('/').filter(Boolean).pop()?.replace(/[-_.]/g, ' ') || ''} ${p.hostname.replace('www.', '')} mới nhất`.trim();
      } catch {}
      if (tk) {
        const r = await window.fetchTavilySearch(q);
        if (r) return { source: 'Tavily Search Assist', content: r };
      }
      throw new Error('Không thể bóc tách dữ liệu.');
    };

    const chain = [tavily, jina, proxy, assist];
    for (const fn of chain) {
      try {
        return await fn();
      } catch {}
    }
    throw new Error('Không thể bóc tách dữ liệu.');
  }

  // Window exports
  window.extractYouTubeContent = extractYouTubeContent;
  window.extractWebPageContent = extractWebPageContent;
})();
