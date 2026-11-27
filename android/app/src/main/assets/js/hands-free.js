// Phase 3 hands-free (extracted from app.js)
function stopHandsFreeVoice() {
  if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
  }
  isHandsFreeActive = false;
  isHandsFreeSpeaking = false;
  isHandsFreeUserTalking = false;
  handsFreeSpeechStartTime = 0;

  if (handsFreeVadInterval) {
    clearInterval(handsFreeVadInterval);
    handsFreeVadInterval = null;
  }

  if (handsFreeTranscribeController) {
    try {
      handsFreeTranscribeController.abort();
    } catch (_) {}
    handsFreeTranscribeController = null;
  }

  if (handsFreeRecorder && handsFreeRecorder.state !== 'inactive') {
    try {
      handsFreeRecorder.onstop = null;
      handsFreeRecorder.stop();
    } catch (_) {}
  }
  handsFreeRecorder = null;
  handsFreeAudioChunks = [];

  if (handsFreeMediaStream) {
    try {
      handsFreeMediaStream.getTracks().forEach(track => track.stop());
    } catch (_) {}
    handsFreeMediaStream = null;
  }

  if (handsFreeAudioCtx && handsFreeAudioCtx.state !== 'closed') {
    try {
      handsFreeAudioCtx.close();
    } catch (_) {}
    handsFreeAudioCtx = null;
  }
  handsFreeAnalyser = null;
  stopCurrentSpeaking();

  const banner = $('hands-free-banner');
  if (banner) banner.style.display = 'none';

  const micBtn = $('btn-hands-free-voice');
  if (micBtn) micBtn.classList.remove('active');

  const chipBtn = $('btn-toggle-hands-free-chip');
  if (chipBtn) chipBtn.classList.remove('active');

  const btnSendHf = $('btn-send-hands-free');
  if (btnSendHf) btnSendHf.style.display = 'none';
}
if (typeof stopHandsFreeVoice !== 'undefined') window.stopHandsFreeVoice = stopHandsFreeVoice;

