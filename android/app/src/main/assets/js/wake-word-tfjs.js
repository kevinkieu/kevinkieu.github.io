/**
 * Jarvis AI - Wake Word Detection (TensorFlow.js Speech Commands + Transfer Learning)
 * Phát hiện "Hey Jarvis" hoàn toàn offline, trên thiết bị, không cần API key.
 * 
 * Cách hoạt động:
 * 1. Tải model "speech-commands" (nhận diện "hey google", "stop", "go"... built-in)
 * 2. Transfer learning: Bạn ghi 5-10 lần "Hey Jarvis" → model học từ đó
 * 3. Real-time detection qua microphone (AudioContext)
 * 
 * Nạp sau globals.js, lazy-libs.js, trước app.js / live.js.
 */

(function () {
  'use strict';

  const STATE = {
    IDLE: 'idle',
    LOADING: 'loading',
    MODEL_LOADING: 'model_loading',
    READY: 'ready',
    LISTENING: 'listening',
    TRAINING: 'training',
    DETECTED: 'detected',
    ERROR: 'error'
  };

  let recognizer = null;
  let audioContext = null;
  let mediaStream = null;
  let state = STATE.IDLE;
  let onDetectCallback = null;
  let onStateChangeCallback = null;
  let onProgressCallback = null; // Dùng cho training progress
  let isModelTrained = false;
  let trainingExamplesCount = 0;

  // Cấu hình
  const CONFIG = {
    // Model speech-commands built-in classes: "hey google", "stop", "go", "left", "right", "up", "down", "yes", "no", "_background_noise_", "_unknown_"
    // Chúng ta sẽ thêm class custom "hey_jarvis"
    customKeyword: 'hey_jarvis',
    // Số mẫu tối thiểu để train (khuyên dùng 8-10)
    minTrainingExamples: 8,
    // Ngưỡng confidence để coi là detected (0-1)
    detectionThreshold: 0.75,
    // Tự động dừng listening sau khi detect (ms), 0 = không tự dừng
    autoRestartDelay: 2000,
    // Sample rate microphone (speech-commands yêu cầu 16kHz hoặc 44.1kHz)
    sampleRate: 16000,
  };

  function setState(newState) {
    if (state !== newState) {
      state = newState;
      if (onStateChangeCallback) onStateChangeCallback(state);
      console.log('[WakeWord-TFJS] State:', state);
    }
  }

  async function loadDependencies() {
    setState(STATE.LOADING);
    try {
      // Tải TF.js core trước, sau đó Speech Commands
      await window.ensureLib('tfjs');
      await window.ensureLib('speechCommands');
      
      // Kiểm tra tf và speechCommands đã sẵn sàng
      if (!window.tf || !window.speechCommands) {
        throw new Error('TF.js hoặc Speech Commands chưa load được');
      }
      
      console.log('[WakeWord-TFJS] Dependencies loaded, TF version:', window.tf.version.tfjs);
      return true;
    } catch (err) {
      console.error('[WakeWord-TFJS] Load dependencies failed:', err);
      setState(STATE.ERROR);
      throw err;
    }
  }

  async function createRecognizerWithRetry(maxRetries = 3) {
    if (recognizer) return recognizer;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log('[WakeWord-TFJS] Creating recognizer, attempt', attempt);
        
        // Tạo recognizer từ built-in model "speech-commands"
        // Sử dụng BROWSER_FFT (nhanh, nhẹ) thay vì BROWSER_FFT_STREAMING
        recognizer = window.speechCommands.create('BROWSER_FFT', undefined, {
          // modelUrl: 'https://storage.googleapis.com/tfjs-models/speech-commands/' // có thể override
        });

        // Khởi tạo recognizer (tải model weights) - QUAN TRỌNG: await ensureModelLoaded()
        await recognizer.ensureModelLoaded();
        
        console.log('[WakeWord-TFJS] Recognizer created, built-in labels:', recognizer.wordLabels());
        
        // Verify create function exists
        if (typeof recognizer.collectExample !== 'function') {
          throw new Error('Recognizer missing collectExample method');
        }
        
        // Thêm class custom "hey_jarvis" (transfer learning)
        isModelTrained = false;
        trainingExamplesCount = 0;
        
        setState(STATE.READY);
        return recognizer;
        
      } catch (err) {
        console.error('[WakeWord-TFJS] Create recognizer failed (attempt', attempt, '):', err);
        if (attempt === maxRetries) {
          throw err;
        }
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  /**
   * Train transfer learning: ghi âm "Hey Jarvis" và thêm vào model
   * @param {number} durationMs - Thời gian ghi mỗi mẫu (ms), mặc định 1000ms
   * @returns {Promise<boolean>} - true nếu train thành công
   */
  async function trainKeyword(durationMs = 1000) {
    if (!recognizer) await createRecognizerWithRetry();
    
    setState(STATE.TRAINING);
    
    try {
      // Yêu cầu quyền microphone
      if (!mediaStream) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: CONFIG.sampleRate,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      // Ghi thêm 1 ví dụ cho class custom
      console.log('[WakeWord-TFJS] Recording training example...');
      if (onProgressCallback) onProgressCallback('recording', 'Đang ghi âm... Hãy nói "Hey Jarvis" rõ ràng');
      
      // collectExample trả về Promise resolve khi xong
      await recognizer.collectExample(CONFIG.customKeyword, {
        durationMs,
        // callback tiến độ (0-1)
        onProgress: (progress) => {
          if (onProgressCallback) onProgressCallback('recording-progress', progress);
        }
      });

      trainingExamplesCount++;
      console.log('[WakeWord-TFJS] Training example added, total:', trainingExamplesCount);
      
      if (onProgressCallback) onProgressCallback('example-added', `Đã ghi ${trainingExamplesCount}/${CONFIG.minTrainingExamples} mẫu`);

      // Nếu đủ mẫu -> train model
      if (trainingExamplesCount >= CONFIG.minTrainingExamples) {
        if (onProgressCallback) onProgressCallback('training', 'Đang huấn luyện model...');
        
        // Train transfer learning
        await recognizer.train({
          epochs: 20,
          callback: {
            onEpochEnd: (epoch, logs) => {
              const progress = (epoch + 1) / 20;
              console.log('[WakeWord-TFJS] Training epoch', epoch + 1, 'loss:', logs.loss.toFixed(4));
              if (onProgressCallback) onProgressCallback('training-progress', `Huấn luyện: ${Math.round(progress * 100)}% (loss: ${logs.loss.toFixed(3)})`);
            }
          }
        });

        isModelTrained = true;
        console.log('[WakeWord-TFJS] Transfer learning completed!');
        
        if (onProgressCallback) onProgressCallback('done', 'Huấn luyện xong! Sẵn sàng phát hiện "Hey Jarvis"');
        
        // Đổi về trạng thái ready
        setState(STATE.READY);
        return true;
      }

      // Chưa đủ mẫu -> vẫn ở trạng thái training
      return false;
    } catch (err) {
      console.error('[WakeWord-TFJS] Training failed:', err);
      setState(STATE.ERROR);
      throw err;
    }
  }

  /**
   * Bắt đầu lắng nghe real-time
   */
  async function startListening() {
    if (state === STATE.LISTENING) return;
    
    if (!recognizer) await createRecognizerWithRetry();
    if (!isModelTrained) {
      throw new Error('Model chưa được train! Hãy gọi trainKeyword() trước.');
    }

    try {
      // Yêu cầu microphone nếu chưa có
      if (!mediaStream) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: CONFIG.sampleRate,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      // Tạo AudioContext nếu chưa có
      if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: CONFIG.sampleRate });
      }
      if (audioContext.state === 'suspended') await audioContext.resume();

      // Bắt đầu lắng nghe với recognizer
      // recognizer.listen(callback, options)
      recognizer.listen(async (result) => {
        // result: { scores: Float32Array, labels: string[], spectralData: Float32Array }
        const scores = result.scores;
        const labels = result.labels;
        
        // Tìm index của custom keyword
        const customIdx = labels.indexOf(CONFIG.customKeyword);
        if (customIdx >= 0) {
          const confidence = scores[customIdx];
          console.log('[WakeWord-TFJS] Detection:', CONFIG.customKeyword, 'confidence:', confidence.toFixed(3));
          
          if (confidence >= CONFIG.detectionThreshold) {
            handleDetection();
          }
        }
        
        // Có thể log top-3 để debug
        // const top3 = Array.from(scores).map((s, i) => ({label: labels[i], score: s}))
        //   .sort((a, b) => b.score - a.score).slice(0, 3);
        // console.log('[WakeWord-TFJS] Top3:', top3.map(x => `${x.label}:${x.score.toFixed(3)}`).join(', '));
      }, {
        includeSpectrogram: false,
        probabilityThreshold: CONFIG.detectionThreshold,
        invokeCallbackOnNoiseAndUnknown: true,
        overlapFactor: 0.5 // Overlap 50% giữa các cửa sổ dự đoán
      });

      setState(STATE.LISTENING);
      console.log('[WakeWord-TFJS] Listening started');
      
    } catch (err) {
      console.error('[WakeWord-TFJS] Start listening failed:', err);
      setState(STATE.ERROR);
      throw err;
    }
  }

  function handleDetection() {
    console.log('[WakeWord-TFJS] "Hey Jarvis" DETECTED! 🎉');
    setState(STATE.DETECTED);

    // Trigger callback
    if (onDetectCallback) {
      onDetectCallback();
    }

    // Auto-restart listening sau delay (nếu cấu hình)
    if (CONFIG.autoRestartDelay > 0) {
      setTimeout(() => {
        if (state === STATE.DETECTED) {
          setState(STATE.LISTENING);
        }
      }, CONFIG.autoRestartDelay);
    }
  }

  function stopListening() {
    if (recognizer && state === STATE.LISTENING) {
      recognizer.stopListening();
      console.log('[WakeWord-TFJS] Stopped listening');
    }
    if (state !== STATE.IDLE && state !== STATE.ERROR && state !== STATE.TRAINING) {
      setState(STATE.READY);
    }
  }

  function release() {
    stopListening();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    recognizer = null;
    isModelTrained = false;
    trainingExamplesCount = 0;
    setState(STATE.IDLE);
  }

  // Kiểm tra trình duyệt hỗ trợ
  function isSupported() {
    return !!(
      navigator.mediaDevices && 
      navigator.mediaDevices.getUserMedia &&
      window.AudioContext &&
      window.fetch // Cần fetch để tải model
    );
  }

  // Public API
  window.WakeWordTFJS = {
    // Khởi tạo: tải dependencies + tạo recognizer
    async init() {
      await loadDependencies();
      await createRecognizerWithRetry();
      setState(STATE.READY);
      console.log('[WakeWord-TFJS] Initialized and ready for training');
    },

    // Train từ khóa "Hey Jarvis" (gọi nhiều lần để thêm mẫu)
    // Trả về true khi đã train xong (đủ mẫu), false khi cần thêm mẫu
    async trainKeyword(durationMs) {
      return await trainKeyword(durationMs);
    },

    // Bắt đầu lắng nghe real-time (phải train xong trước)
    async start() {
      await startListening();
    },

    // Dừng lắng nghe
    stop() {
      stopListening();
    },

    // Giải phóng tài nguyên hoàn toàn
    release() {
      release();
    },

    // Trạng thái hiện tại
    getState() {
      return state;
    },

    // Số mẫu đã train
    getTrainingCount() {
      return trainingExamplesCount;
    },

    // Cần thêm bao nhiêu mẫu nữa
    getRemainingExamples() {
      return Math.max(0, CONFIG.minTrainingExamples - trainingExamplesCount);
    },

    // Có đủ mẫu để train chưa
    isReadyToTrain() {
      return trainingExamplesCount >= CONFIG.minTrainingExamples;
    },

    // Model đã train xong chưa
    isTrained() {
      return isModelTrained;
    },

    // Cấu hình
    setDetectionThreshold(value) {
      CONFIG.detectionThreshold = Math.max(0, Math.min(1, value));
    },

    setAutoRestartDelay(ms) {
      CONFIG.autoRestartDelay = Math.max(0, ms);
    },

    // Callbacks
    onDetect(callback) {
      onDetectCallback = callback;
    },

    onStateChange(callback) {
      onStateChangeCallback = callback;
    },

    onProgress(callback) {
      onProgressCallback = callback;
    },

    // Kiểm tra hỗ trợ
    isSupported() {
      return isSupported();
    },

    // Xoá dữ liệu train (reset về đầu)
    resetTraining() {
      if (recognizer) {
        // Speech Commands không có API xoá examples, cần tạo recognizer mới
        recognizer.stopListening();
        recognizer = null;
      }
      isModelTrained = false;
      trainingExamplesCount = 0;
      setState(STATE.READY);
      console.log('[WakeWord-TFJS] Training data reset');
    }
  };

  // Auto-init nếu setting bật (chỉ init dependencies, không auto-train)
  document.addEventListener('DOMContentLoaded', () => {
    const autoStart = localStorage.getItem('jarvis_wake_word_enabled') === 'true';
    if (autoStart && window.WakeWordTFJS.isSupported()) {
      window.WakeWordTFJS.init().catch(console.error);
      // Không auto-start listening vì cần train trước
    }
  });

})();