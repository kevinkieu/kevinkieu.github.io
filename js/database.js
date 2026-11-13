/* ==========================================================================
   Jarvis AI - IndexedDB Engine (js/database.js)
   Quản lý Database IndexedDB cho sessions, files và TTS audio library.
   Tự contained, ít dependency ngoài app.js.
   ========================================================================== */

(function() {
  'use strict';

  const ls = window.ls || localStorage;
  const DB_NAME = "JavissUltimateOS_DB";
  const STORE_NAME = "chat_sessions";
  const FILE_STORE = "file_library";
  const TTS_STORE = "tts_audio_library";
  let db;

  // --- INITIALIZE DATABASE ---
  function initDB() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, 7);
      rq.onupgradeneeded = e => {
        let d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME, { keyPath: "id" });
        if (!d.objectStoreNames.contains(FILE_STORE)) d.createObjectStore(FILE_STORE, { keyPath: "id" });
        if (!d.objectStoreNames.contains(TTS_STORE)) d.createObjectStore(TTS_STORE, { keyPath: "id", autoIncrement: true });
      };
      rq.onsuccess = async e => {
        db = e.target.result;
        // Cross-DB migration: HuanMU_DB -> JavissUltimateOS_DB
        try {
          const checkHuan = indexedDB.open("HuanMU_DB", 6);
          checkHuan.onsuccess = () => {
            const hDb = checkHuan.result;
            if (hDb && hDb.objectStoreNames.contains(STORE_NAME)) {
              const getItems = hDb.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
              getItems.onsuccess = () => {
                const hSessions = getItems.result || [];
                if (hSessions.length) {
                  const wrTrans = db.transaction(STORE_NAME, "readwrite");
                  hSessions.forEach(hs => {
                    if (hs.his && hs.his.length > 0) wrTrans.objectStore(STORE_NAME).put(hs);
                  });
                }
              };
            }
          };
        } catch { }
        res();
      };
      rq.onerror = e => rej(e);
    });
  }

  // --- SAVE SESSION TO DB ---
  function saveToDB(s) {
    return new Promise((resolve, reject) => {
      try {
        if (s && typeof s === 'object') {
          s.updatedAt = Date.now();
        }
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).put(s);
        t.oncomplete = () => {
          // Sync to native bridge if available
          if (typeof syncSessionsToNative === 'function') {
            syncSessionsToNative();
          }
          if (typeof scheduleAutoSync === 'function') {
            scheduleAutoSync(10000);
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
        const rq = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
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
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).clear();
        t.oncomplete = () => {
          if (window.JarvisNativeBridge) {
            saveToNativeBridge('jarvis_sessions_backup', '[]');
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
        const t = db.transaction(FILE_STORE, "readwrite");
        t.objectStore(FILE_STORE).put(f);
        t.oncomplete = () => r();
      } catch { r(); }
    });
  }

  // --- GET ALL FILES FROM LIBRARY ---
  function getAllFilesFromLib() {
    return new Promise(r => {
      try {
        const rq = db.transaction(FILE_STORE, "readonly").objectStore(FILE_STORE).getAll();
        rq.onsuccess = () => r(rq.result);
      } catch { r([]); }
    });
  }

  // --- DELETE FROM DB ---
  function deleteFromDB(i) {
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction(STORE_NAME, "readwrite");
        t.objectStore(STORE_NAME).delete(i);
        t.oncomplete = () => {
          // Record deleted ID
          try {
            const list = JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]');
            if (!list.includes(i)) {
              list.push(i);
              if (list.length > 200) list.shift();
              ls.setItem('jarvis_deleted_session_ids', JSON.stringify(list));
            }
          } catch { }
          if (typeof syncSessionsToNative === 'function') {
            syncSessionsToNative();
          }
          if (typeof scheduleAutoSync === 'function') {
            scheduleAutoSync(6000);
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
    } catch (e) { }
  }

  // --- PUBLIC API ---
  window.initDB = initDB;
  window.saveToDB = saveToDB;
  window.getAllFromDB = getAllFromDB;
  window.clearAllDB = clearAllDB;
  window.saveFileToLib = saveFileToLib;
  window.getAllFilesFromLib = getAllFilesFromLib;
  window.deleteFromDB = deleteFromDB;
  window.DB_NAME = DB_NAME;
  window.STORE_NAME = STORE_NAME;
  window.FILE_STORE = FILE_STORE;
  window.TTS_STORE = TTS_STORE;

})();