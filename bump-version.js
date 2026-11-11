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
  }
} else {
  console.error('Không tìm thấy file:', gradlePath);
}
