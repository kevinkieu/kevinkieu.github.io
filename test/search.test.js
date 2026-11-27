import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load the module by executing its IIFE in the test context
function loadSearchModule() {
  // Nạp CHÍNH mã production; chỉ mock môi trường (fetch, storage, DOM).
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/search.js'), 'utf8');
  new Function(code)();
  return {
    getSearchCache: window.getSearchCache,
    setSearchCache: window.setSearchCache,
    extractQuotedKeywords: window.extractQuotedKeywords,
    fetchTavilySearch: window.fetchTavilySearch,
    fetchSerperSearch: window.fetchSerperSearch,
    executeLiveSearch: window.executeLiveSearch,
  };
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
      await expect(search.fetchTavilySearch('test')).rejects.toThrow(
        'Tavily HTTP 401: Invalid API key'
      );
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
      fetch.mockRejectedValueOnce(new Error('Tavily failed')).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organic: [{ title: 'Fallback', snippet: 'OK', link: 'url' }] }),
      });
      const result = await search.executeLiveSearch('test', 'tavily');
      expect(result).toContain('Fallback');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('falls back to Tavily when Serper fails (preferredEngine=serper)', async () => {
      fetch.mockRejectedValueOnce(new Error('Serper failed')).mockResolvedValueOnce({
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
