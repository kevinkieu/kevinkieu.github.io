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
- [x] Kiểm tra lại barge-in: đang đọc TTS mà người dùng nói thì cắt ngay và bắt đầu lượt mới.
      (2026-11-27: đã sửa — barge-in trước đây chết im lặng do module scope; nay rebind qua
      appendFn.)

### 3. 🧠 Trí nhớ & chống bịa

- [x] Gộp trùng khi lưu trí nhớ (`addMemoryItem` so text chuẩn hoá + cosine ≥ 0.93).
- [x] Ghi nhớ nhanh bằng lệnh chat `/remember <nội dung>`.
- [ ] Phân cấp trí nhớ: session summary → topic cluster → knowledge graph (hiện chỉ có summary +
      vector).
- [ ] Fact-check câu trả lời (claim extraction → search → badge ✅/⚠️/❓).
- [ ] RAG nâng cao: chunk theo ngữ nghĩa, BM25 + cosine + recency, re-ranker, trích dẫn nội tuyến.

## Kỹ thuật / nợ dọn dẹp

- [x] ~~`npm run typecheck` đỏ vì `checkJs: false`~~ — đã bật `checkJs: true`, đưa `types/**/*.d.ts`
      vào `include` và sửa hết lỗi: hiện `tsc --noEmit` = 0 lỗi.
- [x] ~~Test chép lại logic thay vì chạy mã production~~ — `search/extract/blob/markdown.worker` giờ
      nạp chính file trong `js/`; thêm `test/sanitize.test.js`, `test/sync-merge.test.js`.
- [ ] Tách nốt `DOM.sendBtn.onclick` (~2.500 dòng trong `js/app.js`) thành module `send-pipeline`
      riêng. Chưa làm vì handler dùng hàng trăm biến closure của `app.js`; tách mù sẽ dễ làm vỡ
      luồng gửi tin. Các phần an toàn (render lịch sử, RAG worker, merge thuần) đã tách trước.
- [ ] `local-llm.js`, `persona-config.js` chưa có test riêng.

- [x] Phase 1 security hardening (2026-11-27): XSS (session/file/doc/medication names), eventBus
      off() crash, barge-in dead code, Explabs 2 nguồn sự thật, không mirror secret sang native
      bridge, whitelist import backup JSON, RAG editMemory ghi đúng trường vector, debug-overlay
      escapeHtml no-op + vòng lặp gesture shake.
- [x] Rotate keystore (2026-11-27): key ký release cũ lộ công khai → tạo key mới, cập nhật 4 GitHub
      Secrets, CI build APK mới, dọn git history (xoá keystore + build.gradle chứa mật khẩu khỏi mọi
      commit, xoá 142 tag, force-push).
- [x] Phase 3 PWA (2026-11-27): apple-touch-icon PNG thật (iOS), theme-color động, input 16px,
      overscroll-behavior, manifest hiện đại (id relative, orientation any, maskable tách), a11y
      (role/aria-label/prefers-reduced-motion), Background Sync + Notification infra, cache v97,
      ?v=82 cho 4 CSS còn thiếu. `on*`/style nguy hiểm) và áp dụng cho chat render, stream renderer,
      briefing, export PDF/Word, prompt library, tên tệp đính kèm; thêm CSP trong `index.html`; sửa
      `escapeHtml` trong `markdown.worker.js` (trước đây là no-op nên `data-code` bị vỡ).
- [x] Khóa WebView bridge: chỉ nạp từ `https://appassets.androidplatform.net`, chặn điều hướng
      remote trong WebView (mở bằng trình duyệt), chỉ cấp Micro/Camera cho origin nội bộ, tắt
      `allowFileAccess`/universal access/third-party cookie/cleartext, validate tên tệp + MIME khi
      lưu file, `MedicationAlarmReceiver` đặt `exported=false`.
- [x] Smart Sync: hợp nhất THEO TỪNG TIN NHẮN (`js/sync-merge.js`) thay vì chọn cả phiên theo số
      lượng; ghi IndexedDB trong một transaction (clear + put) để không mất dữ liệu khi lỗi; thuốc
      có `updatedAt` + tombstone `jarvis_deleted_med_ids`, lịch sử uống thuốc có tombstone riêng nên
      không hồi sinh từ Cloud.
- [x] Android: sửa thứ tự tham số `saveBase64File(base64, filename, mime)`; release build luôn được
      ký (keystore riêng, không có thì debug key) và CI kiểm tra bằng `apksigner`; thêm Kotlin
      plugin nên `JarvisTileService` thực sự được biên dịch; Tile mở Live Call hands-free thay vì
      wake word đã gỡ; Gradle 8.2 yêu cầu JDK 17 (không chạy JDK 25).
- [x] Build/test: `build:web --check` giờ build thật vào thư mục tạm; `dist/` có đủ file
      (`sanitize.min.js`, `sync-merge.min.js`, `rag.worker.js`); Service Worker tự dò asset từ
      `index.html`, precache từng file và chuẩn hoá cache key `?v=`.
- [x] Tối ưu: RAG dùng `js/rag.worker.js` khi kho ≥ 400 mục (fallback main thread), render lịch sử
      song song vào fragment rồi gắn một lần.
- [x] Dọn asset: `icon.png` (1,3 MB ảnh nguồn) không còn bị đóng gói vào APK/dist; bỏ chặn zoom
      trong viewport để tăng accessibility.

## Vừa hoàn thành (2026-11-26)

- [x] Sửa luồng Gist Cloud: máy mới đồng bộ 2 chiều kéo được API key, base URL của provider động và
      Global Context. `js/sync.js`: D2 bỏ qua key không có ở Cloud, fallback Global Context từ
      top-level settings, manual pull lưu localStorage. Android assets đã sync.

## Ghi chú vận hành

- `npm run sync-assets` sau mỗi lần sửa `js/` / `css/` (mirror sang `android/app/src/main/assets`).
- `npm run check-models`, `npm run check-assets`, `npm run check-map` trước khi commit.
- Thêm model/provider mới: xem quy tắc bắt buộc trong `AGENTS.md` (ảnh + mã hoá key + sync Gist).
