/* ==========================================================================
   Jarvis AI - Helper UI thuần (tách từ js/app.js, Giai đoạn 1)
   Các hàm không phụ thuộc luồng gửi tin; được expose qua window để app.js dùng.
   ========================================================================== */
(function () {
  'use strict';

  function enableHorizontalScrollAndDrag(el) {
    if (!el || el._hScrollInit) return;
    el._hScrollInit = true;

    el.addEventListener('dragstart', e => {
      e.preventDefault();
    });

    el.addEventListener(
      'wheel',
      e => {
        if (e.deltaY !== 0) {
          if (el.scrollWidth > el.clientWidth) {
            e.preventDefault();
            el.scrollLeft += e.deltaY * 1.2;
          }
        } else if (e.deltaX !== 0) {
          el.scrollLeft += e.deltaX;
        }
      },
      { passive: false }
    );

    let isDown = false;
    let isDragging = false;
    let suppressClick = false;
    let startX = 0;
    let scrollStart = 0;

    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('tab-close')) return;

      isDown = true;
      isDragging = false;
      suppressClick = false;
      startX = e.pageX;
      scrollStart = el.scrollLeft;
    });

    window.addEventListener('mousemove', e => {
      if (!isDown) return;
      const dx = e.pageX - startX;

      if (!isDragging && Math.abs(dx) > 10) {
        isDragging = true;
        suppressClick = true;
        el.classList.add('is-dragging-scroll');
      }

      if (isDragging) {
        el.scrollLeft = scrollStart - dx;
      }
    });

    const endDrag = () => {
      if (!isDown) return;
      isDown = false;
      if (isDragging) {
        el.classList.remove('is-dragging-scroll');
        setTimeout(() => {
          isDragging = false;
          suppressClick = false;
        }, 80);
      } else {
        isDragging = false;
        suppressClick = false;
      }
    };

    window.addEventListener('mouseup', endDrag);

    el.addEventListener(
      'click',
      e => {
        if (suppressClick) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          suppressClick = false;
        }
      },
      true
    );
  }

  function generateLocalFallbackTitle(text) {
    if (!text) return '';
    let clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/["'“”«»#*_\n\r\t]/g, ' ')
      .trim();
    let prev;
    do {
      prev = clean;
      clean = clean
        .replace(
          /^(hãy|bạn hãy|xin hãy|cho tôi hỏi|cho hỏi|nhờ bạn|giúp tôi|làm sao để|làm thế nào để|hướng dẫn|giải thích|tóm tắt|viết|tạo|cách|tìm|so sánh|vui lòng|please|how to|can you|explain|what is)\s+/i,
          ''
        )
        .trim();
    } while (clean !== prev);

    const words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const title = words.slice(0, 5).join(' ');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  function sanitizeTranscript(text) {
    if (!text) return '';
    return text
      .replace(/```[\s\S]*?```/g, ' [đoạn mã] ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[#*_~>]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();
  }

  function splitTextIntoSmartChunks(text, maxChars = 850) {
    if (!text || text.length <= maxChars) return [text || ''];
    const chunks = [];
    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
    let cur = '';
    for (const s of sentences) {
      if ((cur + s).length > maxChars && cur.trim()) {
        chunks.push(cur.trim());
        cur = s;
      } else {
        cur += s;
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks.length ? chunks : [text];
  }

  function updateThinkingVisibility() {
    const m = DOM.model?.value || '',
      t = DOM.thinking;
    if (!t) return;
    const prev = t.value;
    const mOpts = (window.COMPAT_MODEL_OPTS || {})[m];
    if (mOpts && Array.isArray(mOpts.levels) && mOpts.levels.length) {
      t.innerHTML = mOpts.levels.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
      t.value = mOpts.levels.some(([v]) => v === prev) ? prev : mOpts.levels[0][0];
      t.disabled = mOpts.levels.length === 1;
      return;
    }
    t.disabled = false;
    const modelLevels = window.getModelThinkingLevels ? window.getModelThinkingLevels(m) : [];
    const opts = (modelLevels.length ? modelLevels : window.DEFAULT_THINKING_LEVELS || []).map(
      v => [v, (window.THINKING_LEVEL_LABELS || {})[v] || v]
    );
    t.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    t.value = opts.some(([v]) => v === prev) ? prev : opts[0]?.[0] || 'minimal';
  }

  window.enableHorizontalScrollAndDrag = enableHorizontalScrollAndDrag;
  window.generateLocalFallbackTitle = generateLocalFallbackTitle;
  window.sanitizeTranscript = sanitizeTranscript;
  window.splitTextIntoSmartChunks = splitTextIntoSmartChunks;
  window.updateThinkingVisibility = updateThinkingVisibility;
})();
