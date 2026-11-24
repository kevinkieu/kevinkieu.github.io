/* ==========================================================================
   Jarvis AI - IndexedDB Engine (js/database.js)
   Quản lý Database IndexedDB cho sessions, files và TTS audio library.
   Tự contained, ít dependency ngoài app.js.
   ========================================================================== */

(function () {
  'use strict';

  const ls = window.ls || localStorage;
  const DB_NAME = 'JavissUltimateOS_DB';
  const STORE_NAME = 'chat_sessions';
  const FILE_STORE = 'file_library';
  const TTS_STORE = 'tts_audio_library';
  // Bản sao lưu hội thoại (mirror) để phục hồi khi store chính hỏng/trống.
  const BACKUP_STORE = 'session_backup';
  // Store ghi log lỗi JS (uncaught exception + unhandled rejection)
  const ERROR_LOG_STORE = 'error_log';
  let db;

  // --- INITIALIZE DATABASE ---
  function initDB() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, 8);
      rq.onupgradeneeded = e => {
        let d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME))
          d.createObjectStore(STORE_NAME, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(FILE_STORE))
          d.createObjectStore(FILE_STORE, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(TTS_STORE))
          d.createObjectStore(TTS_STORE, { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains(BACKUP_STORE))
          d.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(ERROR_LOG_STORE))
          d.createObjectStore(ERROR_LOG_STORE, { keyPath: 'id', autoIncrement: true });
      };
      rq.onblocked = () =>
        console.warn(
          '[DB] Nâng cấp IndexedDB bị chặn bởi một tab khác đang mở. Hãy đóng các tab Jarvis cũ.'
        );
      rq.onsuccess = async e => {
        db = e.target.result;
        window.db = db;
        window.getDB = () => db;
        // Cross-DB migration: HuanMU_DB -> JavissUltimateOS_DB
        try {
          const checkHuan = indexedDB.open('HuanMU_DB', 6);
          checkHuan.onsuccess = () => {
            const hDb = checkHuan.result;
            if (hDb && hDb.objectStoreNames.contains(STORE_NAME)) {
              const getItems = hDb
                .transaction(STORE_NAME, 'readonly')
                .objectStore(STORE_NAME)
                .getAll();
              getItems.onsuccess = () => {
                const hSessions = getItems.result || [];
                if (hSessions.length) {
                  const wrTrans = db.transaction(STORE_NAME, 'readwrite');
                  hSessions.forEach(hs => {
                    if (hs.his && hs.his.length > 0) wrTrans.objectStore(STORE_NAME).put(hs);
                  });
                }
              };
            }
          };
        } catch {}
        syncBackupFromMain();
        res();
      };
      rq.onerror = e => rej(e);
    });
  }

  // --- MIRROR EXISTING SESSIONS INTO BACKUP ---
  // Phiên được tạo trước khi có store sao lưu (hoặc từ bản migrate cũ) sẽ được
  // chép sang backup một lần lúc mở app, để nút "Phục hồi" luôn có dữ liệu.
  // Chỉ THÊM vào backup, không bao giờ xoá — store chính vẫn là nguồn chuẩn.
  function syncBackupFromMain() {
    try {
      if (!db || !db.objectStoreNames.contains(BACKUP_STORE)) return;
      const t = db.transaction([STORE_NAME, BACKUP_STORE], 'readwrite');
      const backup = t.objectStore(BACKUP_STORE);
      const rq = t.objectStore(STORE_NAME).getAll();
      rq.onsuccess = () => {
        (rq.result || []).forEach(s => {
          if (s && s.id) backup.put(s);
        });
      };
    } catch (e) {
      console.warn('[DB] Không đồng bộ được bản sao lưu:', e);
    }
  }

  // --- SAVE SESSION TO DB ---
  function saveToDB(s) {
    return new Promise((resolve, reject) => {
      try {
        if (s && typeof s === 'object') {
          s.updatedAt = Date.now();
        }
        const t = db.transaction([STORE_NAME, BACKUP_STORE], 'readwrite');
        t.objectStore(STORE_NAME).put(s);
        t.objectStore(BACKUP_STORE).put(s);
        t.oncomplete = () => {
          // Sync to native bridge if available
          if (typeof window.syncSessionsToNative === 'function') {
            window.syncSessionsToNative();
          }
          if (typeof window.scheduleAutoSync === 'function') {
            window.scheduleAutoSync(10000);
          }
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- GET ALL SESSIONS FROM DB ---
  function getAllFromDB() {
    return new Promise((resolve, reject) => {
      try {
        const rq = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- CLEAR ALL DB ---
  function clearAllDB() {
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction([STORE_NAME, BACKUP_STORE], 'readwrite');
        t.objectStore(STORE_NAME).clear();
        t.objectStore(BACKUP_STORE).clear();
        t.oncomplete = () => {
          if (window.JarvisNativeBridge) {
            window.saveToNativeBridge('jarvis_sessions_backup', '[]');
          }
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- SAVE FILE TO LIBRARY ---
  function saveFileToLib(f) {
    return new Promise(r => {
      try {
        const t = db.transaction(FILE_STORE, 'readwrite');
        t.objectStore(FILE_STORE).put(f);
        t.oncomplete = () => r();
      } catch {
        r();
      }
    });
  }

  // --- GET ALL FILES FROM LIBRARY ---
  function getAllFilesFromLib() {
    return new Promise(r => {
      try {
        const rq = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).getAll();
        rq.onsuccess = () => r(rq.result);
      } catch {
        r([]);
      }
    });
  }

  // --- DELETE FROM DB ---
  function deleteFromDB(i) {
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction([STORE_NAME, BACKUP_STORE], 'readwrite');
        t.objectStore(STORE_NAME).delete(i);
        t.objectStore(BACKUP_STORE).delete(i);
        t.oncomplete = () => {
          // Record deleted ID
          try {
            const list = JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]');
            if (!list.includes(i)) {
              list.push(i);
              if (list.length > 200) list.shift();
              ls.setItem('jarvis_deleted_session_ids', JSON.stringify(list));
            }
          } catch {}
          if (typeof window.syncSessionsToNative === 'function') {
            window.syncSessionsToNative();
          }
          if (typeof window.scheduleAutoSync === 'function') {
            window.scheduleAutoSync(6000);
          }
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- RECORD DELETED SESSION ID ---
  function recordDeletedSessionId(id) {
    if (!id) return;
    try {
      const list = JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]');
      if (!list.includes(id)) {
        list.push(id);
        if (list.length > 200) list.shift();
        ls.setItem('jarvis_deleted_session_ids', JSON.stringify(list));
      }
    } catch (e) {}
  }

  // --- RESTORE SESSIONS FROM MIRROR BACKUP ---
  // Đọc toàn bộ bản sao lưu rồi ghi trả về store chính. Chỉ chạy khi người dùng bấm
  // "Phục hồi" trong Cài đặt, không tự động chạy lúc mở app.
  function restoreSessionsFromBackup() {
    return new Promise((resolve, reject) => {
      try {
        const rq = db.transaction(BACKUP_STORE, 'readonly').objectStore(BACKUP_STORE).getAll();
        rq.onsuccess = () => {
          const items = (rq.result || []).filter(s => s && s.id);
          if (!items.length) return resolve({ restored: 0, sessions: [] });
          try {
            const t = db.transaction([STORE_NAME, BACKUP_STORE], 'readwrite');
            items.forEach(s => t.objectStore(STORE_NAME).put(s));
            t.oncomplete = () => resolve({ restored: items.length, sessions: items });
            t.onerror = err => reject(err);
          } catch (err) {
            reject(err);
          }
        };
        rq.onerror = err => reject(err);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- ERROR LOG HELPERS ---
  function saveErrorLog(err) {
    return new Promise((resolve, reject) => {
      try {
        const entry = {
          timestamp: Date.now(),
          message: err?.message || String(err),
          stack: err?.stack || '',
          name: err?.name || 'Error',
          url: window.location.href,
          userAgent: navigator.userAgent,
        };
        const t = db.transaction(ERROR_LOG_STORE, 'readwrite');
        t.objectStore(ERROR_LOG_STORE).put(entry);
        // Giới hạn 500 entries mới nhất
        const countRq = t.objectStore(ERROR_LOG_STORE).count();
        countRq.onsuccess = () => {
          if (countRq.result > 500) {
            const cursorRq = t.objectStore(ERROR_LOG_STORE).openCursor();
            cursorRq.onsuccess = e => {
              const cursor = e.target.result;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              }
            };
          }
          resolve();
        };
        t.onerror = err => reject(err);
      } catch (e) {
        reject(e);
      }
    });
  }

  function getErrorLogs(limit = 100) {
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction(ERROR_LOG_STORE, 'readonly');
        const store = t.objectStore(ERROR_LOG_STORE);
        const rq = store.getAll();
        rq.onsuccess = () => {
          const logs = (rq.result || [])
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, limit);
          resolve(logs);
        };
        rq.onerror = err => reject(err);
      } catch (e) {
        reject(e);
      }
    });
  }

  function clearErrorLogs() {
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction(ERROR_LOG_STORE, 'readwrite');
        t.objectStore(ERROR_LOG_STORE).clear();
        t.oncomplete = () => resolve();
        t.onerror = err => reject(err);
      } catch (e) {
        reject(e);
      }
    });
  }

  // --- PUBLIC API ---
  window.initDB = initDB;
  window.saveErrorLog = saveErrorLog;
  window.getErrorLogs = getErrorLogs;
  window.clearErrorLogs = clearErrorLogs;
  window.ERROR_LOG_STORE = ERROR_LOG_STORE;
  window.saveToDB = saveToDB;
  window.getAllFromDB = getAllFromDB;
  window.clearAllDB = clearAllDB;
  window.saveFileToLib = saveFileToLib;
  window.getAllFilesFromLib = getAllFilesFromLib;
  window.deleteFromDB = deleteFromDB;
  window.recordDeletedSessionId = recordDeletedSessionId;
  window.DB_NAME = DB_NAME;
  window.STORE_NAME = STORE_NAME;
  window.FILE_STORE = FILE_STORE;
  window.TTS_STORE = TTS_STORE;
  window.BACKUP_STORE = BACKUP_STORE;
  window.restoreSessionsFromBackup = restoreSessionsFromBackup;
})();
