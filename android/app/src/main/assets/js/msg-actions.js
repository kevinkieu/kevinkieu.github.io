/* ==========================================================================
   Jarvis AI - Hành động trên tin nhắn + tombstone chống hồi sinh từ Cloud

   Tách khỏi js/app.js (file quá lớn) để dễ bảo trì và cache theo phần.
   Toàn bộ code chỉ dùng trạng thái công khai qua window: chatHistory, sessions,
   activeId, isProcessing, DOM, saveToDB, reRenderHistory, captureChatScroll,
   restoreChatScroll, switchSess... nên không cần import.

   Gồm: dấu vết tin đã xoá (jarvis_deleted_msgs, TTL 90 ngày), xoá/thử lại/sửa/
   ghim tin nhắn, rẽ nhánh hội thoại tại một tin.
   ========================================================================== */
window.forkSessionAt = async index => {
  const curS = sessions.find(x => x.id === activeId);
  if (!curS || index < 0 || index >= chatHistory.length) return;

  const newForkId = 's_fork_' + Date.now();
  const forkedHistory = JSON.parse(JSON.stringify(chatHistory.slice(0, index + 1)));
  const baseName = curS.name.replace(/\s*\(Nhánh.*?\)$/, '');

  const newS = {
    ...curS,
    id: newForkId,
    name: `🌿 ${baseName} (Nhánh ${index + 1})`,
    his: forkedHistory,
    lastInteractionId: null,
    assignedApiKey: null,
    orderIndex: Date.now(),
    parentSessionId: curS.id,
    forkAtIndex: index,
  };

  sessions.unshift(newS);
  await saveToDB(newS);
  await switchSess(newForkId);
  showToast(`🌿 Đã rẽ nhánh sang phiên mới từ tin #${index + 1}!`);
};

window.togglePinMsg = async i => {
  if (!chatHistory[i]) return;
  chatHistory[i].pinned = !chatHistory[i].pinned;
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    s.his = chatHistory;
    await saveToDB(s);
  }
  await reRenderHistory();
  showToast(
    chatHistory[i].pinned
      ? 'Đã ghim tin nhắn! AI sẽ luôn ghi nhớ nội dung này.'
      : 'Đã bỏ ghim tin nhắn.',
    'info'
  );
};

