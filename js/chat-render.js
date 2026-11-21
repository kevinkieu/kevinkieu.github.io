/* ==========================================================================
   Jarvis AI - Chat History Renderer
   Phần hiển thị lịch sử chat: khối suy luận 💭, render Markdown (KaTeX, Mermaid,
   highlight code), bong bóng tin nhắn + thanh action, vẽ lại lịch sử, giữ vị trí
   cuộn, và nội dung dùng cho nút Copy.

   Tách ra khỏi js/app.js và nạp TRƯỚC js/app.js trong index.html. Mọi thứ được
   xuất qua window để app.js giữ alias cùng tên (không phải sửa call site nào).
   Trạng thái dùng chung (chatHistory / sessions / activeId / DOM) được đọc động
   qua window vì chúng thuộc js/app.js.
   ========================================================================== */
(function () {
  'use strict';
  const ls = localStorage;

  // DOM của app.js chỉ có sau khi app.js nạp -> đọc động từng lần truy cập.
  const DOM = new Proxy({}, { get: (_t, k) => (window.DOM ? window.DOM[k] : undefined) });
  const chatHistory = () => window.chatHistory || [];

  // Cờ "ẩn khối suy luận" dùng chung với js/app.js qua window.isThinkingHidden
  const isThinkingHidden = () => ls.getItem('jarvis_hide_deepseek_thinking') === 'true' || ls.getItem('jarvis_hide_thinking') === 'true';

  // Cầu nối sang các hàm của app.js / module khác (nạp sau hoặc trước file này).
  const escapeHtml = str => (typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str == null ? '' : str));
  const getKeyBadgeHtml = (slot, model) => (typeof window.getKeyBadgeHtml === 'function' ? window.getKeyBadgeHtml(slot, model) : '');
  const getNowTime24h = () => (typeof window.getNowTime24h === 'function' ? window.getNowTime24h() : '');
  const showToast = (msg, type) => (typeof window.showToast === 'function' ? window.showToast(msg, type) : undefined);
  const copyRawText = (text, msg) => (typeof window.copyRawText === 'function' ? window.copyRawText(text, msg) : undefined);
  const saveToDB = s => (typeof window.saveToDB === 'function' ? window.saveToDB(s) : Promise.resolve());

  // --- MARKDOWN WORKER (lazy init) ---
  let markdownWorker = null;
  let workerToken = 0;
  const workerPending = new Map();

  function getMarkdownWorker() {
    if (markdownWorker) return markdownWorker;
    try {
      markdownWorker = new Worker('./js/markdown.worker.js');
      markdownWorker.onmessage = e => {
        const { token, success, html, error } = e.data;
        const resolve = workerPending.get(token);
        if (resolve) {
          workerPending.delete(token);
          if (success) resolve({ html });
          else resolve({ error: new Error(error) });
        }
      };
      markdownWorker.onerror = e => {
        console.warn('Markdown worker error:', e);
        // Reject all pending
        for (const [, resolve] of workerPending) resolve({ error: new Error('Worker error') });
        workerPending.clear();
      };
    } catch (e) {
      console.warn('Cannot create markdown worker:', e);
      markdownWorker = null;
    }
    return markdownWorker;
  }

  async function renderMarkdownInWorker(markdown) {
    const worker = getMarkdownWorker();
    if (!worker) return { error: new Error('No worker') };
    const token = ++workerToken;
    return new Promise(resolve => {
      workerPending.set(token, resolve);
      worker.postMessage({ token, type: 'RENDER', markdown });
      // Timeout fallback
      setTimeout(() => {
        if (workerPending.has(token)) {
          workerPending.delete(token);
          resolve({ error: new Error('Worker timeout') });
        }
      }, 5000);
    });
  }

// --- GỘP CÁC ĐOẠN SUY LUẬN LIỀN NHAU THÀNH MỘT KHỐI 💭 DUY NHẤT ---
    // Provider có thể trả suy luận thành nhiều đoạn liền nhau trong cùng một stream
    // (nhiều cục reasoning_content, hoặc  thinking/<thought> nằm ngay trong content).
    // Mọi đoạn liền nhau được gộp lại để mỗi lượt trả lời chỉ hiện đúng MỘT khối 💭.
    const thinkingStats = clean => {
      const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
      return { words, tokens: Math.max(1, Math.round(clean.length / 4)) };
    };

    const buildThinkingDetailsHtml = raw => {
      const clean = (raw || '').trim();
      if (!clean) return '';
      const { words, tokens } = thinkingStats(clean);
      return `<details class="thinking-block"><summary class="thinking-summary"><span class="thinking-icon">💭</span> Quá trình suy luận <span class="thinking-count">(${words.toLocaleString('vi-VN')} từ • ~${tokens.toLocaleString('vi-VN')} tokens - bấm để xem)</span></summary><div class="thinking-content">${escapeHtml(clean)}</div></details>`;
    };

    // Gộp reasoning_content với các đoạn  thinking/<thought> còn sót trong content.
    function mergeThinkingSegments(thinking, content) {
      let merged = (thinking || '').trim();      const rest = String(content || '').replace(/<(?:thinking|thought)>([\s\S]*?)(?:<\/(?:thinking|thought)>|$)/gi, (m, seg) => {
        const clean = (seg || '').trim();
        if (clean) merged = merged ? `${merged}\n\n${clean}` : clean;        return '';      }).trim();      return { thinking: merged, content: rest };    }

    // Lưới an toàn cho nội dung đã render (kể cả tin nhắn cũ trong lịch sử):
    // nhiều <details class="thinking-block"> đứng liền nhau -> gộp thành một khối duy nhất.
    const mergeAdjacentThinkingBlocks = html => {
      if (!html || html.indexOf('class="thinking-block"') < 0) return html;
      const unescapeOnce = s => String(s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      return html.replace(/(?:<details class="thinking-block">[\s\S]*?<\/details>(?:[ \t]*\r?\n)*[ \t]*){2,}/gi, run => {
        const parts = [];
        run.replace(/<div class="thinking-content">([\s\S]*?)<\/div>/gi, (m, inner) => {
          const seg = unescapeOnce(inner).trim();
          if (seg) parts.push(seg);
          return m;
        });
        const mergedBlock = buildThinkingDetailsHtml(parts.join('\n\n'));
        return mergedBlock ? mergedBlock + '\n\n' : '';
      });
    };

    // --- MARKDOWN & SYNTAX HIGHLIGHTING RENDERER (Worker + Fallback) ---
    async function renderMsgContent(el, t) {
      t = t || "";
      // Khối suy luận được tách RIÊNG khỏi chuỗi Markdown.
      // Lý do: marked cắt HTML block tại dòng trống, nếu để chung thì nó sinh ra
      // "<p>...</div></details></p>" và trình duyệt có thể nuốt luôn phần câu trả lời vào <details> (đang thu gọn).
      let thinkingHtml = '';      const hideThinking = isThinkingHidden();      if (hideThinking) {        t = t.replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>/gi, '')             .replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, '');      } else {        t = t.replace(/<(?:thinking|thought)>([\s\S]*?)<\/(?:thinking|thought)>/gi, (m, p1) => buildThinkingDetailsHtml(p1));        // Rút các khối <details> ra khỏi chuỗi trước khi parse Markdown (tránh bị nuốt câu trả lời)        t = t.replace(/<details class="thinking-block">[\s\S]*?<\/details>/gi, (m) => {          thinkingHtml += m;          return '';        });
        // Các khối 💭 liền nhau (vd: reasoning_content +  thinking trong content) -> một khối duy nhất
        thinkingHtml = mergeAdjacentThinkingBlocks(thinkingHtml);
      }
      
      // URL placeholders -> links trước khi parse
      const markdownForWorker = t.replace(/\[URL:\s*(https?:\/\/[^\s]+)\]/g, '<a href="$1" target="_blank" style="color:var(--primary);text-decoration:underline;">$1</a>');

      // Try worker first (off main thread: marked.parse + hljs.highlightElement)      let html = '';      const workerResult = await renderMarkdownInWorker(markdownForWorker);      if (workerResult.error) {        // Fallback: main thread (original logic)        html = marked.parse(markdownForWorker);        el.innerHTML = html;        if (thinkingHtml) el.insertAdjacentHTML('afterbegin', thinkingHtml);                // Code blocks beautification & Copy buttons (main thread)        el.querySelectorAll('pre code').forEach(block => {          if (!block.classList.contains('language-mermaid')) {            hljs.highlightElement(block);            const pre = block.parentElement;            if (!pre.parentElement.classList.contains('code-block-wrapper')) {              const wrapper = document.createElement('div');              wrapper.className = 'code-block-wrapper';              const lang = (block.className.match(/language-(\w+)/) || [, 'code'])[1];              const header = document.createElement('div');              header.className = 'code-block-header';              header.innerHTML = `<span>${lang}</span><button class="code-copy-btn">📋 Copy Code</button>`;              header.querySelector('.code-copy-btn').onclick = function() {                copyRawText(block.innerText, '📋 Đã copy đoạn mã!');                this.innerText = '✅ Copied!';                setTimeout(() => this.innerText = '📋 Copy Code', 2000);              };              pre.parentNode.insertBefore(wrapper, pre);              wrapper.appendChild(header);              wrapper.appendChild(pre);            }          }        });      } else {        // Worker success: inject HTML (already has code blocks highlighted + wrapped)        el.innerHTML = workerResult.html;        if (thinkingHtml) el.insertAdjacentHTML('afterbegin', thinkingHtml);        // Wire up copy buttons from worker-generated markup        el.querySelectorAll('.code-copy-btn').forEach(btn => {          btn.onclick = function() {            const codeText = this.getAttribute('data-code') || '';            copyRawText(codeText, '📋 Đã copy đoạn mã!');            this.innerText = '✅ Copied!';            setTimeout(() => this.innerText = '📋 Copy Code', 2000);          };        });      }
            // Math KaTeX (always on main thread)      window.renderMathInElement?.(el, {        delimiters: [          { left: '$$', right: '$$', display: true },          { left: '$', right: '$', display: false }        ],        throwOnError: false      });
      // Mermaid diagrams (always on main thread)      const mds = el.querySelectorAll('code.language-mermaid');      for (let i = 0; i < mds.length; i++) {        try {          const { svg } = await mermaid.render('m_' + Date.now() + '_' + i, mds[i].textContent);          const d = document.createElement('div');          d.style.cssText = 'overflow-x:auto;padding:10px;text-align:center;background:var(--bg-card);border-radius:var(--radius-md);margin:10px 0;max-width:100%;box-sizing:border-box;';          d.innerHTML = svg;          mds[i].parentElement.replaceWith(d);        } catch {}      }    }

    async function appendMsg(sd, t, i, iHL = false) {
      t = t || "";
      const c = document.createElement('div');
      c.className = 'message-container';
      const isPinned = !!chatHistory()[i]?.pinned;
      if (isPinned) c.classList.add('pinned-msg');

      const m = document.createElement('div');
      m.className = sd === 'user' ? 'user-message' : 'bot-message';
      m.setAttribute('data-raw', t);

      const ixId = chatHistory()[i]?.interactionId;
      const kNum = chatHistory()[i]?.keyIndex || chatHistory()[i]?.pinnedKey;
      const msgModel = chatHistory()[i]?.model;
      const keyBadge = (sd !== 'user' && kNum) ? getKeyBadgeHtml(kNum, msgModel) : '';
      const ixBadge = ((sd !== 'user') && ixId) ? `<span class="interaction-id-badge" title="Interaction ID: ${ixId}">⚡ ID: ${ixId.slice(0, 8)}...</span>` : '';
      const pinnedBadge = isPinned ? `<span class="pinned-tag">📌 ĐÃ GHIM</span>` : '';
      const liveBadge = chatHistory()[i]?.isLiveCall ? `<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:rgba(16,185,129,0.15);color:#10b981;font-weight:600;margin-left:4px;border:1px solid rgba(16,185,129,0.3);">📞 Thoại Live</span>` : '';

      m.innerHTML = `
        <div class="message-header">
          <span>${sd === 'user' ? '👤 Bạn' : '✨ Jarvis AI'}</span>
          <span style="font-size:0.72rem;opacity:0.75;margin-left:4px;">🕒 ${chatHistory()[i]?.time || getNowTime24h()}</span>
          ${keyBadge}
          ${liveBadge}
          ${pinnedBadge}
          ${ixBadge}
        </div>
        <div class="msg-content"></div>
      `;

      const a = document.createElement('div');
      a.className = 'msg-actions';
      a.innerHTML = `
        <button class="action-btn" onclick="copy(this)" title="Sao chép toàn bộ">📋 Copy</button>
        <button class="action-btn ${isPinned ? 'pinned-active' : ''}" onclick="togglePinMsg(${i})" title="${isPinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn này để AI luôn nhớ'}">${isPinned ? '📌 Bỏ ghim' : '📌 Ghim'}</button>
        <button class="action-btn" onclick="forkSessionAt(${i})" title="Rẽ nhánh tạo phiên mới từ điểm này">🌿 Rẽ nhánh</button>
        ${sd !== 'user' ? `<button class="action-btn tts-btn" onclick="toggleSpeakMsg(this, ${i})" title="Đọc to bằng giọng nói">🔊 Nghe</button><button class="action-btn" onclick="openMsgInTTSStudio(this, ${i})" title="Chuyển nội dung vào Gemini TTS Studio">🎙️ Studio</button>` : ''}
        ${sd === 'user' 
          ? `<button class="action-btn" onclick="editMsg(${i})" title="Chỉnh sửa câu hỏi này">✏️ Sửa</button>` 
          : `<button class="action-btn" onclick="retryMsg(${i})" title="Tạo lại câu trả lời này">🔄 Thử lại</button>`}
        <button class="action-btn" style="color:var(--danger);" onclick="deleteMsg(${i})" title="Xóa tin nhắn này">🗑️ Xóa</button>
      `;

      c.append(m, a);
      DOM.chat.appendChild(c);

      if (!iHL && sd === 'user') DOM.chat.scrollTop = DOM.chat.scrollHeight;
      const contentEl = m.querySelector('.msg-content');
      if (sd === 'user') {
        contentEl.innerHTML = escapeHtml(t).replace(/\n/g, '<br>');
      } else {
        await renderMsgContent(contentEl, t);
      }
    }

    // Giữ vị trí cuộn khi vẽ lại lịch sử (tránh nhảy lên top sau khi xóa tin nhắn)
    function captureChatScroll() {
      const el = DOM.chat;
      if (!el) return null;
      const atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 80;
      return { top: el.scrollTop, atBottom };
    }
    function restoreChatScroll(state) {
      const el = DOM.chat;
      if (!el || !state) return;
      const apply = () => { el.scrollTop = state.atBottom ? el.scrollHeight : state.top; };
      apply();
      requestAnimationFrame(apply);
      setTimeout(apply, 60);
    }

    async function reRenderHistory() {
      const s = (window.sessions || []).find(x => x.id === window.activeId);
      if (s) { s.his = chatHistory(); await saveToDB(s); window.renderSel?.(); }
      DOM.chat.innerHTML = '';
      for (let j = 0; j < chatHistory().length; j++) {
        await appendMsg(chatHistory()[j].role === 'model' ? 'bot' : 'user', chatHistory()[j].text, j, true);
      }
    }

    // Bo khoi suy nghi (thinking) khoi noi dung truoc khi sao chep    function stripThinkingForCopy(text) {      if (!text) return '';      return text        .replace(/<details\b[^>]*class="[^"]*thinking-block[^"]*"[^>]*>[\s\S]*?<\/details>\s*/gi, '')        .replace(/<details\b[^>]*>\s*<summary\b[^>]*class="[^"]*thinking-summary[^"]*"[^>]*>[\s\S]*?<\/details>\s*/gi, '')        .replace(/<div\b[^>]*class="[^"]*thinking-streaming[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '')        .replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>\s*/gi, '')        .replace(/<(?:thinking|thought)>[\s\S]*$/i, '')        .trim();    }

    function getCopyText(el) {
      if (!el) return '';
      const raw = el.getAttribute('data-raw');
      const isBot = el.classList.contains('bot-message');
      if (!isBot) return raw || el.innerText || '';
      if (raw && raw.trim()) return stripThinkingForCopy(raw);
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.thinking-block, .thinking-streaming, .msg-actions, .code-copy-btn, .message-header').forEach(n => n.remove());
      return (clone.innerText || '').trim();
    }

    function copy(b) {
      const c = b.closest('.message-container').querySelector('.user-message, .bot-message');
      const text = getCopyText(c);
      if (!text) return showToast('Nội dung trống!', 'warning');
      copyRawText(text);
    }


  // ---- Xuất ra window: js/app.js giữ alias cùng tên ----
  window.thinkingStats = thinkingStats;
  window.buildThinkingDetailsHtml = buildThinkingDetailsHtml;
  window.mergeThinkingSegments = mergeThinkingSegments;
  window.mergeAdjacentThinkingBlocks = mergeAdjacentThinkingBlocks;
  window.renderMsgContent = renderMsgContent;
  window.appendMsg = appendMsg;
  window.captureChatScroll = captureChatScroll;
  window.restoreChatScroll = restoreChatScroll;
  window.reRenderHistory = reRenderHistory;
  window.stripThinkingForCopy = stripThinkingForCopy;
  window.copy = copy;
  window.isThinkingHidden = isThinkingHidden;
})();
