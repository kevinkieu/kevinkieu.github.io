# TODO: Core Personal AI Upgrades (Priority)

> Ưu tiên cá nhân: **Wake word + Barge-in** → **Local LLM Offline** → **Hierarchical Memory +
> Fact-check**

---

## 1. 🎙️ "Hey Jarvis" Hands-Free — Wake Word + Barge-in

### 1.1 Wake Word Detection (On-Device)

- [ ] 1.1.1 Thêm `@picovoice/porcupine-web` (WASM) hoặc `porcupine-react-native` cho Capacitor sau
      này
- [ ] 1.1.2 Tạo `js/wake-word.js`: khởi tạo Porcupine với keyword "Hey Jarvis" (file `.ppn` tự train
      hoặc dùng built-in)
- [ ] 1.1.3 AudioWorklet processor để stream mic → Porcupine real-time (không block main thread)
- [ ] 1.1.4 UI indicator: 🎙️ pulsing khi listening, 🔴 khi detected, toast "Đang nghe..."
- [ ] 1.1.5 Tích hợp vào `js/live.js`: wake word trigger → tự mở live session / voice input
- [ ] 1.1.6 Setting bật/tắt wake word, chọn sensitivity, test microphone

### 1.2 Barge-in / Interrupt

- [ ] 1.2.1 `js/tts.js`: expose `stopSpeaking()` / `pauseSpeaking()` → cancel Web Audio buffer
      source
- [ ] 1.2.2 `js/live.js` + `js/app.js`: khi user nói giữa lúc Jarvis trả lời (voice input active) →
      abort current generation, dừng TTS, bắt đầu lượt mới
- [ ] 1.2.3 Visual feedback: speaking bubble chuyển sang "interrupted" state, hiển thị "Đã ngắt"

### 1.3 Voice Activity Detection (VAD) cải tiến

- [ ] 1.3.1 Thay `webkitSpeechRecognition` bằng `silero-vad` (WASM) cho VAD chính xác hơn, offline
- [ ] 1.3.2 Auto-punctuate, endpointing tùy chỉnh (ngắt sau 1.5s im lặng)

---

## 2. 💻 Chat Offline, Zero Cost — Local LLM Fallback

### 2.1 Ollama Integration (Local Server)

- [ ] 2.1.1 `js/local-llm.js`: Ollama client (fetch `http://localhost:11434/api/chat`, streaming)
- [ ] 2.1.2 Model registry: thêm `LOCAL_MODELS` trong `js/model-registry.js` (llama3.2, qwen2.5,
      phi3.5, gemma2…)
- [ ] 2.1.3 Auto-detect Ollama running → hiển thị badge "Local LLM available" trong model select
- [ ] 2.1.4 Fallback chain: Cloud model fail (429/500/offline) → auto switch sang local model tương
      đương
- [ ] 2.1.5 Setting: Ollama host, default local model, enable/disable auto-fallback

### 2.2 WebLLM / WebGPU (Zero-Install, In-Browser)

- [ ] 2.2.1 `js/webllm.js`: `@mlc-ai/web-llm` loader (lazy load qua `js/lazy-libs.js`)
- [ ] 2.2.2 Model list: `Llama-3.2-3B-Instruct-q4f16_1`, `Phi-3.5-mini-instruct-q4f16_1`,
      `Gemma-2-2B-it-q4f16_1`
- [ ] 2.2.3 WebGPU detection → toast "WebGPU ready" / "Fallback WebGL" / "Unsupported"
- [ ] 2.2.4 Progress bar tải model (IndexedDB cache), chỉ tải 1 lần
- [ ] 2.2.5 Unified interface: `generateLocal(prompt, opts)` dùng chung cho Ollama & WebLLM

### 2.3 Unified Model Router (Smart Fallback)

- [ ] 2.3.1 `js/model-router.js`: intent classification (code/reasoning/creative/quick) → chọn model
      tối ưu
- [ ] 2.3.2 Priority: User preference → Cloud (Gemini/OpenRouter) → Local (Ollama) → In-browser
      (WebLLM)
- [ ] 2.3.3 Cost/latency tracking per model → auto adjust priority
- [ ] 2.3.4 UI: "Auto" option trong #model-select (mặc định bật)

