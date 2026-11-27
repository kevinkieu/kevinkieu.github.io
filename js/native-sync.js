// Phase 4 native-sync (extracted from app.js)
function syncSessionsToNative() {
  if (!window.JarvisNativeBridge) return;
  clearTimeout(_nativeSyncTimer);
  _nativeSyncTimer = setTimeout(async () => {
    try {
      const all = await getAllFromDB();
      if (all && all.length > 0) {
        saveToNativeBridge('jarvis_sessions_backup', JSON.stringify(all));
      }
    } catch {}
  }, 300);
}

async function updateConfig() {
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    Object.assign(s, {
      sys: DOM.sysInst.value,
      mod: DOM.model.value,
      // Lưu kèm provider đã chọn để lần mở lại khôi phục đúng option khi trùng model id
      modProvider: window.DynamicProviders?.getSelectedModelProvider?.() || null,
      engine: DOM.engineSel.value,
      keySel: getGoogleKeySlot(),
      tmp: DOM.temp.value,
      tpp: DOM.topP.value,
      top: DOM.topK.value,
      thk: DOM.thinking.value,
      useGlob: DOM.toggleGlob.checked,
      sch: DOM.toggleSearch.checked,
      schEngine: DOM.searchEngineSel.value,
      mem: DOM.toggleMemory.checked,
      rag: DOM.toggleRagEmbedding ? DOM.toggleRagEmbedding.checked : true,
    });
    if (DOM.engineSel.value === 'stream') {
      s.assignedApiKey = null;
    } else if (DOM.engineSel.value === 'interactions') {
      const sel = getGoogleKeySlot();
      if (sel !== 'auto') {
        const idx = parseInt(sel, 10) + 1;
        let mk = (
          ls.getItem(`jarvis_api_${idx}`) ||
          ls.getItem(`huanmu_api_${idx}`) ||
          ls.getItem(`javiss_api_${idx}`) ||
          ''
        ).trim();
        if (mk.startsWith('JVENC_') || mk.startsWith('ENC_')) mk = deobfuscateKey(mk);
        if (mk) s.assignedApiKey = mk;
      }
    }
    await saveToDB(s);
    renderSel();
  }
  DOM.searchEngineBox.style.display = DOM.toggleSearch.checked ? 'block' : 'none';
}

DOM.model.addEventListener('change', () => {
  const s = sessions.find(x => x.id === activeId);
  const nextMod = DOM.model.value;
  // Mỗi model có bộ mức Think Depth khác nhau (effort / bật-tắt / ngân sách token)
  // -> nhớ mức của model vừa rời đi để quay lại không bị mất cấu hình.
  if (s && s.mod && s.mod !== nextMod) {
    s.thkMap = Object.assign({}, s.thkMap || {}, { [s.mod]: s.thk || DOM.thinking.value });
  }
  updateThinkingVisibility();
  // Qwen4 Max mặc định Think Depth = Low khi chọn model này
  if (nextMod === 'qwen4-max:free' && DOM.thinking) DOM.thinking.value = 'low';
  // Khôi phục mức đã lưu cho model này nếu model đó có lưu và mức còn hợp lệ
  const savedThk = s && s.thkMap ? s.thkMap[nextMod] : null;
  if (savedThk && Array.from(DOM.thinking.options).some(o => o.value === savedThk)) {
    DOM.thinking.value = savedThk;
  }
  updateConfig();
  updateKeyQuotaUI();
});
DOM.engineSel.addEventListener('change', updateConfig);
[DOM.sysInst, DOM.toggleGlob, DOM.toggleSearch, DOM.searchEngineSel, DOM.thinking].forEach(el =>
  el?.addEventListener?.('change', updateConfig)
);
// key-pool-select has its own change handler in renderKeyPoolMenu which calls setGoogleKeySlot

if (DOM.btnToggleSessionMem) {
  DOM.btnToggleSessionMem.onclick = () => {
    const s = sessions.find(x => x.id === activeId);
    const cur = s ? s.mem !== false : DOM.toggleMemory.checked;
    const next = !cur;
    DOM.toggleMemory.checked = next;
    if (DOM.sessionMemState) {
      DOM.sessionMemState.innerText = next ? 'BẬT' : 'TẮT';
      DOM.sessionMemState.style.color = next ? 'var(--success)' : 'var(--text-muted)';
    }
    if (s) {
      s.mem = next;
      saveToDB(s);
    }
    showToast(
      `Ngữ cảnh trò chuyện [Phiên này]: ${next ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`,
      next ? 'success' : 'warning'
    );
  };
}

if (typeof syncSessionsToNative !== 'undefined') window.syncSessionsToNative = syncSessionsToNative;
if (typeof updateConfig !== 'undefined') window.updateConfig = updateConfig;
