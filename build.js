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
//    (dùng scripts/sync-web-assets.js - danh sách file duy nhất, dùng chung với
//     build-apk.bat và GitHub Actions để không bị lệch giữa 3 nơi)
console.log("[2/3] Đồng bộ mã nguồn web sang Android Assets...");
try {
  execSync('node scripts/sync-web-assets.js', { stdio: 'inherit' });
} catch (e) {
  console.error("❌ Đồng bộ assets thất bại.");
  process.exit(1);
}

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
