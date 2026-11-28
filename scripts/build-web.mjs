#!/usr/bin/env node
/**
 * Jarvis AI - Build bản web đã minify + gộp (không dùng framework)
 *
 *   node scripts/build-web.mjs          # tạo dist/
 *   node scripts/build-web.mjs --check  # chỉ in kích thước, không ghi file
 *
 * Vì sao không gộp TẤT CẢ: js/globals.js, js/lazy-libs.js, js/module-loader.js và
 * js/perf-marks.js là script CỔ ĐIỂN (khai báo `let`/`function` toàn cục mà các
 * module khác đọc trực tiếp). Gộp chúng vào bundle ESM sẽ đổi phạm vi biến và làm
 * vỡ app, nên chúng được minify riêng. Toàn bộ module còn lại gộp thành 1 bundle.
 *
 * Các module nạp theo nhu cầu (tts, translate, rag-core, rag, sync) vẫn phải nằm
 * thành file riêng vì js/module-loader.js chèn chúng lúc chạy -> chỉ minify.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TMP = path.join(ROOT, '.build');

const CHECK_ONLY = process.argv.includes('--check');
// --check phải THỰC SỰ build (vào thư mục tạm) để bắt lỗi cú pháp/bundle,
// chỉ khác là không ghi ra dist/.
const OUT = CHECK_ONLY ? path.join(TMP, 'check-dist') : DIST;

// Script cổ điển: minify riêng, giữ nguyên thứ tự trong index.html
const CLASSIC = [
  'sanitize.js',
  'sync-merge.js',
  'globals.js',
  'lazy-libs.js',
  'module-loader.js',
  'perf-marks.js',
];
// Module nạp theo nhu cầu: chép + minify thành file riêng
const LAZY = ['tts.js', 'translate.js', 'rag-core.js', 'rag.js', 'sync.js'];
// File tĩnh khác cần có trong dist
const EXTRA = ['markdown.worker.js', 'rag.worker.js', 'failover.js', 'offline-queue.js'];
const DIRS = ['css'];
const ROOT_FILES = ['manifest.json', 'sw.js'];

const kb = n => (n / 1024).toFixed(1) + ' KB';

function readIndex() {
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
}

/** Danh sách module trong index.html (theo thứ tự xuất hiện) */
function moduleScripts(html) {
  const re = /<script\s+type="module"\s+src="\.\/js\/([\w.-]+\.js)(?:\?v=[^"]*)?"><\/script>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

async function minifyJs(srcPath, outPath, { keepNames = false } = {}) {
  const code = fs.readFileSync(srcPath, 'utf8');
  const res = await esbuild.transform(code, {
    loader: 'js',
    // Script CỔ ĐIỂN khai báo biến toàn cục ($ , ls, DOM...) mà mọi module khác đọc
    // trực tiếp -> KHÔNG được đổi tên định danh, chỉ nén khoảng trắng/cú pháp.
    ...(keepNames
      ? { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false }
      : { minify: true }),
    format: 'esm',
    target: 'es2020',
    charset: 'utf8',
  });
  fs.writeFileSync(outPath, res.code);
  return res.code.length;
}

