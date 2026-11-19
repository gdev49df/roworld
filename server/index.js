import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Room, dayNumber } from './room.js';
import { FileStore } from './store-file.js';
import { MAPS, DIFFS } from '../public/shared/consts.js';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const store = new FileStore();

const server = http.createServer(async (req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.end('ok'); return; }
  if (url === '/api/leaderboard') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(await store.leaderboard(dayNumber()))); return; }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(pub, url));
  if (!file.startsWith(pub + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(c)); return c; };
const makeRoom = (opts, code = newCode()) => { const r = new Room(code, opts, { store, onEmpty: c => rooms.delete(c) }); rooms.set(code, r); return r; };
const MAP_KEYS = Object.keys(MAPS);

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  let room;
  const mode = q.get('mode'), code = (q.get('room') || '').toUpperCase();
  if (code) room = rooms.get(code);
  else if (mode === 'quick') room = [...rooms.values()].find(r => r.opts.pub && r.phase === 'lobby' && r.players.size < 8) || makeRoom({ pub: true });
  else if (mode === 'blitz') room = [...rooms.values()].find(r => r.opts.pub && r.opts.mode === 'blitz' && r.phase === 'lobby' && r.players.size < 8) || makeRoom({ pub: true, mode: 'blitz' });
  else if (mode === 'solo') room = makeRoom({ startAt: Date.now() + 800, ...(DIFFS[q.get('diff')] ? { diff: q.get('diff') } : {}), ...(MAPS[q.get('map')] ? { map: q.get('map'), mapFixed: true } : {}) });
  else if (mode === 'create') room = makeRoom({});
  else if (mode === 'daily') {
    const day = dayNumber();
    room = makeRoom({ daily: true, mode: 'daily', day, map: MAP_KEYS[day % MAP_KEYS.length], mapFixed: true, seed: (day * 2654435761) % 2147483647, startAt: Date.now() + 1500 });
  }
  if (!room) { ws.send(JSON.stringify({ t: 'err', text: 'комната не найдена' })); return ws.close(); }
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.room = null; // привязывается в join
  ws.on('message', raw => room.handleRaw(ws, raw.toString()));
  ws.on('close', () => room.leave(ws));
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 20000);

server.listen(PORT, () => console.log('roworld: http://localhost:' + PORT));
