/* ==========================================================================
   Jarvis AI - Thông báo (toast + Notification API) tách từ app.js (Giai đoạn 6)
   ========================================================================== */
(function () {
  'use strict';
  let tTO;

  function showToast(m, t = 'success') {
    clearTimeout(tTO);
    DOM.toast.innerText = m;
    DOM.toast.className = `toast ${t} show`;
    tTO = setTimeout(() => DOM.toast.classList.remove('show'), 3200);
  }

  async function notifyUser(title, body, tag) {
    try {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return false;
      }
      if (Notification.permission !== 'granted') return false;
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: title || 'Jarvis AI',
          body: body || '',
          tag: tag || 'jarvis',
        });
        return true;
      }
      new Notification(title || 'Jarvis AI', { body: body || '', tag: tag || 'jarvis' });
      return true;
    } catch (e) {
      console.warn('[notifyUser] lỗi:', e);
      return false;
    }
  }

  window.showToast = showToast;
  window.notifyUser = notifyUser;
})();
