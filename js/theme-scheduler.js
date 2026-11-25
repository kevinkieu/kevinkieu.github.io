/* ==========================================================================
   Jarvis AI - Theme Scheduler (js/theme-scheduler.js)
   Tự động chuyển theme theo giờ: Sáng (light), Tối (dark), Đọc sách (sepia)
   Lịch giờ tùy chỉnh, hỗ trợ cả khung giờ chạy qua nửa đêm
   ========================================================================== */

(function () {
  'use strict';

  const $ = window.$;
  const ls = window.ls;

  const THEME_ICONS = { auto: '🤖', light: '☀️', dark: '🌙', sepia: '📖' };

  // Theme modes
  const THEME_MODES = {
    auto: 'Tự động (theo giờ)',
    light: 'Sáng (Light)',
    dark: 'Tối (Dark)',
    sepia: 'Đọc sách (Sepia)',
  };

  // Default schedule (24h format)
  const DEFAULT_SCHEDULE = {
    lightStart: 6, // 06:00 - Light mode starts
    sepiaStart: 18, // 18:00 - Sepia/Reading mode starts
    darkStart: 22, // 22:00 - Dark mode starts
  };

  let schedule = { ...DEFAULT_SCHEDULE };
  let currentMode = 'auto';
  let schedulerInterval = null;

  // Load saved settings
  function loadSettings() {
    try {
      const saved = ls.getItem('jarvis_theme_schedule');
      if (saved) {
        schedule = { ...DEFAULT_SCHEDULE, ...JSON.parse(saved) };
      }
      const savedMode = ls.getItem('theme');
      currentMode = THEME_MODES[savedMode] ? savedMode : 'auto';
    } catch (e) {
      console.warn('[ThemeScheduler] Load settings failed:', e);
    }
  }

  // Save settings
  function saveSettings() {
    try {
      ls.setItem('jarvis_theme_schedule', JSON.stringify(schedule));
      ls.setItem('theme', currentMode);
    } catch (e) {
      console.warn('[ThemeScheduler] Save settings failed:', e);
    }
  }

  // Get current hour (0-23)

  // Chu kỳ light → sepia → dark → light; mỗi mốc có thể nằm qua nửa đêm
  function getScheduledTheme() {
    const hour = new Date().getHours();
    const { lightStart, sepiaStart, darkStart } = schedule;

    const inRange = (start, end) =>
      start <= end ? hour >= start && hour < end : hour >= start || hour < end;

    if (inRange(lightStart, sepiaStart)) return 'light';
    if (inRange(sepiaStart, darkStart)) return 'sepia';
    return 'dark';
  }

  // Apply theme to document
  function applyTheme(theme) {
    const root = document.documentElement;
    const mode = THEME_MODES[theme] ? theme : 'auto';
    const effectiveTheme = mode === 'auto' ? getScheduledTheme() : mode;
    root.setAttribute('data-theme', effectiveTheme);

    const btnTheme = $('btn-theme');
    if (btnTheme) {
      btnTheme.innerHTML = `${THEME_ICONS[mode]} <span class="mobile-hidden">${THEME_MODES[mode].split(' (')[0]}</span>`;
      btnTheme.title = `Theme: ${THEME_MODES[mode]} (Click để đổi)`;
    }

    window.dispatchEvent(
      new CustomEvent('theme-changed', {
        detail: { theme: mode, effectiveTheme, schedule: { ...schedule } },
      })
    );
  }

  function refreshScheduler() {
    clearInterval(schedulerInterval);
    schedulerInterval =
      currentMode === 'auto' ? setInterval(() => applyTheme('auto'), 60000) : null;
  }

  // Public API
  window.ThemeScheduler = {
    init() {
      loadSettings();
      applyTheme(currentMode);
      refreshScheduler();
    },

    setMode(mode) {
      if (!THEME_MODES[mode]) return false;
      currentMode = mode;
      saveSettings();
      applyTheme(mode);
      refreshScheduler();
      return true;
    },

    getMode() {
      return currentMode;
    },

    getEffectiveTheme() {
      if (currentMode === 'auto') return getScheduledTheme();
      return currentMode;
    },

    setSchedule(newSchedule) {
      schedule = { ...schedule, ...newSchedule };
      saveSettings();
      if (currentMode === 'auto') applyTheme('auto');
      return schedule;
    },

    getSchedule() {
      return { ...schedule };
    },

    getModes() {
      return { ...THEME_MODES };
    },

    // Cycle through modes (for theme button click)
    cycleMode() {
      const modes = Object.keys(THEME_MODES);
      const currentIndex = modes.indexOf(currentMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      return this.setMode(modes[nextIndex]);
    },

    destroy() {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    },
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ThemeScheduler.init());
  } else {
    setTimeout(() => window.ThemeScheduler.init(), 0);
  }
})();
