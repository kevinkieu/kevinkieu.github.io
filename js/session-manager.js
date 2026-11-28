// Phase 2 session-manager (extracted from app.js)
async function tryAutoNameSession(sessionObj, userText, botText, preferredKey = null) {
  if (!sessionObj) return;
  const normName = (sessionObj.name || '').normalize('NFC').trim();
  const isDefault = !normName || /^(hội thoại|phiên|cuộc trò chuyện|new session)/i.test(normName);
  if (!isDefault || sessionObj.isCustomNamed || sessionObj.isAutoNamed) return;

  const k = preferredKey || getSessionApiKey(sessionObj) || (apiKeys.length ? apiKeys[0] : '');
  if (!k) return;

  const promptUserPart = (userText || '').slice(0, 180).trim();
  const promptBotPart = (botText || '').slice(0, 180).trim();
  const promptText = `Tóm tắt chủ đề chính của câu hỏi người dùng thành một tiêu đề ngắn gọn súc tích từ 3 đến 6 từ bằng tiếng Việt (chỉ trả về đúng tiêu đề, không dùng dấu ngoặc kép, không thêm lời giải thích hay tiền tố):\nNgười dùng: "${promptUserPart}"\nAI: "${promptBotPart}"`;

  let title = '';

  // Cố gắng gọi AI: Bắt buộc dùng Flash-Lite với thinking tắt hoàn toàn để tiết kiệm quota
  const candidateModels = AUX_FALLBACK_MODELS;

  for (const mod of candidateModels) {
    if (!mod) continue;
    try {
      const ai = new GoogleGenAI({ apiKey: k });
      const res = await ai.models.generateContent({
        model: mod,
        contents: promptText,
        config: {
          safetySettings: SAFETY,
          maxOutputTokens: 100,
          temperature: 0.4,
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      });

      let raw = '';
      try {
        raw = res.text || '';
      } catch (_) {}
      if (!raw && res.candidates?.[0]?.content?.parts) {
        raw = res.candidates[0].content.parts
          .filter(p => !p.thought && typeof p.text === 'string')
          .map(p => p.text)
          .join(' ')
          .trim();
      }

      raw = raw
        .replace(/["“«»”*\n#:]/g, '')
        .replace(/^(tiêu đề|chủ đề|tóm tắt):\s*/i, '')
        .trim();

      if (raw && raw.length >= 2) {
        title = raw;
        break;
      }
    } catch (mErr) {
      console.warn(`[Auto-Name] Thử model ${mod} không thành công:`, mErr?.message || mErr);
    }
  }

  // Nếu tất cả AI models đều không trả về được, dùng Local Fallback từ câu hỏi đầu tiên
  if (!title || title.length < 2) {
    title = window.generateLocalFallbackTitle(userText);
  }

  if (title.length > 35) title = title.slice(0, 35).trim() + '...';

  if (title && title.length >= 2) {
    sessionObj.name = title;
    sessionObj.isAutoNamed = true;
    await saveToDB(sessionObj);
    renderSel();
    renderTabs();
    showToast(`🏷️ Đã tự động đặt tên: "${title}"`, 'info');
  }
}

// --- HIỂN THỊ BỘ NHỚ TÓM TẮT CỦA PHIÊN ĐANG MỞ ---
function renderCompactSummary() {
  const box = DOM.compactSummaryPreview;
  if (!box) return;
  const cs = sessions.find(x => x.id === activeId);
  const txt = (cs?.summaryMemory || '').trim();
  box.textContent = txt || 'Chưa có bộ nhớ tóm tắt cho phiên này.';
  box.style.fontStyle = txt ? 'normal' : 'italic';
  box.style.opacity = txt ? '1' : '0.7';
}

// --- AUTO-SUMMARY LONG-TERM MEMORY (NÉN LỊCH SỬ DÀI) ---
// force = true khi người dùng bấm nút nén thủ công (bỏ qua ngưỡng + checkbox)
async function condenseSessionMemory(sessionObj, force = false) {
  if (!sessionObj || !chatHistory || chatHistory.length < 4) return false;
  if (
    !force &&
    (chatHistory.length <= autoSummaryThreshold || DOM.toggleAutoSummary?.checked === false)
  )
    return false;
  const lastCond = sessionObj.lastCondensedLength || 0;
  if (!force && chatHistory.length - lastCond < 10) return false;

  const k = getSessionApiKey(sessionObj);
  if (!k) {
    if (force) showToast('⚠️ Cần Google API Key để nén ngữ cảnh!', 'warning');
    return false;
  }

  const keepRecent = Math.min(10, Math.max(2, chatHistory.length - 2));
  try {
    const toSummarize = chatHistory
      .slice(0, chatHistory.length - keepRecent)
      .map(
        m => `${m.role === 'model' ? 'AI' : 'User'}: ${stripThinkingForCopy(m.text).slice(0, 300)}`
      )
      .join('\n');
    const prevSummary = sessionObj.summaryMemory
      ? `[Bối cảnh cốt lõi trước đó]:\n${sessionObj.summaryMemory}\n\n[Diễn biến mới cần cập nhật]:\n`
      : '';
    const promptText = `Hãy cập nhật và cô đọng các thông tin quan trọng, ngữ cảnh và các quyết định cốt lõi trong đoạn hội thoại sau thành 1 đoạn ngắn gọn (khoảng 3-5 gạch đầu dòng):\n\n${prevSummary}${toSummarize}`;

    const ai = new GoogleGenAI({ apiKey: k });
    let res = null;
    for (const m of AUX_FALLBACK_MODELS) {
      try {
        res = await ai.models.generateContent({
          model: m,
          contents: promptText,
          config: {
            safetySettings: SAFETY,
            temperature: 0.3,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        });
        if (res && res.text) break;
      } catch (mErr) {
        console.warn(`[Auto-Summary] Model ${m} lỗi:`, mErr?.message || mErr);
      }
    }

    if (res && res.text) {
      sessionObj.summaryMemory = res.text.trim();
      sessionObj.lastCondensedLength = chatHistory.length;
      await saveToDB(sessionObj);
      console.log('[Auto-Summary] Đã nén trí nhớ dài hạn thành công:', sessionObj.summaryMemory);
      if (force) showToast('🗜️ Đã nén ngữ cảnh thành công!', 'success');
      renderCompactSummary();
      return true;
    }
    if (force) showToast('⚠️ Model không trả về nội dung tóm tắt.', 'warning');
    return false;
  } catch (e) {
    console.warn('Lỗi tóm tắt bộ nhớ dài:', e);
    if (force) showToast('⚠️ Lỗi khi nén ngữ cảnh: ' + (e?.message || e), 'danger');
    return false;
  }
}

function renderTabs() {
  DOM.tabsContainer.innerHTML = openTabs
    .map(tId => {
      const s = sessions.find(x => x.id === tId);
      const dot = s?.color ? `<span class="color-dot" style="background:${s.color};"></span>` : '';
      return s
        ? `<div class="tab-item ${tId === activeId ? 'active' : ''}" onclick="window.switchSess('${tId}')" title="${escapeHtml(s.name)}">
          ${dot}
          <span>${escapeHtml(s.name.substring(0, 16))}</span>
          <span class="tab-close" onclick="window.closeTab('${tId}', event)" title="Đóng tab">×</span>
        </div>`
        : '';
    })
    .join('');
  ls.setItem('jarvis_tabs', JSON.stringify(openTabs));
  requestAnimationFrame(() => {
    const activeTab = DOM.tabsContainer?.querySelector('.tab-item.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  });
}

if (typeof switchSess !== 'undefined') window.switchSess = switchSess;
window.closeTab = (id, e) => {
  e.stopPropagation();
  openTabs = openTabs.filter(x => x !== id);
  id === activeId ? (openTabs.length ? switchSess(openTabs[0]) : newSess()) : renderTabs();
};

function renderFolders() {
  // Folders system pruned for simplicity & performance
}

async function loadSess() {
  try {
    await initDB();
    let d = await getAllFromDB();
    if ((!d || d.length === 0) && window.JarvisNativeBridge) {
      try {
        const raw = window.JarvisNativeBridge.getItem('jarvis_sessions_backup');
        if (raw) {
          const nativeSessions = JSON.parse(raw);
          if (Array.isArray(nativeSessions) && nativeSessions.length > 0) {
            for (const s of nativeSessions) await saveToDB(s);
            d = await getAllFromDB();
          }
        }
      } catch (e) {
        console.warn('Khôi phục phiên từ native bridge lỗi:', e);
      }
    }
    if (d && d.length > 0) {
      sessions = d.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      try {
        renderFolders();
      } catch (_) {}
      try {
        if (typeof window.renderSnippets === 'function') window.renderSnippets();
      } catch (_) {}
      activeId =
        ls.getItem('jarvis_active_id') ||
        ls.getItem('huanmu_active_id') ||
        ls.getItem('javiss_active_id') ||
        sessions[0].id;
      if (!sessions.find(s => s.id === activeId)) activeId = sessions[0].id;
      await switchSess(activeId);
    } else {
      try {
        renderFolders();
      } catch (_) {}
      try {
        if (typeof window.renderSnippets === 'function') window.renderSnippets();
      } catch (_) {}
      await newSess();
    }
  } catch (e) {
    console.error('Lỗi khởi động loadSess:', e);
    try {
      renderFolders();
    } catch (_) {}
    try {
      if (typeof window.renderSnippets === 'function') window.renderSnippets();
    } catch (_) {}
  }
}

async function newSess(n) {
  const id = 's_' + Date.now(),
    s = {
      id,
      name: n || `Hội thoại ${sessions.length + 1}`,
      folder: 'Mặc định',
      his: [],
      sys: '',
      mod: 'gemini-4-hydrogen',
      engine: 'stream',
      lastInteractionId: null,
      assignedApiKey: null,
      keySel: 'auto',
      color: null,
      summaryMemory: '',
      lastCondensedLength: 0,
      tmp: 0.5,
      tpp: 0.9,
      top: 40,
      thk: 'minimal',
      thkMap: {},
      sch: false,
      schEngine: 'tavily',
      mem: true,
      rag: true,
      useGlob: true,
      updatedAt: Date.now(),
      orderIndex: 0,
    };
  sessions.forEach(sess => {
    if (typeof sess.orderIndex === 'number') sess.orderIndex++;
  });
  sessions.unshift(s);
  await saveToDB(s);
  await switchSess(id);
  showToast('➕ Đã tạo phiên mới!');
  if (window.innerWidth <= 768) {
    $('sidebar').classList.remove('active');
    $('sidebar-overlay').classList.remove('active');
  }
}

async function switchSess(id) {
  activeId = id;
  ls.setItem('jarvis_active_id', id);
  ls.setItem('huanmu_active_id', id);
  const s = sessions.find(x => x.id === id);
  chatHistory = s && Array.isArray(s.his) ? [...s.his] : [];

  if (s) {
    DOM.sysInst.value = s.sys || '';
    // Khôi phục model theo cả provider: model id có thể trùng giữa nhiều provider
    // (vd particle-ai/particle-1:free ở OpenRouter và Kilo), chỉ gán .value sẽ chọn
    // nhầm option đầu tiên.
    if (!window.DynamicProviders?.selectModelOption?.(s.mod, s.modProvider)) {
      DOM.model.value = s.mod || 'gemini-4-hydrogen';
    }
    DOM.engineSel.value = s.engine || 'stream';
    setGoogleKeySlot(s.keySel || 'auto');
    // Menu key dùng chung phải theo model của phiên vừa mở (không có sự kiện change)
    if (typeof window.renderKeyPoolMenu === 'function') window.renderKeyPoolMenu();
    DOM.temp.value = s.tmp || 0.5;
    DOM.tempVal.innerText = DOM.temp.value;
    DOM.topP.value = s.tpp || 0.9;
    DOM.toppVal.innerText = DOM.topP.value;
    DOM.topK.value = s.top || 40;
    if (DOM.topkVal) DOM.topkVal.innerText = DOM.topK.value;
    updateThinkingVisibility();
    // s.thk luôn tương ứng với s.mod; thkMap chỉ dùng khi chuyển model trong cùng phiên
    DOM.thinking.value = s.thk || (s.thkMap && s.mod ? s.thkMap[s.mod] : '') || 'minimal';
    // Nếu phiên cũ lưu mức thinking không còn tồn tại (vd 'none' của Flash Lite), rơi về mức hợp lệ đầu tiên
    if (!DOM.thinking.value) DOM.thinking.value = DOM.thinking.options[0]?.value || 'minimal';
    DOM.toggleGlob.checked = s.useGlob !== false;
    DOM.toggleSearch.checked = s.sch || false;
    DOM.searchEngineBox.style.display = s.sch ? 'block' : 'none';
    DOM.searchEngineSel.value = s.schEngine || 'tavily';
    const isMem = s.mem !== false;
    const isRag = s.rag !== false;
    DOM.toggleMemory.checked = isMem;
    if (DOM.sessionMemState) {
      DOM.sessionMemState.innerText = isMem ? 'BẬT' : 'TẮT';
      DOM.sessionMemState.style.color = isMem ? 'var(--success)' : 'var(--text-muted)';
    }
    if (DOM.toggleRagEmbedding) DOM.toggleRagEmbedding.checked = isRag;
    if (DOM.ragMemoryState) {
      DOM.ragMemoryState.innerText = isRag ? 'BẬT' : 'TẮT';
      DOM.ragMemoryState.style.color = isRag ? 'var(--success)' : 'var(--text-muted)';
    }
    if (window.JarvisRAG && typeof window.JarvisRAG.updateRagUI === 'function') {
      window.JarvisRAG.updateRagUI(isRag);
    }
    updateColorPickerUI();
  }

  DOM.chat.innerHTML = '';
  for (let j = 0; j < chatHistory.length; j++) {
    try {
      await appendMsg(
        chatHistory[j].role === 'model' ? 'bot' : 'user',
        chatHistory[j].text || '',
        j,
        true
      );
    } catch (err) {
      console.error('Lỗi vẽ tin nhắn ' + j, err);
    }
  }
  DOM.chat.scrollTop = DOM.chat.scrollHeight;
  if (window.JarvisPerf && !window.JarvisPerf.marks['first-render'])
    window.JarvisPerf.mark('first-render');
  renderPendingQueue();
  renderSel();
  if (!openTabs.includes(id)) openTabs.push(id);
  renderTabs();
}

// Lọc phiên theo từ khoá gõ ở ô tìm kiếm sidebar (tên phiên, model đã dùng, nội dung tin nhắn)
let _sessionFilter = '';
Object.defineProperty(window, 'sessionFilter', {
  get: () => _sessionFilter,
  set: v => {
    _sessionFilter = v;
  },
  configurable: true,
});
function sessionMatchesFilter(s, q) {
  if (!s) return false;
  if (
    String(s.name || '')
      .toLowerCase()
      .includes(q)
  )
    return true;
  return (s.his || []).some(m => {
    if (
      String(m.model || '')
        .toLowerCase()
        .includes(q)
    )
      return true;
    return String(m.text || '')
      .toLowerCase()
      .includes(q);
  });
}

function renderSel() {
  const q = _sessionFilter.trim().toLowerCase();
  let v = sessions;
  if (q) {
    const matched = sessions.filter(s => sessionMatchesFilter(s, q));
    // Luôn giữ phiên đang mở trong danh sách để ô select không bị trống
    const active = sessions.find(s => s.id === activeId);
    v = active && !matched.includes(active) ? [active, ...matched] : matched;
  }
  DOM.selSession.innerHTML = v.length
    ? v
        .map(s => {
          const dot = s.pinned ? '📌 ' : s.color ? '● ' : '';
          return `<option value="${escapeHtml(s.id)}" ${s.id === activeId ? 'selected' : ''}>${dot}${escapeHtml(s.name)}</option>`;
        })
        .join('')
    : '<option value="">(Không có phiên khớp)</option>';
  if (activeId) DOM.selSession.value = activeId;
  const curS = sessions.find(x => x.id === activeId);
  const kInfo =
    curS?.engine === 'interactions' && curS?.assignedApiKey
      ? ` • 🔒 Ghim Key ${apiKeys.indexOf(curS.assignedApiKey) + 1}`
      : '';
  $('session-msg-count').innerText = `${chatHistory.length} tin nhắn${kInfo}`;
  updateColorPickerUI();
}

if (typeof tryAutoNameSession !== 'undefined') window.tryAutoNameSession = tryAutoNameSession;
if (typeof renderCompactSummary !== 'undefined') window.renderCompactSummary = renderCompactSummary;
if (typeof condenseSessionMemory !== 'undefined')
  window.condenseSessionMemory = condenseSessionMemory;
if (typeof renderTabs !== 'undefined') window.renderTabs = renderTabs;
if (typeof renderFolders !== 'undefined') window.renderFolders = renderFolders;
if (typeof loadSess !== 'undefined') window.loadSess = loadSess;
if (typeof newSess !== 'undefined') window.newSess = newSess;
if (typeof switchSess !== 'undefined') window.switchSess = switchSess;
if (typeof sessionMatchesFilter !== 'undefined') window.sessionMatchesFilter = sessionMatchesFilter;
if (typeof renderSel !== 'undefined') window.renderSel = renderSel;
