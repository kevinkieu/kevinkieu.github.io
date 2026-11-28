// Phase 5 send pipeline (extracted from app.js)
const __initSendPipeline = () => {
  DOM.sendBtn.onclick = async () => {
    // bên dưới đã gọi bD?.remove() trước khi khối let ở cuối handler chạy -> TDZ.
    let bD;
    if (isProcessing) return abortController?.abort();
    const rawMsg = DOM.input.value.trim();
    if (rawMsg.startsWith('/') && executeChatSlashCommand(rawMsg)) {
      DOM.input.value = '';
      DOM.input.style.height = 'auto';
      ls.removeItem('jarvis_draft');
      updateTokenCount();
      return;
    }
    let am = DOM.model.value || 'gemini-3.6-flash';
    const msg = rawMsg;
    if (!msg && !filesData.length && !txtContent) return;
    document.querySelectorAll('.follow-up-container').forEach(el => el.remove());

    const cs = sessions.find(x => x.id === activeId);
    const currentEngine = cs?.engine || DOM.engineSel?.value || 'stream';

    // --- OFFLINE: không có mạng thì xếp tin nhắn vào hàng đợi và hiện ngay trong
    // khung chat (optimistic UI) thay vì báo lỗi rồi mất nội dung đã gõ. ---
    if (
      window.JarvisOfflineQueue &&
      !flushingOfflineQueue &&
      !window.JarvisOfflineQueue.isOnline()
    ) {
      if ((filesData || []).some(f => !/^text\//.test(f.type || ''))) {
        showToast(
          '📴 Đang ngoại tuyến — chỉ xếp hàng được tin nhắn văn bản, hãy bỏ ảnh/tệp đính kèm.',
          'warning'
        );
        return;
      }
      if (!msg) {
        showToast('📴 Đang ngoại tuyến — chưa có nội dung để xếp hàng.', 'warning');
        return;
      }
      const queuedItem = window.JarvisOfflineQueue.enqueue({
        sessionId: activeId,
        text: msg,
        txtContent,
        model: am,
        engine: currentEngine,
      });
      if (!queuedItem) {
        showToast('Hàng đợi ngoại tuyến đã đầy (20 tin) — hãy xoá bớt rồi thử lại.', 'danger');
        return;
      }
      appendMsg('user', msg, chatHistory.length, false);
      DOM.input.value = '';
      DOM.input.style.height = '38px';
      ls.removeItem('jarvis_draft');
      updateTokenCount();
      if (filesData.length) DOM.clearFilesBtn.click();
      renderPendingQueue();
      showToast('📴 Đã xếp hàng — tin sẽ tự gửi khi có mạng trở lại.', 'info');
      return;
    }
    // DEBUG: dấu vết lượt gửi (đọc bằng: copy(JSON.stringify(window.__jarvisTurnDebug)))
    window.__jarvisTurnDebug = {
      model: am,
      engine: currentEngine,
      startedAt: new Date().toISOString(),
      startedAtMs: performance.now(),
    };

    // --- ẢNH: mọi model đều được gửi kèm ảnh; nếu provider/nền tảng từ chối thì báo
    // toast theo đúng TÊN model đang chọn và gửi lại lượt đó không kèm ảnh. ---
    // Helper: lấy provider cho modelId — ưu tiên data-provider của option trong #model-select (optgroup),
    // fallback resolveCompatProvider
    const getModelProvider = modelId => {
      const mid = String(modelId || '').trim();
      // 1. Nếu là model ĐANG CHỌN trong dropdown: lấy đúng option đang được chọn.
      //    Model id có thể trùng giữa nhiều provider (vd particle-ai/particle-1:free
      //    ở OpenRouter và Kilo) — .find() theo value sẽ luôn lấy option đầu tiên.
      const selOpt = DOM.model?.options?.[DOM.model.selectedIndex];
      if (selOpt && String(selOpt.value).trim() === mid && selOpt.dataset?.provider)
        return selOpt.dataset.provider;
      // 2. Model không phải model đang chọn (tin nhắn cũ): tìm option theo value
      const opt = Array.from(DOM.model?.options || []).find(o => o.value === mid);
      if (opt?.dataset?.provider) return opt.dataset.provider;
      // 3. Fallback to resolveCompatProvider
      const cp = typeof resolveCompatProvider === 'function' ? resolveCompatProvider(mid) : null;
      if (cp?.provider) return cp.provider.id;
      // 4. Check Explabs
      const expModels = Array.isArray(window.EXPLABS_MODELS) ? window.EXPLABS_MODELS : [];
      if (expModels.includes(mid)) return 'explabs';
      return 'google';
    };

    const modelLabelOf = id => {
      const mid = String(id || '').trim();
      const providerId = getModelProvider(mid);
      // Try to get modelLabel from provider if available
      if (providerId && window.COMPAT_PROVIDERS?.[providerId]?.modelLabel) {
        try {
          return window.COMPAT_PROVIDERS[providerId].modelLabel(mid);
        } catch (_) {}
      }
      const opt = Array.from(DOM.model?.options || []).find(o => o.value === mid);
      return (opt?.text || mid || 'Model').trim();
    };
    // Chỉ bắt lỗi "model không nhận ảnh" (không bắt lỗi ảnh hỏng/quá lớn/mất mạng)
    const isImageRejection = msg => {
      const s = String(msg || '');
      if (!s) return false;
      return (
        /(does not|doesn't|do not|cannot|can't|unable to|not able to)\s+(process|support|accept|handle|read)\s+[^.\n]{0,30}(image|vision|visual|photo|picture)/i.test(
          s
        ) ||
        /(image|vision|visual|multimodal)[^.\n]{0,40}(not supported|is not supported|unsupported|not accepted|not allowed)/i.test(
          s
        ) ||
        /unsupported[_\s](media|modality|content[_\s]?type)/i.test(s) ||
        /(only|text-only)[^.\n]{0,30}(text|language)[^.\n]{0,30}(input|model|supported)/i.test(s)
      );
    };
    const notifyImagesUnsupported = label => {
      showToast(
        `⚠️ ${label} does not process images (không xử lý ảnh) — đã gửi lại không kèm ảnh.`,
        'warning'
      );
      console.warn('[Ảnh] Provider từ chối ảnh:', label);
    };

    let gKey = '';
    let keyIndexNum = 1;

    const manualSel = getGoogleKeySlot();
    if (manualSel !== 'auto') {
      const idx = parseInt(manualSel, 10) + 1;
      let manualKey = (
        ls.getItem(`jarvis_api_${idx}`) ||
        ls.getItem(`huanmu_api_${idx}`) ||
        ls.getItem(`javiss_api_${idx}`) ||
        ''
      ).trim();
      if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_'))
        manualKey = deobfuscateKey(manualKey);
      gKey = manualKey;
      keyIndexNum = idx;
      if (cs && currentEngine === 'interactions') {
        cs.assignedApiKey = gKey;
        await saveToDB(cs);
        renderSel();
        if (typeof scheduleAutoSync === 'function') {
          scheduleAutoSync(15000);
        }
      }
    } else if (currentEngine === 'interactions') {
      if (!cs?.assignedApiKey || !apiKeys.includes(cs.assignedApiKey)) {
        gKey = getSessionApiKey(cs, true);
        if (cs) {
          cs.assignedApiKey = gKey;
          await saveToDB(cs);
          renderSel();
        }
      } else {
        gKey = cs.assignedApiKey;
      }
      keyIndexNum = findSlotIndexForKey(gKey);
    } else {
      gKey = getSessionApiKey(cs, true);
      keyIndexNum = findSlotIndexForKey(gKey);
    }

    // Model Experiential Labs dùng bể 5 key riêng (xoay tua + đếm lượt).
    // Kiểm tra Explabs TRƯỚC và loại trừ khỏi nhánh compat, để thứ tự nhánh không
    // còn phụ thuộc vào việc ID có nằm trong COMPAT_PROVIDERS hay không.
    const usesExplabs = (window.EXPLABS_MODELS || []).includes(am);
    // Model từ gateway OpenAI-compatible (OpenRouter/NVIDIA/Cohere + dynamic providers) không dùng Google API Key
    const providerId = getModelProvider(am);
    const usesCompatGateway =
      !usesExplabs && providerId !== 'google' && !!window.COMPAT_PROVIDERS?.[providerId];
    if (usesCompatGateway) {
      const compatNow = window.COMPAT_PROVIDERS[providerId];
      // Generic key handling for ALL OpenAI-compatible providers (NVIDIA, Cohere, OpenRouter, dynamic)
      // Use provider's keyStorageMultiple() to get correct localStorage key names
      const keyStorageNames =
        typeof compatNow.keyStorageMultiple === 'function' ? compatNow.keyStorageMultiple() : [];
      const keyCount = keyStorageNames.length;

      const keyAtSlot = slot => {
        if (slot < 1 || slot > keyCount) return '';
        const keyName = keyStorageNames[slot - 1];
        let v = (ls.getItem(keyName) || '').trim();
        if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = deobfuscateKey(v);
        return v;
      };

      const slotOfKey = key => {
        const idx = keyStorageNames.indexOf(key);
        return idx >= 0 ? idx + 1 : 1;
      };

      // Read all keys for this provider
      const allKeys = keyStorageNames
        .map(name => {
          let v = (ls.getItem(name) || '').trim();
          if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = deobfuscateKey(v);
          return v;
        })
        .filter(Boolean);

      // Get selector element if exists (dynamic providers may not have UI selector)
      const selEl = $('' + compatNow.id + '-key-select');
      const sel = selEl ? selEl.value : 'auto';

      if (sel !== 'auto' && keyCount > 0) {
        // Manual slot selection: get key from that slot (sel is 0-based index)
        const slotIdx = parseInt(sel, 10);
        if (!isNaN(slotIdx) && slotIdx >= 0 && slotIdx < keyCount) {
          const picked = keyAtSlot(slotIdx + 1) || allKeys[0] || '';
          if (picked) {
            gKey = picked;
            keyIndexNum = slotOfKey(picked);
          }
        }
      } else if (allKeys.length) {
        // Auto round-robin through available keys
        const providerKeyIndexVar = compatNow.keyIndexVar || compatNow.id + 'KeyIndex';
        const providerKeyIndex =
          /** @type {any} */ (window[providerKeyIndexVar] || 0) % allKeys.length;
        gKey = allKeys[providerKeyIndex];
        /** @type {any} */ (window)[providerKeyIndexVar] = (providerKeyIndex + 1) % allKeys.length;
        keyIndexNum = slotOfKey(gKey);
      } else {
        // Fallback to legacy single key if exists
        const legacyKeyName = compatNow.keyStorage || 'jarvis_' + compatNow.id + '_api';
        gKey = (ls.getItem(legacyKeyName) || '').trim();
        if (gKey.startsWith('JVENC_') || gKey.startsWith('ENC_')) gKey = deobfuscateKey(gKey);
        keyIndexNum = 1;
      }

      if (!gKey) {
        if (bD) /** @type {any} */ (bD).remove();
        return showToast(
          'Vui lòng nhập API Key cho provider ' +
            (compatNow.label || compatNow.id) +
            ' trong Cài đặt (⚙️)!',
          'danger'
        );
      }

      // Record usage if function exists
      const recordFn =
        window['record' + compatNow.id.charAt(0).toUpperCase() + compatNow.id.slice(1) + 'Request'];
      if (typeof recordFn === 'function') recordFn(keyIndexNum, am);
    } else if (usesExplabs) {
      // Xoay tua 5 key Experiential Labs, đọc theo SỐ Ô (slot) để khớp bộ đếm
      const elKeyAtSlot = slot => {
        let v = (ls.getItem(`jarvis_explabs_api_${slot}`) || '').trim();
        if (v.startsWith('JVENC_') || v.startsWith('ENC_')) v = deobfuscateKey(v);
        return v;
      };
      const elSlotOfKey = key =>
        typeof window.findExplabsSlotIndexForKey === 'function'
          ? window.findExplabsSlotIndexForKey(key)
          : Math.max(1, (window.explabsKeys || []).indexOf(key) + 1);
      const elKeys =
        typeof window.explabsKeys !== 'undefined' && Array.isArray(window.explabsKeys)
          ? window.explabsKeys.filter(Boolean)
          : [];
      const elSelEl = $('explabs-key-select');
      const elSel = elSelEl ? elSelEl.value : 'auto';

      if (elSel !== 'auto') {
        // Chọn thủ công 1 ô: luôn lấy đúng key của ô đó
        const picked = elKeyAtSlot(parseInt(elSel, 10) + 1) || elKeys[0] || '';
        if (picked) {
          gKey = picked;
          keyIndexNum = elSlotOfKey(picked);
        }
      } else if (elKeys.length) {
        // Tự động xoay tua vòng tròn qua các ô có key
        const elIdx = (window.explabsKeyIndex || 0) % elKeys.length;
        gKey = elKeys[elIdx];
        window.explabsKeyIndex = (elIdx + 1) % elKeys.length;
        keyIndexNum = elSlotOfKey(gKey);
      } else {
        // Fallback về key đơn cũ (nếu 5 ô mới đều trống)
        gKey = (ls.getItem('explabs_api_key') || '').trim();
        if (gKey.startsWith('JVENC_') || gKey.startsWith('ENC_')) gKey = deobfuscateKey(gKey);
        keyIndexNum = 1;
      }
      if (!gKey) {
        if (bD) /** @type {any} */ (bD).remove();
        return showToast('Vui lòng nhập Experiential Labs API Key trong Cài đặt (⚙️)!', 'danger');
      }
      if (typeof window.recordExplabsRequest === 'function')
        window.recordExplabsRequest(keyIndexNum, am);
    } else {
      if (!gKey) return showToast('Cần ít nhất 1 Google API Key trong Cài đặt!', 'danger');
    }

    // Khóa Google dùng cho các tác vụ phụ trợ (Flash Lite): auto-name, follow-up, RAG learn,
    // trích xuất từ khóa tìm kiếm. Khi model chính là compat gateway (NVIDIA/Kilo/OpenRouter/
    // Cohere/dynamic) hoặc Explabs, gKey là key của provider đó -> KHÔNG dùng cho Gemini.
    // Phải lấy key Google riêng để tránh gọi Gemini bằng key sai -> fail im lặng.
    let auxGoogleKey = gKey;
    if (usesCompatGateway || usesExplabs) {
      auxGoogleKey =
        (typeof getSessionApiKey === 'function' ? getSessionApiKey(cs, true) : null) ||
        (Array.isArray(apiKeys) && apiKeys.length ? apiKeys[0] : '') ||
        '';
      if (auxGoogleKey && (auxGoogleKey.startsWith('JVENC_') || auxGoogleKey.startsWith('ENC_')))
        auxGoogleKey = deobfuscateKey(auxGoogleKey);
    }

    ls.removeItem('jarvis_draft');
    isProcessing = true;
    abortController = new AbortController();
    // Gateway OpenAI-compatible (OpenRouter) và Experiential Labs không dùng Google Key
    // nên không ghi quota Google - hai bên có bộ đếm riêng, ghi ở trên khi xoay key
    if (!usesCompatGateway && !usesExplabs) recordKeyRequest(keyIndexNum, am);

    DOM.sendBtn.innerHTML = `<span>Dừng</span> 🛑`;
    DOM.sendBtn.style.background = 'var(--danger)';

    // Model thật sự đã trả lời
    let effectiveModel = am;
    let finalResp = '',
      botTime = getNowTime24h(),
      dispText = msg || '📎 [Gửi tệp]',
      fP =
        (txtContent ? (msg ? msg + '\n\n' + txtContent : txtContent) : msg).trim() ||
        'Hãy phân tích nội dung này.';
    let recordedIxId = null;
    let streamFinishReason = null;
    let pS = false,
      lastErr = null;
    let ragMatches = [];
    const startTime = performance.now();

    // --- FAILOVER MODEL DỰ PHÒNG ---------------------------------------------
    // Provider hết quota / quá tải (429, 503) / không kết nối được thì tự chuyển
    // sang model kế tiếp (Gemini → Gemini Flash Lite, model gateway → Gemini Flash
    // Lite) thay vì bỏ cả lượt. Logic chuỗi/ngân sách nằm ở js/failover.js.
    // forceStreamEngine: khi đã đổi model thì bỏ qua Interactions API cho lượt này,
    // tránh gửi previous_interaction_id của model cũ sang model mới.
    let forceStreamEngine = false;
    const failoverState = window.JarvisFailover?.createState
      ? window.JarvisFailover.createState(am)
      : { startedAt: Date.now(), budgetMs: 22000, tried: new Set([am]) };

    // Badge nhỏ trên header tin nhắn khi app tự đổi model (dùng cho mọi nhánh gửi).
    const showTurnModelBadge = (model, tone, title) => {
      const tones = {
        amber: ['#f59e0b', 'rgba(245,158,11,.15)', 'rgba(245,158,11,.4)', '🔁'],
        sky: ['#38bdf8', 'rgba(56,189,248,.15)', 'rgba(56,189,248,.4)', '⚡'],
      };
      const [color, bg, border, icon] = tones[tone] || tones.amber;
      try {
        const header = bD?.querySelector('.message-header');
        if (!header || header.querySelector('.model-fallback-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'model-fallback-badge';
        badge.style.cssText = `font-size:.68rem;font-weight:700;padding:2px 6px;border-radius:6px;background:${bg};color:${color};border:1px solid ${border};margin-left:6px;white-space:nowrap;`;
        badge.title = title;
        badge.innerText = icon + ' ' + model;
        header.appendChild(badge);
      } catch (_) {}
    };

    // Chuyển sang model dự phòng kế tiếp nếu lỗi thuộc dạng tạm thời và còn ngân sách.
    // Trả true khi đã đổi model (luồng gửi tiếp tục với model mới).
    const switchToFailoverModel = (status, message, tone = 'amber') => {
      const api = window.JarvisFailover;
      if (!api || typeof api.nextTarget !== 'function') return false;
      if (abortController?.signal?.aborted) return false;
      if (!api.isFailoverable(status, message)) return false;
      if (!api.withinBudget(failoverState)) {
        console.warn('[Failover] Hết ngân sách chờ, giữ nguyên model hiện tại.');
        return false;
      }
      const next = api.nextTarget(am, failoverState.tried);
      if (!next) return false;
      // Chuyển sang Gemini chỉ khả thi khi còn key Google dùng được.
      const googleKey =
        (cs?.assignedApiKey && apiKeys.includes(cs.assignedApiKey) && cs.assignedApiKey) ||
        getSessionApiKey(cs, false) ||
        apiKeys[0] ||
        '';
      if (!googleKey) {
        console.warn('[Failover] Không có Google API Key để chuyển sang', next);
        return false;
      }
      const fromLabel = modelLabelOf(am);
      failoverState.tried.add(next);
      am = next;
      effectiveModel = next;
      gKey = googleKey;
      keyIndexNum = findSlotIndexForKey(gKey);
      forceStreamEngine = true;
      // Dựng lại nhãn chờ (các nhánh gateway/Explabs đã gỡ .typing-bubble của họ)
      const failoverHeader = bD?.querySelector('.message-header');
      if (failoverHeader && !failoverHeader.querySelector('.typing-bubble')) {
        const tb = document.createElement('div');
        tb.className = 'typing-bubble';
        tb.innerHTML =
          '<span class="wait-label">⏳ Đang chờ Google…</span>' +
          '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
        failoverHeader.appendChild(tb);
      }
      const waitLabel = bD?.querySelector('.wait-label');
      if (waitLabel) waitLabel.textContent = '⏳ Đang chờ Google…';
      showTurnModelBadge(
        next,
        tone,
        `Đã tự chuyển sang ${modelLabelOf(next)} vì: ${message || status}`
      );
      showToast(
        `🔁 ${fromLabel} lỗi (${status ? 'HTTP ' + status : 'kết nối'}) — tự chuyển sang ${modelLabelOf(next)}`,
        'warning'
      );
      console.warn('[Failover]', fromLabel, '->', next, '| lý do:', status, message);
      return true;
    };

    const saveTurn = async (suffix = '') => {
      if (!finalResp.trim()) return bD?.remove();
      chatHistory.push(
        { role: 'user', text: fP },
        {
          role: 'model',
          text: finalResp,
          time: botTime,
          interactionId: recordedIxId,
          keyIndex: keyIndexNum,
          model: effectiveModel,
          pinnedKey: keyIndexNum,
        }
      );

      if (cs) {
        cs.his = chatHistory;
        cs.updatedAt = Date.now();
        if (recordedIxId) cs.lastInteractionId = recordedIxId;
        await saveToDB(cs);
        renderSel();
      }

      if (bD?.querySelector('.bot-message')) {
        bD.querySelector('.bot-message').setAttribute('data-raw', finalResp);
        const ixBadge = recordedIxId
          ? `<span class="interaction-id-badge" title="ID: ${recordedIxId}">⚡ ID: ${recordedIxId.slice(0, 8)}... [🔒 Key ${keyIndexNum}]</span>`
          : '';
        let ragBadge = '';
        if (ragMatches && ragMatches.length > 0) {
          const topMatch = ragMatches[0];
          const topPct = Math.round(topMatch.similarity * 100);
          const topTitle = topMatch.item?.title || topMatch.item?.docName || 'Tri thức';
          const payload = encodeURIComponent(
            JSON.stringify(
              ragMatches.map(m => ({
                title: m.item?.title || m.item?.docName || 'Tri thức',
                type: m.item?.type || 'memory',
                similarity: m.similarity,
                text: m.item?.text || '',
              }))
            )
          );
          ragBadge = `<span class="rag-status-badge" onclick="window.JarvisRAG.showRetrievedDetails('${payload}')" title="Trích xuất từ: ${escapeHtml(topTitle)} (${topPct}% khớp). Bấm để xem chi tiết!">🧠 Trí nhớ RAG (${ragMatches.length} mục · ${topPct}%)</span>`;
        }
        const keyBadge = getKeyBadgeHtml(keyIndexNum, am);
        bD.querySelector('.message-header').innerHTML =
          `<span>✨ Jarvis AI</span><span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}${suffix}</span>${keyBadge}${ixBadge}${ragBadge}`;
        const currentBotIdx = chatHistory.length - 1,
          aDiv = document.createElement('div');
        aDiv.className = 'msg-actions';
        const continueBtn =
          streamFinishReason === 'MAX_TOKENS' || (lastErr && pS)
            ? `<button class="action-btn" style="color:var(--primary);font-weight:600;" onclick="continueMsg()" title="Yêu cầu AI viết tiếp phần còn lại">▶️ Viết tiếp</button>`
            : '';
        aDiv.innerHTML = `
            ${continueBtn}
            <button class="action-btn" onclick="copy(this)">📋 Copy</button>
            <button class="action-btn" onclick="togglePinMsg(${currentBotIdx})" title="Ghim tin nhắn">📌 Ghim</button>
            <button class="action-btn" onclick="forkSessionAt(${currentBotIdx})">🌿 Rẽ nhánh</button>
            <button class="action-btn tts-btn" onclick="toggleSpeakMsg(this, ${currentBotIdx})" title="Đọc to bằng giọng nói">🔊 Nghe</button>
            <button class="action-btn" onclick="openMsgInTTSStudio(this, ${currentBotIdx})" title="Chuyển nội dung vào Gemini TTS Studio">🎙️ Studio</button>
            <button class="action-btn" onclick="retryMsg(${currentBotIdx})">🔄 Thử lại</button>
            <button class="action-btn" style="color:var(--danger);" onclick="deleteMsg(${currentBotIdx})">🗑️ Xóa</button>
          `;
        bD.appendChild(aDiv);

        // SMART FOLLOW-UP CHIPS
        setTimeout(() => generateFollowUpSuggestions(fP, finalResp, bD), 500);
      }

      // AUTO-NAME SESSION NẾU PHIÊN CHƯA ĐẶT TÊN
      if (cs && chatHistory.length >= 2) {
        const normName = (cs.name || '').normalize('NFC').trim();
        const isDefaultSessName =
          !normName || /^(hội thoại|phiên|cuộc trò chuyện|new session)/i.test(normName);
        if (isDefaultSessName && !cs.isCustomNamed) {
          setTimeout(() => tryAutoNameSession(cs, fP, finalResp, auxGoogleKey), 200);
        }
      }

      // AUTO-SUMMARY BỘ NHỚ DÀI HẠN
      if (chatHistory.length > autoSummaryThreshold && cs) {
        condenseSessionMemory(cs);
      }

      // CHATGPT-STYLE AUTO-LEARN MEMORY (Chỉ kích hoạt khi phiên này đang BẬT Trí nhớ RAG)
      const isRagSessionForLearn = cs
        ? cs.rag !== false
        : DOM.toggleRagEmbedding
          ? DOM.toggleRagEmbedding.checked
          : true;
      if (
        isRagSessionForLearn &&
        fP &&
        fP.length >= 8 &&
        window.JarvisRAG &&
        typeof window.JarvisRAG.extractAndLearnMemory === 'function'
      ) {
        setTimeout(() => window.JarvisRAG.extractAndLearnMemory(fP, auxGoogleKey), 400);
      }

      // TỰ ĐỘNG ĐỒNG BỘ NGẦM LÊN CLOUD SAU KHI CHAT XONG (DEBOUNCE 10 GIÂY)
      if (typeof scheduleAutoSync === 'function') {
        scheduleAutoSync(10000);
      }
    };

    try {
      await appendMsg(
        'user',
        dispText + (filesData.length ? ` [${filesData.length} tệp]` : ''),
        chatHistory.length,
        false
      );
      DOM.input.value = '';
      DOM.input.style.height = '38px';
      updateTokenCount();
      const imgs = [...filesData];
      DOM.clearFilesBtn.click();

      // TYPING INDICATOR BUBBLE
      const currentKeyBadge = getKeyBadgeHtml(keyIndexNum, am);
      // Nhãn chờ: hiện ngay khi gửi, tự biến mất cùng .typing-bubble khi có chunk đầu tiên.
      // Google thường giữ kết nối 5–17s trước byte đầu nên cần chỉ báo để không tưởng app treo.
      const waitProviderLabel = usesExplabs
        ? 'Experiential Labs'
        : usesCompatGateway
          ? window.COMPAT_PROVIDERS?.[providerId]?.label || providerId
          : 'Google';
      bD = document.createElement('div');
      bD.className = 'message-container';
      bD.innerHTML = `
          <div class="bot-message">
            <div class="message-header">
              <span>✨ Jarvis AI</span>
              <span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">🕒 ${botTime}</span>
              ${currentKeyBadge}
              <div class="typing-bubble">
                <span class="wait-label">⏳ Đang chờ ${waitProviderLabel}…</span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
            </div>
            <div class="msg-content"></div>
          </div>
        `;
      DOM.chat.appendChild(bD);
      bD.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const cD = bD.querySelector('.msg-content');
      const renderer = createStreamRenderer(cD);
      let fnP = fP;

      let rawMatch = fnP.match(/https?:\/\/[^\s]+/)?.[0];
      const uMatch = rawMatch ? rawMatch.replace(/[.,!?;:)\]]+$/, '') : null;
      if (uMatch && ls.getItem('jarvis_url_scrape_enabled') === 'true') {
        const isYt = uMatch.includes('youtube.com') || uMatch.includes('youtu.be');
        let urlBadge = null;
        const msgHdr = bD?.querySelector('.message-header');
        if (msgHdr) {
          urlBadge = document.createElement('span');
          urlBadge.className = 'search-status-badge';
          urlBadge.style.cssText =
            'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
          urlBadge.innerHTML = isYt
            ? `📺 Đang bóc tách video YouTube...`
            : `🌐 Đang bóc tách liên kết...`;
          msgHdr.appendChild(urlBadge);
        }
        try {
          if (isYt) {
            const yt = await extractYouTubeContent(uMatch);
            if (urlBadge) {
              urlBadge.innerHTML = `📺 Video: <em>"${escapeHtml(yt.title.substring(0, 26))}..."</em>`;
            }
            fnP = `[THÔNG TIN VIDEO YOUTUBE ĐÃ BÓC TÁCH]:\n- Tiêu đề video: "${yt.title}"\n- Kênh sản xuất: ${yt.author}\n- Link gốc: ${uMatch}\n${yt.content ? yt.content + '\n' : ''}\n[YÊU CẦU CỦA NGƯỜI DÙNG ĐỐI VỚI VIDEO NÀY]:\n${fnP}\n\n(CHỈ DẪN QUAN TRỌNG: Bạn ĐÃ CÓ thông tin tiêu đề, kênh phát hành và ngữ cảnh video YouTube ở trên. Hãy giải thích, tóm tắt và phân tích nội dung, ý nghĩa của video một cách chi tiết, chuyên nghiệp, thông minh và thân thiện theo phong cách Jarvis AI. Tuyệt đối KHÔNG từ chối hoặc trả lời là "hệ thống không thể xem/mở video YouTube")`;
          } else {
            const ext = await extractWebPageContent(uMatch);
            if (urlBadge) {
              urlBadge.innerHTML = `🌐 Nguồn: <em>${escapeHtml(ext.source)}</em>`;
            }
            fnP = `[NỘI DUNG TỪ ${uMatch} QUA ${ext.source}]:\n${ext.content}\n\n[YÊU CẦU]:\n${fnP}`;
          }
        } catch (e) {
          if (urlBadge) urlBadge.remove();
        }
      }
      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // WEB SEARCH (TAVILY / SERPER)
      // 1) Ưu tiên từ khóa bọc trong #...# (cách cũ, không gọi LLM).
      let searchKw = extractHashKeywords(fnP);
      // 2) Nhánh mới: nếu search đang bật và input chứa chữ "tìm kiếm" (không có #kw#),
      //    dùng Gemini 3.5 Flash Lite để trích xuất từ khóa từ toàn bộ input.
      if (!searchKw && DOM.toggleSearch.checked && /tìm\s*kiếm/i.test(msg)) {
        let extractBadge = null;
        const msgHdr0 = bD?.querySelector('.message-header');
        if (msgHdr0) {
          extractBadge = document.createElement('span');
          extractBadge.className = 'search-status-badge';
          extractBadge.style.cssText =
            'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(139,92,246,0.15);color:#8b5cf6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
          extractBadge.innerHTML = `🔍 Đang trích xuất từ khóa...`;
          msgHdr0.appendChild(extractBadge);
        }
        try {
          const kw = await window.extractSearchKeywords(msg, auxGoogleKey);
          if (kw) {
            searchKw = kw;
            if (extractBadge) {
              extractBadge.style.background = 'rgba(16,185,129,0.15)';
              extractBadge.style.color = '#10b981';
              extractBadge.innerHTML = `✓ Từ khóa: <em>"${escapeHtml(kw)}"</em>`;
              setTimeout(() => {
                if (extractBadge) extractBadge.remove();
              }, 4000);
            }
          } else if (extractBadge) {
            extractBadge.remove();
          }
        } catch (e) {
          console.warn('extractSearchKeywords error:', e);
          if (extractBadge) extractBadge.remove();
        }
      }
      if (searchKw && DOM.toggleSearch.checked) {
        const tgt = DOM.searchEngineSel.value === 'serper' ? 'serper' : 'tavily';

        let actualSearchQuery = searchKw;
        const now = new Date();
        const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
        if (
          /(^|\s)(hôm nay|mới nhất|hôm qua)(\s|$)/i.test(searchKw) &&
          !searchKw.includes(String(now.getFullYear()))
        ) {
          actualSearchQuery = `${searchKw} ${dateStr}`;
        }

        let searchBadge = null;
        const msgHdr = bD?.querySelector('.message-header');
        if (msgHdr) {
          searchBadge = document.createElement('span');
          searchBadge.className = 'search-status-badge';
          searchBadge.style.cssText =
            'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(59,130,246,0.15);color:#3b82f6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:8px;';
          searchBadge.innerHTML = `🌐 Đang tìm kiếm (${tgt}): <em>"${escapeHtml(searchKw)}"</em>...`;
          msgHdr.appendChild(searchBadge);
        }

        let sText = '';
        const primaryFn = tgt === 'serper' ? fetchSerperSearch : fetchTavilySearch;
        const fallbackFn = tgt === 'serper' ? fetchTavilySearch : fetchSerperSearch;

        try {
          sText = await primaryFn(actualSearchQuery);
        } catch (sErr) {
          console.warn(`Lỗi tìm kiếm ${tgt}:`, sErr);
          showToast(
            `⚠️ Lỗi ${tgt}: ${sErr.message || 'Không kết nối được'}. Thử fallback...`,
            'warning'
          );
          try {
            if (searchBadge) searchBadge.innerHTML = `🌐 Đang thử fallback...`;
            sText = await fallbackFn(actualSearchQuery);
          } catch (fbErr) {
            console.warn('Fallback search cũng lỗi:', fbErr);
            showToast(`❌ Không thể tìm kiếm web: ${fbErr.message || sErr.message}`, 'danger');
          }
        }

        if (sText) {
          if (searchBadge) {
            searchBadge.style.background = 'rgba(16,185,129,0.15)';
            searchBadge.style.color = '#10b981';
            searchBadge.innerHTML = `✓ Đã cập nhật Web: "${escapeHtml(searchKw)}"`;
            setTimeout(() => {
              if (searchBadge) searchBadge.remove();
            }, 5000);
          }
          fnP = `[DỮ LIỆU TÌM ĐƯỢC TỪ INTERNET CHO TỪ KHÓA "${searchKw}"]:\n${sText}\n\n[HÃY TỔNG HỢP THÔNG TIN TÌM ĐƯỢC Ở TRÊN ĐỂ TRẢ LỜI CÂU HỎI SAU]:\n${fnP}`;
        } else if (searchBadge) {
          searchBadge.style.background = 'rgba(239,68,68,0.15)';
          searchBadge.style.color = '#ef4444';
          searchBadge.innerHTML = `⚠️ Không lấy được dữ liệu web`;
          setTimeout(() => {
            if (searchBadge) searchBadge.remove();
          }, 4000);
        }
      }
      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // RAG / SECOND BRAIN CONTEXT RETRIEVAL (Gemini Embedding 2 - Chỉ kích hoạt khi phiên này đang BẬT Trí nhớ RAG)
      let ragSnippet = '';
      const isRagSessionForQuery = cs
        ? cs.rag !== false
        : DOM.toggleRagEmbedding
          ? DOM.toggleRagEmbedding.checked
          : true;
      // rag.js nạp theo nhu cầu (js/module-loader.js): bảo đảm có module trước khi truy vấn
      if (isRagSessionForQuery && !window.JarvisRAG && typeof window.ensureModule === 'function') {
        try {
          await window.ensureModule('rag');
        } catch (_) {}
      }
      if (
        isRagSessionForQuery &&
        window.JarvisRAG &&
        typeof window.JarvisRAG.retrieveContext === 'function'
      ) {
        try {
          const ragRes = await window.JarvisRAG.retrieveContext(fP, gKey);
          if (typeof ragRes === 'string') {
            ragSnippet = ragRes;
          } else if (ragRes) {
            ragSnippet = ragRes.text || '';
            ragMatches = ragRes.matches || [];
          }
        } catch (rErr) {
          console.warn('[RAG] Lỗi truy vấn ngữ cảnh:', rErr);
        }
      }

      // BẮT BUỘC TIÊM TRÍ NHỚ RAG TRỰC TIẾP VÀO PROMPT ĐỂ ĐẢM BẢO MODEL LUÔN NHÌN THẤY VÀ ƯU TIÊN TUYỆT ĐỐI
      if (ragSnippet) {
        fnP = `${ragSnippet}\n\n[CÂU HỎI CỦA NGƯỜI DÙNG]:\n${fnP}`;
        if (ragMatches && ragMatches.length > 0) {
          const msgHdr = bD?.querySelector('.message-header');
          if (msgHdr && !msgHdr.querySelector('.rag-live-badge')) {
            const liveBadge = document.createElement('span');
            liveBadge.className = 'rag-live-badge';
            liveBadge.style.cssText =
              'font-size:0.75rem;padding:2px 8px;border-radius:12px;background:rgba(139,92,246,0.15);color:#8b5cf6;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-left:6px;';
            liveBadge.innerHTML = `🧠 Đã nạp ${ragMatches.length} mục tri thức (${Math.round(ragMatches[0].similarity * 100)}%)`;
            msgHdr.appendChild(liveBadge);
          }
        }
      }

      const base64Files = [];
      for (const f of imgs) base64Files.push(await fileToBase64(f));

      // KHÔNG chèn mốc thời gian vào tin nhắn người dùng nữa: model hay lặp lại nguyên câu
      // "[Mốc thời gian gửi tin: ...]" / "[Timestamp sent: ...]" ở đầu câu trả lời. Mốc thời
      // gian hiện tại đã nằm trong system instruction (getDynamicSI → timeInstruction).
      const promptWithTime = fnP || '[Người dùng gửi tệp đính kèm]';

      const currentParts = /** @type {any[]} */ ([{ text: promptWithTime }]);
      base64Files.forEach(({ mimeType, data }) => {
        currentParts.push({ inlineData: { mimeType, data } });
      });

      // Có ít nhất 1 ảnh trong lượt này? (dùng chung cho mọi nhánh model)
      const hasImageFiles = base64Files.some(f => String(f.mimeType || '').startsWith('image/'));

      const interactionInput = [];
      if (fnP) interactionInput.push({ type: 'text', text: promptWithTime });
      base64Files.forEach(({ mimeType, data }) => {
        // Interactions API chỉ nhận type 'image' cho ảnh thật (video/audio không gửi kiểu này)
        if (String(mimeType || '').startsWith('image/')) {
          interactionInput.push({ type: 'image', data, mime_type: mimeType });
        }
      });

      const thk = DOM.thinking.value;

      // --- ENGINE 0: EXPERIENTIAL LABS GATEWAY ---
      const isExplabsModel = usesExplabs;
      if (isExplabsModel) {
        let expKey = gKey;
        if (!expKey) {
          expKey = (ls.getItem('explabs_api_key') || '').trim();
          if (expKey.startsWith('JVENC_') || expKey.startsWith('ENC_'))
            expKey = deobfuscateKey(expKey);
        }
        if (!expKey) {
          bD.remove();
          showToast('Vui lòng nhập Experiential Labs API Key trong Cài đặt (⚙️)!', 'danger');
          return;
        }

        bD.querySelector('.typing-bubble')?.remove();

        if (am === 'clef') {
          // Clef is Cloudflare Decision Model on /v1/systemone
          try {
            const res = await fetch('https://api.experientiallabs.ai/v1/systemone', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + expKey,
              },
              body: JSON.stringify({
                model: 'clef',
                state: fnP,
                questions: {
                  analysis: {
                    type: 'choice',
                    instructions: 'Đánh giá trạng thái hoặc câu hỏi của người dùng',
                    criteria: {
                      positive_or_valid: 'Nội dung tích cực, hợp lệ hoặc yêu cầu xử lý bình thường',
                      negative_or_alert:
                        'Nội dung cảnh báo, sự cố, cần can thiệp khẩn cấp hoặc câu hỏi tiêu cực',
                    },
                  },
                },
              }),
              signal: abortController.signal,
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData?.error?.message || 'HTTP ' + res.status);
            }

            const data = await res.json();
            const ans = data?.answers?.analysis;
            finalResp =
              '### 🎯 Kết quả Quyết định từ Mô hình Clef (Decision Engine)\n' +
              '- **Quyết định (Choice):** `' +
              (ans?.choice || 'N/A') +
              '`\n' +
              '- **Độ tin cậy (Confidence):** `' +
              (ans?.confidence ? Math.round(ans.confidence * 100) + '%' : 'N/A') +
              '`\n' +
              '- **Xác suất phân bổ (Probabilities):**\n' +
              '```json\n' +
              JSON.stringify(ans?.probabilities || {}, null, 2) +
              '\n' +
              '```\n' +
              '- **Token đã dùng:** `' +
              (data?.usage?.input_tokens || 0) +
              '` input tokens (Provider: `' +
              (data?.provider || 'experiential_cloud') +
              '`)';

            await renderer.flush(finalResp);
            pS = true;
            if ($('latency-val'))
              $('latency-val').innerText = String(Math.round(performance.now() - startTime));
          } catch (clefErr) {
            if (clefErr.name === 'AbortError' || abortController.signal.aborted) throw clefErr;
            lastErr = clefErr;
            finalResp = `*(⚠️ Lỗi Experiential Labs [Clef]: ${clefErr.message})*`;
            await renderer.flush(finalResp);
            pS = true;
          }
        } else {
          // Conversational Models (gpt-6-luna, deepseek-v4.1-flash) on /v1/chat/completions (SSE Stream)
          try {
            const expMessages = [];
            const dynamicSI = getDynamicSI(ragSnippet);
            if (dynamicSI) {
              expMessages.push({ role: 'system', content: dynamicSI });
            }
            if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
              chatHistory.slice(-10).forEach(m => {
                // Chỉ gửi phần trả lời, bỏ khối 💭 đã render (dữ liệu lưu vẫn nguyên)
                const txt = stripThinkingForCopy(m.text);
                if (txt)
                  expMessages.push({
                    role: m.role === 'model' ? 'assistant' : 'user',
                    content: txt,
                  });
              });
            }
            // Ảnh LUÔN được gửi cho mọi model Explabs; model từ chối thì gửi lại không kèm ảnh.
            const expUserContent = withImages => {
              if (!hasImageFiles) return promptWithTime;
              const parts = /** @type {any[]} */ ([{ type: 'text', text: promptWithTime }]);
              if (withImages) {
                for (const f of base64Files) {
                  if (String(f.mimeType || '').startsWith('image/')) {
                    parts.push({
                      type: 'image_url',
                      image_url: { url: `data:${f.mimeType};base64,${f.data}` },
                    });
                  }
                }
              }
              return parts;
            };
            let expWithImages = hasImageFiles;
            expMessages.push({ role: 'user', content: expUserContent(expWithImages) });

            // reasoning_effort cho các model Experiential Labs hỗ trợ (Qwen4 Max, GPT-6 Luna, DeepSeek V4.1 Flash)
            // Think Depth minimal -> none (tắt), low/medium/high giữ nguyên
            const expReasoningMap = { minimal: 'none', low: 'low', medium: 'medium', high: 'high' };
            const expLevel = expReasoningMap[DOM.thinking?.value] || 'low';
            const supportsReasoningEffort =
              am === 'qwen4-max:free' || am === 'gpt-6-luna' || am === 'deepseek-v4.1-flash';
            const sendExp = () =>
              fetch('https://api.experientiallabs.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + expKey,
                },
                body: JSON.stringify(
                  Object.assign(
                    {
                      model: am,
                      messages: expMessages,
                      stream: true,
                      max_tokens: 4096,
                    },
                    supportsReasoningEffort ? { reasoning_effort: expLevel } : {}
                  )
                ),
                signal: abortController.signal,
              });

            let expRes = await sendExp();
            if (!expRes.ok) {
              const errData = await expRes.json().catch(() => ({}));
              const expErrMsg = errData?.error?.message || 'HTTP ' + expRes.status;
              // Model không xử lý ảnh: báo toast theo tên model, gửi lại đúng lượt này không kèm ảnh
              if (expWithImages && isImageRejection(expErrMsg)) {
                expWithImages = false;
                expMessages[expMessages.length - 1].content = expUserContent(false);
                notifyImagesUnsupported(modelLabelOf(am));
                expRes = await sendExp();
              }
              if (!expRes.ok) {
                const errData2 = await expRes.json().catch(() => ({}));
                throw new Error(errData2?.error?.message || expErrMsg);
              }
            }

            const reader = expRes.body.getReader();
            const decoder = new TextDecoder();
            let sseDone = false;
            let sseBuffer = '';
            let currentThinking = '';
            let currentContent = '';
            // Đo cách server chia chunk (Qwen vs DeepSeek)
            let expEvents = 0,
              expThinkEvents = 0,
              expTextEvents = 0,
              firstThinkMs = 0,
              firstTextMs = 0;
            const expModelName =
              am === 'gpt-6-luna'
                ? 'GPT-6 Luna'
                : am === 'gpt-6.2-astra:free'
                  ? 'GPT-6.2 Astra'
                  : am.includes('qwen')
                    ? 'Qwen4 Max'
                    : am.includes('deepseek')
                      ? 'DeepSeek'
                      : 'AI';

            while (!sseDone) {
              const { value, done: streamDone } = await reader.read();
              if (streamDone) break;
              sseBuffer += decoder.decode(value, { stream: true });

              const lines = sseBuffer.split('\n');
              sseBuffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data:')) {
                  const jsonStr = trimmed.slice(5).trim();
                  try {
                    const parsed = JSON.parse(jsonStr);
                    expEvents++;
                    const deltaThinking =
                      parsed.choices?.[0]?.delta?.reasoning_content ||
                      parsed.choices?.[0]?.delta?.reasoning ||
                      parsed.choices?.[0]?.delta?.thought ||
                      '';
                    const deltaText = parsed.choices?.[0]?.delta?.content || '';
                    if (deltaThinking) {
                      currentThinking += deltaThinking;
                      expThinkEvents++;
                      if (!firstThinkMs) firstThinkMs = Math.round(performance.now() - startTime);
                    }
                    if (deltaText) {
                      currentContent += deltaText;
                      expTextEvents++;
                      if (!firstTextMs) firstTextMs = Math.round(performance.now() - startTime);
                    }
                    if (deltaThinking || deltaText) {
                      finalResp = formatThinkingResponse(
                        currentThinking,
                        currentContent,
                        expModelName
                      );
                      renderer.push(finalResp);
                      if ($('latency-val') && !pS)
                        $('latency-val').innerText = String(
                          Math.round(performance.now() - startTime)
                        );
                      pS = true;
                    }
                  } catch (_) {}
                }
              }
            }

            // CHẨN ĐOÁN: events = tổng event SSE, thinkEvents = số event mang suy luận.
            // thinkEvents <= 2 nghĩa là server gửi suy luận 1 cục (không phải lỗi renderer).
            console.warn(
              '[ExLabs V73]',
              am,
              '| events =',
              expEvents,
              '| thinkEvents =',
              expThinkEvents,
              '| textEvents =',
              expTextEvents,
              '| firstThink =',
              firstThinkMs,
              'ms | firstText =',
              firstTextMs,
              'ms | thinking =',
              currentThinking.length,
              'ký tự | content =',
              currentContent.length,
              'ký tự'
            );
            window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
              branch: 'exp-stream',
              model: am,
              expEvents,
              expThinkEvents,
              expTextEvents,
              firstThinkMs,
              firstTextMs,
              thinkingChars: currentThinking.length,
              contentChars: currentContent.length,
            });

            finalResp = formatFinalThinkingResponse(currentThinking, currentContent, expModelName);
            if (!currentContent.trim() && currentThinking.trim()) {
              currentContent = currentThinking.trim();
              currentThinking = '';
              finalResp = formatFinalThinkingResponse(
                currentThinking,
                currentContent,
                expModelName
              );
            }
            await renderer.flush(finalResp);
            pS = true;
          } catch (expErr) {
            if (expErr.name === 'AbortError' || abortController.signal.aborted) throw expErr;
            lastErr = expErr;
            if (pS) {
              finalResp += `\n\n*(⚠️ Quá trình stream bị ngắt: ${expErr.message})*`;
              if (!currentContent.trim() && currentThinking.trim()) {
                currentContent = currentThinking.trim();
                currentThinking = '';
              }
              finalResp = formatFinalThinkingResponse(
                currentThinking,
                currentContent,
                expModelName
              );
              await renderer.flush(finalResp);
            } else {
              // Quá tải/mất mạng: thử model dự phòng thay vì bỏ lượt (rơi xuống ENGINE 2).
              if (!switchToFailoverModel(0, expErr.message, 'amber')) {
                bD.remove();
                return showToast(`Lỗi Experiential Labs: ${expErr.message}`, 'danger');
              }
            }
          }
        }

        if (pS) {
          await saveTurn();
          return;
        }
      }

      // --- ENGINE 0B: GATEWAY OpenAI-COMPATIBLE (OpenRouter/NVIDIA/Cohere/dynamic) ---
      // Tên biến phải KHÁC `providerId` ở phạm vi sendMessage: khai báo lại cùng tên
      // trong khối try sẽ shadow biến ngoài và gây TDZ cho các chỗ dùng trước đó
      // (vd nhãn "Đang chờ <provider>…").
      const compatProviderId = getModelProvider(am);
      const prov = window.COMPAT_PROVIDERS?.[compatProviderId];
      if (prov) {
        // Key đã được chọn + xoay tua ở đầu sendMessage; đây chỉ là lưới an toàn
        let compatKey = gKey;
        if (!compatKey) {
          const orKeys =
            prov.id === 'openrouter' &&
            typeof window.openRouterKeys !== 'undefined' &&
            Array.isArray(window.openRouterKeys)
              ? window.openRouterKeys.filter(Boolean)
              : [];
          if (orKeys.length) {
            const orSelEl = $('openrouter-key-select');
            const orSel = orSelEl ? orSelEl.value : 'auto';
            let orIdx = 0;
            if (orSel !== 'auto') {
              const slot = parseInt(orSel, 10) + 1;
              const slotNames =
                typeof prov.keyStorageMultiple === 'function' ? prov.keyStorageMultiple() : [];
              const slotName = slotNames[slot - 1] || `jarvis_openrouter_keys_${slot}`;
              let slotKey = (ls.getItem(slotName) || '').trim();
              if (slotKey.startsWith('JVENC_') || slotKey.startsWith('ENC_'))
                slotKey = deobfuscateKey(slotKey);
              orIdx = Math.max(0, orKeys.indexOf(slotKey));
            } else {
              orIdx = (window.openRouterKeyIndex || 0) % orKeys.length;
              window.openRouterKeyIndex = (orIdx + 1) % orKeys.length;
            }
            compatKey = orKeys[orIdx];
            keyIndexNum =
              typeof window.findOpenRouterSlotIndexForKey === 'function'
                ? window.findOpenRouterSlotIndexForKey(compatKey)
                : orIdx + 1;
          } else {
            compatKey = (ls.getItem(prov.keyStorage) || '').trim();
            if (compatKey.startsWith('JVENC_') || compatKey.startsWith('ENC_'))
              compatKey = deobfuscateKey(compatKey);
            if (!compatKey && prov.keyCount > 1) {
              const slotNames =
                typeof prov.keyStorageMultiple === 'function' ? prov.keyStorageMultiple() : [];
              for (let i = 1; i <= prov.keyCount; i++) {
                const slotName = slotNames[i - 1] || `jarvis_${prov.id}_api_${i}`;
                let slotKey = (ls.getItem(slotName) || '').trim();
                if (slotKey.startsWith('JVENC_') || slotKey.startsWith('ENC_'))
                  slotKey = deobfuscateKey(slotKey);
                if (slotKey) {
                  compatKey = slotKey;
                  keyIndexNum = i;
                  break;
                }
              }
            }
          }
        }
        if (!compatKey) {
          bD.remove();
          return showToast(`Vui lòng nhập ${prov.keyLabel} API Key trong Cài đặt (⚙️)!`, 'danger');
        }

        bD.querySelector('.typing-bubble')?.remove();

        // Dựng messages theo chuẩn OpenAI: system + 10 tin gần nhất + lượt hiện tại (kèm tệp nếu model nhận)
        const mOpts = (window.COMPAT_MODEL_OPTS || {})[am] || null;
        const compatMessages = [];
        const compatSI = getDynamicSI(ragSnippet);
        if (compatSI) compatMessages.push({ role: 'system', content: compatSI });
        if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
          chatHistory.slice(-10).forEach(m => {
            // Chỉ gửi phần trả lời, bỏ khối 💭 đã render (dữ liệu lưu vẫn nguyên)
            const txt = stripThinkingForCopy(m.text);
            if (txt)
              compatMessages.push({
                role: m.role === 'model' ? 'assistant' : 'user',
                content: txt,
              });
          });
        }
        if (base64Files && base64Files.length > 0) {
          const compatUserContent = /** @type {any[]} */ ([{ type: 'text', text: promptWithTime }]);
          // Ảnh LUÔN gửi cho MỌI model (kể cả model khai báo text-only): provider từ chối thì
          // vòng thử lại bên dưới bắt lỗi, báo toast "<tên model> does not process images"
          // rồi gửi lại không kèm ảnh. Chỉ video/audio còn lọc theo inputModalities.
          const accepts =
            mOpts && Array.isArray(mOpts.inputModalities)
              ? mOpts.inputModalities
              : ['text', 'image'];
          const skippedKinds = [];
          for (const f of base64Files) {
            const mt = f.mimeType || '';
            if (mt.startsWith('image/')) {
              compatUserContent.push({
                type: 'image_url',
                image_url: { url: `data:${mt};base64,${f.data}` },
              });
            } else if (mt.startsWith('video/')) {
              if (!accepts.includes('video')) {
                skippedKinds.push('video');
                continue;
              }
              compatUserContent.push({
                type: 'video_url',
                video_url: { url: `data:${mt};base64,${f.data}` },
              });
            } else if (mt.startsWith('audio/')) {
              if (!accepts.includes('audio')) {
                skippedKinds.push('audio');
                continue;
              }
              // audio/mpeg -> mp3, audio/mp4 + audio/x-m4a -> m4a, audio/x-wav -> wav
              const fmt = (mt.split('/')[1] || 'wav')
                .replace('mpeg', 'mp3')
                .replace('x-m4a', 'm4a')
                .replace('mp4', 'm4a')
                .replace('x-wav', 'wav');
              compatUserContent.push({
                type: 'input_audio',
                input_audio: { data: f.data, format: fmt },
              });
            }
          }
          if (skippedKinds.length) {
            showToast(
              `${prov.modelLabel(am)} không nhận ${[...new Set(skippedKinds)].join(', ')} — đã bỏ qua tệp đó.`,
              'danger'
            );
          }
          compatMessages.push({ role: 'user', content: compatUserContent });
        } else {
          compatMessages.push({ role: 'user', content: promptWithTime });
        }

        const compatLabel = prov.modelLabel(am);
        // Ảnh đã gửi kèm lượt này? Nếu provider từ chối, gỡ ảnh rồi gửi lại đúng một lần.
        let compatHasImages = hasImageFiles;
        const dropCompatImages = () => {
          for (let i = compatMessages.length - 1; i >= 0; i--) {
            const cMsg = compatMessages[i];
            if (cMsg.role !== 'user' || !Array.isArray(cMsg.content)) continue;
            const kept = cMsg.content.filter(p => p.type !== 'image_url');
            cMsg.content = kept.length > 1 ? kept : kept[0]?.text || promptWithTime;
            return true;
          }
          return false;
        };
        let compatThinking = '';
        let compatContent = '';

        try {
          const compatHeaders = {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + compatKey,
          };
          if (typeof prov.extraHeaders === 'function' && /^https?:$/.test(location.protocol)) {
            Object.assign(compatHeaders, prov.extraHeaders() || {});
          }

          // --- BẬT SUY LUẬN (REASONING) THEO MỨC "THINK DEPTH" ĐANG CHỌN ---
          // Tham số generation (temperature, top_p, top_k) cho NVIDIA/OpenRouter models
          // Ưu tiên: model-specific defaults (COMPAT_MODEL_OPTS) > UI settings (DOM) > fallback defaults
          const compatTemperature =
            mOpts && typeof mOpts.temperature === 'number'
              ? mOpts.temperature
              : DOM.temp?.value !== undefined
                ? +DOM.temp.value
                : 0.7;
          const compatTopP =
            mOpts && typeof mOpts.topP === 'number'
              ? mOpts.topP
              : DOM.topP?.value !== undefined
                ? +DOM.topP.value
                : 0.9;
          const compatTopK =
            mOpts && typeof mOpts.topK === 'number'
              ? mOpts.topK
              : DOM.topK?.value !== undefined
                ? +DOM.topK.value
                : 40;

          const compatBody = {
            model: am,
            messages: compatMessages,
            stream: true,
            max_tokens: mOpts && mOpts.maxTokens ? mOpts.maxTokens : 8192,
            temperature: compatTemperature,
            top_p: compatTopP,
            top_k: compatTopK,
          };
          // Gateway giới hạn whitelist tham số (Cohere Compatibility: top_k -> HTTP 422)
          if (Array.isArray(prov.unsupportedParams)) {
            for (const p of prov.unsupportedParams) delete compatBody[p];
          }
          const compatReasoning = buildReasoningPayload(mOpts, thk);
          if (prov.reasoningEffortParam) {
            // Cohere: chỉ nhận reasoning_effort 'high' (bật) hoặc không gửi tham số (tắt).
            // Gửi 'none' có thể vẫn khiến Command A+ trả reasoning -> chỉ gửi khi thk !== 'none'.
            if (thk && thk !== 'none') {
              compatBody[prov.reasoningEffortParam] = 'high';
            }
          } else if (compatReasoning) {
            compatBody.reasoning = compatReasoning;
            // enabled: false = đã tắt hẳn -> không cần xin trả reasoning
            if (prov.includeReasoning && compatReasoning.enabled !== false) {
              compatBody.include_reasoning = true;
            }
          }
          // NVIDIA integrate: reasoning đi qua chat_template_kwargs (+ effort / budget)
          const nvThinking = buildNvidiaThinking(mOpts, thk);
          if (nvThinking) Object.assign(compatBody, nvThinking);

          const compatBase =
            typeof prov.getBaseUrl === 'function' ? prov.getBaseUrl() : prov.baseUrl;
          const compatUrl = `${compatBase}/chat/completions`;
          // Endpoint dự phòng cho proxy NVIDIA/Kilo. Endpoint chính hãng bị chặn CORS nên trình duyệt
          // BẮT BUỘC đi qua proxy freebuff.site. Preview và production là hai môi trường deploy riêng
          // (hạn mức/khoá publish riêng), nên một hostname bị pause/chặn thì hostname còn lại vẫn phục vụ.
          const compatFallbackBases = [];
          const _primaryBase = String(compatBase).replace(/\/+$/, '');
          if (prov.id === 'nvidia') {
            const _stored = (ls.getItem('nvidia_proxy_url') || '').trim().replace(/\/+$/, '');
            if (_stored && _stored !== _primaryBase) compatFallbackBases.push(_stored);
            // Du phong DOC LAP: Vercel Edge (khac nha cung cap voi freebuff/Cloudflare)
            compatFallbackBases.push('https://vercel-proxy-two-lake.vercel.app/api/v1');
            compatFallbackBases.push('https://jarvis-nvidia-proxy-9klgal.freebuff.site/v1');
            compatFallbackBases.push('https://jarvis-nvidia-proxy-9klgal-preview.freebuff.site/v1');
          } else if (String(compatBase).toLowerCase().includes('kilo')) {
            compatFallbackBases.push('https://vercel-proxy-two-lake.vercel.app/api/kilo/v1');
            compatFallbackBases.push('https://jarvis-nvidia-proxy-9klgal.freebuff.site/kilo/v1');
            compatFallbackBases.push(
              'https://jarvis-nvidia-proxy-9klgal-preview.freebuff.site/kilo/v1'
            );
          }
          const compatBasesToTry = [
            _primaryBase,
            ...compatFallbackBases.filter(b => b && b !== _primaryBase),
          ];
          console.log(
            `[Gateway ${prov.keyLabel}] Endpoint:`,
            compatUrl,
            '| fallbacks:',
            compatBasesToTry.slice(1)
          );
          const sendCompat = async () => {
            let lastErr = null;
            for (const _base of compatBasesToTry) {
              const _url = `${_base}/chat/completions`;
              try {
                const _res = await fetch(_url, {
                  method: 'POST',
                  headers: compatHeaders,
                  body: JSON.stringify(compatBody),
                  signal: abortController.signal,
                });
                // Proxy down/thất bại server -> thử endpoint tiếp theo
                if (_res.status >= 500) {
                  lastErr = new Error(`HTTP ${_res.status} từ ${_url}`);
                  continue;
                }
                return _res;
              } catch (_e) {
                if (abortController.signal.aborted) throw _e;
                lastErr = _e;
                continue;
              }
            }
            throw lastErr || new Error('Không kết nối được proxy ' + compatBasesToTry[0]);
          };

          let compatRes = null;
          let compatErrText = '';
          // Bể key của provider: chỉ xoay sang key khác khi đang để "Tự động xoay tua"
          // (khóa thủ công 1 key thì giữ đúng key đó, giống nhánh Google).
          // Use generic key array for ALL OpenAI-compatible providers (NVIDIA, Cohere, OpenRouter, dynamic)
          const compatKeysVar = prov.id + 'Keys';
          const compatPoolSrc = window[compatKeysVar];
          const compatPool = Array.isArray(compatPoolSrc) ? compatPoolSrc.filter(Boolean) : [];
          const compatSelEl = $(prov.id + '-key-select');
          const compatAuto = !compatSelEl || compatSelEl.value === 'auto';
          const compatSlotOf = key => {
            const findSlotFn =
              window[
                'find' + prov.id.charAt(0).toUpperCase() + prov.id.slice(1) + 'SlotIndexForKey'
              ];
            if (typeof findSlotFn === 'function') return findSlotFn(key);
            return keyIndexNum;
          };
          let compatKeySwitches = 0;
          // Provider tạm thời quá tải (Google AI Studio hay trả 503 rồi 200 ngay sau đó) → thử lại vài lần
          const COMPAT_MAX_ATTEMPTS = 4;
          const COMPAT_RETRY_DELAYS = [600, 1500, 2500];
          // Tham số optional có thể bị gateway từ chối (422 "x is not supported") -> được phép gỡ rồi thử lại.
          // Không bao giờ gỡ model/messages/stream vì thiếu là hỏng request.
          const COMPAT_STRIPPABLE_PARAMS = [
            'top_k',
            'top_p',
            'temperature',
            'max_tokens',
            'seed',
            'stop',
            'frequency_penalty',
            'presence_penalty',
            'reasoning_effort',
            'reasoning',
            'include_reasoning',
            'stream_options',
          ];
          let compatParamStrips = 0;
          const compatSleep = ms =>
            new Promise((resolve, reject) => {
              const t = setTimeout(resolve, ms);
              abortController.signal.addEventListener(
                'abort',
                () => {
                  clearTimeout(t);
                  const e = new Error('Aborted');
                  e.name = 'AbortError';
                  reject(e);
                },
                { once: true }
              );
            });
          for (let attempt = 0; attempt < COMPAT_MAX_ATTEMPTS; attempt++) {
            compatRes = await sendCompat();
            if (compatRes.ok) break;
            compatErrText = await compatRes.text().catch(() => '');
            // Model không xử lý ảnh (text-only): bỏ ảnh khỏi lượt, báo toast theo tên model, thử lại
            if (
              compatHasImages &&
              attempt < COMPAT_MAX_ATTEMPTS - 1 &&
              compatRes.status >= 400 &&
              compatRes.status < 500 &&
              isImageRejection(compatErrText)
            ) {
              compatHasImages = false;
              dropCompatImages();
              notifyImagesUnsupported(compatLabel);
              compatErrText = '';
              continue;
            }
            // Gateway từ chối ĐÚNG một tham số (vd Cohere: "top_k is not supported" - HTTP 422):
            // gỡ tham số đó rồi thử lại thay vì báo lỗi cả lượt.
            const rejectedParam = (() => {
              if (!(compatRes.status >= 400 && compatRes.status < 500)) return '';
              const m =
                compatErrText.match(/['"`]?([a-z][a-z_]{1,40})['"`]?\s+is not supported/i) ||
                compatErrText.match(
                  /unsupported\s+(?:parameter|field)?\s*:?\s*['"`]?([a-z][a-z_]{1,40})/i
                ) ||
                compatErrText.match(
                  /unrecognized\s+(?:request\s+)?(?:argument|parameter|field)\s*:?\s*['"`]?([a-z][a-z_]{1,40})/i
                );
              const p = m && m[1];
              return p && COMPAT_STRIPPABLE_PARAMS.includes(p) ? p : '';
            })();
            if (rejectedParam && compatParamStrips < 3) {
              delete compatBody[rejectedParam];
              compatParamStrips++;
              console.warn(
                `[Gateway ${prov.keyLabel}] HTTP ${compatRes.status}: gỡ tham số "${rejectedParam}" rồi thử lại.`
              );
              compatErrText = '';
              continue;
            }
            // Gateway không hỗ trợ tham số reasoning (400/4xx + thông báo liên quan): gỡ ra và thử lại
            const rejectedReasoning =
              compatBody.reasoning &&
              compatRes.status >= 400 &&
              compatRes.status < 500 &&
              /reason|unknown|unsupported|unrecogni|invalid.?param|extra/i.test(compatErrText);
            if (rejectedReasoning) {
              delete compatBody.reasoning;
              delete compatBody.include_reasoning;
              compatErrText = '';
              continue;
            }
            // Key bị từ chối / hết hạn ngạch: xoay sang key kế tiếp trong bể thay vì
            // thử lại cùng một key rồi báo lỗi cả lượt.
            const keyRejected = [401, 402, 403, 429].includes(compatRes.status);
            if (
              keyRejected &&
              compatAuto &&
              compatPool.length > 1 &&
              compatKeySwitches < compatPool.length - 1
            ) {
              const curIdx = compatPool.indexOf(compatKey);
              const nextKey = compatPool[(curIdx + 1) % compatPool.length];
              compatKeySwitches++;
              if (nextKey && nextKey !== compatKey) {
                const failedSlot = keyIndexNum;
                compatKey = nextKey;
                compatHeaders.Authorization = 'Bearer ' + compatKey;
                keyIndexNum = compatSlotOf(compatKey);
                // Đẩy con trỏ xoay tua qua key vừa dùng để lượt sau không lặp lại key này
                if (prov.keyIndexVar)
                  /** @type {any} */ (window)[prov.keyIndexVar] =
                    (compatPool.indexOf(compatKey) + 1) % compatPool.length;
                showToast(
                  `⚠️ ${prov.keyLabel} Key #${failedSlot} lỗi (HTTP ${compatRes.status}), đang xoay sang Key #${keyIndexNum}...`,
                  'warning'
                );
                compatErrText = '';
                continue;
              }
            }
            // 429/502/503/504 = lỗi tạm thời phía provider, chờ rồi thử lại thay vì báo lỗi ngay
            const transient = [429, 502, 503, 504].includes(compatRes.status);
            if (!transient || attempt >= COMPAT_MAX_ATTEMPTS - 1) break;
            const wait = COMPAT_RETRY_DELAYS[Math.min(attempt, COMPAT_RETRY_DELAYS.length - 1)];
            console.warn(
              `[Gateway ${prov.keyLabel}] HTTP ${compatRes.status} - thử lại lần ${attempt + 1}/${COMPAT_MAX_ATTEMPTS - 1} sau ${wait}ms`
            );
            if ($('latency-val'))
              $('latency-val').innerText = `↻ thử lại (${attempt + 1}/${COMPAT_MAX_ATTEMPTS - 1})`;
            compatErrText = '';
            await compatSleep(wait);
          }

          if (!compatRes || !compatRes.ok) {
            let apiMsg = '';
            let rawMsg = '';
            let provName = '';
            try {
              const parsedErr = JSON.parse(compatErrText);
              apiMsg =
                parsedErr?.detail ||
                parsedErr?.error?.message ||
                parsedErr?.message ||
                parsedErr?.title ||
                '';
              // OpenRouter: lý do thật nằm trong error.metadata (raw / provider_name), message chỉ là "Provider returned error"
              rawMsg = parsedErr?.error?.metadata?.raw || parsedErr?.metadata?.raw || '';
              provName =
                parsedErr?.error?.metadata?.provider_name ||
                parsedErr?.metadata?.provider_name ||
                '';
            } catch (_) {}
            if (rawMsg) {
              // Toast chỉ hiện message + mã lỗi của provider, không dump JSON thô
              const via = provName ? `[${provName}] ` : '';
              apiMsg = `${via}${formatUpstreamError(rawMsg, compatRes.status)}`;
            } else if (apiMsg && compatRes.status) {
              apiMsg = `${apiMsg} (HTTP ${compatRes.status})`;
            }
            // 401/403 từ NVIDIA = key bị từ chối, không phải lỗi model/mạng -> nói rõ việc cần làm
            if (prov.id === 'nvidia' && compatRes && [401, 403].includes(compatRes.status)) {
              apiMsg = `Key NVIDIA bị từ chối (HTTP ${compatRes.status}): key sai/hết hạn hoặc không có quyền với model này. Kiểm tra lại key đang chọn (bấm "🔌 Kiểm tra kết nối" trong Cài đặt).`;
            }
            throw new Error(apiMsg || 'HTTP ' + (compatRes ? compatRes.status : '?'));
          }

          const compatReader = compatRes.body.getReader();
          const compatDecoder = new TextDecoder();
          let compatBuffer = '';
          let compatDone = false;

          while (!compatDone) {
            const { value, done: chunkDone } = await compatReader.read();
            if (chunkDone) break;
            compatBuffer += compatDecoder.decode(value, { stream: true });

            const lines = compatBuffer.split('\n');
            compatBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === 'data: [DONE]') {
                compatDone = true;
                break;
              }
              if (!trimmed.startsWith('data:')) continue;
              try {
                const parsed = JSON.parse(trimmed.slice(5).trim());
                const delta = parsed.choices?.[0]?.delta || {};
                const deltaThinking =
                  delta.reasoning_content || delta.reasoning || delta.thought || '';
                const deltaText = delta.content || '';
                if (deltaThinking) compatThinking += deltaThinking;
                if (deltaText) compatContent += deltaText;
                if (deltaThinking || deltaText) {
                  finalResp = formatThinkingResponse(compatThinking, compatContent, compatLabel);
                  renderer.push(finalResp);
                  if ($('latency-val') && !pS)
                    $('latency-val').innerText = String(Math.round(performance.now() - startTime));
                  pS = true;
                }
              } catch (_) {}
            }
          }

          finalResp = formatFinalThinkingResponse(compatThinking, compatContent, compatLabel);
          if (!compatContent.trim() && compatThinking.trim()) {
            compatContent = compatThinking.trim();
            compatThinking = '';
            finalResp = formatFinalThinkingResponse('', compatContent, compatLabel);
          }
          await renderer.flush(finalResp);
          pS = true;
        } catch (compatErr) {
          if (compatErr.name === 'AbortError' || abortController.signal.aborted) throw compatErr;
          lastErr = compatErr;
          if (pS) {
            finalResp =
              formatFinalThinkingResponse(compatThinking, compatContent, compatLabel) +
              `\n\n*(⚠️ Quá trình stream bị ngắt: ${compatErr.message})*`;
            await renderer.flush(finalResp);
          } else if (
            // Quá tải / hết quota / không kết nối được: chuyển sang model dự phòng thay vì
            // bỏ cả lượt. Khi đổi model, luồng rơi xuống ENGINE 2 với model mới.
            switchToFailoverModel(compatRes?.status || 0, compatErr?.message || '', 'amber')
          ) {
            // ENGINE 2 sẽ chạy với model dự phòng.
          } else {
            bD.remove();
            const networkLike = /failed to fetch|networkerror|load failed/i.test(
              compatErr.message || ''
            );
            if (prov.id === 'nvidia' && networkLike) {
              return showToast(
                `Lỗi NVIDIA: không kết nối được proxy (${compatErr.message}). Kiểm tra mạng hoặc NVIDIA Proxy URL trong Cài đặt.`,
                'danger'
              );
            }
            if (networkLike) {
              // In luôn endpoint để biết base URL của provider đang trỏ đâu (Kilo trên APK
              // hay gặp "Failed to fetch" khi Base URL trỏ thẳng gateway chặn CORS).
              return showToast(
                `Lỗi ${prov.keyLabel}: không kết nối được ${compatUrl} (${compatErr.message}). Kiểm tra Base URL của provider trong Cài đặt.`,
                'danger'
              );
            }
            return showToast(`Lỗi ${prov.keyLabel}: ${compatErr.message}`, 'danger');
          }
        }

        if (pS) {
          await saveTurn();
          return;
        }
      }

      // ENGINE 1: INTERACTIONS API
      // forceStreamEngine = vừa failover từ provider khác -> bỏ qua Interactions để tránh
      // dùng previous_interaction_id của model cũ.
      if (currentEngine === 'interactions' && !forceStreamEngine) {
        const interactionParams = {
          model: am,
          input: imgs.length ? interactionInput : promptWithTime,
          stream: true,
        };

        const dynamicSI = getDynamicSI(ragSnippet);
        if (dynamicSI) {
          interactionParams.system_instruction = dynamicSI;
        }

        // Cấu hình GenerationConfig cho Interactions API (không nhận temperature/topP/topK)
        const genConfig = {};
        // Cùng bảng mức như nhánh stream: 3.8 Flash / 4 Hydrogen KHÔNG nhận 'minimal'
        const ixThinkLevel = resolveThinkingLevel(am, thk) || thk;
        if (thk && thk !== 'none' && ixThinkLevel) {
          genConfig.thinking_level = ixThinkLevel;
        }
        if (Object.keys(genConfig).length > 0) {
          interactionParams.generation_config = genConfig;
        }

        // QUẢN LÝ TIẾP NỐI MẠCH HỘI THOẠI (STATEFUL INTERACTIONS)
        const isMemoryEnabled = DOM.toggleMemory?.checked !== false;
        if (isMemoryEnabled) {
          if (cs?.lastInteractionId) {
            // Dùng 100% Google Server State (chỉ gửi previous_interaction_id, input chỉ có câu hỏi hiện tại)
            interactionParams.previous_interaction_id = cs.lastInteractionId;
          } else if (chatHistory.length > 0) {
            // Tiếp tế bối cảnh 1 lần duy nhất cho lượt khởi động nếu chưa có ID trên server Google
            const histSummary = chatHistory
              .slice(-10)
              .map(
                m => `${m.role === 'model' ? 'AI' : 'Người dùng'}: ${stripThinkingForCopy(m.text)}`
              )
              .join('\n\n');
            const seededPrompt = `[BỐI CẢNH CÁC LƯỢT TRÒ CHUYỆN TRƯỚC ĐÓ]:\n${histSummary}\n\n[CÂU HỎI TIẾP THEO CỦA NGƯỜI DÙNG]:\n${fnP}`;
            if (imgs.length) {
              interactionParams.input = [
                { type: 'text', text: seededPrompt },
                ...base64Files.map(({ mimeType, data }) => ({
                  type: 'image',
                  data,
                  mime_type: mimeType,
                })),
              ];
            } else {
              interactionParams.input = seededPrompt;
            }
          }
        }

        let streamObj = null;
        let currentTryKey = gKey;
        let retryCount = 0;
        const maxRetries = Math.min(apiKeys.length, 3);
        // Ảnh đã gửi kèm lượt này? Model từ chối thì bỏ ảnh, báo toast rồi thử lại.
        let ixHasImages = hasImageFiles;

        while (retryCount <= maxRetries) {
          try {
            const ai = new GoogleGenAI({
              apiKey: currentTryKey,
            });

            try {
              streamObj = await ai.interactions.create(interactionParams);
            } catch (ixErr) {
              if (
                interactionParams.previous_interaction_id &&
                (ixErr.message.includes('not found') ||
                  ixErr.message.includes('404') ||
                  ixErr.message.includes('invalid') ||
                  ixErr.message.includes('interaction'))
              ) {
                delete interactionParams.previous_interaction_id;
                if (cs) {
                  cs.lastInteractionId = null;
                  await saveToDB(cs);
                }
                if (chatHistory.length > 0) {
                  const histSummary = chatHistory
                    .slice(-10)
                    .map(
                      m =>
                        `${m.role === 'model' ? 'AI' : 'Người dùng'}: ${stripThinkingForCopy(m.text)}`
                    )
                    .join('\n\n');
                  const seededPrompt = `[BỐI CẢNH CÁC LƯỢT TRÒ CHUYỆN TRƯỚC ĐÓ]:\n${histSummary}\n\n[CÂU HỎI TIẾP THEO CỦA NGƯỜI DÙNG]:\n${fnP}`;
                  if (imgs.length) {
                    interactionParams.input = [
                      { type: 'text', text: seededPrompt },
                      ...base64Files.map(({ mimeType, data }) => ({
                        type: 'image',
                        data,
                        mime_type: mimeType,
                      })),
                    ];
                  } else {
                    interactionParams.input = seededPrompt;
                  }
                }
                streamObj = await ai.interactions.create(interactionParams);
              } else {
                throw ixErr;
              }
            }

            if (cs) {
              cs.assignedApiKey = currentTryKey;
              await saveToDB(cs);
            }
            break;
          } catch (err) {
            lastErr = err;
            // Model không xử lý ảnh: bỏ phần ảnh khỏi input, báo toast rồi thử lại
            if (ixHasImages && isImageRejection(err.message)) {
              ixHasImages = false;
              if (Array.isArray(interactionParams.input)) {
                const kept = interactionParams.input.filter(p => p.type !== 'image');
                interactionParams.input = kept.length > 1 ? kept : kept[0]?.text || promptWithTime;
              }
              notifyImagesUnsupported(modelLabelOf(am));
              if (retryCount < maxRetries) {
                retryCount++;
                continue;
              }
            }
            const isKeyOrQuotaErr =
              err.message &&
              (err.message.includes('API key') ||
                err.message.includes('403') ||
                err.message.includes('429') ||
                err.message.includes('quota') ||
                err.message.includes('RESOURCE_EXHAUSTED'));

            if (isKeyOrQuotaErr && apiKeys.length > 1 && retryCount < maxRetries) {
              retryCount++;
              currentTryKey = apiKeys[(apiKeys.indexOf(currentTryKey) + 1) % apiKeys.length];
              delete interactionParams.previous_interaction_id;
              if (cs) cs.lastInteractionId = null;
              console.warn(
                `Interactions: Key lỗi, xoay sang Key tiếp theo (lần ${retryCount}):`,
                err.message
              );
              continue;
            } else {
              break;
            }
          }
        }

        if (streamObj) {
          try {
            let currentThinking = '';
            let currentContent = '';

            for await (const event of streamObj) {
              const foundId = event.interaction?.id || event.id || event.interaction_id;
              if (foundId) recordedIxId = foundId;

              let chunkText = '';
              let chunkThought = '';
              if (event.event_type === 'step.delta') {
                if (event.delta?.type === 'thought' || event.delta?.type === 'reasoning') {
                  chunkThought = event.delta.text || '';
                } else if (event.delta?.type === 'text') {
                  chunkText = event.delta.text || '';
                }
              } else if (event.delta?.thought) {
                chunkThought = event.delta.thought;
              } else if (event.delta?.text) {
                chunkText = event.delta.text;
              } else if (event.text) {
                chunkText = event.text;
              } else if (
                event.event_type === 'interaction.completed' &&
                !currentContent &&
                event.interaction?.output_text
              ) {
                chunkText = event.interaction.output_text;
              }

              if (chunkThought) currentThinking += chunkThought;
              if (chunkText) currentContent += chunkText;

              if (chunkThought || chunkText) {
                bD.querySelector('.typing-bubble')?.remove();
                finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
                renderer.push(finalResp);
                if ($('latency-val') && !pS)
                  $('latency-val').innerText = String(Math.round(performance.now() - startTime));
                pS = true;
              }
            }

            finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
            await renderer.flush(finalResp);
          } catch (streamErr) {
            lastErr = streamErr;
            if (pS) {
              console.warn('Interactions stream lỗi giữa chừng:', streamErr);
              finalResp += `\n\n*(⚠️ Quá trình tạo chữ bị ngắt giữa chừng do lỗi stream: ${streamErr.message || 'Mất kết nối'})`;
              await renderer.flush(finalResp);
              showToast('Đường truyền stream bị ngắt giữa chừng!', 'warning');
            }
          }
        }

        // Dự phòng 1: Nếu streaming không nhận được ký tự nào, thử gọi unary (stream: false)
        if (!pS && !abortController.signal.aborted) {
          try {
            const aiUnary = new GoogleGenAI({ apiKey: currentTryKey });
            const unaryParams = { ...interactionParams, stream: false };
            const ixResult = await aiUnary.interactions.create(unaryParams);
            const foundId = ixResult?.id || ixResult?.interaction?.id;
            if (foundId) recordedIxId = foundId;
            const unaryText =
              ixResult?.output_text || ixResult?.outputs?.find(o => o.type === 'text')?.text || '';
            if (unaryText) {
              bD.querySelector('.typing-bubble')?.remove();
              finalResp = unaryText;
              renderer.push(finalResp);
              await renderer.flush(finalResp);
              if ($('latency-val') && !pS)
                $('latency-val').innerText = String(Math.round(performance.now() - startTime));
              pS = true;
            }
          } catch (uErr) {
            lastErr = uErr;
          }
        }

        // Tự động dự phòng chuyển sang Stream Engine nếu Interactions API không phản hồi
        if (!pS) {
          const errDetail = lastErr?.message ? ` (${lastErr.message})` : '';
          console.warn(
            'Interactions API gặp sự cố' + errDetail + ', tự động dùng Stream Engine dự phòng:',
            lastErr
          );
          showToast(
            'Interactions API gặp sự cố' + errDetail + ', tự động dùng Stream Engine dự phòng.',
            'warning'
          );
        }
      }

      // ENGINE 2: GENERATECONTENTSTREAM
      if (!pS) {
        const contents = [];
        if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
          chatHistory.slice(-contextMsgCount).forEach(m => {
            // Lọc bỏ khối 💭 đã render khỏi ngữ cảnh gửi AI (chỉ ảnh hưởng payload, không đổi dữ liệu đã lưu)
            const cleanText = stripThinkingForCopy(m.text);
            if (cleanText) {
              contents.push({
                role: m.role === 'model' ? 'model' : 'user',
                parts: [{ text: cleanText }],
              });
            }
          });
        }
        contents.push({ role: 'user', parts: currentParts });
        // Ảnh đã gửi kèm lượt này? Nếu Google từ chối, bỏ inlineData ảnh rồi gửi lại.
        let googleHasImages = hasImageFiles;

        const isGemma = /^gemma-/.test(am);
        // Model Gemini 3.x/4 dùng thinkingLevel; thinkingBudget là tham số cũ của dòng 2.5.
        const usesThinkingLevel = /^(gemini-(3|4)|gemma-)/.test(am);
        // Mức gửi đi LUÔN phải nằm trong bảng mức model hỗ trợ: gửi 'minimal' cho 3.8 Flash /
        // 4 Hydrogen sẽ bị Google trả lỗi 400, nên hạ về 'low' (mức thấp nhất của các model đó).
        const modelLevels = getModelThinkingLevels(am);
        const thinkingSupported = modelLevels.length > 0 || isGemma;
        // Gemma 4 không nằm trong bảng -> giữ nguyên mức người dùng chọn (chỉ bật/tắt)
        const thinkLevel = resolveThinkingLevel(am, thk) || thk;
        const budgetMap = { minimal: 1024, low: 2048, medium: 4096, high: 8192 };
        const wantsThinking = thinkingSupported && !!thk && thk !== 'none';
        // maxOutputTokens của Gemini tính CHUNG thinking + output. Để 8192 khi bật thinking
        // thì thinking ăn hết hạn mức -> model không còn chỗ xuất chữ và stream bị treo.
        // Vì thế: 8192 khi KHÔNG thinking, 32768 khi CÓ thinking (3.5 Flash Lite giữ 65000).
        const maxOutputTokens = isGemma
          ? 8192
          : am === 'gemini-3.5-flash-lite'
            ? 65000
            : wantsThinking
              ? 32768
              : 8192;
        const config = {
          systemInstruction: getDynamicSI(ragSnippet),
          maxOutputTokens,
        };
        // Gemma 4 không nhận safetySettings -> chỉ gửi với model Gemini
        if (!isGemma) config.safetySettings = SAFETY;
        if (wantsThinking) {
          if (isGemma) {
            // Gemma 4 CHỈ có công tắc bật/tắt (không có mức trung gian):
            // Min = minimal (tắt suy luận), Low/Med/High = high (bật suy luận).
            config.thinkingConfig = {
              thinkingLevel: thinkLevel === 'minimal' ? 'minimal' : 'high',
            };
          } else {
            config.thinkingConfig = usesThinkingLevel
              ? { thinkingLevel: thinkLevel, includeThoughts: true }
              : { thinkingBudget: budgetMap[thk] || 4096, includeThoughts: true };
          }
        } else if (!usesThinkingLevel) {
          // Gemini 3/4 đã bỏ temperature/topP/topK -> chỉ gửi sampling params cho dòng 2.5 trở xuống,
          // nếu không request có thể bị 400 rồi rơi vào vòng xoay key vô ích.
          config.temperature = DOM.temp?.value !== undefined ? +DOM.temp.value : 0.5;
          config.topP = DOM.topP?.value !== undefined ? +DOM.topP.value : 0.9;
          config.topK = DOM.topK?.value !== undefined ? +DOM.topK.value : 40;
        }

        let streamAttempts = 0;
        let maxStreamAttempts = Math.max(Math.min(apiKeys.length || 1, 3), 2);
        let currentThinking = '';
        let currentContent = '';
        // Đếm chunk để biết Google có stream thật hay chỉ trả 1 cục
        let mainChunks = 0,
          mainTextChunks = 0;
        // Chẩn đoán: in ra đúng cấu hình gửi Google để đối chiếu khi request bị treo
        console.warn(
          '[Gemini V73] model =',
          am,
          '| thk =',
          thk,
          '| thinking =',
          JSON.stringify(config.thinkingConfig || null),
          '| maxOutputTokens =',
          config.maxOutputTokens
        );
        window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
          branch: 'google-stream',
          thinkingConfig: config.thinkingConfig || null,
          maxOutputTokens: config.maxOutputTokens,
        });

        // Tự chuyển model khi Google xếp hàng: đo thực tế TTFT 23-33s với mọi cấu hình, nên nếu quá
        // ngưỡng ở Cài đặt → Hiệu năng (mặc định 8s, tắt được) mà chưa có chunk đầu thì huỷ attempt
        // và chạy lại bằng Flash Lite — tối đa một lần mỗi lượt để không lặp vô hạn.
        const LITE_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
        const _liteSec = parseInt(ls.getItem('jarvis_lite_fallback_sec'), 10);
        const LITE_FALLBACK_ENABLED = ls.getItem('jarvis_lite_fallback_enabled') !== 'false';
        const FIRST_CHUNK_SWITCH_MS =
          (Number.isFinite(_liteSec) ? Math.min(60, Math.max(3, _liteSec)) : 8) * 1000;
        let liteSwitched = false;

        // Badge nhỏ trên header tin nhắn khi app tự đổi model (404 hoặc quá ngưỡng chờ)
        const showModelFallbackBadge = (model, tone, title) => {
          const tones = {
            amber: ['#f59e0b', 'rgba(245,158,11,.15)', 'rgba(245,158,11,.4)', '🔁'],
            sky: ['#38bdf8', 'rgba(56,189,248,.15)', 'rgba(56,189,248,.4)', '⚡'],
          };
          const [color, bg, border, icon] = tones[tone] || tones.amber;
          try {
            const header = bD?.querySelector('.message-header');
            if (!header || header.querySelector('.model-fallback-badge')) return;
            const badge = document.createElement('span');
            badge.className = 'model-fallback-badge';
            badge.style.cssText = `font-size:.68rem;font-weight:700;padding:2px 6px;border-radius:6px;background:${bg};color:${color};border:1px solid ${border};margin-left:6px;white-space:nowrap;`;
            badge.title = title;
            badge.innerText = icon + ' ' + model;
            header.appendChild(badge);
          } catch (_) {}
        };

        while (streamAttempts < maxStreamAttempts) {
          streamAttempts++;
          // WATCHDOG: Google có thể nhận request nhưng không nhả chunk nào (treo im lặng).
          // Đo thực tế: header có thể mất 9-19s (có lúc >25s) khi Google xếp hàng, nên ngưỡng phải rộng
          // hơn 20s cũ — nếu cắt sớm, request đang xếp hàng bị bỏ và phải chờ lại từ đầu (UI đứng lâu hơn).
          const attemptStart = performance.now();
          const attemptCtrl = new AbortController();
          const relayAbort = () => attemptCtrl.abort();
          abortController.signal.addEventListener('abort', relayAbort, { once: true });
          let stalled = false;
          let gotFirstChunk = false;
          // Cấu hình trong Cài đặt → Hiệu năng (giây, 10–180). Mặc định 45s.
          const _stallSec = parseInt(ls.getItem('jarvis_stall_timeout_sec'), 10);
          const STALL_TIMEOUT_MS =
            (Number.isFinite(_stallSec) ? Math.min(180, Math.max(10, _stallSec)) : 45) * 1000;
          let stallTimer = setTimeout(() => {
            stalled = true;
            attemptCtrl.abort();
          }, STALL_TIMEOUT_MS);
          // Hạn chót chunk đầu tiên (Cài đặt → Hiệu năng, mặc định 8s, tắt được): chỉ áp dụng cho
          // model Gemini 3.x và chỉ đổi model một lần, để không phải ngồi chờ 23-33s khi Google xếp hàng.
          let switchToLite = false;
          const canSwitchLite =
            LITE_FALLBACK_ENABLED &&
            !liteSwitched &&
            am !== LITE_FALLBACK_MODEL &&
            /^gemini-3\./.test(am);
          let firstChunkTimer = canSwitchLite
            ? setTimeout(() => {
                switchToLite = true;
                attemptCtrl.abort();
              }, FIRST_CHUNK_SWITCH_MS)
            : null;
          const stopFirstChunkTimer = () => {
            if (firstChunkTimer) {
              clearTimeout(firstChunkTimer);
              firstChunkTimer = null;
            }
          };
          const stopStallTimer = () => {
            if (stallTimer) {
              clearTimeout(stallTimer);
              stallTimer = null;
            }
          };
          const cleanupAttempt = () => {
            stopStallTimer();
            stopFirstChunkTimer();
            abortController.signal.removeEventListener('abort', relayAbort);
          };
          try {
            // Mốc gửi thật: từ lúc bấm Gửi đến lúc app gọi API. Nếu mốc này lớn thì
            // độ trễ nằm TRONG app (chuẩn bị lịch sử, đồng bộ, RAG...), không phải Google.
            window.__jarvisTurnDebug.reqSentAtMs = performance.now();
            window.__jarvisTurnDebug.prepMs = Math.round(
              window.__jarvisTurnDebug.reqSentAtMs - (window.__jarvisTurnDebug.startedAtMs || 0)
            );
            if (!window.__jarvisTurnDebug.prepFirstMs)
              window.__jarvisTurnDebug.prepFirstMs = window.__jarvisTurnDebug.prepMs;
            console.warn(
              '[Gemini V78] prep (app chuẩn bị trước khi gọi API) =',
              window.__jarvisTurnDebug.prepFirstMs,
              'ms | messageCount =',
              contents.length
            );
            const resStream = await new GoogleGenAI({ apiKey: gKey }).models.generateContentStream({
              model: am,
              contents,
              config,
              abortSignal: attemptCtrl.signal,
            });
            // Mốc headers: nếu mốc này đã trễ ~10s thì độ trễ nằm ở phía Google (xếp hàng/cold start),
            // không phải ở phần suy luận của model.
            const headersMs = Math.round(performance.now() - attemptStart);
            window.__jarvisTurnDebug.headersMs = headersMs;
            window.__jarvisTurnDebug.totalToHeadersMs = Math.round(
              performance.now() - (window.__jarvisTurnDebug.startedAtMs || 0)
            );

            for await (const ck of resStream) {
              if (!gotFirstChunk) {
                gotFirstChunk = true;
                stopStallTimer();
                stopFirstChunkTimer();
                // Tách rõ 2 chặng: chờ headers (phía Google) vs chờ model nghĩ (sau headers)
                console.warn(
                  '[Gemini V73] headers =',
                  headersMs,
                  'ms | chunk đầu sau headers =',
                  Math.round(performance.now() - attemptStart) - headersMs,
                  'ms | attempt #' + streamAttempts
                );
              }
              const reason = ck.candidates?.[0]?.finishReason;
              if (reason && reason !== 'STOP') streamFinishReason = reason;

              let deltaThought = '';
              let deltaText = '';

              if (ck.candidates?.[0]?.content?.parts) {
                for (const part of ck.candidates[0].content.parts) {
                  if (part.thought) {
                    const t =
                      typeof part.thought === 'string'
                        ? part.thought
                        : typeof part.text === 'string'
                          ? part.text
                          : '';
                    if (t) {
                      deltaThought += t;
                      if (!window.__jarvisTurnDebug.firstThinkingAtMs) {
                        window.__jarvisTurnDebug.firstThinkingAtMs = performance.now();
                        window.__jarvisTurnDebug.firstThinkingWaitMs = Math.round(
                          window.__jarvisTurnDebug.firstThinkingAtMs -
                            (window.__jarvisTurnDebug.startedAtMs || 0) || 0
                        );
                      }
                    }
                  } else if (typeof part.text === 'string') {
                    if (!window.__jarvisTurnDebug.firstContentAtMs) {
                      window.__jarvisTurnDebug.firstContentAtMs = performance.now();
                    }
                    deltaText += part.text;
                  }
                }
              } else {
                try {
                  deltaText = ck.text || '';
                } catch (_) {}
              }

              mainChunks++;
              if (deltaText) mainTextChunks++;
              if (deltaThought) currentThinking += deltaThought;
              if (deltaText) currentContent += deltaText;

              if (deltaThought || deltaText) {
                bD.querySelector('.typing-bubble')?.remove();
                finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
                renderer.push(finalResp);
                if ($('latency-val') && !pS)
                  $('latency-val').innerText = String(Math.round(performance.now() - startTime));
                pS = true;
              }
            }

            lastErr = null;
            cleanupAttempt();
            break;
          } catch (e) {
            cleanupAttempt();
            // Ưu tiên xử lý treo stream trước khi xét lỗi thường
            if (stalled && !abortController.signal.aborted) {
              console.warn(
                '[Watchdog] Google không nhả chunk đầu tiên sau ' +
                  Math.round(STALL_TIMEOUT_MS / 1000) +
                  's, tự phục hồi cấu hình...'
              );
              // Nới hạn mức output để thinking không ăn hết chỗ của phần trả lời
              config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 32768);
              if (config.thinkingConfig && config.thinkingConfig.thinkingLevel) {
                // Hạ về mức thấp nhất mà Gemini 3/4 đều nhận (thay cho thinkingBudget đã deprecated)
                config.thinkingConfig = { thinkingLevel: 'low', includeThoughts: true };
                continue;
              }
              if (config.thinkingConfig) {
                delete config.thinkingConfig;
                if (!usesThinkingLevel) config.temperature = 0.5;
                continue;
              }
              lastErr = new Error(
                'Google không phản hồi sau ' +
                  Math.round(STALL_TIMEOUT_MS / 1000) +
                  ' giây (stream trò)'
              );
              break;
            }
            // Chưa có chunk đầu trong ngưỡng chờ: đổi sang Gemini 3.5 Flash Lite thay vì chờ tiếp
            if (switchToLite && !pS && !abortController.signal.aborted) {
              const prevModel = am;
              const waitSec = FIRST_CHUNK_SWITCH_MS / 1000;
              liteSwitched = true;
              am = LITE_FALLBACK_MODEL;
              // Flash Lite có hạn mức output riêng (65000) và nhận đủ 4 mức thinking
              config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 65000);
              if (config.thinkingConfig) {
                config.thinkingConfig = {
                  thinkingLevel: resolveThinkingLevel(am, thk) || thk,
                  includeThoughts: true,
                };
              }
              window.__jarvisTurnDebug.modelSwitchedFrom = prevModel;
              window.__jarvisTurnDebug.modelSwitchedAtMs = Math.round(
                performance.now() - attemptStart
              );
              const switchMsg = `${prevModel} chưa phản hồi sau ${waitSec}s — đã tự chuyển sang Gemini 3.5 Flash Lite`;
              console.warn('[Fallback chờ] ' + switchMsg);
              showToast('⚡ ' + switchMsg, 'warning');
              showModelFallbackBadge(
                am,
                'sky',
                `Model trước đó không phản hồi sau ${waitSec}s, app đã tự chuyển sang model dự phòng`
              );
              // Lượt chạy lại bằng model mới có ngân sách thử riêng, không ăn vào số lần thử của model ban đầu
              maxStreamAttempts += 1;
              continue;
            }
            if (e.name === 'AbortError' || abortController.signal.aborted) throw e;
            lastErr = e;

            // 1. Nếu lỗi xảy ra trước khi nhận chữ (!pS): Tự phục hồi thông minh
            if (!pS) {
              console.warn(`generateContentStream lần ${streamAttempts} lỗi:`, e.message);

              // 0. Model không xử lý ảnh: bỏ ảnh khỏi lượt, báo toast theo tên model rồi gửi lại
              if (googleHasImages && isImageRejection(e.message)) {
                googleHasImages = false;
                const lastUserTurn = contents[contents.length - 1];
                if (lastUserTurn?.parts) {
                  lastUserTurn.parts = lastUserTurn.parts.filter(
                    p => !(p.inlineData && String(p.inlineData.mimeType || '').startsWith('image/'))
                  );
                }
                notifyImagesUnsupported(modelLabelOf(am));
                maxStreamAttempts += 1;
                continue;
              }

              // A. Nếu lỗi do thinkingConfig (400 Bad Request): thử lại với mức thấp nhất hoặc gỡ bỏ
              if (
                config.thinkingConfig &&
                (e.message?.includes('thinking') ||
                  e.message?.includes('400') ||
                  e.message?.includes('INVALID_ARGUMENT'))
              ) {
                if (config.thinkingConfig.thinkingLevel) {
                  // Gemini 3/4 KHÔNG chuyển sang thinkingBudget nữa: gửi kèm thinkingLevel sẽ 400,
                  // gửi một mình thì bị deprecated (Google tự map về level gần nhất).
                  // Hạ về 'low' - mức thấp nhất mà mọi model Gemini 3/4 đều nhận - rồi thử lại.
                  config.thinkingConfig = { thinkingLevel: 'low', includeThoughts: true };
                  console.info('[Fallback] Thử lại thinkingConfig với mức thấp nhất ("low")...');
                  continue;
                }
                delete config.thinkingConfig;
                // Gemini 3/4 không nhận temperature nữa -> chỉ đặt lại cho dòng 2.5 trở xuống
                if (!usesThinkingLevel) config.temperature = 0.5;
                console.info('[Fallback] Gỡ thinkingConfig, thử lại với cấu hình chuẩn...');
                continue;
              }

              // B. Nếu lỗi do Model không tìm thấy hoặc khai tử (404 Not Found): Chuyển sang Flash-Lite / 3.8 Flash
              if (e.message?.includes('404') || e.message?.includes('not found')) {
                const fallbackFromModel = am;
                am = am === 'gemini-3.8-flash' ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';
                console.warn(`[Fallback] Chuyển sang model dự phòng: ${am}`);
                showToast(
                  `🔁 Model ${fallbackFromModel} không khả dụng — đã tự chuyển sang ${am}`,
                  'warning'
                );
                showModelFallbackBadge(
                  am,
                  'amber',
                  'Model yêu cầu không khả dụng, app đã tự chuyển sang model dự phòng'
                );
                continue;
              }

              // C. Nếu lỗi do Key hoặc Quota (429, 403, Quota exceeded): Tự động xoay sang Key kế tiếp
              if (apiKeys.length > 1 && streamAttempts < maxStreamAttempts) {
                gKey = getSessionApiKey(cs, true);
                keyIndexNum = findSlotIndexForKey(gKey);
                recordKeyRequest(keyIndexNum, am);
                const updatedBadge = getKeyBadgeHtml(keyIndexNum, am);
                const headerEl = bD?.querySelector('.message-header');
                if (headerEl) {
                  const oldKeyBadge = headerEl.querySelector('.key-indicator-badge');
                  if (oldKeyBadge) oldKeyBadge.outerHTML = updatedBadge;
                }
                showToast(
                  `⚠️ Key #${keyIndexNum} bận hoặc hết hạn ngạch, đang xoay sang Key tiếp theo...`,
                  'warning'
                );
                continue;
              }

              // D. Đã hết lượt thử / hết key mà vẫn lỗi tạm thời: chuyển model dự phòng
              if (switchToFailoverModel(0, e.message, 'sky')) {
                liteSwitched = true;
                config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 32768);
                if (config.thinkingConfig) {
                  config.thinkingConfig = {
                    thinkingLevel: resolveThinkingLevel(am, thk) || thk,
                    includeThoughts: true,
                  };
                }
                // Lượt chạy lại bằng model mới có ngân sách thử riêng
                maxStreamAttempts += 1;
                continue;
              }
              break;
            }

            // 2. Nếu đã nhận được chữ (pS) mà bị đứt stream giữa chừng
            const isStreamCutoff =
              e.message &&
              (e.message.includes('Incomplete JSON') ||
                e.message.includes('network') ||
                e.message.includes('fetch') ||
                e.message.includes('Failed to fetch') ||
                e.message.includes('429') ||
                e.message.includes('quota') ||
                // Google cắt stream giữa chừng khi quá tải: nối tiếp thay vì dừng với ghi chú
                e.message.includes('503') ||
                e.message.includes('UNAVAILABLE'));

            if (
              pS &&
              isStreamCutoff &&
              streamAttempts < maxStreamAttempts &&
              !abortController.signal.aborted
            ) {
              console.warn(
                `Stream bị ngắt giữa chừng (${e.message}), tự động xoay key và nối tiếp luồng...`
              );
              showToast('⚡ Đang tự động kết nối lại để viết tiếp...', 'info');

              if (apiKeys.length > 1) {
                gKey = getSessionApiKey(cs, true);
                keyIndexNum = findSlotIndexForKey(gKey);
                recordKeyRequest(keyIndexNum, am);
                const updatedBadge = getKeyBadgeHtml(keyIndexNum, am);
                const headerEl = bD?.querySelector('.message-header');
                if (headerEl) {
                  const oldKeyBadge = headerEl.querySelector('.key-indicator-badge');
                  if (oldKeyBadge) oldKeyBadge.outerHTML = updatedBadge;
                }
              }

              const lastTail = finalResp.trim().slice(-150);
              contents.length = 0;
              if (DOM.toggleMemory?.checked && chatHistory.length > 0) {
                chatHistory.slice(-6).forEach(m => {
                  const cleanText = stripThinkingForCopy(m.text);
                  if (cleanText)
                    contents.push({
                      role: m.role === 'model' ? 'model' : 'user',
                      parts: [{ text: cleanText }],
                    });
                });
              }
              contents.push({
                role: 'user',
                parts: [
                  {
                    text: `Câu hỏi ban đầu: "${fP}"\n\nBạn đang trả lời dở đến đoạn sau:\n"...${lastTail}"\n\nHãy tiếp tục viết phần còn lại ngay từ điểm dừng trên, không lặp lại đoạn đã viết để hoàn tất câu trả lời.`,
                  },
                ],
              });

              continue;
            } else {
              if (pS) {
                console.warn('Lỗi stream giữa chừng:', e);
                finalResp += `\n\n*(⚠️ Quá trình tạo chữ bị ngắt giữa chừng: ${e.message || 'Mất kết nối stream'})*`;
                showToast('Đường truyền stream bị ngắt giữa chừng!', 'warning');
              }
              break;
            }
          }
        }

        if (streamFinishReason === 'MAX_TOKENS') {
          finalResp += '\n\n*(⚠️ Đã đạt giới hạn độ dài phản hồi của mô hình - Max Tokens)*';
          showToast('Phản hồi đạt giới hạn độ dài tối đa!', 'warning');
        } else if (streamFinishReason === 'SAFETY') {
          finalResp +=
            '\n\n*(⚠️ Nội dung tiếp theo bị ngắt bởi bộ lọc an toàn của Google - Safety)*';
          showToast('Nội dung bị dừng bởi bộ lọc an toàn của Google!', 'warning');
        } else if (streamFinishReason === 'RECITATION') {
          finalResp +=
            '\n\n*(⚠️ Nội dung tiếp theo bị ngắt do phát hiện trùng lặp bản quyền - Recitation)*';
          showToast('Nội dung bị dừng do phát hiện trùng lặp bản quyền!', 'warning');
        }

        console.warn(
          '[Gemini V73] stream chính: ' +
            mainChunks +
            ' chunk, trong đó ' +
            mainTextChunks +
            ' chunk có text | thinking=' +
            currentThinking.length +
            ' ký tự | content=' +
            currentContent.length +
            ' ký tự'
        );
        window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
          mainChunks,
          mainTextChunks,
          thinkingChars: currentThinking.length,
          contentChars: currentContent.length,
        });

        // FAIL-SAFE 2: Model chỉ trả về suy luận mà không có câu trả lời (Gemma 4 hay gặp khi bật
        // thinking) -> hỏi lại 1 lần với thinking TẮT để chắc chắn người dùng có câu trả lời.
        if (!currentContent.trim() && currentThinking.trim() && !abortController.signal.aborted) {
          try {
            console.warn(
              '[Gemma] Chỉ nhận được suy luận -> hỏi lại với thinking TẮT ở dạng STREAM để chữ chạy dần...'
            );
            // Báo trạng thái để UI không "đứng hình" trong lúc chờ request thứ hai (Google có thể xếp hàng ~10s)
            showToast('✍️ Đang lấy câu trả lời (Google chậm phản hồi)…', 'info');
            const retryStatusEl = bD?.querySelector('.thinking-streaming');
            if (retryStatusEl) {
              retryStatusEl.innerHTML =
                '<span class="thinking-spinner">⏳</span> <em>Đang lấy câu trả lời từ Google…</em>';
            }
            const retryCfg = /** @type {any} */ ({ ...config, maxOutputTokens: 8192 });
            if (isGemma) retryCfg.thinkingConfig = { thinkingLevel: 'minimal' };
            else delete retryCfg.thinkingConfig;
            const retryStream = await new GoogleGenAI({
              apiKey: gKey,
            }).models.generateContentStream({
              model: am,
              contents,
              config: retryCfg,
              abortSignal: abortController.signal,
            });
            let retryChunks = 0,
              retryTextChunks = 0;
            for await (const rck of retryStream) {
              retryChunks++;
              let rText = '';
              const rParts = rck.candidates?.[0]?.content?.parts;
              if (rParts) {
                for (const p of rParts) {
                  if (!p.thought && typeof p.text === 'string') rText += p.text;
                }
              } else {
                try {
                  rText = rck.text || '';
                } catch (_) {}
              }
              if (rText) {
                retryTextChunks++;
                currentContent += rText;
                finalResp = formatThinkingResponse(currentThinking, currentContent, 'Gemini');
                renderer.push(finalResp);
                pS = true;
              }
            }
            console.warn(
              '[Gemini V73] stream hỏi lại: ' +
                retryChunks +
                ' chunk, trong đó ' +
                retryTextChunks +
                ' chunk có text'
            );
            window.__jarvisTurnDebug = Object.assign(window.__jarvisTurnDebug || {}, {
              retryChunks,
              retryTextChunks,
            });
          } catch (rErr) {
            console.warn('[Gemma] Lần hỏi lại không thinking lỗi:', rErr?.message || rErr);
          }
        }

        if (currentThinking || currentContent) {
          // FAIL-SAFE: Nếu mô hình chỉ trả về suy luận mà quên xuất câu trả lời cuối:
          if (!currentContent.trim() && currentThinking.trim()) {
            currentContent = currentThinking.trim();
            currentThinking = '';
          }
          finalResp = formatFinalThinkingResponse(currentThinking, currentContent, 'Gemini');
        }
        await renderer.flush(finalResp);
      }

      if (!pS) {
        bD.remove();
        return showToast(formatGoogleApiError(lastErr), 'danger');
      }
      await saveTurn();
    } catch (err) {
      if (err.name === 'AbortError' || abortController?.signal.aborted) {
        showToast('Đã dừng phản hồi!', 'warning');
        await saveTurn(' (Đã dừng)');
      } else if (
        !pS &&
        !flushingOfflineQueue &&
        window.JarvisOfflineQueue &&
        window.JarvisOfflineQueue.isOfflineError(err)
      ) {
        // Mất mạng giữa chừng: giữ tin trong hàng đợi thay vì mất nội dung đã gõ.
        const queued = window.JarvisOfflineQueue.enqueue({
          sessionId: activeId,
          text: fP,
          model: effectiveModel,
          engine: currentEngine,
        });
        bD?.remove();
        renderPendingQueue();
        showToast(
          queued
            ? '📴 Mất kết nối — tin đã được xếp hàng, sẽ tự gửi lại khi có mạng.'
            : '📴 Mất kết nối và hàng đợi đã đầy (20 tin).',
          queued ? 'warning' : 'danger'
        );
      } else {
        showToast('Lỗi: ' + err.message, 'danger');
        bD?.remove();
      }
    } finally {
      const wasAborted = abortController?.signal?.aborted;
      // Dọn nhãn chờ/chấm nhấp nháy khi lượt kết thúc mà chưa từng có chunk (vd: người dùng bấm Dừng).
      // Nếu không, "⏳ Đang chờ Google…" sẽ nằm lại vĩnh viễn trên bong bóng tin nhắn.
      bD?.querySelector('.typing-bubble')?.remove();
      isProcessing = false;
      abortController = null;
      DOM.sendBtn.innerHTML = `<span>Gửi</span> <svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
      DOM.sendBtn.style.background = 'var(--primary)';

      // Còn tin trong hàng đợi mà đang có mạng (vd vừa gửi xong 1 tin) thì gửi tiếp
      if (
        !flushingOfflineQueue &&
        !isHandsFreeActive &&
        navigator.onLine &&
        window.JarvisOfflineQueue?.count()
      ) {
        setTimeout(() => flushOfflineQueue(), 800);
      }

      // --- HANDS-FREE VOICE FLOW COMPLETION HOOK ---
      if (isHandsFreeActive) {
        if (finalResp && !wasAborted) {
          isHandsFreeSpeaking = true;
          const statusText = $('hf-status-text');
          if (statusText)
            statusText.innerHTML =
              '<span style="color:#8b5cf6;font-weight:600;">🔊 Jarvis đang trả lời (Nam Bộ)...</span>';

          playTextAudio(finalResp, {
            onEnd: () => {
              isHandsFreeSpeaking = false;
              if (isHandsFreeActive) {
                const status = $('hf-status-text');
                if (status)
                  status.innerHTML =
                    '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
                const prev = $('hf-transcript-preview');
                if (prev) prev.innerText = '';
                setTimeout(() => {
                  if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                    startHandsFreeListener();
                  }
                }, 300);
              }
            },
            onError: () => {
              isHandsFreeSpeaking = false;
              if (isHandsFreeActive) {
                const status = $('hf-status-text');
                if (status)
                  status.innerHTML =
                    '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
                setTimeout(() => {
                  if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
                    startHandsFreeListener();
                  }
                }, 300);
              }
            },
          });
        } else {
          setTimeout(() => {
            if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
              startHandsFreeListener();
            }
          }, 300);
        }
      }
    }
  };
};
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', __initSendPipeline);
else __initSendPipeline();
