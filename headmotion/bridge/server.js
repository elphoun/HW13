// Zero-dependency bridge: UDP (from HeadMotionStreamer) -> Server-Sent Events (to the browser game).
// Also serves ../game on http://localhost:8080
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');

const UDP_PORT = +process.env.UDP_PORT || 9000;
const HTTP_PORT = +process.env.HTTP_PORT || 8080;
const GAME_DIR = path.join(__dirname, '..', 'game');
const clients = new Set();
let lastPacket = 0;

const udp = dgram.createSocket('udp4');
udp.on('message', (msg) => {
  lastPacket = Date.now();
  const line = `data: ${msg.toString()}\n\n`;
  for (const res of clients) res.write(line);
});
udp.bind(UDP_PORT, '127.0.0.1', () => console.log(`UDP listening on 127.0.0.1:${UDP_PORT}`));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(GAME_DIR, rel));
  if (!file.startsWith(GAME_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(HTTP_PORT, () => console.log(`Game at http://localhost:${HTTP_PORT}`));
