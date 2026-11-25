/* ==========================================================================
   Jarvis AI - Theme Scheduler (js/theme-scheduler.js)
   Tự động chuyển theme theo giờ: Sáng (light), Tối (dark), Đọc sách (sepia)
   Hỗ trợ matchMedia prefers-color-scheme + lịch trình giờ tùy chỉnh
   ========================================================================== */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const ls = window.ls || localStorage;

  // Theme modes
  const THEME_MODES = {
    auto: 'Tự động (theo giờ)',
    light: 'Sáng (Light)',
    dark: 'Tối (Dark)',
    sepia: 'Đọc sách (Sepia)',
  };

  // Default schedule (24h format)
  const DEFAULT_SCHEDULE = {
    lightStart: 6,   // 06:00 - Light mode starts
    sepiaStart: 18,  // 18:00 - Sepia/Reading mode starts
    darkStart: 22,   // 22:00 - Dark mode starts
  };

  let schedule = { ...DEFAULT_SCHEDULE };
  let currentMode = 'auto';
  let schedulerInterval = null;
  let mediaQueryListener = null;

  // Load saved settings
  function loadSettings() {
    try {
      const saved = ls.getItem('jarvis_theme_schedule');
      if (saved) {
        schedule = { ...DEFAULT_SCHEDULE, ...JSON.parse(saved) };
      }
      currentMode = ls.getItem('theme') || 'auto';
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
  function getCurrentHour() {
    return new Date().getHours();
  }

  // Determine theme based on schedule
  function getScheduledTheme() {
    const hour = getCurrentHour();
    const { lightStart, sepiaStart, darkStart } = schedule;

    // Normalize: ensure proper ordering
    if (lightStart <= sepiaStart && sepiaStart <= darkStart) {
      // Normal day: light -> sepia -> dark
      if (hour >= darkStart) return 'dark';
      if (hour >= sepiaStart) return 'sepia';
      if (hour >= lightStart) return 'light';
      return 'dark'; // Before lightStart (e.g., 0-5h) -> dark
    } else if (lightStart > darkStart) {
      // Cross midnight: dark -> light -> sepia -> dark
      if (hour >= darkStart || hour < lightStart) return 'dark';
      if (hour >= sepiaStart) return 'sepia';
      return 'light';
    } else {
      // Fallback
      if (hour >= 6 && hour < 18) return 'light';
      if (hour >= 18 && hour < 22) return 'sepia';
      return 'dark';
    }
  }

  // Apply theme to document
  function applyTheme(theme) {
    const root = document.documentElement;

    // Remove all theme classes
    root.removeAttribute('data-theme');

    // Map theme to data-theme attribute
    const themeMap = {
      light: 'light',
      dark: 'dark',
      sepia: 'sepia',
      auto: getScheduledTheme(),
    };

    const effectiveTheme = themeMap[theme] || 'auto';
    root.setAttribute('data-theme', effectiveTheme);

    // Update theme button if exists
    const btnTheme = $('btn-theme');
    if (btnTheme) {
      const icons = {
        light: '☀️',
        dark: '🌙',
        sepia: '📖',
        auto: '🤖',
      };
      const labels = {
        light: 'Sáng',
        dark: 'Tối',
        sepia: 'Đọc sách',
        auto: 'Tự động',
      };
      btnTheme.innerHTML = `${icons[theme] || '🤖'} <span class="mobile-hidden">${labels[theme] || 'Tự động'}</span>`;
      btnTheme.title = `Theme: ${THEME_MODES[theme] || 'Tự động'} (Click để đổi)`;
    }

    // Dispatch custom event for other modules
    window.dispatchEvent(new CustomEvent('theme-changed', {
      detail: { theme, effectiveTheme, schedule: { ...schedule } }
    }));
  }

  // Check and apply scheduled theme (for auto mode)
  function checkSchedule() {
    if (currentMode !== 'auto') return;
    applyTheme('auto');
  }

  // Start scheduler (runs every minute)
  function startScheduler() {
    if (schedulerInterval) clearInterval(schedulerInterval);
    checkSchedule(); // Run immediately
    schedulerInterval = setInterval(checkSchedule, 60000); // Check every minute
  }

  // Stop scheduler
  function stopScheduler() {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
  }

  // Setup matchMedia listener for system preference changes
  function setupMediaQueryListener() {
    if (mediaQueryListener) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryListener = (e) => {
      // Only react if in auto mode and no custom schedule override
      if (currentMode === 'auto') {
        // Could add logic here to respect system preference as fallback
        // For now, we stick to time-based schedule
        checkSchedule();
      }
    };

    if (mq.addEventListener) {
      mq.addEventListener('change', mediaQueryListener);
    } else if (mq.addListener) {
      mq.addListener(mediaQueryListener); // Deprecated but for Safari
    }
  }

  // Remove media query listener
  function removeMediaQueryListener() {
    if (!mediaQueryListener) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.removeEventListener) {
      mq.removeEventListener('change', mediaQueryListener);
    } else if (mq.removeListener) {
      mq.removeListener(mediaQueryListener);
    }
    mediaQueryListener = null;
  }

  // Public API
  window.ThemeScheduler = {
    init() {
      loadSettings();
      setupMediaQueryListener();
      applyTheme(currentMode);
      startScheduler();
      console.log('[ThemeScheduler] Initialized with mode:', currentMode);
    },

    setMode(mode) {
      if (!THEME_MODES[mode]) return false;
      currentMode = mode;
      saveSettings();
      applyTheme(mode);
      if (mode === 'auto') {
        startScheduler();
      } else {
        stopScheduler();
      }
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
      if (currentMode === 'auto') {
        applyTheme('auto');
      }
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
      const modes = ['auto', 'light', 'dark', 'sepia'];
      const currentIndex = modes.indexOf(currentMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      return this.setMode(modes[nextIndex]);
    },

    destroy() {
      stopScheduler();
      removeMediaQueryListener();
    },
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ThemeScheduler.init());
  } else {
    setTimeout(() => window.ThemeScheduler.init(), 0);
  }
})();