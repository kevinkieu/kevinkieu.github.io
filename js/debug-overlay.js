/**
 * Jarvis AI - Debug Console Overlay
 * Floating debug panel for mobile: logs, errors, network, performance.
 * Sử dụng GestureManager để trigger (mặc định: 3-finger-hold).
 * Nạp sau globals.js, gesture-manager.js.
 */

(function () {
  'use strict';

  let isVisible = false;
  let logs = [];
  const MAX_LOGS = 500;
  let filterLevel = 'all'; // all, log, warn, error, info
  let autoScroll = true;
  let panel = null;
  let logContainer = null;
  let filterButtons = {};

  // Levels
  const LEVELS = {
    log: { label: 'LOG', color: '#94a3b8' },
    info: { label: 'INFO', color: '#3b82f6' },
    warn: { label: 'WARN', color: '#f59e0b' },
    error: { label: 'ERROR', color: '#ef4444' },
  };

  // Capture original console methods
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  // Override console methods
  function hookConsole() {
    ['log', 'info', 'warn', 'error'].forEach(level => {
      console[level] = function (...args) {
        // Call original
        originalConsole[level].apply(console, args);

        // Capture log
        const entry = {
          level,
          timestamp: Date.now(),
          args: args.map(formatArg),
          stack: level === 'error' ? new Error().stack : null,
        };
        addLog(entry);
      };
    });

    // Capture unhandled errors
    window.addEventListener(
      'error',
      /** @param {any} e */ e => {
        addLog({
          level: 'error',
          timestamp: Date.now(),
          args: [e.message],
          stack: e.error?.stack || e.stack,
        });
      }
    );

    window.addEventListener('unhandledrejection', e => {
      addLog({
        level: 'error',
        timestamp: Date.now(),
        args: ['Unhandled Promise Rejection: ' + (e.reason?.message || e.reason)],
        stack: e.reason?.stack,
      });
    });
  }

  function formatArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(
          arg,
          (key, value) => {
            if (key === 'stack') return value;
            if (typeof value === 'function') return '[Function]';
            if (value instanceof HTMLElement) return `[${value.tagName.toLowerCase()}]`;
            return value;
          },
          2
        );
      } catch (e) {
        return '[Object]';
      }
    }
    return String(arg);
  }

  function addLog(entry) {
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift();
    if (isVisible) renderLog(entry);
  }

  function renderLog(entry) {
    if (!logContainer) return;
    if (!shouldShow(entry.level)) return;

    const div = document.createElement('div');
    div.className = 'debug-log-entry debug-level-' + entry.level;
    div.innerHTML = `
      <span class="debug-time">${formatTime(entry.timestamp)}</span>
      <span class="debug-level">${LEVELS[entry.level].label}</span>
      <span class="debug-message">${escapeHtml(entry.args.join(' '))}</span>
      ${entry.stack ? `<div class="debug-stack">${escapeHtml(entry.stack)}</div>` : ''}
    `;
    logContainer.appendChild(div);
    if (autoScroll) logContainer.scrollTop = logContainer.scrollHeight;
  }

  function shouldShow(level) {
    return filterLevel === 'all' || filterLevel === level;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString('vi-VN', { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderAll() {
    if (!logContainer) return;
    logContainer.innerHTML = '';
    logs.filter(e => shouldShow(e.level)).forEach(renderLog);
    if (autoScroll) logContainer.scrollTop = logContainer.scrollHeight;
  }

  function createPanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'debug-overlay-panel';
    panel.innerHTML = `
      <div class="debug-header">
        <div class="debug-title">🐛 Debug Console</div>
        <div class="debug-controls">
          <div class="debug-filters">
            <button class="debug-filter-btn active" data-filter="all">All</button>
            <button class="debug-filter-btn" data-filter="log">Log</button>
            <button class="debug-filter-btn" data-filter="info">Info</button>
            <button class="debug-filter-btn" data-filter="warn">Warn</button>
            <button class="debug-filter-btn" data-filter="error">Error</button>
          </div>
          <label class="debug-autoscroll">
            <input type="checkbox" id="debug-autoscroll" checked> Auto-scroll
          </label>
          <button class="debug-btn" id="debug-clear">🗑️ Clear</button>
          <button class="debug-btn" id="debug-copy">📋 Copy</button>
          <button class="debug-btn debug-close" id="debug-close">✕</button>
        </div>
      </div>
      <div class="debug-content" id="debug-log-container"></div>
      <div class="debug-resize-handle" id="debug-resize-handle"></div>
    `;

    document.body.appendChild(panel);

    logContainer = panel.querySelector('#debug-log-container');

    // Event listeners
    panel.querySelectorAll('.debug-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.debug-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterLevel = btn.dataset.filter;
        renderAll();
      });
      filterButtons[btn.dataset.filter] = btn;
    });

    panel.querySelector('#debug-autoscroll').addEventListener('change', e => {
      autoScroll = e.target.checked;
      if (autoScroll) logContainer.scrollTop = logContainer.scrollHeight;
    });

    panel.querySelector('#debug-clear').addEventListener('click', () => {
      logs = [];
      renderAll();
    });

    panel.querySelector('#debug-copy').addEventListener('click', () => {
      const text = logs
        .filter(e => shouldShow(e.level))
        .map(e => `${formatTime(e.timestamp)} [${LEVELS[e.level].label}] ${e.args.join(' ')}`)
        .join('\n');
      navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('Đã copy log', 'success');
      });
    });

    panel.querySelector('#debug-close').addEventListener('click', hide);

    // Drag to move
    makeDraggable(panel, panel.querySelector('.debug-header'));

    // Resize handle
    makeResizable(panel, panel.querySelector('#debug-resize-handle'));

    // Initial render
    renderAll();

    return panel;
  }

  function makeDraggable(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;

    handle.addEventListener('mousedown', e => {
      if (
        e.target.tagName === 'BUTTON' ||
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'LABEL'
      )
        return;
      isDragging = true;
      offsetX = e.clientX - element.offsetLeft;
      offsetY = e.clientY - element.offsetTop;
      element.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      element.style.left = e.clientX - offsetX + 'px';
      element.style.top = e.clientY - offsetY + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      element.style.transition = '';
    });

    // Touch support
    handle.addEventListener(
      'touchstart',
      e => {
        if (
          e.target.tagName === 'BUTTON' ||
          e.target.tagName === 'INPUT' ||
          e.target.tagName === 'LABEL'
        )
          return;
        isDragging = true;
        offsetX = e.touches[0].clientX - element.offsetLeft;
        offsetY = e.touches[0].clientY - element.offsetTop;
        element.style.transition = 'none';
      },
      { passive: true }
    );

    document.addEventListener(
      'touchmove',
      e => {
        if (!isDragging) return;
        element.style.left = e.touches[0].clientX - offsetX + 'px';
        element.style.top = e.touches[0].clientY - offsetY + 'px';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
      },
      { passive: true }
    );

    document.addEventListener('touchend', () => {
      isDragging = false;
      element.style.transition = '';
    });
  }

  function makeResizable(element, handle) {
    let isResizing = false;
    let startX, startY, startW, startH;

    handle.addEventListener('mousedown', e => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = element.offsetWidth;
      startH = element.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', e => {
      if (!isResizing) return;
      const w = Math.max(300, startW + (e.clientX - startX));
      const h = Math.max(200, startH + (e.clientY - startY));
      element.style.width = w + 'px';
      element.style.height = h + 'px';
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
    });
  }

  function show() {
    if (!panel) createPanel();
    panel.style.display = 'flex';
    isVisible = true;
    renderAll();
  }

  function hide() {
    if (panel) panel.style.display = 'none';
    isVisible = false;
  }

  function toggle() {
    if (isVisible) hide();
    else show();
  }

  // Register action with GestureManager
  if (window.GestureManager) {
    window.GestureManager.registerAction('debug-overlay', data => {
      toggle();
    });
  } else {
    // Wait for GestureManager
    document.addEventListener('DOMContentLoaded', () => {
      if (window.GestureManager) {
        window.GestureManager.registerAction('debug-overlay', data => {
          toggle();
        });
      }
    });
  }

  // Init
  function init() {
    hookConsole();
    console.log('[DebugOverlay] Initialized. Gesture: 3-finger-hold (500ms)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Public API
  window.DebugOverlay = {
    show,
    hide,
    toggle,
    addLog,
    clear: () => {
      logs = [];
      renderAll();
    },
    getLogs: () => logs,
    setFilter: level => {
      filterLevel = level;
      renderAll();
    },
  };
})();
