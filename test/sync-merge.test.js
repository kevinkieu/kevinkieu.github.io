import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

beforeAll(() => {
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/sync-merge.js'), 'utf8');
  new Function(code)();
});

const msg = (id, text, role = 'user') => ({ id, role, text });
const session = (id, his, extra = {}) => ({ id, his, name: id, ...extra });

describe('SyncMerge.mergeMessages', () => {
  it('hợp nhất tin của hai máy, không bên nào mất tin', () => {
    const local = [msg('a', '1'), msg('c', '3')];
    const remote = [msg('a', '1'), msg('b', '2'), msg('d', '4')];
    const r = window.SyncMerge.mergeMessages(local, remote);
    expect(r.his.map(m => m.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(r.changed).toBe(true);
    expect(r.localAhead).toBe(true); // 'c' chưa có trên Cloud
  });

  it('không nhân đôi tin không có id (cùng nội dung)', () => {
    const local = [{ role: 'user', text: 'hello' }];
    const remote = [{ role: 'user', text: 'hello' }];
    const r = window.SyncMerge.mergeMessages(local, remote);
    expect(r.his).toHaveLength(1);
    expect(r.changed).toBe(false);
  });

  it('prune (tombstone) loại tin đã xóa ở cả hai phía', () => {
    const local = [msg('a', '1'), msg('x', 'deleted')];
    const remote = [msg('a', '1'), msg('x', 'deleted'), msg('b', '2')];
    const r = window.SyncMerge.mergeMessages(local, remote, his => his.filter(m => m.id !== 'x'));
    expect(r.his.map(m => m.id)).toEqual(['a', 'b']);
  });
});

describe('SyncMerge.mergeSessions', () => {
  it('giữ tin mới của cả hai máy trong cùng một phiên', () => {
    const local = [session('s1', [msg('a', '1'), msg('b', '2')], { updatedAt: 100 })];
    const remote = [session('s1', [msg('a', '1'), msg('c', '3')], { updatedAt: 200 })];
    const r = window.SyncMerge.mergeSessions(local, remote);
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0].his.map(m => m.id)).toEqual(['a', 'b', 'c']);
    expect(r.sessions[0].updatedAt).toBe(200);
    expect(r.localAhead).toBe(true);
  });

  it('bỏ phiên đã xóa (tombstone) ở cả local và cloud', () => {
    const local = [session('s1', []), session('gone', [])];
    const remote = [session('s1', []), session('gone', [])];
    const r = window.SyncMerge.mergeSessions(local, remote, {
      deletedSessionIds: ['gone'],
    });
    expect(r.sessions.map(s => s.id)).toEqual(['s1']);
  });

  it('phiên chỉ có ở máy này được đánh dấu cần đẩy lên', () => {
    const r = window.SyncMerge.mergeSessions([session('new', [msg('a', '1')])], []);
    expect(r.localAhead).toBe(true);
    expect(r.sessions).toHaveLength(1);
  });
});

describe('SyncMerge.mergeMedications', () => {
  it('bản updatedAt mới hơn thắng, không xóa thuốc chỉ vì thiếu ở bản kia', () => {
    const local = [
      { id: 'm1', name: 'A', updatedAt: 100 },
      { id: 'm2', name: 'B', updatedAt: 50 },
    ];
    const remote = [{ id: 'm1', name: 'A-mới', updatedAt: 200 }];
    const r = window.SyncMerge.mergeMedications(local, remote);
    const byId = Object.fromEntries(r.medications.map(m => [m.id, m]));
    expect(byId.m1.name).toBe('A-mới');
    expect(byId.m2.name).toBe('B');
    expect(r.changed).toBe(true);
  });

  it('tombstone chặn thuốc hồi sinh từ Cloud', () => {
    const r = window.SyncMerge.mergeMedications(
      [{ id: 'm1', name: 'A', updatedAt: 100 }],
      [{ id: 'm1', name: 'A', updatedAt: 100 }],
      { deletedMedIds: ['m1'] }
    );
    expect(r.medications).toHaveLength(0);
  });

  it('sửa thuốc ở máy này (updatedAt mới hơn) được đẩy lên Cloud', () => {
    const r = window.SyncMerge.mergeMedications(
      [{ id: 'm1', name: 'Mới', updatedAt: 300 }],
      [{ id: 'm1', name: 'Cũ', updatedAt: 100 }]
    );
    expect(r.medications[0].name).toBe('Mới');
    expect(r.localAhead).toBe(true);
  });
});

describe('SyncMerge.mergeMedHistory', () => {
  it('hợp nhất lịch sử, không mất cữ đã uống của máy kia', () => {
    const local = [{ id: 'h1', medId: 'm1', timeStr: '08:00', date: '2026-01-01', timestamp: 1 }];
    const remote = [{ id: 'h2', medId: 'm1', timeStr: '20:00', date: '2026-01-01', timestamp: 2 }];
    const r = window.SyncMerge.mergeMedHistory(local, remote);
    expect(r.history.map(h => h.id).sort()).toEqual(['h1', 'h2']);
  });
});
