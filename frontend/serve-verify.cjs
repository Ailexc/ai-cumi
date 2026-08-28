// 临时验证服务器: 服务 frontend/dist 静态文件 + 代理 /api → http://localhost:8000
// 用法: node serve-verify.js  (验证后删除)
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const API = 'http://localhost:8000';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

http.createServer(async (req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/api/')) {
    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const headers = { ...req.headers, host: 'localhost:8000' };
      const upstream = await fetch(API + url, { method: req.method, headers, body });
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('proxy error: ' + e.message);
    }
    return;
  }
  let p = url === '/' ? '/index.html' : url.split('?')[0];
  let file = path.join(DIST, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  try {
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
}).listen(5173, () => console.log('verify server: http://localhost:5173 (dist + /api proxy → :8000)'));
