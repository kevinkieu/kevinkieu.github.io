/* ==========================================================================
   Jarvis AI - GitHub Gist Cloud Sync & 2-Way Smart Merge Module
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;

  // Bridge helpers to app.js core
  const showToast = (msg, type) =>
    typeof window.showToast === 'function'
      ? window.showToast(msg, type)
      : console.log(`[${type}] ${msg}`);
  const getAllFromDB = () =>
    typeof window.getAllFromDB === 'function' ? window.getAllFromDB() : Promise.resolve([]);
  const clearAllDB = () =>
    typeof window.clearAllDB === 'function' ? window.clearAllDB() : Promise.resolve();
  const sanitizeSessionForBackup = s =>
    typeof window.sanitizeSessionForBackup === 'function' ? window.sanitizeSessionForBackup(s) : s;
  const renderFolders = () => window.renderFolders && window.renderFolders();
  const renderSnippets = () => window.renderSnippets && window.renderSnippets();
  const renderSel = () => window.renderSel && window.renderSel();
  const renderTabs = () => window.renderTabs && window.renderTabs();
  const switchSess = id => window.switchSess && window.switchSess(id);
  const appendMsg = (r, t, i, u) => window.appendMsg && window.appendMsg(r, t, i, u);
  const getGoogleKeysList = all =>
    typeof window.getGoogleKeysList === 'function' ? window.getGoogleKeysList(all) : [];
  const getGoogleKeyNamesList = () =>
    typeof window.getGoogleKeyNamesList === 'function' ? window.getGoogleKeyNamesList() : [];
  const setGoogleKeyNamesList = n =>
    window.setGoogleKeyNamesList && window.setGoogleKeyNamesList(n);
  const setGoogleKeysList = k => window.setGoogleKeysList && window.setGoogleKeysList(k);
  // Bể key đa ô (OpenRouter, Experiential Labs, NVIDIA, Cohere) dùng chung 1 bộ helper.
  // Key count và prefix đọc từ PROVIDER_REGISTRY (single source of truth).
  const getProviderMeta = providerId => {
    if (typeof window.getProvider === 'function') return window.getProvider(providerId);
    return null;
  };
  const getProviderKeyPrefix = providerId => {
    const p = getProviderMeta(providerId);
    return p ? p.keyPrefix : `jarvis_provider_${providerId}_api`;
  };
  const getProviderKeyNamePrefix = providerId => {
    const p = getProviderMeta(providerId);
    return p ? p.keyNamePrefix : `jarvis_provider_${providerId}_name`;
  };
  const getProviderKeyCount = providerId => {
    const p = getProviderMeta(providerId);
    return p ? p.keyCount : 5;
  };

  const getSlotKeysList = (providerId, obfuscate) => {
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyPrefix(providerId);
    return Array.from({ length: count }, (_, i) => {
      const raw = (ls.getItem(`${prefix}_${i + 1}`) || '').trim();
      const key = raw.startsWith('JVENC_') || raw.startsWith('ENC_') ? deobfuscateKey(raw) : raw;
      return obfuscate && key ? obfuscateKey(key) : key;
    });
  };
  const getSlotKeyNamesList = providerId => {
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyNamePrefix(providerId);
    return Array.from({ length: count }, (_, i) => (ls.getItem(`${prefix}_${i + 1}`) || '').trim());
  };
  const setSlotKeysList = (providerId, inputPrefix, keys, after) => {
    if (!Array.isArray(keys)) return;
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyPrefix(providerId);
    for (let i = 1; i <= count; i++) {
      let key = (keys[i - 1] || '').trim();
      if (key.startsWith('JVENC_') || key.startsWith('ENC_')) key = deobfuscateKey(key);
      ls.setItem(`${prefix}_${i}`, key);
      if ($(`${inputPrefix}-${i}`)) $(`${inputPrefix}-${i}`).value = key;
    }
    if (typeof after === 'function') after();
  };
  const setSlotKeyNamesList = (providerId, inputPrefix, names, after) => {
    if (!Array.isArray(names)) return;
    const count = getProviderKeyCount(providerId);
    const prefix = getProviderKeyNamePrefix(providerId);
    for (let i = 1; i <= count; i++) {
      const name = (names[i - 1] || '').trim();
      ls.setItem(`${prefix}_${i}`, name);
      if ($(`${inputPrefix}-name-${i}`)) $(`${inputPrefix}-name-${i}`).value = name;
    }
    if (typeof after === 'function') after();
  };
  // Chỉ nhận key/tên từ Cloud vào các ô đang trống của máy này.
  const mergeRemoteSlotKeys = (providerId, remoteKeys, apply) => {
    if (!Array.isArray(remoteKeys)) return false;
    const localKeys = getSlotKeysList(providerId, false);
    const merged = localKeys.map((key, i) => {
      let remoteKey = (remoteKeys[i] || '').trim();
      if (remoteKey.startsWith('JVENC_') || remoteKey.startsWith('ENC_'))
        remoteKey = deobfuscateKey(remoteKey);
      return key || remoteKey;
    });
    if (!merged.some((key, i) => key !== localKeys[i])) return false;
    apply(merged);
    return true;
  };
  const mergeRemoteSlotNames = (providerId, remoteNames, apply) => {
    if (!Array.isArray(remoteNames)) return false;
    const localNames = getSlotKeyNamesList(providerId);
    const merged = localNames.map((name, i) => name || remoteNames[i] || '');
    if (!merged.some((name, i) => name !== localNames[i])) return false;
    apply(merged);
    return true;
  };
  // Máy này có key/tên khác Cloud (cần đẩy lên) hay không.
  const slotSettingsChanged = (providerId, remoteKeys, remoteNames) => {
    const localKeys = getSlotKeysList(providerId, false);
    const localNames = getSlotKeyNamesList(providerId);
    const sameKey = (local, remote) => {
      let value = (remote || '').trim();
      if (value.startsWith('JVENC_') || value.startsWith('ENC_')) value = deobfuscateKey(value);
      return (local || '').trim() === value;
    };
    for (let i = 0; i < localKeys.length; i++) {
      if (
        (localKeys[i] && !sameKey(localKeys[i], remoteKeys[i])) ||
        (localNames[i] && localNames[i] !== (remoteNames[i] || ''))
      )
        return true;
    }
    return false;
  };

  const getOpenRouterKeysList = obf => getSlotKeysList('openrouter', obf);
  const getOpenRouterKeyNamesList = () => getSlotKeyNamesList('openrouter');
  const setOpenRouterKeysList = keys =>
    setSlotKeysList('openrouter', 'openrouter-key', keys, () => window.initOpenRouterKeys?.());
  const setOpenRouterKeyNamesList = names =>
    setSlotKeyNamesList('openrouter', 'openrouter-key', names, () => window.initOpenRouterKeys?.());

  const getExplabsKeysList = obf => getSlotKeysList('explabs', obf);
  const getExplabsKeyNamesList = () => getSlotKeyNamesList('explabs');
  const setExplabsKeysList = keys =>
    setSlotKeysList('explabs', 'explabs-key', keys, () => window.initExplabsKeys?.());
  const setExplabsKeyNamesList = names =>
    setSlotKeyNamesList('explabs', 'explabs-key', names, () => window.initExplabsKeys?.());

  const getNvidiaKeysList = obf => getSlotKeysList('nvidia', obf);
  const getNvidiaKeyNamesList = () => getSlotKeyNamesList('nvidia');
  const setNvidiaKeysList = keys =>
    setSlotKeysList('nvidia', 'nvidia-key', keys, () => window.initNvidiaKeys?.());
  const setNvidiaKeyNamesList = names =>
    setSlotKeyNamesList('nvidia', 'nvidia-key', names, () => window.initNvidiaKeys?.());

  const getCohereKeysList = obf => getSlotKeysList('cohere', obf);
  const getCohereKeyNamesList = () => getSlotKeyNamesList('cohere');
  const setCohereKeysList = keys =>
    setSlotKeysList('cohere', 'cohere-key', keys, () => window.initCohereKeys?.());
  const setCohereKeyNamesList = names =>
    setSlotKeyNamesList('cohere', 'cohere-key', names, () => window.initCohereKeys?.());
  const getExternalConfigsObj = obf =>
    typeof window.getExternalConfigsObj === 'function' ? window.getExternalConfigsObj(obf) : {};
  const setExternalConfigsObj = obj =>
    window.setExternalConfigsObj && window.setExternalConfigsObj(obj);
  const deobfuscateKey = k =>
    typeof window.deobfuscateKey === 'function' ? window.deobfuscateKey(k) : k;
  const obfuscateKey = k =>
    typeof window.obfuscateKey === 'function' ? window.obfuscateKey(k) : k;
  const saveToNativeBridge = (k, v) =>
    typeof window.saveToNativeBridge === 'function' ? window.saveToNativeBridge(k, v) : null;
  const getDB = () => (typeof window.getDB === 'function' ? window.getDB() : window.db || null);
  const getSTORE_NAME = () => window.STORE_NAME || 'sessions';
  const getDOM = () => window.DOM || {};
  const oLay = $('modal-overlay');

  // ===== 3-WAY MERGE CHO CẤU HÌNH & KEY (thay luật "ô trống thì nhận") =====
  const readSyncMap = key => { try { const o = JSON.parse(ls.getItem(key) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
  const writeSyncMap = (key, obj) => { try { ls.setItem(key, JSON.stringify(obj || {})); } catch (_) {} };
  const normVal = v => (v === undefined || v === null ? '' : String(v));
  const decVal = v => {
    let s = normVal(v);
    if (s.startsWith('JVENC_') || s.startsWith('ENC_')) s = String(deobfuscateKey(s) || '').trim();
    return s;
  };
  const resolveSyncValue = (local, remote, base, localTs, remoteTs) => {
    const L = normVal(local), R = normVal(remote), B = (base === undefined || base === null) ? null : normVal(base);
    if (L === R) return { value: L, changed: false };
    if (B === null) {
      if (R) return { value: R, changed: true };
      return { value: L, changed: false };
    }
    if (L === B) return { value: R, changed: true };
    if (R === B) return { value: L, changed: false };
    if ((remoteTs || 0) > (localTs || 0)) return { value: R, changed: true };
    return { value: L, changed: false };
  };
  const SETTINGS_SYNC_KEYS = [
    'model','temperature','searchEngine','systemInstruction','theme',
    'personaConfig','personaProfile','factsStore','uiDensity','gestureConfig',
    'ragEnabled','autoLearnMemory',
  ];
  const collectSettingsSnapshot = () => {
    const d = getDOM();
    const modelProv = window.DynamicProviders?.getSelectedModelProvider?.() || '';
    const model = (d.model?.value || 'gemini-3.6-flash') + '||' + modelProv;
    return {
      model,
      temperature: d.temp?.value || 0.5,
      searchEngine: d.searchEngineSel?.value || 'tavily',
      systemInstruction: d.sysInst?.value || '',
      theme: ls.getItem('jarvis_theme') || 'auto',
      personaConfig: ls.getItem('jarvis_persona_config') || '',
      personaProfile: ls.getItem('jarvis_persona_profile') || '',
      factsStore: ls.getItem('jarvis_facts') || '',
      uiDensity: ls.getItem('jarvis_ui_density') || '',
      gestureConfig: ls.getItem('jarvis_gesture_config') || '',
      ragEnabled: ls.getItem('jarvis_rag_enabled') || 'true',
      autoLearnMemory: ls.getItem('jarvis_auto_learn_memory') || 'true',
    };
  };
  function applySyncedSetting(key, value) {
    const d = getDOM();
    const v = normVal(value);
    switch (key) {
      case 'model': {
        if (!d.model || !v) return false;
        const parts = v.split('||');
        const mid = parts[0];
        const prov = parts[1] || null;
        const applied = window.DynamicProviders?.selectModelOption?.(mid, prov);
        if (!applied) d.model.value = mid;
        return true;
      }
      case 'temperature': if (!d.temp) return false; d.temp.value = v; if (d.tempVal) d.tempVal.innerText = v; return true;
      case 'searchEngine': if (!d.searchEngineSel) return false; d.searchEngineSel.value = v; return true;
      case 'systemInstruction': if (!d.sysInst) return false; d.sysInst.value = v; return true;
      case 'theme': ls.setItem('jarvis_theme', v); ls.setItem('theme', v); if (window.ThemeScheduler && typeof window.ThemeScheduler.setMode === 'function') window.ThemeScheduler.setMode(v); return true;
      case 'personaConfig': ls.setItem('jarvis_persona_config', v); if (window.PersonaConfig && typeof window.PersonaConfig.refreshUI === 'function') window.PersonaConfig.refreshUI(); return true;
      case 'personaProfile': ls.setItem('jarvis_persona_profile', v); return true;
      case 'factsStore': ls.setItem('jarvis_facts', v); return true;
      case 'uiDensity': ls.setItem('jarvis_ui_density', v); if (window.Personalization && typeof window.Personalization.setDensity === 'function') window.Personalization.setDensity(v); return true;
      case 'gestureConfig': ls.setItem('jarvis_gesture_config', v); if (window.GestureManager && typeof window.GestureManager.init === 'function') window.GestureManager.init(); return true;
      case 'ragEnabled': ls.setItem('jarvis_rag_enabled', v); return true;
      case 'autoLearnMemory': ls.setItem('jarvis_auto_learn_memory', v); return true;
    }
    return false;
  }
  function mergeRemoteSettings(remoteSettings, remoteTs) {
    const local = collectSettingsSnapshot();
    const base = readSyncMap('jarvis_settings_snapshot');
    const localTs = readSyncMap('jarvis_settings_updated_at');
    const rt = remoteTs || {};
    let changedLocal = 0;
    let localAhead = false;
    SETTINGS_SYNC_KEYS.forEach(key => {
      const remoteVal = (key === 'model')
        ? (remoteSettings.model ? (remoteSettings.model + '||' + (remoteSettings.modelProvider || '')) : '')
        : remoteSettings[key];
      const r = resolveSyncValue(local[key], remoteVal, base[key], localTs[key], rt[key]);
      if (r.value !== normVal(local[key])) {
        applySyncedSetting(key, r.value);
        changedLocal++;
      }
      if (r.value !== normVal(remoteVal)) localAhead = true;
    });
    const newLocal = collectSettingsSnapshot();
    const newBase = Object.assign({}, base);
    const newTs = Object.assign({}, localTs);
    SETTINGS_SYNC_KEYS.forEach(key => {
      newBase[key] = newLocal[key];
      if (rt[key] && (rt[key] > (newTs[key] || 0))) newTs[key] = rt[key];
    });
    writeSyncMap('jarvis_settings_snapshot', newBase);
    writeSyncMap('jarvis_settings_updated_at', newTs);
    return { changedLocal, localAhead };
  }
  const BUILTIN_KEY_PROVIDERS = ['openrouter','explabs','nvidia','cohere'];
  function collectKeySnapshot() {
    const out = {};
    for (let i = 1; i <= 10; i++) {
      out['jarvis_api_' + i] = normVal(ls.getItem('jarvis_api_' + i) || ls.getItem('huanmu_api_' + i) || '');
      out['jarvis_api_name_' + i] = normVal(ls.getItem('jarvis_api_name_' + i) || ls.getItem('huanmu_api_name_' + i) || '');
    }
    BUILTIN_KEY_PROVIDERS.forEach(pid => {
      const cnt = getProviderKeyCount(pid);
      const kp = getProviderKeyPrefix(pid);
      const np = getProviderKeyNamePrefix(pid);
      for (let i = 1; i <= cnt; i++) {
        out[kp + '_' + i] = normVal(ls.getItem(kp + '_' + i) || '');
        out[np + '_' + i] = normVal(ls.getItem(np + '_' + i) || '');
      }
    });
    try {
      const dp = window.DynamicProviders?.exportConfig?.(false) || {};
      Object.entries(dp.providers || {}).forEach(([id, p]) => {
        const cnt = Math.min(Math.max(parseInt(p.keyCount, 10) || 0, 0), 10);
        const kp = p.keyPrefix || 'jarvis_provider_' + id + '_api';
        const np = p.keyNamePrefix || 'jarvis_provider_' + id + '_name';
        for (let i = 1; i <= cnt; i++) {
          out[kp + '_' + i] = normVal(ls.getItem(kp + '_' + i) || '');
          out[np + '_' + i] = normVal(ls.getItem(np + '_' + i) || '');
        }
      });
    } catch (_) {}
    try {
      Object.entries(getExternalConfigsObj(false) || {}).forEach(([k, v]) => { out[k] = normVal(v); });
    } catch (_) {}
    return out;
  }
  function collectRemoteKeyMap(settings) {
    const out = {};
    const s = settings || {};
    for (let i = 0; i < 10; i++) {
      out['jarvis_api_' + (i + 1)] = decVal((s.keys || [])[i]);
      out['jarvis_api_name_' + (i + 1)] = normVal((s.keyNames || [])[i]);
    }
    const builtinMap = {
      openrouter: { keys: s.openRouterKeys, names: s.openRouterKeyNames, pid: 'openrouter' },
      explabs: { keys: s.explabsKeys, names: s.explabsKeyNames, pid: 'explabs' },
      nvidia: { keys: s.nvidiaKeys, names: s.nvidiaKeyNames, pid: 'nvidia' },
      cohere: { keys: s.cohereKeys, names: s.cohereKeyNames, pid: 'cohere' },
    };
    Object.values(builtinMap).forEach(({ keys, names, pid }) => {
      const cnt = getProviderKeyCount(pid);
      const kp = getProviderKeyPrefix(pid);
      const np = getProviderKeyNamePrefix(pid);
      for (let i = 0; i < cnt; i++) {
        out[kp + '_' + (i + 1)] = decVal((keys || [])[i]);
        out[np + '_' + (i + 1)] = normVal((names || [])[i]);
      }
    });
    const dp = s.dynamicProviders || {};
    Object.entries(dp.providers || {}).forEach(([id, p]) => {
      const cnt = Math.min(Math.max(parseInt(p.keyCount, 10) || 0, 0), 10);
      const kp = (p.keyPrefix || 'jarvis_provider_' + id + '_api');
      const np = (p.keyNamePrefix || 'jarvis_provider_' + id + '_name');
      const keys = p.keys || [];
      const names = p.keyNames || [];
      for (let i = 0; i < cnt; i++) {
        out[kp + '_' + (i + 1)] = decVal(keys[i]);
        out[np + '_' + (i + 1)] = normVal(names[i]);
      }
    });
    const ext = s.externalConfigs || {};
    Object.entries(ext).forEach(([k, v]) => {
      out[k] = decVal(v);
    });
    return out;
  }
  function applySyncedKey(storageKey, value) {
    const v = normVal(value);
    ls.setItem(storageKey, v);
    if (/^jarvis_api_(\d+)$/.test(storageKey)) {
      const i = +RegExp.$1;
      ls.setItem('huanmu_api_' + i, v);
    }
    if (/^jarvis_api_name_(\d+)$/.test(storageKey)) {
      const i = +RegExp.$1;
      ls.setItem('huanmu_api_name_' + i, v);
    }
  }
  function mergeRemoteKeySettings(settings, remoteTs) {
    const local = collectKeySnapshot();
    const base = readSyncMap('jarvis_key_snapshot');
    const localTs = readSyncMap('jarvis_key_updated_at');
    const remote = collectRemoteKeyMap(settings);
    const rt = remoteTs || {};
    let changedLocal = 0;
    let localAhead = false;
    Object.keys(local).forEach(k => {
      if (!(k in remote)) remote[k] = '';
    });
    Object.keys(remote).forEach(k => {
      if (!(k in local)) local[k] = '';
    });
    Object.keys(local).forEach(k => {
      const r = resolveSyncValue(local[k], remote[k], base[k], localTs[k], rt[k]);
      if (r.value !== normVal(local[k])) {
        applySyncedKey(k, r.value);
        changedLocal++;
      }
      if (r.value !== normVal(remote[k])) localAhead = true;
    });
    Object.keys(remote).forEach(k => {
      if (k in local) return;
      const r = resolveSyncValue('', remote[k], undefined, 0, rt[k]);
      if (r.value !== '') { applySyncedKey(k, r.value); changedLocal++; }
      if (r.value !== normVal(remote[k])) localAhead = true;
    });
    const newLocal = collectKeySnapshot();
    const newBase = Object.assign({}, base);
    const newTs = Object.assign({}, localTs);
    Object.keys(newLocal).forEach(k => {
      newBase[k] = newLocal[k];
      if (rt[k] && (rt[k] > (newTs[k] || 0))) newTs[k] = rt[k];
    });
    writeSyncMap('jarvis_key_snapshot', newBase);
    writeSyncMap('jarvis_key_updated_at', newTs);
    if (changedLocal > 0) {
      if (typeof window.initAPIKeys === 'function') window.initAPIKeys();
      if (typeof window.initExternalConfigs === 'function') window.initExternalConfigs();
    }
    return { changedLocal, localAhead };
  }
  function bumpKeyTimestamps() {
    const cur = collectKeySnapshot();
    const snap = readSyncMap('jarvis_key_snapshot');
    const ts = readSyncMap('jarvis_key_updated_at');
    const hasSnap = Object.keys(snap).length > 0;
    Object.keys(cur).forEach(k => {
      if (!hasSnap) { snap[k] = cur[k]; if (ts[k] === undefined) ts[k] = 0; return; }
      if (normVal(snap[k]) !== normVal(cur[k])) { ts[k] = Date.now(); snap[k] = cur[k]; }
    });
    writeSyncMap('jarvis_key_snapshot', snap);
    writeSyncMap('jarvis_key_updated_at', ts);
    return ts;
  }
  function bumpSettingsTimestamps() {
    const cur = collectSettingsSnapshot();
    const snap = readSyncMap('jarvis_settings_snapshot');
    const ts = readSyncMap('jarvis_settings_updated_at');
    const hasSnap = Object.keys(snap).length > 0;
    Object.keys(cur).forEach(k => {
      if (!hasSnap) { snap[k] = cur[k]; if (ts[k] === undefined) ts[k] = 0; return; }
      if (normVal(snap[k]) !== normVal(cur[k])) { ts[k] = Date.now(); snap[k] = cur[k]; }
    });
    writeSyncMap('jarvis_settings_snapshot', snap);
    writeSyncMap('jarvis_settings_updated_at', ts);
    return ts;
  }
  function readDeletedVectorIds() {
    try { return new Set(JSON.parse(ls.getItem('jarvis_deleted_vector_ids') || '[]')); } catch (_) { return new Set(); }
  }
  function writeDeletedVectorIds(set) {
    try { ls.setItem('jarvis_deleted_vector_ids', JSON.stringify(Array.from(set).slice(-500))); } catch (_) {} }

  // --- GITHUB GIST CLOUD SYNC CONTROLLER (2-WAY SMART MERGE & AUTO SYNC) ---
  const cloudSyncModal = $('cloud-sync-modal');
  const gistPatInput = $('gist-pat-input');
  const gistIdInput = $('gist-id-input');
  const gistStatusText = $('gist-status-text');
  const gistLastTime = $('gist-last-time');
  const gistAutoSyncToggle = $('gist-auto-sync-toggle');

  let _isSyncing = false;
  let _autoSyncTimer = null;
  let _gistRateLimitedUntil = 0;

  function updateSyncHeaderStatus() {
    const headerSyncBtn = $('btn-cloud-sync-header');
    const timeSpan = $('header-sync-time');
    if (!timeSpan) return;

    const rawTs = ls.getItem('jarvis_gist_last_sync_timestamp');
    if (!rawTs) {
      timeSpan.innerText = '';
      return;
    }

    const ts = parseInt(rawTs, 10);
    if (isNaN(ts) || ts <= 0) {
      timeSpan.innerText = '';
      return;
    }

    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    let text = '';
    if (diffSec < 60) {
      text = 'Vừa xong';
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      text = `${mins}p trước`;
    } else if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      text = `${hours}h trước`;
    } else {
      const days = Math.floor(diffSec / 86400);
      text = `${days}d trước`;
    }

    timeSpan.innerText = `(${text})`;
    const fullDate = ls.getItem('jarvis_gist_last_sync') || new Date(ts).toLocaleString('vi-VN');
    if (headerSyncBtn) {
      headerSyncBtn.title = `Đồng bộ Cloud Gist · Lần cuối: ${fullDate}`;
    }
  }
  window.updateSyncHeaderStatus = updateSyncHeaderStatus;

  // Helper xử lý lỗi HTTP của GitHub Gist (Đặc biệt phát hiện và cảnh báo Rate Limit thông minh)
  function handleGistHttpError(res, errData) {
    if (
      res.status === 403 ||
      res.status === 429 ||
      (errData && errData.message && /rate limit/i.test(errData.message))
    ) {
      const resetHeader = res.headers ? res.headers.get('x-ratelimit-reset') : null;
      let resetTimestamp;
      if (resetHeader && !isNaN(parseInt(resetHeader, 10))) {
        resetTimestamp = parseInt(resetHeader, 10) * 1000;
      } else {
        resetTimestamp = Date.now() + 30 * 60 * 1000;
      }
      _gistRateLimitedUntil = resetTimestamp;

      const resetDate = new Date(resetTimestamp);
      const minsLeft = Math.max(1, Math.round((resetTimestamp - Date.now()) / 60000));
      const hh = String(resetDate.getHours()).padStart(2, '0');
      const mm = String(resetDate.getMinutes()).padStart(2, '0');
      const timeStr = hh + ':' + mm;
      return new Error(
        'GitHub tạm thời giới hạn tần suất gọi API (do đợt trước đồng bộ liên tục). Sẽ tự động mở lại vào lúc ' +
          timeStr +
          ' (khoảng ' +
          minsLeft +
          ' phút nữa).'
      );
    }
    return new Error((errData && errData.message) || 'Lỗi HTTP ' + res.status);
  }

  // Helper fetch file content from GitHub Gist (supporting large files with raw_url)
  async function fetchGistData(pat, gistId) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://api.github.com/gists/' + gistId, {
      headers: {
        Authorization: 'Bearer ' + pat,
        Accept: 'application/vnd.github.v3+json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw handleGistHttpError(res, errData);
    }
    const data = await res.json();
    const fileObj =
      data.files && (data.files['jarvis_sync_data.json'] || Object.values(data.files)[0]);
    if (!fileObj) throw new Error('Không tìm thấy tệp dữ liệu sao lưu hợp lệ trong Gist này!');

    let contentStr = fileObj.content || '';
    // Chỉ fetch raw_url nếu GitHub báo file quá lớn bị cắt ngắn (truncated) hoặc contentStr bị rỗng
    if (fileObj.truncated || !contentStr) {
      if (fileObj.raw_url) {
        try {
          const rawUrlWithBuster =
            fileObj.raw_url + (fileObj.raw_url.includes('?') ? '&' : '?') + '_t=' + Date.now();
          const rawController = new AbortController();
          const rawTimeoutId = setTimeout(() => rawController.abort(), 15000);
          let rawRes = await fetch(rawUrlWithBuster, {
            cache: 'no-store',
            signal: rawController.signal,
          });
          clearTimeout(rawTimeoutId);
          if (rawRes.ok) contentStr = await rawRes.text();
        } catch (rawErr) {
          console.warn('[Gist] Lỗi fetch raw_url, dùng inline content:', rawErr);
        }
      }
    }
    if (!contentStr) throw new Error('Nội dung tệp sao lưu trên Gist bị trống!');
    return JSON.parse(contentStr);
  }

  // Helper push backupData to GitHub Gist
  async function pushGistData(pat, gistId, backupData) {
    const payload = {
      description: 'Jarvis AI - Cloud Sync Personal Backup',
      public: false,
      files: {
        'jarvis_sync_data.json': {
          content: JSON.stringify(backupData),
        },
      },
    };
    const url = gistId ? 'https://api.github.com/gists/' + gistId : 'https://api.github.com/gists';
    const method = gistId ? 'PATCH' : 'POST';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + pat,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw handleGistHttpError(res, errData);
    }
    const data = await res.json();
    return data.id || gistId;
  }

  // 2-WAY SMART MERGE (HỢP NHẤT DỮ LIỆU ĐA THIẾT BỊ - KHÔNG CHỚP MÀN HÌNH)
  async function performSmartSync({ silent = false } = {}) {
    if (_isSyncing) return;
    if (_gistRateLimitedUntil && Date.now() < _gistRateLimitedUntil) {
      const minsLeft = Math.max(1, Math.round((_gistRateLimitedUntil - Date.now()) / 60000));
      const resetDate = new Date(_gistRateLimitedUntil);
      const hh = String(resetDate.getHours()).padStart(2, '0');
      const mm = String(resetDate.getMinutes()).padStart(2, '0');
      const msg =
        'GitHub đang tạm giới hạn API do đợt đồng bộ trước. Tự động mở lại lúc ' +
        hh +
        ':' +
        mm +
        ' (còn ~' +
        minsLeft +
        ' phút).';
      if (!silent) showToast(msg, 'warning');
      return;
    }
    if (_gistRateLimitedUntil && Date.now() >= _gistRateLimitedUntil) {
      _gistRateLimitedUntil = 0;
    }
    const pat = (gistPatInput?.value || ls.getItem('jarvis_gist_pat') || '').trim();
    let gistId = (gistIdInput?.value || ls.getItem('jarvis_gist_id') || '').trim();

    if (!pat) {
      if (!silent) showToast('Vui lòng nhập GitHub Personal Access Token (PAT)!', 'warning');
      return;
    }

    _isSyncing = true;
    const syncBtn = $('btn-gist-sync');
    const headerSyncBtn = $('btn-cloud-sync-header');
    const headerSyncLabel = $('header-sync-label');
    if (headerSyncLabel) headerSyncLabel.innerText = 'Đang sync...';
    const oldBtnHtml = syncBtn ? syncBtn.innerHTML : '';
    if (syncBtn && !silent) {
      syncBtn.innerHTML = `<span>Đang đồng bộ 2 chiều...</span> ⏳`;
      syncBtn.disabled = true;
    }
    if (headerSyncBtn && silent) {
      headerSyncBtn.classList.add('syncing-pulse');
      const span = headerSyncBtn.querySelector('span');
      if (span) span.innerText = 'Đang đồng bộ...';
    }

    try {
      // 1. Thu thập dữ liệu cục bộ hiện tại trên thiết bị này
      const localSessions = (await getAllFromDB()).map(sanitizeSessionForBackup);
      let localKnowledge = [];
      if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
        try {
          localKnowledge = await window.JarvisRAG.getAllKnowledge();
        } catch (kErr) {
          console.warn('[SmartSync] Lỗi đọc Kho tri thức:', kErr);
        }
      }

      let finalSessions = localSessions;
      let finalKnowledge = localKnowledge;
      let finalFolders = JSON.parse(ls.getItem('jarvis_folders') || '["Mặc định"]');
      let finalPrompts = JSON.parse(ls.getItem('jarvis_custom_prompts') || '[]');

      const deletedSessionIds = new Set(
        JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]')
      );
      let prunedRemoteByTombstone = false;
      const deletedVectorIds = new Set(JSON.parse(ls.getItem('jarvis_deleted_vector_ids') || '[]'));

      let hasRemoteData = false;
      let hasChanges = false;
      let keysNeedPush = false;
      let settingsNeedPush = false;
      let vectorTombstoneChanged = false;
      let cloudReadFailed = false; // Đọc Gist lỗi -> KHÔNG được đẩy bản cục bộ lên (tránh ghi đè trắng)

      // 2. Nếu đã có Gist ID, tải dữ liệu từ Cloud về để HỢP NHẤT (Merge)
      let cloudData = null;

      if (gistId) {
        try {
          cloudData = await fetchGistData(pat, gistId);
          hasRemoteData = true;

          // A0. ĐỒNG BỘ TOMBSTONE (tin nhắn / phiên đã xóa) TỪ CLOUD TRƯỚC KHI MERGE
          // Nếu thiếu bước này, máy khác còn giữ tin đã xóa sẽ đấy nó trở lại Gist.
          if (
            cloudData.deletedMsgs &&
            window.jarvisMsgTombstones &&
            typeof window.jarvisMsgTombstones.mergeAll === 'function'
          ) {
            if (window.jarvisMsgTombstones.mergeAll(cloudData.deletedMsgs)) hasChanges = true;
          }
          if (Array.isArray(cloudData.deletedSessionIds) && cloudData.deletedSessionIds.length) {
            cloudData.deletedSessionIds.forEach(id => {
              if (id) deletedSessionIds.add(id);
            });
            try {
              const cur = new Set(JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]'));
              cloudData.deletedSessionIds.forEach(id => {
                if (id) cur.add(id);
              });
              ls.setItem('jarvis_deleted_session_ids', JSON.stringify(Array.from(cur).slice(-500)));
            } catch (_) {}
          }
          // A0b. Tombstone tri thức từ Cloud
          if (Array.isArray(cloudData.deletedVectorIds) && cloudData.deletedVectorIds.length) {
            const beforeSize = deletedVectorIds.size;
            cloudData.deletedVectorIds.forEach(id => { if (id) deletedVectorIds.add(id); });
            if (deletedVectorIds.size !== beforeSize) {
              vectorTombstoneChanged = true;
              hasChanges = true;
              try { ls.setItem('jarvis_deleted_vector_ids', JSON.stringify(Array.from(deletedVectorIds).slice(-500))); } catch (_) {}
            }
          }

          // Bỏ khỏi bản cục bộ những tin đã nằm trong tombstone (kể cả tombstone vừa nhận)
          let prunedLocal = false;
          if (
            window.jarvisMsgTombstones &&
            typeof window.jarvisMsgTombstones.filter === 'function'
          ) {
            localSessions.forEach(lsess => {
              if (!lsess || !Array.isArray(lsess.his)) return;
              const pr = window.jarvisMsgTombstones.filter(lsess.id, lsess.his);
              if (pr.removed > 0) {
                lsess.his = pr.his;
                prunedLocal = true;
              }
            });
            if (prunedLocal) hasChanges = true;
          }

          // A. HỢP NHẤT LỊCH SỬ PHIÊN CHAT (SESSIONS)
          if (Array.isArray(cloudData.sessions)) {
            const sessionMap = new Map();
            for (const lsess of localSessions) {
              if (lsess && lsess.id && !deletedSessionIds.has(lsess.id)) {
                sessionMap.set(lsess.id, lsess);
              }
            }
            for (let csess of cloudData.sessions) {
              if (!csess || !csess.id || deletedSessionIds.has(csess.id)) continue;
              // Bỏ các tin nhắn đã xóa trên máy này (tombstone) TRƯỚC khi so sánh độ dài,
              // nếu không bản Cloud dài hơn sẽ thắng và tin vừa xóa bị hồi sinh.
              if (
                window.jarvisMsgTombstones &&
                typeof window.jarvisMsgTombstones.filter === 'function'
              ) {
                const pruned = window.jarvisMsgTombstones.filter(csess.id, csess.his || []);
                if (pruned.removed > 0) {
                  csess = Object.assign({}, csess, { his: pruned.his });
                  prunedRemoteByTombstone = true;
                  hasChanges = true;
                  console.log(
                    `[SmartSync] Bỏ ${pruned.removed} tin nhắn đã xóa khỏi bản Cloud của phiên "${csess.name || csess.id}"`
                  );
                }
              }
              if (!sessionMap.has(csess.id)) {
                sessionMap.set(csess.id, csess);
                hasChanges = true;
              } else {
                const existing = sessionMap.get(csess.id);
                const lCount = (existing.his || []).length;
                const cCount = (csess.his || []).length;
                const lTime = existing.updatedAt || existing.timestamp || 0;
                const cTime = csess.updatedAt || csess.timestamp || 0;
                if (cCount > lCount || (cCount === lCount && cTime > lTime)) {
                  sessionMap.set(csess.id, csess);
                  hasChanges = true;
                }
              }
            }
            finalSessions = Array.from(sessionMap.values());
            finalSessions.sort((a, b) => {
              if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
              const tA = a.updatedAt || a.orderIndex || 0;
              const tB = b.updatedAt || b.orderIndex || 0;
              return tB - tA;
            });
            finalSessions.forEach((s, idx) => {
              s.orderIndex = idx;
            });
          }

          // B. HỢP NHẤT KHO TRI THỨC & TRÍ NHỚ VECTƠ (KNOWLEDGE BASE & RAG)
          if (Array.isArray(cloudData.knowledgeBase)) {
            const kMap = new Map();
            for (const lk of localKnowledge) {
              if (lk && lk.id && !deletedVectorIds.has(lk.id)) {
                kMap.set(lk.id, lk);
              }
            }
            for (const ck of cloudData.knowledgeBase) {
              if (!ck || !ck.id || deletedVectorIds.has(ck.id)) continue;
              if (!kMap.has(ck.id)) {
                kMap.set(ck.id, ck);
                hasChanges = true;
              } else {
                const ex = kMap.get(ck.id);
                const exTime = ex.createdAt || 0;
                const ckTime = ck.createdAt || 0;
                if (ckTime > exTime || (!ex.vector && ck.vector)) {
                  kMap.set(ck.id, ck);
                }
              }
            }
            const allMergedK = Array.from(kMap.values());
            const seenMemTexts = new Set();
            finalKnowledge = [];
            for (const it of allMergedK) {
              if (it.type === 'memory') {
                const tKey = (it.text || '').trim().toLowerCase();
                if (seenMemTexts.has(tKey)) continue;
                seenMemTexts.add(tKey);
              }
              finalKnowledge.push(it);
            }
            if (finalKnowledge.length !== localKnowledge.length) {
              hasChanges = true;
            }
          }

          // C. HỢP NHẤT THƯ MỤC & PROMPTS MẪU
          if (Array.isArray(cloudData.folders)) {
            const origFoldersLen = finalFolders.length;
            finalFolders = Array.from(new Set([...finalFolders, ...cloudData.folders]));
            if (finalFolders.length !== origFoldersLen) hasChanges = true;
          }

          if (Array.isArray(cloudData.customPrompts)) {
            const pMap = new Map();
            finalPrompts.forEach(p => {
              if (p && p.title) pMap.set(p.title, p);
            });
            cloudData.customPrompts.forEach(p => {
              if (p && p.title && !pMap.has(p.title)) {
                pMap.set(p.title, p);
                hasChanges = true;
              }
            });
            finalPrompts = Array.from(pMap.values());
          }

          // D. 3-WAY MERGE cho key + tên + externalConfigs (base snapshot + timestamp)
          const keyMerge = mergeRemoteKeySettings(cloudData.settings || {}, cloudData.settings?.keyUpdatedAt || {});
          if (keyMerge.changedLocal > 0) hasChanges = true;
          keysNeedPush = keyMerge.localAhead;

          // D2. 3-WAY MERGE cho settings (model/theme/persona/system instruction/...)
          const setMerge = mergeRemoteSettings(cloudData.settings || {}, cloudData.settings?.settingsUpdatedAt || {});
          if (setMerge.changedLocal > 0) hasChanges = true;
          settingsNeedPush = setMerge.localAhead;

          // Fallback: khôi phục Global Context từ top-level settings nếu externalConfigs thiếu
          if (
            cloudData.settings &&
            cloudData.settings.globalContext &&
            !(ls.getItem('jarvis_global_context') || '').trim()
          ) {
            var _gc = String(cloudData.settings.globalContext).trim();
            if (_gc) {
              ls.setItem('jarvis_global_context', _gc);
              ls.setItem('huanmu_global_context', _gc);
              if (typeof window.initExternalConfigs === 'function') window.initExternalConfigs();
              hasChanges = true;
            }
          }

          // D3. HỢP NHẤT PROVIDER & MODEL ĐỘNG (Kilo, ...): nhận từ Cloud những
          // provider/model máy này CHƯA có, VÀ restore keys cho provider đã có.
          const remoteDP = cloudData.settings?.dynamicProviders;
          if (
            remoteDP &&
            typeof remoteDP === 'object' &&
            typeof window.DynamicProviders?.importConfig === 'function'
          ) {
            const localDP =
              (typeof window.DynamicProviders.exportConfig === 'function'
                ? window.DynamicProviders.exportConfig(false)
                : null) || {};
            const localProv = localDP.providers || {};
            const localModels = localDP.models || {};
            const missingDP = { providers: {}, models: {} };

            // 1. Thêm provider/model mới (chưa có local)
            Object.entries(remoteDP.providers || {}).forEach(([id, p]) => {
              if (!localProv[id]) {
                missingDP.providers[id] = p;
              } else {
                // Provider đã có local: keys handled by mergeRemoteKeySettings (3-way); chỉ restore usage.
                if (p.usage && typeof window.saveProviderUsage === 'function') {
                  window.saveProviderUsage(id, p.usage);
                }
              }
            });

            Object.entries(remoteDP.models || {}).forEach(([id, m]) => {
              if (!localModels[id]) missingDP.models[id] = m;
            });

            const nProv = Object.keys(missingDP.providers).length;
            const nModel = Object.keys(missingDP.models).length;
            if (nProv || nModel) {
              window.DynamicProviders.importConfig(missingDP, { merge: true });
              hasChanges = true;
              console.log(`[SmartSync] Nhận từ Cloud ${nProv} provider + ${nModel} model động`);
            }
          }
          // E. HỢP NHẤT BỘ ĐẾM HẠN NGẠCH KEY FLASH (DISTRIBUTED G-COUNTER)
          if (cloudData.keyUsageFlash && typeof window.mergeRemoteKeyUsage === 'function') {
            const usageChanged = window.mergeRemoteKeyUsage(cloudData.keyUsageFlash);
            if (usageChanged) hasChanges = true;
          }
          if (
            cloudData.keyUsageOpenRouter &&
            typeof window.mergeRemoteOpenRouterUsage === 'function'
          ) {
            const usageChanged = window.mergeRemoteOpenRouterUsage(cloudData.keyUsageOpenRouter);
            if (usageChanged) hasChanges = true;
          }
          if (cloudData.keyUsageExplabs && typeof window.mergeRemoteExplabsUsage === 'function') {
            const usageChanged = window.mergeRemoteExplabsUsage(cloudData.keyUsageExplabs);
            if (usageChanged) hasChanges = true;
          }
          if (cloudData.keyUsageCohere && typeof window.mergeRemoteCohereUsage === 'function') {
            const usageChanged = window.mergeRemoteCohereUsage(cloudData.keyUsageCohere);
            if (usageChanged) hasChanges = true;
          }
          if (cloudData.keyUsageNvidia && typeof window.mergeRemoteNvidiaUsage === 'function') {
            const usageChanged = window.mergeRemoteNvidiaUsage(cloudData.keyUsageNvidia);
            if (usageChanged) hasChanges = true;
          }

          // F. HỢP NHẤT DỮ LIỆU TỦ THUỐC & LỊCH SỬ UỐNG THUỐC (MAX CARE)
          let localMeds = JSON.parse(ls.getItem('jarvis_medications') || '[]');
          let localHistory = JSON.parse(ls.getItem('jarvis_med_history') || '[]');
          let medChanged = false;

          if (Array.isArray(cloudData.medications) && cloudData.medications.length > 0) {
            const medMap = new Map();
            localMeds.forEach(m => {
              if (m && m.id) medMap.set(m.id, m);
            });
            for (const cm of cloudData.medications) {
              if (!cm || !cm.id) continue;
              if (!medMap.has(cm.id)) {
                medMap.set(cm.id, cm);
                medChanged = true;
                hasChanges = true;
              } else {
                const lm = medMap.get(cm.id);
                const lTime = lm.updatedAt || lm.createdAt || 0;
                const cTime = cm.updatedAt || cm.createdAt || 0;
                if (cTime > lTime) {
                  medMap.set(cm.id, cm);
                  medChanged = true;
                  hasChanges = true;
                }
              }
            }
            localMeds = Array.from(medMap.values());
          }

          if (Array.isArray(cloudData.medHistory) && cloudData.medHistory.length > 0) {
            const histMap = new Map();
            localHistory.forEach(h => {
              const k = h.id || h.medId + '_' + h.timeStr + '_' + (h.date || h.timestamp);
              histMap.set(k, h);
            });
            for (const ch of cloudData.medHistory) {
              if (!ch) continue;
              const k = ch.id || ch.medId + '_' + ch.timeStr + '_' + (ch.date || ch.timestamp);
              if (!histMap.has(k)) {
                histMap.set(k, ch);
                medChanged = true;
                hasChanges = true;
              }
            }
            localHistory = Array.from(histMap.values());
            localHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          }

          if (medChanged) {
            ls.setItem('jarvis_medications', JSON.stringify(localMeds));
            ls.setItem('jarvis_med_history', JSON.stringify(localHistory));
            if (window.saveToNativeBridge) {
              window.saveToNativeBridge('jarvis_medications', JSON.stringify(localMeds));
              window.saveToNativeBridge('jarvis_med_history', JSON.stringify(localHistory));
            }
            if (typeof window.reloadMaxMedicationsFromStorage === 'function') {
              window.reloadMaxMedicationsFromStorage();
            }
          }
        } catch (fetchErr) {
          cloudReadFailed = true;
          console.warn('[SmartSync] Không thể tải dữ liệu cũ từ Cloud để merge:', fetchErr);
        }
      }

      // Kiểm tra chi tiết xem máy cục bộ có dữ liệu gì mới hơn hoặc khác biệt so với Cloud không
      let isLocalAhead = !hasRemoteData;
      if (!isLocalAhead && cloudData) {
        const remoteSessions = Array.isArray(cloudData.sessions) ? cloudData.sessions : [];
        const remoteKnowledge = Array.isArray(cloudData.knowledgeBase)
          ? cloudData.knowledgeBase
          : [];

        // 1. So sánh số lượng phiên và số lượng tri thức
        if (
          localSessions.length > remoteSessions.length ||
          localKnowledge.length > remoteKnowledge.length
        ) {
          isLocalAhead = true;
        }

        const remoteMeds = Array.isArray(cloudData.medications) ? cloudData.medications : [];
        const remoteHist = Array.isArray(cloudData.medHistory) ? cloudData.medHistory : [];
        const curMeds = JSON.parse(ls.getItem('jarvis_medications') || '[]');
        const curHist = JSON.parse(ls.getItem('jarvis_med_history') || '[]');
        if (curMeds.length > remoteMeds.length || curHist.length > remoteHist.length) {
          isLocalAhead = true;
        }

        // 2. So sánh chi tiết từng phiên: tin nhắn mới, thời gian cập nhật, tên phiên, pinned
        if (!isLocalAhead) {
          const remoteMap = new Map();
          remoteSessions.forEach(cs => {
            if (cs && cs.id) remoteMap.set(cs.id, cs);
          });

          for (const lsess of localSessions) {
            if (!lsess || !lsess.id) continue;
            const csess = remoteMap.get(lsess.id);
            if (!csess) {
              isLocalAhead = true; // Phiên mới tạo ở máy này
              break;
            }
            const lCount = (lsess.his || []).length;
            const cCount = (csess.his || []).length;
            const lTime = lsess.updatedAt || lsess.orderIndex || 0;
            const cTime = csess.updatedAt || csess.orderIndex || 0;

            if (
              lCount > cCount ||
              lTime > cTime ||
              lsess.name !== csess.name ||
              lsess.pinned !== csess.pinned ||
              lsess.folder !== csess.folder
            ) {
              isLocalAhead = true; // Có tin nhắn mới, đổi tên hoặc vừa ghim phiên
              break;
            }
          }
        }

        // 3. Kiểm tra xem có phiên hoặc vector nào đã xóa ở máy này mà Cloud vẫn còn lưu không
        if (!isLocalAhead && prunedRemoteByTombstone) {
          // Đã bỏ tin nhắn đã xóa khỏi bản Cloud -> phải đẩy bản đã lọc lên Gist
          isLocalAhead = true;
        }
        if (!isLocalAhead) {
          if (
            deletedSessionIds.size > 0 &&
            remoteSessions.some(cs => deletedSessionIds.has(cs.id))
          ) {
            isLocalAhead = true;
          } else if (
            deletedVectorIds.size > 0 &&
            remoteKnowledge.some(ck => deletedVectorIds.has(ck.id))
          ) {
            isLocalAhead = true;
          }
        }

        // 4. Kiểm tra xem bộ đếm Key Flash của máy này có lượt gọi mới hơn Cloud không
        if (
          !isLocalAhead &&
          cloudData &&
          cloudData.keyUsageFlash &&
          typeof window.isLocalKeyUsageAhead === 'function'
        ) {
          if (window.isLocalKeyUsageAhead(cloudData.keyUsageFlash)) {
            isLocalAhead = true;
          }
        }
        if (
          !isLocalAhead &&
          cloudData?.keyUsageOpenRouter &&
          typeof window.isLocalOpenRouterUsageAhead === 'function'
        ) {
          if (window.isLocalOpenRouterUsageAhead(cloudData.keyUsageOpenRouter)) isLocalAhead = true;
        }
        if (
          !isLocalAhead &&
          cloudData?.keyUsageExplabs &&
          typeof window.isLocalExplabsUsageAhead === 'function'
        ) {
          if (window.isLocalExplabsUsageAhead(cloudData.keyUsageExplabs)) isLocalAhead = true;
        }
        if (
          !isLocalAhead &&
          cloudData?.keyUsageCohere &&
          typeof window.isLocalCohereUsageAhead === 'function'
        ) {
          if (window.isLocalCohereUsageAhead(cloudData.keyUsageCohere)) isLocalAhead = true;
        }
        if (
          !isLocalAhead &&
          cloudData?.keyUsageNvidia &&
          typeof window.isLocalNvidiaUsageAhead === 'function'
        ) {
          if (window.isLocalNvidiaUsageAhead(cloudData.keyUsageNvidia)) isLocalAhead = true;
        }

        // 5. Key/config vừa nhập/đổi ở máy này (3-way) phải được đẩy lên Cloud
        if (!isLocalAhead && (keysNeedPush || settingsNeedPush)) {
          isLocalAhead = true;
        }
        // 7. Provider/model động (Kilo, ...) vừa thêm HOẶC vừa sửa ở máy này
        if (!isLocalAhead && typeof window.DynamicProviders?.exportConfig === 'function') {
          // So sánh phần định nghĩa (bỏ keys/keyNames/usage vì Cloud lưu đã obfuscate)
          const fingerprint = dp => {
            const out = { providers: {}, models: {} };
            const provs = dp.providers || {};
            const models = dp.models || {};
            Object.keys(provs)
              .sort()
              .forEach(id => {
                const pr = provs[id] || {};
                out.providers[id] = [
                  pr.label,
                  pr.type,
                  pr.baseUrl,
                  pr.keyCount,
                  JSON.stringify(pr.unsupportedParams || []),
                ].join('|');
              });
            Object.keys(models)
              .sort()
              .forEach(id => {
                const m = models[id] || {};
                out.models[id] = [
                  m.label,
                  m.provider,
                  m.contextWindow,
                  m.maxTokens,
                  m.temperature,
                  m.topP,
                  m.topK,
                ].join('|');
              });
            return JSON.stringify(out);
          };
          const localFP = fingerprint(window.DynamicProviders.exportConfig(false) || {});
          const cloudFP = fingerprint(cloudData.settings?.dynamicProviders || {});
          if (localFP !== cloudFP) isLocalAhead = true;

          // So sánh cả BỂ KEY + TÊN + USAGE của provider động (giải mã Cloud trước khi so).
          // Nhờ vậy chỉ cần nhập/đổi key provider tự thêm là máy này được coi là "mới hơn"
          // và đẩy lên Gist ngay, không phải chờ chat.
          if (!isLocalAhead) {
            const normalizeSlotKeys = dp => {
              const out = {};
              Object.keys(dp?.providers || {})
                .sort()
                .forEach(id => {
                  const pr = dp.providers[id] || {};
                  const dec = arr =>
                    (Array.isArray(arr) ? arr : []).map(v => {
                      let s = String(v || '').trim();
                      if (s.startsWith('JVENC_') || s.startsWith('ENC_'))
                        s = String(deobfuscateKey(s) || '').trim();
                      return s;
                    });
                  out[id] = JSON.stringify({
                    keys: dec(pr.keys),
                    keyNames: (Array.isArray(pr.keyNames) ? pr.keyNames : []).map(n =>
                      String(n || '')
                    ),
                    usage: pr.usage || {},
                  });
                });
              return JSON.stringify(out);
            };
            const localSlots = normalizeSlotKeys(window.DynamicProviders.exportConfig(false) || {});
            const cloudSlots = normalizeSlotKeys(cloudData.settings?.dynamicProviders || {});
            if (localSlots !== cloudSlots) isLocalAhead = true;
          }
        }
      }

      // Chỉ lưu xuống IndexedDB khi thực sự có thay đổi từ Cloud
      if (hasChanges) {
        // Lưu bằng transaction trực tiếp, KHÔNG gọi saveToDB để triệt tiêu đệ quy!
        await clearAllDB();
        let database = getDB();
        if (!database && typeof window.initDB === 'function') {
          await window.initDB();
          database = getDB();
        }
        if (database) {
          const tx = database.transaction(getSTORE_NAME(), 'readwrite');
          const store = tx.objectStore(getSTORE_NAME());
          finalSessions.forEach(s => store.put(s));
          await new Promise((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = e => rej(e);
          });
        }
        window.sessions = (await getAllFromDB()).sort(
          (a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)
        );

        window.folders = finalFolders;
        ls.setItem('jarvis_folders', JSON.stringify(finalFolders));
        ls.setItem('jarvis_custom_prompts', JSON.stringify(finalPrompts));

        if (window.JarvisRAG && typeof window.JarvisRAG.importKnowledge === 'function') {
          await window.JarvisRAG.importKnowledge(finalKnowledge, true);
        }
      }

      // TUYỆT ĐỐI GIỮ NGUYÊN phiên hoạt động hiện tại (activeId) của máy này!
      // Đồng bộ chỉ gộp dữ liệu, KHÔNG BAO GIỜ tự tiện tráo đổi phiên của người dùng sang phiên khác.
      if (!window.sessions.some(s => s.id === window.activeId) && window.sessions.length > 0) {
        // Chỉ fallback sang phiên đầu tiên nếu phiên hiện tại thực sự đã bị xóa khỏi cơ sở dữ liệu
        window.activeId = window.sessions[0].id;
        ls.setItem('jarvis_active_id', window.activeId);
        ls.setItem('huanmu_active_id', window.activeId);
      }

      // --- CHỐT AN TOÀN CHỐNG GHI ĐÈ TRẮNG CLOUD ---
      // (1) Có Gist ID nhưng ĐỌC Gist thất bại: coi như "không biết Cloud có gì", tuyệt đối không PATCH lên,
      //     vì máy mới tinh sẽ có localSessions rỗng và xóa sạch backup trên Cloud.
      // (2) Bản Cloud đang có phiên mà bản đóng gói lại rỗng: cũng chặn luôn cho chắc.
      const remoteSessionCount =
        cloudData && Array.isArray(cloudData.sessions) ? cloudData.sessions.length : 0;
      const wouldWipeCloud = !!gistId && remoteSessionCount > 0 && finalSessions.length === 0;
      if (gistId && cloudReadFailed) {
        console.warn(
          '[SmartSync] Bỏ qua bước đẩy lên: không đọc được Gist (tránh ghi đè trắng Cloud).'
        );
        if (!silent)
          showToast(
            'Không đọc được Gist nên tạm hoãn đẩy lên Cloud để tránh ghi đè mất dữ liệu. Kiểm tra lại PAT/Gist ID rồi sync lại.',
            'warning'
          );
      } else if (wouldWipeCloud) {
        console.warn(
          `[SmartSync] Chặn ghi đè: Cloud có ${remoteSessionCount} phiên nhưng bản đóng gói rỗng.`
        );
        if (!silent)
          showToast(
            'Đã chặn ghi đè: bản trên máy này đang rỗng nhưng Cloud có dữ liệu.',
            'warning'
          );
      } else if (!gistId || isLocalAhead) {
        // Đóng gói và đẩy lên Gist khi máy này có dữ liệu mới hơn (isLocalAhead) hoặc chưa có Gist ID
        const _settingsTs = bumpSettingsTimestamps();
        const _keyTs = bumpKeyTimestamps();
        const backupData = {
          version: 2,
          app: 'Jarvis AI',
          timestamp: new Date().toISOString(),
          timeReadable: new Date().toLocaleString('vi-VN'),
          device: 'ontouchstart' in window ? 'Mobile' : 'Desktop',
          sessions: finalSessions,
          activeId: window.activeId,
          customPrompts: finalPrompts,
          folders: finalFolders,
          deletedMsgs:
            window.jarvisMsgTombstones && typeof window.jarvisMsgTombstones.readAll === 'function'
              ? window.jarvisMsgTombstones.readAll()
              : {},
          deletedSessionIds: Array.from(deletedSessionIds),
          knowledgeBase: finalKnowledge,
          deletedVectorIds: Array.from(deletedVectorIds),
          medications: JSON.parse(ls.getItem('jarvis_medications') || '[]'),
          medHistory: JSON.parse(ls.getItem('jarvis_med_history') || '[]'),
          keyUsageFlash:
            typeof window.loadKeyUsageData === 'function' ? window.loadKeyUsageData() : null,
          keyUsageOpenRouter:
            typeof window.loadOpenRouterUsageData === 'function'
              ? window.loadOpenRouterUsageData()
              : null,
          keyUsageExplabs:
            typeof window.loadExplabsUsageData === 'function'
              ? window.loadExplabsUsageData()
              : null,
          keyUsageNvidia:
            typeof window.loadNvidiaUsageData === 'function' ? window.loadNvidiaUsageData() : null,
          keyUsageCohere:
            typeof window.loadCohereUsageData === 'function' ? window.loadCohereUsageData() : null,
          settings: {
            keys: getGoogleKeysList(true),
            keyNames: getGoogleKeyNamesList(),
            openRouterKeys: getOpenRouterKeysList(true),
            openRouterKeyNames: getOpenRouterKeyNamesList(),
            explabsKeys: getExplabsKeysList(true),
            explabsKeyNames: getExplabsKeyNamesList(),
            nvidiaKeys: getNvidiaKeysList(true),
            nvidiaKeyNames: getNvidiaKeyNamesList(),
            cohereKeys: getCohereKeysList(true),
            cohereKeyNames: getCohereKeyNamesList(),
            externalConfigs: getExternalConfigsObj(true),
            dynamicProviders: window.DynamicProviders?.exportConfig(true),
            gestureConfig: ls.getItem('jarvis_gesture_config') || '',
            personaConfig: ls.getItem('jarvis_persona_config') || '',
            personaProfile: ls.getItem('jarvis_persona_profile') || '',
            factsStore: ls.getItem('jarvis_facts') || '',
            uiDensity: ls.getItem('jarvis_ui_density') || '',
            model: getDOM().model?.value || 'gemini-3.6-flash',
            // Provider đã chọn (model id có thể trùng giữa nhiều provider)
            modelProvider: window.DynamicProviders?.getSelectedModelProvider?.() || null,
            temperature: getDOM().temp?.value || 0.5,
            searchEngine: getDOM().searchEngineSel?.value || 'tavily',
            globalContext: getDOM().globContext?.value || '',
            systemInstruction: getDOM().sysInst?.value || '',
            theme: ls.getItem('jarvis_theme') || 'auto',
            autoLearnMemory: ls.getItem('jarvis_auto_learn_memory') || 'true',
            ragEnabled: ls.getItem('jarvis_rag_enabled') || 'true',
            autoSyncCloud: ls.getItem('jarvis_auto_sync_cloud') || 'true',
            settingsUpdatedAt: _settingsTs,
            keyUpdatedAt: _keyTs,
          },
        };

        const newGistId = await pushGistData(pat, gistId, backupData);
        if (!gistId && newGistId) {
          gistId = newGistId;
          if (gistIdInput) gistIdInput.value = gistId;
        }

        const timeStr = new Date().toLocaleString('vi-VN');
        ls.setItem('jarvis_gist_pat', pat);
        ls.setItem('jarvis_gist_id', gistId);
        ls.setItem('jarvis_gist_last_sync', timeStr);
        ls.setItem('jarvis_gist_last_sync_timestamp', String(Date.now()));
        if (gistLastTime) gistLastTime.innerText = `Lần cuối: ${timeStr}`;
      } else {
        // Khi không cần push vì máy này không có gì mới hơn Cloud, vẫn ghi nhận thời gian kiểm tra
        const timeStr = new Date().toLocaleString('vi-VN');
        ls.setItem('jarvis_gist_pat', pat);
        ls.setItem('jarvis_gist_id', gistId);
        ls.setItem('jarvis_gist_last_sync', timeStr);
        ls.setItem('jarvis_gist_last_sync_timestamp', String(Date.now()));
        if (gistLastTime) gistLastTime.innerText = `Lần cuối: ${timeStr}`;
      }

      // CẬP NHẬT GIAO DIỆN MÀ KHÔNG GÂY CHỚP MÀN HÌNH:
      renderFolders();
      renderSnippets();
      renderSel();
      renderTabs();

      // TUYỆT ĐỐI KHÔNG GỌI switchSess TRONG CHẾ ĐỘ CHẠY NGẦM (SILENT)
      // Vì switchSess sẽ xóa trắng getDOM().chat và vẽ lại từ đầu, gây chớp màn hình khi đang đọc tin nhắn!
      if (!silent) {
        // Khi bấm thủ công: vẽ lại chính xác phiên hiện tại của máy này từ dữ liệu đã hợp nhất
        await switchSess(window.activeId);
      } else if (hasChanges) {
        // Khi đồng bộ ngầm: CHỈ append thêm tin nhắn NẾU VÀ CHỈ NẾU chính phiên đang mở trên màn hình có tin mới
        const currentVisible = window.sessions.find(s => s.id === window.activeId);
        if (currentVisible && Array.isArray(currentVisible.his)) {
          const domCount = (window.chatHistory || []).length;
          const newCount = currentVisible.his.length;
          if (newCount > domCount) {
            // Kiểm tra an toàn: các tin cũ trên màn hình phải khớp 100% với lịch sử của chính phiên này
            let isPrefixMatch = true;
            for (let i = 0; i < domCount; i++) {
              if (
                window.chatHistory[i]?.text !== currentVisible.his[i]?.text ||
                window.chatHistory[i]?.role !== currentVisible.his[i]?.role
              ) {
                isPrefixMatch = false;
                break;
              }
            }
            // CHỈ append khi và chỉ khi đúng là các tin tiếp theo của chính phiên này, tuyệt đối không nhảy phiên!
            if (isPrefixMatch) {
              const addedMsgs = currentVisible.his.slice(domCount);
              window.chatHistory = [...currentVisible.his];
              for (let idx = 0; idx < addedMsgs.length; idx++) {
                const msg = addedMsgs[idx];
                await appendMsg(
                  msg.role === 'model' ? 'bot' : 'user',
                  msg.text || '',
                  domCount + idx,
                  false
                );
              }
              if (getDOM().chat) getDOM().chat.scrollTop = getDOM().chat.scrollHeight;
            }
          } else if (newCount < domCount && typeof window.reRenderHistory === 'function') {
            // Có tin nhắn bị xóa ở máy khác -> vẽ lại cho khớp, vẫn giữ vị trí cuộn
            const keepScroll = window.captureChatScroll ? window.captureChatScroll() : null;
            window.chatHistory = currentVisible.his.slice();
            await window.reRenderHistory();
            if (keepScroll && window.restoreChatScroll) window.restoreChatScroll(keepScroll);
          }
        }
      }

      const kCount = finalKnowledge.length ? `, ${finalKnowledge.length} tri thức` : '';
      if (gistStatusText) {
        gistStatusText.innerText = `Đã hợp nhất (${finalSessions.length} phiên${kCount})`;
        gistStatusText.style.color = '#10b981';
      }
      const lastSyncDisplay =
        ls.getItem('jarvis_gist_last_sync') || new Date().toLocaleTimeString('vi-VN');
      if (headerSyncBtn) {
        headerSyncBtn.title = `Đồng bộ Cloud Gist (Lần cuối: ${lastSyncDisplay})`;
      }

      if (!silent) {
        showToast(
          `🔄 Đồng bộ 2 chiều thành công! Đã gộp ${finalSessions.length} phiên & ${finalKnowledge.length} mẩu tri thức.`,
          'success'
        );
      } else {
        console.log(
          `[Auto-Sync] Đã kiểm tra đồng bộ ngầm 2 chiều (${finalSessions.length} phiên, ${finalKnowledge.length} tri thức)`
        );
      }
    } catch (err) {
      console.error('[SmartSync] Lỗi đồng bộ:', err);
      if (!silent) {
        let msg = err.message;
        if (
          err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          msg?.includes('timeout') ||
          msg?.includes('aborted')
        ) {
          msg = 'Kết nối GitHub Gist bị timeout (15s). Kiểm tra mạng hoặc thử lại sau.';
        }
        showToast(`Lỗi đồng bộ 2 chiều: ${msg}`, 'danger');
      }
    } finally {
      _isSyncing = false;
      const headerSyncLabel = $('header-sync-label');
      if (headerSyncLabel) headerSyncLabel.innerText = 'Đồng bộ';
      updateSyncHeaderStatus();

      if (syncBtn && !silent) {
        syncBtn.innerHTML = oldBtnHtml || `🔄 Đồng bộ 2 chiều (Smart Sync & Merge)`;
        syncBtn.disabled = false;
      }
      if (headerSyncBtn && silent) {
        headerSyncBtn.classList.remove('syncing-pulse');
        const span = headerSyncBtn.querySelector('span');
        if (span) span.innerText = 'Đồng bộ';
      }
    }
  }

  // Tự động lên lịch đồng bộ ngầm (Debounced Auto-Sync)
  function scheduleAutoSync(delay = 10000) {
    if (_isSyncing) return;
    if (_gistRateLimitedUntil && Date.now() < _gistRateLimitedUntil) return;
    if (_gistRateLimitedUntil && Date.now() >= _gistRateLimitedUntil) {
      _gistRateLimitedUntil = 0;
    }
    if (ls.getItem('jarvis_auto_sync_cloud') === 'false') return;
    const pat = (ls.getItem('jarvis_gist_pat') || '').trim();
    const gistId = (ls.getItem('jarvis_gist_id') || '').trim();
    if (!pat || !gistId) return;

    clearTimeout(_autoSyncTimer);
    _autoSyncTimer = setTimeout(() => {
      if (_isSyncing) return;
      console.log('[Auto-Sync] Đang tự động đồng bộ ngầm dữ liệu mới lên Cloud...');
      performSmartSync({ silent: true }).catch(() => {});
    }, delay);
  }

  // Expose cho module khác (như rag.js) gọi đồng bộ ngầm
  window.JarvisSync = {
    performSmartSync,
    scheduleAutoSync,
  };

  // Khởi tạo trạng thái modal Cloud Sync
  const openCloudSyncModal = () => {
    cloudSyncModal.style.display = 'flex';
    oLay.style.display = 'block';
    gistPatInput.value = ls.getItem('jarvis_gist_pat') || '';
    gistIdInput.value = ls.getItem('jarvis_gist_id') || '';

    if (gistAutoSyncToggle) {
      gistAutoSyncToggle.checked = ls.getItem('jarvis_auto_sync_cloud') !== 'false';
      gistAutoSyncToggle.onchange = () => {
        ls.setItem('jarvis_auto_sync_cloud', gistAutoSyncToggle.checked ? 'true' : 'false');
        showToast(
          gistAutoSyncToggle.checked
            ? 'Đã bật tự động đồng bộ 2 chiều ngầm!'
            : 'Đã tắt tự động đồng bộ ngầm',
          'info'
        );
        if (gistAutoSyncToggle.checked) scheduleAutoSync(5000);
      };
    }

    const last = ls.getItem('jarvis_gist_last_sync');
    if (last) {
      gistStatusText.innerText = 'Đã kết nối Gist';
      gistStatusText.style.color = '#10b981';
      gistLastTime.innerText = `Lần cuối: ${last}`;
    } else {
      gistStatusText.innerText = 'Chưa đồng bộ';
      gistStatusText.style.color = 'var(--text-muted)';
      gistLastTime.innerText = '--:--';
    }
  };

  $('btn-open-cloud-sync').onclick = openCloudSyncModal;
  if ($('btn-cloud-sync-header')) $('btn-cloud-sync-header').onclick = openCloudSyncModal;
  if ($('btn-cloud-sync-chip')) $('btn-cloud-sync-chip').onclick = openCloudSyncModal;
  if ($('btn-open-cloud-from-settings'))
    $('btn-open-cloud-from-settings').onclick = () => {
      $('settings-modal').style.display = 'none';
      openCloudSyncModal();
    };

  $('btn-toggle-pat-eye').onclick = () => {
    gistPatInput.type = gistPatInput.type === 'password' ? 'text' : 'password';
  };

  $('btn-copy-gist-id').onclick = () => {
    const id = gistIdInput.value.trim();
    if (!id) return showToast('Chưa có Gist ID!', 'warning');
    navigator.clipboard.writeText(id);
    showToast('Đã sao chép Gist ID!');
  };

  // NÚT CHÍNH: ĐỒNG BỘ 2 CHIỀU (SMART SYNC & MERGE)
  if ($('btn-gist-sync')) {
    $('btn-gist-sync').onclick = async () => {
      await performSmartSync({ silent: false });
    };
  }

  // PUSH TO GIST (GHI ĐÈ CLOUD - BACKUP THỦ CÔNG)
  $('btn-gist-push').onclick = async () => {
    const pat = gistPatInput.value.trim();
    if (!pat) return showToast('Vui lòng nhập GitHub Personal Access Token (PAT)!', 'warning');
    let gistId = gistIdInput.value.trim();

    const btn = $('btn-gist-push');
    btn.innerHTML = `<span>Đang đẩy lên...</span> ⏳`;
    btn.disabled = true;

    try {
      const allSessions = await getAllFromDB();
      const cleanSessions = allSessions.map(sanitizeSessionForBackup);

      let allKnowledge = [];
      if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
        try {
          allKnowledge = await window.JarvisRAG.getAllKnowledge();
        } catch (kErr) {
          console.warn('Lỗi trích xuất Kho tri thức:', kErr);
        }
      }

      const _settingsTs2 = bumpSettingsTimestamps();
      const _keyTs2 = bumpKeyTimestamps();
      const backupData = {
        version: 2,
        app: 'Jarvis AI',
        timestamp: new Date().toISOString(),
        timeReadable: new Date().toLocaleString('vi-VN'),
        device: 'ontouchstart' in window ? 'Mobile' : 'Desktop',
        sessions: cleanSessions,
        activeId: window.activeId,
        customPrompts: JSON.parse(ls.getItem('jarvis_custom_prompts') || '[]'),
        folders: JSON.parse(ls.getItem('jarvis_folders') || '["Mặc định"]'),
        knowledgeBase: allKnowledge,
        deletedVectorIds: Array.from(readDeletedVectorIds()),
        medications: JSON.parse(ls.getItem('jarvis_medications') || '[]'),
        medHistory: JSON.parse(ls.getItem('jarvis_med_history') || '[]'),
        keyUsageFlash:
          typeof window.loadKeyUsageData === 'function' ? window.loadKeyUsageData() : null,
        keyUsageOpenRouter:
          typeof window.loadOpenRouterUsageData === 'function'
            ? window.loadOpenRouterUsageData()
            : null,
        keyUsageExplabs:
          typeof window.loadExplabsUsageData === 'function' ? window.loadExplabsUsageData() : null,
        keyUsageNvidia:
          typeof window.loadNvidiaUsageData === 'function' ? window.loadNvidiaUsageData() : null,
        keyUsageCohere:
          typeof window.loadCohereUsageData === 'function' ? window.loadCohereUsageData() : null,
        settings: {
          keys: getGoogleKeysList(true),
          keyNames: getGoogleKeyNamesList(),
          openRouterKeys: getOpenRouterKeysList(true),
          openRouterKeyNames: getOpenRouterKeyNamesList(),
          explabsKeys: getExplabsKeysList(true),
          explabsKeyNames: getExplabsKeyNamesList(),
          nvidiaKeys: getNvidiaKeysList(true),
          nvidiaKeyNames: getNvidiaKeyNamesList(),
          cohereKeys: getCohereKeysList(true),
          cohereKeyNames: getCohereKeyNamesList(),
          externalConfigs: getExternalConfigsObj(true),
          dynamicProviders: window.DynamicProviders?.exportConfig(true),
          personaConfig: ls.getItem('jarvis_persona_config') || '',
          model: getDOM().model?.value || 'gemini-3.6-flash',
          // Provider đã chọn (model id có thể trùng giữa nhiều provider)
          modelProvider: window.DynamicProviders?.getSelectedModelProvider?.() || null,
          temperature: getDOM().temp?.value || 0.5,
          searchEngine: getDOM().searchEngineSel?.value || 'tavily',
          globalContext: getDOM().globContext?.value || '',
          systemInstruction: getDOM().sysInst?.value || '',
          theme: ls.getItem('jarvis_theme') || 'auto',
          autoLearnMemory: ls.getItem('jarvis_auto_learn_memory') || 'true',
          ragEnabled: ls.getItem('jarvis_rag_enabled') || 'true',
          autoSyncCloud: ls.getItem('jarvis_auto_sync_cloud') || 'true',
          settingsUpdatedAt: _settingsTs2,
          keyUpdatedAt: _keyTs2,
        },
      };

      gistId = await pushGistData(pat, gistId, backupData);
      gistIdInput.value = gistId;

      const timeStr = new Date().toLocaleString('vi-VN');
      ls.setItem('jarvis_gist_pat', pat);
      ls.setItem('jarvis_gist_id', gistId);
      ls.setItem('jarvis_gist_last_sync', timeStr);
      ls.setItem('jarvis_gist_last_sync_timestamp', String(Date.now()));

      const kCount = allKnowledge.length ? `, ${allKnowledge.length} tri thức` : '';
      gistStatusText.innerText = `Đã sao lưu (${allSessions.length} phiên${kCount})`;
      gistStatusText.style.color = '#10b981';
      gistLastTime.innerText = `Lần cuối: ${timeStr}`;

      showToast(`Đã ghi đè Cloud thành công! Gist ID: ${gistId}`, 'success');
    } catch (err) {
      let msg = err.message;
      if (
        err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        msg?.includes('timeout') ||
        msg?.includes('aborted')
      ) {
        msg = 'Kết nối GitHub Gist bị timeout (15s). Kiểm tra mạng hoặc thử lại sau.';
      }
      showToast(`Lỗi đẩy lên Cloud: ${msg}`, 'danger');
    } finally {
      btn.innerHTML = `☁️ Ghi đè Cloud (Backup)`;
      btn.disabled = false;
    }
  };

  // PULL FROM GIST (GHI ĐÈ MÁY - RESTORE THỦ CÔNG)
  $('btn-gist-pull').onclick = async () => {
    const pat = gistPatInput.value.trim();
    const gistId = gistIdInput.value.trim();
    if (!pat) return showToast('Vui lòng nhập GitHub PAT!', 'warning');
    if (!gistId) return showToast('Vui lòng nhập Gist ID cần tải về!', 'warning');

    if (
      !confirm(
        "Thao tác này sẽ GHI ĐÈ toàn bộ lịch sử và cài đặt máy này bằng dữ liệu trên Cloud. Bạn có muốn tiếp tục? (Để gộp cả hai bên mà không mất dữ liệu, hãy dùng nút 'Đồng bộ 2 chiều')"
      )
    )
      return;

    const btn = $('btn-gist-pull');
    btn.innerHTML = `<span>Đang tải về...</span> ⏳`;
    btn.disabled = true;

    try {
      const parsed = await fetchGistData(pat, gistId);
      if (!parsed.sessions || !Array.isArray(parsed.sessions))
        throw new Error('Cấu trúc dữ liệu không hợp lệ!');

      if (parsed.sessions && parsed.sessions.length > 0) {
        await clearAllDB();
        for (const s of parsed.sessions) {
          await saveToDB(s);
        }
      }

      window.sessions = (await getAllFromDB()).sort(
        (a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)
      );
      if (parsed.activeId && window.sessions.some(s => s.id === parsed.activeId)) {
        window.activeId = parsed.activeId;
      } else if (window.sessions.length > 0) {
        window.activeId = window.sessions[0]?.id || null;
      }
      ls.setItem('jarvis_active_id', window.activeId);

      if (parsed.folders && Array.isArray(parsed.folders)) {
        folders = parsed.folders;
        ls.setItem('jarvis_folders', JSON.stringify(folders));
      }

      if (parsed.customPrompts && Array.isArray(parsed.customPrompts)) {
        ls.setItem('jarvis_custom_prompts', JSON.stringify(parsed.customPrompts));
      }

      if (parsed.medications && Array.isArray(parsed.medications)) {
        ls.setItem('jarvis_medications', JSON.stringify(parsed.medications));
        if (window.saveToNativeBridge)
          window.saveToNativeBridge('jarvis_medications', JSON.stringify(parsed.medications));
      }
      if (parsed.medHistory && Array.isArray(parsed.medHistory)) {
        ls.setItem('jarvis_med_history', JSON.stringify(parsed.medHistory));
        if (window.saveToNativeBridge)
          window.saveToNativeBridge('jarvis_med_history', JSON.stringify(parsed.medHistory));
      }
      if (parsed.deletedVectorIds && Array.isArray(parsed.deletedVectorIds)) {
        const cur = new Set(JSON.parse(ls.getItem('jarvis_deleted_vector_ids') || '[]'));
        parsed.deletedVectorIds.forEach(id => { if (id) cur.add(id); });
        ls.setItem('jarvis_deleted_vector_ids', JSON.stringify(Array.from(cur).slice(-500)));
      }
      if (typeof window.reloadMaxMedicationsFromStorage === 'function') {
        window.reloadMaxMedicationsFromStorage();
      }

      if (parsed.settings) {
        if (parsed.settings.keys) setGoogleKeysList(parsed.settings.keys);
        if (parsed.settings.keyNames) setGoogleKeyNamesList(parsed.settings.keyNames);
        if (parsed.settings.openRouterKeys) setOpenRouterKeysList(parsed.settings.openRouterKeys);
        if (parsed.settings.openRouterKeyNames)
          setOpenRouterKeyNamesList(parsed.settings.openRouterKeyNames);
        if (parsed.settings.explabsKeys) setExplabsKeysList(parsed.settings.explabsKeys);
        if (parsed.settings.explabsKeyNames)
          setExplabsKeyNamesList(parsed.settings.explabsKeyNames);
        if (parsed.settings.nvidiaKeys) setNvidiaKeysList(parsed.settings.nvidiaKeys);
        if (parsed.settings.nvidiaKeyNames) setNvidiaKeyNamesList(parsed.settings.nvidiaKeyNames);
        if (parsed.settings.cohereKeys) setCohereKeysList(parsed.settings.cohereKeys);
        if (parsed.settings.cohereKeyNames) setCohereKeyNamesList(parsed.settings.cohereKeyNames);
        if (parsed.settings.externalConfigs) setExternalConfigsObj(parsed.settings.externalConfigs);
        if (
          parsed.settings.dynamicProviders &&
          typeof window.DynamicProviders?.importConfig === 'function'
        ) {
          window.DynamicProviders.importConfig(parsed.settings.dynamicProviders, { merge: true });
        }
        if (parsed.settings.gestureConfig) {
          ls.setItem('jarvis_gesture_config', parsed.settings.gestureConfig);
          if (window.GestureManager && typeof window.GestureManager.init === 'function') {
            window.GestureManager.init();
          }
        }
        if (parsed.settings.personaConfig) {
          ls.setItem('jarvis_persona_config', parsed.settings.personaConfig);
          if (window.PersonaConfig && typeof window.PersonaConfig.refreshUI === 'function') {
            window.PersonaConfig.refreshUI();
          }
        }
        if (parsed.settings.personaProfile) {
          ls.setItem('jarvis_persona_profile', parsed.settings.personaProfile);
        }
        if (parsed.settings.factsStore) {
          ls.setItem('jarvis_facts', parsed.settings.factsStore);
        }
        if (parsed.settings.uiDensity) {
          ls.setItem('jarvis_ui_density', parsed.settings.uiDensity);
          if (window.Personalization && typeof window.Personalization.setDensity === 'function')
            window.Personalization.setDensity(parsed.settings.uiDensity);
        }
        if (parsed.settings.model && getDOM().model) {
          // Khôi phục theo cả provider để không chọn nhầm option trùng model id
          const applied = window.DynamicProviders?.selectModelOption?.(
            parsed.settings.model,
            parsed.settings.modelProvider
          );
          if (!applied) getDOM().model.value = parsed.settings.model;
        }
        if (parsed.settings.temperature && getDOM().temp) {
          getDOM().temp.value = parsed.settings.temperature;
          if (getDOM().tempVal) getDOM().tempVal.innerText = parsed.settings.temperature;
        }
        if (parsed.settings.searchEngine && getDOM().searchEngineSel)
          getDOM().searchEngineSel.value = parsed.settings.searchEngine;
        if (parsed.settings.globalContext && getDOM().globContext) {
          getDOM().globContext.value = parsed.settings.globalContext;
          ls.setItem('jarvis_global_context', parsed.settings.globalContext);
          ls.setItem('huanmu_global_context', parsed.settings.globalContext);
        }
        if (parsed.settings.systemInstruction && getDOM().sysInst)
          getDOM().sysInst.value = parsed.settings.systemInstruction;
        if (parsed.settings.theme) {
          ls.setItem('jarvis_theme', parsed.settings.theme);
          ls.setItem('theme', parsed.settings.theme);
          if (window.ThemeScheduler && typeof window.ThemeScheduler.setMode === 'function')
            window.ThemeScheduler.setMode(parsed.settings.theme);
        }
        if (parsed.settings.autoLearnMemory)
          ls.setItem('jarvis_auto_learn_memory', parsed.settings.autoLearnMemory);
        if (parsed.settings.ragEnabled)
          ls.setItem('jarvis_rag_enabled', parsed.settings.ragEnabled);
        if (parsed.settings.settingsUpdatedAt && typeof parsed.settings.settingsUpdatedAt === 'object')
          writeSyncMap('jarvis_settings_updated_at', parsed.settings.settingsUpdatedAt);
        if (parsed.settings.keyUpdatedAt && typeof parsed.settings.keyUpdatedAt === 'object')
          writeSyncMap('jarvis_key_updated_at', parsed.settings.keyUpdatedAt);
        // Làm mới snapshot để không bị coi là thay đổi local sau khi restore
        try { writeSyncMap('jarvis_settings_snapshot', collectSettingsSnapshot()); } catch (_) {}
        try { writeSyncMap('jarvis_key_snapshot', collectKeySnapshot()); } catch (_) {}
      }

      if (parsed.keyUsageFlash && typeof window.setKeyUsageData === 'function') {
        window.setKeyUsageData(parsed.keyUsageFlash);
      }
      if (parsed.keyUsageOpenRouter && typeof window.setOpenRouterUsageData === 'function') {
        window.setOpenRouterUsageData(parsed.keyUsageOpenRouter);
      }
      if (parsed.keyUsageExplabs && typeof window.setExplabsUsageData === 'function') {
        window.setExplabsUsageData(parsed.keyUsageExplabs);
      }
      if (parsed.keyUsageNvidia && typeof window.setNvidiaUsageData === 'function') {
        window.setNvidiaUsageData(parsed.keyUsageNvidia);
      }
      window.updateKeyQuotaUI?.();
      window.updateOpenRouterQuotaUI?.();
      window.updateExplabsQuotaUI?.();
      if (parsed.keyUsageCohere && typeof window.setCohereUsageData === 'function') {
        window.setCohereUsageData(parsed.keyUsageCohere);
      }
      window.updateNvidiaQuotaUI?.();
      window.updateCohereQuotaUI?.();

      let importedKCount = 0;
      if (
        parsed.knowledgeBase &&
        Array.isArray(parsed.knowledgeBase) &&
        window.JarvisRAG &&
        typeof window.JarvisRAG.importKnowledge === 'function'
      ) {
        try {
          importedKCount = await window.JarvisRAG.importKnowledge(parsed.knowledgeBase, true);
        } catch (kErr) {
          console.warn('Lỗi khôi phục Kho Tri Thức từ Gist:', kErr);
        }
      }

      const timeStr = new Date().toLocaleString('vi-VN');
      ls.setItem('jarvis_gist_pat', pat);
      ls.setItem('jarvis_gist_id', gistId);
      ls.setItem('jarvis_gist_last_sync', timeStr);
      ls.setItem('jarvis_gist_last_sync_timestamp', String(Date.now()));

      if (window.JarvisNativeBridge) {
        saveToNativeBridge('jarvis_sessions_backup', JSON.stringify(window.sessions));
        if (typeof window.JarvisNativeBridge.commit === 'function') {
          window.JarvisNativeBridge.commit();
        }
      }

      const kPullStatus = importedKCount ? `, ${importedKCount} tri thức` : '';
      gistStatusText.innerText = `Đã ghi đè (${window.sessions.length} phiên${kPullStatus})`;
      gistStatusText.style.color = '#10b981';
      gistLastTime.innerText = `Lần cuối: ${timeStr}`;

      renderFolders();
      renderSnippets();
      await switchSess(window.activeId);

      showToast(
        `Đã khôi phục thành công ${window.sessions.length} phiên${importedKCount ? ' & ' + importedKCount + ' mẩu tri thức' : ''} từ Cloud!`,
        'success'
      );
    } catch (err) {
      let msg = err.message;
      if (
        err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        msg?.includes('timeout') ||
        msg?.includes('aborted')
      ) {
        msg = 'Kết nối GitHub Gist bị timeout (15s). Kiểm tra mạng hoặc thử lại sau.';
      }
      showToast(`Lỗi tải về từ Cloud: ${msg}`, 'danger');
    } finally {
      btn.innerHTML = `📥 Ghi đè Máy (Restore)`;
      btn.disabled = false;
    }
  };

  // Tự động cập nhật nhãn thời gian đồng bộ trên thanh tiêu đề
  updateSyncHeaderStatus();
  setInterval(updateSyncHeaderStatus, 60000);

  // Tự động kiểm tra & đồng bộ 2 chiều ngầm khi khởi động ứng dụng (Startup Sync - 1 lần duy nhất sau 5 giây)
  setTimeout(() => {
    if (
      ls.getItem('jarvis_auto_sync_cloud') !== 'false' &&
      ls.getItem('jarvis_gist_pat') &&
      ls.getItem('jarvis_gist_id')
    ) {
      console.log('[Auto-Sync] Kiểm tra và đồng bộ ngầm khi mở app...');
      performSmartSync({ silent: true }).catch(() => {});
    }
  }, 5000);
})();
