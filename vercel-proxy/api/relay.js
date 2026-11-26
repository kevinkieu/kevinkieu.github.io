/* Jarvis AI - CORS relay tren Vercel Edge (du phong doc lap voi freebuff.site)
   NVIDIA integrate.api.nvidia.com va Kilo ai-gateway.kilo.ai khong tra CORS cho
   origin la, nen trinh duyet phai di qua proxy nay.

   vercel.json rewrite /api/(.*) -> /api/relay?__p=$1, nen duong dan goc nam trong __p.
   Client dung lam Base URL:
     https://<project>.vercel.app/api/v1        -> https://integrate.api.nvidia.com/v1
     https://<project>.vercel.app/api/kilo/v1   -> https://ai-gateway.kilo.ai/api/v1

   Chong bi dung nhu proxy mo:
     - Bat buoc Origin thuoc danh sach cho phep (thieu/la -> 403), khong echo origin la.
     - Chi cho GET/POST/OPTIONS.
     - Chi cho 3 duong dan cua API that (/v1/models, /v1/chat/completions, /v1/completions),
       chan '..' -> khong the dung de quet host khac (upstream luon co dinh).
     - Khong tu dat gioi han body: Vercel da chan request > ~4.5 MB truoc khi vao function
       (413 FUNCTION_PAYLOAD_TOO_LARGE), nen guard rieng chi la code chet.
     - Khong chuyen cookie/header la; khong tra ve header khong can thiet.
*/

const UPSTREAM_NVIDIA = 'https://integrate.api.nvidia.com';
const UPSTREAM_KILO = 'https://ai-gateway.kilo.ai/api';
const ALLOWED_ORIGINS = [
  'https://kevinkieu.github.io',
  'https://appassets.androidplatform.net',
  'http://127.0.0.1:8137',
  'http://localhost:8137',
];
const LOOPBACK_RE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
const ALLOWED_PATHS = ['/v1/models', '/v1/chat/completions', '/v1/completions'];

export const config = { runtime: 'edge' };

function isAllowedOrigin(origin) {
  return !!origin && (ALLOWED_ORIGINS.includes(origin) || LOOPBACK_RE.test(origin));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export default async function handler(request) {
  const origin = request.headers.get('origin');

  // 1. Chi phuc vu origin cua chinh app (chan web khac va script la)
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, { error: { message: 'Origin not allowed' } });
  }
  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // 2. Chi cho method can thiet
  if (!ALLOWED_METHODS.includes(request.method)) {
    return jsonResponse(405, { error: { message: 'Method not allowed' } }, cors);
  }

  const url = new URL(request.url);
  // Duong dan goc: tu rewrite (?__p=) hoac tu /api/<rest> neu goi thang
  let rest = url.searchParams.get('__p') ?? url.pathname.replace(/^\/api/, '');
  rest = rest.replace(/^\/+/, '');

  // 3. Chan path traversal va chi cho dung cac endpoint cua API
  if (rest.includes('..') || rest.includes('//')) {
    return jsonResponse(400, { error: { message: 'Invalid path' } }, cors);
  }

  const isKilo = rest === 'kilo' || rest.startsWith('kilo/');
  const upstreamBase = isKilo ? UPSTREAM_KILO : UPSTREAM_NVIDIA;
  let path = isKilo ? '/' + rest.slice('kilo'.length).replace(/^\/+/, '') : '/' + rest;
  if (path === '/') path = '/v1';
  else if (!path.startsWith('/v1')) path = '/v1' + path;

  if (!ALLOWED_PATHS.includes(path)) {
    return jsonResponse(404, { error: { message: 'Endpoint not allowed' } }, cors);
  }

  // 4. Giu query goc cua request (bo __p noi bo)
  const q = new URLSearchParams(url.searchParams);
  q.delete('__p');
  const qs = q.toString() ? '?' + q.toString() : '';

  let upstream;
  try {
    upstream = await fetch(upstreamBase + path + qs, {
      method: request.method,
      // Chi chuyen header can thiet; khong bao gio chuyen cookie
      headers: {
        Authorization: request.headers.get('authorization') || '',
        'Content-Type': request.headers.get('content-type') || 'application/json',
        Accept: request.headers.get('accept') || '*/*',
      },
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  } catch (err) {
    return jsonResponse(502, { error: { message: 'Upstream fetch failed' } }, cors);
  }

  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(upstream.body, { status: upstream.status, headers });
}
