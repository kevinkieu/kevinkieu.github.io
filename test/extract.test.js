import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load extract module
function loadExtractModule() {
  // Nạp CHÍNH mã production; chỉ mock môi trường (fetch, storage, DOM).
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/extract.js'), 'utf8');
  // extract.js gọi window.fetchTavilySearch/fetchSerperSearch -> nạp luôn search.js thật.
  const searchCode = fs.readFileSync(path.resolve(process.cwd(), 'js/search.js'), 'utf8');
  new Function(searchCode)();
  new Function(code)();
  return {
    extractYouTubeContent: window.extractYouTubeContent,
    extractWebPageContent: window.extractWebPageContent,
  };
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
      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
      expect(result.videoId).toBe('dQw4w9WgXcQ');
      expect(result.thumbnail).toContain('dQw4w9WgXcQ');
      expect(result.content).toContain('Video YouTube ID dQw4w9WgXcQ');
    });

    it('extracts video ID from youtu.be', async () => {
      const result = await extract.extractYouTubeContent('https://youtu.be/dQw4w9WgXcQ');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID from embed URL', async () => {
      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('extracts video ID from shorts URL', async () => {
      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/shorts/dQw4w9WgXcQ'
      );
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('uses noembed metadata when available', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: 'Test Video',
            author_name: 'Test Channel',
            thumbnail_url: 'https://thumb.jpg',
          }),
        })
        .mockRejectedValue(new Error('No Tavily key'));

      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
      expect(result.title).toBe('Test Video');
      expect(result.author).toBe('Test Channel');
      expect(result.thumbnail).toBe('https://thumb.jpg');
    });

    it('falls back to oEmbed when noembed fails', async () => {
      fetch
        .mockRejectedValueOnce(new Error('noembed failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            contents: JSON.stringify({
              title: 'oEmbed Video',
              author_name: 'oEmbed Channel',
              thumbnail_url: 'https://thumb2.jpg',
            }),
          }),
        })
        .mockRejectedValue(new Error('No Tavily key'));

      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
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

      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
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
          json: async () => ({
            organic: [{ title: 'Serper Result', snippet: 'Summary', link: 'url' }],
          }),
        });

      const result = await extract.extractYouTubeContent(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
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
      const result = await extract.extractWebPageContent(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
      expect(result.source).toBe('YouTube Video Intel');
      expect(result.videoId).toBe('dQw4w9WgXcQ');
    });

    it('delegates for youtu.be URLs', async () => {
      const result = await extract.extractWebPageContent('https://youtu.be/dQw4w9WgXcQ');
      expect(result.source).toBe('YouTube Video Intel');
    });

    it('tries Tavily Extract first when API key present', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch({
        ok: true,
        json: async () => ({
          results: [{ raw_content: 'Extracted content from Tavily. '.repeat(100) }],
        }),
      });

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
      setupFetch({ ok: true, text: async () => 'Content from Jina Reader. '.repeat(3) });

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
        {
          ok: true,
          json: async () => ({
            contents:
              '<html><body>Proxy content from example. Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor.</body></html>',
          }),
        }
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

      await expect(extract.extractWebPageContent('https://example.com/article')).rejects.toThrow(
        'Không thể bóc tách dữ liệu'
      );
    });

    it('detects blocked content (Cloudflare, etc.) and falls back', async () => {
      localStorage.setItem('tavily_api_key', 'test_key');
      setupFetch(
        {
          ok: true,
          json: async () => ({
            results: [{ raw_content: 'Just a moment... Cloudflare verification' }],
          }),
        },
        {
          ok: true,
          text: async () => 'Good content from Jina after the block was bypassed. '.repeat(3),
        }
      );

      const result = await extract.extractWebPageContent('https://example.com/article');
      expect(result.source).toBe('Jina Reader');
      expect(result.content).toContain('Good content from Jina');
    });
  });
});
