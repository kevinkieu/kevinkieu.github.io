#!/usr/bin/env node
/**
 * Jarvis AI - Cross-Platform Build Script (Node.js)
 * Tự động chạy bump-version, đồng bộ web assets sang android/app/src/main/assets,
 * và thực thi Gradle build để tạo file APK trên mọi hệ điều hành (Windows/macOS/Linux).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  JARVIS AI - CROSS-PLATFORM NODE BUILD SCRIPT');
console.log('========================================================\n');

// Gradle 8.2 chỉ hỗ trợ tới JDK 21: JDK 25 của Android Studio làm build fail với
// "Unsupported class file major version 69". Ưu tiên JDK 17 nếu tìm thấy.
function resolveJavaHome() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    process.env.JAVA_HOME,
    path.join(home, '.jdks', 'jbr-17.0.14'),
    'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
    'C:\\Program Files\\Microsoft\\jdk-17.0.21.21-hotspot',
  ].filter(Boolean);
  const majorOf = dir => {
    try {
      const rel = fs.readFileSync(path.join(dir, 'release'), 'utf8');
      const m = rel.match(/JAVA_VERSION="(\d+)/);
      return m ? Number(m[1]) : 0;
    } catch (_) {
      return 0;
    }
  };
  const current = process.env.JAVA_HOME;
  if (current && majorOf(current) >= 17 && majorOf(current) <= 21) return current;
  for (const dir of candidates) {
    const major = majorOf(dir);
    if (major >= 17 && major <= 21) return dir;
  }
  return current;
}

const javaHome = resolveJavaHome();
const buildEnv = { ...process.env };
if (javaHome) {
  buildEnv.JAVA_HOME = javaHome;
  buildEnv.PATH = `${path.join(javaHome, 'bin')}${path.delimiter}${buildEnv.PATH || ''}`;
  console.log(`☕ Dùng JDK: ${javaHome}`);
}

// 1. Chạy bump-version.js
console.log('[1/3] Cập nhật phiên bản (bump-version.js)...');
try {
  execSync('node bump-version.js', { stdio: 'inherit' });
} catch (e) {
  console.warn('⚠️ Không thể chạy bump-version.js tự động, tiếp tục quá trình build...');
}

// 2. Đồng bộ web assets vào thư mục android/app/src/main/assets
//    (dùng scripts/sync-web-assets.js - danh sách file duy nhất, dùng chung với
//     build-apk.bat và GitHub Actions để không bị lệch giữa 3 nơi)
console.log('[2/3] Đồng bộ mã nguồn web sang Android Assets...');
try {
  execSync('node scripts/sync-web-assets.js', { stdio: 'inherit' });
} catch (e) {
  console.error('❌ Đồng bộ assets thất bại.');
  process.exit(1);
}

// 3. Tiến hành gọi Gradle build
console.log('[3/3] Tiến hành biên dịch APK qua Gradle...');
const androidDir = path.join(__dirname, 'android');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

try {
  process.chdir(androidDir);
  execSync(`${gradlewCmd} assembleRelease`, { stdio: 'inherit', env: buildEnv });

  const apkSrc = path.join(
    androidDir,
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk'
  );
  const apkDest1 = path.join(__dirname, 'JarvisAI.apk');
  const apkDest2 = path.join(__dirname, 'JarvisAI_Offline.apk');

  if (fs.existsSync(apkSrc)) {
    // Xác nhận APK đã được ký bằng apksigner (jarsigner báo sai vì APK dùng v2 signing).
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    let apksigner = null;
    try {
      const bt = path.join(sdk, 'build-tools');
      const versions = fs.readdirSync(bt).sort().reverse();
      for (const v of versions) {
        const candidate = path.join(
          bt,
          v,
          process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'
        );
        if (fs.existsSync(candidate)) {
          apksigner = candidate;
          break;
        }
      }
    } catch (_) {}
    if (apksigner) {
      try {
        execSync(`"${apksigner}" verify "${apkSrc}"`, { stdio: 'inherit', env: buildEnv });
      } catch (e) {
        console.error(
          '❌ APK chưa được ký (apksigner verify thất bại) — không copy ra bản phát hành.'
        );
        process.exit(1);
      }
    } else {
      console.warn('⚠️ Không tìm thấy apksigner để kiểm tra chữ ký APK.');
    }

    fs.copyFileSync(apkSrc, apkDest1);
    fs.copyFileSync(apkSrc, apkDest2);
    console.log('\n========================================================');
    console.log('  BUILD APK THANH CONG!');
    console.log(`  - ${apkDest1}`);
    console.log(`  - ${apkDest2}`);
    console.log('========================================================');
  } else {
    console.warn(
      '⚠️ Gradle build hoàn tất nhưng không tìm thấy file APK output tại đường dẫn dự kiến.'
    );
  }
} catch (error) {
  console.error('\n[LỖI] Biên dịch APK thất bại:', error.message);
  process.exit(1);
}
