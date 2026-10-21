/* ==========================================================================
   Jarvis AI - Dual-Screen Face-to-Face Live Translator Module (js/translate.js)
   Powered by Gemini Live Translate & Intelligent Gemini 3.8 Live Fallback
   ========================================================================== */

(function() {
  'use strict';

  // --- SUPPORTED MODELS ---
  const MODEL_35_TRANSLATE = "models/gemini-3.5-live-translate-preview";
  const MODEL_38_LIVE = "models/gemini-3.8-live";

  // --- STATE ---
  let translateWs = null;
  let translateAudioCtx = null;
  let translateMediaStream = null;
  let translateScriptProcessor = null;
  let translateMicSource = null;
  let translateSilentGain = null;
  let translatePlaybackState = { nextPlayTime: 0, activeSources: [] };

  let currentSpeaker = null; // 'user' hoặc 'guest'
  let isTranslateWsReady = false;
  let isConnecting = false;
  let currentSessionTargetLang = 'en';
  let activeEngineModel = MODEL_35_TRANSLATE;
  let currentKeyIdx = 0;
  let sentPacketCount = 0;
  let userSpeechDetected = false;
  let silenceTimer = null;
  let lastCloseInfo = { code: 0, reason: '' };

  // Local Web Speech Recognition for instant 0ms visual transcription
  let localSpeechRec = null;

  // Supported languages list with BCP-47 codes, names, flags & speech recognition locales
  const SUPPORTED_LANGS = [
    { code: 'en', flag: '🇺🇸', name: 'English (US)', recLang: 'en-US' },
    { code: 'zh-Hans', flag: '🇨🇳', name: '中文 (Giản thể)', recLang: 'zh-CN' },
    { code: 'zh-Hant', flag: '🇹🇼', name: '繁體中文 (Phồn thể)', recLang: 'zh-TW' },
    { code: 'ja', flag: '🇯🇵', name: '日本語 (Tiếng Nhật)', recLang: 'ja-JP' },
    { code: 'ko', flag: '🇰🇷', name: '한국어 (Tiếng Hàn)', recLang: 'ko-KR' },
    { code: 'fr', flag: '🇫🇷', name: 'Français (Tiếng Pháp)', recLang: 'fr-FR' },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch (Tiếng Đức)', recLang: 'de-DE' },
    { code: 'th', flag: '🇹🇭', name: 'ไทย (Tiếng Thái)', recLang: 'th-TH' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский (Tiếng Nga)', recLang: 'ru-RU' },
    { code: 'es', flag: '🇪🇸', name: 'Español (Tây Ban Nha)', recLang: 'es-ES' },
    { code: 'it', flag: '🇮🇹', name: 'Italiano (Tiếng Ý)', recLang: 'it-IT' },
    { code: 'pt-BR', flag: '🇧🇷', name: 'Português (Brazil)', recLang: 'pt-BR' },
    { code: 'id', flag: '🇮🇩', name: 'Bahasa Indonesia', recLang: 'id-ID' },
    { code: 'ms', flag: '🇲🇾', name: 'Bahasa Melayu', recLang: 'ms-MY' },
    { code: 'hi', flag: '🇮🇳', name: 'हिन्दी (Tiếng Hindi)', recLang: 'hi-IN' },
    { code: 'ar', flag: '🇸🇦', name: 'العربية (Ả Rập)', recLang: 'ar-SA' },
    { code: 'tr', flag: '🇹🇷', name: 'Türkçe (Thổ Nhĩ Kỳ)', recLang: 'tr-TR' },
    { code: 'nl', flag: '🇳🇱', name: 'Nederlands (Hà Lan)', recLang: 'nl-NL' },
    { code: 'pl', flag: '🇵🇱', name: 'Polski (Ba Lan)', recLang: 'pl-PL' }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function getLangObj(code) {
    return SUPPORTED_LANGS.find(l => l.code === code) || { code, name: code, flag: '🌐', recLang: 'en-US' };
  }

  // Lấy danh sách API Key hợp lệ và giải mã an toàn
  function getAllApiKeys() {
    const keys = [];
    if (window.apiKeys && Array.isArray(window.apiKeys) && window.apiKeys.length) {
      for (const k of window.apiKeys) {
        if (typeof k === 'string' && k.trim()) keys.push(k.trim());
      }
    }
    if (!keys.length) {
      const ls = window.ls || localStorage;
      for (let i = 1; i <= 10; i++) {
        let k = (ls.getItem(`jarvis_api_${i}`) || ls.getItem(`huanmu_api_${i}`) || ls.getItem(`javiss_api_${i}`) || '').trim();
        if (k) {
          if (k.startsWith('JVENC_') || k.startsWith('ENC_')) {
            if (typeof window.deobfuscateKey === 'function') k = window.deobfuscateKey(k);
          }
          if (k) keys.push(k);
        }
      }
    }
    return keys;
  }

  function getCurrentApiKey() {
    const keys = getAllApiKeys();
    if (!keys.length) return { key: '', index: -1 };
    currentKeyIdx = currentKeyIdx % keys.length;
    return { key: keys[currentKeyIdx], index: currentKeyIdx };
  }

  function rotateApiKey() {
    const keys = getAllApiKeys();
    if (keys.length > 1) {
      currentKeyIdx = (currentKeyIdx + 1) % keys.length;
      console.log(`[Live Translate] Rotated to Google API Key #${currentKeyIdx + 1}`);
      return true;
    }
    return false;
  }

  function updateModelBadge(modelName) {
    const badge = $('translate-active-model-tag');
    if (!badge) return;
    if (modelName === MODEL_35_TRANSLATE) {
      badge.innerHTML = "⚡ Gemini 3.5 Live Translate";
      badge.style.color = "#38bdf8";
      badge.style.borderColor = "rgba(56, 189, 248, 0.35)";
    } else {
      badge.innerHTML = "🔄 Gemini 3.8 Live (Thông dịch)";
      badge.style.color = "#a78bfa";
      badge.style.borderColor = "rgba(167, 139, 250, 0.35)";
    }
  }

  function updateStatusPill(msg) {
    const p1 = $('translate-user-status');
    const p2 = $('translate-guest-status');
    if (p1) p1.innerHTML = msg;
    if (p2) p2.innerHTML = msg;
  }

  function updateAudioMeters(percent) {
    const mUser = $('translate-user-meter')?.firstElementChild;
    const mGuest = $('translate-guest-meter')?.firstElementChild;
    const target = currentSpeaker === 'user' ? mUser : mGuest;
    const other = currentSpeaker === 'user' ? mGuest : mUser;
    if (target) target.style.width = `${percent}%`;
    if (other) other.style.width = '0%';
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
    if (!translateAudioCtx) {
      translateAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (translateAudioCtx.state === 'suspended') {
      translateAudioCtx.resume();
    }

    try {
      const bin = atob(b64);
      const b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);

      const numSamples = Math.floor(b.length / 2);
      const f32 = new Float32Array(numSamples);
      const dataView = new DataView(b.buffer, b.byteOffset, b.byteLength);
      for (let i = 0; i < numSamples; i++) {
        f32[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }

      const ab = translateAudioCtx.createBuffer(1, f32.length, 24000);
      ab.copyToChannel(f32, 0);
      const src = translateAudioCtx.createBufferSource();
      src.buffer = ab;
      src.connect(translateAudioCtx.destination);

      translatePlaybackState.nextPlayTime = Math.max(translatePlaybackState.nextPlayTime, translateAudioCtx.currentTime);
      src.start(translatePlaybackState.nextPlayTime);
      translatePlaybackState.nextPlayTime += ab.duration;
      translatePlaybackState.activeSources.push(src);

      // Animation phát âm thanh
      const activeMicBtn = currentSpeaker === 'user' ? $('btn-translate-user-mic') : $('btn-translate-guest-mic');
      if (activeMicBtn) activeMicBtn.className = 'translate-mic-btn speaking';
      updateStatusPill("🔊 Đang phát bản dịch giọng nói...");

      src.onended = () => {
        translatePlaybackState.activeSources = translatePlaybackState.activeSources.filter(s => s !== src);
        if (!translatePlaybackState.activeSources.length && activeMicBtn) {
          activeMicBtn.className = currentSpeaker ? 'translate-mic-btn listening' : 'translate-mic-btn';
          updateStatusPill(currentSpeaker === 'user' ? "🎙️ Đang nghe Bạn (Tiếng Việt)..." : "🎙️ Đang nghe Khách...");
        }
      };
    } catch (e) {
      console.warn("Lỗi phát audio pcm:", e);
    }
  }

  // Kết nối phiên dịch Live qua WebSocket
  async function connectTranslateWs(targetLang, forceModel = null) {
    currentSessionTargetLang = targetLang;
    const { key, index } = getCurrentApiKey();
    if (!key) {
      if (window.showToast) window.showToast("Cần ít nhất 1 Google API Key trong Cài đặt!", "danger");
      updateStatusPill("❌ Thiếu Google API Key");
      return false;
    }

    // Chọn model dịch
    const selPref = $('translate-model-select')?.value || 'auto';
    if (forceModel) {
      activeEngineModel = forceModel;
    } else if (selPref !== 'auto') {
      activeEngineModel = selPref;
    } else if (!activeEngineModel) {
      activeEngineModel = MODEL_35_TRANSLATE;
    }

    try {
      if (translateWs) {
        try { translateWs.close(); } catch {}
        translateWs = null;
      }
      isTranslateWsReady = false;
      isConnecting = true;

      const targetLangObj = getLangObj(targetLang);
      const targetName = targetLangObj.name;
      updateStatusPill(`⏳ Đang kết nối [Key ${index + 1}] ➔ ${targetName}...`);
      updateModelBadge(activeEngineModel);

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;
      translateWs = new WebSocket(wsUrl);

      translateWs.onopen = () => {
        console.log(`Translate WS open with model: ${activeEngineModel}, targetLang: ${targetLang}`);

        let setupMsg;
        if (activeEngineModel === MODEL_35_TRANSLATE) {
          // Chuẩn proto Gemini 3.5 Live Translate chính thức từ Google docs
          setupMsg = {
            setup: {
              model: MODEL_35_TRANSLATE,
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
        } else {
          // Fallback Gemini 3.8 Live Interpreter
          const srcLangName = currentSpeaker === 'user' ? 'Tiếng Việt' : targetName;
          const destLangName = currentSpeaker === 'user' ? targetName : 'Tiếng Việt';
          setupMsg = {
            setup: {
              model: MODEL_38_LIVE,
              generationConfig: {
                responseModalities: ["AUDIO"],
                temperature: 0.2
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{
                  text: `You are a real-time speech-to-speech interpreter.
The speaker talks to you in ${srcLangName}.
Immediately translate the spoken content accurately into ${destLangName} (${targetLang}).
Rules:
1. Output ONLY the translated audio speech in ${destLangName}.
2. NEVER include conversational filler, greetings, comments, or explanations.
3. Pronounce naturally and fluently.`
                }]
              }
            }
          };
        }

        translateWs.send(JSON.stringify(setupMsg));
      };

      translateWs.onmessage = async (event) => {
        try {
          let rawData = event.data;
          if (rawData instanceof Blob) rawData = await rawData.text();
          const resp = JSON.parse(rawData);

          if (resp.setupComplete || resp.serverContent?.setupComplete) {
            isTranslateWsReady = true;
            isConnecting = false;
            console.log("Translate WS setupComplete received successfully!");
            updateModelBadge(activeEngineModel);
            updateStatusPill("🟢 Đã sẵn sàng. Hãy bấm nút micro và nói.");
            return;
          }

          const sc = resp.serverContent;
          if (sc) {
            // Nhận diện lời người nói từ máy chủ
            const inputTxt = sc.inputTranscription?.text || sc.input_transcription?.text ||
                             sc.interimInputTranscription?.text || sc.interim_input_transcription?.text;
            if (inputTxt && inputTxt.trim()) {
              renderInputTranscript(inputTxt.trim());
            }

            // Bản dịch văn bản
            const outputTxt = sc.outputTranscription?.text || sc.output_transcription?.text;
            if (outputTxt && outputTxt.trim()) {
              renderOutputTranscript(outputTxt.trim());
            }

            // Bản dịch âm thanh
            const parts = sc.modelTurn?.parts || sc.model_turn?.parts || [];
            for (const part of parts) {
              const b64 = part.inlineData?.data || part.inline_data?.data;
              if (b64) {
                playPcm24kAudio(b64);
              }
            }
          }
        } catch (e) {
          console.warn("Lỗi nhận gói tin translate:", e);
        }
      };

      translateWs.onerror = (e) => {
        console.warn("Translate WS error:", e);
      };

      translateWs.onclose = async (e) => {
        console.warn("Translate WS closed:", e.code, e.reason);
        const wasReady = isTranslateWsReady;
        isTranslateWsReady = false;
        isConnecting = false;
        lastCloseInfo = { code: e.code, reason: e.reason || '' };
        updateAudioMeters(0);

        // NẾU Gemini 3.5 Translate đóng trước khi setupComplete (Mã 1008/1011/1006 hoặc key chưa có quyền preview)
        if (!wasReady && activeEngineModel === MODEL_35_TRANSLATE && (e.code === 1008 || e.code === 1011 || e.code === 1006 || !e.code)) {
          console.log("[Live Translate] Gemini 3.5 preview unavailable, seamlessly falling back to Gemini 3.8 Live...");
          updateStatusPill("🔄 Gemini 3.5 chưa mở cho Key này ➔ Chuyển sang Gemini 3.8 Live...");
          activeEngineModel = MODEL_38_LIVE;
          setTimeout(() => connectTranslateWs(targetLang, MODEL_38_LIVE), 300);
          return;
        }

        // Xoay key nếu gặp quota / rate limit (Mã 1008)
        if (e.code === 1008 && getAllApiKeys().length > 1) {
          rotateApiKey();
          updateStatusPill(`⚠️ Key bận (Mã 1008) ➔ Đang đổi Key ${currentKeyIdx + 1}...`);
          setTimeout(() => connectTranslateWs(targetLang, activeEngineModel), 500);
          return;
        }

        updateStatusPill(`⚠️ Ngắt kết nối (Mã ${e.code || 'đóng'}). Bấm nút micro để thử lại.`);
      };

      return true;
    } catch (err) {
      console.error("connectTranslateWs failed:", err);
      isConnecting = false;
      isTranslateWsReady = false;
      updateStatusPill("❌ Không thể kết nối dịch");
      return false;
    }
  }

  function renderInputTranscript(txt) {
    if (currentSpeaker === 'user') {
      const userMain = $('translate-user-main-text');
      if (userMain) userMain.innerText = txt;
    } else if (currentSpeaker === 'guest') {
      const guestMain = $('translate-guest-main-text');
      if (guestMain) guestMain.innerText = txt;
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

  // Khởi động SpeechRecognition của trình duyệt để hiển thị chữ người nói tức thì (0ms latency)
  function startLocalSpeechRec(speaker, langCode) {
    stopLocalSpeechRec();
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      localSpeechRec = new SpeechRec();
      localSpeechRec.continuous = true;
      localSpeechRec.interimResults = true;
      const langObj = getLangObj(langCode);
      localSpeechRec.lang = speaker === 'user' ? 'vi-VN' : (langObj.recLang || 'en-US');

      localSpeechRec.onresult = (event) => {
        let finalTxt = '';
        let interimTxt = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTxt += event.results[i][0].transcript;
          else interimTxt += event.results[i][0].transcript;
        }
        const text = (finalTxt || interimTxt).trim();
        if (text) {
          renderInputTranscript(text);
        }
      };

      localSpeechRec.onerror = () => {};
      localSpeechRec.onend = () => {
        if (currentSpeaker === speaker && isTranslateWsReady) {
          try { localSpeechRec.start(); } catch {}
        }
      };
      localSpeechRec.start();
    } catch (e) {
      console.warn("SpeechRec error:", e);
    }
  }

  function stopLocalSpeechRec() {
    if (localSpeechRec) {
      try {
        localSpeechRec.onend = null;
        localSpeechRec.stop();
      } catch {}
      localSpeechRec = null;
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

    sentPacketCount = 0;
    userSpeechDetected = false;

    translateScriptProcessor.onaudioprocess = e => {
      if (!isTranslateWsReady || !currentSpeaker || translateWs?.readyState !== WebSocket.OPEN) return;
      const floatData = e.inputBuffer.getChannelData(0);

      // Tính mức độ âm lượng (RMS)
      let sum = 0;
      for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i];
      const rms = Math.sqrt(sum / floatData.length);
      const activeBtn = currentSpeaker === 'user' ? $('btn-translate-user-mic') : $('btn-translate-guest-mic');

      // Visual VU Meter
      const meterPercent = Math.min(100, Math.round(rms * 450));
      updateAudioMeters(meterPercent);

      if (activeBtn) {
        if (rms > 0.015 && !activeBtn.classList.contains('speaking')) {
          activeBtn.style.transform = `scale(${1 + Math.min(rms * 2.2, 0.22)})`;
        } else if (!activeBtn.classList.contains('speaking')) {
          activeBtn.style.transform = 'scale(1)';
        }
      }

      // Phát hiện người dùng đã nói
      if (rms > 0.02) {
        userSpeechDetected = true;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else if (userSpeechDetected) {
        // Sau 1.3 giây im lặng sau khi nói -> gửi tín hiệu kết thúc turn nếu cần
        if (!silenceTimer) {
          silenceTimer = setTimeout(() => {
            if (translateWs?.readyState === WebSocket.OPEN && userSpeechDetected) {
              try {
                translateWs.send(JSON.stringify({
                  realtimeInput: { audioStreamEnd: true }
                }));
              } catch {}
            }
            userSpeechDetected = false;
            silenceTimer = null;
          }, 1300);
        }
      }

      const pcm16k = downsampleTo16k(floatData, actualSampleRate);
      let bin = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < pcm16k.length; i += chunkSize) {
        bin += String.fromCharCode.apply(null, pcm16k.subarray(i, i + chunkSize));
      }

      translateWs.send(JSON.stringify({
        realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: btoa(bin) }
        }
      }));

      sentPacketCount++;
      if (sentPacketCount % 20 === 0 && activeBtn?.classList.contains('listening')) {
        updateStatusPill(currentSpeaker === 'user' ? `🎙️ Đang nghe Bạn (Đã gửi ${sentPacketCount} gói âm thanh)...` : `🎙️ Đang nghe Khách...`);
      }
    };

    translateMicSource.connect(translateScriptProcessor);
    translateScriptProcessor.connect(translateSilentGain);
    translateSilentGain.connect(translateAudioCtx.destination);
  }

  function stopRecording() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    stopLocalSpeechRec();
    updateAudioMeters(0);

    // Gửi tín hiệu báo kết thúc chuỗi âm thanh cho Gemini
    if (translateWs && translateWs.readyState === WebSocket.OPEN) {
      try {
        translateWs.send(JSON.stringify({
          realtimeInput: { audioStreamEnd: true }
        }));
      } catch {}
    }

    try { translateScriptProcessor?.disconnect(); translateScriptProcessor = null; } catch {}
    try { translateMicSource?.disconnect(); translateMicSource = null; } catch {}
    try { translateSilentGain?.disconnect(); translateSilentGain = null; } catch {}

    const b1 = $('btn-translate-user-mic');
    const b2 = $('btn-translate-guest-mic');
    if (b1) b1.style.transform = 'scale(1)';
    if (b2) b2.style.transform = 'scale(1)';
  }

  // Chuyển lượt nói (Speaker Toggle)
  async function setSpeaker(speaker) {
    if (currentSpeaker === speaker) {
      // Đang bật thì bấm lại để ngưng mic
      currentSpeaker = null;
      stopRecording();
      updateMicButtons();
      updateStatusPill("⏸️ Đã ngắt micro. Bấm lại để tiếp tục nói.");
      return;
    }

    currentSpeaker = speaker;
    const targetLang = speaker === 'user' ? ($('translate-guest-lang-select')?.value || 'en') : 'vi';

    // Đảm bảo AudioContext hoạt động trên tương tác người dùng
    if (!translateAudioCtx) {
      translateAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (translateAudioCtx.state === 'suspended') {
      await translateAudioCtx.resume();
    }

    updateMicButtons();

    // Kết nối lại nếu đổi targetLanguage hoặc socket chưa sẵn sàng
    if (targetLang !== currentSessionTargetLang || !isTranslateWsReady || translateWs?.readyState !== WebSocket.OPEN) {
      updateStatusPill(`🔄 Đang chuẩn bị dịch [Mục tiêu: ${getLangObj(targetLang).name}]...`);
      await connectTranslateWs(targetLang);

      // Chờ WebSocket ready tối đa 3 giây
      let waitCount = 0;
      while (!isTranslateWsReady && waitCount < 30) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }
    }

    // KIỂM TRA CHÍNH XÁC: Chỉ bắt đầu thu âm nếu WebSocket THỰC SỰ SẴN SÀNG!
    if (!isTranslateWsReady || translateWs?.readyState !== WebSocket.OPEN) {
      currentSpeaker = null;
      updateMicButtons();
      const errReason = lastCloseInfo.code ? ` (Mã ${lastCloseInfo.code})` : '';
      updateStatusPill(`❌ Chưa kết nối được máy chủ dịch${errReason}. Hãy bấm thử lại!`);
      if (window.showToast) window.showToast(`Lỗi kết nối phiên dịch${errReason}!`, "warning");
      return;
    }

    await startRecording();
    updateMicButtons();
    startLocalSpeechRec(speaker, speaker === 'user' ? 'vi' : targetLang);

    if (speaker === 'user') {
      updateStatusPill("🎙️ Đang nghe Bạn... Hãy nói tiếng Việt!");
    } else {
      updateStatusPill(`🎙️ Listening to Guest... Please speak ${getLangObj(targetLang).name}!`);
    }
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
    isConnecting = false;
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
    updateAudioMeters(0);
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

    const currentTarget = sel?.value || 'en';
    updateModelBadge(activeEngineModel);
    updateStatusPill("⏳ Đang chuẩn bị phiên dịch...");

    // Tự động kết nối trước
    connectTranslateWs(currentTarget);
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

    // Đổi mô hình thủ công từ select
    const modelSelect = $('translate-model-select');
    if (modelSelect) {
      modelSelect.onchange = () => {
        const val = modelSelect.value;
        const targetLang = currentSpeaker === 'user' ? ($('translate-guest-lang-select')?.value || 'en') : 'vi';
        if (val === 'auto') {
          activeEngineModel = MODEL_35_TRANSLATE;
        } else {
          activeEngineModel = val;
        }
        connectTranslateWs(targetLang, activeEngineModel);
      };
    }

    // Khi khách đổi ngôn ngữ đích
    const guestLangSelect = $('translate-guest-lang-select');
    if (guestLangSelect) {
      guestLangSelect.onchange = () => {
        const target = guestLangSelect.value;
        if (currentSpeaker === 'user') {
          setSpeaker('user'); // Kết nối lại với ngôn ngữ đích mới
        } else {
          connectTranslateWs(target, activeEngineModel);
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