// --- TOMBSTONE: dấu vết tin nhắn đã xóa để Smart Sync không hồi sinh từ Cloud ---
const DELETED_MSGS_KEY = 'jarvis_deleted_msgs';
const TOMBSTONE_TTL = 90 * 24 * 3600 * 1000; // giữ 90 ngày
function msgSig(m) {
  const t = String((m && m.text) || '');
  return ((m && m.role) || '') + '|' + t.length + '|' + t.slice(0, 160) + '|' + t.slice(-60);
}
function readDeletedMsgs() {
  try {
    const o = JSON.parse(ls.getItem(DELETED_MSGS_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}
function writeDeletedMsgs(map) {
  try {
    const str = JSON.stringify(map);
    ls.setItem(DELETED_MSGS_KEY, str);
    if (window.saveToNativeBridge) window.saveToNativeBridge(DELETED_MSGS_KEY, str);
  } catch (_) {}
}
function addDeletedMsgs(sessionId, msgs) {
  if (!sessionId || !Array.isArray(msgs) || !msgs.length) return;
  const map = readDeletedMsgs();
  const now = Date.now();
  const arr = Array.isArray(map[sessionId])
    ? map[sessionId].filter(x => x && x.t > now - TOMBSTONE_TTL)
    : [];
  msgs.forEach(m => {
    if (!m) return;
    const s = msgSig(m);
    if (s) arr.push({ s, t: now });
  });
  map[sessionId] = arr.slice(-800);
  writeDeletedMsgs(map);
}
function filterDeletedMsgs(sessionId, his) {
  const list = Array.isArray(his) ? his : [];
  const arr = readDeletedMsgs()[sessionId];
  if (!Array.isArray(arr) || !arr.length) return { his: list, removed: 0 };
  const sigs = new Set(arr.map(x => x.s));
  const out = list.filter(m => !sigs.has(msgSig(m)));
  return { his: out, removed: list.length - out.length };
}
function readAllDeletedMsgs() {
  return readDeletedMsgs();
}
function mergeAllDeletedMsgs(remote) {
  if (!remote || typeof remote !== 'object') return false;
  const map = readDeletedMsgs();
  const now = Date.now();
  let changed = false;
  Object.keys(remote).forEach(sid => {
    const incoming = Array.isArray(remote[sid]) ? remote[sid] : [];
    const arr = Array.isArray(map[sid]) ? map[sid].slice() : [];
    const seen = new Set(arr.map(x => x && x.s));
    incoming.forEach(x => {
      if (!x || !x.s) return;
      if ((x.t || 0) < now - TOMBSTONE_TTL) return;
      if (!seen.has(x.s)) {
        arr.push({ s: x.s, t: x.t || now });
        seen.add(x.s);
        changed = true;
      }
    });
    if (arr.length) map[sid] = arr.slice(-800);
  });
  if (changed) writeDeletedMsgs(map);
  return changed;
}
// Gọi lại khi Restore từ Cloud (js/sync.js)
window.jarvisMsgTombstones = {
  add: addDeletedMsgs,
  filter: filterDeletedMsgs,
  readAll: readAllDeletedMsgs,
  mergeAll: mergeAllDeletedMsgs,
  sig: msgSig,
};

window.deleteMsg = async i => {
  if (await window.appConfirm('Xóa tin nhắn này?')) {
    // Ghi tombstone để Smart Sync không hồi sinh tin vừa xóa từ Cloud
    if (window.jarvisMsgTombstones && chatHistory[i])
      window.jarvisMsgTombstones.add(activeId, [chatHistory[i]]);
    const keepScroll = captureChatScroll();
    chatHistory.splice(i, 1);
    const s = sessions.find(x => x.id === activeId);
    if (s) {
      const prevBot = chatHistory
        .slice()
        .reverse()
        .find(m => m.role === 'model' && m.interactionId);
      s.lastInteractionId = prevBot?.interactionId || null;
      await saveToDB(s);
    }
    await reRenderHistory();
    restoreChatScroll(keepScroll);
  }
};

window.retryMsg = async i => {
  if (isProcessing || i <= 0 || chatHistory[i - 1].role !== 'user') return;
  const up = chatHistory[i - 1].text;
  if (window.jarvisMsgTombstones)
    window.jarvisMsgTombstones.add(activeId, chatHistory.slice(Math.max(0, i - 1), i + 1));
  chatHistory.splice(i - 1, 2);
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    const prevBot = chatHistory
      .slice()
      .reverse()
      .find(m => m.role === 'model' && m.interactionId);
    s.lastInteractionId = prevBot?.interactionId || null;
    await saveToDB(s);
  }
  await reRenderHistory();
  DOM.input.value = up;
  DOM.input.dispatchEvent(new Event('input'));
  DOM.sendBtn.click();
};

window.editMsg = async i => {
  DOM.input.value = chatHistory[i].text;
  DOM.input.dispatchEvent(new Event('input'));
  if (window.jarvisMsgTombstones) window.jarvisMsgTombstones.add(activeId, chatHistory.slice(i));
  chatHistory = chatHistory.slice(0, i);
  const s = sessions.find(x => x.id === activeId);
  if (s) {
    const prevBot = chatHistory
      .slice()
      .reverse()
      .find(m => m.role === 'model' && m.interactionId);
    s.lastInteractionId = prevBot?.interactionId || null;
    await saveToDB(s);
  }
  await reRenderHistory();
};

// Xuất qua window cho các module khác và cho inline onclick trong index.html
window.msgSig = msgSig;
window.jarvisMsgTombstones = window.jarvisMsgTombstones || {
  add: addDeletedMsgs,
  filter: filterDeletedMsgs,
  readAll: readAllDeletedMsgs,
  mergeAll: mergeAllDeletedMsgs,
  sig: msgSig,
};
window.forkSessionAt = window.forkSessionAt || forkSessionAt;
