/* ==========================================================================
   Jarvis AI - Đo hiệu năng khởi động (js/perf-marks.js)

   Script cổ điển, nạp ngay đầu chuỗi script ở cuối <body>, trước mọi module.
   Ghi lại các mốc thời gian để so sánh trước/sau khi tối ưu:

     JarvisPerf.mark('globals-ready')   -> thời điểm globals.js chạy xong
     JarvisPerf.mark('app-ready')       -> app.js chạy xong (đã gắn handler Gửi)
     JarvisPerf.mark('first-render')    -> vẽ xong lịch sử chat lần đầu
     JarvisPerf.mark('lazy:tts')        -> module tải theo nhu cầu

   Xem báo cáo: JarvisPerf.report()
   ========================================================================== */
(function () {
  'use strict';

  const t0 = performance.now();
  const marks = Object.create(null);

  // Long task: > 50ms chặn main thread (nguyên nhân chính của cảm giác "chậm")
  let longTasks = 0;
  let longTaskMs = 0;
  try {
    if (typeof PerformanceObserver === 'function') {
      const obs = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          longTasks++;
          longTaskMs += entry.duration;
        }
      });
      obs.observe({ type: 'longtask', buffered: true });
    }
  } catch (_) {}

  function mark(name, extra) {
    const at = performance.now();
    marks[name] = Math.round(at);
    try {
      performance.mark('jarvis:' + name);
    } catch (_) {}
    if (extra && typeof extra === 'object') marks[name + ':meta'] = extra;
    return marks[name];
  }

  function duration(from, to) {
    const a = marks[from];
    const b = to ? marks[to] : Math.round(performance.now());
    return a === undefined || b === undefined ? null : b - a;
  }

  function report() {
    /** @type {any} */
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const js = res.filter(r => /\.js(\?|$)/.test(r.name));
    const localJs = js.filter(r => r.name.includes(location.host));
    const cdnJs = js.filter(r => !r.name.includes(location.host));
    const bytes = list => list.reduce((s, r) => s + (r.decodedBodySize || 0), 0);
    return {
      url: location.href,
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEnd: Math.round(nav.loadEventEnd || 0),
      marks,
      durations: {
        'html->globals-ready': duration('html', 'globals-ready'),
        'globals->app-ready': duration('globals-ready', 'app-ready'),
        'app-ready->first-render': duration('app-ready', 'first-render'),
        'html->first-render': duration('html', 'first-render'),
      },
      scripts: {
        localCount: localJs.length,
        localBytes: bytes(localJs),
        cdnCount: cdnJs.length,
        cdnBytes: bytes(cdnJs),
      },
      longTasks: { count: longTasks, totalMs: Math.round(longTaskMs) },
      totalElapsed: Math.round(performance.now() - t0),
    };
  }

  window.JarvisPerf = { t0, marks, mark, report, duration };
  window.JarvisPerf.mark('html');
})();
