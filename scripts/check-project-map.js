#!/usr/bin/env node
/**
 * Jarvis AI - Kiểm tra boicanhduan.json có còn khớp với cây file thật không
 *
 * Bản đồ dự án rất dễ lệch: thêm file mới mà quên mô tả, xoá/đổi tên file mà
 * bản đồ vẫn trỏ tới đường dẫn cũ. Script này bắt cả hai chiều, giống tinh thần
 * của scripts/sync-web-assets.js --check.
 *
 * Cách dùng:
 *   node scripts/check-project-map.js           # kiểm tra, exit 1 nếu lệch
 *   node scripts/check-project-map.js --quiet   # chỉ in lỗi
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAP_FILE = path.join(ROOT, 'boicanhduan.json');

// Thư mục mà MỌI file bên trong đều phải được mô tả trong bản đồ
const MANAGED_DIRS = ['js', 'css', 'test', 'scripts', 'worker', 'scratch'];
// File ở gốc dự án phải được mô tả trong bản đồ
const ROOT_FILES = [
  'index.html', 'manifest.json', 'sw.js', 'package.json',
  'build.js', 'build-apk.bat', 'bump-version.js', 'CHANGELOG.md',
];

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const log = msg => { if (!QUIET) console.log(msg); };

const norm = p => p.replace(/\\/g, '/');

function listFiles(dirAbs, base = '') {
  const out = [];
  const abs = path.join(dirAbs, base);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dirAbs, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

// 1. Đọc bản đồ
let map;
try {
  map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
} catch (err) {
  console.error(`✗ Không đọc được boicanhduan.json: ${err.message}`);
  process.exit(1);
}

// 2. Gom mọi key trong các object "files" ở bất kỳ độ sâu nào
const mapKeys = new Set();
(function collect(node) {
  if (Array.isArray(node)) { node.forEach(collect); return; }
  if (!node || typeof node !== 'object') return;
  if (node.files && typeof node.files === 'object') {
    for (const key of Object.keys(node.files)) mapKeys.add(norm(key));
  }
  for (const value of Object.values(node)) collect(value);
})(map);

const exactKeys = new Set([...mapKeys].filter(k => !k.endsWith('/*')));
const globDirs = [...mapKeys].filter(k => k.endsWith('/*')).map(k => k.slice(0, -2));

// 3. Kiểm tra key trỏ tới đường dẫn còn tồn tại
const stalePaths = [];
for (const key of exactKeys) {
  if (!fs.existsSync(path.join(ROOT, key))) stalePaths.push(key);
}
for (const dir of globDirs) {
  if (listFiles(path.join(ROOT, dir)).length === 0) stalePaths.push(`${dir}/*`);
}

// 4. Kiểm tra file thật đã được mô tả chưa
const isDescribed = rel => {
  if (exactKeys.has(rel)) return true;
  return globDirs.some(dir => rel.startsWith(`${dir}/`));
};

const undescribed = [];
for (const dir of MANAGED_DIRS) {
  for (const rel of listFiles(path.join(ROOT, dir))) {
    const full = `${dir}/${rel}`;
    if (!isDescribed(full)) undescribed.push(full);
  }
}
for (const file of ROOT_FILES) {
  if (!isDescribed(file)) undescribed.push(file);
}

const drift = stalePaths.length + undescribed.length;

if (!drift) {
  log(`✓ boicanhduan.json khớp cây file thật (${exactKeys.size} đường dẫn, ${globDirs.length} nhóm glob).`);
  process.exit(0);
}

if (stalePaths.length) {
  console.error('✗ Bản đồ trỏ tới đường dẫn không còn tồn tại:\n  - ' + stalePaths.join('\n  - '));
}
if (undescribed.length) {
  console.error('✗ File có thật nhưng chưa được mô tả trong bản đồ:\n  - ' + undescribed.join('\n  - '));
}
console.error('\nCập nhật boicanhduan.json rồi chạy lại: node scripts/check-project-map.js');
process.exit(1);
