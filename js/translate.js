/* ==========================================================================
   Jarvis AI - Dual-Screen Face-to-Face Live Translator Module (js/translate.js)
   Powered by Gemini Live Translate (gemini-3.5-live-translate-preview)
   ========================================================================== */

(function() {
  'use strict';

  // --- MODEL & STATE ---
  const TRANSLATE_MODEL = "models/gemini-3.5-live-translate-preview";
  let translateWs = null;
  let translateAudioCtx = null;
  let translateMediaStream = null;
  let translateScriptProcessor = null;
  let translateMicSource = null;
  let translateSilentGain = null;
  let translatePlaybackState = { nextPlayTime: 0, activeSources: [] };

  // Current active speaker: 'user' (nói tiếng Việt -> dịch ra tiếng khách) hoặc 'guest' (khách nói tiếng nước ngoài -> dịch ra tiếng Việt)
  let currentSpeaker = null;
  let isTranslateWsReady = false;
  let currentSessionTargetLang = 'en';

  // Supported languages list with BCP-47 codes & flags
  const SUPPORTED_LANGS = [
    { code: 'en', flag: '🇺🇸', name: 'English (US)' },
    { code: 'zh-Hans', flag: '🇨🇳', name: '中文 (Giản thể)' },
    { code: 'zh-Hant', flag: '🇹🇼', name: '繁體中文 (Phồn thể)' },
    { code: 'ja', flag: '🇯🇵', name: '日本語 (Tiếng Nhật)' },
    { code: 'ko', flag: '🇰🇷', name: '한국어 (Tiếng Hàn)' },
    { code: 'fr', flag: '🇫🇷', name: 'Français (Tiếng Pháp)' },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch (Tiếng Đức)' },
    { code: 'th', flag: '🇹🇭', name: 'ไทย (Tiếng Thái)' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский (Tiếng Nga)' },
    { code: 'es', flag: '🇪🇸', name: 'Español (Tây Ban Nha)' },
    { code: 'it', flag: '🇮🇹', name: 'Italiano (Tiếng Ý)' },
    { code: 'pt-BR', flag: '🇧🇷', name: 'Português (Brazil)' },
    { code: 'id', flag: '🇮🇩', name: 'Bahasa Indonesia' },
    { code: 'ms', flag: '🇲🇾', name: 'Bahasa Melayu' },
    { code: 'hi', flag: '🇮🇳', name: 'हिन्दी (Tiếng Hindi)' },
    { code: 'ar', flag: '🇸🇦', name: 'العربية (Ả Rập)' },
    { code: 'tr', flag: '🇹🇷', name: 'Türkçe (Thổ Nhĩ Kỳ)' },
    { code: 'nl', flag: '🇳🇱', name: 'Nederlands (Hà Lan)' },
    { code: 'pl', flag: '🇵🇱', name: 'Polski (Ba Lan)' }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function getApiKey() {
    const apiKeys = window.apiKeys || [];
    const idx = (window.liveKeyIndex || 0) % (apiKeys.length || 1);
    if (apiKeys.length) return apiKeys[idx];
    const ls = window.ls || localStorage;
    for (let i = 1; i <= 10; i++) {
      let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || '').trim();
      if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
        if (typeof window.deobfuscateKey === 'function') k = window.deobfuscateKey(k);
      }
      if (k) return k;
    }
    return '';
  }

  function downsampleTo16k(inputData, inputSampleRate) {
    const ratio = inputSampleRate / 16000;
    const length = Math.floor(inputData.length / ratio);
    const result = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const originalIndex = Math.floor(i * ratio);
      let s = Math.max(-1, Math.min(1, inputData[originalIndex]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return new Uint8Array(result.buffer);
  }

  function playPcm24kAudio(b64) {
    if (!translateAudioCtx) return;
    try {
      const bin = atob(b64), b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(b.buffer), f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
      const ab = translateAudioCtx.createBuffer(1, f32.length, 24000);
      ab.copyToChannel(f32, 0);
      const src = translateAudioCtx.createBufferSource();
      src.buffer = ab;
      src.connect(translateAudioCtx.destination);
      translatePlaybackState.nextPlayTime = Math.max(translatePlaybackState.nextPlayTime, translateAudioCtx.currentTime);
      src.start(translatePlaybackState.nextPlayTime);
      translatePlaybackState.nextPlayTime += ab.duration;
      translatePlaybackState.activeSources.push(src);

      // Indicator animation
      const activeMicBtn = currentSpeaker === 'user' ? $('btn-translate-user-mic') : $('btn-translate-guest-mic');
      if (activeMicBtn) activeMicBtn.className = 'translate-mic-btn speaking';

      src.onended = () => {
        translatePlaybackState.activeSources = translatePlaybackState.activeSources.filter(s => s !== src);
        if (!translatePlaybackState.activeSources.length && activeMicBtn) {
          activeMicBtn.className = currentSpeaker ? 'translate-mic-btn listening' : 'translate-mic-btn';
        }
      };
    } catch (e) {
      console.warn("Lỗi phát audio pcm:", e);
    }
  }

  // Khởi tạo và kết nối Live Translate WebSocket
  async function connectTranslateWs(targetLang) {
    currentSessionTargetLang = targetLang;
    const apiKey = getApiKey();
    if (!apiKey) {
      if (window.showToast) window.showToast("Cần có ít nhất 1 Google API Key trong Cài đặt!", "danger");
      return false;
    }

    try {
      if (translateWs) {
        try { translateWs.close(); } catch {}
        translateWs = null;
      }
      isTranslateWsReady = false;

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      translateWs = new WebSocket(wsUrl);

      translateWs.onopen = () => {
        const setupMessage = {
          setup: {
            model: TRANSLATE_MODEL,
            generationConfig: {
              responseModalities: ["AUDIO"],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              translationConfig: {
                targetLanguageCode: targetLang,
                echoTargetLanguage: false
              }
            }
          }
        };
        translateWs.send(JSON.stringify(setupMessage));
      };

      translateWs.onmessage = (event) => {
        try {
          const resp = JSON.parse(event.data);

          if (resp.setupComplete) {
            isTranslateWsReady = true;
            updateStatusPill("🟢 Đã sẵn sàng dịch trực tiếp");
            return;
          }

          const sc = resp.serverContent;
          if (sc) {
            // Lấy văn bản người nói (input transcript)
            const inputTxt = sc.inputTranscription?.text || sc.input_transcription?.text ||
                             sc.interimInputTranscription?.text || sc.interim_input_transcription?.text;
            if (inputTxt && inputTxt.trim()) {
              renderInputTranscript(inputTxt.trim());
            }

            // Lấy văn bản đã dịch (output transcript)
            const outputTxt = sc.outputTranscription?.text || sc.output_transcription?.text;
            if (outputTxt && outputTxt.trim()) {
              renderOutputTranscript(outputTxt.trim());
            }

            // Lấy âm thanh đã dịch và phát
            if (sc.modelTurn?.parts || sc.model_turn?.parts) {
              const parts = sc.modelTurn?.parts || sc.model_turn?.parts;
              for (const part of parts) {
                if (part.inlineData?.data || part.inline_data?.data) {
                  const b64 = part.inlineData?.data || part.inline_data?.data;
                  playPcm24kAudio(b64);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Lỗi nhận gói tin translate:", e);
        }
      };

      translateWs.onerror = (e) => {
        console.warn("Translate WS error:", e);
        updateStatusPill("⚠️ Lỗi kết nối dịch");
      };

      translateWs.onclose = () => {
        isTranslateWsReady = false;
      };

      return true;
    } catch (err) {
      console.error("connectTranslateWs failed:", err);
      return false;
    }
  }

  function updateStatusPill(msg) {
    const p1 = $('translate-user-status');
    const p2 = $('translate-guest-status');
    if (p1) p1.innerHTML = msg;
    if (p2) p2.innerHTML = msg;
  }

  function renderInputTranscript(txt) {
    if (currentSpeaker === 'user') {
      const el = $('translate-user-orig-text');
      if (el) el.innerText = txt;
    } else if (currentSpeaker === 'guest') {
      const el = $('translate-guest-orig-text');
      if (el) el.innerText = txt;
    }
  }

  function renderOutputTranscript(txt) {
    if (currentSpeaker === 'user') {
      // Người dùng nói tiếng Việt -> Bản dịch hiện to ở bên Khách
      const guestMain = $('translate-guest-main-text');
      if (guestMain) guestMain.innerText = txt;
      const userSub = $('translate-user-trans-text');
      if (userSub) userSub.innerText = `(Dịch: ${txt})`;
    } else if (currentSpeaker === 'guest') {
      // Khách nói tiếng nước ngoài -> Bản dịch hiện to ở bên Người dùng
      const userMain = $('translate-user-main-text');
      if (userMain) userMain.innerText = txt;
      const guestSub = $('translate-guest-trans-text');
      if (guestSub) guestSub.innerText = `(Dịch: ${txt})`;
    }
  }

  // Bắt đầu thu âm micro
  async function startRecording() {
    if (!translateAudioCtx) {
      translateAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (translateAudioCtx.state === 'suspended') {
      await translateAudioCtx.resume();
    }

    if (!translateMediaStream) {
      translateMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
    }

    const actualSampleRate = translateAudioCtx.sampleRate;
    translateMicSource = translateAudioCtx.createMediaStreamSource(translateMediaStream);
    translateScriptProcessor = translateAudioCtx.createScriptProcessor(4096, 1, 1);
    translateSilentGain = translateAudioCtx.createGain();
    translateSilentGain.gain.value = 0;

    translateScriptProcessor.onaudioprocess = e => {
      if (!isTranslateWsReady || !currentSpeaker || translateWs?.readyState !== WebSocket.OPEN) return;
      const floatData = e.inputBuffer.getChannelData(0);
      const pcm16k = downsampleTo16k(floatData, actualSampleRate);
      let bin = '';
      for (let i = 0; i < pcm16k.length; i++) bin += String.fromCharCode(pcm16k[i]);

      translateWs.send(JSON.stringify({
        realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: btoa(bin) }
        }
      }));
    };

    translateMicSource.connect(translateScriptProcessor);
    translateScriptProcessor.connect(translateSilentGain);
    translateSilentGain.connect(translateAudioCtx.destination);
  }

  function stopRecording() {
    try { translateScriptProcessor?.disconnect(); translateScriptProcessor = null; } catch {}
    try { translateMicSource?.disconnect(); translateMicSource = null; } catch {}
    try { translateSilentGain?.disconnect(); translateSilentGain = null; } catch {}
  }

  // Chuyển lượt nói (Speaker Toggle)
  async function setSpeaker(speaker) {
    if (currentSpeaker === speaker) {
      // Đang bấm thì bấm lần nữa để ngưng mic
      currentSpeaker = null;
      stopRecording();
      updateMicButtons();
      updateStatusPill("⏸️ Đã dừng micro");
      return;
    }

    currentSpeaker = speaker;
    const targetLang = speaker === 'user' ? ($('translate-guest-lang-select')?.value || 'en') : 'vi';

    updateStatusPill(`🔄 Đang chuẩn bị dịch sang ${speaker === 'user' ? 'tiếng Khách' : 'tiếng Việt'}...`);

    // Kết nối lại nếu đổi targetLanguage
    if (targetLang !== currentSessionTargetLang || !isTranslateWsReady) {
      await connectTranslateWs(targetLang);
      // Chờ WebSocket ready
      let waitCount = 0;
      while (!isTranslateWsReady && waitCount < 15) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }
    }

    await startRecording();
    updateMicButtons();
    updateStatusPill(speaker === 'user' ? "🎙️ Đang nghe Bạn (Tiếng Việt)..." : "🎙️ Đang nghe Khách...");
  }

  function updateMicButtons() {
    const userBtn = $('btn-translate-user-mic');
    const guestBtn = $('btn-translate-guest-mic');
    if (userBtn) {
      userBtn.className = currentSpeaker === 'user' ? 'translate-mic-btn listening' : 'translate-mic-btn';
    }
    if (guestBtn) {
      guestBtn.className = currentSpeaker === 'guest' ? 'translate-mic-btn listening' : 'translate-mic-btn';
    }
  }

  function cleanupTranslate() {
    currentSpeaker = null;
    isTranslateWsReady = false;
    stopRecording();
    translateMediaStream?.getTracks().forEach(t => t.stop());
    translateMediaStream = null;
    try { translateAudioCtx?.close(); } catch {}
    translateAudioCtx = null;
    if (translateWs) {
      try { translateWs.close(); } catch {}
      translateWs = null;
    }
    updateMicButtons();
  }

  // Mở giao diện phiên dịch
  async function openLiveTranslateModal() {
    const modal = $('live-translate-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    // Populate guest language select nếu chưa có
    const sel = $('translate-guest-lang-select');
    if (sel && sel.options.length <= 1) {
      sel.innerHTML = SUPPORTED_LANGS.map(l => `<option value="${l.code}" ${l.code === 'en' ? 'selected' : ''}>${l.flag} ${l.name}</option>`).join('');
    }

    updateStatusPill("Sẵn sàng. Hãy chọn ngôn ngữ và bấm nút micro để nói.");
    // Pre-connect với tiếng Anh
    connectTranslateWs(sel?.value || 'en');
  }

  function closeLiveTranslateModal() {
    const modal = $('live-translate-modal');
    if (modal) modal.style.display = 'none';
    cleanupTranslate();
  }

  // Khởi tạo các sự kiện giao diện
  function initTranslateUI() {
    const openBtn = $('btn-open-live-translate');
    if (openBtn) openBtn.onclick = openLiveTranslateModal;

    const closeBtn = $('btn-close-live-translate');
    if (closeBtn) closeBtn.onclick = closeLiveTranslateModal;

    const userMicBtn = $('btn-translate-user-mic');
    if (userMicBtn) userMicBtn.onclick = () => setSpeaker('user');

    const guestMicBtn = $('btn-translate-guest-mic');
    if (guestMicBtn) guestMicBtn.onclick = () => setSpeaker('guest');

    // Nút lật chiều màn hình nửa trên
    const flipBtn = $('btn-toggle-flip-guest');
    if (flipBtn) {
      flipBtn.onclick = () => {
        const guestHalf = $('translate-guest-half');
        if (guestHalf) guestHalf.classList.toggle('unflipped');
      };
    }

    // Khi khách đổi ngôn ngữ đích
    const guestLangSelect = $('translate-guest-lang-select');
    if (guestLangSelect) {
      guestLangSelect.onchange = () => {
        if (currentSpeaker === 'user') {
          setSpeaker('user'); // Reconnect với ngôn ngữ mới
        }
      };
    }
  }

  // Đăng ký toàn cục
  window.openLiveTranslateModal = openLiveTranslateModal;
  window.closeLiveTranslateModal = closeLiveTranslateModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTranslateUI);
  } else {
    initTranslateUI();
  }
})();