async function processHandsFreeAudioBlob(blob) {
  if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;
  const statusText = $('hf-status-text');
  const preview = $('hf-transcript-preview');
  const btnSendHf = $('btn-send-hands-free');
  if (btnSendHf) btnSendHf.style.display = 'none';

  try {
    if (statusText)
      statusText.innerHTML =
        '<span style="color:#8b5cf6;font-weight:600;">⚡ Đang chuyển giọng nói thành chữ...</span>';

    // 1. Chuyển Blob sang base64
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const res = reader.result;
        const b64 = typeof res === 'string' ? res.split(',')[1] : '';
        resolve(b64);
      };
      reader.onerror = reject;
    });
    reader.readAsDataURL(blob);
    const base64Data = await base64Promise;

    if (!base64Data) throw new Error('Không thể đọc dữ liệu âm thanh');

    // 2. Chuẩn hóa MIME type bare (Gemini API bắt buộc MIME type thuần, không có tham số ;codecs=...)
    let rawType = (blob.type || handsFreeRecorder?.mimeType || 'audio/webm').toLowerCase();
    let cleanMime = rawType.split(';')[0].trim();
    if (cleanMime.includes('webm')) cleanMime = 'audio/webm';
    else if (cleanMime.includes('mp4') || cleanMime.includes('m4a') || cleanMime.includes('aac'))
      cleanMime = 'audio/mp4';
    else if (cleanMime.includes('wav')) cleanMime = 'audio/wav';
    else if (cleanMime.includes('ogg')) cleanMime = 'audio/ogg';
    else cleanMime = 'audio/webm';

    // 3. Lấy danh sách API Key hợp lệ (Giải mã nếu có tiền tố mã hóa, tuyệt đối không gọi getGoogleKeysList(true))
    let availableKeys =
      typeof apiKeys !== 'undefined' && Array.isArray(apiKeys) && apiKeys.length
        ? [...apiKeys]
        : [];
    if (!availableKeys.length) {
      const raw = window.getGoogleKeysList(false).filter(Boolean);
      availableKeys = raw
        .map(k => {
          let clean = (k || '').trim();
          if (clean.startsWith('JVENC_') || clean.startsWith('ENC_')) clean = deobfuscateKey(clean);
          return clean;
        })
        .filter(Boolean);
    }

    if (!availableKeys.length) {
      showToast('Cần ít nhất 1 Google API Key trong Cài đặt!', 'danger');
      stopHandsFreeVoice();
      return;
    }

    // Ưu tiên key đang gán cho phiên hiện tại, sau đó đến các key còn lại
    const currentSession = sessions.find(x => x.id === activeId);
    const preferredKey =
      typeof getSessionApiKey === 'function' ? getSessionApiKey(currentSession) : null;
    const candidateKeys = [];
    if (preferredKey && availableKeys.includes(preferredKey)) candidateKeys.push(preferredKey);
    for (const k of availableKeys) {
      if (!candidateKeys.includes(k)) candidateKeys.push(k);
    }

    // 4. Chuyển giọng nói sang văn bản tiếng Việt với cơ chế Xoay Key & Fallback Model Flash-Lite (thinking tắt hoàn toàn)
    handsFreeTranscribeController = new AbortController();
    const candidateTranscribeModels = AUX_FALLBACK_MODELS;
    let spokenText = '';
    let lastErr = null;

    keyLoop: for (let kIdx = 0; kIdx < candidateKeys.length; kIdx++) {
      const activeKey = candidateKeys[kIdx];
      let ai;
      try {
        ai = new GoogleGenAI({ apiKey: activeKey });
      } catch (initErr) {
        lastErr = initErr;
        continue;
      }

      for (const mod of candidateTranscribeModels) {
        try {
          const res = await ai.models.generateContent({
            model: mod,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: base64Data,
                    },
                  },
                  {
                    text: 'Nghe đoạn ghi âm tiếng Việt này và chỉ chép lại đúng văn bản những gì người nói. Tuyệt đối không thêm lời dẫn, không giải thích, không dùng ngoặc kép.',
                  },
                ],
              },
            ],
            config: {
              maxOutputTokens: 500,
            },
          });
          spokenText = (res.text || '').trim();
          if (!spokenText && res.candidates?.[0]?.content?.parts) {
            spokenText = res.candidates[0].content.parts
              .map(p => p.text || '')
              .join('')
              .trim();
          }
          if (spokenText) break keyLoop;
        } catch (tErr) {
          lastErr = tErr;
          console.warn(
            `[HandsFree STT] Key #${kIdx + 1} (${activeKey.substring(0, 6)}...) - Model ${mod} lỗi (${cleanMime}):`,
            tErr.message
          );
        }
      }
    }

    // Nếu tất cả key & model đều lỗi (ví dụ rớt mạng hoàn toàn)
    if (!spokenText && lastErr) {
      console.error('[HandsFree STT] Thất bại chuyển âm thanh:', lastErr);
      if (statusText)
        statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">❌ Lỗi: ${lastErr.message || 'Thất bại'}</span>`;
      setTimeout(() => {
        if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
          startHandsFreeRecorder();
        }
      }, 1200);
      return;
    }

    spokenText = spokenText
      .replace(
        /^(người dùng nói|người nói|câu nói|văn bản|nội dung|bản chép|transcript|transcription):\s*/i,
        ''
      )
      .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
      .trim();

    // 5. Nếu không có từ nào rõ ràng (tiếng thở, tiếng ồn nhẹ): Tiếp tục lắng nghe
    if (!spokenText) {
      console.info('[HandsFree] Không phát hiện từ ngữ rõ ràng.');
      if (statusText)
        statusText.innerHTML =
          '<span style="color:var(--text-muted);">👂 Chưa nghe rõ, đang lắng nghe lại...</span>';
      setTimeout(() => {
        if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
          startHandsFreeRecorder();
        }
      }, 350);
      return;
    }

    // 6. Cập nhật giao diện & gán nội dung vào ô nhập text
    if (preview) {
      preview.innerText = `"${spokenText}"`;
      preview.title = spokenText;
    }
    if (statusText) {
      statusText.innerHTML = `<span style="color:#6366f1;font-weight:600;">✍️ Đã nghe: "${spokenText.slice(0, 32)}${spokenText.length > 32 ? '...' : ''}"</span>`;
    }

    DOM.input.value = spokenText;
    DOM.input.style.height = 'auto';
    DOM.input.style.height = Math.min(DOM.input.scrollHeight, 180) + 'px';
    DOM.input.dispatchEvent(new Event('input'));

    if (statusText)
      statusText.innerHTML =
        '<span style="color:#8b5cf6;font-weight:600;">🚀 Đang gửi cho Jarvis...</span>';
    DOM.sendBtn.click();
  } catch (err) {
    console.error('Lỗi chuyển đổi giọng nói rảnh tay:', err);
    if (statusText)
      statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">⚠️ Lỗi: ${err.message || 'Thử lại'}</span>`;
    setTimeout(() => {
      if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
        startHandsFreeRecorder();
      }
    }, 800);
  } finally {
    handsFreeTranscribeController = null;
  }
}

