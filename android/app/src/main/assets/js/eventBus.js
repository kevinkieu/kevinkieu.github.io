/* ==========================================================================
   Jarvis AI - Lightweight Event Bus (js/eventBus.js)
   Cung cấp kênh giao tiếp phi tập trung giữa các module JS (app.js,
   rag.js, tts.js, live.js, translate.js, sync.js, …).
   Thay vì nhiều module tự đọc/ghi trực tiếp biến toàn cục,
   chúng có thể publish/subscribe qua sự kiện có tên, giảm sự phụ thuộc
   vào state khắp trên window và giúp debug, bật/tắt tính năng dễ hơn.
   ========================================================================== */
(function () {
  'use strict';

  const listeners = new Map(); // eventName -> Set<{fn, once}>

  function on(event, fn, { once = false } = {}) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    const entry = { fn, once };
    listeners.get(event).add(entry);
    return entry;
  }

  function off(event, fn) {
    const set = listeners.get(event);
    if (!set) return;
    for (const entry of Array.from(set)) {
      if (entry.fn === fn) set.delete(entry);
    }
  }

  function offEntry(entry) {
    for (const [, set] of listeners) {
      if (set.has(entry)) set.delete(entry);
    }
  }

  // emit: sync, trả về boolean có listeners không
  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return false;
    const entries = Array.from(set);
    for (const entry of entries) {
      try {
        entry.fn.call(null, payload);
      } catch (err) {
        console.warn('[EventBus] listener error on `' + event + '`:', err);
      }
      if (entry.once) set.delete(entry);
    }
    return true;
  }

  // once: subscribe rồi tự unsubscribe sau lần emit tiếp theo
  function once(event, fn) {
    return on(event, fn, { once: true });
  }

  // asyncEmit: trả về Promise chỉ resolve khi async listener hoàn tất.
  // Dùng khi một listener thực hiện fetch/indexing/… và gọi emit kết quả.
  function asyncEmit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return Promise.resolve();
    const entries = Array.from(set);
    const promises = [];
    for (const entry of entries) {
      try {
        const r = entry.fn.call(null, payload);
        if (r && typeof r.then === 'function') promises.push(r);
      } catch (err) {
        console.warn('[EventBus] async listener error on `' + event + '`:', err);
      }
      if (entry.once) set.delete(entry);
    }
    if (promises.length === 0) return Promise.resolve();
    return Promise.allSettled(promises);
  }

  // Dọn listener khi module hủy (VD: modal đóng, component unmount)
  function teardown(entry) {
    offEntry(entry);
  }

  // Global accessibility
  const bus = {
    on,
    once,
    off,
    emit,
    asyncEmit,
    teardown,
    listenersCount: () => {
      let n = 0;
      for (const [, s] of listeners) n += s.size;
      return n;
    },
  };

  // Lifecycle: signal that initial bootstrap has completed.
  // Other modules may use this to lazy-init heavy work.
  bus.markReady = () => bus.emit('app:ready');
  bus.isBootstrapped = () => true;

  // For backward compat with code that may query via window
  if (typeof window !== 'undefined') {
    window.EventBus = bus;
  }

  // Kick off empty bootstrap signal immediately (safe no-op if nobody listens)
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    document.readyState !== 'loading'
  ) {
    setTimeout(() => bus.markReady(), 0);
  } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => bus.markReady(), 0);
    });
  }
})();
