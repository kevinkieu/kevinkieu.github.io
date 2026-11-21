/* ==========================================================================
   Jarvis AI - Blob & Share Utilities (js/blob.js)
   Helper lưu/tải/chia sẻ blob, copy clipboard - dùng chung cho web & Android.
   Hiện tại là stub; sẽ mở rộng khi cần (export PDF/Word, share file, v.v.).
   ========================================================================== */
(function () {
  'use strict';

  // --- BLOB / FILE HELPERS ---
  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveBlobViaNative(blob, filename, mimeType) {
    // Android WebView bridge sẽ ghi đè hàm này nếu có sẵn
    if (window.Android && typeof window.Android.saveFile === 'function') {
      const base64 = await blobToBase64(blob);
      return window.Android.saveFile(base64, filename, mimeType);
    }
    downloadBlob(blob, filename);
  }

  // --- SHARE API ---
  async function shareContent(data) {
    if (navigator.share) {
      try {
        await navigator.share(data);
        return true;
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('Share API failed:', e);
      }
    }
    // Fallback: copy to clipboard (không ném lỗi ra UI nếu clipboard bị chặn)
    if (data.text && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(data.text);
        return true;
      } catch (e) {
        console.warn('Clipboard fallback failed:', e);
      }
    }
    return false;
  }

  // --- CLIPBOARD HELPERS ---
  async function copyToClipboard(text, toastMsg = 'Đã copy!') {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof window.showToast === 'function') window.showToast(toastMsg, 'success');
      return true;
    } catch (e) {
      // Fallback for insecure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      if (typeof window.showToast === 'function') window.showToast(toastMsg, 'success');
      return true;
    }
  }

  // Window exports
  window.blobToBase64 = blobToBase64;
  window.base64ToBlob = base64ToBlob;
  window.downloadBlob = downloadBlob;
  window.saveBlobViaNative = saveBlobViaNative;
  window.shareContent = shareContent;
  window.copyToClipboard = copyToClipboard;

})();