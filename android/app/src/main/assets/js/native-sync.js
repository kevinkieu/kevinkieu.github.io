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

if (typeof syncSessionsToNative !== 'undefined') window.syncSessionsToNative = syncSessionsToNative;
if (typeof updateConfig !== 'undefined') window.updateConfig = updateConfig;

function scheduleAutoSync(delay = 10000) {
  if (window.JarvisSync && typeof window.JarvisSync.scheduleAutoSync === 'function') {
    window.JarvisSync.scheduleAutoSync(delay);
  }
}
if (typeof scheduleAutoSync !== 'undefined') window.scheduleAutoSync = scheduleAutoSync;
