import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// test/setup.js mock DOMParser cho các module khác, nên ở đây dùng DOMParser THẬT
// của jsdom để kiểm tra sanitizer đúng như trên trình duyệt.
let originalDOMParser;
beforeAll(() => {
  originalDOMParser = global.DOMParser;
  global.DOMParser = new JSDOM('').window.DOMParser;
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/sanitize.js'), 'utf8');
  new Function(code)();
});
afterAll(() => {
  global.DOMParser = originalDOMParser;
});

describe('sanitizeHtml (production js/sanitize.js)', () => {
  it('xóa <script> cùng nội dung', () => {
    const out = window.sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toBe('<p>hi</p>');
    expect(out).not.toContain('alert');
  });

  it('xóa event handler và iframe', () => {
    const out = window.sanitizeHtml('<img src="x" onerror="alert(1)"><iframe src="evil"></iframe>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('iframe');
  });

  it('chặn href javascript: nhưng giữ link https', () => {
    const out = window.sanitizeHtml(
      '<a href="javascript:alert(1)">x</a><a href="https://a.com">y</a>'
    );
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="https://a.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('chặn data: URL trong img nhưng cho ảnh base64', () => {
    const bad = window.sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">');
    expect(bad).not.toContain('data:text/html');
    const ok = window.sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(ok).toContain('data:image/png;base64');
  });

  it('lọc style có url()/expression()', () => {
    const out = window.sanitizeHtml(
      '<div style="color:red">a</div><div style="background:url(javascript:alert(1))">b</div>'
    );
    expect(out).toContain('color:red');
    expect(out).not.toContain('url(');
  });

  it('giữ cấu trúc Markdown hợp lệ (bảng, code, details)', () => {
    const html =
      '<h2>T</h2><table><tbody><tr><th>A</th><td colspan="2">B</td></tr></tbody></table>' +
      '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>' +
      '<details class="thinking-block"><summary>s</summary><div class="thinking-content">x</div></details>';
    const out = window.sanitizeHtml(html);
    expect(out).toContain('<h2>T</h2>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('class="language-js"');
    expect(out).toContain('<details class="thinking-block">');
    expect(out).toContain('&lt;');
  });

  it('giữ data-code cho nút copy của worker', () => {
    const out = window.sanitizeHtml(
      '<button class="code-copy-btn" data-code="a&amp;b">📋 Copy Code</button>'
    );
    expect(out).toContain('data-code="a&amp;b"');
    expect(out).toContain('code-copy-btn');
  });

  it('không làm rơi chữ của thẻ lạ', () => {
    expect(window.sanitizeHtml('<marquee>hello</marquee>')).toBe('hello');
  });
});
