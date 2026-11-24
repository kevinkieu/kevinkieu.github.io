/**
 * Jarvis AI - Gesture Manager
 * Quản lý trung tâm các gesture trên mobile: detect, register, dispatch, persist config.
 * Nạp sau globals.js, trước app.js / live.js.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'jarvis_gesture_config';
  const DEFAULT_CONFIG = {
    shake: 'debug-overlay',           // Mặc định: lắc để mở Debug Console (tránh conflict screenshot)
    '3-finger-hold': 'none',          // 3 ngón giữ - tắt mặc định vì conflict screenshot hệ thống
    '2-finger-double-tap': 'none',    // 2 ngón double-tap - có thể bật trong Settings
    'edge-swipe': 'none',             // Vuốt từ mép màn hình
  };

  // Trạng thái gesture
  let touchState = {
    fingers: 0,
    startTime: 0,
    startX: 0,
    startY: 0,
    isHolding: false,
    holdTimer: null,
  };

  let shakeState = {
    lastX: 0,
    lastY: 0,
    lastZ: 0,
    lastTime: 0,
    threshold: 15, // m/s^2
  };

  // Registry: gestureName -> { action, configurable, fallback }
  const gestureRegistry = new Map();

  // Action handlers: actionName -> handler function
  const actionHandlers = new Map();

  // Load config từ localStorage
  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        Object.entries(config).forEach(([gesture, action]) => {
          if (gestureRegistry.has(gesture)) {
            gestureRegistry.get(gesture).action = action;
          }
        });
      }
    } catch (e) {
      console.warn('[GestureManager] Load config failed:', e);
    }
    // Apply defaults for missing
    Object.entries(DEFAULT_CONFIG).forEach(([gesture, action]) => {
      if (!gestureRegistry.has(gesture)) {
        registerGesture(gesture, { action, configurable: true });
      } else {
        gestureRegistry.get(gesture).action = gestureRegistry.get(gesture).action || action;
      }
    });
  }

  // Save config
  function saveConfig() {
    const config = {};
    gestureRegistry.forEach((v, k) => {
      config[k] = v.action;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('[GestureManager] Save config failed:', e);
    }
  }

  // Đăng ký gesture
  function registerGesture(name, options = {}) {
    const cfg = {
      action: options.action || 'none',
      configurable: options.configurable !== false,
      fallback: options.fallback || null,
      description: options.description || name,
    };
    gestureRegistry.set(name, cfg);
    console.log('[GestureManager] Registered:', name, cfg);
    return cfg;
  }

  // Đăng ký action handler
  function registerAction(name, handler) {
    if (typeof handler !== 'function') {
      console.error('[GestureManager] Handler must be a function');
      return false;
    }
    actionHandlers.set(name, handler);
    console.log('[GestureManager] Action registered:', name);
    return true;
  }

  // Thực thi action
  function executeAction(actionName, eventData = {}) {
    if (actionName === 'none' || !actionName) return false;
    const handler = actionHandlers.get(actionName);
    if (handler) {
      try {
        console.log('[GestureManager] Executing action:', actionName);
        handler(eventData);
        return true;
      } catch (e) {
        console.error('[GestureManager] Action error:', actionName, e);
      }
    } else {
      console.warn('[GestureManager] No handler for action:', actionName);
    }
    return false;
  }

  // Đổi action cho gesture (từ Settings)
  function setGestureAction(gestureName, actionName) {
    const cfg = gestureRegistry.get(gestureName);
    if (!cfg) {
      console.warn('[GestureManager] Unknown gesture:', gestureName);
      return false;
    }
    if (!cfg.configurable) {
      console.warn('[GestureManager] Gesture not configurable:', gestureName);
      return false;
    }
    // Kiểm tra action có tồn tại handler không (trừ 'none')
    if (actionName !== 'none' && !actionHandlers.has(actionName)) {
      console.warn('[GestureManager] Action not registered:', actionName);
      return false;
    }
    // Đảm bảo không có 2 gesture cùng action (trừ 'none')
    if (actionName !== 'none') {
      gestureRegistry.forEach((v, k) => {
        if (k !== gestureName && v.action === actionName) {
          v.action = 'none';
        }
      });
    }
    cfg.action = actionName;
    saveConfig();
    console.log('[GestureManager] Gesture action changed:', gestureName, '->', actionName);
    return true;
  }

  // Lấy config hiện tại
  function getConfig() {
    const config = {};
    gestureRegistry.forEach((v, k) => {
      config[k] = v.action;
    });
    return config;
  }

  // Lấy danh sách actions có sẵn
  function getAvailableActions() {
    return Array.from(actionHandlers.keys());
  }

  // ==========================================
  // GESTURE DETECTION: 3-FINGER HOLD
  // ==========================================
  function onTouchStart(e) {
    const touches = e.touches;
    touchState.fingers = touches.length;
    touchState.startTime = Date.now();
    touchState.startX = touches[0]?.clientX || 0;
    touchState.startY = touches[0]?.clientY || 0;

    // Check for 2-finger double-tap
    if (touches.length === 2) {
      handleTwoFingerTap(e);
    }

    if (touchState.fingers >= 3) {
      touchState.isHolding = false;

      // Clear existing timer
      if (touchState.holdTimer) clearTimeout(touchState.holdTimer);

      // Start hold timer (500ms)
      touchState.holdTimer = setTimeout(() => {
        touchState.isHolding = true;
        const cfg = gestureRegistry.get('3-finger-hold');
        if (cfg && cfg.action !== 'none') {
          // Haptic feedback
          if (navigator.vibrate) navigator.vibrate(50);
          // Execute action
          executeAction(cfg.action, { gesture: '3-finger-hold', event: e });
          // Visual feedback
          showGestureFeedback('3-finger-hold', cfg.action);
        }
      }, 500);
    }
  }

  // 2-finger double-tap detection
  let lastTwoFingerTap = 0;
  function handleTwoFingerTap(e) {
    const now = Date.now();
    if (now - lastTwoFingerTap < 300) {
      // Double-tap detected!
      lastTwoFingerTap = 0;
      const cfg = gestureRegistry.get('2-finger-double-tap');
      if (cfg && cfg.action !== 'none') {
        if (navigator.vibrate) navigator.vibrate(50);
        executeAction(cfg.action, { gesture: '2-finger-double-tap', event: e });
        showGestureFeedback('2-finger-double-tap', cfg.action);
      }
    } else {
      lastTwoFingerTap = now;
    }
  }

  function onTouchMove(e) {
    if (touchState.fingers < 3) return;

    const touches = e.touches;
    if (touches.length < 3) {
      // Fingers released before hold
      if (touchState.holdTimer) {
        clearTimeout(touchState.holdTimer);
        touchState.holdTimer = null;
      }
      return;
    }

    // Check if moved too much (cancel hold)
    const dx = Math.abs(touches[0].clientX - touchState.startX);
    const dy = Math.abs(touches[0].clientY - touchState.startY);
    if (dx > 20 || dy > 20) {
      if (touchState.holdTimer) {
        clearTimeout(touchState.holdTimer);
        touchState.holdTimer = null;
      }
    }
  }

  function onTouchEnd(e) {
    if (touchState.holdTimer) {
      clearTimeout(touchState.holdTimer);
      touchState.holdTimer = null;
    }
    touchState.fingers = e.touches.length;
    touchState.isHolding = false;
  }

  // ==========================================
  // GESTURE DETECTION: SHAKE
  // ==========================================
  function onDeviceMotion(e) {
    const now = Date.now();
    if (now - shakeState.lastTime < 100) return; // throttle

    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    const dx = Math.abs(acc.x - shakeState.lastX);
    const dy = Math.abs(acc.y - shakeState.lastY);
    const dz = Math.abs(acc.z - shakeState.lastZ);

    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (magnitude > shakeState.threshold) {
      const cfg = gestureRegistry.get('shake');
      if (cfg && cfg.action !== 'none') {
        executeAction(cfg.action, { gesture: 'shake', event: e });
        showGestureFeedback('shake', cfg.action);
      }
    }

    shakeState.lastX = acc.x;
    shakeState.lastY = acc.y;
    shakeState.lastZ = acc.z;
    shakeState.lastTime = now;
  }

  // ==========================================
  // VISUAL FEEDBACK
  // ==========================================
  function showGestureFeedback(gesture, action) {
    // Tạo toast notification
    if (typeof showToast === 'function') {
      const labels = {
        'debug-overlay': '🐛 Debug Console',
        'live-call': '📞 Live Call',
        'wake-word': '🎙️ Wake Word',
        none: 'Không hành động',
      };
      showToast(`${labels[action] || action} (${gesture})`, 'info', 1500);
    }

    // Visual ripple effect
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: fixed;
      pointer-events: none;
      width: 100px; height: 100px;
      border-radius: 50%;
      border: 3px solid var(--primary, #3b82f6);
      transform: translate(-50%, -50%) scale(0);
      animation: gesture-ripple 0.4s ease-out forwards;
      z-index: 99999;
      left: ${touchState.startX}px;
      top: ${touchState.startY}px;
    `;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  }

  // Inject ripple animation CSS
  function injectRippleCSS() {
    if (document.getElementById('gesture-ripple-style')) return;
    const style = document.createElement('style');
    style.id = 'gesture-ripple-style';
    style.textContent = `
      @keyframes gesture-ripple {
        to { transform: translate(-50%, -50%) scale(3); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // ==========================================
  // INIT
  // ==========================================
  function init() {
    loadConfig();
    injectRippleCSS();

    // Touch events (passive: false để có thể preventDefault nếu cần)
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // Device motion for shake
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
    }

    console.log('[GestureManager] Initialized');
    console.log('[GestureManager] Config:', getConfig());
  }

  // Auto-init khi DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // ==========================================
  // PUBLIC API
  // ==========================================
  window.GestureManager = {
    registerGesture,
    registerAction,
    executeAction,
    setGestureAction,
    getConfig,
    getAvailableActions,
    getGestureConfig: name => gestureRegistry.get(name),
    // For Settings UI
    getAllGestures: () => {
      const result = {};
      gestureRegistry.forEach((v, k) => {
        result[k] = { ...v };
      });
      return result;
    },
  };
})();
