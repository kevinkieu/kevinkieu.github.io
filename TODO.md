# TODO — Jarvis AI

> Cập nhật 2026-11-25. Việc nào xong thì gạch và ghi ngày; đừng để mục đã xong nằm ở đầu danh sách.

## Đang ưu tiên

### 1. 💻 LLM local & offline

- [x] ~~Ollama local~~ — đã gỡ toàn bộ (2026-11-26), không dùng nữa.
- [ ] WebLLM / WebGPU (zero-install trong trình duyệt) qua `js/lazy-libs.js`.
- [ ] Bộ định tuyến model (`/auto`): phân loại ý định (code / suy luận / sáng tạo / trả lời nhanh) →
      chọn model tối ưu, ưu tiên Cloud → WebLLM.

### 2. 🎙️ Giọng nói

- [ ] Wake word on-device thật sự (`@picovoice/porcupine-web` hoặc tương đương) + AudioWorklet, thay
      cho việc phải bấm nút / dùng Quick Settings Tile.
- [ ] VAD chính xác hơn (silero-vad WASM), tự ngắt sau ~1.5s im lặng, tự thêm dấu câu.
- [ ] Kiểm tra lại barge-in: đang đọc TTS mà người dùng nói thì cắt ngay và bắt đầu lượt mới.

### 3. 🧠 Trí nhớ & chống bịa

- [x] Gộp trùng khi lưu trí nhớ (`addMemoryItem` so text chuẩn hoá + cosine ≥ 0.93).
- [x] Ghi nhớ nhanh bằng lệnh chat `/remember <nội dung>`.
- [ ] Phân cấp trí nhớ: session summary → topic cluster → knowledge graph (hiện chỉ có summary +
      vector).
- [ ] Fact-check câu trả lời (claim extraction → search → badge ✅/⚠️/❓).
- [ ] RAG nâng cao: chunk theo ngữ nghĩa, BM25 + cosine + recency, re-ranker, trích dẫn nội tuyến.

## Kỹ thuật / nợ dọn dẹp

- [ ] `npm run typecheck` vẫn đỏ (~1900 lỗi `checkJs` trong `js/`) — đã bỏ `|| true` để thấy đúng sự
      thật; muốn xanh thì phải làm `types/global.d.ts` khớp thực tế rồi mới bật lại vào CI.
- [ ] `npm test` phủ 8 file / 93 test cho phần lõi; chưa có test cho `local-llm.js`,
      `persona-config.js`.
- [ ] Tách `js/app.js` (~5800 dòng) thành các module nhỏ hơn (send-pipeline, session-manager,
      memory), tránh thêm nhánh mới vào cùng một hàm gửi tin.

## Vừa hoàn thành (2026-11-26)

- [x] Sửa luồng Gist Cloud: máy mới đồng bộ 2 chiều kéo được API key, base URL của provider động và
      Global Context. `js/sync.js`: D2 bỏ qua key không có ở Cloud, fallback Global Context từ
      top-level settings, manual pull lưu localStorage. Android assets đã sync.

## Ghi chú vận hành

- `npm run sync-assets` sau mỗi lần sửa `js/` / `css/` (mirror sang `android/app/src/main/assets`).
- `npm run check-models`, `npm run check-assets`, `npm run check-map` trước khi commit.
- Thêm model/provider mới: xem quy tắc bắt buộc trong `AGENTS.md` (ảnh + mã hoá key + sync Gist).
