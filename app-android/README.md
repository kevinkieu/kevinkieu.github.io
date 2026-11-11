# 🤖 Jarvis AI Native Android App

Ứng dụng **Android thuần (100% Pure Native)** của Jarvis AI, được xây dựng hoàn toàn bằng **Kotlin** và **Jetpack Compose**, loại bỏ hoàn toàn WebView để mang lại hiệu năng tối đa (120Hz mượt mà, phản hồi ngay lập tức 0ms).

---

## 🚀 Công Nghệ Sử Dụng

- **Ngôn ngữ:** Kotlin 1.9+
- **Giao diện:** Jetpack Compose Material 3 (Dark Cyberpunk Theme đồng bộ với bản Web)
- **Cơ sở dữ liệu cục bộ:** Room Database (SQLite chuẩn Android) lưu trữ các phiên hội thoại và trí nhớ Vector
- **Mạng & Streaming:** OkHttp + Server-Sent Events (SSE) stream trực tiếp từ Google Gemini API
- **Đồng bộ Cloud:** GitHub Gist 2-Way Smart Sync (đồng bộ chéo mượt mà với bản Web)
- **Quản lý Key:** KeyManager xoay tua 10 Google API Keys với tự động giải mã.

---

## 🛠️ Hướng Dẫn Mở & Build APK Bằng Android Studio

1. Mở **Android Studio** trên máy tính.
2. Chọn **File** ➔ **Open...**
3. Tìm và chọn đúng thư mục:
   ```text
   C:\Antigravity\kevinkieu.github.io\app-android
   ```
4. Đợi Android Studio đồng bộ Gradle (Gradle Sync) trong khoảng 1–2 phút.
5. Để xuất file APK cài đặt:
   - Trên thanh menu, chọn: **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)**.
   - Khi build xong, bấm vào chữ **locate** màu xanh ở góc dưới bên phải để lấy file `app-debug.apk` hoặc `app-release.apk` cài vào điện thoại!
