/* ==========================================================================
   Jarvis AI - Failover model dự phòng

   Khi provider hiện tại hết quota / quá tải / không kết nối được, app tự chuyển
   sang model kế tiếp trong chuỗi dự phòng thay vì bỏ cả lượt. Module này chỉ là
   LOGIC THUẦN (không đụng DOM, không gọi mạng); phần nối vào luồng gửi tin nằm
   trong js/app.js (`switchToFailoverModel`).

   Quy tắc:
   - Chỉ failover khi lỗi thuộc dạng tạm thời (429/5xx/quá tải/mất mạng).
     401/403/400 là lỗi cấu hình hoặc key sai -> giữ nguyên thông báo cũ.
   - Tối đa MAX_MODELS_PER_TURN model cho một lượt, và chỉ trong BUDGET_MS kể từ
     lúc bắt đầu lượt (tránh người dùng phải chờ quá lâu).
   - Chuỗi dự phòng lấy từ window.FAILOVER_CHAINS (js/model-registry.js); model
     không khai báo (mọi model gateway) dùng chuỗi mặc định Gemini Flash Lite.
   ========================================================================== */
(function () {
  'use strict';

  const DEFAULT_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  const DEFAULT_TARGET = DEFAULT_CHAIN[0];
  // Ngân sách chờ cho toàn bộ lượt khi phải đổi model (22s ~ 20-25s đã chốt).
  const BUDGET_MS = 22000;
  // Số model tối đa được thử trong một lượt (model gốc + dự phòng).
  const MAX_MODELS_PER_TURN = 3;

  const RETRYABLE_STATUS = [402, 408, 409, 425, 429, 500, 502, 503, 504, 529];
  const RETRYABLE_TEXT =
    /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|rate.?limit|too many requests|quota/i;
  const NETWORK_TEXT =
    /failed to fetch|networkerror|network error|load failed|fetch failed|econnreset|etimedout|timed out|timeout/i;
  const STATUS_TEXT = /\b(402|408|409|425|429|500|502|503|504|529)\b/;

  const isModelId = v => typeof v === 'string' && v.trim().length > 0;

  /**
   * Lỗi này có đáng để đổi sang model khác không?
   * @param {number|string} status HTTP status (0 nếu không có)
   * @param {string} message thông báo lỗi
   */
  function isFailoverable(status, message) {
    const code = Number(status) || 0;
    if (RETRYABLE_STATUS.includes(code)) return true;
    const msg = String(message || '');
    if (!msg) return false;
    if (NETWORK_TEXT.test(msg)) return true;
    if (RETRYABLE_TEXT.test(msg)) return true;
    return STATUS_TEXT.test(msg);
  }

  /** Chuỗi model dự phòng của một model (đã bỏ chính nó). */
  function chainFor(modelId) {
    const chains = (typeof window !== 'undefined' && window.FAILOVER_CHAINS) || {};
    const own = chains[modelId];
    const list = Array.isArray(own) && own.length ? own : DEFAULT_CHAIN;
    return list.filter(m => isModelId(m) && m !== modelId);
  }

  /**
   * Model kế tiếp chưa thử, hoặc null khi đã cạn chuỗi / chạm trần số model.
   * @param {string} modelId model đang dùng
   * @param {Set<string>|string[]} tried các model đã thử trong lượt
   */
  function nextTarget(modelId, tried) {
    const triedSet = tried instanceof Set ? tried : new Set(Array.isArray(tried) ? tried : []);
    if (triedSet.size >= MAX_MODELS_PER_TURN) return null;
    const candidates = chainFor(modelId).filter(m => !triedSet.has(m));
    return candidates.length ? candidates[0] : null;
  }

  /** Trạng thái failover của một lượt gửi. */
  function createState(modelId, now) {
    const at = Number.isFinite(now) ? now : Date.now();
    return { startedAt: at, budgetMs: BUDGET_MS, tried: new Set([modelId]) };
  }

  /** Còn trong ngân sách thời gian của lượt? */
  function withinBudget(state, now) {
    if (!state) return false;
    const at = Number.isFinite(now) ? now : Date.now();
    const budget = Number(state.budgetMs) > 0 ? state.budgetMs : BUDGET_MS;
    return at - state.startedAt < budget;
  }

  const core = {
    DEFAULT_CHAIN,
    DEFAULT_TARGET,
    BUDGET_MS,
    MAX_MODELS_PER_TURN,
    isFailoverable,
    chainFor,
    nextTarget,
    createState,
    withinBudget,
  };

  window.JarvisFailover = core;
  // Dành cho test (giống __sessionCleanupCore).
  window.__jarvisFailoverCore = core;
})();
