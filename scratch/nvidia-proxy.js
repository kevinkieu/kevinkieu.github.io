/* Jarvis AI - Local NVIDIA CORS proxy (chỉ để test trên máy)
   NVIDIA integrate.api.nvidia.com không trả Access-Control-Allow-Origin cho origin lạ,
   nên trình duyệt chặn fetch. Chạy proxy này rồi nhập NVIDIA Proxy URL:
     http://127.0.0.1:8140/v1
   Lệnh: node scratch/nvidia-proxy.js  (đổi cổng bằng PORT=...)
*/
const http = require('http');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 8140;
const UPSTREAM = 'https://integrate.api.nvidia.com';

http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept'
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  const path = req.url.startsWith('/v1') ? req.url : '/v1' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  try {
    const upstream = await fetch(UPSTREAM + path, {
      method: req.method,
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': req.headers.accept || '*/*'
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
    });

    const headers = { ...cors, 'Content-Type': upstream.headers.get('content-type') || 'application/json' };
    res.writeHead(upstream.status, headers);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (err) {
    res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Proxy upstream error: ' + err.message } }));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[NVIDIA proxy] http://127.0.0.1:${PORT}/v1 -> ${UPSTREAM}/v1`);
});
