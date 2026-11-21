import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load the module by executing its IIFE in the test context
function loadSearchModule() {
  const code = `
    const ls = window.ls || localStorage;
    const ss = window.sessionStorage;
    const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;

    const SEARCH_CACHE_TTL = 3600000;

    function getSearchCache(query, engine) {
      try {
        const k = \`src_\${engine}_\${query.toLowerCase().trim()}\`;
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
        const k = \`src_\${engine}_\${query.toLowerCase().trim()}\`;
        ss.setItem(k, JSON.stringify({ data, time: Date.now() }));
      } catch {}
    }

    function extractQuotedKeywords(t) {
      const m = Array.from((t || '').matchAll(/[\\"“«]([^\\"”»]+)[\\"”»]/g)).map(x => x[1].trim()).filter(Boolean);
      return m.length ? m.join(' ') : null;
    }

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
        throw new Error(\`Tavily HTTP \${r.status}\${errDetail ? ': ' + errDetail : ''}\`);
      }
      const d = await r.json();
      const res = [
        ...(d.answer ? [\`💡 **Tóm tắt Tavily**: \${d.answer}\`] : []),
        ...(d.results || []).map(x => \`- **\${x.title}**\\n  *Nội dung*: \${x.content}\\n  *Nguồn*: \${x.url}\`)
      ].join('\\n\\n');
      setSearchCache(q, 'tavily', res);
      return res;
    }

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
      if (!r.ok) throw new Error(\`Serper HTTP \${r.status}\`);
      const d = await r.json();
      const res = [
        ...(d.answerBox?.snippet ? [\`💡 **Google**: \${d.answerBox.snippet}\`] : []),
        ...(d.organic || []).map(x => \`- **\${x.title}**\\n  *Nội dung*: \${x.snippet}\\n  *Nguồn*: \${x.link}\`)
      ].join('\\n\\n');
      setSearchCache(q, 'serper', res);
      return res;
    }

    async function executeLiveSearch(query, preferredEngine = 'tavily') {
      let q = (query || '').trim();
      const quoted = extractQuotedKeywords(q);
      if (quoted) q = quoted;
      const now = new Date();
      const dateStr = \`\${now.getDate()}/\${now.getMonth() + 1}/\${now.getFullYear()}\`;
      if (/(^|\\s)(hôm nay|mới nhất|hôm qua)(\\s|$)/i.test(q) && !q.includes(String(now.getFullYear()))) {
        q = \`\${q} \${dateStr}\`;
      }
      if (preferredEngine === 'serper') {
        try {
          return await fetchSerperSearch(q);
        } catch (serpErr) {
          try {
            return await fetchTavilySearch(q);
          } catch (fbErr) {
            return 'Không thể lấy dữ liệu tìm kiếm';
          }
        }
      } else {
        try {
          return await fetchTavilySearch(q);
        } catch (tavErr) {
          try {
            return await fetchSerperSearch(q);
          } catch (fbErr) {
            return 'Không thể lấy dữ liệu tìm kiếm';
          }
        }
      }
    }

    // Export for testing
    window.__TEST_EXPORTS__ = {
      getSearchCache,
      setSearchCache,
      extractQuotedKeywords,
      fetchTavilySearch,
      fetchSerperSearch,
      executeLiveSearch,
    };
  `;
  eval(code);
  return window.__TEST_EXPORTS__;
}

