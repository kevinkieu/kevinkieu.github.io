/* ==========================================================================
   Jarvis AI - HTML Sanitizer (js/sanitize.js)

   Lá chắn XSS duy nhất cho mọi chỗ chèn HTML: nội dung model trả về, Markdown
   đã parse, HTML từ Web Worker, tên phiên/tệp/prompt người dùng nhập.

   Không phụ thuộc CDN (APK phải chạy offline): dùng DOMParser có sẵn của trình
   duyệt, lọc theo allowlist thẻ/thuộc tính, chặn mọi URL nguy hiểm
   (javascript:, vbscript:, data: trừ ảnh), chặn style có url()/expression().

   API:
     window.sanitizeHtml(html, opts) -> chuỗi HTML an toàn
     window.sanitizeInto(el, html)    -> gán innerHTML đã lọc
   ========================================================================== */
(function () {
  'use strict';

  // Thẻ được phép: đủ cho Markdown + khối suy luận + bảng + code + nút copy.
  const ALLOWED_TAGS = new Set([
    'a',
    'abbr',
    'b',
    'blockquote',
    'br',
    'button',
    'caption',
    'cite',
    'code',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'ins',
    'kbd',
    'li',
    'mark',
    'ol',
    'p',
    'pre',
    'q',
    's',
    'samp',
    'small',
    'span',
    'strong',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'time',
    'tr',
    'u',
    'ul',
    'var',
  ]);

  // Thẻ bị bỏ CẢ NỘI DUNG (không chỉ unwrap) vì nội dung bên trong cũng nguy hiểm.
  const DROP_WITH_CONTENT = new Set([
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'input',
    'textarea',
    'select',
    'option',
    'noscript',
    'template',
    'svg',
    'math',
    'audio',
    'video',
    'source',
    'track',
    'applet',
    'frame',
    'frameset',
    'canvas',
    'portal',
  ]);

  const GLOBAL_ATTRS = new Set([
    'class',
    'id',
    'title',
    'lang',
    'dir',
    'role',
    'aria-label',
    'aria-hidden',
    'data-code',
    'data-lang',
    'data-raw-id',
  ]);
  const TAG_ATTRS = {
    a: ['href', 'target', 'rel', 'name'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    td: ['colspan', 'rowspan', 'align'],
    th: ['colspan', 'rowspan', 'scope', 'align'],
    ol: ['start', 'type'],
    li: ['value'],
    details: ['open'],
    button: ['type', 'disabled'],
    time: ['datetime'],
    table: ['summary'],
  };

  const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;
  const SAFE_IMG_DATA = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
  const BAD_STYLE = /url\s*\(|expression\s*\(|javascript:|vbscript:|@import|behavior\s*:/i;

  function isSafeUrl(value, tag) {
    const v = String(value || '').trim();
    if (!v) return false;
    // Bỏ ký tự điều khiển/zero-width hay dùng để né bộ lọc
    // eslint-disable-next-line no-control-regex -- cố ý lọc ký tự điều khiển
    const cleaned = v.replace(/[\u0000-\u001f\u007f\u200b-\u200f]/g, '');
    if (SAFE_IMG_DATA.test(cleaned) && tag === 'img') return true;
    if (/^data:/i.test(cleaned)) return false;
    return SAFE_URL.test(cleaned);
  }

  function cleanStyle(value) {
    const v = String(value || '');
    if (BAD_STYLE.test(v)) return '';
    return v.slice(0, 400);
  }

  function sanitizeNode(node, doc) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 3) continue; // text
      if (child.nodeType !== 1) {
        child.remove();
        continue;
      }
      const tag = child.tagName.toLowerCase();

      if (DROP_WITH_CONTENT.has(tag)) {
        child.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        // Thẻ lạ: giữ chữ, bỏ vỏ (tránh mất nội dung văn bản hợp lệ)
        const text = doc.createTextNode(child.textContent || '');
        child.replaceWith(text);
        continue;
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style') {
          const s = cleanStyle(value);
          if (s) child.setAttribute('style', s);
          else child.removeAttribute('style');
          continue;
        }
        const allowed = GLOBAL_ATTRS.has(name) || (TAG_ATTRS[tag] || []).includes(name);
        if (!allowed) {
          child.removeAttribute(attr.name);
          continue;
        }
        if ((name === 'href' || name === 'src') && !isSafeUrl(value, tag)) {
          child.removeAttribute(attr.name);
        }
      }

      if (tag === 'a') {
        const href = child.getAttribute('href');
        if (!href) continue;
        if (/^https?:/i.test(href)) {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer nofollow');
        } else {
          child.removeAttribute('target');
        }
      }
      if (tag === 'img' && !child.getAttribute('src')) {
        child.remove();
        continue;
      }
      sanitizeNode(child, doc);
    }
  }

  function sanitizeHtml(html) {
    const input = String(html == null ? '' : html);
    if (!input) return '';
    // Không có DOMParser (Worker) -> escape toàn bộ, tuyệt đối không trả HTML thô.
    if (typeof DOMParser !== 'function') {
      return input.replace(
        /[&<>"']/g,
        c =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c]
      );
    }
    try {
      const doc = new DOMParser().parseFromString(
        '<!doctype html><html><body>' + input + '</body></html>',
        'text/html'
      );
      sanitizeNode(doc.body, doc);
      return doc.body.innerHTML;
    } catch (_) {
      return '';
    }
  }

  function sanitizeInto(el, html) {
    if (!el) return '';
    const clean = sanitizeHtml(html);
    el.innerHTML = clean;
    return clean;
  }

  window.sanitizeHtml = sanitizeHtml;
  window.sanitizeInto = sanitizeInto;
})();
