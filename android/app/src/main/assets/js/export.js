/* ==========================================================================
   Jarvis AI - Export, Backup & Sharing Subsystem (js/export.js)
   Xuất hội thoại ra PDF, Word Doc, Markdown, Sao lưu toàn bộ cấu hình &
   phiên hội thoại ra tệp JSON, hỗ trợ lưu trữ cục bộ & Android Native Download.

   Single Source of Truth: provider-registry.js (nạp TRƯỚC file này)
   ========================================================================== */

(function () {
  'use strict';

  const ls = window.ls || localStorage;
  const showToast = (msg, type) =>
    typeof window.showToast === 'function'
      ? window.showToast(msg, type)
      : console.log(`[${type}] ${msg}`);
  const obfuscateKey = k =>
    typeof window.obfuscateKey === 'function' ? window.obfuscateKey(k) : k;
  const deobfuscateKey = k =>
    typeof window.deobfuscateKey === 'function' ? window.deobfuscateKey(k) : k;
  const escapeHtml = str =>
    typeof window.escapeHtml === 'function'
      ? window.escapeHtml(str)
      : String(str == null ? '' : str).replace(
          /[&<>"']/g,
          m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
        );

  // Nội dung hội thoại (kể cả tin nhắn cũ nhập từ backup) là dữ liệu không tin cậy.
  function renderMarkdownSafe(text) {
    const marked = window.marked;
    if (!marked) return escapeHtml(text);
    const html = marked.parse(text || '');
    return typeof window.sanitizeHtml === 'function' ? window.sanitizeHtml(html) : escapeHtml(text);
  }

  function fallbackBrowserDownload(b, fn) {
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = u;
    a.download = fn;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(u);
    }, 2000);
    showToast(`📥 Đã tải: ${fn}`);
  }

  async function saveOrShareBlob(b, fn) {
    try {
      // 1. Nếu đang chạy trong Android APK (có Native Bridge hỗ trợ ghi file vào Download):
      if (
        window.JarvisNativeBridge &&
        typeof window.JarvisNativeBridge.saveBase64File === 'function'
      ) {
        showToast(`⏳ Đang lưu tệp ${fn}...`, 'info');
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const res = reader.result || '';
            const rawResult = String(res);
            const base64Data = rawResult.includes(',') ? rawResult.split(',')[1] : rawResult;
            // Java: saveBase64File(base64Data, filename, mimeType)
            window.JarvisNativeBridge.saveBase64File(
              base64Data,
              fn,
              b.type || 'application/octet-stream'
            );
          } catch (err) {
            console.warn('Native saveBase64File error, falling back to browser:', err);
            fallbackBrowserDownload(b, fn);
          }
        };
        reader.readAsDataURL(b);
        return;
      }

      // 2. Trình duyệt PC và Mobile Web: Tải trực tiếp vào Downloads
      fallbackBrowserDownload(b, fn);
    } catch (e) {
      showToast(`❌ Lỗi: ${e.message}`, 'danger');
    }
  }

  function copyRawText(t, msg = '📋 Đã copy vào bộ nhớ!') {
    if (!t) return showToast('Nội dung trống!', 'warning');
    const fb = () => {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast(msg);
      } catch {
        showToast('Lỗi copy', 'danger');
      }
      ta.remove();
    };
    navigator.clipboard && window.isSecureContext
      ? navigator.clipboard
          .writeText(t)
          .then(() => showToast(msg))
          .catch(fb)
      : fb();
  }

  function sanitizeSessionForBackup(s) {
    if (!s) return s;
    const clean = { ...s };
    if (clean.assignedApiKey) {
      clean.assignedApiKey = obfuscateKey(clean.assignedApiKey);
    }
    return clean;
  }

  // Helper: lấy metadata provider từ registry
  function getProviderMeta(providerId) {
    if (typeof window.getProvider === 'function') return window.getProvider(providerId);
    return null;
  }
  function getProviderKeyPrefix(providerId) {
    const p = getProviderMeta(providerId);
    return p ? p.keyPrefix : `jarvis_provider_${providerId}_api`;
  }
  function getProviderKeyNamePrefix(providerId) {
    const p = getProviderMeta(providerId);
    return p ? p.keyNamePrefix : `jarvis_provider_${providerId}_name`;
  }
  function getProviderKeyCount(providerId) {
    const p = getProviderMeta(providerId);
    return p ? p.keyCount : 5;
  }
  function getProviderUsagePrefix(providerId) {
    const p = getProviderMeta(providerId);
    return p ? p.usagePrefix : `jarvis_provider_${providerId}_usage`;
  }

  async function exportAllSessions() {
    const cfgs = { chat_font_size: ls.getItem('chat_font_size') || '16' };
    for (let i = 1; i <= 10; i++) {
      const kVal = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || '').trim();
      cfgs[`jarvis_api_${i}`] = kVal ? obfuscateKey(kVal) : '';
      cfgs[`jarvis_api_name_${i}`] =
        ls.getItem(`jarvis_api_name_${i}`) || ls.getItem(`huanmu_api_name_${i}`) || '';
    }
    const cfgKeys = [
      'tavily_api_key',
      'serper_api_key',
      'brave_api_key',
      'groq_api_key',
      'deepseek_api_key',
      'jina_api_key',
      'brave_worker_url',
    ];
    cfgKeys.forEach(k => {
      const val = ls.getItem(k) || '';
      const isSecret = k.includes('key') || k.includes('_api_') || k === 'brave_worker_url';
      cfgs[k] = isSecret && val ? obfuscateKey(val) : val;
    });

    // Built-in OpenAI-compat providers (from registry)
    const builtInProviders = ['openrouter', 'explabs', 'nvidia', 'cohere'];
    builtInProviders.forEach(providerId => {
      const count = getProviderKeyCount(providerId);
      const keyPrefix = getProviderKeyPrefix(providerId);
      const namePrefix = getProviderKeyNamePrefix(providerId);
      const usagePrefix = getProviderUsagePrefix(providerId);
      for (let i = 1; i <= count; i++) {
        const val = (ls.getItem(`${keyPrefix}_${i}`) || '').trim();
        cfgs[`${keyPrefix}_${i}`] = val ? obfuscateKey(val) : '';
        cfgs[`${namePrefix}_${i}`] = ls.getItem(`${namePrefix}_${i}`) || '';
      }
      cfgs[usagePrefix] = ls.getItem(usagePrefix) || '';
    });

    // Cấu hình provider/model động (định nghĩa provider/model)
    cfgs['jarvis_dynamic_providers'] = ls.getItem('jarvis_dynamic_providers') || '';
    cfgs['jarvis_dynamic_models'] = ls.getItem('jarvis_dynamic_models') || '';

    // Bể key + tên gợi nhớ + bộ đếm của TỪNG provider động (Kilo, ...).
    // Bắt buộc phải có trong backup JSON và phải obfuscate (JVENC_) như key Google,
    // nếu không key provider tự thêm sẽ mất khi khôi phục sang máy khác.
    try {
      const dpProviders = JSON.parse(ls.getItem('jarvis_dynamic_providers') || '{}') || {};
      Object.entries(dpProviders).forEach(([id, p]) => {
        if (!p || typeof p !== 'object') return;
        const keyPrefix = p.keyPrefix || getProviderKeyPrefix(id);
        const namePrefix = p.keyNamePrefix || getProviderKeyNamePrefix(id);
        const count = Math.min(Math.max(parseInt(p.keyCount, 10) || 0, 0), 10);
        for (let i = 1; i <= count; i++) {
          const slotKey = (ls.getItem(`${keyPrefix}_${i}`) || '').trim();
          cfgs[`${keyPrefix}_${i}`] = slotKey ? obfuscateKey(slotKey) : '';
          cfgs[`${namePrefix}_${i}`] = ls.getItem(`${namePrefix}_${i}`) || '';
        }
        cfgs[`jarvis_provider_${id}_usage`] = ls.getItem(`jarvis_provider_${id}_usage`) || '';
      });
    } catch (e) {
      console.warn('[Backup] Không đọc được danh sách provider động:', e);
    }

    cfgs['live_search_enabled'] = ls.getItem('live_search_enabled') || 'true';
    cfgs['live_context_enabled'] = ls.getItem('live_context_enabled') || 'true';
    cfgs['jarvis_gesture_config'] = ls.getItem('jarvis_gesture_config') || '';
    cfgs['jarvis_persona_config'] = ls.getItem('jarvis_persona_config') || '';
    cfgs['jarvis_persona_profile'] = ls.getItem('jarvis_persona_profile') || '';
    cfgs['jarvis_facts'] = ls.getItem('jarvis_facts') || '';
    cfgs['jarvis_ui_density'] = ls.getItem('jarvis_ui_density') || '';
    cfgs['jarvis_folders'] = ls.getItem('jarvis_folders') || '["Mặc định"]';
    cfgs['jarvis_custom_prompts'] = ls.getItem('jarvis_custom_prompts') || '[]';
    cfgs['jarvis_medications'] = ls.getItem('jarvis_medications') || '[]';
    cfgs['jarvis_med_history'] = ls.getItem('jarvis_med_history') || '[]';

    let rawSessions = [];
    if (typeof window.getAllFromDB === 'function') {
      rawSessions = await window.getAllFromDB();
    } else if (window.sessions && Array.isArray(window.sessions)) {
      rawSessions = window.sessions;
    }

    const cleanSessions = rawSessions.map(sanitizeSessionForBackup);
    let localKnowledge = [];
    if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
      try {
        localKnowledge = await window.JarvisRAG.getAllKnowledge();
      } catch (e) {}
    }
    const backupObj = {
      brand: 'Jarvis AI',
      sessions: cleanSessions,
      configs: cfgs,
      knowledgeBase: localKnowledge,
    };
    const jsonStr = JSON.stringify(backupObj, null, 2);
    const filename = `JarvisAI_Backup_${Date.now()}.json`;

    await saveOrShareBlob(new Blob([jsonStr], { type: 'application/json' }), filename);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonStr);
        setTimeout(() => {
          showToast('📋 Đã sao chép nội dung JSON sao lưu vào Clipboard!', 'info');
        }, 1500);
      }
    } catch {}
  }

  function exportChatDoc() {
    const history = window.chatHistory || [];
    const h =
      `<html><head><meta charset="utf-8"></head><body><h2>Lịch sử Trò chuyện Jarvis AI</h2>` +
      history
        .map(
          m =>
            `<p><strong>${m.role === 'user' ? 'Bạn' : 'Jarvis AI'}:</strong><br>${m.role === 'model' ? renderMarkdownSafe(m.text) : escapeHtml(m.text).replace(/\n/g, '<br>')}</p><hr>`
        )
        .join('') +
      '</body></html>';
    saveOrShareBlob(
      new Blob(['\ufeff', h], { type: 'application/msword' }),
      `JarvisAI_Chat_${Date.now()}.doc`
    );
  }

  async function exportChatPDF() {
    const history = window.chatHistory || [];
    let html2pdf = window.html2pdf;
    if (!html2pdf && typeof window.ensureLib === 'function') {
      showToast('⏳ Đang tải thư viện xuất PDF...', 'info');
      try {
        html2pdf = await window.ensureLib('html2pdf');
      } catch (e) {
        return showToast(`Không tải được thư viện PDF: ${e.message}`, 'danger');
      }
    }
    if (!html2pdf) {
      return showToast('Thư viện html2pdf chưa sẵn sàng!', 'warning');
    }
    const e = document.createElement('div');
    e.style.padding = '20px';
    e.innerHTML =
      `<h2 style="color:#2563eb;margin-bottom:16px;">Jarvis AI Chat Transcript</h2>` +
      history
        .map(
          m =>
            `<div style="margin:14px 0;"><strong>${m.role === 'user' ? 'Bạn' : 'Jarvis AI'} [${escapeHtml(m.time || '')}]:</strong><br>${m.role === 'model' ? renderMarkdownSafe(m.text) : escapeHtml(m.text).replace(/\n/g, '<br>')}</div><hr style="border:none;border-top:1px solid #e2e8f0;">`
        )
        .join('');
    html2pdf()
      .from(e)
      .outputPdf('blob')
      .then(b => saveOrShareBlob(b, `JarvisAI_Chat_${Date.now()}.pdf`));
  }

  // Window exports
  window.saveOrShareBlob = saveOrShareBlob;
  window.fallbackBrowserDownload = fallbackBrowserDownload;
  window.copyRawText = copyRawText;
  window.exportAllSessions = exportAllSessions;
  window.exportChatDoc = exportChatDoc;
  window.exportChatPDF = exportChatPDF;
})();
