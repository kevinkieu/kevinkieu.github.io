/* ==========================================================================
   Jarvis AI - Smart Sync merge helpers (js/sync-merge.js)

   Các hàm THUẦN, không đụng DOM/IndexedDB, để test được và để sync.js dùng lại.

   Vì sao cần: bản sync cũ chọn cả phiên theo "số tin nhắn / updatedAt". Khi hai
   máy cùng có tin mới, bên nhiều tin hơn thắng và tin của bên kia bị mất. Ở đây
   tin nhắn được HỢP NHẤT theo khóa (id, fallback = chữ ký nội dung), nên không
   máy nào mất tin; tombstone vẫn lọc được tin đã xóa nên không hồi sinh.

   API (window.SyncMerge):
     msgSig(msg), msgKey(msg)
     mergeMessages(localHis, remoteHis, pruneFn)
     mergeSessions(localSessions, remoteSessions, opts)
     mergeMedications(localMeds, remoteMeds, opts)
     mergeMedHistory(localHist, remoteHist, opts)
   ========================================================================== */
(function () {
  'use strict';

  // Phải GIỐNG HỆT msgSig trong js/msg-actions.js để khớp tombstone.
  function msgSig(m) {
    const t = String((m && m.text) || '');
    return ((m && m.role) || '') + '|' + t.length + '|' + t.slice(0, 160) + '|' + t.slice(-60);
  }

  function msgKey(m) {
    if (!m) return '';
    if (m.id) return 'id:' + m.id;
    if (m.msgId) return 'id:' + m.msgId;
    return 'sig:' + msgSig(m);
  }

  function toSet(value) {
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value.filter(Boolean));
    return new Set();
  }

  function pickNewer(a, b, timeOf) {
    if (!a) return b;
    if (!b) return a;
    return (timeOf(b) || 0) > (timeOf(a) || 0) ? b : a;
  }

  /**
   * Hợp nhất tin nhắn của một phiên: giữ thứ tự local, nối thêm tin chỉ có ở
   * remote. Nếu cùng khóa mà nội dung khác (tin bị sửa) thì lấy bản có
   * editedAt/updatedAt mới hơn, mặc định giữ bản local.
   */
  function mergeMessages(localHis, remoteHis, pruneFn) {
    const prune = typeof pruneFn === 'function' ? pruneFn : h => h;
    const local = prune(Array.isArray(localHis) ? localHis : []) || [];
    const remote = prune(Array.isArray(remoteHis) ? remoteHis : []) || [];

    const out = [];
    const index = new Map();
    let changed = false;

    local.forEach(m => {
      if (!m) return;
      const k = msgKey(m);
      if (index.has(k)) return;
      index.set(k, out.length);
      out.push(m);
    });

    const localKeys = new Set(index.keys());
    remote.forEach(m => {
      if (!m) return;
      const k = msgKey(m);
      if (index.has(k)) {
        const at = index.get(k);
        const winner = pickNewer(out[at], m, x => x.editedAt || x.updatedAt || x.timestamp);
        if (winner !== out[at]) {
          out[at] = winner;
          changed = true;
        }
        return;
      }
      index.set(k, out.length);
      out.push(m);
      changed = true;
    });

    const remoteKeys = new Set(
      (Array.isArray(remoteHis) ? remoteHis : []).filter(Boolean).map(msgKey)
    );
    let localAhead = false;
    for (const k of localKeys) {
      if (!remoteKeys.has(k)) {
        localAhead = true;
        break;
      }
    }
    // Tin local bị tombstone lọc mất cũng là thay đổi cần đẩy lên (dọn Cloud).
    if (Array.isArray(localHis) && local.length !== localHis.length) changed = true;

    return { his: out, changed, localAhead };
  }

  /**
   * Hợp nhất danh sách phiên.
   * opts.deletedSessionIds: Set/array id phiên đã xóa
   * opts.prune: (sessionId, his) => his  (thường là tombstone của tin nhắn)
   * opts.timeOf: (session) => number (mặc định updatedAt/timestamp/orderIndex)
   */
  function mergeSessions(localSessions, remoteSessions, opts) {
    const o = opts || {};
    const deleted = toSet(o.deletedSessionIds);
    const pruneFor = sid => (typeof o.prune === 'function' ? his => o.prune(sid, his) : undefined);
    const timeOf =
      typeof o.timeOf === 'function'
        ? o.timeOf
        : s => s.updatedAt || s.timestamp || s.orderIndex || 0;

    const entries = new Map();
    (Array.isArray(localSessions) ? localSessions : []).forEach(s => {
      if (s && s.id && !deleted.has(s.id)) entries.set(s.id, { local: s });
    });
    (Array.isArray(remoteSessions) ? remoteSessions : []).forEach(s => {
      if (!s || !s.id || deleted.has(s.id)) return;
      const e = entries.get(s.id);
      if (e) e.remote = s;
      else entries.set(s.id, { remote: s });
    });

    const out = [];
    let changed = false;
    let localAhead = false;

    entries.forEach(({ local, remote }, id) => {
      if (!local) {
        out.push(remote);
        changed = true;
        return;
      }
      if (!remote) {
        // Phiên chỉ có ở máy này (kể cả tin mới) -> phải đẩy lên Cloud.
        out.push(local);
        localAhead = true;
        return;
      }
      const merged = mergeMessages(local.his, remote.his, pruneFor(id));
      const base =
        timeOf(remote) > timeOf(local)
          ? Object.assign({}, local, remote)
          : Object.assign({}, remote, local);
      base.his = merged.his;
      base.id = id;
      out.push(base);
      if (merged.changed) changed = true;
      if (merged.localAhead) localAhead = true;
      // Metadata (tên/ghim/thư mục) đổi ở máy này cũng phải đẩy lên.
      if (
        local.name !== remote.name ||
        !!local.pinned !== !!remote.pinned ||
        (local.folder || '') !== (remote.folder || '')
      ) {
        if (timeOf(local) >= timeOf(remote)) localAhead = true;
        changed = true;
      }
    });

    return { sessions: out, changed, localAhead };
  }

  /**
   * Tủ thuốc: tombstone thắng nếu thuốc đã bị xóa; ngược lại bản updatedAt mới
   * hơn thắng. Không xóa thuốc chỉ vì bản kia thiếu nó.
   */
  function mergeMedications(localMeds, remoteMeds, opts) {
    const o = opts || {};
    const deleted = toSet(o.deletedMedIds);
    const timeOf = m => m.updatedAt || m.createdAt || 0;

    const map = new Map();
    let changed = false;
    let localAhead = false;

    (Array.isArray(localMeds) ? localMeds : []).forEach(m => {
      if (m && m.id && !deleted.has(m.id)) map.set(m.id, m);
    });
    (Array.isArray(remoteMeds) ? remoteMeds : []).forEach(m => {
      if (!m || !m.id || deleted.has(m.id)) return;
      const cur = map.get(m.id);
      if (!cur) {
        map.set(m.id, m);
        changed = true;
        return;
      }
      if (timeOf(m) > timeOf(cur)) {
        map.set(m.id, m);
        changed = true;
      } else if (timeOf(cur) > timeOf(m)) {
        localAhead = true;
      }
    });

    return { medications: Array.from(map.values()), changed, localAhead };
  }

  function historyKey(h) {
    if (!h) return '';
    return h.id || h.medId + '_' + h.timeStr + '_' + (h.date || h.timestamp);
  }

  /** Lịch sử uống thuốc: hợp nhất theo khóa, bản mới hơn thắng, tôn trọng tombstone. */
  function mergeMedHistory(localHist, remoteHist, opts) {
    const o = opts || {};
    const deleted = toSet(o.deletedHistoryIds);
    const map = new Map();
    let changed = false;
    let localAhead = false;

    (Array.isArray(localHist) ? localHist : []).forEach(h => {
      const k = historyKey(h);
      if (k && !deleted.has(k) && !deleted.has(h.id)) map.set(k, h);
    });
    (Array.isArray(remoteHist) ? remoteHist : []).forEach(h => {
      const k = historyKey(h);
      if (!k || deleted.has(k) || (h.id && deleted.has(h.id))) return;
      const cur = map.get(k);
      if (!cur) {
        map.set(k, h);
        changed = true;
      } else if ((h.timestamp || 0) > (cur.timestamp || 0)) {
        map.set(k, h);
        changed = true;
      }
    });
    if (
      Array.isArray(localHist) &&
      map.size < localHist.filter(h => h && historyKey(h) && !deleted.has(historyKey(h))).length
    ) {
      changed = true;
    }
    return { history: Array.from(map.values()), changed, localAhead };
  }

  window.SyncMerge = {
    msgSig,
    msgKey,
    mergeMessages,
    mergeSessions,
    mergeMedications,
    mergeMedHistory,
  };
})();
