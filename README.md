# 🤖 Jarvis AI Assistant

<div align="center">

![Jarvis AI Banner](icon-512.png)

**Trợ lý AI đa phương thức thông minh thế hệ mới tích hợp Gemini 3.8, Live Voice & Video Call, Thông dịch viên 2 chiều và Tra cứu Internet thời gian thực.**

*Next-Generation Multimodal AI Assistant powered by Google Gemini 3.8, Live Voice & Video Calls, Dual-Screen Face-to-Face Interpreter, and Real-Time Web Search.*

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

<a name="-tiếng-việt"></a>
## 🇻🇳 TIẾNG VIỆT

### 🌟 Tổng Quan Dự Án

**Jarvis AI** là một ứng dụng web lũy tiến (Progressive Web App - PWA) kiêm ứng dụng Android độc lập, được xây dựng hoàn toàn bằng **Vanilla JavaScript (ES Modules)** nguyên bản, không phụ thuộc vào các framework nặng nề. 

Ứng dụng kết hợp sức mạnh của **Google Gemini 3.8 Live API** qua kết nối WebSocket hai chiều (Bi-directional Streaming), mang lại trải nghiệm đàm thoại giọng nói, video trực tiếp, phiên dịch đối mặt 2 chiều và tra cứu mạng Internet siêu tốc.

---

### 🚀 Tính Năng Nổi Bật

#### 1. 🗣️ Thông Dịch Viên 2 Chiều Đối Diện (Dual-Screen Face-to-Face Live Translator)
- **Thiết kế màn hình gập đôi (Dual-Screen UI)**: Nửa trên xoay ngược 180° hướng về phía người đối diện (khách nước ngoài), nửa dưới quay về phía bạn.
- **Công nghệ Gemini 3.8 Bilateral Interpreter**: Hoạt động như một thông dịch viên song ngữ trực tiếp trong cùng một phiên kết nối duy nhất:
  - Bạn nói tiếng Việt ➔ Tự động dịch và phát âm thanh tiếng Khách.
  - Khách nói tiếng nước ngoài ➔ Tự động dịch và phát âm thanh tiếng Việt.
- **Độ trễ chuyển đổi 0ms**: Giữ kết nối liên tục, chuyển mic không cần tải lại socket.
- **Hỗ trợ 70+ ngôn ngữ**: Tiếng Anh, Trung, Nhật, Hàn, Pháp, Đức, Thái, Nga, Tây Ban Nha, v.v.
- **VU Meter & Speech Recognition cục bộ**: Vạch đo âm lượng nhảy theo giọng nói và hiển thị ngay tức thì phụ đề câu nói lên màn hình.

#### 2. 📞 Cuộc Gọi Thoại & Video Trực Tiếp (Multimodal Live Voice & Video Call)
- **Âm thanh độ trễ cực thấp**: Xử lý luồng âm thanh PCM 16kHz gửi lên máy chủ và phát lại PCM 24kHz trực tiếp từ Gemini 3.8 Live.
- **Chia sẻ Camera thời gian thực**: Trợ lý AI có thể "nhìn thấy" môi trường xung quanh qua camera điện thoại/laptop để phân tích hình ảnh, đọc tài liệu, hướng dẫn thực tế.
- **Tìm kiếm Web trong cuộc gọi**: AI tự động gọi công cụ **Tavily AI** hoặc **Jina Reader** để tra cứu dữ liệu mới nhất (thời tiết, tin tức, giá cả) ngay trong khi đang trò chuyện.
- **Tự động lưu biên bản hội thoại**: Kết thúc cuộc gọi, toàn bộ nội dung trao đổi được ghi lại đầy đủ vào phiên chat chính.
- **Tự động ngắt thông minh**: Tự gác máy khi người dùng nói lời chào tạm biệt hoặc đếm ngược khi không có tương tác.

#### 3. 💬 Trò Chuyện Thông Minh & Tư Duy Độc Lập (Multi-Model Chat)
- **Kho mô hình đa dạng**: Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 3.8 Live, Gemini 3.1 Flash Live Preview.
- **Tư duy mở rộng (Thinking Mode)**: Cho phép điều chỉnh ngân sách tokens suy nghĩ để giải quyết các bài toán logic, lập trình phức tạp.
- **Tra cứu Internet đa nền tảng**: Tích hợp Tavily AI, Serper Dev, Brave Search, Jina Reader với cơ chế trích xuất từ khóa tìm kiếm trong ngoặc kép thông minh.
- **Định dạng văn bản & Đồ họa đỉnh cao**:
  - Hỗ trợ công thức Toán học chuẩn **KaTeX / LaTeX** ($E = mc^2$).
  - Vẽ sơ đồ tư duy, lưu trình tự động bằng mã **Mermaid.js**.
  - Tô màu mã nguồn (Syntax Highlighting) kèm nút sao chép nhanh 1 chạm.
