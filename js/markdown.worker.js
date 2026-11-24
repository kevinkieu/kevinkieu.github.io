/* ==========================================================================
   Jarvis AI - Markdown Worker (js/markdown.worker.js)
   Chạy marked.parse() + hljs.highlight() ngầm trong Web Worker,
   giúp main thread không bị block khi render tin nhắn dài (code + markdown + mermaid).
   Message protocol:
     - {type: 'RENDER', token, markdown, options}
     - Response: {token, success: true, html} | {token, success: false, error}
   Fallback: nếu worker fail, js/chat-render.js sẽ tự render trên main thread.
   Không dùng DOM APIs (DOMParser, document.createElement) vì không có trong Worker.
   Xử lý code block bằng regex + hljs.highlight (không phải highlightElement).
   ========================================================================== */

// Import libraries via importScripts (Service Worker already caches them)
importScripts(
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js'
);

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false,
});

// Simple HTML escape for code block content
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '\u0027');
}

// Process code blocks using regex + hljs.highlight (string-based)
// Returns HTML with highlighted code wrapped in code-block-wrapper + copy button
function processCodeBlocks(html) {
  // Regex to find <pre><code class="language-XXX">...</code></pre>
  // We replace each code block with highlighted version + wrapper
  return html.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/gi,
    (match, lang, codeContent) => {
      if (lang === 'mermaid') return match; // Skip mermaid - handled on main thread

      // Decode HTML entities in code content
      const decodedCode = codeContent
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/&/g, '&')
        .replace(/"/g, '"')
        .replace(/'/g, "'");

      // Highlight with hljs.highlight (string-based, not highlightElement)
      let highlightedCode = decodedCode;
      try {
        const result = hljs.highlight(decodedCode, { language: lang, ignoreIllegals: true });
        highlightedCode = result.value;
      } catch (e) {
        // Fallback: escape HTML
        highlightedCode = escapeHtml(decodedCode);
      }

      // Wrap in code-block-wrapper with copy button
      const escapedForDataAttr = escapeHtml(decodedCode);
      return (
        '<div class="code-block-wrapper"><div class="code-block-header"><span>' +
        lang +
        '</span><button class="code-copy-btn" data-code="' +
        escapedForDataAttr +
        '">📋 Copy Code</button></div><pre><code class="language-' +
        lang +
        ' hljs">' +
        highlightedCode +
        '</code></pre></div>'
      );
    }
  );
}

self.addEventListener('message', async function (e) {
  const { token, type, markdown, options } = e.data || {};
  if (type !== 'RENDER' || !token) return;

  try {
    // Parse markdown
    let html = marked.parse(markdown || '');

    // Process code blocks with highlighting
    html = processCodeBlocks(html);

    // Convert URL placeholders to links
    html = html.replace(
      /\[URL:\s*(https?:\/\/[^\s]+)\]/g,
      '<a href="$1" target="_blank" style="color:var(--primary);text-decoration:underline;">$1</a>'
    );

    self.postMessage({ token, success: true, html });
  } catch (err) {
    self.postMessage({ token, success: false, error: err.message });
  }
});
