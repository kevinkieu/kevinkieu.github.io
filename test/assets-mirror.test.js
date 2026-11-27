import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');
const ROOT_FILES = ['index.html', 'manifest.json', 'sw.js'];
const DIRS = ['js', 'css'];

function listFiles(dir, base = '') {
  const out = [];
  const abs = path.join(dir, base);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function collect() {
  const files = [];
  for (const f of ROOT_FILES) files.push(f);
  for (const dir of DIRS) {
    for (const rel of listFiles(path.join(ROOT, dir))) files.push(path.join(dir, rel));
  }
  return files;
}

describe('android assets mirror', () => {
  // Bản mirror Android phải luôn khớp web root: trước đây build chỉ copy một lần nên
  // nhiều file bị cũ hơn web (app.js/sync.js/provider-registry.js lệch hàng trăm dòng).
  it('mọi file web đều có bản sao giống hệt trong android/app/src/main/assets', () => {
    const files = collect();
    const missing = [];
    const differing = [];

    for (const rel of files) {
      const src = path.join(ROOT, rel);
      const dest = path.join(DEST, rel);
      if (!fs.existsSync(dest)) {
        missing.push(rel);
        continue;
      }
      if (!fs.readFileSync(src).equals(fs.readFileSync(dest))) differing.push(rel);
    }

    expect({ missing, differing }).toEqual({ missing: [], differing: [] });
  });

  it('không có file js/css thừa trong assets (file đã xoá ở web root)', () => {
    const expected = new Set(collect());
    const orphans = [];
    for (const dir of DIRS) {
      for (const rel of listFiles(DEST, dir)) {
        if (!expected.has(rel)) orphans.push(rel);
      }
    }
    expect(orphans).toEqual([]);
  });
});
