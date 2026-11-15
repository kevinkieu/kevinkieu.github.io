#!/usr/bin/env node
/**
 * Jarvis AI - Cross-Platform Build Script (Node.js)
 * Tự động chạy bump-version, đồng bộ web assets sang android/app/src/main/assets,
 * và thực thi Gradle build để tạo file APK trên mọi hệ điều hành (Windows/macOS/Linux).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("========================================================");
console.log("  JARVIS AI - CROSS-PLATFORM NODE BUILD SCRIPT");
console.log("========================================================\n");

// 1. Chạy bump-version.js
console.log("[1/3] Cập nhật phiên bản (bump-version.js)...");
try {
  execSync('node bump-version.js', { stdio: 'inherit' });
} catch (e) {
  console.warn("⚠️ Không thể chạy bump-version.js tự động, tiếp tục quá trình build...");
}

// 2. Đồng bộ web assets vào thư mục android/app/src/main/assets
console.log("[2/3] Đồng bộ mã nguồn web sang Android Assets...");
const androidAssetsDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets');
if (!fs.existsSync(androidAssetsDir)) {
  fs.mkdirSync(androidAssetsDir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy các file chính
['index.html', 'manifest.json', 'sw.js'].forEach(file => {
  const srcPath = path.join(__dirname, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(androidAssetsDir, file));
  }
});

// Copy icon*.png
fs.readdirSync(__dirname).forEach(file => {
  if (file.startsWith('icon') && file.endsWith('.png')) {
    fs.copyFileSync(path.join(__dirname, file), path.join(androidAssetsDir, file));
  }
});

// Copy thư mục js và css
copyRecursive(path.join(__dirname, 'js'), path.join(androidAssetsDir, 'js'));
copyRecursive(path.join(__dirname, 'css'), path.join(androidAssetsDir, 'css'));
console.log("✓ Đã đồng bộ hoàn tất assets vào Android.");

// 3. Tiến hành gọi Gradle build
console.log("[3/3] Tiến hành biên dịch APK qua Gradle...");
const androidDir = path.join(__dirname, 'android');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

try {
  process.chdir(androidDir);
  execSync(`${gradlewCmd} assembleRelease`, { stdio: 'inherit' });

  const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const apkDest1 = path.join(__dirname, 'JarvisAI.apk');
  const apkDest2 = path.join(__dirname, 'JarvisAI_Offline.apk');

  if (fs.existsSync(apkSrc)) {
    fs.copyFileSync(apkSrc, apkDest1);
    fs.copyFileSync(apkSrc, apkDest2);
    console.log("\n========================================================");
    console.log("  BUILD APK THANH CONG!");
    console.log(`  - ${apkDest1}`);
    console.log(`  - ${apkDest2}`);
    console.log("========================================================");
  } else {
    console.warn("⚠️ Gradle build hoàn tất nhưng không tìm thấy file APK output tại đường dẫn dự kiến.");
  }
} catch (error) {
  console.error("\n[LỖI] Biên dịch APK thất bại:", error.message);
  process.exit(1);
}