async function main() {
  const crypto = await import('node:crypto');
  let BUILD_HASH = '';
  const html = readIndex();
  const modules = moduleScripts(html);
  if (!modules.length) throw new Error('Không tìm thấy module script nào trong index.html');
  console.log(`[build:web] ${modules.length} module, ${CLASSIC.length} script cổ điển`);

  // 1. Entry bundle: import theo đúng thứ tự trong index.html
  fs.mkdirSync(TMP, { recursive: true });
  const entryPath = path.join(TMP, 'entry.js');
  fs.writeFileSync(entryPath, modules.map(name => `import '../js/${name}';`).join('\n') + '\n');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
  for (const d of DIRS) fs.mkdirSync(path.join(OUT, d), { recursive: true });

  // 2. Bundle + minify toàn bộ module
  let bundleBytes = 0;
  {
    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      minify: true,
      format: 'esm',
      target: ['es2020'],
      charset: 'utf8',
      legalComments: 'none',
      outfile: path.join(OUT, 'js', 'app.bundle.min.js'),
      logLevel: 'warning',
    });
    if (result.errors.length) throw new Error('esbuild bundle lỗi');
    bundleBytes = fs.statSync(path.join(OUT, 'js', 'app.bundle.min.js')).size;
    console.log(`  bundle: js/app.bundle.min.js  ${kb(bundleBytes)}`);
    // Build hash ban đầu từ bundle (sẽ được cập nhật thêm css ở bước 4)
    BUILD_HASH = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(OUT, 'js', 'app.bundle.min.js')))
      .digest('hex')
      .slice(0, 8);
  }

  // 3. Script cổ điển + module lazy + file phụ
  let classicBytes = 0;
  {
    for (const name of CLASSIC) {
      const out = path.join(OUT, 'js', name.replace(/\.js$/, '.min.js'));
      classicBytes += await minifyJs(path.join(ROOT, 'js', name), out, { keepNames: true });
    }
    console.log(`  script cổ điển: ${CLASSIC.length} file  ${kb(classicBytes)}`);

    for (const name of [...LAZY, ...EXTRA]) {
      const src = path.join(ROOT, 'js', name);
      if (!fs.existsSync(src)) continue;
      if (name === 'markdown.worker.js') {
        fs.copyFileSync(src, path.join(OUT, 'js', name)); // worker: chép nguyên
      } else {
        await minifyJs(src, path.join(OUT, 'js', name));
      }
    }
  }

  // 4. CSS + file gốc
  {
    let cssBytes = 0;
    for (const dir of DIRS) {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) {
        if (!f.endsWith('.css')) continue;
        const code = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
        const res = await esbuild.transform(code, { loader: 'css', minify: true, charset: 'utf8' });
        fs.writeFileSync(path.join(OUT, dir, f), res.code);
        cssBytes += res.code.length;
      }
    }
    console.log(`  css: ${kb(cssBytes)}`);

    for (const f of ROOT_FILES) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
    for (const f of fs.readdirSync(ROOT)) {
      if (/^icon-(?:192|512)\.png$/i.test(f))
        fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
    }
    const wellKnown = path.join(ROOT, '.well-known');
    if (fs.existsSync(wellKnown)) {
      fs.mkdirSync(path.join(OUT, '.well-known'), { recursive: true });
      for (const f of fs.readdirSync(wellKnown))
        fs.copyFileSync(path.join(wellKnown, f), path.join(OUT, '.well-known', f));
    }
  }

  // Tính build hash cuối (bundle + css) và bust cache tự động cho bản prod
  {
    const hash = crypto.createHash('sha256');
    const bundlePath = path.join(OUT, 'js', 'app.bundle.min.js');
    if (fs.existsSync(bundlePath)) hash.update(fs.readFileSync(bundlePath));
    for (const f of fs.readdirSync(path.join(OUT, 'css'))) {
      hash.update(fs.readFileSync(path.join(OUT, 'css', f)));
    }
    BUILD_HASH = hash.digest('hex').slice(0, 8);
    console.log('  build hash:', BUILD_HASH);
    // Cập nhật CACHE_NAME trong dist/sw.js để evict cache cũ
    const swPath = path.join(OUT, 'sw.js');
    const swSrc = fs.readFileSync(swPath, 'utf8');
    fs.writeFileSync(
      swPath,
      swSrc.replace(
        /const CACHE_NAME = 'jarvis-ai-pwa-v[^']*';/,
        `const CACHE_NAME = 'jarvis-ai-pwa-v101-${BUILD_HASH}';`
      )
    );
  }

  // 5. index.html cho dist: thay script cổ điển bằng bản .min.js, gộp module
  {
    let out = html;
    for (const name of CLASSIC) {
      const re = new RegExp(
        `<script src="\\./js/${name.replace('.', '\\.')}(\\?v=[^"]*)?"></script>`
      );
      out = out.replace(re, `<script src="./js/${name.replace(/\.js$/, '.min.js')}"></script>`);
    }
    let firstModule = true;
    out = out.replace(
      /[ \t]*<script type="module" src="\.\/js\/([\w.-]+\.js)(?:\?v=[^"]*)?"><\/script>\n?/g,
      name => {
        if (name.includes('app.bundle')) return '';
        if (!firstModule) return '';
        firstModule = false;
        return '    <script type="module" src="./js/app.bundle.min.js"></script>\n';
      }
    );
    // Bust cache tự động: mọi asset local dùng build hash thay cho ?v= thủ công
    out = out.replace(/\?v=\d+/g, '?v=' + BUILD_HASH);
    fs.writeFileSync(path.join(OUT, 'index.html'), out);
  }

  const total = fs.readdirSync(path.join(OUT, 'js')).reduce((s, f) => {
    return s + fs.statSync(path.join(OUT, 'js', f)).size;
  }, 0);
  if (CHECK_ONLY) {
    console.log(`[build:web] --check OK: bundle hợp lệ (js ${kb(total)}), không ghi dist/.`);
  } else {
    console.log(`[build:web] Xong: dist/ (js ${kb(total)})`);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}

main().catch(err => {
  console.error('[build:web] Lỗi:', err.message);
  process.exit(1);
});