- **Đa phương thức (Multimodal Input)**: Kéo thả hình ảnh, tài liệu PDF, file mã nguồn TXT/JS/PY, file ghi âm để phân tích.

#### 4. ⚔️ Đấu Trường Tranh Biện AI (AI Arena)
- So tài song song giữa 2 mô hình AI cùng một lúc trên màn hình chia đôi.
- So sánh chất lượng câu trả lời, góc nhìn phản biện, độ sâu phân tích và tốc độ phản hồi.

#### 5. 🎙️ Phòng Thu Giọng Nói AI (Gemini TTS Studio)
- Chuyển đổi văn bản thành giọng đọc tự nhiên như người thật.
- Đầy đủ các giọng đọc chuẩn Google: *Charon, Puck, Kore, Fenrir, Aoede...*
- Tùy chỉnh cao độ, tốc độ đọc và tải về file âm thanh MP3/WAV.

#### 6. 🛡️ Bảo Mật & Quản Lý Khóa API Thông Minh
- **Bể chứa API Key (Key Pool)**: Lưu tối đa 10 API Key Google.
- **Tự động xoay tua (Auto-rotate)**: Khi một Key chạm ngưỡng Rate Limit hoặc hết Quota (Mã 1008), hệ thống tự động đổi sang Key tiếp theo mà không làm gián đoạn người dùng.
- **Bảo mật phía Client (Client-Side Privacy)**: Khóa API được mã hóa cục bộ (`JVENC_`), chỉ lưu trong trình duyệt (`localStorage`), không bao giờ gửi về máy chủ bên thứ ba.

#### 7. 🧠 Kho Tri Thức Cá Nhân & Trí Nhớ Vĩnh Cửu (Second Brain / Permanent Vector Memory)
- **Gemini Embedding 2**: Ứng dụng model nhúng đa phương thức mới nhất từ Google (`gemini-embedding-2` kết hợp fallback `gemini-embedding-001`).
- **Không gian Vector cục bộ (IndexedDB)**: Toàn bộ vector nhúng được lưu trữ an toàn trong IndexedDB của trình duyệt, không tốn phí thuê Vector DB bên thứ ba.
- **Bộ Lọc Ý Định Kép Thông Minh (Dual-Track Smart Intent Filter)**:
  - **Truy vấn danh tính (Identity Query)**: Tự động phát hiện khi người dùng hỏi về tên tuổi, giới tính, ngày sinh, con cái, sở thích hoặc thông tin cá nhân ("tôi tên gì", "tôi là nam hay nữ", "bạn nhớ gì về tôi"...) để nạp ngay hồ sơ cá nhân với độ trễ 0ms và độ chính xác 100%.
  - **Bảo vệ đời tư tuyệt đối**: Khi người dùng hỏi các câu hỏi kiến thức phổ thông, ẩm thực, khoa học hoặc kỹ thuật (ví dụ "thịt gà có nhiều dinh dưỡng không?"), Trí nhớ cá nhân sẽ ở trạng thái ngủ (dormant), tuyệt đối không lôi chuyện gia đình/con cái vào câu trả lời, loại bỏ hoàn toàn hiện tượng "quá đà" (over-eagerness).
- **Bảo vệ Độ trễ (Zero-Latency Guard)**:
  - Bỏ qua các câu chào hỏi xã giao ngắn (0ms độ trễ, không tốn API).
  - Tích hợp bộ nhớ đệm Vector Cache RAM cho các câu hỏi phổ biến.
  - Công tắc Bật/Tắt Trí nhớ RAG 1 chạm ngay trên thanh công cụ chat và menu Sidebar.

#### 8. 📚 Chat Với Tài Liệu Lớn (PDF & Document RAG Studio)
- **Studio nạp tài liệu thông minh**: Kéo thả file PDF, TXT, Markdown, CSV, JSON hoặc dán văn bản trực tiếp.
- **Cắt đoạn thông minh (Text Chunking with Overlap)**: Tự động chia nhỏ tài liệu theo ngữ cảnh dấu câu và nhúng vector hàng loạt với thanh tiến trình trực quan.
- **Trích dẫn chính xác**: AI tự động trích lọc các đoạn liên quan nhất để đưa vào câu trả lời, loại bỏ hiện tượng bịa đặt (hallucination).

