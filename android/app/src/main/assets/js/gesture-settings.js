/**
 * Jarvis AI - Gesture Settings UI
 * UI quản lý gesture trong Settings modal
 * Nạp sau gesture-manager.js
 */

(function () {
  'use strict';

  const GESTURE_LABELS = {
    'shake': '📳 Lắc thiết bị (Shake)',
    '3-finger-hold': '👆 3 ngón giữ (Hold 500ms)',
    '2-finger-double-tap': '☝️ 2 ngón double-tap',
    'edge-swipe': '➡️ Vuốt từ mép màn hình'
  };

  const ACTION_LABELS = {
    'none': '❌ Không hành động',
    'debug-overlay': '🐛 Debug Console',
    'live-call': '📞 Mở Live Call',
    'wake-word': '🎙️ Bật Wake Word'
  };

  function createGestureSettingsHTML() {
    const config = window.GestureManager ? window.GestureManager.getConfig() : {};
    const availableActions = window.GestureManager ? window.GestureManager.getAvailableActions() : ['none'];

    let html = `
      <div class="dp-block">
        <div class="dp-block-header">
          <span class="dp-block-title">🎮 Gesture Controls (Điều khiển cử chỉ)</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5">
          Gán hành động cho từng gesture. <b>Lắc (Shake)</b> là mặc định để tránh conflict chụp màn hình hệ thống.
        </div>
    `;

    // Mỗi gesture một row select
    Object.entries(GESTURE_LABELS).forEach(([gestureKey, gestureLabel]) => {
      const currentAction = config[gestureKey] || 'none';
      html += `
        <div class="dp-form-group" style="margin-bottom: 10px">
          <label class="dp-label">${gestureLabel}</label>
          <select class="modern-select gesture-action-select" data-gesture="${gestureKey}">
            <option value="none" ${currentAction === 'none' ? 'selected' : ''}>${ACTION_LABELS.none}</option>
            <option value="debug-overlay" ${currentAction === 'debug-overlay' ? 'selected' : ''}>${ACTION_LABELS['debug-overlay']}</option>
            <option value="live-call" ${currentAction === 'live-call' ? 'selected' : ''}>${ACTION_LABELS['live-call']}</option>
            <option value="wake-word" ${currentAction === 'wake-word' ? 'selected' : ''}>${ACTION_LABELS['wake-word']}</option>
          </select>
          <div class="dp-hint" style="margin-top: 4px; font-size: 0.7rem; color: var(--text-muted)">
            Hiện tại: <strong>${ACTION_LABELS[currentAction] || currentAction}</strong>
          </div>
        </div>
      `;
    });

    html += `
        <div class="dp-actions dp-actions-stack" style="margin-top: 16px">
          <button id="gesture-reset-defaults" class="btn dp-btn-secondary">🔄 Khôi phục mặc định</button>
          <button id="gesture-test-shake" class="btn dp-btn-outline">📳 Test Shake</button>
        </div>
      </div>
    `;

    return html;
  }

  function initGestureSettings() {
    const container = $('gesture-settings-container');
    if (!container) return;
    
    container.innerHTML = createGestureSettingsHTML();

    // Event listeners cho select
    container.querySelectorAll('.gesture-action-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const gesture = e.target.dataset.gesture;
        const action = e.target.value;
        if (window.GestureManager) {
          const success = window.GestureManager.setGestureAction(gesture, action);
          if (success) {
            // Update hint text
            const hint = e.target.parentElement.querySelector('.dp-hint');
            if (hint) {
              const labels = {
                'none': '❌ Không hành động',
                'debug-overlay': '🐛 Debug Console',
                'live-call': '📞 Mở Live Call',
                'wake-word': '🎙️ Bật Wake Word'
              };
              hint.innerHTML = `Hiện tại: <strong>${labels[action] || action}</strong>`;
            }
            if (typeof showToast === 'function') {
              showToast(`Đã gán ${e.target.options[e.target.selectedIndex].text} cho ${action === 'none' ? 'không hành động' : action}`, 'success');
            }
          }
        }
      });
    });

    // Reset defaults
    const resetBtn = $('gesture-reset-defaults');
    if (resetBtn) {
      resetBtn.onclick = () => {
        if (window.GestureManager) {
          // Reset to defaults
          window.GestureManager.setGestureAction('shake', 'debug-overlay');
          window.GestureManager.setGestureAction('3-finger-hold', 'none');
          window.GestureManager.setGestureAction('2-finger-double-tap', 'none');
          window.GestureManager.setGestureAction('edge-swipe', 'none');
          
          // Refresh UI
          initGestureSettings();
          if (typeof showToast === 'function') showToast('Đã khôi phục gesture mặc định', 'success');
        }
      };
    }

    // Test shake
    const testBtn = $('gesture-test-shake');
    if (testBtn) {
      testBtn.onclick = () => {
        if (window.GestureManager) {
          // Simulate shake trigger
          window.GestureManager.executeAction(window.GestureManager.getConfig().shake || 'debug-overlay', { source: 'test-shake' });
          if (typeof showToast === 'function') showToast('Đã trigger shake action', 'info');
        }
      };
    }
  }

  // Public API
  window.GestureSettings = {
    init: initGestureSettings,
    createHTML: createGestureSettingsHTML
  };

  // Auto-init khi DOM ready (sau gesture-manager)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Delay một chút để gesture-manager init xong
      setTimeout(initGestureSettings, 100);
    }, { once: true });
  } else {
    setTimeout(initGestureSettings, 100);
  }

})();