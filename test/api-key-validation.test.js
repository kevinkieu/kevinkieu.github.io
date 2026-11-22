import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadApiKeysModule() {
  const code = fs.readFileSync(path.resolve(process.cwd(), 'js/api-keys.js'), 'utf8');
  eval(code);
}

describe('api-keys.js - validateGoogleKeyFormat', () => {
  beforeAll(() => {
    loadApiKeysModule();
  });

  it('chấp nhận key chuẩn AIza…', () => {
    const res = window.validateGoogleKeyFormat('AIzaSyD-1234567890abcdefghijklmnopqrstu');
    expect(res.valid).toBe(true);
    expect(res.empty).toBe(false);
  });

  it('chấp nhận key định dạng mới AQ.…', () => {
    expect(window.validateGoogleKeyFormat('AQ.Ab8RN6J-abcdefghijk').valid).toBe(true);
  });

  it('đánh dấu rỗng nhưng không phải lỗi định dạng', () => {
    const res = window.validateGoogleKeyFormat('   ');
    expect(res.empty).toBe(true);
    expect(res.valid).toBe(false);
    expect(res.message).toBe('');
  });

  it('cảnh báo khi dán key của nhà cung cấp khác', () => {
    const res = window.validateGoogleKeyFormat('sk-or-v1-abc');
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/nhà cung cấp khác/);
  });

  it('cảnh báo key quá ngắn / sai tiền tố', () => {
    const res = window.validateGoogleKeyFormat('AIza123');
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/AIza/);
  });
});
