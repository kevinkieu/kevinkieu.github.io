import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadQueue() {
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/offline-queue.js'), 'utf8');
  eval(code);
  return window.__jarvisOfflineQueueCore;
}

describe('offline-queue.js', () => {
  let q;

  beforeAll(() => {
    q = loadQueue();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('thêm tin và đọc lại theo thứ tự FIFO', () => {
    const a = q.enqueue({ sessionId: 's1', text: 'tin 1', model: 'gemini-3.8-flash' });
    const b = q.enqueue({ sessionId: 's1', text: 'tin 2' });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    const items = q.list('s1');
    expect(items.map(i => i.text)).toEqual(['tin 1', 'tin 2']);
    expect(items[0].status).toBe('queued');
    expect(items[0].id).not.toBe(items[1].id);
  });

  it('lọc theo phiên và đếm tổng', () => {
    q.enqueue({ sessionId: 's1', text: 'a' });
    q.enqueue({ sessionId: 's2', text: 'b' });
    expect(q.count()).toBe(2);
    expect(q.count('s1')).toBe(1);
    expect(q.list('s2')).toHaveLength(1);
  });

  it('giới hạn 20 tin', () => {
    for (let i = 0; i < q.MAX_ITEMS; i++) q.enqueue({ sessionId: 's1', text: 'tin ' + i });
    expect(q.count()).toBe(20);
    expect(q.enqueue({ sessionId: 's1', text: 'tin 21' })).toBeNull();
    expect(q.count()).toBe(20);
  });

  it('bỏ qua tin rỗng', () => {
    expect(q.enqueue({ sessionId: 's1', text: '   ' })).toBeNull();
    expect(q.enqueue({ sessionId: 's1' })).toBeNull();
    expect(q.count()).toBe(0);
  });

  it('cập nhật trạng thái và số lần thử', () => {
    const item = q.enqueue({ sessionId: 's1', text: 'x' });
    q.update(item.id, { status: 'failed', attempts: 2, lastError: 'Failed to fetch' });
    const saved = q.list('s1')[0];
    expect(saved.status).toBe('failed');
    expect(saved.attempts).toBe(2);
    expect(saved.lastError).toBe('Failed to fetch');
  });

  it('xoá một tin và xoá cả phiên', () => {
    const a = q.enqueue({ sessionId: 's1', text: 'a' });
    q.enqueue({ sessionId: 's1', text: 'b' });
    q.enqueue({ sessionId: 's2', text: 'c' });
    expect(q.remove(a.id)).toBe(true);
    expect(q.count('s1')).toBe(1);
    expect(q.clearSession('s1')).toBe(true);
    expect(q.count('s1')).toBe(0);
    expect(q.count('s2')).toBe(1);
  });

  it('nhận diện lỗi mạng', () => {
    expect(q.isOfflineError(new Error('Failed to fetch'))).toBe(true);
    expect(q.isOfflineError(new Error('NetworkError when attempting to fetch resource'))).toBe(
      true
    );
    expect(q.isOfflineError(new Error('HTTP 401'))).toBe(false);
  });

  it('đọc lại được sau khi "khởi động lại" (dữ liệu nằm trong localStorage)', () => {
    q.enqueue({ sessionId: 's1', text: 'bền' });
    const raw = localStorage.getItem(q.KEY);
    expect(raw).toContain('bền');
    expect(q.list('s1')[0].text).toBe('bền');
  });
});
