/* ==========================================================================
   Jarvis AI - AudioWorklet Processor cho Live Call
   Chạy trên audio thread riêng, tránh block main thread khi thu âm dài.
   Downsample PCM 16kHz + tính RMS, gửi về main thread qua port.
   ========================================================================== */
class LiveMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    if (!Number.isFinite(this.ratio) || this.ratio < 1) this.ratio = 1;
  }

  process(inputs) {
    const input = inputs && inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);

    const length = Math.floor(input.length / this.ratio);
    const pcm = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(i * this.ratio);
      let s = input[idx];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Chuyển buffer sang main thread (transferable)
    this.port.postMessage({ pcm: pcm.buffer, rms }, [pcm.buffer]);
    return true;
  }
}

registerProcessor('live-mic-processor', LiveMicProcessor);
