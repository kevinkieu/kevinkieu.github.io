import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load extract module
function loadExtractModule() {
  // First load search module dependencies
  const searchCode = `
    const ls = window.ls || localStorage;
    const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;

    async function fetchTavilySearch(q) {
      let k = (ls.getItem('tavily_api_key') || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (!k) throw new Error("Chưa nhập Tavily API Key trong cài đặt!");
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: k, query: q, max_results: 5, include_answer: true })
      });
      if (!r.ok) throw new Error(\`Tavily HTTP \${r.status}\`);
      const d = await r.json();
      return [
        ...(d.answer ? [\`💡 **Tóm tắt Tavily**: \${d.answer}\`] : []),
        ...(d.results || []).map(x => \`- **\${x.title}**\\n  *Nội dung*: \${x.content}\\n  *Nguồn*: \${x.url}\`)
      ].join('\\n\\n');
    }

    async function fetchSerperSearch(q) {
      let k = (ls.getItem('serper_api_key') || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (!k) throw new Error("Chưa có Serper API Key trong Cài đặt!");
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": k, "Content-Type": "application/json" },
        body: JSON.stringify({ q, gl: "vn", hl: "vi", num: 5 })
      });
      if (!r.ok) throw new Error(\`Serper HTTP \${r.status}\`);
      const d = await r.json();
      return [
        ...(d.answerBox?.snippet ? [\`💡 **Google**: \${d.answerBox.snippet}\`] : []),
        ...(d.organic || []).map(x => \`- **\${x.title}**\\n  *Nội dung*: \${x.snippet}\\n  *Nguồn*: \${x.link}\`)
      ].join('\\n\\n');
    }

    window.fetchTavilySearch = fetchTavilySearch;
    window.fetchSerperSearch = fetchSerperSearch;
  `;
  eval(searchCode);

  // Now load extract module
  const extractCode = `
    const ls = window.ls || localStorage;
    const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;

    async function extractYouTubeContent(url) {
      if (!url) throw new Error("Link YouTube không hợp lệ");
      const vidMatch = url.match(/(?:youtu\\.be\\/|youtube\\.com\\/(?:embed\\/|v\\/|watch\\?v=|watch\\?.+&v=|shorts\\/))([a-zA-Z0-9_-]{11})/i);
      const videoId = vidMatch ? vidMatch[1] : null;

      let title = '';
      let author = '';
      let thumbnail = videoId ? \`https://i.ytimg.com/vi/\${videoId}/hqdefault.jpg\` : '';

      try {
        const canonical = videoId ? \`https://www.youtube.com/watch?v=\${videoId}\` : url;
        const res = await fetch(\`https://noembed.com/embed?url=\${encodeURIComponent(canonical)}\`, { signal: AbortSignal.timeout(6000) });
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

      if (!title && videoId) {
        try {
          const ytOembed = \`https://www.youtube.com/oembed?url=\${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json\`;
          const res = await fetch(\`https://api.allorigins.win/get?url=\${encodeURIComponent(ytOembed)}\`, { signal: AbortSignal.timeout(5000) });
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

      let extraSearch = '';
      if (title) {
        const searchQ = \`"\${title}" \${author ? author : ''} tóm tắt nội dung\`.trim();
        if (ls.getItem('tavily_api_key')) {
          try {
            extraSearch = await window.fetchTavilySearch(searchQ);
          } catch (e) {
            console.warn("Tavily assist cho YouTube lỗi:", e);
          }
        } else if (ls.getItem('serper_api_key')) {
          try {
            extraSearch = await window.fetchSerperSearch(searchQ);
          } catch (e) {
            console.warn("Serper assist cho YouTube lỗi:", e);
          }
        }
      }

      const formattedContent = [
        \`🎬 Tiêu đề video: \${title || (videoId ? 'Video YouTube ID ' + videoId : 'Video YouTube')}\`,
        \`👤 Kênh phát hành: \${author || 'Không rõ'}\`,
        \`🔗 Link gốc: \${url}\`,
        ...(thumbnail ? [\`🖼️ Thumbnail: \${thumbnail}\`] : []),
        ...(extraSearch ? [\`\\n📰 Dữ liệu & Ngữ cảnh phân tích từ Web:\\n\${extraSearch}\`] : [])
      ].join('\\n');

      return {
        source: "YouTube Video Intel",
        title: title || (videoId ? \`Video YouTube (\${videoId})\` : 'Video YouTube'),
        author: author || 'Kênh YouTube',
        videoId: videoId,
        thumbnail: thumbnail,
        extraSearch: extraSearch,
        content: formattedContent
      };
    }

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
        const r = await fetch(\`https://r.jina.ai/\${url}\`, {
          headers: { Accept: "text/plain", ...(jk ? { Authorization: \`Bearer \${jk}\` } : {}) }
        });
        if (!r.ok) throw 0;
        const t = await r.text();
        if (isBlocked(t)) throw 0;
        return { source: "Jina Reader", content: t.substring(0, 45000) };
      };

      const proxy = async () => {
        const d = await (await fetch(\`https://api.allorigins.win/get?url=\${encodeURIComponent(url)}\`)).json();
        const t = new DOMParser().parseFromString(d.contents, "text/html").body.innerText.replace(/\\s+/g, ' ').trim();
        if (isBlocked(t)) throw 0;
        return { source: "Web Proxy", content: t.substring(0, 30000) };
      };

      const assist = async () => {
        let q = url;
        try {
          const p = new URL(url);
          q = \`\${p.pathname.split('/').filter(Boolean).pop()?.replace(/[-_.]/g, ' ') || ''} \${p.hostname.replace('www.', '')} mới nhất\`.trim();
        } catch {}
        if (tk) { const r = await window.fetchTavilySearch(q); if (r) return { source: "Tavily Search Assist", content: r }; }
        throw new Error("Không thể bóc tách dữ liệu.");
      };

      const chain = [tavily, jina, proxy, assist];
      for (const fn of chain) { try { return await fn(); } catch {} }
      throw new Error("Không thể bóc tách dữ liệu.");
    }

    window.__TEST_EXPORTS__ = {
      extractYouTubeContent,
      extractWebPageContent,
    };
  `;
  eval(extractCode);
  return window.__TEST_EXPORTS__;
}

