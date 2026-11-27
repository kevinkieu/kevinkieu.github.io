// Phase 3 message TTS (extracted from app.js)
function stopCurrentSpeaking() {
  currentSpeakingAbort = true;
  if (currentSpeakingAudio) {
    try {
      currentSpeakingAudio.pause();
      currentSpeakingAudio.currentTime = 0;
      currentSpeakingAudio.src = '';
    } catch {}
    currentSpeakingAudio = null;
  }
  currentSpeakingUrls.forEach(u => {
    try {
      URL.revokeObjectURL(u);
    } catch {}
  });
  currentSpeakingUrls = [];
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (currentSpeakingBtn) {
    currentSpeakingBtn.innerHTML =
      currentSpeakingBtn.getAttribute('data-original-html') || '🔊 Nghe';
    currentSpeakingBtn.classList.remove('speaking-active');
    currentSpeakingBtn = null;
  }
}
if (typeof stopCurrentSpeaking !== 'undefined') window.stopCurrentSpeaking = stopCurrentSpeaking;

async function playTextAudio(rawText, options = {}) {
  const { btn = null, onStart = null, onEnd = null, onError = null } = options;
  stopCurrentSpeaking();

  const clean = window.sanitizeTranscript(rawText);
  if (!clean) {
    if (btn) showToast('Không có nội dung văn bản để đọc!', 'warning');
    if (onError) onError(new Error('Empty text'));
    return;
  }

  if (btn) {
    if (!btn.getAttribute('data-original-html')) {
      btn.setAttribute('data-original-html', btn.innerHTML);
    }
    btn.innerHTML = '⏳ Đang nạp...';
    btn.classList.add('speaking-active');
    currentSpeakingBtn = btn;
  }
  if (onStart) onStart();

  currentSpeakingAbort = false;
  const chunks = window.splitTextIntoSmartChunks(clean, 850);
  const isVietnamese =
    /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
  const activeKeys = window.getGoogleKeysList().filter(Boolean);

  // 1. Thử đọc bằng Gemini TTS chất lượng cao với chuỗi đoạn liên tục (Pipeline Streaming Queue)
  if (activeKeys.length > 0) {
    try {
      const voicePref = $('tts-voice-select')?.value || ls.getItem('jarvis_tts_voice') || 'Charon';
      const ttsModel = $('tts-model-select')?.value || 'gemini-3.8-flash-lite-tts';

      const reqFn =
        typeof window.requestGeminiAudioWithFailover === 'function'
          ? window.requestGeminiAudioWithFailover
          : null;
      if (!reqFn) throw new Error('Thư viện Gemini TTS chưa sẵn sàng');

      const fetchChunkAudioUrl = async textChunk => {
        if (currentSpeakingAbort) return null;
        const payload = {
          systemInstruction: {
            parts: [
              {
                text: 'Bạn là trợ lý AI Jarvis với giọng nam giới Nam Bộ. Hãy đọc toàn bộ văn bản được cung cấp với phát âm tiếng Việt chuẩn phương ngữ Nam Bộ (miền Nam Việt Nam), ngữ điệu tự nhiên, ấm áp, thân thiện, gần gũi, rõ ràng từng chữ, tuyệt đối không dùng giọng robot hay giọng người nước ngoài.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: textChunk }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voicePref,
                },
              },
            },
          },
        };
        const res = await reqFn(payload, ttsModel, activeKeys, 0);
        let base64Audio = res.outputAudioData || res.data?.output_audio?.data || null;
        if (!base64Audio) {
          const parts = res.data?.candidates?.[0]?.content?.parts || [];
          for (let p of parts) {
            if (
              p.inlineData &&
              p.inlineData.mimeType &&
              p.inlineData.mimeType.startsWith('audio/')
            ) {
              base64Audio = p.inlineData.data;
              break;
            }
          }
        }
        if (!base64Audio) throw new Error('Không nhận được dữ liệu âm thanh');

        let cleanB64 = base64Audio.replace(/-/g, '+').replace(/_/g, '/');
        while (cleanB64.length % 4) cleanB64 += '=';
        const binary = atob(cleanB64);
        const bytes = new Uint8Array(binary.length);
        for (let b = 0; b < binary.length; b++) bytes[b] = binary.charCodeAt(b);

        const wavBlob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(wavBlob);
        currentSpeakingUrls.push(url);
        return url;
      };

      // Tải trước đoạn 1
      let currentAudioUrl = await fetchChunkAudioUrl(chunks[0]);
      if (currentSpeakingAbort || !currentAudioUrl) return;

      let currentChunkIdx = 0;
      let nextChunkPromise = chunks.length > 1 ? fetchChunkAudioUrl(chunks[1]) : null;

      const playCurrentChunk = async () => {
        if (currentSpeakingAbort) return;

        const audio = new Audio(currentAudioUrl);
        currentSpeakingAudio = audio;
        if (btn) {
          btn.innerHTML =
            chunks.length > 1 ? `⏹️ Dừng (${currentChunkIdx + 1}/${chunks.length})` : `⏹️ Dừng`;
        }

        audio.onended = async () => {
          if (currentSpeakingAbort) return;
          currentChunkIdx++;
          if (currentChunkIdx < chunks.length) {
            try {
              currentAudioUrl = nextChunkPromise
                ? await nextChunkPromise
                : await fetchChunkAudioUrl(chunks[currentChunkIdx]);
            } catch (cErr) {
              console.warn(`Lỗi nạp đoạn âm thanh ${currentChunkIdx + 1}:`, cErr);
              currentAudioUrl = null;
            }

            if (currentChunkIdx + 1 < chunks.length) {
              nextChunkPromise = fetchChunkAudioUrl(chunks[currentChunkIdx + 1]).catch(() => null);
            } else {
              nextChunkPromise = null;
            }

            if (currentAudioUrl && !currentSpeakingAbort) {
              await playCurrentChunk();
            } else {
              stopCurrentSpeaking();
              if (onEnd) onEnd();
            }
          } else {
            stopCurrentSpeaking();
            if (onEnd) onEnd();
          }
        };

        audio.onerror = e => {
          stopCurrentSpeaking();
          if (onError) onError(e);
        };

        await audio.play();
      };

      await playCurrentChunk();
      return;
    } catch (e) {
      console.warn('Gemini TTS phát nhanh lỗi, chuyển sang Web Speech API:', e);
    }
  }

  // 2. Dự phòng: Web Speech API của trình duyệt (đọc tuần tự từng đoạn, không bao giờ ngắt ngang)
  if (!('speechSynthesis' in window)) {
    stopCurrentSpeaking();
    if (onError) onError(new Error('No Web Speech'));
    return showToast('Trình duyệt không hỗ trợ đọc giọng nói!', 'warning');
  }

  const voices = window.speechSynthesis.getVoices();
  let viVoice = null;
  if (isVietnamese) {
    viVoice = voices.find(
      v =>
        (v.lang && (v.lang.startsWith('vi') || v.lang.includes('vi'))) ||
        (v.name &&
          (v.name.toLowerCase().includes('vietnam') ||
            v.name.toLowerCase().includes('vietnamese') ||
            v.name.toLowerCase().includes('tiếng việt') ||
            v.name.toLowerCase().includes('an') ||
            v.name.toLowerCase().includes('linh') ||
            v.name.toLowerCase().includes('mai')))
    );
    if (!viVoice) {
      stopCurrentSpeaking();
      if (onError) onError(new Error('Không có giọng đọc tiếng Việt'));
      return showToast(
        '⚠️ Trình duyệt chưa có sẵn giọng đọc tiếng Việt và Gemini TTS chưa phản hồi. Vui lòng kiểm tra kết nối API Key!',
        'warning'
      );
    }
  }

  let wsIdx = 0;
  const playNextWebSpeech = () => {
    if (currentSpeakingAbort || wsIdx >= chunks.length) {
      stopCurrentSpeaking();
      if (onEnd) onEnd();
      return;
    }

    const utter = new SpeechSynthesisUtterance(chunks[wsIdx]);
    if (isVietnamese) {
      utter.lang = 'vi-VN';
      if (viVoice) utter.voice = viVoice;
    } else {
      utter.lang = 'en-US';
      const enVoice = voices.find(v => v.lang && v.lang.startsWith('en'));
      if (enVoice) utter.voice = enVoice;
    }
    utter.rate = 1.05;

    utter.onend = () => {
      if (currentSpeakingAbort) return;
      wsIdx++;
      playNextWebSpeech();
    };

    utter.onerror = e => {
      stopCurrentSpeaking();
      if (onError) onError(e);
    };

    if (btn) {
      btn.innerHTML = chunks.length > 1 ? `⏹️ Dừng (${wsIdx + 1}/${chunks.length})` : `⏹️ Dừng`;
    }

    window.speechSynthesis.speak(utter);
  };

  playNextWebSpeech();
}
if (typeof playTextAudio !== 'undefined') window.playTextAudio = playTextAudio;

window.toggleSpeakMsg = async (btn, i) => {
  if (currentSpeakingBtn === btn) {
    stopCurrentSpeaking();
    return;
  }
  const raw = chatHistory[i]?.text || '';
  const cleanRaw = stripThinkingForCopy(raw);
  playTextAudio(cleanRaw, { btn });
};
