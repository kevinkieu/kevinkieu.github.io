/* ==========================================================================
   Jarvis AI - Session Auto-Cleanup (js/session-cleanup.js)
   Dọn các phiên hội thoại TRỐNG (0 tin nhắn) đã cũ khi mở app, tránh danh sách
   phiên phình to vô ích. An toàn: không bao giờ xoá phiên đang mở và không bao
   giờ xoá phiên có tin nhắn.

   Tắt bằng: localStorage['jarvis_auto_cleanup'] = 'false'
   ========================================================================== */
(function () {
  'use strict';

  const EMPTY_MIN_AGE_MS = 60 * 60 * 1000; // chỉ dọn phiên trống đã tạo > 1 giờ

  function getMessages(session) {
    if (!session) return [];
    if (Array.isArray(session.his)) return session.his;
    if (Array.isArray(session.messages)) return session.messages;
    return [];
  }

  // Hàm thuần: quyết định phiên nào đủ điều kiện xoá. Dùng cho cả app và unit test.
  function planCleanup(list, opts) {
    const options = opts || {};
    const keepId = options.keepId || null;
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const minAgeMs = Number.isFinite(options.minAgeMs) ? options.minAgeMs : EMPTY_MIN_AGE_MS;
    const removeIds = [];
    (Array.isArray(list) ? list : []).forEach(s => {
      if (!s || !s.id || s.id === keepId) return;
      if (getMessages(s).length > 0) return;
      const updated = Number(s.updatedAt) || 0;
      if (now - updated < minAgeMs) return;
      removeIds.push(s.id);
    });
    // Luôn giữ lại ít nhất 1 phiên (phiên đang mở hoặc phiên mới nhất).
    const total = Array.isArray(list) ? list.length : 0;
    if (total - removeIds.length < 1 && removeIds.length) removeIds.pop();
    return { removeIds };
  }

  async function cleanupEmptySessions(opts) {
    const options = opts || {};
    const store = window.ls || localStorage;
    if (store.getItem('jarvis_auto_cleanup') === 'false') return { removed: 0, ids: [] };

    const list = window.sessions;
    if (!Array.isArray(list) || list.length <= 1) return { removed: 0, ids: [] };

    const plan = planCleanup(list, {
      keepId: window.activeId,
      now: Date.now(),
      minAgeMs: EMPTY_MIN_AGE_MS
    });

    const removedIds = [];
    for (const id of plan.removeIds) {
      const idx = list.findIndex(x => x && x.id === id);
      if (idx === -1) continue;
      list.splice(idx, 1);
      removedIds.push(id);
      try {
        if (typeof window.deleteFromDB === 'function') await window.deleteFromDB(id);
      } catch (err) {
        console.warn('[Auto-Cleanup] Không xoá được phiên ' + id + ' khỏi IndexedDB:', err);
      }
    }

    if (removedIds.length) {
      try { if (typeof window.renderSel === 'function') window.renderSel(); } catch (_) {}
      try { if (typeof window.renderTabs === 'function') window.renderTabs(); } catch (_) {}
      console.log('[Auto-Cleanup] Đã dọn ' + removedIds.length + ' phiên trống:', removedIds.join(', '));
    }
    return { removed: removedIds.length, ids: removedIds };
  }

  // --- OPT-IN TOGGLE TRONG CÀI ĐẶT ---
  function initToggle() {
    const box = document.getElementById('toggle-auto-cleanup');
    if (!box) return;
    const store = window.ls || localStorage;
    box.checked = store.getItem('jarvis_auto_cleanup') !== 'false';
    box.addEventListener('change', () => {
      store.setItem('jarvis_auto_cleanup', box.checked ? 'true' : 'false');
      if (typeof window.showToast === 'function') {
        window.showToast(box.checked ? '🧹 Đã bật tự dọn phiên trống' : '⏸️ Đã tắt tự dọn phiên trống', 'info');
      }
    });
  }

  function scheduleAutoCleanup() {
    if (window.__JARVIS_DISABLE_AUTOINIT__ === true) return;
    initToggle();
    // Chờ app.js nạp xong sessions/IndexedDB rồi mới dọn (không chặn khởi động).
    setTimeout(() => {
      cleanupEmptySessions().catch(err => console.warn('[Auto-Cleanup] Lỗi:', err));
    }, 4000);
  }

  window.planSessionCleanup = planCleanup;
  window.cleanupEmptySessions = cleanupEmptySessions;
  window.__sessionCleanupCore = { planCleanup, getMessages };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleAutoCleanup);
  } else {
    scheduleAutoCleanup();
  }
})();
