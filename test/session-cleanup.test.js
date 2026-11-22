import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadSessionCleanup() {
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/session-cleanup.js'), 'utf8');
  window.__JARVIS_DISABLE_AUTOINIT__ = true;
  eval(code);
  return window.__sessionCleanupCore;
}

describe('session-cleanup.js', () => {
  let core;
  const HOUR = 60 * 60 * 1000;
  const now = 1_700_000_000_000;

  beforeAll(() => {
    core = loadSessionCleanup();
  });

  it('đếm tin nhắn từ his và messages', () => {
    expect(core.getMessages({ his: [{}, {}] })).toHaveLength(2);
    expect(core.getMessages({ messages: [{}] })).toHaveLength(1);
    expect(core.getMessages({})).toHaveLength(0);
    expect(core.getMessages(null)).toHaveLength(0);
  });

  it('chỉ chọn phiên trống đã cũ hơn 1 giờ', () => {
    const sessions = [
      { id: 'active', his: [], updatedAt: now - 10 * HOUR },
      { id: 'empty-old', his: [], updatedAt: now - 2 * HOUR },
      { id: 'empty-new', his: [], updatedAt: now - 5 * 60 * 1000 },
      { id: 'has-messages', his: [{ text: 'hi' }], updatedAt: now - 5 * HOUR }
    ];
    const plan = core.planCleanup(sessions, { keepId: 'active', now });
    expect(plan.removeIds).toEqual(['empty-old']);
  });

  it('không bao giờ xoá phiên đang mở', () => {
    const plan = core.planCleanup(
      [{ id: 'open', his: [], updatedAt: now - 99 * HOUR }],
      { keepId: 'open', now }
    );
    expect(plan.removeIds).toEqual([]);
  });

  it('luôn giữ lại ít nhất một phiên', () => {
    const plan = core.planCleanup(
      [
        { id: 'a', his: [], updatedAt: now - 5 * HOUR },
        { id: 'b', his: [], updatedAt: now - 6 * HOUR }
      ],
      { now, minAgeMs: HOUR }
    );
    expect(plan.removeIds.length).toBeLessThanOrEqual(1);
  });

  it('bỏ qua phiên thiếu updatedAt (coi như mới, không xoá)', () => {
    const plan = core.planCleanup([{ id: 'no-date', his: [] }], { now });
    expect(plan.removeIds).toEqual([]);
  });
});