#### 9. 🔍 Tìm Kiếm Ngữ Nghĩa & Nâng Cấp Trải Nghiệm Tìm Kiếm (Semantic AI Search)
- **2 Chế độ tìm kiếm linh hoạt**:
  - **📝 Từ khóa (Keyword)**: Lọc chuỗi truyền thống siêu tốc.
  - **🧠 Ngữ nghĩa AI (Semantic Vector)**: Nhận diện ý định câu hỏi bằng thuật toán Cosine Similarity trực tiếp trên trình duyệt, xếp hạng độ tương đồng (⭐ 95% khớp ý).
- **Trải nghiệm tối ưu PC & Mobile**:
  - Hỗ trợ gõ Enter trên thanh tìm kiếm Header để kích hoạt modal ngay tức thì.
  - Tích hợp ô tìm kiếm nhanh tại đầu thanh Sidebar cho điện thoại.
  - Thanh Header trên Mobile cuộn mượt mà, không bao giờ bị che khuất nút tìm kiếm.

#### 10. ☁️ Đồng Bộ Cloud 2 Chiều & Tự Động Hóa Đa Thiết Bị (2-Way Smart Merge & GitHub Gist Auto-Sync)
- **Hợp nhất 2 chiều thông minh (Smart Merge)**: Dành riêng cho người dùng kết hợp linh hoạt giữa **Điện thoại** và **Máy tính**:
  - **Không bao giờ mất dữ liệu**: Tự động gộp hội thoại mới và toàn bộ Trí nhớ Vectơ ("ChatGPT Memory") của cả hai thiết bị vào làm một thay vì ghi đè thô bạo.
  - **Khử trùng lặp thông minh**: Loại bỏ các mẩu trí nhớ trùng ý và bảo lưu toàn bộ vector nhúng `gemini-embedding-2` đã tính toán sẵn.
  - **Cơ chế Tombstone**: Xóa phiên chat hoặc trí nhớ ở máy này sẽ đồng bộ xóa sạch ở máy còn lại, không lo bị "hồi sinh" dữ liệu đã xóa.
- **Tự động đồng bộ ngầm (Background Auto-Sync)**:
  - **Khi mở App**: Tự động kiểm tra và kéo dữ liệu mới từ Cloud về ngầm trong nền.
  - **Khi AI học trí nhớ mới**: Tự động hẹn giờ đẩy ngầm (Debounce) lên Cloud mà bạn không cần phải bấm tay mỗi lần chat xong.
  - **Bảo mật tuyệt đối**: Khóa API Google được mã hóa Salted XOR phía Client trước khi lưu lên Secret Gist, ngăn chặn hoàn toàn Secret Scanner của GitHub quét trúng.
- **Bảo Vệ Hạn Ngạch Thông Minh (Graceful GitHub Rate Limit Recovery)**:
  - Tự động phát hiện mã lỗi 403/429 khi người dùng gọi API dồn dập, tự phân tích header `x-ratelimit-reset` để hiển thị thời gian mở khóa chính xác (theo phút/giờ) và tạm dừng đồng bộ ngầm để tránh bị spam lỗi.

---

### 📂 Cấu Trúc Dự Án

```
Jarvis AI/
├── index.html          # Giao diện chính của ứng dụng
├── manifest.json       # Cấu hình PWA (Progressive Web App)
├── sw.js               # Service Worker quản lý offline cache
├── build-apk.bat       # Script đóng gói ứng dụng Android APK
│
├── css/
│   ├── style.css       # Giao diện chính Cyberpunk Glassmorphism
│   ├── live.css        # Giao diện Cuộc gọi Live Voice & Video
│   ├── translate.css   # Giao diện Thông dịch viên đối diện 2 nửa
│   ├── arena.css       # Giao diện Đấu trường AI Arena
│   ├── tts.css         # Giao diện Studio TTS
│   └── rag.css         # Giao diện Kho Tri Thức, RAG & Tìm kiếm Ngữ nghĩa
│
├── js/
│   ├── app.js          # Logic ứng dụng, Chat, Markdown, Quản lý Key
│   ├── live.js         # Multimodal Live Voice & Video WebSocket
│   ├── translate.js    # Thông dịch viên 2 chiều Gemini 3.8 Bilateral
│   ├── arena.js        # Đấu trường so tài song song
│   ├── tts.js          # Chuyển văn bản thành giọng nói
│   └── rag.js          # Động cơ RAG, Vector IndexedDB & Gemini Embedding 2
│
└── android/            # Mã nguồn dự án Android (Capacitor/Gradle)
```

---

