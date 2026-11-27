/* ==========================================================================
   Jarvis AI - Backoff reconnect helper (exponential + jitter)
   Dùng cho WebSocket/fetch retry: tránh spam reconnect, giảm rate-limit.
   ========================================================================== */
(function () {
  'use strict';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // delay = min(maxDelay, base * 2^attempt) + jitter(0..jitter)
  function delayFor(attempt, opts) {
    const o = opts || {};
    const base = o.base || 1000;
    const max = o.max || 30000;
    const jitter = o.jitter || 500;
    const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
    return exp + Math.floor(Math.random() * (jitter + 1));
  }

  /**
   * Retry một async function với backoff.
   * @param {Function} fn async () => result
   * @param {Object} opts { retries, base, max, jitter, shouldRetry(err), onRetry(attempt, err, delay) }
   */
  async function retry(fn, opts) {
    const o = opts || {};
    const retries = Number.isFinite(o.retries) ? o.retries : 5;
    const shouldRetry =
      typeof o.shouldRetry === 'function'
        ? o.shouldRetry
        : err => {
            const msg = String((err && err.message) || err || '');
            if (/network|failed to fetch|timeout|5\d\d|429/i.test(msg)) return true;
            return false;
          };
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt >= retries || !shouldRetry(err)) throw err;
        const d = delayFor(attempt, o);
        if (typeof o.onRetry === 'function') {
          try {
            o.onRetry(attempt + 1, err, d);
          } catch {}
        }
        await sleep(d);
      }
    }
    throw lastErr;
  }

  // WebSocket reconnect scheduler: trả về object { schedule(fn), cancel(), reset() }
  function createReconnectScheduler(opts) {
    const o = opts || {};
    let attempt = 0;
    let timer = null;
    let cancelled = false;
    return {
      schedule(connectFn) {
        if (cancelled) return;
        if (timer) clearTimeout(timer);
        const d = delayFor(attempt, o);
        attempt++;
        timer = setTimeout(() => {
          timer = null;
          if (cancelled) return;
          try {
            connectFn();
          } catch (e) {
            console.warn('[Backoff] reconnect fn lỗi:', e);
          }
        }, d);
        return d;
      },
      reset() {
        attempt = 0;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      cancel() {
        cancelled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
    };
  }

  const core = { sleep, delayFor, retry, createReconnectScheduler };
  window.JarvisBackoff = core;
  window.__jarvisBackoffCore = core;
})();
