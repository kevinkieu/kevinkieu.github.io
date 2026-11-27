# Đo hiệu năng Jarvis AI (localhost, cùng máy, cache-busting ?cb=)

## Trước tối ưu (commit ca392d2 — còn Mermaid, 40 module, CDN trong <head>)

| Chỉ số           | Giá trị                                       |
| ---------------- | --------------------------------------------- |
| DOMContentLoaded | 497 ms                                        |
| loadEventEnd     | 514 ms                                        |
| JS nội bộ        | 40 file · 963.113 B                           |
| JS từ CDN        | 6 file · 3.660.246 B (mermaid chiếm phần lớn) |
| app.js decoded   | 249.018 B                                     |

Đo bằng `performance.getEntriesByType('navigation'|'resource')` trên
`http://127.0.0.1:8156/index.html?cb=baseline-1`.

## Sau tối ưu

Số liệu "sau" đo lại trên `?cb=...` mới, ghi trong báo cáo cuối cùng của phiên làm việc. Cách đo
lại: mở trang, đợi ~3s, chạy `JarvisPerf.report()` trong console.
