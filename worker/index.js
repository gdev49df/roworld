// cloudflare worker: статика + маршрутизация websocket в durable object (одна комната = один объект)
import { Room, dayNumber } from '../server/room.js';
import { D1Store } from './d1-store.js';
import { MAPS } from '../public/shared/consts.js';

const MAP_KEYS = Object.keys(MAPS);
const QUICK_MS = 25000;
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rndCode = () => Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * 24)]).join('');

export class RoomDO {
  constructor(state, env) { this.env = env; this.room = null; }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const url = new URL(request.url);
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    server.accept();
    if (!this.room) {
      if (url.searchParams.get('create') !== '1') {
        server.send(JSON.stringify({ t: 'err', text: 'комната не найдена' })); server.close(1000, 'no room');
        return new Response(null, { status: 101, webSocket: client });
      }
      const opts = JSON.parse(url.searchParams.get('o') || '{}');
      this.room = new Room(url.searchParams.get('code'), opts, { store: new D1Store(this.env.DB), onEmpty: () => { this.room = null; } });
    }
    const room = this.room;
    server.addEventListener('message', e => room.handleRaw(server, typeof e.data === 'string' ? e.data : ''));
    server.addEventListener('close', () => room.leave(server));
    server.addEventListener('error', () => room.leave(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/api/leaderboard') {
      const data = await new D1Store(env.DB).leaderboard(dayNumber());
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname !== '/ws') return env.ASSETS.fetch(request);

    const q = url.searchParams, mode = q.get('mode');
    let code = (q.get('room') || '').toUpperCase(), create = '0', opts = {};
    if (!code) {
      create = '1';
      if (mode === 'quick') { // общая комната на окно в 25 секунд; кто пришёл позже — попадает в следующую
        const now = Date.now(); let b = Math.floor(now / QUICK_MS); if (now % QUICK_MS > QUICK_MS - 4000) b++;
        code = 'Q' + b; opts = { pub: true, startAt: (b + 1) * QUICK_MS, map: MAP_KEYS[b % MAP_KEYS.length] };
      } else if (mode === 'blitz') {
        const now = Date.now(); let b = Math.floor(now / QUICK_MS); if (now % QUICK_MS > QUICK_MS - 4000) b++;
        code = 'B' + b; opts = { pub: true, mode: 'blitz', startAt: (b + 1) * QUICK_MS };
      } else if (mode === 'solo') {
        code = rndCode(); opts = { startAt: Date.now() + 800 };
        if (MAPS[q.get('map')]) { opts.map = q.get('map'); opts.mapFixed = true; }
      } else if (mode === 'daily') {
        const day = dayNumber(); code = 'D' + rndCode() + day;
        opts = { daily: true, mode: 'daily', day, map: MAP_KEYS[day % MAP_KEYS.length], mapFixed: true, seed: (day * 2654435761) % 2147483647, startAt: Date.now() + 1500 };
      } else { code = rndCode(); } // create
    }
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const u = new URL('https://room/'); u.searchParams.set('code', code); u.searchParams.set('create', create); u.searchParams.set('o', JSON.stringify(opts));
    return stub.fetch(new Request(u, request));
  },
};
