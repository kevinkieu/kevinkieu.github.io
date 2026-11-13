/* ==========================================================================
   Jarvis AI - Command Palette & Prompt Library System (js/commands.js)
   Quản lý danh sách lệnh nhanh (Ctrl+K, Slash Commands /quota, /new, /brief, etc.)
   và Thư viện gợi ý mẫu câu prompt (Prompt Library).
   ========================================================================== */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;
  const showToast = (msg, type) => (typeof window.showToast === 'function') ? window.showToast(msg, type) : console.log(`[${type}] ${msg}`);
  const closeModals = () => (typeof window.closeModals === 'function') ? window.closeModals() : null;

  // --- PROMPT LIBRARY SYSTEM ---
  const DEFAULT_PROMPTS = [
    { id: 'p1', title: '📝 Tóm tắt bảng', text: 'Hãy tóm tắt ngắn gọn nội dung thành BẢNG đối chiếu và GẠCH ĐẦU DÒNG các ý quan trọng nhất:' },
    { id: 'p2', title: '📊 Sơ đồ Mermaid', text: 'Vẽ sơ đồ tư duy trực quan bằng code Mermaid trong khối ```mermaid để giải thích rõ cấu trúc:' },
    { id: 'p3', title: '📖 Giải thích chi tiết', text: 'Giải thích chi tiết từng bước một, kèm ví dụ thực tế minh họa dễ hiểu nhất:' },
    { id: 'p4', title: '💻 Viết Code tối ưu', text: 'Viết mã nguồn sạch, chuẩn kiến trúc, tối ưu hiệu năng và có chú thích rõ ràng trong markdown:' },
    { id: 'p5', title: '🔍 So sánh & Đánh giá', text: 'Hãy phân tích ưu và nhược điểm, so sánh chi tiết giữa:' }
  ];

  function getCustomPrompts() {
    try {
      const stored = ls.getItem('jarvis_custom_prompts');
      return stored ? JSON.parse(stored) : DEFAULT_PROMPTS;
    } catch {
      return DEFAULT_PROMPTS;
    }
  }

  function saveCustomPrompts(list) {
    ls.setItem('jarvis_custom_prompts', JSON.stringify(list));
    renderSnippets();
    renderPromptList();
  }

  function renderSnippets() {
    const list = getCustomPrompts();
    const container = $('snippets-container');
    if (!container) return;
    container.innerHTML = list.map(p => `
      <div class="snippet-chip" onclick="if(typeof window.applySnippet==='function') window.applySnippet('${p.text.replace(/'/g, "\\'")}')">${p.title}</div>
    `).join('');
  }

  function renderPromptList() {
    const list = getCustomPrompts();
    const c = $('prompt-items-list');
    if (!c) return;
    c.innerHTML = list.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--input-bg);border-radius:var(--radius-sm);border:1px solid var(--border);">
        <div style="flex:1;overflow:hidden;margin-right:10px;">
          <strong style="font-size:0.82rem;color:var(--primary);">${p.title}</strong>
          <p style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;">${p.text}</p>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn" style="padding:4px 8px;font-size:0.72rem;" onclick="if(typeof window.applySnippet==='function') window.applySnippet('${p.text.replace(/'/g, "\\'")}'); if(typeof window.closeModals==='function') window.closeModals();">Dùng</button>
          <button class="btn danger" style="padding:4px 8px;font-size:0.72rem;" onclick="window.removeCustomPrompt('${p.id}')">Xóa</button>
        </div>
      </div>
    `).join('');
  }

  window.removeCustomPrompt = id => {
    const list = getCustomPrompts().filter(p => p.id !== id);
    saveCustomPrompts(list);
    showToast("Đã xóa prompt khỏi kho!");
  };

  function openPromptLibraryModal() {
    const modal = $('prompt-library-modal');
    const oLay = $('modal-overlay');
    if (modal) modal.style.display = 'flex';
    if (oLay) oLay.style.display = 'block';
    renderPromptList();
  }

  // --- COMMAND PALETTE (CTRL+K) ---
  const COMMANDS = [
    { id: 'quota', title: 'Xem hạn ngạch 10 Key (20 RPD cho Gemini 4 Hydrogen, 3.6 & 3.8)', shortcut: '/quota', icon: '🔑', run: () => (typeof window.openKeyQuotaModal === 'function') ? window.openKeyQuotaModal() : null },
    { id: 'cloud', title: 'Đồng bộ Cloud đa thiết bị (GitHub Gist)', shortcut: '/cloud', icon: '☁️', run: () => $('btn-open-cloud-sync')?.click() },
    { id: 'new', title: 'Tạo phiên hội thoại mới', shortcut: '/new', icon: '➕', run: () => (typeof window.newSess === 'function') ? window.newSess() : null },
    { id: 'brief', title: 'Bản tin Ngày Mới (Thời tiết, Tin tức AI/Tech, Kế hoạch)', shortcut: '/brief', icon: '🌅', run: () => (typeof window.openDailyBriefing === 'function') ? window.openDailyBriefing() : null },
    { id: 'voice', title: 'Trò chuyện Rảnh tay Liên tục (Hands-Free Voice Flow)', shortcut: '/voice', icon: '🎙️', run: () => (typeof window.toggleHandsFreeVoice === 'function') ? window.toggleHandsFreeVoice() : null },
    { id: 'live', title: 'Bắt đầu gọi Live AI Voice', shortcut: '/live', icon: '📞', run: () => (typeof window.startLiveVoiceCall === 'function') ? window.startLiveVoiceCall() : null },
    { id: 'tts', title: 'Mở Gemini TTS Studio Pro (Chuyển văn bản thành giọng nói, xuất MP3)', shortcut: '/tts', icon: '🎙️', run: () => (typeof window.openTTSStudioModal === 'function') ? window.openTTSStudioModal() : null },
    { id: 'settings', title: 'Mở Cài đặt hệ thống & 10 Keys', shortcut: '/settings', icon: '⚙️', run: () => $('btn-open-settings')?.click() },
    { id: 'storage', title: 'Quản lý Bộ nhớ & Trạng thái Lưu trữ (IndexedDB)', shortcut: '/storage', icon: '💾', run: () => { $('btn-open-settings')?.click(); setTimeout(() => { if (typeof window.updateStorageStatus === 'function') window.updateStorageStatus(); }, 150); } },
    { id: 'prompts', title: 'Mở Kho Prompt mẫu cá nhân', shortcut: '/prompts', icon: '📚', run: () => openPromptLibraryModal() },
    { id: 'rag', title: 'Mở Kho Tri Thức & RAG Studio (Gemini Embedding 2)', shortcut: '/rag', icon: '🧠', run: () => typeof window.openKnowledgeModal === 'function' ? window.openKnowledgeModal() : window.JarvisRAG?.openModal() },
    { id: 'memory', title: 'Quản lý Trí nhớ Cá nhân (Second Brain)', shortcut: '/memory', icon: '👤', run: () => typeof window.openKnowledgeModal === 'function' ? window.openKnowledgeModal('memory') : window.JarvisRAG?.openModal('memory') },
    { id: 'search', title: 'Tìm kiếm nội dung hội thoại', shortcut: '/search', icon: '🔍', run: () => { const m = $('search-modal'); if (m) m.style.display = 'flex'; const o = $('modal-overlay'); if (o) o.style.display = 'block'; } },
    { id: 'theme', title: 'Chuyển đổi giao diện Sáng / Tối', shortcut: '/theme', icon: '🌙', run: () => $('btn-theme')?.click() },
    { id: 'export', title: 'Sao lưu toàn bộ dữ liệu ra tệp JSON', shortcut: '/export', icon: '📥', run: () => (typeof window.exportAllSessions === 'function') ? window.exportAllSessions() : null },
    { id: 'clear', title: 'Xóa sạch tin nhắn phiên hiện tại', shortcut: '/clear', icon: '🗑️', run: () => (typeof window.clearActiveSession === 'function') ? window.clearActiveSession() : null },
    { id: 'library', title: 'Mở Thư viện tài liệu đã lưu', shortcut: '/library', icon: '🗄️', run: () => $('btn-file-library')?.click() }
  ];

  function openCommandPalette() {
    const cmdModal = $('command-palette-modal');
    const cmdInput = $('cmd-palette-input');
    const oLay = $('modal-overlay');
    if (!cmdModal) return;
    cmdModal.style.display = 'flex';
    if (oLay) oLay.style.display = 'block';
    if (cmdInput) {
      cmdInput.value = '';
      renderCommandItems('');
      setTimeout(() => cmdInput.focus(), 50);
    }
  }

  function closeCommandPalette() {
    const cmdModal = $('command-palette-modal');
    const oLay = $('modal-overlay');
    if (cmdModal) cmdModal.style.display = 'none';
    if (oLay) oLay.style.display = 'none';
  }

  function renderCommandItems(filterText) {
    const cmdList = $('cmd-palette-list');
    if (!cmdList) return;
    const q = filterText.toLowerCase().trim();
    const filtered = COMMANDS.filter(c => c.title.toLowerCase().includes(q) || c.shortcut.includes(q));
    cmdList.innerHTML = filtered.length ? filtered.map((c, i) => `
      <div class="cmd-item ${i === 0 ? 'selected' : ''}" data-cmd="${c.id}">
        <div class="cmd-item-left">
          <span>${c.icon}</span>
          <strong>${c.title}</strong>
        </div>
        <span class="cmd-badge">${c.shortcut}</span>
      </div>
    `).join('') : '<i style="color:var(--text-muted);padding:12px;text-align:center;">Không tìm thấy lệnh nào phù hợp.</i>';

    cmdList.querySelectorAll('.cmd-item').forEach(item => {
      item.onclick = () => {
        const cmdObj = COMMANDS.find(c => c.id === item.getAttribute('data-cmd'));
        closeCommandPalette();
        cmdObj?.run();
      };
    });
  }

  function executeChatSlashCommand(rawText) {
    const text = (rawText || '').trim();
    if (!text.startsWith('/')) return false;

    const parts = text.split(/\s+/);
    const cmdWord = parts[0].toLowerCase();

    // 1. Direct aliases
    if (cmdWord === '/quota' || cmdWord === '/key' || cmdWord === '/keys') {
      if (typeof window.openKeyQuotaModal === 'function') window.openKeyQuotaModal();
      return true;
    }
    if (cmdWord === '/brief' || cmdWord === '/briefing' || cmdWord === '/morning') {
      if (typeof window.openDailyBriefing === 'function') window.openDailyBriefing();
      return true;
    }
    if (cmdWord === '/voice' || cmdWord === '/handsfree' || cmdWord === '/ranhtay') {
      if (typeof window.toggleHandsFreeVoice === 'function') window.toggleHandsFreeVoice();
      return true;
    }
    if (cmdWord === '/brain' || cmdWord === '/mind') {
      if (window.JarvisRAG && typeof window.JarvisRAG.openModal === 'function') window.JarvisRAG.openModal('memory');
      return true;
    }
    if (cmdWord === '/help' || cmdWord === '/cmd' || cmdWord === '/commands') {
      openCommandPalette();
      return true;
    }
    if (cmdWord === '/sync') {
      $('btn-open-cloud-sync')?.click();
      return true;
    }

    // 2. Check COMMANDS array
    const matched = COMMANDS.find(c => c.shortcut.toLowerCase() === cmdWord);
    if (matched && typeof matched.run === 'function') {
      matched.run();
      return true;
    }

    // 3. Single-word command that is unknown -> show helpful warning & don't ask AI
    if (parts.length === 1) {
      showToast(`Không tìm thấy lệnh "${cmdWord}". Gõ /help hoặc nhấn Ctrl+K để xem danh sách lệnh!`, "warning");
      return true;
    }

    // 4. Multi-word prompt starting with slash -> pass through to AI
    return false;
  }

  function initCommandPaletteListeners() {
    const btnAddPrompt = $('btn-add-prompt-item');
    if (btnAddPrompt) {
      btnAddPrompt.onclick = () => {
        const titleInput = $('new-prompt-title');
        const textInput = $('new-prompt-text');
        const title = titleInput ? titleInput.value.trim() : '';
        const text = textInput ? textInput.value.trim() : '';
        if (!title || !text) return showToast("Vui lòng nhập cả Tiêu đề và Nội dung!", "warning");
        const list = getCustomPrompts();
        list.push({ id: 'p_' + Date.now(), title, text });
        saveCustomPrompts(list);
        if (titleInput) titleInput.value = '';
        if (textInput) textInput.value = '';
        showToast("🎉 Đã thêm vào Kho Prompt!");
      };
    }

    if ($('btn-manage-prompts')) {
      $('btn-manage-prompts').onclick = openPromptLibraryModal;
    }

    const cmdInput = $('cmd-palette-input');
    if (cmdInput) {
      cmdInput.oninput = e => renderCommandItems(e.target.value);
      cmdInput.onkeydown = e => {
        if (e.key === 'Escape') closeCommandPalette();
        if (e.key === 'Enter') {
          const first = $('cmd-palette-list')?.querySelector('.cmd-item');
          if (first) first.click();
        }
      };
    }

    const btnTrigger = $('btn-trigger-cmd');
    if (btnTrigger) btnTrigger.onclick = openCommandPalette;

    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const cmdModal = $('command-palette-modal');
        if (cmdModal && cmdModal.style.display === 'flex') closeCommandPalette();
        else openCommandPalette();
      }
      if (e.key === 'Escape') {
        closeModals();
      }
    });

    renderSnippets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommandPaletteListeners);
  } else {
    setTimeout(initCommandPaletteListeners, 100);
  }

  // Window exports
  window.COMMANDS = COMMANDS;
  window.openCommandPalette = openCommandPalette;
  window.closeCommandPalette = closeCommandPalette;
  window.openPromptLibraryModal = openPromptLibraryModal;
  window.executeChatSlashCommand = executeChatSlashCommand;
  window.renderSnippets = renderSnippets;
  window.renderPromptList = renderPromptList;

})();
