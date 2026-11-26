# CORS relay dự phòng (Vercel Edge)

Proxy độc lập với `freebuff.site`, dùng khi Worker chính bị pause/chặn. Không có dependency, không
build step — chỉ một Edge Function `api/relay.js` + rewrite trong `vercel.json`.

## Deploy

```bash
cd vercel-proxy
npx vercel deploy --prod --yes
```

Project đã link sẵn (`.vercel/`), deploy lại chỉ cần lệnh trên. URL production:
`https://vercel-proxy-two-lake.vercel.app`.

## Base URL cho app

| Provider | Base URL                                               |
| -------- | ------------------------------------------------------ |
| NVIDIA   | `https://vercel-proxy-two-lake.vercel.app/api/v1`      |
| Kilo     | `https://vercel-proxy-two-lake.vercel.app/api/kilo/v1` |

## Chặn bị dùng như proxy mở

- `Origin` bắt buộc và phải nằm trong danh sách cho phép (`https://kevinkieu.github.io`,
  `https://appassets.androidplatform.net`, loopback) — thiếu hoặc lạ thì 403, không echo origin lạ
  về.
- Chỉ `GET`/`POST`/`OPTIONS`; method khác → 405.
- Chỉ ba đường dẫn của API thật: `/v1/models`, `/v1/chat/completions`, `/v1/completions` (áp cho cả
  tiền tố `/kilo`); path khác → 404. Có `..` hoặc `//` → 400, nên không thể dùng để quét host khác —
  upstream luôn cố định NVIDIA/Kilo.
- Không chuyển cookie, không trả `set-cookie`; response là stream passthrough.
- Không tự đặt giới hạn body: Vercel đã chặn request > ~4.5 MB trước khi vào function
  (`413 FUNCTION_PAYLOAD_TOO_LARGE`, không kèm CORS). Hệ quả: ảnh/tệp lớn làm payload vượt ~4.5 MB
  sẽ hỏng ở relay này — app coi là lỗi mạng và nhảy sang proxy freebuff (giới hạn cao hơn), nên
  đường chính vẫn xử lý được.

Giới hạn còn lại (chấp nhận được): `Origin` do client tự khai nên script cố ý vẫn giả được — nhưng
nó chỉ tới được NVIDIA/Kilo bằng key của chính nó, không đụng được key hay credit của chủ dự án.
Muốn chặn cả trường hợp đó thì cần rate limit theo IP/ token dùng chung (KV/Upstash), tốn thêm hạ
tầng nên chưa làm.

## Kiểm tra nhanh

```bash
B=https://vercel-proxy-two-lake.vercel.app
curl -i -X OPTIONS "$B/api/v1/chat/completions" -H "Origin: https://kevinkieu.github.io" \
  -H "Access-Control-Request-Method: POST"          # 204 + CORS
curl -i "$B/api/v1/models" -H "Origin: https://kevinkieu.github.io"   # 200 danh sách model
curl -i "$B/api/v1/models"                                          # 403 thiếu Origin
curl -i "$B/api/v1/anything" -H "Origin: https://kevinkieu.github.io" # 404 path bị chặn
```