### 🛠️ Cài Đặt & Sử Dụng

#### Cách 1: Chạy trực tiếp trên trình duyệt
1. Clone mã nguồn về máy:
   ```bash
   git clone https://github.com/your-username/jarvis-ai.git
   cd jarvis-ai
   ```
2. Mở thư mục bằng bất kỳ HTTP Server cục bộ nào (ví dụ qua VS Code Extension `Live Server` hoặc chạy lệnh Node/Python):
   ```bash
   # Dùng Python:
   python -m http.server 8080
   
   # Dùng Node.js npx:
   npx serve .
   ```
3. Truy cập địa chỉ `http://localhost:8080` trên trình duyệt (Chrome, Edge, Safari).

#### Cách 2: Cài đặt dưới dạng App (PWA)
- Trên máy tính hoặc điện thoại, bấm vào biểu tượng **"Cài đặt ứng dụng"** (Install App) trên thanh địa chỉ trình duyệt để đưa Jarvis AI ra màn hình chính.

#### Cách 3: Build file cài đặt Android (APK)
- Chạy file `build-apk.bat` trên Windows để tự động biên dịch mã nguồn thành file `JarvisAI.apk`.

---

### 🔑 Thiết Lập API Key

1. Lấy **Google Gemini API Key** miễn phí tại [Google AI Studio](https://aistudio.google.com/).
2. (Tùy chọn) Lấy **Tavily API Key** để kích hoạt tìm kiếm Web thông minh tại [Tavily AI](https://tavily.com/).
3. Mở Jarvis AI ➔ Bấm vào biểu tượng **Cài đặt (⚙️)** ➔ Dán các Key vào danh sách ➔ Bấm **Lưu cài đặt**.

---

<a name="-english"></a>
## 🇬🇧 ENGLISH

### 🌟 Project Overview

**Jarvis AI** is an advanced, privacy-first Progressive Web App (PWA) and standalone Android application built entirely with **Vanilla JavaScript (ES Modules)**, without the overhead of heavy front-end frameworks.

Leveraging the cutting-edge **Google Gemini 3.8 Live API** via bidirectional WebSockets (`BidiGenerateContent`), Jarvis AI delivers instant, human-like voice/video conversations, split-screen bilateral live interpretation, and real-time internet search capabilities.

---

### 🚀 Key Features

#### 1. 🗣️ Dual-Screen Face-to-Face Live Translator
- **Split-Screen Inverted UI**: The top half of the screen is rotated 180° for the person sitting across from you (guest/foreigner), while the bottom half faces you.
- **Bilateral Interpretation (Gemini 3.8 Live)**: Operates as an authentic simultaneous interpreter in a single continuous session:
  - Speak Vietnamese ➔ Instantly translates and voices in the guest's language.
  - Speak foreign language ➔ Instantly translates and voices in Vietnamese.
- **0ms Switch Latency**: Persistent WebSocket connection allows instantaneous speaker toggling without reconnection delays.
- **70+ Supported Languages**: English, Chinese, Japanese, Korean, French, German, Spanish, Thai, Russian, and more.
- **Real-Time VU Meter & On-Device Transcription**: Live audio volume indicator and 0ms latency speech-to-text previews.

#### 2. 📞 Multimodal Live Voice & Video Calls
- **Ultra-Low Latency Audio**: Native 16kHz PCM streaming input and 24kHz PCM audio playback over WebSockets.
- **Live Camera Streaming**: Allows the AI assistant to "see" your surroundings in real-time, inspect documents, and provide visual assistance.
- **In-Call Web Grounding**: Automatically triggers **Tavily AI** and **Jina Reader** search tools mid-dialogue to fetch up-to-date facts, weather, and breaking news.
- **Conversation Sync**: Automatically saves transcripts of the call into your permanent chat history upon hanging up.
- **Smart Hangup Detection**: Automatically terminates the call upon detecting farewell intents or sustained silence.

#### 3. 💬 Intelligent Chat & Extended Reasoning
- **Wide Range of Gemini Models**: Gemini 2.5 Flash, 2.5 Pro, 3.8 Live, and 3.1 Flash Live Preview.
- **Extended Thinking Mode**: Custom thinking token budget controls for deep logical reasoning and complex coding problems.
- **Multi-Engine Search Grounding**: Seamless integration with Tavily AI, Serper Dev, Brave Search, and Jina AI.
- **Rich Markdown Formatting**:
  - Full **KaTeX / LaTeX** mathematical formula rendering.
  - Interactive **Mermaid.js** diagrams and flowcharts.
  - Syntax highlighted code blocks with one-click copying.
- **Multimodal Uploads**: Drag-and-drop support for images, PDFs, audio clips, and source code files.

#### 4. ⚔️ AI Arena (Model Benchmark & Debate)
- Compare two AI models side-by-side answering the exact same query.
- Evaluate reasoning quality, response speed, and diverse viewpoints.

#### 5. 🎙️ Studio Text-to-Speech (Gemini TTS)
- Studio-grade natural voice generation with Google voices (*Charon, Puck, Aoede, Kore, Fenrir...*).
- Customizable pitch, speaking rate, and direct MP3/WAV download.

#### 6. 🛡️ Resilient API Key Pool & Local Encryption
- **Key Pool Rotation**: Store up to 10 Google API keys with automatic failover and quota recovery (Code 1008 auto-rotation).
- **Client-Side Privacy**: Keys are encrypted locally (`JVENC_`) and stored solely within browser storage (`localStorage` / `IndexedDB`). No middleman server.

#### 7. 🧠 Personal Knowledge Base & Second Brain (Permanent Vector Memory)
- **Gemini Embedding 2 Engine**: Employs Google's latest multimodal embedding model (`gemini-embedding-2` with graceful fallback to `gemini-embedding-001`).
- **On-Device Vector Storage**: Complete vector indices stored client-side via IndexedDB with zero cloud database fees.
- **Zero-Latency Heuristic Guard**:
  - Bypasses vector lookups on short greetings and trivial queries (0ms overhead).
  - High-speed RAM caching for recent search query embeddings.
  - One-click RAG toggle directly in the chat toolbar and sidebar.

#### 8. 📚 Document & PDF RAG Studio
- **Full Document Ingestion**: Drag-and-drop support for PDF, TXT, Markdown, CSV, and JSON files, or direct text pasting.
- **Context-Aware Sliding Window Chunking**: Automatically segments large documents into overlapping vectors with real-time visual progress indicators.
- **Fact-Grounded Responses**: Injects relevant knowledge chunks into prompts to ensure factual citations and eliminate hallucinations.

#### 9. 🔍 Semantic AI Search & Enhanced Mobile Header
- **Dual Search Modes**:
  - **📝 Keyword Search**: Instant classic substring filtering.
  - **🧠 AI Semantic Search**: Understands query intent via in-browser Cosine Similarity scoring (e.g. ⭐ 95% match) across conversations and knowledge chunks.
  - **PC & Mobile Enhancements**: Fixed Enter-key execution in header search, added a quick search bar in the sidebar drawer, and smooth horizontal scrolling for mobile navigation.

#### 10. ☁️ 2-Way Smart Merge Cloud Sync & Background Auto-Sync (GitHub Gist)
- **2-Way Smart Merge (Multi-Device Harmony)**: Designed for users who switch seamlessly between **Mobile** and **Desktop**:
  - **Zero Data Loss**: Automatically merges chat sessions and personal Vector Memory ("ChatGPT Memory") across devices without destructive overwriting.
  - **Smart Deduplication**: Eliminates duplicate memory statements and preserves pre-computed `gemini-embedding-2` vectors without consuming extra API quota.
  - **Tombstone Deletion Propagation**: Deleting sessions or knowledge items on one device reliably propagates deletions across all synced devices.
- **Autonomous Background Auto-Sync**:
  - **On Startup**: Silently checks and pulls remote changes from Gist a few seconds after opening the app.
  - **On Learning New Memory**: Automatically triggers debounced background sync whenever AI extracts new memory facts or finishes conversations.
  - **Client-Side Obfuscation**: All Google API Keys are salted with XOR obfuscation before uploading to personal Secret Gists, safely bypassing GitHub Secret Scanners.

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
│   ├── arena.css       # Side-by-side AI Arena styles
│   ├── tts.css         # Studio TTS styles
│   └── rag.css         # Knowledge Base & Semantic Search styles
│
├── js/
│   ├── app.js          # Core app controller, chat, markdown & key pool
│   ├── live.js         # Multimodal Live WebSockets streaming module
│   ├── translate.js    # Gemini 3.8 bilateral translation engine
│   ├── arena.js        # Parallel model debate & benchmark module
│   ├── tts.js          # Speech synthesis audio studio
│   └── rag.js          # Gemini Embedding 2 RAG & Vector Engine
│
└── android/            # Android native project assets & Capacitor wrapper
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
- Click the **Install** button in your browser's address bar on desktop or tap **Add to Home Screen** on iOS/Android.

#### Method 3: Build Android APK
- Execute `build-apk.bat` on Windows to generate `JarvisAI.apk`.

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
