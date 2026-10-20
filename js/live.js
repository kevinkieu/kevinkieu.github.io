/* ==========================================================================
   Jarvis AI - Gemini Multimodal Live Voice Call & Video Streaming Module
   ========================================================================== */

    // --- GEMINI MULTIMODAL LIVE CALL ---
    let liveWs = null, liveAudioCtx = null, liveMediaStream = null, livePlaybackState = { nextPlayTime: 0, activeSources: [] };
    let liveMicSource = null, liveScriptProcessor = null, liveSilentGain = null;
    let liveCamInterval = null, isLiveMicMuted = false, isLiveCamOn = false, isLiveSetupComplete = false;
    let liveCallHistory = []; // Lưu lại toàn bộ hội thoại Live để đưa vào Chat Text khi kết thúc
    let liveSilenceTimer = null, liveSilenceInterval = null, liveFarewellDetected = false;
    let liveFarewellTimer = null, liveSpeechRec = null;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function resetLiveSilenceTimer() {
      if (liveSilenceTimer) { clearTimeout(liveSilenceTimer); liveSilenceTimer = null; }
      if (liveSilenceInterval) { clearInterval(liveSilenceInterval); liveSilenceInterval = null; }
    }

    function isFarewellIntent(txt) {
      if (!txt || typeof txt !== 'string') return false;
      const lower = txt.toLowerCase().trim();
      if (!lower) return false;

      const farewellPhrases = [
        'tạm biệt', 'tam biet', 
        'hẹn gặp lại', 'hen gap lai', 
        'gặp lại sau', 'gap lai sau',
        'kết thúc cuộc gọi', 'ket thuc cuoc goi',
        'dừng cuộc gọi', 'dung cuoc goi', 
        'ngắt cuộc gọi', 'ngat cuoc goi',
        'tắt cuộc gọi', 'tat cuoc goi',
        'đóng cuộc gọi', 'dong cuoc goi',
        'thoát cuộc gọi', 'thoat cuoc goi',
        'cúp máy', 'cup may',
        'tắt máy', 'tat may',
        'ngắt máy', 'ngat may',
        'dừng lại ở đây', 'dung lai o day',
        'dừng tại đây', 'dung tai day',
        'thôi nhé', 'thôi nha', 'thoi nhe', 'thoi nha',
        'thế nhé', 'the nhe', 'thế thôi', 'the thoi',
        'goodbye', 'bye bye', 'bye jarvis', 'see you', 'see ya', 'bai bai'
      ];

      for (const phrase of farewellPhrases) {
        if (lower.includes(phrase)) return true;
      }

      if (/(^|\s)(bye|bai|chào nhé|chào nha|chào bạn nhé|nghỉ nhé|nghỉ đây)(\s|$|[.,!?])/i.test(lower)) {
        return true;
      }

      return false;
    }

    function handleFarewellTriggered(source = 'user') {
      if (liveFarewellDetected) return;
      liveFarewellDetected = true;
      resetLiveSilenceTimer(); // Hủy ngay lập tức bộ đếm 16 giây

      const st = $('live-call-status');
      if (st) {
        st.innerHTML = `<span style="color:#f43f5e;font-weight:700;">🔴 Đang kết thúc cuộc gọi...</span>`;
      }

      // Kiểm tra nếu là lệnh cúp máy dứt khoát của người dùng
      const lastUser = liveCallHistory.filter(x => x.role === 'user').pop()?.text || '';
      const isDirectHangup = /cúp máy|tắt máy|ngắt máy|dừng cuộc gọi|kết thúc cuộc gọi|tắt cuộc gọi|ngắt cuộc gọi|thoát cuộc gọi|cup may|tat may/i.test(lastUser);

      if (isDirectHangup) {
        if (liveFarewellTimer) clearTimeout(liveFarewellTimer);
        liveFarewellTimer = setTimeout(() => {
          endLiveCall("Đã kết thúc cuộc gọi theo yêu cầu cúp máy.");
        }, 500);
        return;
      }

      // Nếu là chào tạm biệt:
      // Nếu audio AI đang phát thì src.onended sẽ gọi ngắt ngay sau khi AI nói xong.
      // Đặt safety timer phòng khi AI không có audio trả về hoặc đã kết thúc:
      if (!livePlaybackState.activeSources.length) {
        if (liveFarewellTimer) clearTimeout(liveFarewellTimer);
        liveFarewellTimer = setTimeout(() => {
          endLiveCall("Đã tự động kết thúc cuộc gọi theo lời chào tạm biệt!");
        }, 800);
      } else {
        if (liveFarewellTimer) clearTimeout(liveFarewellTimer);
        liveFarewellTimer = setTimeout(() => {
          endLiveCall("Đã tự động kết thúc cuộc gọi theo lời chào tạm biệt!");
        }, 3200);
      }
    }

    function appendLiveUserText(delta) {
      if (!delta || typeof delta !== 'string') return;
      const cleanDelta = delta.trim();
      if (!cleanDelta) return;
      resetLiveSilenceTimer();

      const last = liveCallHistory[liveCallHistory.length - 1];
      if (!last || last.role !== 'user') {
        liveCallHistory.push({ role: 'user', text: cleanDelta, time: getNowTime24h() });
      } else {
        if (last.text.includes(cleanDelta)) {
          // Tránh lặp chuỗi
        } else if (cleanDelta.includes(last.text)) {
          last.text = cleanDelta;
        } else {
          last.text = (last.text + ' ' + cleanDelta).trim();
        }
      }

      const currentText = liveCallHistory[liveCallHistory.length - 1].text.trim();
      const tr = $('live-transcript');
      if (tr) tr.innerHTML = `<span style="color:#94a3b8;">🗣️ <b>Bạn:</b> "${escapeHtml(currentText)}"</span>`;

      if (isFarewellIntent(currentText)) {
        handleFarewellTriggered('user');
      }
    }

    function appendLiveAiText(delta) {
      if (!delta || typeof delta !== 'string') return;
      const cleanDelta = delta.trim();
      if (!cleanDelta) return;

      const last = liveCallHistory[liveCallHistory.length - 1];
      if (!last || last.role !== 'model') {
        liveCallHistory.push({ role: 'model', text: cleanDelta, time: getNowTime24h() });
      } else {
        if (last.text.endsWith(cleanDelta)) {
          // Tránh lặp chuỗi
        } else {
          last.text = (last.text + ' ' + cleanDelta).trim();
        }
      }

      const currentText = liveCallHistory[liveCallHistory.length - 1].text.trim();
      const tr = $('live-transcript');
      if (tr) tr.innerHTML = `<span style="color:#38bdf8;">✨ <b>Jarvis AI:</b> "${escapeHtml(currentText)}"</span>`;

      if (isFarewellIntent(currentText)) {
        handleFarewellTriggered('model');
      }
    }

    function startLiveSpeechRec() {
      stopLiveSpeechRec();
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) return;
      try {
        liveSpeechRec = new SpeechRec();
        liveSpeechRec.continuous = true;
        liveSpeechRec.interimResults = true;
        liveSpeechRec.lang = 'vi-VN';

        liveSpeechRec.onresult = event => {
          let finalTranscript = '';
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
          }
          const recognized = (finalTranscript || interimTranscript).trim();
          if (recognized) {
            appendLiveUserText(recognized);
          }
        };

        liveSpeechRec.onerror = () => {};
        liveSpeechRec.onend = () => {
          if (liveWs && liveWs.readyState === WebSocket.OPEN && !liveFarewellDetected) {
            try { liveSpeechRec.start(); } catch {}
          }
        };
        liveSpeechRec.start();
      } catch {}
    }

    function stopLiveSpeechRec() {
      if (liveSpeechRec) {
        try {
          liveSpeechRec.onresult = null;
          liveSpeechRec.onerror = null;
          liveSpeechRec.onend = null;
          liveSpeechRec.stop();
        } catch {}
        liveSpeechRec = null;
      }
    }

    async function endLiveCall(reasonNotice = "") {
      resetLiveSilenceTimer();
      if (liveFarewellTimer) { clearTimeout(liveFarewellTimer); liveFarewellTimer = null; }
      stopLiveSpeechRec();

      try { liveWs?.close(); } catch {}
      liveWs = null;
      cleanupLive();
      $('live-call-modal').style.display = 'none';

      // Chuyển toàn bộ hội thoại cuộc gọi Live vào khung chat chính
      if (liveCallHistory.length > 0) {
        const cs = sessions.find(x => x.id === activeId);
        const validItems = liveCallHistory.filter(item => item.text && item.text.trim().length > 0);
        if (validItems.length > 0) {
          for (const item of validItems) {
            chatHistory.push({
              role: item.role,
              text: item.text.trim(),
              time: item.time || getNowTime24h(),
              isLiveCall: true
            });
          }
          if (cs) {
            cs.his = chatHistory;
            await saveToDB(cs);
            renderSel();
          }
          await reRenderHistory();
          if (DOM.chat) DOM.chat.scrollTop = DOM.chat.scrollHeight;
          showToast(reasonNotice || "Đã lưu toàn bộ nội dung cuộc gọi vào hội thoại!", "info");
        } else if (reasonNotice) {
          showToast(reasonNotice, "info");
        }
        liveCallHistory = [];
      } else if (reasonNotice) {
        showToast(reasonNotice, "info");
      }
    }

    function getLiveCallSI() {
      const cs = sessions.find(x => x.id === activeId),
            sSI = DOM.sysInst?.value.trim() || cs?.sys || '',
            g = DOM.globContext?.value.trim() || ls.getItem('jarvis_global_context') || ls.getItem('huanmu_global_context') || '';
      const now = new Date(),
            days = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
      const hh = String(now.getHours()).padStart(2, '0'),
            mm = String(now.getMinutes()).padStart(2, '0'),
            ss = String(now.getSeconds()).padStart(2, '0');

      let si = `[VAI TRÒ & NGỮ CẢNH PHIÊN]:\n${(DOM.toggleGlob?.checked !== false && g) ? `--- TOÀN CỤC: ${g}\n\n` : ''}${sSI ? `--- RIÊNG: ${sSI}` : 'Bạn là Jarvis AI thông minh, thân thiện và nhạy bén.'}\n\n[QUY TẮC ĐÀM THOẠI & TRA CỨU TAVILY]:\n- BẠN ĐƯỢC TRANG BỊ CÔNG CỤ 'search_web' (chạy bằng Tavily AI) VÀ 'read_url'.\n- BẮT BUỘC: Khi người dùng yêu cầu tìm kiếm, tra cứu bất kỳ thông tin nào về tin tức mới, sự kiện, giá cả, thời tiết, kết quả bóng đá, hoặc dữ liệu thực tế, bạn PHẢI GỌI CÔNG CỤ 'search_web' ngay lập tức mà không được từ chối.\n- Sau khi công cụ trả về kết quả, hãy tổng hợp ngắn gọn, súc tích 1-2 câu tự nhiên bằng tiếng Việt như người thật đang đàm thoại.\n- KHI NGƯỜI DÙNG NÓI LỜI CHÀO TẠM BIỆT (như "tạm biệt", "hẹn gặp lại", "bye", "kết thúc", "cúp máy"): Hãy đáp lại bằng một lời chào ngắn gọn và thân thiện (ví dụ: "Tạm biệt bạn, hẹn gặp lại!") rồi dừng nói.\n[THỜI GIAN CHUẨN]: ${days[now.getDay()]}, ngày ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}, lúc ${hh}:${mm}:${ss} (Giờ Việt Nam GMT+7).`;
      if ($('live-toggle-context')?.checked && chatHistory.length) {
        si += `\n\n[LỊCH SỬ 10 TIN TRƯỚC]:\n` + chatHistory.slice(-10).map(m => `${m.role==='model'?'AI':'Bạn'}: ${m.text.replace(/<[^>]+>/g,'').replace(/```[\s\S]*?```/g,'[code]')}`).join('\n');
      }
      return si;
    }

    function getLiveApiKey() {
      const sel = $('live-key-select')?.value || 'auto';
      if (sel !== 'auto') {
        const idx = parseInt(sel),
              k = (ls.getItem(`jarvis_api_${idx+1}`) || ls.getItem(`huanmu_api_${idx+1}`) || ls.getItem(`javiss_api_${idx+1}`) || '').trim();
        if (k) return { key: k, index: idx };
      }
      return apiKeys.length ? { key: apiKeys[liveKeyIndex % apiKeys.length], index: liveKeyIndex % apiKeys.length } : { key: '', index: -1 };
    }

    function downsampleTo16kPCM(inputData, inputSampleRate) {
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

    function playPcm24k(b64, ctx, st) {
      const bin = atob(b64), b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(b.buffer), f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
      const ab = ctx.createBuffer(1, f32.length, 24000);
      ab.copyToChannel(f32, 0);
      const src = ctx.createBufferSource();
      src.buffer = ab;
      src.connect(ctx.destination);
      st.nextPlayTime = Math.max(st.nextPlayTime, ctx.currentTime);
      src.start(st.nextPlayTime);
      st.nextPlayTime += ab.duration;
      st.activeSources.push(src);
      if ($('live-orb')) $('live-orb').className = 'live-orb speaking';
      src.onended = () => {
        st.activeSources = st.activeSources.filter(s => s !== src);
        if (!st.activeSources.length && $('live-orb')) {
          $('live-orb').className = 'live-orb listening';
          
          // Nếu có câu chào tạm biệt, tự ngắt cuộc gọi ngay sau khi AI nói xong
          if (liveFarewellDetected) {
            if (liveFarewellTimer) clearTimeout(liveFarewellTimer);
            setTimeout(() => endLiveCall("Đã tự động kết thúc cuộc gọi theo lời chào tạm biệt!"), 700);
            return;
          }

          // Kích hoạt đếm ngược tự ngắt nếu người dùng im lặng trong 16 giây
          resetLiveSilenceTimer();
          let timeLeft = 16;
          liveSilenceInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 5 && $('live-call-status') && isLiveSetupComplete && !liveFarewellDetected) {
              $('live-call-status').innerText = `🟢 Đang nghe... (Tự ngắt sau ${timeLeft}s)`;
            }
          }, 1000);

          liveSilenceTimer = setTimeout(() => {
            endLiveCall("Đã tự động kết thúc cuộc gọi do không có tương tác.");
          }, 16000);
        }
      };
    }

    function cleanupLive() {
      isLiveSetupComplete = false;
      liveFarewellDetected = false;
      resetLiveSilenceTimer();
      if (liveFarewellTimer) { clearTimeout(liveFarewellTimer); liveFarewellTimer = null; }
      stopLiveSpeechRec();
      try { liveScriptProcessor?.disconnect(); liveScriptProcessor = null; } catch {}
      try { liveMicSource?.disconnect(); liveMicSource = null; } catch {}
      try { liveSilentGain?.disconnect(); liveSilentGain = null; } catch {}
      liveMediaStream?.getTracks().forEach(t => t.stop());
      liveMediaStream = null;
      try { liveAudioCtx?.close(); } catch {}
      liveAudioCtx = null;
      clearInterval(liveCamInterval);
      liveCamInterval = null;
      const cv = $('live-camera-video');
      if (cv) { cv.srcObject = null; cv.style.display = 'none'; }
      isLiveCamOn = isLiveMicMuted = false;
      if ($('btn-live-mic-toggle')) { $('btn-live-mic-toggle').className = 'live-control-btn active'; $('btn-live-mic-toggle').innerHTML = '🎙️'; }
      if ($('btn-live-cam-toggle')) $('btn-live-cam-toggle').className = 'live-control-btn';
    }

    async function startLiveVoiceCall() {
      const { key, index } = getLiveApiKey();
      if (!key) return showToast("Cần ít nhất 1 Google API Key trong Cài đặt!", "danger");

      const m = $('live-call-modal'), st = $('live-call-status'), tr = $('live-transcript'), orb = $('live-orb');
      m.style.display = 'flex';
      st.innerText = `Đang kết nối [Key ${index+1}]...`;
      tr.innerHTML = '<i>Đang mở micro & kết nối máy chủ Jarvis Live...</i>';
      orb.className = 'live-orb listening';
      livePlaybackState = { nextPlayTime: 0, activeSources: [] };
      isLiveSetupComplete = false;
      liveFarewellDetected = false;
      resetLiveSilenceTimer();
      if (liveFarewellTimer) { clearTimeout(liveFarewellTimer); liveFarewellTimer = null; }

      try {
        liveAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (liveAudioCtx.state === 'suspended') await liveAudioCtx.resume();
        const actualSampleRate = liveAudioCtx.sampleRate;

        liveMediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
        });
        liveWs = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`);

        liveWs.onopen = () => {
          const selectedLiveModel = $('live-model-select')?.value || 'models/gemini-3.8-live';
          const voice = $('live-voice-select')?.value || 'Charon',
                temp = parseFloat($('live-temperature')?.value || 0.7);

          const setupMsg = {
            setup: {
              model: selectedLiveModel,
              generationConfig: {
                responseModalities: ["AUDIO"],
                temperature: temp,
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice }
                  }
                }
              },
              tools: [
                {
                  functionDeclarations: [
                    {
                      name: "search_web",
                      description: "Tìm kiếm dữ liệu thời gian thực trên Internet bằng Tavily AI khi người dùng yêu cầu tìm kiếm, tra cứu tin tức, sự kiện hoặc câu hỏi thực tế.",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: { type: "STRING", description: "Từ khóa hoặc câu truy vấn cần tìm kiếm trên Internet" }
                        },
                        required: ["query"]
                      }
                    },
                    {
                      name: "read_url",
                      description: "Đọc và bóc tách nội dung chi tiết từ một đường link URL cụ thể.",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          url: { type: "STRING", description: "Địa chỉ liên kết URL" }
                        },
                        required: ["url"]
                      }
                    }
                  ]
                }
              ],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: { parts: [{ text: getLiveCallSI() }] }
            }
          };

          liveWs.send(JSON.stringify(setupMsg));

          liveMicSource = liveAudioCtx.createMediaStreamSource(liveMediaStream);
          liveScriptProcessor = liveAudioCtx.createScriptProcessor(4096, 1, 1);
          liveSilentGain = liveAudioCtx.createGain();
          liveSilentGain.gain.value = 0;

          liveScriptProcessor.onaudioprocess = e => {
            if (!isLiveSetupComplete || isLiveMicMuted || liveWs?.readyState !== WebSocket.OPEN) return;
            const floatData = e.inputBuffer.getChannelData(0);

            let sum = 0;
            for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i];
            const rms = Math.sqrt(sum / floatData.length);
            if (rms > 0.015 && orb && !orb.classList.contains('speaking')) {
              orb.style.transform = `scale(${1 + Math.min(rms * 2.5, 0.25)})`;
            } else if (orb && !orb.classList.contains('speaking')) {
              orb.style.transform = 'scale(1)';
            }

            if (rms > 0.02) resetLiveSilenceTimer();
            const pcm16k = downsampleTo16kPCM(floatData, actualSampleRate);
            let bin = '';
            for (let i = 0; i < pcm16k.length; i++) bin += String.fromCharCode(pcm16k[i]);

            liveWs.send(JSON.stringify({
              realtimeInput: {
                audio: { mimeType: "audio/pcm;rate=16000", data: btoa(bin) }
              }
            }));
          };

          liveMicSource.connect(liveScriptProcessor);
          liveScriptProcessor.connect(liveSilentGain);
          liveSilentGain.connect(liveAudioCtx.destination);
        };

        liveWs.onmessage = async e => {
          try {
            const msg = JSON.parse(e.data instanceof Blob ? await e.data.text() : e.data);

            if (msg.setupComplete || msg.serverContent?.setupComplete) {
              isLiveSetupComplete = true;
              liveRetryCount = 0;
              st.innerText = `🟢 Đã kết nối Jarvis Live 3.8`;
              tr.innerHTML = '<i>Hãy nói chuyện bình thường hoặc yêu cầu tìm kiếm...</i>';
              startLiveSpeechRec();
              return;
            }

            if (msg.toolCall?.functionCalls?.length) {
              for (const call of msg.toolCall.functionCalls) {
                let searchOutput = "";
                if (call.name === "search_web") {
                  const q = call.args?.query || "";
                  tr.innerHTML = `<span style="color:#38bdf8;">⚡ <b>Jarvis AI:</b> Đang dùng Tavily tìm: "<em>${escapeHtml(q)}</em>"...</span>`;
                  searchOutput = await executeLiveSearch(q);
                } else if (call.name === "read_url") {
                  const u = call.args?.url || "";
                  tr.innerHTML = `<span style="color:#38bdf8;">🌐 <b>Jarvis AI:</b> Đang đọc link: "<em>${escapeHtml(u.substring(0, 25))}...</em>"</span>`;
                  try {
                    const ext = await extractWebPageContent(u);
                    searchOutput = ext.content.substring(0, 10000);
                  } catch {
                    searchOutput = await executeLiveSearch(u);
                  }
                }

                liveWs?.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [
                      {
                        response: { output: { results: searchOutput || "Không tìm thấy dữ liệu liên quan." } },
                        id: call.id
                      }
                    ]
                  }
                }));
              }
            }

            const sc = msg.serverContent;
            if (sc) {
              if (sc.interrupted) {
                livePlaybackState.activeSources.forEach(s => { try { s.stop(); } catch {} });
                livePlaybackState = { nextPlayTime: liveAudioCtx?.currentTime || 0, activeSources: [] };
                if (orb) orb.className = 'live-orb listening';
              }

              // Nhận dạng giọng nói người dùng (cả inputTranscription và inputAudioTranscription)
              const userTxt = sc.inputTranscription?.text || sc.inputAudioTranscription?.text || sc.interimInputTranscription?.text || sc.interimTranscript;
              if (userTxt) {
                appendLiveUserText(userTxt);
              }

              // Audio & Text parts từ model
              for (const p of (sc.modelTurn?.parts || [])) {
                if (p.inlineData?.data) playPcm24k(p.inlineData.data, liveAudioCtx, livePlaybackState);
                if (p.text) appendLiveAiText(p.text);
              }

              // Nhận dạng câu nói AI (cả outputTranscription và outputAudioTranscription)
              const aiTxt = sc.outputTranscription?.text || sc.outputAudioTranscription?.text;
              if (aiTxt) {
                appendLiveAiText(aiTxt);
              }

              // Hoàn tất lượt model (turnComplete)
              if (sc.turnComplete && liveFarewellDetected) {
                if (!livePlaybackState.activeSources.length) {
                  if (liveFarewellTimer) clearTimeout(liveFarewellTimer);
                  liveFarewellTimer = setTimeout(() => endLiveCall("Đã tự động kết thúc cuộc gọi theo lời chào tạm biệt!"), 600);
                }
              }
            }
          } catch {}
        };

        liveWs.onclose = ev => {
          resetLiveSilenceTimer();
          cleanupLive();
          if (orb) { orb.className = 'live-orb'; orb.style.transform = 'scale(1)'; }

          // MÃ 1008 (Policy Violation / Quota / Rate limit) HOẶC 1011 / 1006
          const isRetryable = (ev.code === 1008 || ev.code === 1011 || ev.code === 1006 || ev.reason?.toLowerCase().includes('quota') || ev.reason?.toLowerCase().includes('policy') || ev.reason?.toLowerCase().includes('rate'));
          if (isRetryable && apiKeys.length > 1 && liveRetryCount < apiKeys.length) {
            liveRetryCount++;
            const prevIdx = liveKeyIndex;
            liveKeyIndex = (liveKeyIndex + 1) % apiKeys.length;
            st.innerText = `⚠️ Key ${prevIdx+1} bận (Mã ${ev.code}) ➔ Tự động đổi sang Key ${liveKeyIndex+1}...`;
            tr.innerHTML = `<span style="color:#f59e0b;">Đang chuyển sang Google Key ${liveKeyIndex+1} để tiếp tục...</span>`;
            setTimeout(startLiveVoiceCall, 500);
            return;
          }

          st.innerText = `Đã ngắt (Mã: ${ev.code})`;
          tr.innerHTML = `<span>Phiên thoại kết thúc.${ev.code === 1008 ? ' (Mã 1008 là do Key này bị giới hạn rate limit hoặc hết quota. Hãy thêm nhiều Key trong Cài đặt để hệ thống tự xoay vòng)' : ''}</span>`;
          
          // Tự đóng sau 1.5 giây nếu có hội thoại để chuyển về chat văn bản
          if (liveCallHistory.length > 0) {
            setTimeout(() => endLiveCall("Đã chuyển về giao diện chat văn bản!"), 1500);
          }
        };
      } catch (err) {
        st.innerText = 'Lỗi kết nối';
        tr.innerHTML = `<span>${err.message}</span>`;
        cleanupLive();
      }
    }

    $('btn-live-call-open').onclick = startLiveVoiceCall;
    $('btn-live-end-call').onclick = () => endLiveCall();
    $('live-model-select').onchange = () => { if (liveWs?.readyState === WebSocket.OPEN) { liveWs.close(); setTimeout(startLiveVoiceCall, 300); } };
    $('live-voice-select').onchange = e => { ls.setItem('live_voice_name', e.target.value); if (liveWs?.readyState === WebSocket.OPEN) { liveWs.close(); setTimeout(startLiveVoiceCall, 300); } };
    $('live-key-select').onchange = e => { ls.setItem('live_selected_key', e.target.value); if (liveWs?.readyState === WebSocket.OPEN) { liveWs.close(); setTimeout(startLiveVoiceCall, 300); } };
    $('btn-live-mic-toggle').onclick = () => {
      isLiveMicMuted = !isLiveMicMuted;
      const b = $('btn-live-mic-toggle');
      b.className = `live-control-btn ${isLiveMicMuted ? '' : 'active'}`;
      b.innerHTML = isLiveMicMuted ? '🔇' : '🎙️';
    };
    $('btn-live-cam-toggle').onclick = async () => {
      const v = $('live-camera-video'), b = $('btn-live-cam-toggle');
      if (!isLiveCamOn) {
        try {
          v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } });
          v.style.display = 'block';
          isLiveCamOn = true;
          b.className = 'live-control-btn active';
          const cv = document.createElement('canvas'), cx = cv.getContext('2d');
          liveCamInterval = setInterval(() => {
            if (!isLiveCamOn || liveWs?.readyState !== WebSocket.OPEN || !isLiveSetupComplete) return;
            cv.width = v.videoWidth || 320; cv.height = v.videoHeight || 240; cx.drawImage(v, 0, 0, cv.width, cv.height);
            liveWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "image/jpeg", data: cv.toDataURL('image/jpeg', 0.6).split(',')[1] }] } }));
          }, 1000);
        } catch (e) { showToast("Lỗi Cam: " + e.message, 'danger'); }
      } else {
        v.srcObject?.getTracks().forEach(t => t.stop());
        v.style.display = 'none';
        clearInterval(liveCamInterval);
        isLiveCamOn = false;
        b.className = 'live-control-btn';
      }
    };

    window.startLiveVoiceCall = startLiveVoiceCall;
    window.endLiveCall = endLiveCall;
