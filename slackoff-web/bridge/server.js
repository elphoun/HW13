// Zero-dependency bridge. Serves the exercise lab and relays data between the AirPod streamers and the browsers.
//   UDP :9000  <- HeadMotionStreamer (each laptop's streamer, tagged with its player number "p")
//   HTTP :8080 -> lab files, GET /events (Server-Sent Events), GET /seed, GET /info, POST /state
// Multiplayer: every player's browser POSTs its craft position to /state; the bridge relays it to the other browsers
// as an SSE "state" event so they can draw it as a ghost. All browsers get the same /seed so the track is identical.
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UDP_PORT = +process.env.UDP_PORT || 9000;
const HTTP_PORT = +process.env.HTTP_PORT || 8080;
const GAME_DIR = path.join(__dirname, '..', 'lab');
const SEED = Math.floor(Math.random() * 2 ** 31);      // new track layout each time the bridge starts
const clients = new Set();

const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const broadcast = text => { for (const res of clients) res.write(text); };

const udp = dgram.createSocket('udp4');
udp.on('message', msg => broadcast(`data: ${msg.toString()}\n\n`));
udp.bind(UDP_PORT, '0.0.0.0', () => console.log(`UDP listening on port ${UDP_PORT} (all interfaces, so other laptops can send to it)`));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const json = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const NUM = ['p', 'x', 'z', 'h', 'speed', 'shield', 'dist'];

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url === '/seed') return json(res, { seed: SEED });
  if (url === '/info') return json(res, { ips: lanIPs(), port: HTTP_PORT, seed: SEED });
  if (url === '/state' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      try {
        const d = JSON.parse(body), out = { mode: String(d.mode || '').slice(0, 12) };
        for (const k of NUM) out[k] = Number.isFinite(+d[k]) ? +d[k] : 0;
        broadcast(`event: state\ndata: ${JSON.stringify(out)}\n\n`);
        res.writeHead(204); res.end();
      } catch (_) { res.writeHead(400); res.end(); }
    });
    return;
  }
  const rel = url === '/' ? 'index.html' : decodeURIComponent(url);
  const file = path.normalize(path.join(GAME_DIR, rel));
  if (!file.startsWith(GAME_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(HTTP_PORT, () => {
  console.log(`Lab (this laptop):   http://localhost:${HTTP_PORT}/?p=1`);
  for (const ip of lanIPs()) console.log(`Friend opens:        http://${ip}:${HTTP_PORT}/?p=2   and runs: swift run HeadMotionStreamer --host ${ip} --player 2`);
});