async function startHandsFreeRecorder() {
  if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;

  const statusText = $('hf-status-text');
  const btnSendHf = $('btn-send-hands-free');

  try {
    // Dừng recorder cũ nếu còn đang chạy
    if (handsFreeRecorder && handsFreeRecorder.state !== 'inactive') {
      try {
        handsFreeRecorder.onstop = null;
        handsFreeRecorder.stop();
      } catch (_) {}
    }
    if (handsFreeVadInterval) {
      clearInterval(handsFreeVadInterval);
      handsFreeVadInterval = null;
    }

    // Khởi tạo MediaStream (chuẩn micro phần cứng, chạy mượt trên Android/iOS Safari/PWA)
    if (!handsFreeMediaStream || !handsFreeMediaStream.active) {
      handsFreeMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    }

    // Khởi tạo AudioContext để phân tích năng lượng giọng nói thời gian thực (VAD)
    if (!handsFreeAudioCtx || handsFreeAudioCtx.state === 'closed') {
      handsFreeAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (handsFreeAudioCtx.state === 'suspended') {
      await handsFreeAudioCtx.resume();
    }

    const source = handsFreeAudioCtx.createMediaStreamSource(handsFreeMediaStream);
    handsFreeAnalyser = handsFreeAudioCtx.createAnalyser();
    handsFreeAnalyser.fftSize = 512;
    source.connect(handsFreeAnalyser);

    // Tìm mimeType hỗ trợ trên thiết bị (ưu tiên Opus WebM, fallback MP4 cho iOS)
    let mimeType = 'audio/webm;codecs=opus';
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }
    }

    handsFreeAudioChunks = [];
    const options = mimeType ? { mimeType } : undefined;
    handsFreeRecorder = new MediaRecorder(handsFreeMediaStream, options);

    handsFreeRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        handsFreeAudioChunks.push(e.data);
      }
    };

    handsFreeRecorder.onstop = async () => {
      if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing) return;
      const blobType = handsFreeRecorder?.mimeType || mimeType || 'audio/webm';
      const recordedBlob = new Blob(handsFreeAudioChunks, { type: blobType });
      handsFreeAudioChunks = [];

      if (recordedBlob.size > 300 && isHandsFreeUserTalking) {
        await processHandsFreeAudioBlob(recordedBlob);
      } else {
        // Chưa có âm thanh hợp lệ, tiếp tục lượt nghe mới
        if (isHandsFreeActive && !isHandsFreeSpeaking && !isProcessing) {
          setTimeout(() => startHandsFreeRecorder(), 150);
        }
      }
    };

    handsFreeRecorder.start(250);
    isHandsFreeUserTalking = false;
    handsFreeSpeechStartTime = 0;

    if (statusText)
      statusText.innerHTML =
        '<span style="color:#10b981;font-weight:600;">🟢 Đang lắng nghe... (Hãy nói)</span>';
    if (btnSendHf) btnSendHf.style.display = 'none';

    // Voice Activity Detection (VAD) Loop: kiểm tra mỗi 60ms
    const pcmData = new Uint8Array(handsFreeAnalyser.frequencyBinCount);
    let consecutiveSilenceMs = 0;
    const VAD_THRESHOLD = 7; // Ngưỡng âm lượng nhạy cho dải tần số tiếng người (80Hz - 3800Hz)
    const SILENCE_COMMIT_MS = 950; // Gần 1 giây im lặng là hoàn tất câu nói

    handsFreeVadInterval = setInterval(() => {
      if (!isHandsFreeActive || isHandsFreeSpeaking || isProcessing || !handsFreeAnalyser) {
        return;
      }

      handsFreeAnalyser.getByteFrequencyData(pcmData);
      // Tập trung vào dải tần số tiếng người (80Hz - 3800Hz, bins 1 đến 45)
      let voiceSum = 0;
      const voiceBins = Math.min(45, pcmData.length);
      for (let i = 1; i < voiceBins; i++) voiceSum += pcmData[i];
      const voiceEnergy = voiceSum / (voiceBins - 1);

      if (voiceEnergy > VAD_THRESHOLD) {
        consecutiveSilenceMs = 0;
        if (!isHandsFreeUserTalking) {
          isHandsFreeUserTalking = true;
          handsFreeSpeechStartTime = Date.now();
          if (statusText)
            statusText.innerHTML =
              '<span style="color:#3b82f6;font-weight:600;">🎙️ Đang nghe giọng nói...</span>';
          if (btnSendHf) btnSendHf.style.display = 'inline-flex';
        }
      } else if (isHandsFreeUserTalking) {
        consecutiveSilenceMs += 60;
        const isOverMax = Date.now() - handsFreeSpeechStartTime > 25000;
        if (consecutiveSilenceMs >= SILENCE_COMMIT_MS || isOverMax) {
          clearInterval(handsFreeVadInterval);
          handsFreeVadInterval = null;
          if (statusText)
            statusText.innerHTML =
              '<span style="color:#f59e0b;font-weight:600;">⏳ Đang hoàn tất câu nói...</span>';
          if (handsFreeRecorder && handsFreeRecorder.state === 'recording') {
            handsFreeRecorder.stop();
          }
        }
      }
    }, 60);
  } catch (err) {
    console.error('Lỗi bật micro phần cứng:', err);
    if (statusText)
      statusText.innerHTML = `<span style="color:#ef4444;font-weight:600;">❌ Lỗi Micro: ${err.message || 'Bị chặn quyền'}</span>`;
    showToast(
      'Không thể truy cập Microphone! Hãy cấp quyền micro trong cài đặt điện thoại hoặc trình duyệt.',
      'danger'
    );
    stopHandsFreeVoice();
  }
}
if (typeof startHandsFreeRecorder !== 'undefined')
  window.startHandsFreeRecorder = startHandsFreeRecorder;
