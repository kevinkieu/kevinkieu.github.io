/* ==========================================================================
   Jarvis AI - Floating Selection Toolbar Controller
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  let currentSelectedText = '';

  function hideSelectionToolbar() {
    const selToolbar = $('selection-toolbar');
    if (selToolbar) selToolbar.style.display = 'none';
  }

  const checkSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideSelectionToolbar();
      return;
    }
    const txt = sel.toString().trim();
    if (txt.length < 2) {
      hideSelectionToolbar();
      return;
    }

    const anchor = sel.anchorNode;
    const chatContainer = $('chat-container');
    if (!chatContainer || !chatContainer.contains(anchor)) {
      hideSelectionToolbar();
      return;
    }

    currentSelectedText = txt;
    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      let top = rect.top - 44;
      let left = rect.left + rect.width / 2 - 140;

      if (top < 10) top = rect.bottom + 8;
      if (left < 10) left = 10;
      if (left + 290 > window.innerWidth) left = window.innerWidth - 300;

      const selToolbar = $('selection-toolbar');
      if (selToolbar) {
        selToolbar.style.top = `${top}px`;
        selToolbar.style.left = `${left}px`;
        selToolbar.style.display = 'flex';
      }
    } catch (e) {}
  };

  function initSelectionToolbar() {
    document.addEventListener('selectionchange', checkSelection);
    document.addEventListener('mouseup', checkSelection);
    document.addEventListener('touchend', checkSelection);

    const runQuickActionOnText = instruction => {
      if (!currentSelectedText) return;
      hideSelectionToolbar();
      const input = $('user-input');
      if (input) {
        input.value = `${instruction}\n> "${currentSelectedText}"`;
        input.dispatchEvent(new Event('input'));
      }
      const sendBtn = $('send-button');
      if (sendBtn) sendBtn.click();
    };

    const copyRawText = text => {
      if (typeof window.copyRawText === 'function') window.copyRawText(text);
      else navigator.clipboard.writeText(text);
    };

    const showToast = window.showToast;

    $('sel-btn-explain')?.addEventListener('click', () =>
      runQuickActionOnText('Hãy giải thích chi tiết, dễ hiểu đoạn văn bản sau:')
    );
    $('sel-btn-translate')?.addEventListener('click', () =>
      runQuickActionOnText(
        'Hãy dịch đoạn văn bản sau sang tiếng Việt chuẩn xác (hoặc tiếng Anh nếu gốc đã là tiếng Việt):'
      )
    );
    $('sel-btn-summarize')?.addEventListener('click', () =>
      runQuickActionOnText(
        'Hãy tóm tắt ngắn gọn các ý cốt lõi của đoạn văn bản sau thành các gạch đầu dòng:'
      )
    );
    $('sel-btn-copy')?.addEventListener('click', () => {
      copyRawText(currentSelectedText);
      hideSelectionToolbar();
      if (showToast) showToast('Đã sao chép đoạn chọn!', 'success');
    });
  }

  // Expose for external access
  window.initSelectionToolbar = initSelectionToolbar;
  window.currentSelectedText = currentSelectedText;
  window.hideSelectionToolbar = hideSelectionToolbar;
})();
