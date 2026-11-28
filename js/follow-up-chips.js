/* ==========================================================================
   Jarvis AI - Smart Follow-Up Questions Generator
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // --- RENDER FOLLOW-UP CHIPS ---
  function renderFollowUpChips(lines) {
    if (!lines || !lines.length) return null;
    const fBox = document.createElement('div');
    fBox.className = 'follow-up-container';
    const escapeHtml =
      window.escapeHtml ||
      function (str) {
        return String(str || '')
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"');
      };
    fBox.innerHTML =
      '\n      <span class="follow-up-title">💡 Gợi ý câu hỏi tiếp theo:</span>\n      ' +
      lines
        .map(function (q) {
          return (
            '<button class="follow-up-chip" type="button"><span>👉</span> ' +
            escapeHtml(q) +
            '</button>'
          );
        })
        .join('') +
      '\n    ';
    fBox.querySelectorAll('.follow-up-chip').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        const query = btn.innerText.replace(/^👉\s*/, '').trim();
        fBox.remove();
        const input = $('user-input');
        if (input) {
          input.value = query;
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
        const sendBtn = $('send-button');
        if (sendBtn) sendBtn.click();
      };
    });
    return fBox;
  }

  // --- GENERATE FOLLOW-UP SUGGESTIONS ---
  async function generateFollowUpSuggestions(userPrompt, botReply, botContainer) {
    if (!botReply || botReply.trim().length < 4) return;

    try {
      const sessions = window.sessions || [];
      const activeId = window.activeId;
      const apiKeys = window.apiKeys || [];
      const getSessionApiKey = window.getSessionApiKey;
      const FLASH_LITE_MODEL = window.FLASH_LITE_MODEL;
      const SAFETY = window.SAFETY;
      const DOM = window.DOM;
      const escapeHtml = window.escapeHtml;

      const cs = sessions.find(x => x.id === activeId);
      const k =
        (typeof getSessionApiKey === 'function' ? getSessionApiKey(cs) : null) ||
        (apiKeys.length ? apiKeys[0] : '');
      if (!k) return;

      if (!window.GoogleGenAI) return;
      const ai = new window.GoogleGenAI({ apiKey: k });
      const targetModel = FLASH_LITE_MODEL;

      const res = await ai.models.generateContent({
        model: targetModel,
        contents:
          'Bạn là trợ lý AI thông minh. Dựa vào đối thoại vừa rồi:\nNgười dùng: "' +
          (userPrompt || '').slice(0, 150) +
          '"\nAI: "' +
          botReply.slice(0, 250) +
          '"\nHãy gợi ý đúng 3 câu hỏi tiếp theo thật ngắn gọn bằng tiếng Việt (mỗi câu tối đa 8 từ, mỗi câu trên 1 dòng, không đánh số, không gạch đầu dòng, không giải thích gì thêm) để người dùng có thể bấm vào hỏi tiếp:',
        config: {
          safetySettings: SAFETY,
          maxOutputTokens: 350,
          temperature: 0.7,
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      });

      let text = '';
      try {
        text = res.text || '';
      } catch (_) {}
      if (
        !text &&
        res.candidates &&
        res.candidates[0] &&
        res.candidates[0].content &&
        res.candidates[0].content.parts
      ) {
        text = res.candidates[0].content.parts
          .map(function (p) {
            return p.text || '';
          })
          .join('\n')
          .trim();
      }

      const lines = text
        .split('\n')
        .map(function (l) {
          return l.replace(/^[-*0-9.)\s👉💡]+/, '').trim();
        })
        .filter(function (l) {
          return l.length >= 2 && l.length <= 60;
        })
        .slice(0, 3);

      if (lines.length > 0) {
        document.querySelectorAll('.follow-up-container').forEach(function (el) {
          el.remove();
        });
        const fBox = renderFollowUpChips(lines);
        const container = botContainer || DOM.chat.querySelector('.message-container:last-child');
        const target =
          (container && container.querySelector('.msg-content')) ||
          (container && container.querySelector('.bot-message')) ||
          container;
        if (fBox && target) {
          target.appendChild(fBox);
        }
      }
    } catch (err) {
      console.warn('Lỗi tạo follow-up suggestions:', err);
    }
  }

  // Expose for external access
  window.renderFollowUpChips = renderFollowUpChips;
  window.generateFollowUpSuggestions = generateFollowUpSuggestions;
})();