window.startHandsFreeListener = startHandsFreeRecorder;

function commitAndSendHandsFree() {
  if (handsFreeVadInterval) {
    clearInterval(handsFreeVadInterval);
    handsFreeVadInterval = null;
  }
  isHandsFreeUserTalking = true;
  if (handsFreeRecorder && handsFreeRecorder.state === 'recording') {
    const statusText = $('hf-status-text');
    if (statusText)
      statusText.innerHTML =
        '<span style="color:#f59e0b;font-weight:600;">⏳ Đang gửi ngay...</span>';
    handsFreeRecorder.stop();
  }
}
if (typeof commitAndSendHandsFree !== 'undefined')
  window.commitAndSendHandsFree = commitAndSendHandsFree;

async function toggleHandsFreeVoice(forceState) {
  if (typeof window.isLiveActive === 'function' && window.isLiveActive()) {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
    showToast('Đã dừng đàm thoại Live rảnh tay.', 'info');
    return;
  }

  if (forceState === false) {
    if (typeof window.endLiveCall === 'function') window.endLiveCall();
    stopHandsFreeVoice();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return showToast('Thiết bị không hỗ trợ truy cập Microphone phần cứng!', 'warning');
  }

  if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
    return showToast('Microphone yêu cầu kết nối bảo mật (HTTPS hoặc localhost)!', 'warning');
  }

  // Kích hoạt engine Live Call dạng Mini-Bar trực tiếp trong giao diện chat
  if (typeof window.startLiveVoiceCall === 'function') {
    window.startLiveVoiceCall({ miniBar: true });
    showToast('⚡ Đã bật Đàm thoại Live siêu tốc (WebSocket 2 chiều)!', 'success');
    return;
  }

  // Dự phòng nếu Live Call chưa sẵn sàng
  stopHandsFreeVoice();
  isHandsFreeActive = true;

  const banner = $('hands-free-banner');
  if (banner) banner.style.display = 'flex';

  const micBtn = $('btn-hands-free-voice');
  if (micBtn) micBtn.classList.add('active');

  const chipBtn = $('btn-toggle-hands-free-chip');
  if (chipBtn) chipBtn.classList.add('active');

  const statusText = $('hf-status-text');
  if (statusText)
    statusText.innerHTML =
      '<span style="color:#10b981;font-weight:600;">🟢 Đang kết nối micro...</span>';

  const preview = $('hf-transcript-preview');
  if (preview) preview.innerText = '';

  const btnSendHf = $('btn-send-hands-free');
  if (btnSendHf) btnSendHf.style.display = 'none';

  // Mở khóa âm thanh trước cho trình duyệt điện thoại (iOS Safari & Android Chrome)
  try {
    const unlockAudio = new Audio(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
    );
    unlockAudio.play().catch(() => {});
  } catch (_) {}

  await startHandsFreeRecorder();
  showToast('🎙️ Đã bật Đàm thoại Rảnh tay 2 chiều liên tục!', 'success');
}
if (typeof toggleHandsFreeVoice !== 'undefined') window.toggleHandsFreeVoice = toggleHandsFreeVoice;
if (typeof stopHandsFreeVoice !== 'undefined') window.stopHandsFreeVoice = stopHandsFreeVoice;
if (typeof processHandsFreeAudioBlob !== 'undefined')
  window.processHandsFreeAudioBlob = processHandsFreeAudioBlob;
if (typeof startHandsFreeRecorder !== 'undefined')
  window.startHandsFreeRecorder = startHandsFreeRecorder;
if (typeof commitAndSendHandsFree !== 'undefined')
  window.commitAndSendHandsFree = commitAndSendHandsFree;
