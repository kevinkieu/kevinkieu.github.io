/* ==========================================================================
   Jarvis AI - GitHub Gist Cloud Sync & 2-Way Smart Merge Module
   ========================================================================== */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;

  // Bridge helpers to app.js core
  const showToast = (msg, type) => (typeof window.showToast === 'function') ? window.showToast(msg, type) : console.log(`[${type}] ${msg}`);
  const getAllFromDB = () => (typeof window.getAllFromDB === 'function') ? window.getAllFromDB() : Promise.resolve([]);
  const clearAllDB = () => (typeof window.clearAllDB === 'function') ? window.clearAllDB() : Promise.resolve();
  const sanitizeSessionForBackup = s => (typeof window.sanitizeSessionForBackup === 'function') ? window.sanitizeSessionForBackup(s) : s;
  const renderFolders = () => window.renderFolders && window.renderFolders();
  const renderSnippets = () => window.renderSnippets && window.renderSnippets();
  const renderSel = () => window.renderSel && window.renderSel();
  const renderTabs = () => window.renderTabs && window.renderTabs();
  const switchSess = id => window.switchSess && window.switchSess(id);
  const appendMsg = (r, t, i, u) => window.appendMsg && window.appendMsg(r, t, i, u);
  const getGoogleKeysList = all => (typeof window.getGoogleKeysList === 'function') ? window.getGoogleKeysList(all) : [];
  const getGoogleKeyNamesList = () => (typeof window.getGoogleKeyNamesList === 'function') ? window.getGoogleKeyNamesList() : [];
  const setGoogleKeysList = k => window.setGoogleKeysList && window.setGoogleKeysList(k);
  const getExternalConfigsObj = obf => (typeof window.getExternalConfigsObj === 'function') ? window.getExternalConfigsObj(obf) : {};
  const setExternalConfigsObj = obj => window.setExternalConfigsObj && window.setExternalConfigsObj(obj);
  const deobfuscateKey = k => (typeof window.deobfuscateKey === 'function') ? window.deobfuscateKey(k) : k;
  const obfuscateKey = k => (typeof window.obfuscateKey === 'function') ? window.obfuscateKey(k) : k;
  const saveToNativeBridge = (k, v) => (typeof window.saveToNativeBridge === 'function') ? window.saveToNativeBridge(k, v) : null;
  const getDB = () => (typeof window.getDB === 'function') ? window.getDB() : null;
  const getSTORE_NAME = () => window.STORE_NAME || 'sessions';
  const getDOM = () => window.DOM || {};
  const oLay = $('modal-overlay');

    // --- GITHUB GIST CLOUD SYNC CONTROLLER (2-WAY SMART MERGE & AUTO SYNC) ---
    const cloudSyncModal = $('cloud-sync-modal');
    const gistPatInput = $('gist-pat-input');
    const gistIdInput = $('gist-id-input');
    const gistStatusText = $('gist-status-text');
    const gistLastTime = $('gist-last-time');
    const gistAutoSyncToggle = $('gist-auto-sync-toggle');

    let _isSyncing = false;
    let _autoSyncTimer = null;
    let _gistRateLimitedUntil = 0;

    // Helper xử lý lỗi HTTP của GitHub Gist (Đặc biệt phát hiện và cảnh báo Rate Limit thông minh)
    function handleGistHttpError(res, errData) {
      if (res.status === 403 || res.status === 429 || (errData && errData.message && /rate limit/i.test(errData.message))) {
        const resetHeader = res.headers ? res.headers.get('x-ratelimit-reset') : null;
        let resetTimestamp;
        if (resetHeader && !isNaN(parseInt(resetHeader, 10))) {
          resetTimestamp = parseInt(resetHeader, 10) * 1000;
        } else {
          resetTimestamp = Date.now() + 30 * 60 * 1000;
        }
        _gistRateLimitedUntil = resetTimestamp;

        const resetDate = new Date(resetTimestamp);
        const minsLeft = Math.max(1, Math.round((resetTimestamp - Date.now()) / 60000));
        const hh = String(resetDate.getHours()).padStart(2, '0');
        const mm = String(resetDate.getMinutes()).padStart(2, '0');
        const timeStr = hh + ':' + mm;
        return new Error("GitHub tạm thời giới hạn tần suất gọi API (do đợt trước đồng bộ liên tục). Sẽ tự động mở lại vào lúc " + timeStr + " (khoảng " + minsLeft + " phút nữa).");
      }
      return new Error((errData && errData.message) || ("Lỗi HTTP " + res.status));
    }

    // Helper fetch file content from GitHub Gist (supporting large files with raw_url)
    async function fetchGistData(pat, gistId) {
      const res = await fetch("https://api.github.com/gists/" + gistId, {
        headers: {
          'Authorization': "Bearer " + pat,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw handleGistHttpError(res, errData);
      }
      const data = await res.json();
      const fileObj = data.files && (data.files["jarvis_sync_data.json"] || Object.values(data.files)[0]);
      if (!fileObj) throw new Error("Không tìm thấy tệp dữ liệu sao lưu hợp lệ trong Gist này!");

      let contentStr = fileObj.content || '';
      if (fileObj.truncated || !contentStr || fileObj.raw_url) {
        try {
          let rawRes = await fetch(fileObj.raw_url, {
            headers: { 'Authorization': "Bearer " + pat }
          });
          if (!rawRes.ok) rawRes = await fetch(fileObj.raw_url);
          if (rawRes.ok) contentStr = await rawRes.text();
        } catch (rawErr) {
          console.warn("[Gist] Lỗi fetch raw_url, dùng inline content:", rawErr);
        }
      }
      if (!contentStr) throw new Error("Nội dung tệp sao lưu trên Gist bị trống!");
      return JSON.parse(contentStr);
    }

    // Helper push backupData to GitHub Gist
    async function pushGistData(pat, gistId, backupData) {
      const payload = {
        description: "Jarvis AI - Cloud Sync Personal Backup",
        public: false,
        files: {
          "jarvis_sync_data.json": {
            content: JSON.stringify(backupData)
          }
        }
      };
      const url = gistId ? ("https://api.github.com/gists/" + gistId) : "https://api.github.com/gists";
      const method = gistId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': "Bearer " + pat,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw handleGistHttpError(res, errData);
      }
      const data = await res.json();
      return data.id || gistId;
    }

    // 2-WAY SMART MERGE (HỢP NHẤT DỮ LIỆU ĐA THIẾT BỊ - KHÔNG CHỚP MÀN HÌNH)
    async function performSmartSync({ silent = false } = {}) {
      if (_isSyncing) return;
      if (_gistRateLimitedUntil && Date.now() < _gistRateLimitedUntil) {
        const minsLeft = Math.max(1, Math.round((_gistRateLimitedUntil - Date.now()) / 60000));
        const resetDate = new Date(_gistRateLimitedUntil);
        const hh = String(resetDate.getHours()).padStart(2, '0');
        const mm = String(resetDate.getMinutes()).padStart(2, '0');
        const msg = "GitHub đang tạm giới hạn API do đợt đồng bộ trước. Tự động mở lại lúc " + hh + ":" + mm + " (còn ~" + minsLeft + " phút).";
        if (!silent) showToast(msg, "warning");
        return;
      }
      if (_gistRateLimitedUntil && Date.now() >= _gistRateLimitedUntil) {
        _gistRateLimitedUntil = 0;
      }
      const pat = (gistPatInput?.value || ls.getItem('jarvis_gist_pat') || '').trim();
      let gistId = (gistIdInput?.value || ls.getItem('jarvis_gist_id') || '').trim();

      if (!pat) {
        if (!silent) showToast("Vui lòng nhập GitHub Personal Access Token (PAT)!", "warning");
        return;
      }

      _isSyncing = true;
      const syncBtn = $('btn-gist-sync');
      const headerSyncBtn = $('btn-cloud-sync-header');
      const oldBtnHtml = syncBtn ? syncBtn.innerHTML : '';
      if (syncBtn && !silent) {
        syncBtn.innerHTML = `<span>Đang đồng bộ 2 chiều...</span> ⏳`;
        syncBtn.disabled = true;
      }
      if (headerSyncBtn && silent) {
        headerSyncBtn.classList.add('syncing-pulse');
        const span = headerSyncBtn.querySelector('span');
        if (span) span.innerText = 'Đang đồng bộ...';
      }

      try {
        // 1. Thu thập dữ liệu cục bộ hiện tại trên thiết bị này
        const localSessions = (await getAllFromDB()).map(sanitizeSessionForBackup);
        let localKnowledge = [];
        if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
          try {
            localKnowledge = await window.JarvisRAG.getAllKnowledge();
          } catch (kErr) {
            console.warn("[SmartSync] Lỗi đọc Kho tri thức:", kErr);
          }
        }

        let finalSessions = localSessions;
        let finalKnowledge = localKnowledge;
        let finalFolders = JSON.parse(ls.getItem('jarvis_folders') || '["Mặc định"]');
        let finalPrompts = JSON.parse(ls.getItem('jarvis_custom_prompts') || '[]');

        const deletedSessionIds = new Set(JSON.parse(ls.getItem('jarvis_deleted_session_ids') || '[]'));
        const deletedVectorIds = new Set(JSON.parse(ls.getItem('jarvis_deleted_vector_ids') || '[]'));

        let hasRemoteData = false;
        let hasChanges = false;

        // 2. Nếu đã có Gist ID, tải dữ liệu từ Cloud về để HỢP NHẤT (Merge)
        if (gistId) {
          try {
            const cloudData = await fetchGistData(pat, gistId);
            hasRemoteData = true;

            // A. HỢP NHẤT LỊCH SỬ PHIÊN CHAT (SESSIONS)
            if (Array.isArray(cloudData.sessions)) {
              const sessionMap = new Map();
              for (const lsess of localSessions) {
                if (lsess && lsess.id && !deletedSessionIds.has(lsess.id)) {
                  sessionMap.set(lsess.id, lsess);
                }
              }
              for (const csess of cloudData.sessions) {
                if (!csess || !csess.id || deletedSessionIds.has(csess.id)) continue;
                if (!sessionMap.has(csess.id)) {
                  sessionMap.set(csess.id, csess);
                  hasChanges = true;
                } else {
                  const existing = sessionMap.get(csess.id);
                  const lCount = (existing.his || []).length;
                  const cCount = (csess.his || []).length;
                  const lTime = existing.updatedAt || existing.timestamp || 0;
                  const cTime = csess.updatedAt || csess.timestamp || 0;
                  if (cCount > lCount || (cCount === lCount && cTime > lTime)) {
                    sessionMap.set(csess.id, csess);
                    if (cCount !== lCount) hasChanges = true;
                  }
                }
              }
              finalSessions = Array.from(sessionMap.values());
              finalSessions.sort((a, b) => {
                const tA = a.updatedAt || a.timestamp || 0;
                const tB = b.updatedAt || b.timestamp || 0;
                return tB - tA;
              });
            }

            // B. HỢP NHẤT KHO TRI THỨC & TRÍ NHỚ VECTƠ (KNOWLEDGE BASE & RAG)
            if (Array.isArray(cloudData.knowledgeBase)) {
              const kMap = new Map();
              for (const lk of localKnowledge) {
                if (lk && lk.id && !deletedVectorIds.has(lk.id)) {
                  kMap.set(lk.id, lk);
                }
              }
              for (const ck of cloudData.knowledgeBase) {
                if (!ck || !ck.id || deletedVectorIds.has(ck.id)) continue;
                if (!kMap.has(ck.id)) {
                  kMap.set(ck.id, ck);
                  hasChanges = true;
                } else {
                  const ex = kMap.get(ck.id);
                  const exTime = ex.createdAt || 0;
                  const ckTime = ck.createdAt || 0;
                  if (ckTime > exTime || (!ex.vector && ck.vector)) {
                    kMap.set(ck.id, ck);
                  }
                }
              }
              const allMergedK = Array.from(kMap.values());
              const seenMemTexts = new Set();
              finalKnowledge = [];
              for (const it of allMergedK) {
                if (it.type === 'memory') {
                  const tKey = (it.text || '').trim().toLowerCase();
                  if (seenMemTexts.has(tKey)) continue;
                  seenMemTexts.add(tKey);
                }
                finalKnowledge.push(it);
              }
              if (finalKnowledge.length !== localKnowledge.length) {
                hasChanges = true;
              }
            }

            // C. HỢP NHẤT THƯ MỤC & PROMPTS MẪU
            if (Array.isArray(cloudData.folders)) {
              const origFoldersLen = finalFolders.length;
              finalFolders = Array.from(new Set([...finalFolders, ...cloudData.folders]));
              if (finalFolders.length !== origFoldersLen) hasChanges = true;
            }

            if (Array.isArray(cloudData.customPrompts)) {
              const pMap = new Map();
              finalPrompts.forEach(p => { if (p && p.title) pMap.set(p.title, p); });
              cloudData.customPrompts.forEach(p => { if (p && p.title && !pMap.has(p.title)) { pMap.set(p.title, p); hasChanges = true; } });
              finalPrompts = Array.from(pMap.values());
            }

            // D. HỢP NHẤT KHÓA GOOGLE API (Bổ sung vào các slot còn trống)
            if (cloudData.settings?.keys && Array.isArray(cloudData.settings.keys)) {
              const localKeys = getGoogleKeysList();
              const remoteKeys = cloudData.settings.keys;
              const mergedKeys = [];
              let keyChanged = false;
              for (let i = 0; i < 10; i++) {
                let rKey = remoteKeys[i] || '';
                if (rKey.startsWith('JVENC_') || rKey.startsWith('ENC_')) rKey = deobfuscateKey(rKey);
                mergedKeys[i] = localKeys[i] || rKey || '';
                if (!localKeys[i] && rKey) keyChanged = true;
              }
              if (keyChanged) {
                setGoogleKeysList(mergedKeys);
              }
            }

          } catch (fetchErr) {
            console.warn("[SmartSync] Không thể tải dữ liệu cũ từ Cloud để merge:", fetchErr);
          }
        }

        // Kiểm tra chi tiết xem máy cục bộ có dữ liệu gì mới hơn hoặc khác biệt so với Cloud không
        let isLocalAhead = !hasRemoteData;
        if (!isLocalAhead && cloudData) {
          const remoteSessions = Array.isArray(cloudData.sessions) ? cloudData.sessions : [];
          const remoteKnowledge = Array.isArray(cloudData.knowledgeBase) ? cloudData.knowledgeBase : [];

          // 1. So sánh số lượng phiên và số lượng tri thức
          if (localSessions.length !== remoteSessions.length || localKnowledge.length !== remoteKnowledge.length) {
            isLocalAhead = true;
          }

          // 2. So sánh chi tiết từng phiên: tin nhắn mới, thời gian cập nhật, tên phiên, pinned
          if (!isLocalAhead) {
            const remoteMap = new Map();
            remoteSessions.forEach(cs => { if (cs && cs.id) remoteMap.set(cs.id, cs); });

            for (const lsess of localSessions) {
              if (!lsess || !lsess.id) continue;
              const csess = remoteMap.get(lsess.id);
              if (!csess) {
                isLocalAhead = true; // Phiên mới tạo ở máy này
                break;
              }
              const lCount = (lsess.his || []).length;
              const cCount = (csess.his || []).length;
              const lTime = lsess.updatedAt || lsess.timestamp || 0;
              const cTime = csess.updatedAt || csess.timestamp || 0;

              if (lCount > cCount || lTime > cTime || lsess.name !== csess.name || lsess.pinned !== csess.pinned || lsess.folder !== csess.folder) {
                isLocalAhead = true; // Có tin nhắn mới, đổi tên hoặc vừa ghim phiên
                break;
              }
            }
          }

          // 3. Kiểm tra xem có phiên hoặc vector nào đã xóa ở máy này mà Cloud vẫn còn lưu không
          if (!isLocalAhead) {
            if (deletedSessionIds.size > 0 && remoteSessions.some(cs => deletedSessionIds.has(cs.id))) {
              isLocalAhead = true;
            } else if (deletedVectorIds.size > 0 && remoteKnowledge.some(ck => deletedVectorIds.has(ck.id))) {
              isLocalAhead = true;
            }
          }
        }

        // Chỉ lưu xuống IndexedDB khi thực sự có thay đổi từ Cloud
        if (hasChanges) {
          // Lưu bằng transaction trực tiếp, KHÔNG gọi saveToDB để triệt tiêu đệ quy!
          await clearAllDB();
          const tx = getDB().transaction(getSTORE_NAME(), "readwrite");
          const store = tx.objectStore(getSTORE_NAME());
          finalSessions.forEach(s => store.put(s));
          await new Promise((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = e => rej(e);
          });
          window.sessions = await getAllFromDB();

          if (!sessions.some(s => s.id === activeId) && sessions.length > 0) {
            window.activeId = (window.sessions[0]?.id || null);
            ls.setItem('jarvis_active_id', activeId);
          }

          window.folders = finalFolders;
          ls.setItem('jarvis_folders', JSON.stringify(folders));
          ls.setItem('jarvis_custom_prompts', JSON.stringify(finalPrompts));

          if (window.JarvisRAG && typeof window.JarvisRAG.importKnowledge === 'function') {
            await window.JarvisRAG.importKnowledge(finalKnowledge, true);
          }
        }

        // Đóng gói và đẩy lên Gist nếu có thay đổi hoặc lần đầu tiên, hoặc người dùng bấm thủ công
        if (!gistId || hasChanges || isLocalAhead || !silent) {
          const backupData = {
            version: 2,
            app: "Jarvis AI",
            timestamp: new Date().toISOString(),
            timeReadable: new Date().toLocaleString('vi-VN'),
            device: ('ontouchstart' in window) ? 'Mobile' : 'Desktop',
            sessions: finalSessions,
            activeId: window.activeId,
            customPrompts: finalPrompts,
            folders: finalFolders,
            knowledgeBase: finalKnowledge,
            settings: {
              keys: getGoogleKeysList(true),
              keyNames: getGoogleKeyNamesList(),
              externalConfigs: getExternalConfigsObj(true),
              model: getDOM().model.value,
              temperature: getDOM().temp.value,
              searchEngine: getDOM().searchEngineSel.value,
              globalContext: getDOM().globContext.value,
              systemInstruction: getDOM().sysInst.value,
              theme: ls.getItem('jarvis_theme') || 'auto',
              autoLearnMemory: ls.getItem('jarvis_auto_learn_memory') || 'true',
              ragEnabled: ls.getItem('jarvis_rag_enabled') || 'true',
              autoSyncCloud: ls.getItem('jarvis_auto_sync_cloud') || 'true'
            }
          };

          const newGistId = await pushGistData(pat, gistId, backupData);
          if (!gistId && newGistId) {
            gistId = newGistId;
            if (gistIdInput) gistIdInput.value = gistId;
          }

          const timeStr = new Date().toLocaleString('vi-VN');
          ls.setItem('jarvis_gist_pat', pat);
          ls.setItem('jarvis_gist_id', gistId);
          ls.setItem('jarvis_gist_last_sync', timeStr);
          if (gistLastTime) gistLastTime.innerText = `Lần cuối: ${timeStr}`;
        }

        // CẬP NHẬT GIAO DIỆN MÀ KHÔNG GÂY CHỚP MÀN HÌNH:
        renderFolders();
        renderSnippets();
        renderSel();
        renderTabs();

        // TUYỆT ĐỐI KHÔNG GỌI switchSess TRONG CHẾ ĐỘ CHẠY NGẦM (SILENT)
        // Vì switchSess sẽ xóa trắng getDOM().chat và vẽ lại từ đầu, gây chớp màn hình khi đang đọc tin nhắn!
        if (!silent) {
          await switchSess(activeId);
        } else if (hasChanges) {
          // Nếu có phiên hiện tại nhận được tin nhắn mới từ thiết bị kia, chỉ append thêm vào cuối nhẹ nhàng
          const currentVisible = finalSessions.find(s => s.id === activeId);
          const currentCount = (window.chatHistory || []).length;
          const newCount = (currentVisible?.his || []).length;
          if (currentVisible && newCount > currentCount) {
            const addedMsgs = currentVisible.his.slice(currentCount);
            window.chatHistory = [...currentVisible.his];
            for (let idx = 0; idx < addedMsgs.length; idx++) {
              const msg = addedMsgs[idx];
              await appendMsg(msg.role === 'model' ? 'bot' : 'user', msg.text || '', currentCount + idx, false);
            }
          }
        }

        const kCount = finalKnowledge.length ? `, ${finalKnowledge.length} tri thức` : '';
        if (gistStatusText) {
          gistStatusText.innerText = `Đã hợp nhất (${finalSessions.length} phiên${kCount})`;
          gistStatusText.style.color = '#10b981';
        }
        const lastSyncDisplay = ls.getItem('jarvis_gist_last_sync') || new Date().toLocaleTimeString('vi-VN');
        if (headerSyncBtn) {
          headerSyncBtn.title = `Đồng bộ Cloud Gist (Lần cuối: ${lastSyncDisplay})`;
        }

        if (!silent) {
          showToast(`🔄 Đồng bộ 2 chiều thành công! Đã gộp ${finalSessions.length} phiên & ${finalKnowledge.length} mẩu tri thức.`, "success");
        } else {
          console.log(`[Auto-Sync] Đã kiểm tra đồng bộ ngầm 2 chiều (${finalSessions.length} phiên, ${finalKnowledge.length} tri thức)`);
        }
      } catch (err) {
        console.error("[SmartSync] Lỗi đồng bộ:", err);
        if (!silent) {
          showToast(`Lỗi đồng bộ 2 chiều: ${err.message}`, "danger");
        }
      } finally {
        _isSyncing = false;
        if (syncBtn && !silent) {
          syncBtn.innerHTML = oldBtnHtml || `🔄 Đồng bộ 2 chiều (Smart Sync & Merge)`;
          syncBtn.disabled = false;
        }
        if (headerSyncBtn && silent) {
          headerSyncBtn.classList.remove('syncing-pulse');
          const span = headerSyncBtn.querySelector('span');
          if (span) span.innerText = 'Đồng bộ';
        }
      }
    }

    // Tự động lên lịch đồng bộ ngầm (Debounced Auto-Sync)
    function scheduleAutoSync(delay = 10000) {
      if (_isSyncing) return;
      if (_gistRateLimitedUntil && Date.now() < _gistRateLimitedUntil) return;
      if (_gistRateLimitedUntil && Date.now() >= _gistRateLimitedUntil) {
        _gistRateLimitedUntil = 0;
      }
      if (ls.getItem('jarvis_auto_sync_cloud') === 'false') return;
      const pat = (ls.getItem('jarvis_gist_pat') || '').trim();
      const gistId = (ls.getItem('jarvis_gist_id') || '').trim();
      if (!pat || !gistId) return;

      clearTimeout(_autoSyncTimer);
      _autoSyncTimer = setTimeout(() => {
        if (_isSyncing) return;
        console.log("[Auto-Sync] Đang tự động đồng bộ ngầm dữ liệu mới lên Cloud...");
        performSmartSync({ silent: true }).catch(() => {});
      }, delay);
    }

    // Expose cho module khác (như rag.js) gọi đồng bộ ngầm
    window.JarvisSync = {
      performSmartSync,
      scheduleAutoSync
    };

    // Khởi tạo trạng thái modal Cloud Sync
    const openCloudSyncModal = () => {
      cloudSyncModal.style.display = 'flex';
      oLay.style.display = 'block';
      gistPatInput.value = ls.getItem('jarvis_gist_pat') || '';
      gistIdInput.value = ls.getItem('jarvis_gist_id') || '';

      if (gistAutoSyncToggle) {
        gistAutoSyncToggle.checked = ls.getItem('jarvis_auto_sync_cloud') !== 'false';
        gistAutoSyncToggle.onchange = () => {
          ls.setItem('jarvis_auto_sync_cloud', gistAutoSyncToggle.checked ? 'true' : 'false');
          showToast(gistAutoSyncToggle.checked ? "Đã bật tự động đồng bộ 2 chiều ngầm!" : "Đã tắt tự động đồng bộ ngầm", "info");
          if (gistAutoSyncToggle.checked) scheduleAutoSync(5000);
        };
      }

      const last = ls.getItem('jarvis_gist_last_sync');
      if (last) {
        gistStatusText.innerText = 'Đã kết nối Gist';
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${last}`;
      } else {
        gistStatusText.innerText = 'Chưa đồng bộ';
        gistStatusText.style.color = 'var(--text-muted)';
        gistLastTime.innerText = '--:--';
      }
    };

    $('btn-open-cloud-sync').onclick = openCloudSyncModal;
    if ($('btn-cloud-sync-header')) $('btn-cloud-sync-header').onclick = openCloudSyncModal;
    if ($('btn-cloud-sync-chip')) $('btn-cloud-sync-chip').onclick = openCloudSyncModal;
    if ($('btn-open-cloud-from-settings')) $('btn-open-cloud-from-settings').onclick = () => {
      $('settings-modal').style.display = 'none';
      openCloudSyncModal();
    };

    $('btn-toggle-pat-eye').onclick = () => {
      gistPatInput.type = gistPatInput.type === 'password' ? 'text' : 'password';
    };

    $('btn-copy-gist-id').onclick = () => {
      const id = gistIdInput.value.trim();
      if (!id) return showToast("Chưa có Gist ID!", "warning");
      navigator.clipboard.writeText(id);
      showToast("Đã sao chép Gist ID!");
    };

    // NÚT CHÍNH: ĐỒNG BỘ 2 CHIỀU (SMART SYNC & MERGE)
    if ($('btn-gist-sync')) {
      $('btn-gist-sync').onclick = async () => {
        await performSmartSync({ silent: false });
      };
    }

    // PUSH TO GIST (GHI ĐÈ CLOUD - BACKUP THỦ CÔNG)
    $('btn-gist-push').onclick = async () => {
      const pat = gistPatInput.value.trim();
      if (!pat) return showToast("Vui lòng nhập GitHub Personal Access Token (PAT)!", "warning");
      let gistId = gistIdInput.value.trim();

      const btn = $('btn-gist-push');
      btn.innerHTML = `<span>Đang đẩy lên...</span> ⏳`;
      btn.disabled = true;

      try {
        const allSessions = await getAllFromDB();
        const cleanSessions = allSessions.map(sanitizeSessionForBackup);

        let allKnowledge = [];
        if (window.JarvisRAG && typeof window.JarvisRAG.getAllKnowledge === 'function') {
          try {
            allKnowledge = await window.JarvisRAG.getAllKnowledge();
          } catch (kErr) {
            console.warn("Lỗi trích xuất Kho tri thức:", kErr);
          }
        }

        const backupData = {
          version: 2,
          app: "Jarvis AI",
          timestamp: new Date().toISOString(),
          timeReadable: new Date().toLocaleString('vi-VN'),
          device: ('ontouchstart' in window) ? 'Mobile' : 'Desktop',
          sessions: cleanSessions,
          activeId: window.activeId,
          customPrompts: JSON.parse(ls.getItem('jarvis_custom_prompts') || '[]'),
          folders: JSON.parse(ls.getItem('jarvis_folders') || '["Mặc định"]'),
          knowledgeBase: allKnowledge,
          settings: {
            keys: getGoogleKeysList(true),
            keyNames: getGoogleKeyNamesList(),
            externalConfigs: getExternalConfigsObj(true),
            model: getDOM().model.value,
            temperature: getDOM().temp.value,
            searchEngine: getDOM().searchEngineSel.value,
            globalContext: getDOM().globContext.value,
            systemInstruction: getDOM().sysInst.value,
            theme: ls.getItem('jarvis_theme') || 'auto',
            autoLearnMemory: ls.getItem('jarvis_auto_learn_memory') || 'true',
            ragEnabled: ls.getItem('jarvis_rag_enabled') || 'true',
            autoSyncCloud: ls.getItem('jarvis_auto_sync_cloud') || 'true'
          }
        };

        gistId = await pushGistData(pat, gistId, backupData);
        gistIdInput.value = gistId;

        const timeStr = new Date().toLocaleString('vi-VN');
        ls.setItem('jarvis_gist_pat', pat);
        ls.setItem('jarvis_gist_id', gistId);
        ls.setItem('jarvis_gist_last_sync', timeStr);

        const kCount = allKnowledge.length ? `, ${allKnowledge.length} tri thức` : '';
        gistStatusText.innerText = `Đã sao lưu (${allSessions.length} phiên${kCount})`;
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${timeStr}`;

        showToast(`Đã ghi đè Cloud thành công! Gist ID: ${gistId}`, "success");
      } catch (err) {
        showToast(`Lỗi đẩy lên Cloud: ${err.message}`, "danger");
      } finally {
        btn.innerHTML = `☁️ Ghi đè Cloud (Backup)`;
        btn.disabled = false;
      }
    };

    // PULL FROM GIST (GHI ĐÈ MÁY - RESTORE THỦ CÔNG)
    $('btn-gist-pull').onclick = async () => {
      const pat = gistPatInput.value.trim();
      const gistId = gistIdInput.value.trim();
      if (!pat) return showToast("Vui lòng nhập GitHub PAT!", "warning");
      if (!gistId) return showToast("Vui lòng nhập Gist ID cần tải về!", "warning");

      if (!confirm("Thao tác này sẽ GHI ĐÈ toàn bộ lịch sử và cài đặt máy này bằng dữ liệu trên Cloud. Bạn có muốn tiếp tục? (Để gộp cả hai bên mà không mất dữ liệu, hãy dùng nút 'Đồng bộ 2 chiều')")) return;

      const btn = $('btn-gist-pull');
      btn.innerHTML = `<span>Đang tải về...</span> ⏳`;
      btn.disabled = true;

      try {
        const parsed = await fetchGistData(pat, gistId);
        if (!parsed.sessions || !Array.isArray(parsed.sessions)) throw new Error("Cấu trúc dữ liệu không hợp lệ!");

        if (parsed.sessions && parsed.sessions.length > 0) {
          await clearAllDB();
          for (const s of parsed.sessions) {
            await saveToDB(s);
          }
        }

        window.sessions = await getAllFromDB();
        if (parsed.activeId && sessions.some(s => s.id === parsed.activeId)) {
          activeId = parsed.activeId;
        } else if (sessions.length > 0) {
          window.activeId = (window.sessions[0]?.id || null);
        }
        ls.setItem('jarvis_active_id', activeId);

        if (parsed.folders && Array.isArray(parsed.folders)) {
          folders = parsed.folders;
          ls.setItem('jarvis_folders', JSON.stringify(folders));
        }

        if (parsed.customPrompts && Array.isArray(parsed.customPrompts)) {
          ls.setItem('jarvis_custom_prompts', JSON.stringify(parsed.customPrompts));
        }

        if (parsed.settings) {
          if (parsed.settings.keys) setGoogleKeysList(parsed.settings.keys);
          if (parsed.settings.keyNames) setGoogleKeyNamesList(parsed.settings.keyNames);
          if (parsed.settings.externalConfigs) setExternalConfigsObj(parsed.settings.externalConfigs);
          if (parsed.settings.model && getDOM().model) getDOM().model.value = parsed.settings.model;
          if (parsed.settings.temperature && getDOM().temp) {
            getDOM().temp.value = parsed.settings.temperature;
            if (getDOM().tempVal) getDOM().tempVal.innerText = parsed.settings.temperature;
          }
          if (parsed.settings.searchEngine && getDOM().searchEngineSel) getDOM().searchEngineSel.value = parsed.settings.searchEngine;
          if (parsed.settings.globalContext && getDOM().globContext) getDOM().globContext.value = parsed.settings.globalContext;
          if (parsed.settings.systemInstruction && getDOM().sysInst) getDOM().sysInst.value = parsed.settings.systemInstruction;
          if (parsed.settings.theme) {
            ls.setItem('jarvis_theme', parsed.settings.theme);
            if (typeof applyTheme === 'function') applyTheme(parsed.settings.theme);
          }
          if (parsed.settings.autoLearnMemory) ls.setItem('jarvis_auto_learn_memory', parsed.settings.autoLearnMemory);
          if (parsed.settings.ragEnabled) ls.setItem('jarvis_rag_enabled', parsed.settings.ragEnabled);
        }

        let importedKCount = 0;
        if (parsed.knowledgeBase && Array.isArray(parsed.knowledgeBase) && window.JarvisRAG && typeof window.JarvisRAG.importKnowledge === 'function') {
          try {
            importedKCount = await window.JarvisRAG.importKnowledge(parsed.knowledgeBase, true);
          } catch (kErr) {
            console.warn("Lỗi khôi phục Kho Tri Thức từ Gist:", kErr);
          }
        }

        const timeStr = new Date().toLocaleString('vi-VN');
        ls.setItem('jarvis_gist_pat', pat);
        ls.setItem('jarvis_gist_id', gistId);
        ls.setItem('jarvis_gist_last_sync', timeStr);

        if (window.JarvisNativeBridge) {
          saveToNativeBridge('jarvis_sessions_backup', JSON.stringify(sessions));
          if (typeof window.JarvisNativeBridge.commit === 'function') {
            window.JarvisNativeBridge.commit();
          }
        }

        const kPullStatus = importedKCount ? `, ${importedKCount} tri thức` : '';
        gistStatusText.innerText = `Đã ghi đè (${sessions.length} phiên${kPullStatus})`;
        gistStatusText.style.color = '#10b981';
        gistLastTime.innerText = `Lần cuối: ${timeStr}`;

        renderFolders();
        renderSnippets();
        await switchSess(activeId);

        showToast(`Đã khôi phục thành công ${sessions.length} phiên${importedKCount ? ' & ' + importedKCount + ' mẩu tri thức' : ''} từ Cloud!`, "success");
      } catch (err) {
        showToast(`Lỗi tải về từ Cloud: ${err.message}`, "danger");
      } finally {
        btn.innerHTML = `📥 Ghi đè Máy (Restore)`;
        btn.disabled = false;
      }
    };

    // Tự động kiểm tra & đồng bộ 2 chiều ngầm khi khởi động ứng dụng (Startup Sync - 1 lần duy nhất sau 5 giây)
    setTimeout(() => {
      if (ls.getItem('jarvis_auto_sync_cloud') !== 'false' && ls.getItem('jarvis_gist_pat') && ls.getItem('jarvis_gist_id')) {
        console.log("[Auto-Sync] Kiểm tra và đồng bộ ngầm khi mở app...");
        performSmartSync({ silent: true }).catch(() => {});
      }
    }, 5000);



})();