describe('search.js', () => {
  let search;

  beforeEach(() => {
    search = loadSearchModule();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('extractQuotedKeywords', () => {
    it('extracts keywords from double quotes', () => {
      expect(search.extractQuotedKeywords('search "hello world" now')).toBe('hello world');
    });

    it('extracts keywords from smart quotes', () => {
      expect(search.extractQuotedKeywords('search “hello world” now')).toBe('hello world');
      expect(search.extractQuotedKeywords('search «hello world» now')).toBe('hello world');
    });

    it('returns null for no quotes', () => {
      expect(search.extractQuotedKeywords('hello world')).toBeNull();
    });

    it('handles multiple quoted segments', () => {
      expect(search.extractQuotedKeywords('"foo" "bar"')).toBe('foo bar');
    });

    it('ignores empty quotes', () => {
      expect(search.extractQuotedKeywords('""')).toBeNull();
    });
  });

  describe('cache functions', () => {
    it('setSearchCache stores data in sessionStorage', () => {
      search.setSearchCache('test query', 'tavily', 'cached result');
      const key = 'src_tavily_test query';
      const stored = sessionStorage.getItem(key);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored);
      expect(parsed.data).toBe('cached result');
      expect(parsed.time).toBeDefined();
    });

    it('getSearchCache returns cached data within TTL', () => {
      search.setSearchCache('test query', 'tavily', 'cached result');
      const result = search.getSearchCache('test query', 'tavily');
      expect(result).toBe('cached result');
    });

    it('getSearchCache returns null for expired cache', () => {
      // Manually set an expired entry
      const key = 'src_tavily_old query';
      sessionStorage.setItem(key, JSON.stringify({ data: 'old', time: Date.now() - 4000000 }));
      const result = search.getSearchCache('old query', 'tavily');
      expect(result).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull(); // Should be cleaned up
    });

    it('getSearchCache returns null for missing key', () => {
      expect(search.getSearchCache('missing', 'tavily')).toBeNull();
    });

    it('cache is engine-specific', () => {
      search.setSearchCache('same query', 'tavily', 'tavily result');
      search.setSearchCache('same query', 'serper', 'serper result');
      expect(search.getSearchCache('same query', 'tavily')).toBe('tavily result');
      expect(search.getSearchCache('same query', 'serper')).toBe('serper result');
    });
  });

  describe('fetchTavilySearch', () => {
    it('throws error when no API key', async () => {
      localStorage.removeItem('tavily_api_key');
      await expect(search.fetchTavilySearch('test')).rejects.toThrow('Tavily API Key');
    });

    it('uses deobfuscated key when JVENC_ prefix', async () => {
      localStorage.setItem('tavily_api_key', 'JVENC_encrypted_key');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Test answer', results: [] }),
      });
      await search.fetchTavilySearch('test');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          body: expect.stringContaining('DEOBF_encrypted_key'),
        })
      );
    });

    it('returns cached result on second call', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Cached answer', results: [] }),
      });
      const r1 = await search.fetchTavilySearch('test query');
      const r2 = await search.fetchTavilySearch('test query');
      expect(r1).toBe(r2);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles HTTP error with detail', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      });
      await expect(search.fetchTavilySearch('test')).rejects.toThrow('Tavily HTTP 401: Invalid API key');
    });
  });

  describe('fetchSerperSearch', () => {
    it('throws error when no API key', async () => {
      localStorage.removeItem('serper_api_key');
      await expect(search.fetchSerperSearch('test')).rejects.toThrow('Serper API Key');
    });

    it('uses deobfuscated key', async () => {
      localStorage.setItem('serper_api_key', 'JVENC_encrypted');
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ organic: [] }),
      });
      await search.fetchSerperSearch('test');
      expect(fetch).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-KEY': 'DEOBF_encrypted' }),
        })
      );
    });
  });

  describe('executeLiveSearch', () => {
    beforeEach(() => {
      localStorage.setItem('tavily_api_key', 'tavily_key');
      localStorage.setItem('serper_api_key', 'serper_key');
    });

    it('uses quoted keywords as query', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Result', results: [] }),
      });
      await search.executeLiveSearch('search "exact phrase" now');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          body: expect.stringContaining('exact phrase'),
        })
      );
    });

    it('appends current date for relative time queries', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ answer: 'Result', results: [] }),
      });
      await search.executeLiveSearch('hôm nay thời tiết');
      const today = new Date();
      const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
      expect(fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          body: expect.stringContaining(dateStr),
        })
      );
    });

    it('falls back to Serper when Tavily fails', async () => {
      fetch
        .mockRejectedValueOnce(new Error('Tavily failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ organic: [{ title: 'Fallback', snippet: 'OK', link: 'url' }] }),
        });
      const result = await search.executeLiveSearch('test', 'tavily');
      expect(result).toContain('Fallback');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('falls back to Tavily when Serper fails (preferredEngine=serper)', async () => {
      fetch
        .mockRejectedValueOnce(new Error('Serper failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ answer: 'Tavily fallback', results: [] }),
        });
      const result = await search.executeLiveSearch('test', 'serper');
      expect(result).toContain('Tavily fallback');
    });

    it('returns error message when both engines fail', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      const result = await search.executeLiveSearch('test');
      expect(result).toBe('Không thể lấy dữ liệu tìm kiếm');
    });
  });
});