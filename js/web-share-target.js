/* ==========================================================================
   Jarvis AI - Web Share Target & Shortcuts Controller
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // --- WEB SHARE TARGET MODAL ---
  function openShareTargetModal(content, detectedUrl) {
    const modal = $('share-target-modal');
    const prevBox = $('share-preview-content');
    const urlInd = $('share-url-indicator');
    const urlTxt = $('share-detected-url');
    const btnExtract = $('btn-share-extract-now');
    const btnInsert = $('btn-share-insert-input');
    const oLay = $('modal-overlay');
    const showToast = window.showToast;

    if (!modal) return;
    prevBox.innerText = content;

    if (detectedUrl) {
      urlInd.style.display = 'block';
      urlTxt.innerText = detectedUrl;
      btnExtract.style.display = 'block';
      btnExtract.onclick = async () => {
        modal.style.display = 'none';
        if (oLay) oLay.style.display = 'none';
        await processSharedUrl(detectedUrl);
      };
    } else {
      urlInd.style.display = 'none';
      btnExtract.style.display = 'none';
    }

    btnInsert.onclick = () => {
      modal.style.display = 'none';
      if (oLay) oLay.style.display = 'none';
      const input = $('user-input');
      if (input) {
        input.value = (input.value ? input.value + '\n\n' : '') + content;
        input.focus();
      }
      if (showToast) showToast('💬 Đã đưa nội dung vào ô nhập liệu!');
    };

    modal.style.display = 'block';
    if (oLay) oLay.style.display = 'block';
  }

  // --- PROCESS SHARED URL ---
  async function processSharedUrl(url) {
    const showToast = window.showToast;
    if (showToast) showToast('⏳ Đang bóc tách nội dung liên kết...', 'warning');
    try {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const yt = await window.extractYouTubeContent(url);
        const sessions = window.sessions || [];
        const activeId = window.activeId;
        const getSessionApiKey = window.getSessionApiKey;
        const FLASH_LITE_MODEL = window.FLASH_LITE_MODEL;
        const SAFETY = window.SAFETY;
        const txtContent = window.txtContent;
        const DOM = window.DOM;
        const escapeHtml = window.escapeHtml;
        const updateTokenCount = window.updateTokenCount;

        const cs = sessions.find(x => x.id === activeId);
        const k = typeof getSessionApiKey === 'function' ? getSessionApiKey(cs) : null;
        let summary = '';
        if (k && window.GoogleGenAI) {
          try {
            const res = await new window.GoogleGenAI({ apiKey: k }).models.generateContent({
              model: FLASH_LITE_MODEL,
              contents:
                'Phân tích và tóm tắt chi tiết video YouTube sau:\n- Tiêu đề: ' +
                yt.title +
                '\n- Kênh: ' +
                yt.author +
                '\n- Link: ' +
                url +
                '\n' +
                (yt.content ? yt.content : '') +
                '\nHãy nêu rõ chủ đề chính, các luận điểm nổi bật và ý nghĩa của video. Tuyệt đối KHÔNG từ chối là không xem được video.',
              config: {
                safetySettings: SAFETY,
                maxOutputTokens: 700,
                thinkingConfig: { thinkingLevel: 'minimal' },
              },
            });
            summary = res.text;
          } catch (e) {
            summary = 'Tiêu đề: ' + yt.title + ' (Kênh: ' + yt.author + ')';
          }
        } else {
          summary = 'Tiêu đề: ' + yt.title + ' (Kênh: ' + yt.author + ')';
        }
        window.txtContent +=
          '\n[YouTube: ' + yt.title + ' - ' + yt.author + ' (' + url + ')]:\n' + summary + '\n';
        if (DOM.textFileList)
          DOM.textFileList.innerHTML +=
            '📺 YouTube: ' + escapeHtml(yt.title.substring(0, 24)) + '...<br>';
      } else {
        const ext = await window.extractWebPageContent(url);
        window.txtContent +=
          '\n[Nội dung ' + url + ' qua ' + ext.source + ']:\n' + ext.content + '\n';
        const DOM = window.DOM;
        if (DOM.textFileList)
          DOM.textFileList.innerHTML +=
            '🌐 ' + ext.source + ' (' + url.substring(0, 30) + '...)<br>';
      }
      const DOM = window.DOM;
      const filesData = window.filesData || [];
      if (DOM.previewBox) DOM.previewBox.style.display = 'block';
      if (DOM.fileCount) DOM.fileCount.innerText = filesData.length + (window.txtContent ? 1 : 0);
      if (typeof updateTokenCount === 'function') updateTokenCount();
      if (showToast) showToast('✅ Đã bóc tách nội dung liên kết chia sẻ!', 'success');
    } catch (e) {
      if (showToast) showToast('Lỗi bóc tách: ' + e.message, 'danger');
    }
  }

  // --- HANDLE INCOMING WEB SHARE ---
  function handleIncomingWebShare() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action === 'live') {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (typeof window.startLiveVoiceCall === 'function') {
        setTimeout(() => window.startLiveVoiceCall(), 300);
      }
      return;
    }
    if (action === 'tts') {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (typeof window.openTTSStudioModal === 'function') {
        setTimeout(() => window.openTTSStudioModal(), 300);
      }
      return;
    }

    const shareTitle = params.get('share_title') || '';
    const shareText = params.get('share_text') || '';
    const shareUrl = params.get('share_url') || '';

    if (shareTitle || shareText || shareUrl) {
      window.history.replaceState({}, document.title, window.location.pathname);

      const parts = [];
      if (shareTitle) parts.push(shareTitle);
      if (shareText && shareText !== shareTitle) parts.push(shareText);
      if (shareUrl && !shareText.includes(shareUrl)) parts.push(shareUrl);
      const full = parts.join('\n\n').trim();

      const match = full.match(/https?:\/\/[^\s]+/i);
      const detUrl = match ? match[0] : shareUrl ? shareUrl.trim() : '';

      setTimeout(() => openShareTargetModal(full, detUrl), 400);
    }
  }

  // Expose for external access
  window.openShareTargetModal = openShareTargetModal;
  window.processSharedUrl = processSharedUrl;
  window.handleIncomingWebShare = handleIncomingWebShare;
})();
