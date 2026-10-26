// 依存なしの簡易静的サーバー（node scripts/serve.js [ポート]）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

function createServer() {
  return http.createServer((req, res) => {
    let u;
    try { u = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    const f = path.normalize(path.join(ROOT, u.endsWith('/') ? u + 'index.html' : u));
    if (!f.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8000;
  createServer().listen(port, () => console.log(`ゆっくり編集地獄: http://localhost:${port}/`));
}
