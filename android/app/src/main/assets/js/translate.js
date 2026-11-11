/* ==========================================================================
   Jarvis AI - Dual-Screen Face-to-Face Live Translator Module (js/translate.js)
   Powered by Gemini 3.8 Bilateral Real-Time Voice Interpreter
   ========================================================================== */

(function() {
  'use strict';

  // --- SUPPORTED MODELS ---
  const MODEL_38_LIVE = "models/gemini-3.8-live";
  const MODEL_35_TRANSLATE = "models/gemini-3.5-live-translate-preview";

  // --- STATE ---
  let translateWs = null;
  let translateAudioCtx = null;
  let translateMediaStream = null;
  let translateScriptProcessor = null;
  let translateMicSource = null;
  let translateSilentGain = null;
  let translatePlaybackState = { nextPlayTime: 0, activeSources: [] };

  let currentSpeaker = null; // 'user' (Việt) hoặc 'guest' (Khách)
  let isTranslateWsReady = false;
  let isConnecting = false;
  let currentGuestLangCode = 'en';
  let activeEngineModel = MODEL_38_LIVE;
  let currentKeyIdx = 0;
  let sentPacketCount = 0;
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
    if (code === 'vi' || code === 'vi-VN') {
      return { code: 'vi', flag: '🇻🇳', name: 'Tiếng Việt', recLang: 'vi-VN' };
    }
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
    if (modelName === MODEL_38_LIVE) {
      badge.innerHTML = "⚡ Gemini 3.8 Live (Song song)";
      badge.style.color = "#38bdf8";
      badge.style.borderColor = "rgba(56, 189, 248, 0.35)";
    } else {
      badge.innerHTML = "🧪 Gemini 3.5 Translate";
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
          updateStatusPill(currentSpeaker === 'user' ? "🎙️ Đang nghe Bạn (Tiếng Việt)..." : `🎙️ Đang nghe Khách (${getLangObj(currentGuestLangCode).name})...`);
        }
      };
    } catch (e) {
      console.warn("Lỗi phát audio pcm:", e);
    }
  }

  // Kết nối phiên dịch Live qua WebSocket
  async function connectTranslateWs(guestLangCode, forceModel = null) {
    currentGuestLangCode = guestLangCode || currentGuestLangCode || 'en';
    const { key, index } = getCurrentApiKey();
    if (!key) {
      if (window.showToast) window.showToast("Cần ít nhất 1 Google API Key trong Cài đặt!", "danger");
      updateStatusPill("❌ Thiếu Google API Key");
      return false;
    }

    if (forceModel) {
      activeEngineModel = forceModel;
    } else {
      const selPref = $('translate-model-select')?.value || localStorage.getItem('jarvis_translate_model_pref') || MODEL_38_LIVE;
      activeEngineModel = selPref;
    }

    try {
      if (translateWs) {
        try { translateWs.close(); } catch {}
        translateWs = null;
      }
      isTranslateWsReady = false;
      isConnecting = true;

      const guestLang = getLangObj(currentGuestLangCode);
      const guestName = guestLang.name;
      const guestCode = guestLang.code;

      updateStatusPill(`⏳ Đang kết nối [Key ${index + 1}] ➔ ${guestName}...`);
      updateModelBadge(activeEngineModel);

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;
      translateWs = new WebSocket(wsUrl);

      translateWs.onopen = () => {
        console.log(`Translate WS open: ${activeEngineModel}, guestLang: ${guestCode}`);

        let setupMsg;
        if (activeEngineModel === MODEL_35_TRANSLATE) {
          setupMsg = {
            setup: {
              model: MODEL_35_TRANSLATE,
              generationConfig: {
                responseModalities: ["AUDIO"],
                translationConfig: {
                  targetLanguageCode: guestCode,
                  echoTargetLanguage: false
                }
              }
            }
          };
        } else {
          // Gemini 3.8 Live: THÔNG DỊCH VIÊN 2 CHIỀU SONG SONG (TIẾNG VIỆT ⇄ TIẾNG KHÁCH)
          setupMsg = {
            setup: {
              model: MODEL_38_LIVE,
              generationConfig: {
                responseModalities: ["AUDIO"],
                temperature: 0.1
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{
                  text: `You are an expert real-time bilateral voice interpreter between Vietnamese and ${guestName} (${guestCode}).
YOUR STRICT RULES:
1. When you hear Vietnamese spoken: translate it directly into natural ${guestName} and speak ONLY the translation in ${guestName}.
2. When you hear ${guestName} (or foreign language) spoken: translate it directly into Vietnamese and speak ONLY the translation in Vietnamese.
3. Output ONLY the translated speech. NEVER add conversational filler, greetings, comments, or explanations.
4. Speak fluently, clearly, and with authentic pronunciation.`
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
            updateStatusPill("🟢 Đã sẵn sàng. Bấm micro để trò chuyện 2 chiều.");
            return;
          }

          const sc = resp.serverContent;
          if (sc) {
            if (sc.interrupted) {
              translatePlaybackState.activeSources.forEach(s => { try { s.stop(); } catch {} });
              translatePlaybackState = { nextPlayTime: translateAudioCtx?.currentTime || 0, activeSources: [] };
            }

            // Nhận diện lời người nói từ máy chủ
            const inputTxt = sc.inputTranscription?.text || sc.input_transcription?.text ||
                             sc.inputAudioTranscription?.text || sc.input_audio_transcription?.text ||
                             sc.interimInputTranscription?.text || sc.interim_input_transcription?.text;
            if (inputTxt && inputTxt.trim()) {
              renderInputTranscript(inputTxt.trim());
            }

            // Bản dịch văn bản
            const outputTxt = sc.outputTranscription?.text || sc.output_transcription?.text ||
                              sc.outputAudioTranscription?.text || sc.output_audio_transcription?.text;
            if (outputTxt && outputTxt.trim()) {
              renderOutputTranscript(outputTxt.trim());
            }

            // Âm thanh dịch
            const parts = sc.modelTurn?.parts || sc.model_turn?.parts || [];
            for (const part of parts) {
              const b64 = part.inlineData?.data || part.inline_data?.data;
              if (b64) {
                playPcm24kAudio(b64);
              }
              if (part.text && !outputTxt) {
                renderOutputTranscript(part.text.trim());
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

        // NẾU Gemini 3.5 đóng trước khi sẵn sàng -> Lập tức tự chuyển sang Gemini 3.8 Live
        if (!wasReady && activeEngineModel === MODEL_35_TRANSLATE) {
          console.log(`[Live Translate] Gemini 3.5 closed (code ${e.code}), falling back to Gemini 3.8 Live...`);
          updateStatusPill(`🔄 Gemini 3.5 ngắt (Mã ${e.code}) ➔ Tự động chuyển sang Gemini 3.8 Live...`);
          activeEngineModel = MODEL_38_LIVE;
          const modelSel = $('translate-model-select');
          if (modelSel) modelSel.value = MODEL_38_LIVE;
          localStorage.setItem('jarvis_translate_model_pref', MODEL_38_LIVE);
          updateModelBadge(MODEL_38_LIVE);
          setTimeout(() => connectTranslateWs(currentGuestLangCode, MODEL_38_LIVE), 250);
          return;
        }

        // Xoay key nếu gặp quota / rate limit (Mã 1008)
        if (e.code === 1008 && getAllApiKeys().length > 1) {
          rotateApiKey();
          updateStatusPill(`⚠️ Key bận (Mã 1008) ➔ Đang đổi Key ${currentKeyIdx + 1}...`);
          setTimeout(() => connectTranslateWs(currentGuestLangCode, activeEngineModel), 500);
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

  // Bắt đầu thu âm micro và stream audio liên tục
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

      const pcm16k = downsampleTo16k(floatData, actualSampleRate);
      let bin = '';
      for (let i = 0; i < pcm16k.length; i++) bin += String.fromCharCode(pcm16k[i]);

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
    stopLocalSpeechRec();
    updateAudioMeters(0);

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
    const guestLangCode = $('translate-guest-lang-select')?.value || 'en';

    // Đảm bảo AudioContext hoạt động trên tương tác người dùng
    if (!translateAudioCtx) {
      translateAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (translateAudioCtx.state === 'suspended') {
      await translateAudioCtx.resume();
    }

    updateMicButtons();

    // Kết nối WebSocket nếu chưa kết nối
    if (!isTranslateWsReady || translateWs?.readyState !== WebSocket.OPEN) {
      updateStatusPill(`🔄 Đang kết nối máy chủ dịch...`);
      await connectTranslateWs(guestLangCode);

      // Chờ WebSocket ready tối đa 3.5 giây
      let waitCount = 0;
      while (!isTranslateWsReady && waitCount < 35) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
      }
    }

    // Chỉ bắt đầu thu âm nếu WebSocket THỰC SỰ SẴN SÀNG!
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
    startLocalSpeechRec(speaker, speaker === 'user' ? 'vi' : guestLangCode);

    if (speaker === 'user') {
      updateStatusPill("🎙️ Đang nghe Bạn... Hãy nói tiếng Việt!");
    } else {
      updateStatusPill(`🎙️ Listening to Guest... Please speak ${getLangObj(guestLangCode).name}!`);
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

    // Tự động kết nối sẵn sàng trước
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
      const savedModel = localStorage.getItem('jarvis_translate_model_pref');
      if (savedModel && [MODEL_38_LIVE, MODEL_35_TRANSLATE].includes(savedModel)) {
        modelSelect.value = savedModel;
        activeEngineModel = savedModel;
      } else {
        modelSelect.value = MODEL_38_LIVE;
        activeEngineModel = MODEL_38_LIVE;
      }

      modelSelect.onchange = () => {
        const val = modelSelect.value;
        localStorage.setItem('jarvis_translate_model_pref', val);
        activeEngineModel = val;
        const guestLang = $('translate-guest-lang-select')?.value || 'en';
        connectTranslateWs(guestLang, activeEngineModel);
      };
    }

    // Khi khách đổi ngôn ngữ đích -> kết nối lại với ngôn ngữ mới
    const guestLangSelect = $('translate-guest-lang-select');
    if (guestLangSelect) {
      guestLangSelect.onchange = () => {
        const newGuestLang = guestLangSelect.value;
        connectTranslateWs(newGuestLang, activeEngineModel);
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
