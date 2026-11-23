/* Jarvis AI - CORS proxy cho các gateway không trả CORS (Cloudflare Worker)
   NVIDIA integrate.api.nvidia.com và Kilo ai-gateway.kilo.ai đều không trả
   Access-Control-Allow-Origin cho origin lạ (Kilo không trả cả header preflight),
   nên trình duyệt không gọi trực tiếp được. Worker này chuyển tiếp request và thêm CORS.

   Deploy: dán file này vào Cloudflare Dashboard → Workers & Pages → Create Worker,
   hoặc `npx wrangler deploy worker/nvidia-proxy.js --name jarvis-nvidia-proxy`.

   Đường dẫn:
     /v1/...       -> https://integrate.api.nvidia.com/v1/...  (ô "NVIDIA Proxy URL")
     /kilo/v1/...  -> https://ai-gateway.kilo.ai/v1/...        (Base URL của provider Kilo)
   Ví dụ:
     NVIDIA Proxy URL : https://jarvis-nvidia-proxy.<account>.workers.dev/v1
     Kilo Base URL    : https://jarvis-nvidia-proxy.<account>.workers.dev/kilo/v1
*/

const UPSTREAM_NVIDIA = 'https://integrate.api.nvidia.com';
const UPSTREAM_KILO = 'https://ai-gateway.kilo.ai/api';
const ALLOWED_ORIGINS = [
  'https://kevinkieu.github.io',
  'https://appassets.androidplatform.net',
  'http://127.0.0.1:8137',
  'http://localhost:8137'
];

function corsHeaders(origin) {
  const allowed = origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    // Tiền tố /kilo chọn upstream Kilo; mọi đường dẫn khác giữ hành vi cũ (NVIDIA)
    const isKilo = url.pathname === '/kilo' || url.pathname.startsWith('/kilo/');
    const upstreamBase = isKilo ? UPSTREAM_KILO : UPSTREAM_NVIDIA;
    let path = isKilo ? url.pathname.slice('/kilo'.length) : url.pathname;
    if (!path) path = '/v1';
    else if (!path.startsWith('/v1')) path = '/v1' + path;

    const upstream = await fetch(upstreamBase + path + url.search, {
      method: request.method,
      headers: {
        'Authorization': request.headers.get('Authorization') || '',
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'Accept': request.headers.get('Accept') || '*/*'
      },
      body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body
    });

    const headers = new Headers(upstream.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
