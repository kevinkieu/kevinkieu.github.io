// Phase 4 offline-queue-ui (extracted from app.js)
let flushingOfflineQueue = false;
function renderPendingQueue() {
  const q = window.JarvisOfflineQueue;
  if (!q) return;
  const badge = $('offline-queue-badge');
  const total = q.count();
  if (badge) {
    badge.style.display = total ? 'inline-flex' : 'none';
    badge.textContent = navigator.onLine
      ? `⏳ ${total} tin chờ gửi`
      : `📴 Ngoại tuyến · ${total} tin chờ`;
    badge.title = navigator.onLine
      ? 'Tin đã xếp hàng, đang chờ gửi lại'
      : 'Mất mạng — tin sẽ tự gửi khi có mạng trở lại';
  }
  document.querySelectorAll('.pending-queue-item').forEach(el => el.remove());
  const items = q.list(activeId);
  if (!items.length || !DOM.chat) return;
  const wrap = document.createElement('div');
  wrap.className = 'pending-queue-item';
  wrap.innerHTML = items
    .map(it => {
      const failed = it.status === 'failed';
      const tone = failed ? '#ef4444' : '#f59e0b';
      return `
        <div class="pending-queue-card" style="border-color:${tone};">
          <div class="pending-queue-head">
            <span style="color:${tone};font-weight:700;">${failed ? '⚠️ Gửi lỗi' : '🕓 Chờ gửi'}</span>
            <span class="pending-queue-actions">
              <button type="button" onclick="sendQueuedNow('${it.id}')">Gửi ngay</button>
              <button type="button" onclick="dropQueuedItem('${it.id}')">Xóa</button>
            </span>
          </div>
          <div class="pending-queue-text">${escapeHtml(it.text).slice(0, 500)}</div>
          ${
            it.lastError
              ? `<div class="pending-queue-error">${escapeHtml(it.lastError).slice(0, 160)}</div>`
              : ''
          }
        </div>`;
    })
    .join('');
  DOM.chat.appendChild(wrap);
  DOM.chat.scrollTop = DOM.chat.scrollHeight;
}

window.dropQueuedItem = id => {
  window.JarvisOfflineQueue?.remove(id);
  renderPendingQueue();
};

window.sendQueuedNow = id => {
  if (!navigator.onLine) {
    showToast('Vẫn chưa có mạng — thử lại khi kết nối trở lại.', 'warning');
    return;
  }
  window.JarvisOfflineQueue?.update(id, { status: 'queued', attempts: 0, lastError: '' });
  flushOfflineQueue(true);
};

async function flushOfflineQueue(onlyFirst = false) {
  const q = window.JarvisOfflineQueue;
  if (!q || flushingOfflineQueue || isProcessing || !navigator.onLine) return;
  const items = q.list(activeId).filter(it => it.status !== 'failed');
  if (!items.length) return;
  flushingOfflineQueue = true;
  try {
    for (const item of items) {
      if (!navigator.onLine) break;
      // Chống trùng: tin đã nằm trong lịch sử (lượt trước đã gửi xong)
      if (chatHistory.slice(-5).some(m => m.role === 'user' && m.text === item.text)) {
        q.remove(item.id);
        continue;
      }
      q.update(item.id, { status: 'sending' });
      DOM.model.value = item.model || DOM.model.value;
      DOM.input.value = item.text;
      DOM.input.style.height = 'auto';
      txtContent = item.txtContent || '';
      await DOM.sendBtn.onclick();
      const stillQueued = q.list(activeId).find(it => it.id === item.id);
      if (!stillQueued) continue;
      const sentOk = chatHistory.slice(-3).some(m => m.role === 'user' && m.text === item.text);
      if (sentOk) {
        q.remove(item.id);
      } else {
        const attempts = (stillQueued.attempts || 0) + 1;
        q.update(item.id, {
          status: attempts >= q.MAX_ATTEMPTS ? 'failed' : 'queued',
          attempts,
          lastError: stillQueued.lastError || 'Không gửi được',
        });
        break; // lỗi thì dừng, không đẩy các tin sau vào tình trạng lỗi dây chuyền
      }
      if (onlyFirst) break;
    }
  } finally {
    flushingOfflineQueue = false;
    renderPendingQueue();
  }
}

window.addEventListener('online', () => {
  renderPendingQueue();
  flushOfflineQueue();
});
// Background Sync từ Service Worker: khi mạng trở lại, SW báo app flush queue
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', ev => {
    if (ev && ev.data && ev.data.type === 'FLUSH_OFFLINE_QUEUE') {
      renderPendingQueue();
      flushOfflineQueue();
    }
  });
}
window.addEventListener('offline', renderPendingQueue);
window.addEventListener('jarvis:queue-changed', () => renderPendingQueue());
// Lần đầu mở app: vẽ lại tin đang chờ và thử gửi nếu đang có mạng.
setTimeout(() => {
  renderPendingQueue();
  flushOfflineQueue();
}, 1500);

if (typeof renderPendingQueue !== 'undefined') window.renderPendingQueue = renderPendingQueue;
if (typeof flushOfflineQueue !== 'undefined') window.flushOfflineQueue = flushOfflineQueue;
