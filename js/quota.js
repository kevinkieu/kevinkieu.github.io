/* ==========================================================================
   Jarvis AI - Distributed Key Quota & Selection Tracker (js/quota.js)
   Quản lý hạn ngạch 20 RPD cho Gemini 4 Hydrogen, 3.6 Flash & 3.8 Flash trên 10 Key
   ========================================================================== */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;
  const showToast = (msg, type) => (typeof window.showToast === 'function') ? window.showToast(msg, type) : console.log(`[${type}] ${msg}`);
  const escapeHtml = str => (typeof window.escapeHtml === 'function') ? window.escapeHtml(str) : String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;
  const saveToDB = s => (typeof window.saveToDB === 'function') ? window.saveToDB(s) : Promise.resolve();

  function getMyDeviceId() {
    let devId = ls.getItem('jarvis_device_id');
    if (!devId) {
      const prefix = ('ontouchstart' in window) ? 'mob_' : 'pc_';
      devId = prefix + Math.random().toString(36).substring(2, 8);
      ls.setItem('jarvis_device_id', devId);
    }
    return devId;
  }

  // 14:00 giờ Việt Nam (UTC+7) làm mốc chuyển giao chu kỳ 24h của Google AI Studio (00:00 Pacific Time)
  function getCurrentQuotaCycle() {
    const now = new Date();
    const vnTimeMs = now.getTime() + (now.getTimezoneOffset() * 60000) + (7 * 3600000);
    const shifted = new Date(vnTimeMs - 14 * 3600000);
    const y = shifted.getFullYear();
    const m = String(shifted.getMonth() + 1).padStart(2, '0');
    const d = String(shifted.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getFlashModelBucket(modelName) {
    const m = (modelName || '').toLowerCase();
    if (m.includes('hydrogen') || m.includes('gemini-4')) return 'hydrogen';
    if (m.includes('3.8-flash') || m.includes('3.8')) return '3.8';
    if (m.includes('3.6-flash') || m.includes('3.6')) return '3.6';
    return null;
  }

  function getSelectedFlashModelBucket() {
    try {
      const modEl = $('model-select');
      const modVal = modEl ? modEl.value : 'gemini-4-hydrogen';
      return getFlashModelBucket(modVal) || 'hydrogen';
    } catch (_) {
      return 'hydrogen';
    }
  }

  function normalizeSlotData(slotObj) {
    if (!slotObj || typeof slotObj !== 'object') return { 'hydrogen': {}, '3.6': {}, '3.8': {} };
    if (slotObj['hydrogen'] || slotObj['3.6'] || slotObj['3.8']) {
      return {
        'hydrogen': (typeof slotObj['hydrogen'] === 'object' && slotObj['hydrogen']) ? slotObj['hydrogen'] : {},
        '3.6': (typeof slotObj['3.6'] === 'object' && slotObj['3.6']) ? slotObj['3.6'] : {},
        '3.8': (typeof slotObj['3.8'] === 'object' && slotObj['3.8']) ? slotObj['3.8'] : {}
      };
    }
    // Khả năng tương thích ngược (legacy flat structure): gán về 3.8
    const legacyMap = {};
    for (const [k, v] of Object.entries(slotObj)) {
      if (typeof v === 'number') legacyMap[k] = v;
    }
    return { 'hydrogen': {}, '3.6': {}, '3.8': legacyMap };
  }

  function loadKeyUsageData() {
    const curCycle = getCurrentQuotaCycle();
    try {
      const raw = ls.getItem('jarvis_key_usage_flash');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.cycle === curCycle && data.keys) {
          return data;
        }
      }
    } catch (_) {}
    const fresh = { cycle: curCycle, keys: {} };
    ls.setItem('jarvis_key_usage_flash', JSON.stringify(fresh));
    return fresh;
  }

  function saveKeyUsageData(data) {
    try {
      ls.setItem('jarvis_key_usage_flash', JSON.stringify(data));
    } catch (_) {}
  }

  function setKeyUsageData(data) {
    if (!data || typeof data !== 'object' || !data.keys) return;
    const curCycle = getCurrentQuotaCycle();
    const value = data.cycle === curCycle ? data : { cycle: curCycle, keys: {} };
    saveKeyUsageData(value);
    updateKeyQuotaUI();
  }

  function getKeyUsageCount(slotIndex, specificModelBucket = null) {
    const data = loadKeyUsageData();
    const rawSlot = data.keys[String(slotIndex)];
    const normSlot = normalizeSlotData(rawSlot);
    const targetBucket = specificModelBucket || getSelectedFlashModelBucket();
    const bucketObj = normSlot[targetBucket] || {};
    return Object.values(bucketObj).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }

  function isLocalKeyUsageAhead(remoteUsage) {
    if (!remoteUsage || !remoteUsage.keys) return true;
    const curCycle = getCurrentQuotaCycle();
    if (remoteUsage.cycle !== curCycle) return false;
    const localData = loadKeyUsageData();
    for (const [slotKey, localSlotRaw] of Object.entries(localData.keys)) {
      const localNorm = normalizeSlotData(localSlotRaw);
      const remoteNorm = normalizeSlotData(remoteUsage.keys?.[slotKey]);
      for (const b of ['hydrogen', '3.6', '3.8']) {
        for (const [devId, count] of Object.entries(localNorm[b] || {})) {
          const remoteCount = remoteNorm[b]?.[devId] || 0;
          if (count > remoteCount) return true;
        }
      }
    }
    return false;
  }

  function mergeRemoteKeyUsage(remoteUsage) {
    if (!remoteUsage || !remoteUsage.cycle || !remoteUsage.keys) return false;
    const curCycle = getCurrentQuotaCycle();
    let localData = loadKeyUsageData();
    let changed = false;

    if (remoteUsage.cycle === curCycle) {
      for (const [slotKey, remoteSlotRaw] of Object.entries(remoteUsage.keys)) {
        if (!localData.keys[slotKey]) localData.keys[slotKey] = { 'hydrogen': {}, '3.6': {}, '3.8': {} };
        else localData.keys[slotKey] = normalizeSlotData(localData.keys[slotKey]);

        const remoteNorm = normalizeSlotData(remoteSlotRaw);
        for (const b of ['hydrogen', '3.6', '3.8']) {
          if (!localData.keys[slotKey][b]) localData.keys[slotKey][b] = {};
          for (const [devId, remoteCount] of Object.entries(remoteNorm[b] || {})) {
            const localCount = localData.keys[slotKey][b][devId] || 0;
            if (remoteCount > localCount) {
              localData.keys[slotKey][b][devId] = remoteCount;
              changed = true;
            }
          }
        }
      }
    }
    if (changed) {
      saveKeyUsageData(localData);
      updateKeyQuotaUI();
    }
    return changed;
  }

  function recordKeyRequest(slotIndex, model) {
    const bucket = getFlashModelBucket(model);
    if (!bucket) return; // Chỉ tính model Gemini 4 Hydrogen, 3.6 và 3.8 Flash (20 RPD mỗi con)

    const data = loadKeyUsageData();
    const devId = getMyDeviceId();
    const slotKey = String(slotIndex);
    if (!data.keys[slotKey]) data.keys[slotKey] = { 'hydrogen': {}, '3.6': {}, '3.8': {} };
    else data.keys[slotKey] = normalizeSlotData(data.keys[slotKey]);

    if (!data.keys[slotKey][bucket]) data.keys[slotKey][bucket] = {};
    data.keys[slotKey][bucket][devId] = (data.keys[slotKey][bucket][devId] || 0) + 1;

    saveKeyUsageData(data);
    updateKeyQuotaUI();
    if (typeof window.JarvisSync?.scheduleAutoSync === 'function') {
      window.JarvisSync.scheduleAutoSync(5000);
    }
  }

  function resetKeyUsageToday() {
    const curCycle = getCurrentQuotaCycle();
    const fresh = { cycle: curCycle, keys: {} };
    saveKeyUsageData(fresh);
    updateKeyQuotaUI();
    if (typeof window.JarvisSync?.scheduleAutoSync === 'function') {
      window.JarvisSync.scheduleAutoSync(2000);
    }
  }

  function findSlotIndexForKey(key) {
    if (!key) return 1;
    for (let i = 1; i <= 10; i++) {
      let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || "").trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      if (k === key) return i;
    }
    return 1;
  }

  function getActiveKeySlot() {
    try {
      const selEl = $('api-key-select');
      const sel = selEl ? selEl.value : 'auto';
      if (sel !== 'auto') {
        return parseInt(sel, 10) + 1;
      }
      if (typeof window.sessions !== 'undefined' && Array.isArray(window.sessions) && typeof window.activeId !== 'undefined') {
        const cs = window.sessions.find(x => x.id === window.activeId);
        if (cs?.assignedApiKey) {
          return findSlotIndexForKey(cs.assignedApiKey);
        }
      }
    } catch (_) {}
    return 1;
  }

  function updateKeyQuotaUI() {
    const curSlot = getActiveKeySlot();
    const curBucket = getSelectedFlashModelBucket(); // 'hydrogen' | '3.8' | '3.6'
    const count = getKeyUsageCount(curSlot, curBucket);
    const name = (ls.getItem(`jarvis_api_name_${curSlot}`) || ls.getItem(`huanmu_api_name_${curSlot}`) || `Key ${curSlot}`).trim();

    // 1. Cập nhật Chip trên Header: Hiển thị rõ model đang active (H4, 3.6 hay 3.8)
    const quotaLabel = $('key-quota-label');
    const quotaDot = $('key-quota-dot');
    const quotaBtn = $('btn-key-quota-header');

    if (quotaLabel && quotaDot && quotaBtn) {
      const shortName = name.length > 7 ? name.slice(0, 7) + '..' : name;
      const bucketDisplay = curBucket === 'hydrogen' ? 'H4' : curBucket;
      quotaLabel.innerText = `🔑 ${shortName}: ${count}/20 (${bucketDisplay})`;
      if (count < 15) {
        quotaDot.style.background = '#10b981';
        quotaBtn.style.borderColor = 'var(--border)';
      } else if (count < 20) {
        quotaDot.style.background = '#f59e0b';
        quotaBtn.style.borderColor = 'rgba(245,158,11,0.5)';
      } else {
        quotaDot.style.background = '#ef4444';
        quotaBtn.style.borderColor = 'rgba(239,68,68,0.5)';
      }
    }

    // 2. Cập nhật các badge trong modal Cấu hình (api-key-badge-1..10): Hiển thị cả H4, 3.6 và 3.8
    for (let i = 1; i <= 10; i++) {
      const badge = $(`api-key-badge-${i}`);
      if (badge) {
        const uH = getKeyUsageCount(i, 'hydrogen');
        const u36 = getKeyUsageCount(i, '3.6');
        const u38 = getKeyUsageCount(i, '3.8');
        badge.innerHTML = `<span style="color:${uH >= 20 ? '#ef4444' : uH >= 15 ? '#f59e0b' : '#a855f7'}">H4: ${uH}/20</span> | <span style="color:${u36 >= 20 ? '#ef4444' : u36 >= 15 ? '#f59e0b' : '#10b981'}">3.6: ${u36}/20</span> | <span style="color:${u38 >= 20 ? '#ef4444' : u38 >= 15 ? '#f59e0b' : '#3b82f6'}">3.8: ${u38}/20</span>`;
      }
    }

    // 3. Nếu Popover đang mở, re-render danh sách 10 Key
    renderKeyQuotaPopoverList();
  }

  function getKeyBadgeHtml(keyNum, modelName = null) {
    if (!keyNum) return '';
    // Kiểm tra nếu là OpenRouter key (model OpenRouter)
    const isOR = (modelName && (modelName.includes('nvidia/') || modelName.includes('particle-ai/') || modelName.includes('baidu/') || modelName.includes('google/gemma-4-') || modelName.includes(':free')));
    let n, label;
    if (isOR) {
      n = (ls.getItem(`jarvis_openrouter_api_name_${keyNum}`) || '').trim();
      label = n ? `OR Key #${keyNum} (${n})` : `OR Key #${keyNum}`;
    } else {
      n = (ls.getItem(`jarvis_api_name_${keyNum}`) || ls.getItem(`huanmu_api_name_${keyNum}`) || '').trim();
      label = n ? `Key #${keyNum} (${n})` : `Key #${keyNum}`;
    }
    const bucket = modelName ? getFlashModelBucket(modelName) : getSelectedFlashModelBucket();
    const bucketTag = bucket ? (bucket === 'hydrogen' ? ' · H4' : ` · ${bucket}`) : '';
    return `<span class="key-indicator-badge" title="Tin nhắn này được phản hồi bằng ${isOR ? 'OpenRouter' : 'Google'} ${escapeHtml(label)}${bucketTag}" style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:${isOR ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)'};color:${isOR ? '#f59e0b' : '#3b82f6'};font-weight:600;margin-left:6px;border:1px solid ${isOR ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'};display:inline-flex;align-items:center;gap:3px;vertical-align:middle;cursor:default;">${isOR ? '🛰️' : '🔑'} ${escapeHtml(label)}${bucketTag}</span>`;
  }

  function renderKeyQuotaPopoverList() {
    const listEl = $('key-quota-list');
    if (!listEl) return;
    const curSlot = getActiveKeySlot();
    const curBucket = getSelectedFlashModelBucket(); // 'hydrogen' | '3.8' | '3.6'

    let html = '';
    let hasAnyKey = false;

    for (let i = 1; i <= 10; i++) {
      let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || "").trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
      const n = (ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || `Key ${i}`).trim();
      if (!k) continue;

      hasAnyKey = true;
      const uH = getKeyUsageCount(i, 'hydrogen');
      const u36 = getKeyUsageCount(i, '3.6');
      const u38 = getKeyUsageCount(i, '3.8');
      const isCurrent = (i === curSlot);

      // Highlight badge của model đang chọn
      const badgeHStyle = curBucket === 'hydrogen'
        ? `background:${uH >= 20 ? 'rgba(239,68,68,0.2)' : 'rgba(168,85,247,0.2)'};color:${uH >= 20 ? '#ef4444' : '#a855f7'};font-weight:800;border:1.5px solid ${uH >= 20 ? '#ef4444' : '#a855f7'}`
        : `background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border)`;

      const badge36Style = curBucket === '3.6' 
        ? `background:${u36 >= 20 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};color:${u36 >= 20 ? '#ef4444' : '#10b981'};font-weight:800;border:1.5px solid ${u36 >= 20 ? '#ef4444' : '#10b981'}`
        : `background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border)`;

      const badge38Style = curBucket === '3.8'
        ? `background:${u38 >= 20 ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'};color:${u38 >= 20 ? '#ef4444' : '#3b82f6'};font-weight:800;border:1.5px solid ${u38 >= 20 ? '#ef4444' : '#3b82f6'}`
        : `background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid var(--border)`;

      const activeBorder = isCurrent ? 'border:1.5px solid var(--primary);background:rgba(59,130,246,0.08);' : 'border:1px solid var(--border);background:var(--bg-card);';

      html += `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 9px;border-radius:var(--radius-sm);${activeBorder}font-size:0.78rem;">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;min-width:0;">
            <span style="font-weight:700;color:${isCurrent ? 'var(--primary)' : 'var(--text-muted)'};min-width:20px;">#${i}</span>
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <strong style="color:var(--text-main);">${escapeHtml(n)}</strong>
              <span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px;">(${k.slice(0, 5)}...)</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            <span title="Hạn ngạch Gemini 4 Hydrogen (20 RPD)" style="font-size:0.68rem;padding:2px 5px;border-radius:4px;${badgeHStyle}">
              H4: ${uH}/20
            </span>
            <span title="Hạn ngạch 3.6 Flash (20 RPD)" style="font-size:0.68rem;padding:2px 5px;border-radius:4px;${badge36Style}">
              3.6: ${u36}/20
            </span>
            <span title="Hạn ngạch 3.8 Flash (20 RPD)" style="font-size:0.68rem;padding:2px 5px;border-radius:4px;${badge38Style}">
              3.8: ${u38}/20
            </span>
            ${isCurrent ? '<span style="font-size:0.7rem;color:var(--primary);font-weight:700;margin-left:2px;">●</span>' : `<button class="btn" onclick="window.selectKeySlotQuick(${i})" style="padding:2px 6px;font-size:0.7rem;margin-left:2px;">Chọn</button>`}
          </div>
        </div>
      `;
    }

    if (!hasAnyKey) {
      html = '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:12px;">Chưa có Google API Key nào được cấu hình.</div>';
    }

    listEl.innerHTML = html;
  }

  function selectKeySlotQuick(slotIndex) {
    const selEl = $('api-key-select');
    if (selEl) {
      selEl.value = String(slotIndex - 1);
      selEl.dispatchEvent(new Event('change'));
    }
    if (typeof window.sessions !== 'undefined' && Array.isArray(window.sessions) && typeof window.activeId !== 'undefined') {
      const cs = window.sessions.find(x => x.id === window.activeId);
      if (cs) {
        let manualKey = (ls.getItem(`jarvis_api_${slotIndex}`) || ls.getItem(`huanmu_api_${slotIndex}`) || "").trim();
        if (manualKey.startsWith('JVENC_') || manualKey.startsWith('ENC_')) manualKey = deobfuscateKey(manualKey);
        cs.assignedApiKey = manualKey;
        cs.keySel = String(slotIndex - 1);
        saveToDB(cs);
      }
    }
    updateKeyQuotaUI();
    showToast(`🔑 Đã chuyển sang Key #${slotIndex}!`, "info");
  }

  function openKeyQuotaModal() {
    updateKeyQuotaUI();
    const modal = $('key-quota-modal');
    const overlay = $('modal-overlay');
    if (modal) modal.style.display = 'flex';
    if (overlay) overlay.style.display = 'block';
  }

  function closeKeyQuotaModal() {
    const modal = $('key-quota-modal');
    const overlay = $('modal-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  function initQuotaEvents() {
    const quotaBtn = $('btn-key-quota-header');
    if (quotaBtn) {
      quotaBtn.onclick = (e) => {
        e.stopPropagation();
        openKeyQuotaModal();
      };
    }
    $('btn-close-quota-modal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeKeyQuotaModal();
    });
    $('btn-close-quota-popover')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeKeyQuotaModal();
    });

    const toggleSkipExhausted = $('toggle-skip-exhausted-keys');
    if (toggleSkipExhausted) {
      toggleSkipExhausted.checked = ls.getItem('jarvis_skip_exhausted_keys') !== 'false';
      toggleSkipExhausted.onchange = () => {
        ls.setItem('jarvis_skip_exhausted_keys', toggleSkipExhausted.checked ? 'true' : 'false');
        showToast(toggleSkipExhausted.checked ? "Đã bật tự động né key đạt 20/20 RPD!" : "Đã tắt tự động né key", "info");
      };
    }

    $('btn-reset-quota-manual')?.addEventListener('click', () => {
      if (confirm("Bạn có chắc chắn muốn reset bộ đếm hôm nay của tất cả các key về 0/20 không?")) {
        resetKeyUsageToday();
        updateKeyQuotaUI();
        showToast("🔄 Đã reset bộ đếm hôm nay về 0/20!", "success");
      }
    });

    $('btn-open-settings-keys')?.addEventListener('click', () => {
      closeKeyQuotaModal();
      $('btn-open-settings')?.click();
      setTimeout(() => {
        $('api-keys-container')?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updateKeyQuotaUI();
      }
    });
  }

  // Khởi động UI hạn ngạch
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initQuotaEvents();
      updateKeyQuotaUI();
    });
  } else {
    initQuotaEvents();
    updateKeyQuotaUI();
  }

  // Xuất các hàm ra window để app.js, sync.js và inline HTML gọi
  window.loadKeyUsageData = loadKeyUsageData;
  window.saveKeyUsageData = saveKeyUsageData;
  window.setKeyUsageData = setKeyUsageData;
  window.getKeyUsageCount = getKeyUsageCount;
  window.recordKeyRequest = recordKeyRequest;
  window.mergeRemoteKeyUsage = mergeRemoteKeyUsage;
  window.isLocalKeyUsageAhead = isLocalKeyUsageAhead;
  window.updateKeyQuotaUI = updateKeyQuotaUI;
  window.getKeyBadgeHtml = getKeyBadgeHtml;
  window.getFlashModelBucket = getFlashModelBucket;
  window.getSelectedFlashModelBucket = getSelectedFlashModelBucket;
  window.findSlotIndexForKey = findSlotIndexForKey;
  window.getActiveKeySlot = getActiveKeySlot;
  window.selectKeySlotQuick = selectKeySlotQuick;
  window.openKeyQuotaModal = openKeyQuotaModal;
  window.closeKeyQuotaModal = closeKeyQuotaModal;
  window.resetKeyUsageToday = resetKeyUsageToday;

  // OpenRouter key rotation + usage counter (5 keys)
  function normalizeOpenRouterUsageData(data) {
    const normalized = { cycle: data?.cycle || getCurrentQuotaCycle(), keys: {} };
    if (!data?.keys || typeof data.keys !== 'object') return normalized;
    for (const [slotKey, slot] of Object.entries(data.keys)) {
      if (!slot || typeof slot !== 'object') continue;
      normalized.keys[slotKey] = {};
      for (const [model, countOrDevices] of Object.entries(slot)) {
        if (countOrDevices && typeof countOrDevices === 'object' && !Array.isArray(countOrDevices)) {
          normalized.keys[slotKey][model] = {};
          for (const [deviceId, count] of Object.entries(countOrDevices)) {
            normalized.keys[slotKey][model][deviceId] = Number(count) || 0;
          }
        } else {
          // Dữ liệu cũ không có device ID: giữ nguyên tổng cũ dưới khóa legacy.
          normalized.keys[slotKey][model] = { legacy: Number(countOrDevices) || 0 };
        }
      }
    }
    return normalized;
  }

  let openRouterUsageData = { cycle: getCurrentQuotaCycle(), keys: {} };
  try {
    const raw = ls.getItem('jarvis_openrouter_usage');
    if (raw) openRouterUsageData = normalizeOpenRouterUsageData(JSON.parse(raw));
  } catch (_) {}
  if (!openRouterUsageData.keys) openRouterUsageData.keys = {};
  // Sang chu kỳ mới (14:00 giờ VN) thì bộ đếm OpenRouter tự về 0 như bên Google
  if (openRouterUsageData.cycle !== getCurrentQuotaCycle()) {
    openRouterUsageData = { cycle: getCurrentQuotaCycle(), keys: {} };
    saveOpenRouterUsageData();
  }

  function saveOpenRouterUsageData() {
    try { ls.setItem('jarvis_openrouter_usage', JSON.stringify(openRouterUsageData)); } catch (_) {}
  }

  function loadOpenRouterUsageData() {
    const curCycle = getCurrentQuotaCycle();
    if (openRouterUsageData.cycle !== curCycle) openRouterUsageData = { cycle: curCycle, keys: {} };
    if (!openRouterUsageData.keys || typeof openRouterUsageData.keys !== 'object') openRouterUsageData.keys = {};
    openRouterUsageData = normalizeOpenRouterUsageData(openRouterUsageData);
    return JSON.parse(JSON.stringify(openRouterUsageData));
  }

  function setOpenRouterUsageData(data) {
    if (!data || typeof data !== 'object' || !data.keys) return;
    const curCycle = getCurrentQuotaCycle();
    openRouterUsageData = data.cycle === curCycle ? normalizeOpenRouterUsageData(data) : { cycle: curCycle, keys: {} };
    saveOpenRouterUsageData();
    updateOpenRouterQuotaUI();
  }

  function mergeRemoteOpenRouterUsage(remoteUsage) {
    if (!remoteUsage || remoteUsage.cycle !== getCurrentQuotaCycle() || !remoteUsage.keys) return false;
    loadOpenRouterUsageData();
    let changed = false;
    for (const [slotKey, remoteSlot] of Object.entries(remoteUsage.keys)) {
      if (!remoteSlot || typeof remoteSlot !== 'object') continue;
      if (!openRouterUsageData.keys[slotKey]) openRouterUsageData.keys[slotKey] = {};
      const normalizedRemoteSlot = normalizeOpenRouterUsageData({ keys: { [slotKey]: remoteSlot } }).keys[slotKey];
      for (const [model, remoteDevices] of Object.entries(normalizedRemoteSlot)) {
        if (!openRouterUsageData.keys[slotKey][model]) openRouterUsageData.keys[slotKey][model] = {};
        for (const [deviceId, count] of Object.entries(remoteDevices)) {
          const remoteCount = Number(count) || 0;
          const localCount = Number(openRouterUsageData.keys[slotKey][model][deviceId]) || 0;
          if (remoteCount > localCount) {
            openRouterUsageData.keys[slotKey][model][deviceId] = remoteCount;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      saveOpenRouterUsageData();
      updateOpenRouterQuotaUI();
    }
    return changed;
  }

  function isLocalOpenRouterUsageAhead(remoteUsage) {
    if (!remoteUsage || remoteUsage.cycle !== getCurrentQuotaCycle() || !remoteUsage.keys) return false;
    const local = loadOpenRouterUsageData();
    for (const [slotKey, localSlot] of Object.entries(local.keys)) {
      for (const [model, devices] of Object.entries(localSlot || {})) {
        for (const [deviceId, count] of Object.entries(devices || {})) {
          if ((Number(count) || 0) > (Number(remoteUsage.keys?.[slotKey]?.[model]?.[deviceId]) || 0)) return true;
        }
      }
    }
    return false;
  }

  function getOpenRouterUsageCount(slotIndex) {
    const slot = openRouterUsageData.keys[String(slotIndex)];
    if (!slot) return 0;
    return Object.values(slot).reduce((sum, devices) => sum + Object.values(devices || {}).reduce((modelSum, count) => modelSum + (Number(count) || 0), 0), 0);
  }

  function recordOpenRouterRequest(slotIndex, model) {
    const curCycle = getCurrentQuotaCycle();
    if (openRouterUsageData.cycle !== curCycle) {
      openRouterUsageData = { cycle: curCycle, keys: {} };
    }
    const slotKey = String(slotIndex);
    const modelKey = model || 'unknown';
    if (!openRouterUsageData.keys[slotKey]) openRouterUsageData.keys[slotKey] = {};
    if (!openRouterUsageData.keys[slotKey][modelKey]) openRouterUsageData.keys[slotKey][modelKey] = {};
    const deviceId = getMyDeviceId();
    openRouterUsageData.keys[slotKey][modelKey][deviceId] = (openRouterUsageData.keys[slotKey][modelKey][deviceId] || 0) + 1;
    saveOpenRouterUsageData();
    updateOpenRouterQuotaUI();
    if (typeof window.JarvisSync?.scheduleAutoSync === 'function') {
      window.JarvisSync.scheduleAutoSync(5000);
    }
  }

  function updateOpenRouterQuotaUI() {
    // Cập nhật badge trong ô nhập OpenRouter
    for (let i = 1; i <= 5; i++) {
      const badge = $(`openrouter-key-badge-${i}`);
      if (badge) {
        const u = getOpenRouterUsageCount(i);
        badge.innerHTML = `OR: ${u} req`;
      }
    }
    // Popover OpenRouter (nếu có)
    const listEl = $('openrouter-key-quota-list');
    if (listEl) {
      let html = '';
      let hasAnyKey = false;
      for (let i = 1; i <= 5; i++) {
        let k = (ls.getItem(`jarvis_openrouter_api_${i}`) || '').trim();
        if (k.startsWith('JVENC_') || k.startsWith('ENC_')) k = deobfuscateKey(k);
        const n = (ls.getItem(`jarvis_openrouter_api_name_${i}`) || `OR Key ${i}`).trim();
        if (!k) continue;
        hasAnyKey = true;
        const u = getOpenRouterUsageCount(i);
        html += `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 9px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-card);font-size:0.78rem;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-weight:700;color:var(--text-muted);min-width:20px;">#${i}</span>
              <div><strong>${escapeHtml(n)}</strong> <span style="font-size:0.7rem;color:var(--text-muted);">(${k.slice(0, 5)}...)</span></div>
            </div>
            <span style="font-size:0.68rem;padding:2px 5px;border-radius:4px;background:rgba(245,158,11,0.15);color:#f59e0b;font-weight:600;">${u} req</span>
          </div>
        `;
      }
      listEl.innerHTML = hasAnyKey ? html : '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:12px;">Chưa có OpenRouter key nào.</div>';
    }
  }

  window.getOpenRouterUsageCount = getOpenRouterUsageCount;
  window.recordOpenRouterRequest = recordOpenRouterRequest;
  window.updateOpenRouterQuotaUI = updateOpenRouterQuotaUI;
  window.loadOpenRouterUsageData = loadOpenRouterUsageData;
  window.setOpenRouterUsageData = setOpenRouterUsageData;
  window.mergeRemoteOpenRouterUsage = mergeRemoteOpenRouterUsage;
  window.isLocalOpenRouterUsageAhead = isLocalOpenRouterUsageAhead;

})();
