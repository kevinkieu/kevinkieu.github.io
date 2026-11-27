/* ==========================================================================
   Jarvis AI - Đính kèm tệp: đọc PDF, nén ảnh, xem trước tệp

   Tách khỏi js/app.js. Chỉ dùng trạng thái công khai: filesData, txtContent, DOM,
   showToast, updateTokenCount, escapeHtml, window.ensureLib (pdf.js tải theo nhu cầu).
   ========================================================================== */
const escapeHtmlSafe = str =>
  typeof window.escapeHtml === 'function'
    ? window.escapeHtml(str)
    : String(str == null ? '' : str).replace(
        /[&<>"']/g,
        m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
      );

// Object URL của ảnh xem trước được thu hồi mỗi lần vẽ lại để không rò rỉ bộ nhớ.
const previewUrls = new Map();
function previewUrlFor(f, i) {
  let u = previewUrls.get(i);
  if (!u || previewUrls.get('f' + i) !== f) {
    if (u) URL.revokeObjectURL(u);
    u = URL.createObjectURL(f);
    previewUrls.set(i, u);
    previewUrls.set('f' + i, f);
  }
  return u;
}

async function readPDF(f) {
  const pdfjsLib =
    typeof window.ensureLib === 'function' ? await window.ensureLib('pdfjs') : window.pdfjsLib;
  if (!pdfjsLib) throw new Error('Chưa tải được thư viện PDF.js');
  const p = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
  let t = '';
  for (let i = 1; i <= p.numPages; i++) {
    t += (await (await p.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
  }
  return t;
}

async function compressImageIfNeeded(f) {
  if (!f.type.startsWith('image/') || f.type === 'image/gif' || f.type === 'image/svg+xml')
    return f;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1600;
      let { width, height } = img;
      if (width <= MAX_DIM && height <= MAX_DIM && f.size < 800 * 1024) return resolve(f);
      if (width > height) {
        if (width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (blob && blob.size < f.size) {
            resolve(
              new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
            );
          } else {
            resolve(f);
          }
        },
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => resolve(f);
    img.src = url;
  });
}

async function processUploadFiles(fs) {
  DOM.fileCount.innerText = '⏳';
  for (let f of fs) {
    if (f.type.startsWith('image/')) {
      f = await compressImageIfNeeded(f);
      if (filesData.length < 20) filesData.push(f);
    } else if (f.type.startsWith('video/')) {
      if (filesData.length < 20) filesData.push(f);
    } else if (f.type.startsWith('audio/')) {
      // Audio gửi base64 nguyên tệp -> chặn tệp quá lớn để không nổ payload
      if (f.size > 25 * 1024 * 1024) {
        showToast(`Tệp audio quá lớn (tối đa 25MB): ${f.name}`, 'danger');
        continue;
      }
      if (filesData.length < 20) filesData.push(f);
    } else if (f.type === 'application/pdf') {
      txtContent += `\n[PDF: ${f.name}]:\n${(await readPDF(f)).substring(0, 50000)}\n`;
      DOM.textFileList.innerHTML += `📑 ${escapeHtmlSafe(f.name)}<br>`;
    } else {
      txtContent += `\n[Văn bản: ${f.name}]:\n${(await f.text()).substring(0, 50000)}\n`;
      DOM.textFileList.innerHTML += `📄 ${escapeHtmlSafe(f.name)}<br>`;
    }
  }
  renderFiles();
  updateTokenCount();
}

function renderFiles() {
  DOM.previewBox.style.display = filesData.length || txtContent ? 'block' : 'none';
  DOM.fileCount.innerText = filesData.length + (txtContent ? 1 : 0);
  // Thu hồi URL của các tệp đã bị xóa khỏi danh sách
  for (const key of Array.from(previewUrls.keys())) {
    if (typeof key === 'number' && key >= filesData.length) {
      URL.revokeObjectURL(previewUrls.get(key));
      previewUrls.delete(key);
      previewUrls.delete('f' + key);
    }
  }
  DOM.previewGrid.innerHTML = filesData
    .map(
      (f, i) => `
        <div style="position:relative;width:50px;height:50px;background:#1e293b;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;overflow:hidden;border:1px solid var(--border);">
          ${f.type.startsWith('image') ? `<img src="${previewUrlFor(f, i)}" style="width:100%;height:100%;object-fit:cover;">` : f.type.startsWith('video') ? '🎬 VIDEO' : f.type.startsWith('audio') ? '🎵 AUDIO' : '📄 FILE'}
          <button onclick="rmImg(${i})" style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,0.9);color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">×</button>
        </div>
      `
    )
    .join('');
}

window.rmImg = i => {
  filesData.splice(i, 1);
  renderFiles();
  updateTokenCount();
};

// Xuất qua window: app.js và inline onclick (rmImg) gọi lại qua tên toàn cục
window.readPDF = readPDF;
window.compressImageIfNeeded = compressImageIfNeeded;
window.processUploadFiles = processUploadFiles;
window.renderFiles = renderFiles;
