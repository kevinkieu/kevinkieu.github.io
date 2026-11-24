import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load markdown worker module
function loadMarkdownWorkerModule() {
  const code = `
    // Mock importScripts
    self.importScripts = vi.fn();

    // Configure marked (mocked in setup)
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });

    function escapeHtml(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, "\\u0027");
    }

    function processCodeBlocks(html) {
      return html.replace(/<pre><code class="language-(\\w+)">([\\s\\S]*?)<\\/code><\\/pre>/gi, (match, lang, codeContent) => {
        if (lang === 'mermaid') return match;
        
        const decodedCode = codeContent
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/&/g, '&')
          .replace(/"/g, '"')
          .replace(/'/g, "'");
        
        let highlightedCode = decodedCode;
        try {
          const result = hljs.highlight(decodedCode, { language: lang, ignoreIllegals: true });
          highlightedCode = result.value;
        } catch (e) {
          highlightedCode = escapeHtml(decodedCode);
        }
        
        const escapedForDataAttr = escapeHtml(decodedCode);
        return '<div class="code-block-wrapper"><div class="code-block-header"><span>' + lang + '</span><button class="code-copy-btn" data-code="' + escapedForDataAttr + '">📋 Copy Code</button></div><pre><code class="language-' + lang + ' hljs">' + highlightedCode + '</code></pre></div>';
      });
    }

    // Store handler for testing
    let messageHandler = null;
    self.addEventListener = (event, handler) => {
      if (event === 'message') messageHandler = handler;
    };

    self.postMessage = vi.fn();

    // The actual message handler from the worker
    async function handleMessage(e) {
      const { token, type, markdown, options } = e.data || {};
      if (type !== 'RENDER' || !token) return;
      
      try {
        let html = marked.parse(markdown || '');
        html = processCodeBlocks(html);
        html = html.replace(/\\[URL:\\s*(https?:\\/\\/[^\\s]+)\\]/g, '<a href="$1" target="_blank" style="color:var(--primary);text-decoration:underline;">$1</a>');
        self.postMessage({ token, success: true, html });
      } catch (err) {
        self.postMessage({ token, success: false, error: err.message });
      }
    }

    // Export for testing
    window.__TEST_EXPORTS__ = {
      escapeHtml,
      processCodeBlocks,
      handleMessage,
      getMessageHandler: () => messageHandler,
    };
  `;
  eval(code);
  return window.__TEST_EXPORTS__;
}

describe('markdown.worker.js', () => {
  let worker;

  beforeEach(() => {
    worker = loadMarkdownWorkerModule();
    vi.clearAllMocks();
    self.postMessage.mockClear();
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(worker.escapeHtml('<script>')).toBe('<script>');
      expect(worker.escapeHtml('a & b')).toBe('a & b');
      expect(worker.escapeHtml('"quotes"')).toBe('"quotes"');
    });

    it('handles null/undefined', () => {
      expect(worker.escapeHtml(null)).toBe('');
      expect(worker.escapeHtml(undefined)).toBe('');
    });

    it('escapes single quotes', () => {
      expect(worker.escapeHtml("'single'")).toBe('\u0027single\u0027');
    });
  });

  describe('processCodeBlocks', () => {
    it('wraps code blocks with syntax highlighting', () => {
      const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
      const result = worker.processCodeBlocks(html);

      expect(result).toContain('code-block-wrapper');
      expect(result).toContain('code-block-header');
      expect(result).toContain('📋 Copy Code');
      expect(result).toContain('language-javascript hljs');
      expect(result).toContain('data-code=');
    });

    it('preserves mermaid blocks unchanged', () => {
      const html = '<pre><code class="language-mermaid">graph TD</code></pre>';
      const result = worker.processCodeBlocks(html);
      expect(result).toBe(html);
    });

    it('handles multiple code blocks', () => {
      const html =
        '<pre><code class="language-js">1</code></pre><pre><code class="language-py">2</code></pre>';
      const result = worker.processCodeBlocks(html);
      expect(result.split('code-block-wrapper').length).toBe(3); // 2 blocks + 1
    });

    it('decodes HTML entities in code content', () => {
      const html = '<pre><code class="language-js">const x = < 1;</code></pre>';
      const result = worker.processCodeBlocks(html);
      expect(result).toContain('const x = < 1;'); // escaped for data attr
    });

    it('falls back to escaped HTML when hljs fails', () => {
      hljs.highlight.mockImplementationOnce(() => {
        throw new Error('hljs error');
      });
      const html = '<pre><code class="language-unknown">const x = < 1;</code></pre>';
      const result = worker.processCodeBlocks(html);
      // Should contain escaped HTML entities
      expect(result).toContain('<');
      expect(result).toContain('const x = < 1;');
    });
  });

  describe('message handler', () => {
    it('ignores messages without RENDER type', async () => {
      await worker.handleMessage({ data: { type: 'OTHER', token: '123' } });
      expect(self.postMessage).not.toHaveBeenCalled();
    });

    it('ignores messages without token', async () => {
      await worker.handleMessage({ data: { type: 'RENDER', markdown: 'test' } });
      expect(self.postMessage).not.toHaveBeenCalled();
    });

    it('returns highlighted HTML for valid markdown', async () => {
      marked.parse.mockReturnValue('<p>Hello <strong>world</strong></p>');

      await worker.handleMessage({
        data: { type: 'RENDER', token: 'abc123', markdown: 'Hello **world**' },
      });

      expect(self.postMessage).toHaveBeenCalledWith({
        token: 'abc123',
        success: true,
        html: '<p>Hello <strong>world</strong></p>',
      });
    });

    it('processes code blocks in markdown', async () => {
      marked.parse.mockReturnValue('<pre><code class="language-js">const x = 1;</code></pre>');

      await worker.handleMessage({
        data: { type: 'RENDER', token: 'token1', markdown: '\`\`\`js\nconst x = 1;\n\`\`\`' },
      });

      expect(self.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'token1',
          success: true,
          html: expect.stringContaining('code-block-wrapper'),
        })
      );
    });

    it('converts URL placeholders to links', async () => {
      marked.parse.mockReturnValue('[URL: https://example.com]');

      await worker.handleMessage({
        data: { type: 'RENDER', token: 'url1', markdown: '[URL: https://example.com]' },
      });

      expect(self.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('<a href="https://example.com"'),
        })
      );
    });

    it('returns error response on exception', async () => {
      marked.parse.mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      await worker.handleMessage({
        data: { type: 'RENDER', token: 'err1', markdown: 'test' },
      });

      expect(self.postMessage).toHaveBeenCalledWith({
        token: 'err1',
        success: false,
        error: 'Parse error',
      });
    });

    it('handles empty markdown', async () => {
      marked.parse.mockReturnValue('');

      await worker.handleMessage({
        data: { type: 'RENDER', token: 'empty', markdown: '' },
      });

      expect(self.postMessage).toHaveBeenCalledWith({
        token: 'empty',
        success: true,
        html: '',
      });
    });
  });
});
