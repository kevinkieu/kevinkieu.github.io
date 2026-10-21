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
│   └── tts.css         # Giao diện Studio TTS
│
├── js/
│   ├── app.js          # Logic ứng dụng, Chat, Markdown, Quản lý Key
│   ├── live.js         # Multimodal Live Voice & Video WebSocket
│   ├── translate.js    # Thông dịch viên 2 chiều Gemini 3.8 Bilateral
│   ├── arena.js        # Đấu trường so tài song song
│   └── tts.js          # Chuyển văn bản thành giọng nói
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
│   └── tts.css         # Studio TTS styles
│
├── js/
│   ├── app.js          # Core app controller, chat, markdown & key pool
│   ├── live.js         # Multimodal Live WebSockets streaming module
│   ├── translate.js    # Gemini 3.8 bilateral translation engine
│   ├── arena.js        # Parallel model debate & benchmark module
│   └── tts.js          # Speech synthesis audio studio
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
