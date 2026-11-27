import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadFailover() {
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/failover.js'), 'utf8');
  // js/failover.js là IIFE gắn lên window, eval trong jsdom là đủ.
  eval(code);
  return window.__jarvisFailoverCore;
}

describe('failover.js', () => {
  let core;

  beforeAll(() => {
    core = loadFailover();
  });

  describe('isFailoverable', () => {
    it('nhận lỗi tạm thời theo HTTP status', () => {
      expect(core.isFailoverable(429, '')).toBe(true);
      expect(core.isFailoverable(503, '')).toBe(true);
      expect(core.isFailoverable(502, '')).toBe(true);
      expect(core.isFailoverable(402, '')).toBe(true);
    });

    it('nhận lỗi qua thông báo khi không có status', () => {
      expect(core.isFailoverable(0, 'Failed to fetch')).toBe(true);
      expect(core.isFailoverable(0, 'RESOURCE_EXHAUSTED: quota exceeded')).toBe(true);
      expect(core.isFailoverable(0, 'Gemini trả HTTP 503')).toBe(true);
      expect(core.isFailoverable(0, 'The model is overloaded')).toBe(true);
    });

    it('không failover với lỗi cấu hình / key sai', () => {
      expect(core.isFailoverable(401, 'Unauthorized')).toBe(false);
      expect(core.isFailoverable(403, 'Forbidden')).toBe(false);
      expect(core.isFailoverable(400, 'API key not valid')).toBe(false);
      expect(core.isFailoverable(0, 'Invalid model name')).toBe(false);
      expect(core.isFailoverable(0, '')).toBe(false);
    });
  });

  describe('chainFor / nextTarget', () => {
    it('model không khai báo dùng chuỗi mặc định Gemini Flash Lite', () => {
      expect(core.chainFor('nvidia/some-model')).toEqual([
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
      ]);
      expect(core.nextTarget('openrouter/x', new Set(['openrouter/x']))).toBe(
        'gemini-3.5-flash-lite'
      );
    });

    it('bỏ qua model đã thử', () => {
      const tried = new Set(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
      expect(core.nextTarget('gemini-3.8-flash', tried)).toBe('gemini-3.1-flash-lite');
    });

    it('dừng khi chạm trần 3 model mỗi lượt', () => {
      const tried = new Set(['a', 'b', 'c']);
      expect(core.nextTarget('a', tried)).toBeNull();
      expect(core.MAX_MODELS_PER_TURN).toBe(3);
    });

    it('không trả về chính model đang dùng', () => {
      expect(core.chainFor('gemini-3.5-flash-lite')).toEqual(['gemini-3.1-flash-lite']);
    });

    it('hết chuỗi thì trả null', () => {
      const tried = new Set(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
      expect(core.nextTarget('gemini-3.5-flash-lite', tried)).toBeNull();
    });
  });

  describe('ngân sách thời gian', () => {
    it('createState ghi model gốc vào danh sách đã thử', () => {
      const state = core.createState('gemini-3.8-flash', 1000);
      expect(state.tried.has('gemini-3.8-flash')).toBe(true);
      expect(state.budgetMs).toBe(core.BUDGET_MS);
      expect(core.BUDGET_MS).toBe(22000);
    });

    it('withinBudget đúng theo mốc thời gian', () => {
      const state = core.createState('gemini-3.8-flash', 10_000);
      expect(core.withinBudget(state, 10_000 + 21_999)).toBe(true);
      expect(core.withinBudget(state, 10_000 + 22_000)).toBe(false);
      expect(core.withinBudget(null, 0)).toBe(false);
    });
  });
});
