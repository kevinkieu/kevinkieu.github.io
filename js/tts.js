/* ==========================================================================
   Jarvis AI - Gemini TTS Studio Pro & Audio Converter Module
   ========================================================================== */

    // ==========================================
    // KHỐI 5: GEMINI TTS STUDIO PRO ENGINE
    // ==========================================
    const TTS_PRESETS = {
      news: "Kính chào quý vị và các bạn! Bản tin công nghệ hôm nay mang đến thông tin đột phá mới trong lĩnh vực trí tuệ nhân tạo. Trợ lý AI Jarvis vừa được nâng cấp tính năng phòng thu âm thanh thế hệ mới với khả năng xuất tệp MP3 siêu nhẹ và giọng đọc tự nhiên chuẩn xác.",
      story: "Đêm đã về khuya, không gian xung quanh bỗng trở nên thật tĩnh lặng. <whisper>Chỉ còn lại tiếng gió xào xạc ngoài khung cửa sổ.</whisper> <pause duration='1s'/> Tôi ngồi lại đây, mở trang nhật ký đã ố vàng và nhớ về những kỷ niệm của một thời tuổi trẻ tươi đẹp.",
      ads: "Bạn đang tìm kiếm một giải pháp trợ lý AI toàn năng, nhanh chóng và thông minh vượt trội? <emphasis>Jarvis AI chính là câu trả lời hoàn hảo dành cho bạn!</emphasis> <chuckle>Trải nghiệm ngay hôm nay để bứt phá hiệu suất công việc của bạn lên gấp 10 lần!</chuckle>",
      podcast: "A: Xin chào tất cả các bạn đã quay trở lại với chương trình trò chuyện công nghệ cuối tuần!\nB: Chào anh Charon và chào quý thính giả! Hôm nay chúng ta có chủ đề gì thú vị vậy anh?\nA: Hôm nay chúng ta sẽ cùng giải mã cách trí tuệ nhân tạo có thể tạo ra giọng nói tự nhiên đến kinh ngạc, thậm chí còn biết thể hiện cảm xúc như thì thầm hay cười đùa đấy!\nB: <chuckle>Nghe hấp dẫn quá!</chuckle> Em cũng đang rất tò mò không biết công nghệ phía sau hoạt động như thế nào đây."
    };

    let ttsStudioMode = 'single';
    let ttsMasterMp3Blob = null;
    let ttsMasterWavBlob = null;
    let ttsMasterAudioUrl = null;
    let ttsGlobalKeyPointer = 0;
    let ttsAudioCtx = null;
    let ttsAnalyser = null;
    let ttsSourceNode = null;
    let ttsAnimId = null;

    function sanitizeTranscript(text) {
      if (!text) return "";
      return text
        .replace(/```[\s\S]*?```/g, ' [đoạn mã] ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/[#*_~>]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();
    }

    function splitTextIntoSmartChunks(text, maxChars = 850) {
      if (!text || text.length <= maxChars) return [text || ""];
      const chunks = [];
      const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
      let cur = "";
      for (const s of sentences) {
        if ((cur + s).length > maxChars && cur.trim()) {
          chunks.push(cur.trim());
          cur = s;
        } else {
          cur += s;
        }
      }
      if (cur.trim()) chunks.push(cur.trim());
      return chunks;
    }

    function parseWav(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let sampleRate = 24000;
      let channels = 1;
      let pcmOffset = 44;
      let pcmSize = bytes.length - 44;

      let offset = 12;
      while (offset < bytes.length - 8) {
        const chunkId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === 'fmt ') {
          channels = view.getUint16(offset + 10, true);
          sampleRate = view.getUint32(offset + 12, true);
        } else if (chunkId === 'data') {
          pcmOffset = offset + 8;
          pcmSize = chunkSize;
          break;
        }
        offset += 8 + chunkSize;
      }

      // Chỉ lấy đúng vùng dữ liệu âm thanh, không đọc vào trailing metadata hay padding bytes ở cuối WAV
      const actualEnd = Math.min(bytes.length, pcmOffset + pcmSize);
      let pcmBytes = bytes.slice(pcmOffset, actualEnd);

      // Đảm bảo số lượng byte chẵn cho 16-bit PCM (2 bytes / sample)
      if (pcmBytes.length % 2 !== 0) {
        pcmBytes = pcmBytes.subarray(0, pcmBytes.length - 1);
      }

      // Xử lý khử tiếng "xẹt" / crackle / pop ở đầu và cuối mỗi đoạn âm thanh:
      const samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
      
      // 1. Micro fade-out (~20ms ở 24kHz = 480 mẫu) đưa biên độ về 0 êm dịu, triệt tiêu tiếng xẹt khi kết thúc
      const fadeOutCount = Math.min(480, samples.length);
      const startFade = samples.length - fadeOutCount;
      for (let i = 0; i < fadeOutCount; i++) {
        const factor = Math.cos((i / fadeOutCount) * (Math.PI / 2));
        samples[startFade + i] = Math.round(samples[startFade + i] * factor);
      }

      // 2. Micro fade-in (~5ms = 120 mẫu) tránh tiếng bật khi bắt đầu phát
      const fadeInCount = Math.min(120, samples.length);
      for (let i = 0; i < fadeInCount; i++) {
        const factor = Math.sin((i / fadeInCount) * (Math.PI / 2));
        samples[i] = Math.round(samples[i] * factor);
      }

      return { sampleRate, channels, pcmData: new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength) };
    }

    function createWavBlob(pcmBytes, sampleRate = 24000) {
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const buffer = new ArrayBuffer(44 + pcmBytes.length);
      const view = new DataView(buffer);

      function writeString(off, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
      }

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + pcmBytes.length, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM format
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(36, 'data');
      view.setUint32(40, pcmBytes.length, true);

      new Uint8Array(buffer, 44).set(pcmBytes);
      return new Blob([buffer], { type: 'audio/wav' });
    }

    function concatPcmArrays(arrays) {
      let totalLen = 0;
      for (const a of arrays) totalLen += a.length;
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const a of arrays) {
        result.set(a, offset);
        offset += a.length;
      }
      return result;
    }

    function encodePcmToMp3Blob(pcmBytes, sampleRate = 24000, kbps = 96) {
      const Lame = window.lamejs || globalThis.lamejs;
      if (!Lame || !Lame.Mp3Encoder) {
        throw new Error("Thư viện nén MP3 (lamejs) chưa được nạp!");
      }
      let samples;
      if (pcmBytes instanceof Int16Array) {
        samples = pcmBytes;
      } else if (pcmBytes instanceof Uint8Array) {
        if (pcmBytes.byteOffset % 2 === 0) {
          samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
        } else {
          const copy = new Uint8Array(pcmBytes.byteLength);
          copy.set(pcmBytes);
          samples = new Int16Array(copy.buffer, 0, copy.byteLength / 2);
        }
      } else {
        samples = new Int16Array(pcmBytes);
      }

      const mp3encoder = new Lame.Mp3Encoder(1, sampleRate, kbps);
      const mp3Data = [];
      const sampleBlockSize = 1152;
      for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const chunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
      }
      const flushBuf = mp3encoder.flush();
      if (flushBuf.length > 0) mp3Data.push(flushBuf);

      return new Blob(mp3Data, { type: 'audio/mpeg' });
    }

    async function requestGeminiAudioWithFailover(payload, model, keyList, preferredIdx = 0) {
      if (!keyList || keyList.length === 0) {
        throw new Error("Chưa có API Key Google nào trong Jarvis AI! Hãy mở Cài đặt để thêm key.");
      }
      let attempts = 0;
      let curIdx = preferredIdx % keyList.length;
      let lastErr = null;

      while (attempts < keyList.length) {
        const key = keyList[curIdx];
        const masked = key.length > 8 ? key.substring(0, 4) + '...' + key.slice(-4) : '***';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const data = await res.json();
            return { data, successIdx: curIdx };
          }

          const errText = await res.text();
          console.warn(`Key #${curIdx + 1} (${masked}) HTTP ${res.status}: ${errText}`);
          showToast(`⚠️ Key #${curIdx + 1} quá tải (${res.status}), xoay sang Key kế tiếp...`, 'warning');
          lastErr = new Error(`HTTP ${res.status}: ${errText}`);
          curIdx = (curIdx + 1) % keyList.length;
          attempts++;
        } catch (e) {
          console.warn(`Key #${curIdx + 1} lỗi kết nối:`, e);
          lastErr = e;
          curIdx = (curIdx + 1) % keyList.length;
          attempts++;
        }
      }

      throw new Error(`Toàn bộ ${keyList.length} Keys đều không thể xử lý! Lỗi: ${lastErr ? lastErr.message : 'Unknown'}`);
    }

    function formatFileSize(bytes) {
      if (!bytes) return "0 B";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }

    function formatDuration(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function updateTTSMetrics() {
      const ed = $('tts-editor-input');
      if (!ed) return;
      const text = ed.value.trim();
      const chars = text.length;
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      const estSeconds = Math.round(words / 2.7);

      if ($('tts-stat-chars')) $('tts-stat-chars').innerText = chars.toLocaleString();
      if ($('tts-stat-words')) $('tts-stat-words').innerText = words.toLocaleString();
      if ($('tts-stat-est-time')) $('tts-stat-est-time').innerText = formatDuration(estSeconds);
    }

    function setTTSStudioMode(mode) {
      ttsStudioMode = mode;
      const btnSingle = $('tts-mode-single-btn');
      const btnDial = $('tts-mode-dialogue-btn');
      const panelSingle = $('tts-single-voice-panel');
      const panelDial = $('tts-dialogue-voice-panel');
      const badge = $('tts-stat-mode-badge');

      if (mode === 'single') {
        if (btnSingle) btnSingle.classList.add('active');
        if (btnDial) btnDial.classList.remove('active');
        if (panelSingle) panelSingle.style.display = 'flex';
        if (panelDial) panelDial.style.display = 'none';
        if (badge) badge.innerText = "👤 Chế độ: Đơn thoại";
      } else {
        if (btnSingle) btnSingle.classList.remove('active');
        if (btnDial) btnDial.classList.add('active');
        if (panelSingle) panelSingle.style.display = 'none';
        if (panelDial) panelDial.style.display = 'flex';
        if (badge) badge.innerText = "👥 Chế độ: Hội thoại A/B";
      }
    }

    function insertTTSExpression(tag) {
      const ed = $('tts-editor-input');
      if (!ed) return;
      const start = ed.selectionStart || 0;
      const end = ed.selectionEnd || 0;
      const val = ed.value;
      ed.value = val.substring(0, start) + tag + val.substring(end);
      ed.focus();
      ed.setSelectionRange(start + tag.length, start + tag.length);
      updateTTSMetrics();
    }

    // Web Audio Context & Visualizer
    function resumeTTSAudioContext() {
      if (ttsAudioCtx && ttsAudioCtx.state === 'suspended') {
        try {
          ttsAudioCtx.resume();
        } catch (e) {
          console.warn("ttsAudioCtx.resume error:", e);
        }
      }
    }

    function initTTSVisualizer(audioEl) {
      const canvas = $('tts-visualizer-canvas');
      if (!canvas || !audioEl) return;
      const ctx = canvas.getContext('2d');
      canvas.width = canvas.clientWidth * window.devicePixelRatio || 400;
      canvas.height = canvas.clientHeight * window.devicePixelRatio || 120;

      if (!ttsAudioCtx) {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          ttsAudioCtx = new AudioContextClass();
          ttsAnalyser = ttsAudioCtx.createAnalyser();
          ttsAnalyser.fftSize = 128;
          ttsSourceNode = ttsAudioCtx.createMediaElementSource(audioEl);
          ttsSourceNode.connect(ttsAnalyser);
          ttsAnalyser.connect(ttsAudioCtx.destination);
        } catch (e) {
          console.warn("Visualizer Web Audio API init error:", e);
        }
      }

      resumeTTSAudioContext();

      function draw() {
        ttsAnimId = requestAnimationFrame(draw);
        if (!ttsAnalyser || !audioEl) return;
        if (audioEl.paused || audioEl.ended) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }
        const bufferLength = ttsAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        ttsAnalyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
          const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
          grad.addColorStop(0, '#3b82f6');
          grad.addColorStop(0.5, '#8b5cf6');
          grad.addColorStop(1, '#10b981');

          ctx.fillStyle = grad;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      }

      if (!ttsAnimId) draw();
    }

    async function loadAndPlayTTSAudio(blob, forcePlay = true) {
      const audioEl = $('tts-audio-element');
      const playerDeck = $('tts-player-deck');
      if (!audioEl) return;
      if (playerDeck) playerDeck.style.display = 'flex';

      // 1. Tạm dừng âm thanh cũ và reset trạng thái decoder
      try {
        audioEl.pause();
      } catch (_) {}

      // 2. Lưu URL cũ để thu hồi trễ an toàn sau 5s, không revoke ngay lập tức tránh làm gãy pipeline
      const oldUrl = ttsMasterAudioUrl;

      // 3. Khởi tạo Blob URL mới và gán vào thẻ Audio
      ttsMasterAudioUrl = URL.createObjectURL(blob);
      audioEl.src = ttsMasterAudioUrl;
      audioEl.currentTime = 0;
      audioEl.dataset.retriedWav = '';

      // 4. Bắt buộc gọi .load() để trình duyệt khởi tạo lại Media Pipeline và nạp blob mới
      audioEl.load();

      // 5. Kết nối visualizer (nếu chưa kết nối) & đánh thức AudioContext
      initTTSVisualizer(audioEl);
      resumeTTSAudioContext();

      // 6. Phát âm thanh
      if (forcePlay) {
        try {
          const p = audioEl.play();
          if (p !== undefined) {
            await p;
          }
        } catch (playErr) {
          console.warn("Autoplay deferred or blocked:", playErr);
          showToast("🎵 Âm thanh đã sẵn sàng! Bấm nút Phát (▶) trên thanh điều khiển để nghe.", "info");
        }
      }

      // 7. Thu hồi URL cũ sau 5 giây an toàn (khi trình duyệt đã nạp xong bài mới)
      if (oldUrl && oldUrl !== ttsMasterAudioUrl) {
        setTimeout(() => {
          try { URL.revokeObjectURL(oldUrl); } catch (_) {}
        }, 5000);
      }
    }

    // IndexedDB for TTS Library
    function ttsDbSave(record) {
      return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains(TTS_STORE)) return resolve();
        try {
          const tx = db.transaction(TTS_STORE, "readwrite");
          const st = tx.objectStore(TTS_STORE);
          const rq = st.add(record);
          rq.onsuccess = () => resolve(rq.result);
          rq.onerror = () => resolve();
        } catch { resolve(); }
      });
    }

    function ttsDbGetAll() {
      return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains(TTS_STORE)) return resolve([]);
        try {
          const tx = db.transaction(TTS_STORE, "readonly");
          const st = tx.objectStore(TTS_STORE);
          const rq = st.getAll();
          rq.onsuccess = () => resolve((rq.result || []).reverse());
          rq.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
    }

    function ttsDbDelete(id) {
      return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains(TTS_STORE)) return resolve();
        try {
          const tx = db.transaction(TTS_STORE, "readwrite");
          const st = tx.objectStore(TTS_STORE);
          const rq = st.delete(id);
          rq.onsuccess = rq.onerror = () => resolve();
        } catch { resolve(); }
      });
    }

    function ttsDbClearAll() {
      return new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains(TTS_STORE)) return resolve();
        try {
          const tx = db.transaction(TTS_STORE, "readwrite");
          const st = tx.objectStore(TTS_STORE);
          const rq = st.clear();
          rq.onsuccess = rq.onerror = () => resolve();
        } catch { resolve(); }
      });
    }

    async function renderTTSHistory() {
      const container = $('tts-history-container');
      const countEl = $('tts-history-count');
      const mobCountEl = $('tts-mobile-hist-count');
      if (!container) return;

      const items = await ttsDbGetAll();
      if (countEl) countEl.innerText = items.length;
      if (mobCountEl) mobCountEl.innerText = items.length;

      if (!items || items.length === 0) {
        container.innerHTML = `<i style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:12px;">Chưa có bản ghi âm thanh nào được lưu.</i>`;
        return;
      }

      container.innerHTML = items.map(item => `
        <div class="tts-history-item" data-id="${item.id}">
          <div class="tts-hist-meta">
            <span style="font-weight:600;color:var(--primary);">${item.voice || 'Gemini TTS'} • ${item.mode === 'dialogue' ? 'Hội thoại A/B' : 'Đơn thoại'}</span>
            <span>🕒 ${item.createdAt || ''}</span>
          </div>
          <div class="tts-hist-snippet" title="${item.text || ''}">${item.text || ''}</div>
          <div class="tts-hist-meta" style="margin-top:2px;">
            <span style="color:#10b981;font-weight:600;">MP3: ${formatFileSize(item.mp3Size)} ${item.duration ? `• ${item.duration}` : ''}</span>
            <div class="tts-hist-actions">
              <button class="btn" style="padding:3px 7px;font-size:0.75rem;" onclick="playTTSHistoryItem(${item.id})">▶️ Nghe</button>
              <button class="btn" style="padding:3px 7px;font-size:0.75rem;color:#10b981;font-weight:600;" onclick="downloadTTSHistoryItem(${item.id}, 'mp3')">📥 MP3</button>
              <button class="btn" style="padding:3px 7px;font-size:0.75rem;" onclick="downloadTTSHistoryItem(${item.id}, 'wav')">📥 WAV</button>
              <button class="btn danger" style="padding:3px 7px;font-size:0.75rem;" onclick="deleteTTSHistoryItem(${item.id})">🗑️</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    window.playTTSHistoryItem = async (id) => {
      const items = await ttsDbGetAll();
      const item = items.find(x => x.id === id);
      if (!item) return;

      const blob = item.mp3Blob || item.wavBlob;
      ttsMasterMp3Blob = item.mp3Blob;
      ttsMasterWavBlob = item.wavBlob;

      await loadAndPlayTTSAudio(blob, true);

      // On mobile, switch to editor tab so the user immediately sees the player deck & visualizer
      const modal = $('tts-studio-modal');
      if (modal && window.innerWidth <= 900) {
        modal.setAttribute('data-mobile-tab', 'editor');
        document.querySelectorAll('.tts-mobile-nav-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-tab') === 'editor');
        });
      }

      if ($('tts-mp3-size-tag')) $('tts-mp3-size-tag').innerText = `(${formatFileSize(item.mp3Size)})`;
      if ($('tts-wav-size-tag')) $('tts-wav-size-tag').innerText = `(${formatFileSize(item.wavSize)})`;
      showToast(`Đang phát: "${item.text.slice(0, 40)}..."`, "info");
    };

    window.downloadTTSHistoryItem = async (id, format) => {
      const items = await ttsDbGetAll();
      const item = items.find(x => x.id === id);
      if (!item) return;
      const blob = format === 'mp3' ? (item.mp3Blob || item.wavBlob) : (item.wavBlob || item.mp3Blob);
      const ext = format === 'mp3' ? 'mp3' : 'wav';
      const filename = `TTS_Jarvis_${Date.now()}.${ext}`;
      saveOrShareBlob(blob, filename);
    };

    window.deleteTTSHistoryItem = async (id) => {
      await ttsDbDelete(id);
      renderTTSHistory();
      showToast("Đã xóa bản ghi âm thanh.", "info");
    };

    // Master TTS Execution
    async function executeTTSWorkflow() {
      const ed = $('tts-editor-input');
      const rawText = ed?.value.trim();
      if (!rawText) return showToast("Vui lòng nhập văn bản cần chuyển thành giọng nói!", "warning");

      // Tạm dừng ngay âm thanh cũ nếu đang phát và đánh thức AudioContext trong cử chỉ click của người dùng
      const curAudio = $('tts-audio-element');
      if (curAudio) {
        try { curAudio.pause(); } catch (_) {}
      }
      resumeTTSAudioContext();

      // Key selection
      const keyStrategy = $('tts-key-strategy-select')?.value || 'auto';
      const activeKeys = getGoogleKeysList().filter(Boolean);
      let targetKeys = [...activeKeys];
      let startKeyIndex = 0;

      if (keyStrategy !== 'auto') {
        const keyIdx = parseInt(keyStrategy, 10);
        const specificKey = (ls.getItem(`jarvis_api_${keyIdx}`) || ls.getItem(`huanmu_api_${keyIdx}`) || "").trim();
        if (!specificKey) return showToast(`Key #${keyIdx} đang trống! Hãy chọn Key khác hoặc 'Tự động xoay 10 Keys'.`, "warning");
        targetKeys = [specificKey, ...activeKeys.filter(k => k !== specificKey)];
        startKeyIndex = 0;
      } else {
        if (targetKeys.length === 0) return showToast("Chưa có Google API Key nào trong Jarvis AI! Hãy mở Cài đặt để thêm key.", "danger");
        startKeyIndex = ttsGlobalKeyPointer % targetKeys.length;
      }

      const model = $('tts-model-select')?.value || 'gemini-3.8-flash-lite-tts';
      const lang = $('tts-lang-select')?.value || 'vi';
      const region = $('tts-dialect-select')?.value || ls.getItem('tts_dialect_pref') || 'Nam chuẩn Sài Gòn';
      const style = $('tts-style-select')?.value || 'Tự nhiên, gần gũi';
      const speed = $('tts-speed-select')?.value || 'vừa phải, tự nhiên';

      const maleVoices = ['Charon', 'Puck', 'Fenrir', 'Enceladus', 'Alnilam', 'Rasalgethi', 'Iapetus', 'Algieba', 'Algenib', 'Orus', 'Schedar'];

      // Build Tasks
      const tasks = [];
      if (ttsStudioMode === 'single') {
        const clean = sanitizeTranscript(rawText);
        const voice = $('tts-voice-select')?.value || 'Charon';
        const gender = maleVoices.includes(voice) ? 'nam' : 'nữ';
        const styleInstruction = lang === 'vi' 
          ? `Chất giọng ${gender} ${region}, phong cách ${style}, tốc độ đọc ${speed}`
          : `${gender === 'nam' ? 'Male' : 'Female'} persona, delivery: ${style}, pace: ${speed}`;

        const chunks = splitTextIntoSmartChunks(clean, 850);
        chunks.forEach(ch => {
          tasks.push({ text: ch, voice, styleInstruction });
        });
      } else {
        // Dialogue Mode
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        const voiceA = $('tts-voice-a')?.value || 'Charon';
        const voiceB = $('tts-voice-b')?.value || 'Aoede';

        let curSpeaker = 'A';
        for (const line of lines) {
          let lineSpeaker = curSpeaker;
          let content = line;
          if (/^(?:A|Speaker\s*A|\[A\]|\[Speaker\s*A\])\s*:\s*/i.test(line)) {
            lineSpeaker = 'A';
            content = line.replace(/^(?:A|Speaker\s*A|\[A\]|\[Speaker\s*A\])\s*:\s*/i, '');
          } else if (/^(?:B|Speaker\s*B|\[B\]|\[Speaker\s*B\])\s*:\s*/i.test(line)) {
            lineSpeaker = 'B';
            content = line.replace(/^(?:B|Speaker\s*B|\[B\]|\[Speaker\s*B\])\s*:\s*/i, '');
          }
          curSpeaker = lineSpeaker;
          const clean = sanitizeTranscript(content);
          if (!clean) continue;

          const speakerVoice = lineSpeaker === 'A' ? voiceA : voiceB;
          const gender = maleVoices.includes(speakerVoice) ? 'nam' : 'nữ';
          const styleInstruction = `Chất giọng ${gender} ${region}, phong cách ${style}, tốc độ đọc ${speed}`;
          const chunks = splitTextIntoSmartChunks(clean, 850);
          chunks.forEach(ch => {
            tasks.push({ text: ch, voice: speakerVoice, styleInstruction });
          });
        }
      }

      if (tasks.length === 0) return showToast("Không có nội dung thoại hợp lệ để tạo âm thanh!", "warning");

      const btn = $('btn-generate-audio');
      const progressBox = $('tts-progress-box');
      const progressFill = $('tts-progress-fill');
      const progressStatus = $('tts-progress-status');
      const progressPercent = $('tts-progress-percent');

      btn.disabled = true;
      btn.innerHTML = `⏳ Đang xử lý (${tasks.length} đoạn)...`;
      progressBox.style.display = 'flex';
      progressFill.style.width = '5%';
      progressPercent.innerText = '5%';
      progressStatus.innerText = 'Đang kết nối Gemini API...';

      const rawPcmChunks = [];
      let sampleRateCaptured = 24000;

      try {
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const pct = Math.round(((i) / tasks.length) * 80) + 10;
          progressFill.style.width = pct + '%';
          progressPercent.innerText = pct + '%';
          progressStatus.innerText = `Đang tạo đoạn ${i + 1}/${tasks.length} với giọng ${task.voice}...`;

          const payload = {
            contents: [{
              role: "user",
              parts: [{ text: `${task.styleInstruction ? `[Style: ${task.styleInstruction}]\n` : ''}${task.text}` }]
            }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: task.voice
                  }
                }
              }
            }
          };

          const res = await requestGeminiAudioWithFailover(payload, model, targetKeys, startKeyIndex);
          startKeyIndex = (res.successIdx + 1) % targetKeys.length;
          ttsGlobalKeyPointer = startKeyIndex;

          let base64Audio = null;
          const parts = res.data?.candidates?.[0]?.content?.parts || [];
          for (let p of parts) {
            if (p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('audio/')) {
              base64Audio = p.inlineData.data;
              break;
            }
          }

          if (!base64Audio) throw new Error(`Mô hình không trả về âm thanh ở đoạn ${i + 1}.`);

          let cleanB64 = base64Audio.replace(/-/g, '+').replace(/_/g, '/');
          while (cleanB64.length % 4) cleanB64 += '=';
          const binary = atob(cleanB64);
          const bytes = new Uint8Array(binary.length);
          for (let b = 0; b < binary.length; b++) bytes[b] = binary.charCodeAt(b);

          const parsed = parseWav(bytes);
          if (parsed.sampleRate) sampleRateCaptured = parsed.sampleRate;
          rawPcmChunks.push(parsed.pcmData);
        }

        // Processing & MP3 Encoding
        progressFill.style.width = '92%';
        progressPercent.innerText = '92%';
        progressStatus.innerText = 'Đang ghép nối âm thanh và nén MP3...';

        const mergedPcm = concatPcmArrays(rawPcmChunks);
        const wavBlob = createWavBlob(mergedPcm, sampleRateCaptured);
        ttsMasterWavBlob = wavBlob;

        // MP3 Encoding via lamejs
        let mp3Blob;
        try {
          mp3Blob = encodePcmToMp3Blob(mergedPcm, sampleRateCaptured, 96);
          ttsMasterMp3Blob = mp3Blob;
        } catch (encErr) {
          console.warn("MP3 encoding error, falling back to WAV:", encErr);
          mp3Blob = wavBlob;
          ttsMasterMp3Blob = wavBlob;
        }

        progressFill.style.width = '100%';
        progressPercent.innerText = '100%';
        progressStatus.innerText = '🎉 Hoàn tất!';

        // Update Master Player Deck tags
        const mp3SizeStr = formatFileSize(mp3Blob.size);
        const wavSizeStr = formatFileSize(wavBlob.size);
        if ($('tts-mp3-size-tag')) $('tts-mp3-size-tag').innerText = `(${mp3SizeStr})`;
        if ($('tts-wav-size-tag')) $('tts-wav-size-tag').innerText = `(${wavSizeStr})`;

        // Tải và phát âm thanh mới qua bộ điều khiển an toàn (tự động khôi phục AudioContext & reset decoder)
        await loadAndPlayTTSAudio(mp3Blob, true);

        const voiceLabel = ttsStudioMode === 'single' ? $('tts-voice-select')?.value : `${$('tts-voice-a')?.value} & ${$('tts-voice-b')?.value}`;
        const totalDurationEst = formatDuration(Math.round(mergedPcm.length / (sampleRateCaptured * 2)));

        // Save to IndexedDB
        await ttsDbSave({
          text: rawText.slice(0, 120),
          fullText: rawText,
          mode: ttsStudioMode,
          voice: voiceLabel,
          model,
          sampleRate: sampleRateCaptured,
          duration: totalDurationEst,
          mp3Blob: mp3Blob,
          wavBlob: wavBlob,
          mp3Size: mp3Blob.size,
          wavSize: wavBlob.size,
          createdAt: getNowTime24h()
        });

        await renderTTSHistory();
        showToast(`🎉 Tạo âm thanh thành công! MP3 siêu nhẹ chỉ ${mp3SizeStr} (giảm ${(100 - (mp3Blob.size / wavBlob.size * 100)).toFixed(0)}% so với WAV).`, "success");

      } catch (err) {
        console.error("TTS execution error:", err);
        showToast(`Lỗi tạo âm thanh: ${err.message}`, "danger");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `⚡ Tạo Âm Thanh Gemini`;
        setTimeout(() => {
          progressBox.style.display = 'none';
        }, 3000);
      }
    }

    // Modal Control & Init
    function openTTSStudioModal(initialText = '') {
      resumeTTSAudioContext();
      const modal = $('tts-studio-modal');
      if (!modal) {
        console.error("tts-studio-modal not found!");
        return;
      }
      modal.style.display = 'flex';
      document.body.classList.add('tts-modal-open');
      const oLay = $('modal-overlay');
      if (oLay) oLay.style.display = 'block';

      try {
        // Ensure default active tab on mobile
        if (!modal.getAttribute('data-mobile-tab')) {
          modal.setAttribute('data-mobile-tab', 'editor');
        }
        const curTab = modal.getAttribute('data-mobile-tab') || 'editor';
        document.querySelectorAll('.tts-mobile-nav-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-tab') === curTab);
        });

        // Update Key count info
        const activeKeys = getGoogleKeysList().filter(Boolean);
        const keyInfo = $('tts-key-count-info');
        if (keyInfo) {
          keyInfo.innerText = activeKeys.length > 0 
            ? `✅ Sẵn sàng ${activeKeys.length}/10 Google Keys từ Jarvis AI`
            : `⚠️ Chưa có Google API Key nào trong Jarvis AI`;
          keyInfo.style.color = activeKeys.length > 0 ? '#10b981' : '#ef4444';
        }

        if (initialText) {
          const ed = $('tts-editor-input');
          if (ed) {
            ed.value = initialText;
            updateTTSMetrics();
          }
          // Auto-detect dialogue markers
          if (/^(?:A|Speaker\s*A|\[A\]|\[Speaker\s*A\])\s*:/im.test(initialText) && /^(?:B|Speaker\s*B|\[B\]|\[Speaker\s*B\])\s*:/im.test(initialText)) {
            setTTSStudioMode('dialogue');
          }
        }

        // Khôi phục phương ngữ ưa thích (mặc định Nam chuẩn Sài Gòn)
        const dialectSelect = $('tts-dialect-select');
        if (dialectSelect && ($('tts-lang-select')?.value === 'vi' || !$('tts-lang-select'))) {
          const savedDialect = ls.getItem('tts_dialect_pref') || 'Nam chuẩn Sài Gòn';
          dialectSelect.value = savedDialect;
        }

        renderTTSHistory();
      } catch (err) {
        console.warn("TTS open modal error:", err);
      }
    }

    function closeTTSStudioModal() {
      const modal = $('tts-studio-modal');
      if (modal) modal.style.display = 'none';
      document.body.classList.remove('tts-modal-open');
      const oLay = $('modal-overlay');
      if (oLay) oLay.style.display = 'none';
      const audioEl = $('tts-audio-element');
      if (audioEl) {
        try { audioEl.pause(); } catch (_) {}
      }
      if (ttsAudioCtx && ttsAudioCtx.state === 'running') {
        ttsAudioCtx.suspend().catch(() => {});
      }
    }

    window.openTTSStudioModal = openTTSStudioModal;
    window.closeTTSStudioModal = closeTTSStudioModal;

    function initTTSStudio() {
      // Header and Toolbar buttons
      if ($('btn-tts-studio-header')) $('btn-tts-studio-header').onclick = () => openTTSStudioModal();
      if ($('btn-open-tts-studio')) $('btn-open-tts-studio').onclick = () => openTTSStudioModal();
      if ($('btn-close-tts-studio')) $('btn-close-tts-studio').onclick = closeTTSStudioModal;

      // Mode pills
      if ($('tts-mode-single-btn')) $('tts-mode-single-btn').onclick = () => setTTSStudioMode('single');
      if ($('tts-mode-dialogue-btn')) $('tts-mode-dialogue-btn').onclick = () => setTTSStudioMode('dialogue');

      // Mobile nav tabs
      document.querySelectorAll('.tts-mobile-nav-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.tts-mobile-nav-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tab = btn.getAttribute('data-tab');
          const modal = $('tts-studio-modal');
          if (modal) modal.setAttribute('data-mobile-tab', tab);
        };
      });

      // Presets
      if ($('tts-preset-news')) $('tts-preset-news').onclick = () => {
        setTTSStudioMode('single');
        $('tts-editor-input').value = TTS_PRESETS.news;
        updateTTSMetrics();
      };
      if ($('tts-preset-story')) $('tts-preset-story').onclick = () => {
        setTTSStudioMode('single');
        $('tts-editor-input').value = TTS_PRESETS.story;
        updateTTSMetrics();
      };
      if ($('tts-preset-ads')) $('tts-preset-ads').onclick = () => {
        setTTSStudioMode('single');
        $('tts-editor-input').value = TTS_PRESETS.ads;
        updateTTSMetrics();
      };
      if ($('tts-preset-podcast')) $('tts-preset-podcast').onclick = () => {
        setTTSStudioMode('dialogue');
        $('tts-editor-input').value = TTS_PRESETS.podcast;
        updateTTSMetrics();
      };
      if ($('tts-clear-btn')) $('tts-clear-btn').onclick = () => {
        $('tts-editor-input').value = '';
        updateTTSMetrics();
      };

      // Expression tags
      document.querySelectorAll('.tts-expr-btn').forEach(btn => {
        btn.onclick = () => {
          const tag = btn.getAttribute('data-tag');
          if (tag) insertTTSExpression(tag);
        };
      });

      // Editor input metrics
      if ($('tts-editor-input')) {
        $('tts-editor-input').addEventListener('input', updateTTSMetrics);
      }

      // Generate action
      if ($('btn-generate-audio')) $('btn-generate-audio').onclick = executeTTSWorkflow;

      // Download actions
      if ($('btn-download-mp3')) {
        $('btn-download-mp3').onclick = () => {
          if (!ttsMasterMp3Blob && !ttsMasterWavBlob) return showToast("Chưa có âm thanh để tải!", "warning");
          const blob = ttsMasterMp3Blob || ttsMasterWavBlob;
          saveOrShareBlob(blob, `Jarvis_TTS_${Date.now()}.mp3`);
        };
      }
      if ($('btn-download-wav')) {
        $('btn-download-wav').onclick = () => {
          if (!ttsMasterWavBlob && !ttsMasterMp3Blob) return showToast("Chưa có âm thanh để tải!", "warning");
          const blob = ttsMasterWavBlob || ttsMasterMp3Blob;
          saveOrShareBlob(blob, `Jarvis_TTS_${Date.now()}.wav`);
        };
      }

      // Audio element listeners & playback speed
      const audioEl = $('tts-audio-element');
      if (audioEl) {
        if ($('tts-playback-speed-select')) {
          $('tts-playback-speed-select').onchange = (e) => {
            audioEl.playbackRate = parseFloat(e.target.value) || 1.0;
          };
        }
        audioEl.addEventListener('play', () => resumeTTSAudioContext());
        audioEl.addEventListener('playing', () => resumeTTSAudioContext());
        audioEl.onerror = () => {
          console.warn("audioEl decoding error:", audioEl.error?.code, audioEl.error?.message);
          if (ttsMasterWavBlob && !audioEl.dataset.retriedWav) {
            audioEl.dataset.retriedWav = '1';
            console.log("Tự động chuyển sang file gốc WAV để giải mã...");
            loadAndPlayTTSAudio(ttsMasterWavBlob, true);
          }
        };
      }

      // Clear history
      if ($('btn-clear-tts-history')) {
        $('btn-clear-tts-history').onclick = async () => {
          if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử âm thanh?")) return;
          await ttsDbClearAll();
          renderTTSHistory();
          showToast("Đã xóa toàn bộ thư viện âm thanh.", "info");
        };
      }

      // Language dialect switcher & persistence
      const dialectSelect = $('tts-dialect-select');
      if (dialectSelect) {
        const savedDialect = ls.getItem('tts_dialect_pref') || 'Nam chuẩn Sài Gòn';
        dialectSelect.value = savedDialect;
        dialectSelect.addEventListener('change', (e) => {
          if ($('tts-lang-select')?.value === 'vi') {
            ls.setItem('tts_dialect_pref', e.target.value);
          }
        });
      }

      if ($('tts-lang-select')) {
        $('tts-lang-select').onchange = (e) => {
          const lang = e.target.value;
          const dialectSelect = $('tts-dialect-select');
          if (!dialectSelect) return;
          if (lang === 'vi') {
            const savedDialect = ls.getItem('tts_dialect_pref') || 'Nam chuẩn Sài Gòn';
            dialectSelect.innerHTML = `
              <option value="Nam chuẩn Sài Gòn">Giọng Miền Nam (Sài Gòn truyền cảm)</option>
              <option value="Bắc chuẩn Hà Nội">Giọng Miền Bắc (Hà Nội chuẩn)</option>
              <option value="Trung Huế - Đà Nẵng">Giọng Miền Trung (Huế / Đà Nẵng)</option>
              <option value="Phát thanh toàn quốc">Giọng Phát thanh toàn quốc chuẩn</option>
            `;
            dialectSelect.value = savedDialect;
            if ($('tts-dialect-group')) $('tts-dialect-group').style.display = 'flex';
          } else {
            dialectSelect.innerHTML = `
              <option value="Standard" selected>Standard Native Accent</option>
              <option value="Expressive">Expressive / Emotional</option>
            `;
          }
        };
      }
    }

    window.initTTSStudio = initTTSStudio;
    initTTSStudio();
