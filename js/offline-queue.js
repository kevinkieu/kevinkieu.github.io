/* ==========================================================================
   Jarvis AI - Hàng đợi tin nhắn ngoại tuyến

   Khi mất mạng, tin nhắn văn bản được xếp vào localStorage để gửi lại khi có
   mạng, thay vì mất nội dung đã gõ. Chỉ xếp tin VĂN BẢN: ảnh/file base64 sẽ
   làm đầy quota localStorage 5MB của app.

   Dữ liệu: localStorage['jarvis_offline_queue'] = mảng item
     { id, sessionId, text, txtContent, model, engine, createdAt, attempts,
       status: 'queued' | 'sending' | 'failed', lastError }

   Module KHÔNG tự gửi; js/app.js gọi flushOfflineQueue() và dùng appendMsg để
   vẽ bubble. Mọi thay đổi phát event 'jarvis:queue-changed' để UI cập nhật.
   ========================================================================== */
(function () {
  'use strict';

  const KEY = 'jarvis_offline_queue';
  const MAX_ITEMS = 20;
  const MAX_ATTEMPTS = 3;
  // Chỉ coi là lỗi mạng khi thật sự mất kết nối hoặc fetch không đi được.
  const NETWORK_TEXT =
    /failed to fetch|networkerror|network error|load failed|fetch failed|econnreset|etimedout|offline|timed out|timeout/i;

  const storage = () => window.localStorage;

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('jarvis:queue-changed'));
    } catch (_) {}
  }

  function normalize(item) {
    if (!item || typeof item !== 'object') return null;
    const text = typeof item.text === 'string' ? item.text : '';
    if (!text.trim()) return null;
    return {
      id: String(item.id || ''),
      sessionId: String(item.sessionId || ''),
      text,
      txtContent: typeof item.txtContent === 'string' ? item.txtContent : '',
      model: String(item.model || ''),
      engine: String(item.engine || 'stream'),
      createdAt: Number(item.createdAt) || 0,
      attempts: Number(item.attempts) || 0,
      status: item.status === 'failed' || item.status === 'sending' ? item.status : 'queued',
      lastError: typeof item.lastError === 'string' ? item.lastError : '',
    };
  }

  function readAll() {
    try {
      const raw = storage().getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(normalize).filter(Boolean);
    } catch (e) {
      console.warn('[Offline queue] Đọc hàng đợi lỗi:', e);
      return [];
    }
  }

  function writeAll(list) {
    try {
      storage().setItem(KEY, JSON.stringify(list));
      emit();
      return true;
    } catch (e) {
      console.warn('[Offline queue] Ghi hàng đợi lỗi (có thể đầy bộ nhớ):', e);
      return false;
    }
  }

  function isOnline() {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  function isOfflineError(err) {
    if (!isOnline()) return true;
    const msg = String((err && err.message) || err || '');
    return !!msg && NETWORK_TEXT.test(msg);
  }

  function list(sessionId) {
    const all = readAll().sort((a, b) => a.createdAt - b.createdAt);
    if (sessionId === undefined || sessionId === null) return all;
    return all.filter(it => it.sessionId === String(sessionId));
  }

  function count(sessionId) {
    return list(sessionId).length;
  }

  function enqueue(payload) {
    const data = normalize(
      Object.assign({}, payload, {
        id:
          (payload && payload.id) ||
          'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        createdAt: Date.now(),
        attempts: 0,
        status: 'queued',
      })
    );
    if (!data) return null;
    const all = readAll();
    if (all.length >= MAX_ITEMS) {
      console.warn('[Offline queue] Hàng đợi đầy, bỏ qua tin mới.');
      return null;
    }
    all.push(data);
    const ok = writeAll(all);
    if (ok) {
      // Background Sync: yêu cầu SW flush queue khi có mạng lại (progressive enhancement)
      try {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready
            .then(reg => {
              if (reg && typeof reg.sync !== 'undefined') {
                reg.sync.register('flush-offline-queue').catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch (_) {}
    }
    return ok ? data : null;
  }

  function update(id, patch) {
    const all = readAll();
    const idx = all.findIndex(it => it.id === String(id));
    if (idx === -1) return null;
    all[idx] = Object.assign({}, all[idx], patch || {});
    writeAll(all);
    return all[idx];
  }

  function remove(id) {
    const all = readAll();
    const kept = all.filter(it => it.id !== String(id));
    if (kept.length === all.length) return false;
    return writeAll(kept);
  }

  function clearSession(sessionId) {
    const all = readAll();
    const kept = all.filter(it => it.sessionId !== String(sessionId));
    if (kept.length === all.length) return false;
    return writeAll(kept);
  }

  const core = {
    KEY,
    MAX_ITEMS,
    MAX_ATTEMPTS,
    isOnline,
    isOfflineError,
    list,
    count,
    enqueue,
    update,
    remove,
    clearSession,
    _readAll: readAll,
  };

  window.JarvisOfflineQueue = core;
  window.__jarvisOfflineQueueCore = core;
})();
