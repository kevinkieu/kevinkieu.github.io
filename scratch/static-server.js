// Server tĩnh tạm để kiểm tra app
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};
http
  .createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(f, (e, b) => {
      if (e) {
        res.writeHead(404);
        return res.end('nf');
      }
      res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
      res.end(b);
    });
  })
  .listen(8125, '127.0.0.1', () => console.log('up 8125'));