describe('extract.js', () => {
  let extract;

  beforeEach(() => {
    extract = loadExtractModule();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    
    // Default: all fetch calls reject (simulate network failure)
    fetch.mockRejectedValue(new Error('Network error'));
  });

  describe('extractYouTubeContent', () => {
    it('throws on empty URL', async () => {
      await expect(extract.extractYouTubeContent('')).rejects.toThrow('Link YouTube không hợp lệ');
    });

    it('extracts video ID from various YouTube URL formats', async () => {
      const result = await extract.extractYouTubeContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
      expect(result.thumbnail).toContain('dQw4w9WgXcQ');
      expect(result.content).toContain('Video YouTube ID dQw4w9WgXcQ');
    });

    it('extracts video ID from youtu.be', async () => {
      const result = await extract.extractYouTubeContent('https://youtu.be/dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID from embed URL', async () => {
      const result = await extract.extractYouTubeContent('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID from shorts URL', async () => {
      const result = await extract.extractYouTubeContent('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('uses noembed metadata when available', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: 'Test Video', author_name: 'Test Channel', thumbnail_url: 'https://thumb.jpg' }),
        })
        .mockRejectedValue(new Error('No Tavily key'));
      
      const result = await extract.extractYouTubeContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.title).toBe('Test Video');
      expect(result.author).toBe('Test Channel');
      expect(result.thumbnail).toBe('https://thumb.jpg');
    });

    it('falls back to oEmbed when noembed fails', async () => {
      fetch
        .mockRejectedValueOnce(new Error('noembed failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ contents: JSON.stringify({ title: 'oEmbed Video', author_name: 'oEmbed Channel', thumbnail_url: 'https://thumb2.jpg' }) }),
        })
        .mockRejectedValue(new Error('No Tavily key'));
      
      const result = await extract.extractYouTubeContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.title).toBe('oEmbed Video');
      expect(result.author).toBe('oEmbed Channel');
    });

    it('includes search assist when Tavily API key present', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: 'Video Title', author_name: 'Author' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ answer: 'Search summary', results: [] }),
        });
      
      const result = await extract.extractYouTubeContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.extraSearch).toContain('Search summary');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('includes search assist when Serper API key present (no Tavily)', async () => {
      localStorage.setItem('serper_api_key', 'serper_key');
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: 'Video Title', author_name: 'Author' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organic: [{ title: 'Serper Result', snippet: 'Summary', link: 'url' }] }),
        });
      
      const result = await extract.extractYouTubeContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.extraSearch).toContain('Serper Result');
    });
  });

  describe('extractWebPageContent', () => {
    // Helper to set up fetch mock sequence for this test
    const setupFetch = (...responses) => {
      let callIndex = 0;
      fetch.mockImplementation((...args) => {
        const response = responses[callIndex] ?? responses[responses.length - 1];
        callIndex++;
        return Promise.resolve(response);
      });
    };

    it('delegates to extractYouTubeContent for YouTube URLs', async () => {
      const result = await extract.extractWebPageContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.source).toBe('YouTube Video Intel');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('delegates for youtu.be URLs', async () => {
      const result = await extract.extractWebPageContent('https://youtu.be/dQw4w9WgXcQ');
      expect(result.source).toBe('YouTube Video Intel');
    });

    it('tries Tavily Extract first when API key present', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch(
        { ok: true, json: async () => ({ results: [{ raw_content: 'Extracted content from Tavily. '.repeat(100) }] }) }
      );
      
      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Tavily Extract');
      expect(result.content).toContain('Extracted content from Tavily');
      expect(fetch).toHaveBeenCalledWith('https://api.tavily.com/extract', expect.any(Object));
    });

    it('falls back to Jina Reader when Tavily fails or blocked', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch(
        { ok: true, json: async () => ({ results: [{ raw_content: 'blocked content' }] }) }, // Too short = blocked
        { ok: true, text: async () => 'Full article content from Jina. '.repeat(100) }
      );
      
      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Jina Reader');
    });

    it('uses Jina API key when available', async () => {
      localStorage.setItem('jina_api_key', 'JVENC_jina_key');
      localStorage.removeItem('tavily_api_key');
      setupFetch(
        { ok: true, text: async () => 'Content from Jina Reader. '.repeat(3) }
      );
      
      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Jina Reader');
      expect(fetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://example.com/article',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer DEOBF_jina_key' }),
        })
      );
    });

    it('falls back to proxy when Tavily and Jina fail', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch(
        { ok: false }, // Tavily extract fails (non-ok)
        { ok: false }, // Jina fails (non-ok)
        { ok: true, json: async () => ({ contents: '<html><body>Proxy content from example. Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor.</body></html>' }) }
      );
      
      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Web Proxy');
      expect(result.content).toContain('Proxy content');
    });

    it('falls back to Tavily Search Assist as last resort', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch(
        { ok: false }, // Tavily extract fails
        { ok: false }, // Jina fails
        { ok: false }, // Proxy fails
        { ok: true, json: async () => ({ answer: 'Search assist result', results: [] }) }
      );
      
      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Tavily Search Assist');
      expect(result.content).toContain('Search assist result');
    });

    it('throws when all extraction methods fail', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      // fetch already mocked to reject in beforeEach
      
      await expect(extract.extractWebPageContent('https://example.com/article'))
        .rejects.toThrow('Không thể bóc tách dữ liệu');
    });

    it('detects blocked content (Cloudflare, etc.) and falls back', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch(
        { ok: true, json: async () => ({ results: [{ raw_content: 'Just a moment... Cloudflare verification' }] }) },
        { ok: true, text: async () => 'Good content from Jina after the block was bypassed. '.repeat(3) }
      );
      
      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Jina Reader');
      expect(result.content).toContain('Good content from Jina');
    });
  });
});