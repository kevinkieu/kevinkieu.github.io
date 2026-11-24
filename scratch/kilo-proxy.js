/* Jarvis AI - Local Kilo CORS proxy (chỉ để test trên máy)
   ai-gateway.kilo.ai KHÔNG trả Access-Control-Allow-Origin cho bất kỳ origin nào
   (kể cả preflight OPTIONS), nên trình duyệt/WebView chặn fetch và báo
   "Failed to fetch". Chạy proxy này rồi nhập Base URL của provider Kilo:
     http://127.0.0.1:8141/v1
   Lệnh: node scratch/kilo-proxy.js  (đổi cổng bằng PORT=...)
*/
const http = require('http');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 8141;
const UPSTREAM = 'https://ai-gateway.kilo.ai/api';

http
  .createServer(async (req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, accept',
      'Access-Control-Expose-Headers': 'content-type',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const path = req.url.startsWith('/v1')
      ? req.url
      : '/v1' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    try {
      const upstream = await fetch(UPSTREAM + path, {
        method: req.method,
        headers: {
          Authorization: req.headers.authorization || '',
          'Content-Type': req.headers['content-type'] || 'application/json',
          Accept: req.headers.accept || '*/*',
        },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      });

      const headers = {
        ...cors,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-cache, no-transform',
      };
      res.writeHead(upstream.status, headers);
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
      else res.end();
    } catch (err) {
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Proxy upstream error: ' + err.message } }));
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[Kilo proxy] http://127.0.0.1:${PORT}/v1 -> ${UPSTREAM}/v1`);
  });