---

## 3. 🧠 Trí Nhớ Dài Hạn, Ít Hallucination — Hierarchical Memory + Fact-Check

### 3.1 Hierarchical Summarization (Long-Term Memory)

- [ ] 3.1.1 `js/memory-hierarchy.js`:
  - Level 1: Raw messages (recent 20-50 turns, full fidelity)
  - Level 2: Session summaries (mỗi session → 200-500 tokens, vector embedding)
  - Level 3: Topic clusters (k-means trên embeddings → topic label + centroid)
  - Level 4: Knowledge graph entities (subject-predicate-object từ triplet extraction)
- [ ] 3.1.2 Background worker (`js/memory.worker.js`): chạy summarization khi idle, không block UI
- [ ] 3.1.3 Retrieval: query → hybrid search (vector + lexical) trên Level 2+3 → inject context
- [ ] 3.1.4 Auto-learn: sau mỗi lượt chat, extract facts → upsert vào Level 4 (dedupe by embedding
      similarity)

### 3.2 Fact-Check Loop (Anti-Hallucination)

- [ ] 3.2.1 `js/fact-check.js`: sau khi model trả lời → extract claims (regex + NER) → parallel
      search (Tavily/Serper/Jina)
- [ ] 3.2.2 Verification: so sánh claim vs top-k sources → label ✅ Supported / ⚠️ Contradicted / ❓
      Unverified
- [ ] 3.2.3 UI: badge trên message bubble, click → mở panel citations với highlight
- [ ] 3.2.4 Config: bật/tắt, ngưỡng confidence, engine search ưu tiên

### 3.3 RAG Enhancement (Có sẵn `js/rag.js`, mở rộng)

- [ ] 3.3.1 Chunking thông minh: semantic boundary (heading/paragraph) + overlap 10%
- [ ] 3.3.2 Hybrid scoring: BM25 + cosine + recency boost + source authority
- [ ] 3.3.3 Re-ranker: cross-encoder (local `onnxruntime-web` / `transformers.js`) cho top-20 →
      top-5
- [ ] 3.3.4 Citation tracking: mọi chunk trả về kèm doc_id, position → render inline citation [¹][²]

---

## 4. 🔧 Infrastructure & DX (Hỗ trợ 3 mục trên)

- [ ] 4.1 TypeScript strict check: `tsc --checkJs --strict` cho `js/` (bắt lỗi sớm)
- [ ] 4.2 Vitest coverage ≥ 80% cho module mới (`wake-word`, `local-llm`, `memory-hierarchy`,
      `fact-check`)
- [ ] 4.3 `npm run check-map` pass sau mỗi PR
- [ ] 4.4 `npm run check-models` pass khi cập nhật model registry
- [ ] 4.5 Storybook-style preview: `preview.html?component=WakeWordIndicator` cho UI dev

---

## 5. 📦 Deliverables (Definition of Done)

| Feature        | Demo Criteria                                                                         |
| -------------- | ------------------------------------------------------------------------------------- |
| **Wake Word**  | Nói "Hey Jarvis" → mic bật, toast hiện, Jarvis phản hồi (không cần chạm màn hình)     |
| **Barge-in**   | Jarvis đang nói → user nói "Dừng" → Jarvis dừng ngay, chờ lệnh mới                    |
| **Local LLM**  | Tắt mạng / tắt API key → chat vẫn chạy (Ollama hoặc WebLLM), latency < 3s first token |
| **Memory**     | Hỏi "Anh nói gì về project X tháng trước?" → trả lời đúng, cite session cũ            |
| **Fact-check** | Model bịa fact → badge ⚠️ hiện, click thấy evidence trái ngược                        |

---

## 🎯 Next Action (Bắt đầu ngay)

1. **Wake Word**: Setup Porcupine WASM + AudioWorklet trong `js/wake-word.js` + tích hợp `live.js`
2. **Local LLM**: Ollama client `js/local-llm.js` + model router `js/model-router.js`
3. **Memory**: `js/memory-hierarchy.js` + background worker + retrieval hook vào `app.js`

> Mỗi feature: viết test → implement → `npm test` + `npm run check-map` → commit. Không viết
> all-in-one.
