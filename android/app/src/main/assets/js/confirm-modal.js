/* ==========================================================================
   Jarvis AI - Custom confirm/prompt modal (thay thế window.confirm/prompt)
   Trả về Promise: appConfirm(msg) -> boolean, appPrompt(msg, default) -> string|null
   ========================================================================== */
(function () {
  'use strict';

  let modal = null;
  let msgEl = null;
  let inputWrap = null;
  let inputEl = null;
  let okBtn = null;
  let cancelBtn = null;
  let resolver = null;
  const queue = [];

  function ensure() {
    if (modal) return;
    modal = document.createElement('div');
    modal.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.45);z-index:99999;padding:16px;';

    const box = document.createElement('div');
    box.style.cssText =
      'background:var(--bg-card,#ffffff);color:var(--text-main,#0f172a);' +
      'border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:16px;' +
      'max-width:90vw;width:380px;box-shadow:var(--shadow-lg,0 10px 25px rgba(0,0,0,.2));';

    msgEl = document.createElement('div');
    msgEl.style.cssText = 'margin-bottom:12px;white-space:pre-wrap;line-height:1.45;';

    inputWrap = document.createElement('div');
    inputWrap.style.display = 'none';
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.style.cssText =
      'width:100%;padding:8px 10px;border:1px solid var(--border,#e2e8f0);' +
      'border-radius:8px;margin-bottom:12px;background:var(--input-bg,#f8fafc);' +
      'color:var(--text-main,#0f172a);';
    inputWrap.appendChild(inputEl);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Hủy';
    cancelBtn.style.cssText =
      'padding:6px 12px;border:1px solid var(--border,#e2e8f0);border-radius:8px;' +
      'background:transparent;color:var(--text-main,#0f172a);cursor:pointer;';

    okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = 'OK';
    okBtn.style.cssText =
      'padding:6px 12px;border:none;border-radius:8px;background:var(--primary,#2563eb);' +
      'color:#ffffff;cursor:pointer;';

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    box.appendChild(msgEl);
    box.appendChild(inputWrap);
    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);

    okBtn.addEventListener('click', function () {
      const value = inputWrap.style.display === 'none' ? true : inputEl.value;
      close(value);
    });
    cancelBtn.addEventListener('click', function () {
      close(inputWrap.style.display === 'none' ? false : null);
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        close(inputWrap.style.display === 'none' ? false : null);
      }
    });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        okBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });
  }

  function close(value) {
    if (!modal) return;
    modal.style.display = 'none';
    const r = resolver;
    resolver = null;
    if (typeof r === 'function') r(value);
    pump();
  }

  function pump() {
    if (resolver || queue.length === 0) return;
    const job = queue.shift();
    resolver = job.resolve;
    msgEl.textContent = job.message || '';
    if (job.type === 'prompt') {
      inputWrap.style.display = '';
      inputEl.value = job.defaultValue == null ? '' : String(job.defaultValue);
      cancelBtn.style.display = '';
      okBtn.textContent = 'OK';
    } else {
      inputWrap.style.display = 'none';
      cancelBtn.style.display = '';
      okBtn.textContent = 'OK';
    }
    modal.style.display = 'flex';
    if (job.type === 'prompt') {
      setTimeout(function () {
        try {
          inputEl.focus();
          inputEl.select();
        } catch (_) {}
      }, 0);
    } else {
      setTimeout(function () {
        try {
          okBtn.focus();
        } catch (_) {}
      }, 0);
    }
  }

  function show(type, message, defaultValue) {
    return new Promise(function (resolve) {
      queue.push({ type: type, message: message, defaultValue: defaultValue, resolve: resolve });
      pump();
    });
  }

  window.appConfirm = function (message) {
    return show('confirm', message).then(function (v) {
      return v === true;
    });
  };
  window.appPrompt = function (message, defaultValue) {
    return show('prompt', message, defaultValue);
  };
})();
