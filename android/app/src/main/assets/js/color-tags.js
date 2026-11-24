/* ==========================================================================
   Jarvis AI - Color Tags Controller
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  function initColorTags() {
    document.querySelectorAll('#session-color-picker .color-chip-btn').forEach(chip => {
      chip.onclick = async () => {
        const color = chip.getAttribute('data-color');
        const sessions = window.sessions || [];
        const activeId = window.activeId;
        const saveToDB = window.saveToDB;
        const renderSel = window.renderSel;
        const renderTabs = window.renderTabs;
        const showToast = window.showToast;
        const s = sessions.find(x => x.id === activeId);
        if (s && saveToDB) {
          s.color = color === 'none' ? null : color;
          await saveToDB(s);
          updateColorPickerUI();
          if (renderSel) renderSel();
          if (renderTabs) renderTabs();
          if (showToast) showToast('Đã gán nhãn màu phiên!');
        }
      };
    });
  }

  function updateColorPickerUI() {
    const sessions = window.sessions || [];
    const activeId = window.activeId;
    const s = sessions.find(x => x.id === activeId);
    const curColor = s?.color || 'none';
    document.querySelectorAll('#session-color-picker .color-chip-btn').forEach(chip => {
      const c = chip.getAttribute('data-color');
      chip.classList.toggle('active', c === curColor);
    });
  }

  // Expose functions for other modules
  window.updateColorPickerUI = updateColorPickerUI;
  window.initColorTags = initColorTags;
})();
