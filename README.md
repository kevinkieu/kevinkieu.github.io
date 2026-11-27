# 🤖 Jarvis AI Assistant

<div align="center">

![Jarvis AI Banner](icon-512.png)

**Trợ lý AI đa phương thức thông minh thế hệ mới tích hợp Gemini 3.8, Live Voice & Video Call, Thông
dịch viên 2 chiều và Tra cứu Internet thời gian thực.**

_Next-Generation Multimodal AI Assistant powered by Google Gemini 3.8, Live Voice & Video Calls,
Dual-Screen Face-to-Face Interpreter, and Real-Time Web Search._

---

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-10b981?style=for-the-badge&logo=pwa)](manifest.json)
[![Gemini Live API](https://img.shields.io/badge/Gemini-3.8_Live_API-38bdf8?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![JavaScript ES6+](https://img.shields.io/badge/Vanilla_JS-ES_Modules-f59e0b?style=for-the-badge&logo=javascript)](js/)
[![WebSockets](https://img.shields.io/badge/WebSockets-BidiStreaming-8b5cf6?style=for-the-badge)](js/live.js)
[![Platform](https://img.shields.io/badge/Platform-Web_|_PWA_|_Android-ec4899?style=for-the-badge)](android/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

[🇻🇳 Tiếng Việt](#-tiếng-việt) • [🇬🇧 English](#-english)

</div>

---

## 🧩 Module hóa `js/app.js` (cập nhật 2026-11-28)

Đã tách `js/app.js` (từ ~5.800 dòng xuống ~4.300 dòng) thành các module classic script nạp trước
`app.js`:

- `js/chat-ui-helpers.js` — helper UI thuần (cuộn ngang, tiêu đề fallback, sanitize transcript, chia
  chunk TTS).
- `js/session-manager.js` — quản lý phiên (load/new/switch, render tabs/folders/select, auto-name,
  tóm tắt bộ nhớ).
- `js/hands-free.js` — điều khiển voice rảnh tay.
- `js/message-tts.js` — TTS trên tin nhắn.
- `js/native-sync.js` — đồng bộ native + cấu hình.
- `js/offline-queue-ui.js` — UI hàng đợi ngoại tuyến.

`app.js` giữ vai trò shell: alias `window.*` cho các hàm đã tách, wiring DOM và luồng gửi tin (chưa
tách ở Giai đoạn 5).

## 🔐 Bảo mật, đồng bộ & build (cập nhật 2026-11-27)

### Chặn XSS

- `js/sanitize.js` là cửa duy nhất để đưa HTML vào DOM: allowlist thẻ/thuộc tính, bỏ `on*`, chặn
  `javascript:`/`vbscript:`/`data:` (chỉ cho ảnh base64), chặn `style` có `url()`/`expression()`.
  Không phụ thuộc CDN nên APK offline vẫn chạy.
- Đã áp dụng cho: chat/stream renderer, `markdown.worker.js` (escape trong `data-code`), Daily
  Briefing, xuất PDF/Word, Prompt Library và tên tệp đính kèm.
- `index.html` có CSP: `object-src 'none'`, `base-uri 'self'`, chặn script `data:`/`blob:`.

### WebView Android

- Bridge `JarvisNativeBridge` chỉ tồn tại cho `https://appassets.androidplatform.net`; điều hướng
  remote bị chặn và mở bằng trình duyệt ngoài.
- Chỉ cấp Micro/Camera khi origin yêu cầu đúng origin nội bộ.
- `allowFileAccess=false`, universal access tắt, third-party cookie tắt, cleartext tắt,
  `MedicationAlarmReceiver` đặt `exported=false`.
- `saveBase64File(base64, filename, mimeType)` tự lọc path traversal/MIME lạ.

### Smart Sync không mất dữ liệu

- Hợp nhất **theo từng tin nhắn** (`js/sync-merge.js`), không chọn cả phiên theo số lượng, nên hai
  máy cùng chat vẫn giữ đủ tin của cả hai.
- Tombstone tin nhắn/phiên/vector được áp cho cả hai phía trước khi merge.
- Thuốc có `updatedAt` và tombstone `jarvis_deleted_med_ids`; lịch sử uống thuốc có tombstone riêng
  → xóa là không hồi sinh từ Cloud.
- Ghi IndexedDB bằng một transaction `clear + put` (không còn cảnh clear xong rồi lỗi).

### Build & kiểm thử

```bash
npm test              # Vitest, test nạp chính mã trong js/ (không copy logic)
npm run typecheck     # tsc --noEmit, checkJs: true, 0 lỗi
npm run lint          # ESLint
npm run build:web     # dist/ đầy đủ (bundle + classic .min.js + rag.worker.js)
npm run check-assets  # mirror android/app/src/main/assets khớp web root
```

_APK được build tự động bởi GitHub Actions khi push lên main/master. Tải file `JarvisAI.apk` từ
[GitHub Releases](https://github.com/kevinkieu/kevinkieu.github.io/releases)._

- Release APK luôn được ký: dùng `android/keystore.properties` nếu có, không thì debug key.
- Quick Settings Tile (`JarvisTileService.kt`) đã được biên dịch thật và mở Live Call hands-free
  (wake word phía web đã gỡ).

### Cập nhật bảo mật 2026-11-27 (Phase 1 + keystore rotation)

- **Rotate keystore**: key ký release cũ (`jarvis123`) đã lộ công khai trong git history của repo
  public → đã tạo key mới, cập nhật GitHub Secrets, build APK mới với chữ ký mới, và dọn git history
  (xoá keystore + `build.gradle` chứa mật khẩu khỏi mọi commit, xoá 142 tag, force-push).
- **Phase 1 hardening** (đã commit): chặn XSS qua tên phiên/tệp/tài liệu/thuốc; sửa `eventBus.off()`
  crash; barge-in live call (trước đây chết im lặng); Explabs 2 nguồn sự thật; không mirror secret
  sang native bridge; whitelist import backup; RAG `editMemory` ghi đúng trường `vector`; sửa
  `escapeHtml` no-op + vòng lặp gesture trong debug overlay.
- **Phase 3 PWA**: apple-touch-icon PNG thật (iOS), theme-color động, input 16px,
  overscroll-behavior, manifest hiện đại, a11y (role/aria-label/prefers-reduced-motion), Background
  Sync + Notification infra, cache v97.

### Cập nhật hiệu năng 2026-11-28 (Giai đoạn 4)

- **AudioWorklet**: chuyển thu âm Live Call từ `ScriptProcessorNode` (main thread) sang
  `AudioWorklet` (audio thread), có fallback cho trình duyệt cũ.
- **Embedding batch**: gộp nhiều chunk vào 1 request (`getEmbeddingsBatch`), fallback từng item nếu
  lỗi; index tài liệu dùng lô 8 chunk.
- **Backoff reconnect**: exponential + jitter cho fetch Gist pull/push (retry mạng/5xx/429).
- **CI web job**: workflow `web-checks.yml` chạy `node --check`, `sync-assets --check`,
  `check-models`, `check-map` trên push/PR.
- **Stack Android**: compileSdk/targetSdk 34→35, AGP 8.5.2, Gradle 8.7, Kotlin 1.9.24, appcompat
  1.7.0, webkit 1.12.0, material 1.12.0. Cache v98.

---

<a name="-tiếng-việt"></a>

## 🇻🇳 TIẾNG VIỆT

### 🌟 Tổng Quan Dự Án

**Jarvis AI** là một ứng dụng web lũy tiến (Progressive Web App - PWA) kiêm ứng dụng Android độc
lập, được xây dựng hoàn toàn bằng **Vanilla JavaScript (ES Modules)** nguyên bản, không phụ thuộc
vào các framework nặng nề.

Ứng dụng kết hợp sức mạnh của **Google Gemini 3.8 Live API** qua kết nối WebSocket hai chiều
(Bi-directional Streaming), mang lại trải nghiệm đàm thoại giọng nói, video trực tiếp, phiên dịch
đối mặt 2 chiều và tra cứu mạng Internet siêu tốc.

---

### 🚀 Tính Năng Nổi Bật

#### 1. 🗣️ Thông Dịch Viên 2 Chiều Đối Diện (Dual-Screen Face-to-Face Live Translator)

- **Thiết kế màn hình gập đôi (Dual-Screen UI)**: Nửa trên xoay ngược 180° hướng về phía người đối
  diện (khách nước ngoài), nửa dưới quay về phía bạn.
- **Công nghệ Gemini 3.8 Bilateral Interpreter**: Hoạt động như một thông dịch viên song ngữ trực
  tiếp trong cùng một phiên kết nối duy nhất:
  - Bạn nói tiếng Việt ➔ Tự động dịch và phát âm thanh tiếng Khách.
  - Khách nói tiếng nước ngoài ➔ Tự động dịch và phát âm thanh tiếng Việt.
- **Độ trễ chuyển đổi 0ms**: Giữ kết nối liên tục, chuyển mic không cần tải lại socket.
- **Hỗ trợ 20 ngôn ngữ đích** (đúng theo `SUPPORTED_LANGS` trong `js/translate.js`): Việt, Anh,
  Trung, Nhật, Hàn, Pháp, Đức, Thái, Nga, Tây Ban Nha, v.v.
- **VU Meter & Speech Recognition cục bộ**: Vạch đo âm lượng nhảy theo giọng nói và hiển thị ngay
  tức thì phụ đề câu nói lên màn hình.

#### 2. 📞 Cuộc Gọi Thoại & Video Trực Tiếp (Multimodal Live Voice & Video Call)

- **Âm thanh độ trễ cực thấp**: Xử lý luồng âm thanh PCM 16kHz gửi lên máy chủ và phát lại PCM 24kHz
  trực tiếp từ Gemini 3.8 Live.
- **Chia sẻ Camera thời gian thực**: Trợ lý AI có thể "nhìn thấy" môi trường xung quanh qua camera
  điện thoại/laptop để phân tích hình ảnh, đọc tài liệu, hướng dẫn thực tế.
- **Tìm kiếm Web trong cuộc gọi**: AI tự động gọi công cụ **Tavily AI** hoặc **Jina Reader** để tra
  cứu dữ liệu mới nhất (thời tiết, tin tức, giá cả) ngay trong khi đang trò chuyện.
- **Tự động lưu biên bản hội thoại**: Kết thúc cuộc gọi, toàn bộ nội dung trao đổi được ghi lại đầy
  đủ vào phiên chat chính.
- **Tự động ngắt thông minh**: Tự gác máy khi người dùng nói lời chào tạm biệt hoặc đếm ngược khi
  không có tương tác.

#### 3. 💬 Trò Chuyện Thông Minh & Tư Duy Độc Lập (Multi-Model Chat)

- **Kho mô hình đa dạng**: Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 3.8 Live, Gemini 3.1 Flash Live
  Preview.
- **Tư duy mở rộng (Thinking Mode)**: Cho phép điều chỉnh ngân sách tokens suy nghĩ để giải quyết
  các bài toán logic, lập trình phức tạp.
- **Tra cứu Internet đa nền tảng**: Tích hợp Tavily AI, Serper Dev, Brave Search, Jina Reader với cơ
  chế trích xuất từ khóa tìm kiếm thông minh: chỉ tra cứu khi bật Tìm kiếm Web và từ khóa được bọc
  trong cặp dấu #từ khóa#.
- **Định dạng văn bản & Đồ họa đỉnh cao**:
  - Hỗ trợ công thức Toán học chuẩn **KaTeX / LaTeX** ($E = mc^2$).
  - Vẽ sơ đồ tư duy, lưu trình tự động bằng mã **Mermaid.js**.
  - Tô màu mã nguồn (Syntax Highlighting) kèm nút sao chép nhanh 1 chạm.
- **Đa phương thức (Multimodal Input)**: Kéo thả hình ảnh, tài liệu PDF, file mã nguồn TXT/JS/PY,
  file ghi âm để phân tích.

#### 4. 💊 Tủ Thuốc Max Care & Báo Thức Nhắc Uống Thuốc (Max Care Pill & Health Reminder)

- **Quản lý đơn thuốc & TPCN thông minh**: Lên lịch uống thuốc hàng ngày, liều lượng, chủng loại
  (viên nén, viên nang, siro, tiêm, nhỏ mắt, gói bột) kèm hướng dẫn uống (trước/sau bữa ăn, bụng
  đói, trước khi ngủ).
- **Báo thức hệ thống Android chuẩn xác (Exact Alarms)**: Tích hợp sâu vào `AlarmManager` và
  `NotificationManager` của hệ điều hành, đánh thức thiết bị và phát chuông báo đúng từng phút kể cả
  khi điện thoại tắt màn hình hoặc app bị tắt hoàn toàn (`RTC_WAKEUP`).
- **Tự động đặt lại lịch khi khởi động lại máy (`RECEIVE_BOOT_COMPLETED`)**: Không bao giờ bỏ sót
  giờ uống thuốc dù điện thoại vừa khởi động lại.
- **Thao tác nhanh trên Notification**: Tương tác 1 chạm ngay trên thanh thông báo để bấm **"Đã
  uống"** (ghi nhận vào sổ nhật ký) hoặc **"Nhắc lại sau 10 phút"** (Snooze).
- **Đồng bộ Cloud 2 chiều**: Tự động đồng bộ toàn bộ đơn thuốc và lịch sử uống thuốc qua GitHub
  Gist, đổi máy không bao giờ lo mất dữ liệu.

#### 5. 🎙️ Phòng Thu Giọng Nói AI (Gemini TTS Studio)

- Chuyển đổi văn bản thành giọng đọc tự nhiên như người thật.
- Đầy đủ các giọng đọc chuẩn Google: _Charon, Puck, Kore, Fenrir, Aoede..._
- Tùy chỉnh cao độ, tốc độ đọc và tải về file âm thanh MP3/WAV.

#### 6. 🛡️ Bảo Mật & Quản Lý Khóa API Thông Minh

- **Bể chứa API Key (Key Pool)**: Lưu tối đa 10 API Key Google.
- **Tự động xoay tua (Auto-rotate)**: Khi một Key chạm ngưỡng Rate Limit hoặc hết Quota (Mã 1008),
  hệ thống tự động đổi sang Key tiếp theo mà không làm gián đoạn người dùng.
- **Bảo mật phía Client (Client-Side Privacy)**: Khóa API được mã hóa cục bộ (`JVENC_`), chỉ lưu
  trong trình duyệt (`localStorage`), không bao giờ gửi về máy chủ bên thứ ba.

#### 7. 🧠 Kho Tri Thức Cá Nhân & Trí Nhớ Vĩnh Cửu (Second Brain / Permanent Vector Memory)

- **Gemini Embedding 2**: Ứng dụng model nhúng đa phương thức mới nhất từ Google
  (`gemini-embedding-2` kết hợp fallback `gemini-embedding-001`).
- **Không gian Vector cục bộ (IndexedDB)**: Toàn bộ vector nhúng được lưu trữ an toàn trong
  IndexedDB của trình duyệt, không tốn phí thuê Vector DB bên thứ ba.
- **Bộ Lọc Ý Định Kép Thông Minh (Dual-Track Smart Intent Filter)**:
  - **Truy vấn danh tính (Identity Query)**: Tự động phát hiện khi người dùng hỏi về tên tuổi, giới
    tính, ngày sinh, con cái, sở thích hoặc thông tin cá nhân ("tôi tên gì", "tôi là nam hay nữ",
    "bạn nhớ gì về tôi"...) để nạp ngay hồ sơ cá nhân với độ trễ 0ms và độ chính xác 100%.
  - **Bảo vệ đời tư tuyệt đối**: Khi người dùng hỏi các câu hỏi kiến thức phổ thông, ẩm thực, khoa
    học hoặc kỹ thuật (ví dụ "thịt gà có nhiều dinh dưỡng không?"), Trí nhớ cá nhân sẽ ở trạng thái
    ngủ (dormant), tuyệt đối không lôi chuyện gia đình/con cái vào câu trả lời, loại bỏ hoàn toàn
    hiện tượng "quá đà" (over-eagerness).
- **Bảo vệ Độ trễ (Zero-Latency Guard)**:
  - Bỏ qua các câu chào hỏi xã giao ngắn (0ms độ trễ, không tốn API).
  - Tích hợp bộ nhớ đệm Vector Cache RAM cho các câu hỏi phổ biến.
  - Công tắc Bật/Tắt Trí nhớ RAG 1 chạm ngay trên thanh công cụ chat và menu Sidebar.

#### 8. 📚 Chat Với Tài Liệu Lớn (PDF & Document RAG Studio)

- **Studio nạp tài liệu thông minh**: Kéo thả file PDF, TXT, Markdown, CSV, JSON hoặc dán văn bản
  trực tiếp.
- **Cắt đoạn thông minh (Text Chunking with Overlap)**: Tự động chia nhỏ tài liệu theo ngữ cảnh dấu
  câu và nhúng vector hàng loạt với thanh tiến trình trực quan.
- **Trích dẫn chính xác**: AI tự động trích lọc các đoạn liên quan nhất để đưa vào câu trả lời, loại
  bỏ hiện tượng bịa đặt (hallucination).

#### 9. 🔍 Tìm Kiếm Ngữ Nghĩa & Nâng Cấp Trải Nghiệm Tìm Kiếm (Semantic AI Search)

- **2 Chế độ tìm kiếm linh hoạt**:
  - **📝 Từ khóa (Keyword)**: Lọc chuỗi truyền thống siêu tốc.
  - **🧠 Ngữ nghĩa AI (Semantic Vector)**: Nhận diện ý định câu hỏi bằng thuật toán Cosine
    Similarity trực tiếp trên trình duyệt, xếp hạng độ tương đồng (⭐ 95% khớp ý).
- **Trải nghiệm tối ưu PC & Mobile**:
  - Hỗ trợ gõ Enter trên thanh tìm kiếm Header để kích hoạt modal ngay tức thì.
  - Tích hợp ô tìm kiếm nhanh tại đầu thanh Sidebar cho điện thoại.
  - Thanh Header trên Mobile cuộn mượt mà, không bao giờ bị che khuất nút tìm kiếm.

#### 10. ☁️ Đồng Bộ Cloud 2 Chiều & Tự Động Hóa Đa Thiết Bị (2-Way Smart Merge & GitHub Gist Auto-Sync)

- **Hợp nhất 2 chiều thông minh (Smart Merge)**: Dành riêng cho người dùng kết hợp linh hoạt giữa
  **Điện thoại** và **Máy tính**:
  - **Không bao giờ mất dữ liệu**: Tự động gộp hội thoại mới và toàn bộ Trí nhớ Vectơ ("ChatGPT
    Memory") của cả hai thiết bị vào làm một thay vì ghi đè thô bạo.
  - **Khử trùng lặp thông minh**: Loại bỏ các mẩu trí nhớ trùng ý và bảo lưu toàn bộ vector nhúng
    `gemini-embedding-2` đã tính toán sẵn.
  - **Cơ chế Tombstone**: Xóa phiên chat hoặc trí nhớ ở máy này sẽ đồng bộ xóa sạch ở máy còn lại,
    không lo bị "hồi sinh" dữ liệu đã xóa.
- **Tự động đồng bộ ngầm (Background Auto-Sync)**:
  - **Khi mở App**: Tự động kiểm tra và kéo dữ liệu mới từ Cloud về ngầm trong nền.
  - **Khi AI học trí nhớ mới**: Tự động hẹn giờ đẩy ngầm (Debounce) lên Cloud mà bạn không cần phải
    bấm tay mỗi lần chat xong.
  - **Bảo mật tuyệt đối**: Khóa API Google được mã hóa Salted XOR phía Client trước khi lưu lên
    Secret Gist, ngăn chặn hoàn toàn Secret Scanner của GitHub quét trúng.
- **Bảo Vệ Hạn Ngạch Thông Minh (Graceful GitHub Rate Limit Recovery)**:
  - Tự động phát hiện mã lỗi 403/429 khi người dùng gọi API dồn dập, tự phân tích header
    `x-ratelimit-reset` để hiển thị thời gian mở khóa chính xác (theo phút/giờ) và tạm dừng đồng bộ
    ngầm để tránh bị spam lỗi.

---

### 🤖 Bản đồ cấu trúc dành cho mô hình khác (machine-readable)

Nếu bạn muốn một mô hình khác làm quen nhanh với toàn bộ dự án mà không cần đọc từng file, hãy đọc
trước:

- `boicanhduan.json` — bản đồ cấu trúc dự án theo tính năng và file.

---

### 📂 Cấu Trúc Dự Án

```
Jarvis AI/
├── index.html          # Giao diện chính của ứng dụng
├── manifest.json       # Cấu hình PWA (Progressive Web App)
├── sw.js               # Service Worker quản lý offline cache
│
├── css/
│   ├── style.css       # Giao diện chính Cyberpunk Glassmorphism
│   ├── live.css        # Giao diện Cuộc gọi Live Voice & Video
│   ├── translate.css   # Giao diện Thông dịch viên đối diện 2 nửa
│   ├── tts.css         # Giao diện Studio TTS
│   └── rag.css         # Giao diện Kho Tri Thức, RAG & Tìm kiếm Ngữ nghĩa
│
├── js/
│   ├── app.js          # Logic ứng dụng, Chat, Markdown, Quản lý Key & Max Care
│   ├── sync.js         # Đồng bộ Cloud 2 chiều & Tự động hợp nhất GitHub Gist
│   ├── live.js         # Multimodal Live Voice & Video WebSocket
│   ├── translate.js    # Thông dịch viên 2 chiều Gemini 3.8 Bilateral
│   ├── tts.js          # Chuyển văn bản thành giọng nói
│   └── rag.js          # Động cơ RAG, Vector IndexedDB & Gemini Embedding 2
│
└── android/            # Mã nguồn dự án Android (WebView Bridge & Max Care Native Alarms)
```

---

### 🛠️ Cài Đặt & Sử Dụng

#### Cách 1: Chạy trực tiếp trên trình duyệt

1. Clone mã nguồn về máy:
   ```bash
   git clone https://github.com/your-username/jarvis-ai.git
   cd jarvis-ai
   ```
2. Mở thư mục bằng bất kỳ HTTP Server cục bộ nào (ví dụ qua VS Code Extension `Live Server` hoặc
   chạy lệnh Node/Python):
   ```bash
   # Dùng Python:
   python -m http.server 8080

   # Dùng Node.js npx:
   npx serve .
   ```
3. Truy cập địa chỉ `http://localhost:8080` trên trình duyệt (Chrome, Edge, Safari).

#### Cách 2: Cài đặt dưới dạng App (PWA)

- Trên máy tính hoặc điện thoại, bấm vào biểu tượng **"Cài đặt ứng dụng"** (Install App) trên thanh
  địa chỉ trình duyệt để đưa Jarvis AI ra màn hình chính.

#### Cách 3: Cài đặt file APK Android

- Tải file `JarvisAI.apk` mới nhất từ
  [GitHub Releases](https://github.com/kevinkieu/kevinkieu.github.io/releases).
- Dùng `install-phone.bat` (USB) hoặc `install-phone-wifi.bat` (Wi-Fi debugging) để cài đặt vào điện
  thoại.

---

### 🔑 Thiết Lập API Key

1. Lấy **Google Gemini API Key** miễn phí tại [Google AI Studio](https://aistudio.google.com/).
2. (Tùy chọn) Lấy **Tavily API Key** để kích hoạt tìm kiếm Web thông minh tại
   [Tavily AI](https://tavily.com/).
3. Mở Jarvis AI ➔ Bấm vào biểu tượng **Cài đặt (⚙️)** ➔ Dán các Key vào danh sách ➔ Bấm **Lưu cài
   đặt**.

---

<a name="-english"></a>

## 🇬🇧 ENGLISH

### 🌟 Project Overview

**Jarvis AI** is an advanced, privacy-first Progressive Web App (PWA) and standalone Android
application built entirely with **Vanilla JavaScript (ES Modules)**, without the overhead of heavy
front-end frameworks.

Leveraging the cutting-edge **Google Gemini 3.8 Live API** via bidirectional WebSockets
(`BidiGenerateContent`), Jarvis AI delivers instant, human-like voice/video conversations,
split-screen bilateral live interpretation, and real-time internet search capabilities.

---

### 🚀 Key Features

#### 1. 🗣️ Dual-Screen Face-to-Face Live Translator

- **Split-Screen Inverted UI**: The top half of the screen is rotated 180° for the person sitting
  across from you (guest/foreigner), while the bottom half faces you.
- **Bilateral Interpretation (Gemini 3.8 Live)**: Operates as an authentic simultaneous interpreter
  in a single continuous session:
  - Speak Vietnamese ➔ Instantly translates and voices in the guest's language.
  - Speak foreign language ➔ Instantly translates and voices in Vietnamese.
- **0ms Switch Latency**: Persistent WebSocket connection allows instantaneous speaker toggling
  without reconnection delays.
- **20 target languages** (see `SUPPORTED_LANGS` in `js/translate.js`): English, Vietnamese,
  Chinese, Japanese, Korean, French, German, Spanish, Thai, Russian, and more.
- **Real-Time VU Meter & On-Device Transcription**: Live audio volume indicator and 0ms latency
  speech-to-text previews.

#### 2. 📞 Multimodal Live Voice & Video Calls

- **Ultra-Low Latency Audio**: Native 16kHz PCM streaming input and 24kHz PCM audio playback over
  WebSockets.
- **Live Camera Streaming**: Allows the AI assistant to "see" your surroundings in real-time,
  inspect documents, and provide visual assistance.
- **In-Call Web Grounding**: Automatically triggers **Tavily AI** and **Jina Reader** search tools
  mid-dialogue to fetch up-to-date facts, weather, and breaking news.
- **Conversation Sync**: Automatically saves transcripts of the call into your permanent chat
  history upon hanging up.
- **Smart Hangup Detection**: Automatically terminates the call upon detecting farewell intents or
  sustained silence.

#### 3. 💬 Intelligent Chat & Extended Reasoning

- **Wide Range of Gemini Models**: Gemini 2.5 Flash, 2.5 Pro, 3.8 Live, and 3.1 Flash Live Preview.
- **Extended Thinking Mode**: Custom thinking token budget controls for deep logical reasoning and
  complex coding problems.
- **Multi-Engine Search Grounding**: Seamless integration with Tavily AI, Serper Dev, Brave Search,
  and Jina AI.
- **Rich Markdown Formatting**:
  - Full **KaTeX / LaTeX** mathematical formula rendering.
  - Interactive **Mermaid.js** diagrams and flowcharts.
  - Syntax highlighted code blocks with one-click copying.
- **Multimodal Uploads**: Drag-and-drop support for images, PDFs, audio clips, and source code
  files.

#### 4. 💊 Max Care Pill & Health Medication Reminder

- **Comprehensive Medication & Supplement Tracking**: Schedule daily medication regimens, dosages,
  formulations (tablets, capsules, syrup, injections, eye drops, powders), and timing relative to
  meals.
- **Android System Exact Alarms**: Deep integration with native `AlarmManager` and
  `NotificationManager`, triggering exact wake-up notifications and ringtones even while in deep
  Doze mode or terminated (`RTC_WAKEUP`).
- **Auto-Rescheduling on System Boot (`RECEIVE_BOOT_COMPLETED`)**: Seamlessly reschedules all active
  alarms automatically whenever your phone restarts.
- **Interactive Action Notifications**: One-tap "Taken" logging and 10-minute "Snooze" triggers
  directly from notifications and lock screen.
- **Full Cloud Sync**: Prescriptions and medication intake history seamlessly sync across devices
  via GitHub Gist.

#### 5. 🎙️ Studio Text-to-Speech (Gemini TTS)

- Studio-grade natural voice generation with Google voices (_Charon, Puck, Aoede, Kore, Fenrir..._).
- Customizable pitch, speaking rate, and direct MP3/WAV download.

#### 6. 🛡️ Resilient API Key Pool & Local Encryption

- **Key Pool Rotation**: Store up to 10 Google API keys with automatic failover and quota recovery
  (Code 1008 auto-rotation).
- **Client-Side Privacy**: Keys are encrypted locally (`JVENC_`) and stored solely within browser
  storage (`localStorage` / `IndexedDB`). No middleman server.

#### 7. 🧠 Personal Knowledge Base & Second Brain (Permanent Vector Memory)

- **Gemini Embedding 2 Engine**: Employs Google's latest multimodal embedding model
  (`gemini-embedding-2` with graceful fallback to `gemini-embedding-001`).
- **On-Device Vector Storage**: Complete vector indices stored client-side via IndexedDB with zero
  cloud database fees.
- **Zero-Latency Heuristic Guard**:
  - Bypasses vector lookups on short greetings and trivial queries (0ms overhead).
  - High-speed RAM caching for recent search query embeddings.
  - One-click RAG toggle directly in the chat toolbar and sidebar.

#### 8. 📚 Document & PDF RAG Studio

- **Full Document Ingestion**: Drag-and-drop support for PDF, TXT, Markdown, CSV, and JSON files, or
  direct text pasting.
- **Context-Aware Sliding Window Chunking**: Automatically segments large documents into overlapping
  vectors with real-time visual progress indicators.
- **Fact-Grounded Responses**: Injects relevant knowledge chunks into prompts to ensure factual
  citations and eliminate hallucinations.

#### 9. 🔍 Semantic AI Search & Enhanced Mobile Header

- **Dual Search Modes**:
  - **📝 Keyword Search**: Instant classic substring filtering.
  - **🧠 AI Semantic Search**: Understands query intent via in-browser Cosine Similarity scoring
    (e.g. ⭐ 95% match) across conversations and knowledge chunks.
  - **PC & Mobile Enhancements**: Fixed Enter-key execution in header search, added a quick search
    bar in the sidebar drawer, and smooth horizontal scrolling for mobile navigation.

#### 10. ☁️ 2-Way Smart Merge Cloud Sync & Background Auto-Sync (GitHub Gist)

- **2-Way Smart Merge (Multi-Device Harmony)**: Designed for users who switch seamlessly between
  **Mobile** and **Desktop**:
  - **Zero Data Loss**: Automatically merges chat sessions and personal Vector Memory ("ChatGPT
    Memory") across devices without destructive overwriting.
  - **Smart Deduplication**: Eliminates duplicate memory statements and preserves pre-computed
    `gemini-embedding-2` vectors without consuming extra API quota.
  - **Tombstone Deletion Propagation**: Deleting sessions or knowledge items on one device reliably
    propagates deletions across all synced devices.
- **Autonomous Background Auto-Sync**:
  - **On Startup**: Silently checks and pulls remote changes from Gist a few seconds after opening
    the app.
  - **On Learning New Memory**: Automatically triggers debounced background sync whenever AI
    extracts new memory facts or finishes conversations.
  - **Client-Side Obfuscation**: All Google API Keys are salted with XOR obfuscation before
    uploading to personal Secret Gists, safely bypassing GitHub Secret Scanners.

---

### 📂 Directory Architecture

```
Jarvis AI/
├── index.html          # Core web application entry point
├── manifest.json       # Web App Manifest (PWA configuration)
├── sw.js               # Service Worker for offline asset caching
├── build-apk.bat       # Automated Android APK build script
│
├── css/
│   ├── style.css       # Main Cyberpunk & Glassmorphism styles
│   ├── live.css        # Live Voice & Video call modal styles
│   ├── translate.css   # Dual-Screen Face-to-Face translator layout
│   ├── tts.css         # Studio TTS styles
│   └── rag.css         # Knowledge Base & Semantic Search styles
│
├── js/
│   ├── app.js          # Core app controller, chat, markdown, keys & Max Care
│   ├── sync.js         # 2-Way Smart Merge GitHub Gist sync engine
│   ├── live.js         # Multimodal Live WebSockets streaming module
│   ├── translate.js    # Gemini 3.8 bilateral translation engine
│   ├── tts.js          # Speech synthesis audio studio
│   └── rag.js          # Gemini Embedding 2 RAG & Vector Engine
│
└── android/            # Android native project assets (WebView Bridge & Max Care Alarms)
```

---

### 🛠️ Quick Start

#### Method 1: Local HTTP Server

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/jarvis-ai.git
   cd jarvis-ai
   ```
2. Serve using any local web server:
   ```bash
   # Using Python:
   python -m http.server 8080

   # Or using Node.js:
   npx serve .
   ```
3. Open `http://localhost:8080` in modern browsers (Chrome, Edge, Safari).

#### Method 2: Install as a Progressive Web App (PWA)

- Click the **Install** button in your browser's address bar on desktop or tap **Add to Home
  Screen** on iOS/Android.

#### Method 3: Install Android APK

- Download the latest `JarvisAI.apk` from
  [GitHub Releases](https://github.com/kevinkieu/kevinkieu.github.io/releases).
- Use `install-phone.bat` (USB) or `install-phone-wifi.bat` (Wi-Fi debugging) to install on your
  device.

---

### 🔑 API Configuration

1. Obtain a free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
2. (Optional) Obtain a **Tavily API Key** for web searches from [Tavily AI](https://tavily.com/).
3. Open Jarvis AI ➔ Click the **Settings (⚙️)** icon ➔ Paste your keys ➔ Click **Save**.

---

### 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">
  <b>Designed with passion for the future of Autonomous AI & Real-time Multimodal Interaction.</b>
</div>
