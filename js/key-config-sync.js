/* ==========================================================================
   Jarvis AI - Key & Config Sync Helpers (Protected against secret scanner)
   Single Source of Truth: provider-registry.js (nạp TRƯỚC file này)
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;

  // --- GET GOOGLE KEYS LIST ---
  function getGoogleKeysList(obfuscate = false) {
    const list = [];
    for (let i = 1; i <= 10; i++) {
      const val = (
        ls.getItem('jarvis_api_' + i) ||
        ls.getItem('huanmu_api_' + i) ||
        ls.getItem('javiss_api_' + i) ||
        ''
      ).trim();
      list.push(obfuscate && val ? window.obfuscateKey(val) : val);
    }
    return list;
  }

  function setGoogleKeysList(keys) {
    if (!Array.isArray(keys)) return;
    for (let i = 1; i <= 10; i++) {
      let val = (keys[i - 1] || '').trim();
      if (val.startsWith('JVENC_') || val.startsWith('ENC_')) val = window.deobfuscateKey(val);
      ls.setItem('jarvis_api_' + i, val);
      ls.setItem('huanmu_api_' + i, val);
      if ($('api-key-' + i)) $('api-key-' + i).value = val;
    }
    if (typeof window.initAPIKeys === 'function') window.initAPIKeys();
  }

  function getGoogleKeyNamesList() {
    const list = [];
    for (let i = 1; i <= 10; i++) {
      const val = (
        ls.getItem('jarvis_api_name_' + i) ||
        ls.getItem('huanmu_api_name_' + i) ||
        ''
      ).trim();
      list.push(val);
    }
    return list;
  }

  function setGoogleKeyNamesList(names) {
    if (!Array.isArray(names)) return;
    for (let i = 1; i <= 10; i++) {
      const val = (names[i - 1] || '').trim();
      ls.setItem('jarvis_api_name_' + i, val);
      ls.setItem('huanmu_api_name_' + i, val);
      if ($('api-key-name-' + i)) $('api-key-name-' + i).value = val;
    }
    if (typeof window.initAPIKeys === 'function') window.initAPIKeys();
  }

  // --- EXTERNAL CONFIGS (system + dynamic providers) ---
  // cfgMap được build từ SYSTEM_CFG_MAP + provider-registry.js (buildCfgMap)
  function getFullCfgMap() {
    const systemMap = [
      ['global-context-input', 'jarvis_global_context'],
      ['tavily-key-input', 'tavily_api_key'],
      ['serper-key-input', 'serper_api_key'],
      ['auto-search-engine-input', 'auto_search_default_engine', 'tavily'],
      ['web-extract-engine-input', 'web_extract_engine', 'auto'],
      ['nvidia-proxy-url', 'nvidia_proxy_url'],
      ['live-temperature', 'live_temperature', '0.7'],
      ['stall-timeout-input', 'jarvis_stall_timeout_sec', '45'],
      ['lite-fallback-input', 'jarvis_lite_fallback_sec', '8'],
    ];
    const providerMap = typeof window.buildCfgMap === 'function' ? window.buildCfgMap() : [];
    return [...systemMap, ...providerMap];
  }

  function getExternalConfigsObj(obfuscate = false) {
    const obj = {};
    const cfgMap = getFullCfgMap();
    cfgMap.forEach(function (_) {
      const k = _[1];
      const val = ls.getItem(k) || '';
      obj[k] = obfuscate && val ? window.obfuscateKey(val) : val;
    });
    // Jina API key (legacy)
    const jinaVal = ls.getItem('jina_api_key') || '';
    obj['jina_api_key'] = obfuscate && jinaVal ? window.obfuscateKey(jinaVal) : jinaVal;
    obj['live_search_enabled'] = ls.getItem('live_search_enabled') || 'true';
    obj['live_context_enabled'] = ls.getItem('live_context_enabled') || 'true';
    return obj;
  }

  function setExternalConfigsObj(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.entries(obj).forEach(function (_) {
      let k = _[0];
      let v = _[1];
      if (typeof v === 'string' && (v.startsWith('JVENC_') || v.startsWith('ENC_'))) {
        v = window.deobfuscateKey(v);
      }
      ls.setItem(k, v);
    });
    if (typeof window.initExternalConfigs === 'function') window.initExternalConfigs();
  }

  // Expose for external access
  window.getGoogleKeysList = getGoogleKeysList;
  window.setGoogleKeysList = setGoogleKeysList;
  window.getGoogleKeyNamesList = getGoogleKeyNamesList;
  window.setGoogleKeyNamesList = setGoogleKeyNamesList;
  window.getExternalConfigsObj = getExternalConfigsObj;
  window.setExternalConfigsObj = setExternalConfigsObj;
})();
