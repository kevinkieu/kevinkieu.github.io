/* ==========================================================================
   Jarvis AI - Định dạng nội dung trả lời (stream renderer, thinking, lỗi API)

   Tách khỏi js/app.js để app.js bớt nặng. Các hàm thuần, không giữ trạng thái
   riêng: createStreamRenderer / formatThinkingResponse / formatFinalThinkingResponse
   / formatUpstreamError.
   ========================================================================== */
function createStreamRenderer(targetEl) {
  let pending = false,
    latest = '',
    rafId = null;
  return {
    push: text => {
      latest = text;
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(() => {
          try {
            let toRender = latest;
            const hideThinking = isThinkingHidden();
            if (hideThinking) {
              toRender = toRender
                .replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>/gi, '')
                .replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '');
            } else {
              toRender = toRender.replace(
                /<(?:thinking|thought)>([\s\S]*?)<\/(?:thinking|thought)>/gi,
                (m, p1) => buildThinkingDetailsHtml(p1)
              );
              toRender = mergeAdjacentThinkingBlocks(toRender);
            }
            targetEl.innerHTML = marked.parse(toRender, { sanitize: true });
          } catch (_) {}
          pending = false;
        });
      }
    },
    flush: async finalText => {
      if (rafId) cancelAnimationFrame(rafId);
      pending = false;
      await renderMsgContent(targetEl, finalText);
    },
  };
}

function formatThinkingResponse(currentThinking, currentContent, modelDisplayName = 'AI') {
  const hideThinking = isThinkingHidden();

  // Gộp mọi đoạn suy luận (reasoning_content + thinking/thought trong content) về một chuỗi duy nhất
  const mergedSegments = mergeThinkingSegments(currentThinking, currentContent);
  let displayThinking = mergedSegments.thinking;
  let displayContent = mergedSegments.content;

  if (hideThinking) {
    if (displayContent) {
      return displayContent;
    } else {
      return `<div class="thinking-streaming"><span class="thinking-spinner">⏳</span> <em>${modelDisplayName} đang suy nghĩ...</em></div>`;
    }
  } else {
    const clean = displayThinking.trim();
    const { words, tokens } = thinkingStats(clean);

    if (displayContent) {
      const thinkingBlock = buildThinkingDetailsHtml(clean);
      return mergeAdjacentThinkingBlocks(
        thinkingBlock ? thinkingBlock + '\n\n' + displayContent : displayContent
      );
    } else if (clean) {
      return `<div class="thinking-streaming"><span class="thinking-spinner">⏳</span> <em>${modelDisplayName} đang suy luận (${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens)...</em></div>`;
    }
    return '';
  }
}

function formatFinalThinkingResponse(currentThinking, currentContent, modelDisplayName = 'AI') {
  const hideThinking = isThinkingHidden();

  // Gộp mọi đoạn suy luận (reasoning_content + thinking/thought trong content) về một chuỗi duy nhất
  const mergedSegments = mergeThinkingSegments(currentThinking, currentContent);
  let displayThinking = mergedSegments.thinking;
  let displayContent = mergedSegments.content;

  // FAIL-SAFE CHỐNG LỖI CHỈ CÓ SUY LUẬN MÀ KHÔNG CÓ CÂU TRẢ LỜI:
  // Nếu mô hình chỉ xuất phần suy luận mà quên xuất câu trả lời người dùng,
  // chuyển ngay nội dung suy luận thành câu trả lời để người dùng luôn nhận được kết quả hoàn chỉnh!
  if (!displayContent.trim() && displayThinking.trim()) {
    displayContent = displayThinking.trim();
    displayThinking = '';
  }

  if (hideThinking) {
    return displayContent;
  } else {
    const thinkingBlock = buildThinkingDetailsHtml(displayThinking);
    return mergeAdjacentThinkingBlocks(
      thinkingBlock ? thinkingBlock + '\n\n' + displayContent : displayContent
    );
  }
}

function formatUpstreamError(raw, httpStatus) {
  const text = String(raw || '').trim();
  if (!text) return httpStatus ? `HTTP ${httpStatus}` : '';
  let msg = '';
  let code = '';
  try {
    const j = JSON.parse(text);
    msg = j?.error?.message || j?.message || j?.detail || '';
    const c = j?.error?.code ?? j?.error?.status ?? j?.code ?? j?.status;
    if (c !== undefined && c !== null && c !== '') code = String(c);
  } catch (_) {
    // Không phải JSON: bắt cặp "message"/"code" dạng text, còn lại coi là message
    const mMsg = text.match(/"message"\s*:\s*"([^"]+)"/i);
    const mCode = text.match(/"code"\s*:\s*"?([A-Za-z0-9_.-]+)"?/i);
    msg = mMsg ? mMsg[1] : text;
    if (mCode) code = mCode[1];
  }
  msg = String(msg).replace(/\s+/g, ' ').trim();
  if (msg.length > 300) msg = msg.slice(0, 297) + '…';
  if (!code && httpStatus) code = String(httpStatus);
  if (!msg) return code ? `HTTP ${code}` : '';
  return code ? `${msg} (${code})` : msg;
}

window.createStreamRenderer = createStreamRenderer;
window.formatThinkingResponse = formatThinkingResponse;
window.formatFinalThinkingResponse = formatFinalThinkingResponse;
window.formatUpstreamError = formatUpstreamError;
