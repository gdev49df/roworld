import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.end('ok'); return; }
  if (url === '/') url = '/index.html';
  const base = url.startsWith('/shared/') ? root : path.join(root, 'public');
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(c)); return c; };
const makeRoom = pub => { const code = newCode(); const r = new Room(code, pub, c => rooms.delete(c)); rooms.set(code, r); return r; };
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => {
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  let last = 0, burst = 0;
  ws.on('message', raw => {
    const now = Date.now(); if (now - last > 1000) { last = now; burst = 0; } if (++burst > 30) return; // антиспам
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      if (ws.room) return;
      let room;
      if (m.room) room = rooms.get(String(m.room).toUpperCase());
      else if (m.mode === 'quick') room = [...rooms.values()].find(r => r.pub && r.phase === 'lobby' && r.players.size < 8) || makeRoom(true);
      else if (m.mode === 'create') room = makeRoom(false);
      if (!room) return send(ws, { t: 'err', text: 'комната не найдена' });
      room.join(ws, m.name, m.token);
    } else if (ws.room) ws.room.onMsg(ws, m);
  });
  ws.on('close', () => ws.room && ws.room.leave(ws));
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 20000);

server.listen(PORT, () => console.log('roworld: http://localhost:' + PORT));
