/* ==========================================================================
   Jarvis AI - Storage & Memory Management Controller
   ========================================================================== */

(function() {
  'use strict';

  // Wait for dependencies to be available
  function waitForDependencies() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.$ && window.ls && window.showToast && window.DOM && window.oLay && window.updateKeyQuotaUI) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  async function init() {
    await waitForDependencies();
    
    const $ = window.$;
    const ls = window.ls;
    const showToast = window.showToast;
    const DOM = window.DOM;
    const oLay = window.oLay;
    const updateKeyQuotaUI = window.updateKeyQuotaUI;

    // --- STORAGE STATUS & PERSISTENT STORAGE ---
    async function updateStorageStatus() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          const usedBytes = est.usage || 0;
          const quotaBytes = est.quota || 0;
          const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
          const quotaGB = (quotaBytes / (1024 * 1024 * 1024)).toFixed(1);
          const pct = quotaBytes > 0 ? ((usedBytes / quotaBytes) * 100).toFixed(2) : '0';

          const usedEl = $('storage-used-txt');
          const quotaEl = $('storage-quota-txt');
          const barEl = $('storage-bar-progress');

          if (usedEl) usedEl.innerText = `${usedMB} MB (${pct}%)`;
          if (quotaEl) quotaEl.innerText = `Khả dụng: ${quotaGB} GB`;
          if (barEl) {
            barEl.style.width = `${Math.min(Math.max(parseFloat(pct), 1), 100)}%`;
            if (parseFloat(pct) > 80) barEl.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
            else if (parseFloat(pct) > 50) barEl.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
            else barEl.style.background = 'linear-gradient(90deg, #10b981, #059669)';
          }
        }

        if (navigator.storage && navigator.storage.persisted) {
          const isPersisted = await navigator.storage.persisted();
          const statusEl = $('storage-persist-status');
          const btnPersist = $('btn-request-persist');
          if (statusEl) {
            if (isPersisted) {
              statusEl.innerText = "🟢 Đã kích hoạt (Vĩnh viễn)";
              statusEl.style.color = "var(--success)";
              if (btnPersist) btnPersist.style.display = "none";
            } else {
              // Kiểm tra trạng thái permission để gợi ý tốt hơn
              let permState = 'unknown';
              try {
                if (navigator.permissions && navigator.permissions.query) {
                  const perm = await navigator.permissions.query({ name: 'persistent-storage' });
                  permState = perm.state; // 'granted' | 'denied' | 'prompt'
                }
              } catch (_) {}
              if (permState === 'denied') {
                statusEl.innerText = "🔴 Bị chặn (cần bật thủ công)";
                statusEl.style.color = "var(--danger)";
              } else if (permState === 'granted') {
                statusEl.innerText = "🟡 Quyền đã cho, chưa kích hoạt";
                statusEl.style.color = "var(--warning)";
              } else {
                statusEl.innerText = "⚪ Chưa bật";
                statusEl.style.color = "var(--warning)";
              }
              if (btnPersist) btnPersist.style.display = "inline-block";
            }
          }
        }
      } catch (e) {
        console.warn("Lỗi kiểm tra bộ nhớ:", e);
      }
    }

    // --- EVENT HANDLERS ---
    function bindEvents() {
      $('btn-refresh-storage')?.addEventListener('click', () => {
        updateStorageStatus();
        showToast("🔄 Đã cập nhật trạng thái bộ nhớ!", "success");
      });

      $('btn-request-persist')?.addEventListener('click', async () => {
        if (!navigator.storage || !navigator.storage.persist) {
          showToast("Trình duyệt không hỗ trợ Persistent Storage.", "warning");
          return;
        }

        let ok = false;
        try {
          // Trên Chrome Android: permissions.request() KHÔNG hỗ trợ 'persistent-storage'
          // Chỉ dùng query() để đọc trạng thái, persist() cần user gesture (đã có vì trong click handler)
          // Nếu permission state là 'granted' hoặc 'prompt' thì persist() có thể thành công
          let permState = 'unknown';
          try {
            if (navigator.permissions && navigator.permissions.query) {
              const perm = await navigator.permissions.query({ name: 'persistent-storage' });
              permState = perm.state; // 'granted' | 'denied' | 'prompt'
            }
          } catch (_) {}

          // Chỉ request() nếu trình duyệt hỗ trợ (desktop Chrome/Firefox), Android sẽ throw
          if (permState !== 'granted' && permState !== 'denied') {
            try {
              if (navigator.permissions && navigator.permissions.request) {
                await navigator.permissions.request({ name: 'persistent-storage' });
              }
            } catch (_) {
              // Android Chrome không hỗ trợ request() cho persistent-storage - bỏ qua
            }
          }

          ok = await navigator.storage.persist();
        } catch (e) {
          console.warn('Lỗi khi kích hoạt persistent storage:', e);
        }

        if (ok) {
          showToast("🛡️ Đã kích hoạt Lưu trữ Vĩnh viễn (Persistent Storage)!", "success");
        } else {
          // Hướng dẫn tùy platform
          const ua = navigator.userAgent.toLowerCase();
          let hint = "Trình duyệt chưa cho phép cấp quyền vĩnh viễn.";
          if (/android.*chrome/i.test(ua) || /android.*crios/i.test(ua)) {
            hint += " Trên Chrome Android: vào ⋮ Menu → Cài đặt → Quyền riêng tư & bảo mật → Cài đặt trang web → Dữ liệu trang web → cho phép 'Lưu trữ vĩnh viễn' cho trang này.";
          } else if (ua.includes('chrome') || ua.includes('edg')) {
            hint += " Hãy vào chrome://site-settings → Dữ liệu trang web → cho phép 'Lưu trữ vĩnh viễn'.";
          } else if (ua.includes('firefox')) {
            hint += " Hãy vào about:preferences#privacy → Dữ liệu trang web → cho phép 'Lưu trữ vĩnh viễn'.";
          }
          showToast(hint, "warning");
        }
        updateStorageStatus();
      });

      $('btn-restore-session-backup')?.addEventListener('click', async () => {
        const statusEl = $('session-backup-status');
        if (typeof window.restoreSessionsFromBackup !== 'function') {
          showToast('Chưa sẵn sàng phục hồi (IndexedDB đang khởi tạo).', 'warning');
          return;
        }
        try {
          if (statusEl) statusEl.innerText = '⏳ Đang phục hồi...';
          const res = await window.restoreSessionsFromBackup();
          if (!res.restored) {
            if (statusEl) statusEl.innerText = 'Chưa có bản sao lưu nào.';
            showToast('Chưa có bản sao lưu hội thoại nào để phục hồi.', 'warning');
            return;
          }
          if (statusEl) statusEl.innerText = `✅ Đã phục hồi ${res.restored} phiên.`;
          showToast(`♻️ Đã phục hồi ${res.restored} phiên từ bản sao lưu!`, 'success');
          if (confirm(`Đã phục hồi ${res.restored} phiên từ bản sao lưu IndexedDB.\nTải lại trang để thấy đầy đủ?`)) {
            location.reload();
          }
        } catch (e) {
          if (statusEl) statusEl.innerText = '❌ Phục hồi thất bại.';
          showToast(`Lỗi phục hồi: ${e.message}`, 'danger');
        }
      });

      $('btn-clear-temp-cache')?.addEventListener('click', () => {
        if (confirm("Bạn có muốn dọn sạch bộ nhớ đệm tìm kiếm (search cache) và dữ liệu tạm thời không?\n(Toàn bộ Lịch sử chat và API keys sẽ được BẢO TỒN NGUYÊN VẸN 100%)")) {
          try {
            const keys = [];
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i);
              if (k && (k.startsWith('src_') || k.startsWith('cache_'))) keys.push(k);
            }
            keys.forEach(k => sessionStorage.removeItem(k));
            updateStorageStatus();
            showToast(`🧹 Đã dọn sạch ${keys.length} mục bộ đệm tạm thời!`, "success");
          } catch (e) {
            showToast(`Lỗi dọn cache: ${e.message}`, "danger");
          }
        }
      });

      // Wire up settings open to refresh storage status
      $('btn-open-settings')?.addEventListener('click', () => {
        setTimeout(updateStorageStatus, 100);
      });
    }

    // Initialize
    bindEvents();
    updateStorageStatus();

    // Expose for external access
    window.updateStorageStatus = updateStorageStatus;
    window.initStorageManager = function() {
      return { updateStorageStatus };
    };
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();