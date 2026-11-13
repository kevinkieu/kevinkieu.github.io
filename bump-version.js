const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let content = fs.readFileSync(gradlePath, 'utf8');
  const codeMatch = content.match(/versionCode\s+(\d+)/);
  if (codeMatch) {
    const oldCode = parseInt(codeMatch[1], 10);
    const newCode = oldCode + 1;
    const newVersionName = `1.1.${newCode}`;
    content = content
      .replace(/versionCode\s+\d+/, `versionCode ${newCode}`)
      .replace(/versionName\s+["'][^"']+["']/, `versionName "${newVersionName}"`);
    fs.writeFileSync(gradlePath, content, 'utf8');
    console.log(`[TĂNG PHIÊN BẢN] versionCode: ${oldCode} -> ${newCode} (versionName: "${newVersionName}")`);

    // Đồng bộ cache buster trong index.html
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      let indexHtml = fs.readFileSync(indexPath, 'utf8');
      indexHtml = indexHtml.replace(/(\.css|\.js)\?v=\d+/g, `$1?v=${newCode}`);
      fs.writeFileSync(indexPath, indexHtml, 'utf8');
      console.log(`[ĐỒNG BỘ CACHE] Đã cập nhật version query ?v=${newCode} trong index.html`);
    }

    // Đồng bộ CACHE_NAME trong sw.js
    const swPath = path.join(__dirname, 'sw.js');
    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, 'utf8');
      swContent = swContent.replace(/CACHE_NAME\s*=\s*['"]jarvis-ai-pwa-v\d+['"]/, `CACHE_NAME = 'jarvis-ai-pwa-v${newCode}'`);
      fs.writeFileSync(swPath, swContent, 'utf8');
      console.log(`[ĐỒNG BỘ SW] Đã cập nhật CACHE_NAME jarvis-ai-pwa-v${newCode} trong sw.js`);
    }
  }
} else {
  console.error('Không tìm thấy file:', gradlePath);
}
