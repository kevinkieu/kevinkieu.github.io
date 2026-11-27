import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Nạp CHÍNH js/markdown.worker.js (không copy logic) trong môi trường Worker giả.
function loadWorker() {
  let handler = null;
  const fakeSelf = {
    addEventListener: (event, h) => {
      if (event === 'message') handler = h;
    },
    postMessage: vi.fn(),
    importScripts: vi.fn(),
  };
  global.self = fakeSelf;
  global.importScripts = fakeSelf.importScripts;
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/markdown.worker.js'), 'utf8');
  new Function(code)();
  return { self: fakeSelf, getHandler: () => handler };
}

describe('markdown.worker.js (production)', () => {
  let worker;

  beforeEach(() => {
    worker = loadWorker();
    vi.clearAllMocks();
    global.marked.parse = vi.fn(md => md);
  });

  it('bỏ qua message không phải RENDER hoặc thiếu token', async () => {
    await worker.getHandler()({ data: { type: 'OTHER', token: '1' } });
    await worker.getHandler()({ data: { type: 'RENDER', markdown: 'x' } });
    expect(worker.self.postMessage).not.toHaveBeenCalled();
  });

  it('trả HTML đã parse cho message hợp lệ', async () => {
    global.marked.parse = vi.fn(() => '<p>Hello <strong>world</strong></p>');
    await worker.getHandler()({ data: { type: 'RENDER', token: 't1', markdown: 'Hello' } });
    expect(worker.self.postMessage).toHaveBeenCalledWith({
      token: 't1',
      success: true,
      html: '<p>Hello <strong>world</strong></p>',
    });
  });

  it('bọc code block và escape nội dung trong data-code', async () => {
    global.marked.parse = vi.fn(
      () => '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>'
    );
    await worker.getHandler()({ data: { type: 'RENDER', token: 't2', markdown: '```js' } });
    const html = worker.self.postMessage.mock.calls[0][0].html;
    expect(html).toContain('code-block-wrapper');
    expect(html).toContain('📋 Copy Code');
    // data-code phải là entity đã escape, không phải ký tự thô
    expect(html).toContain('data-code="const a = 1 &lt; 2;"');
    expect(html).not.toContain('data-code="const a = 1 < 2;"');
  });

  it('KHÔNG để <script> sống trong data-code (lỗi cũ escapeHtml no-op)', async () => {
    global.marked.parse = vi.fn(
      () => '<pre><code class="language-html">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>'
    );
    global.hljs.highlight = vi.fn(() => ({ value: 'alert(1)' }));
    await worker.getHandler()({ data: { type: 'RENDER', token: 't3', markdown: 'x' } });
    const html = worker.self.postMessage.mock.calls[0][0].html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('giữ nguyên khối mermaid và chuyển [URL: ...] thành link', async () => {
    global.marked.parse = vi.fn(
      () => '<pre><code class="language-mermaid">graph TD</code></pre>[URL: https://a.com]'
    );
    await worker.getHandler()({ data: { type: 'RENDER', token: 't4', markdown: 'x' } });
    const html = worker.self.postMessage.mock.calls[0][0].html;
    expect(html).toContain('<pre><code class="language-mermaid">graph TD</code></pre>');
    expect(html).toContain('href="https://a.com"');
  });

  it('báo lỗi qua postMessage khi parse thất bại', async () => {
    global.marked.parse = vi.fn(() => {
      throw new Error('boom');
    });
    await worker.getHandler()({ data: { type: 'RENDER', token: 't5', markdown: 'x' } });
    expect(worker.self.postMessage).toHaveBeenCalledWith({
      token: 't5',
      success: false,
      error: 'boom',
    });
  });
});
