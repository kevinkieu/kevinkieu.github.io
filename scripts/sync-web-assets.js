#!/usr/bin/env node
/**
 * Jarvis AI - Đồng bộ web assets sang Android (nguồn duy nhất cho mọi bản build)
 *
 * Trước đây mỗi nơi tự copy một kiểu: build.js, build-apk.bat và GitHub Actions
 * (xcopy / cp -rf), nên rất dễ lệch giữa web root và android/app/src/main/assets.
 * Script này là DANH SÁCH FILE DUY NHẤT cần mirror.
 *
 * Cách dùng:
 *   node scripts/sync-web-assets.js           # đồng bộ (xoá file thừa trong assets)
 *   node scripts/sync-web-assets.js --check   # chỉ kiểm tra, exit 1 nếu lệch
 *   node scripts/sync-web-assets.js --quiet   # đồng bộ, chỉ in lỗi
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets');

// File phẳng ở gốc dự án cần có trong assets
const ROOT_FILES = ['index.html', 'manifest.json', 'sw.js'];
// Thư mục cần mirror toàn bộ (đệ quy)
const DIRS = ['js', 'css'];
// Icon: mọi file icon*.png ở gốc
const ICON_RE = /^icon.*\.png$/i;

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const QUIET = argv.includes('--quiet');

const log = msg => { if (!QUIET) console.log(msg); };

// Giữ CRLF/LF nguyên bản: so sánh theo Buffer để không báo lệch do newline
function readIfExists(p) {
  try { return fs.readFileSync(p); } catch { return null; }
}

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

// 1. Dựng danh sách nguồn -> đích
const expected = new Map(); // relDest -> absSrc

for (const file of ROOT_FILES) {
  expected.set(file, path.join(ROOT, file));
}
for (const file of fs.readdirSync(ROOT)) {
  if (ICON_RE.test(file)) expected.set(file, path.join(ROOT, file));
}
for (const dir of DIRS) {
  for (const rel of listFiles(path.join(ROOT, dir))) {
    const destRel = path.join(dir, rel);
    expected.set(destRel, path.join(ROOT, dir, rel));
  }
}

// 2. Tìm file thừa trong assets (chỉ trong các thư mục được quản lý)
const orphan = [];
for (const dir of DIRS) {
  // listFiles trả về đường dẫn ĐÃ gồm thư mục gốc (vd 'js/app.js')
  for (const destRel of listFiles(DEST, dir)) {
    if (!expected.has(destRel)) orphan.push(destRel);
  }
}
// File rác ở GỐC assets (layout build cũ từng copy phẳng js/* ra assets root)
if (fs.existsSync(DEST)) {
  for (const entry of fs.readdirSync(DEST, { withFileTypes: true })) {
    if (entry.isFile() && !expected.has(entry.name)) orphan.push(entry.name);
  }
}

// 3. So sánh nội dung
const missing = [];
const differing = [];
for (const [destRel, srcAbs] of expected) {
  const destAbs = path.join(DEST, destRel);
  const srcBuf = readIfExists(srcAbs);
  if (!srcBuf) { missing.push(`${destRel} (thiếu file nguồn)`); continue; }
  const destBuf = readIfExists(destAbs);
  if (!destBuf) missing.push(destRel);
  else if (!srcBuf.equals(destBuf)) differing.push(destRel);
}

const drift = missing.length + differing.length + orphan.length;

if (CHECK_ONLY) {
  if (!drift) {
    log(`✓ Android assets đã khớp web root (${expected.size} file).`);
    process.exit(0);
  }
  if (missing.length) console.error('✗ Thiếu trong android assets:\n  - ' + missing.join('\n  - '));
  if (differing.length) console.error('✗ Nội dung lệch (android assets cũ hơn):\n  - ' + differing.join('\n  - '));
  if (orphan.length) console.error('✗ File thừa trong android assets:\n  - ' + orphan.join('\n  - '));
  console.error('\nChạy: node scripts/sync-web-assets.js');
  process.exit(1);
}

// 4. Đồng bộ
fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
for (const rel of [...missing.map(s => s.replace(' (thiếu file nguồn)', '')), ...differing]) {
  const srcAbs = expected.get(rel);
  const destAbs = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(srcAbs, destAbs);
  copied++;
}
for (const rel of orphan) {
  fs.rmSync(path.join(DEST, rel), { force: true });
}
// Dọn thư mục rỗng lặp lại do layout cũ (vd assets/js/js)
for (const dir of DIRS) {
  const nested = path.join(DEST, dir, dir);
  if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
}
// Dọn thư mục rỗng còn lại
for (const dir of DIRS) {
  const abs = path.join(DEST, dir);
  if (!fs.existsSync(abs)) continue;
  for (const entry of fs.readdirSync(abs)) {
    const sub = path.join(abs, entry);
    if (fs.statSync(sub).isDirectory() && fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
  }
}

log(`✓ Đồng bộ android assets: ${copied} file cập nhật, ${orphan.length} file thừa đã xoá (tổng ${expected.size} file).`);
