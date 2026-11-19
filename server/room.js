import { Game } from './game.js';
import { MAX_HUMANS, MAPS, MODES, DIFFS } from '../public/shared/consts.js';

const send = (ws, o) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch { /* сокет закрыт */ } };
const AUTO_START_MS = 25000;
const MAP_KEYS = Object.keys(MAPS);
export const dayNumber = () => Math.floor(Date.now() / 86400000);

// комната: лобби → партия → итоги. не зависит от окружения (node ws или cloudflare durable object):
// сокету нужны только send(), readyState и свойства room/token
export class Room {
  constructor(code, opts, env = {}) {
    this.code = code;
    this.opts = { map: 'random', mode: 'classic', diff: 'normal', pub: false, daily: false, seed: null, startAt: 0, day: 0, ...opts };
    this.store = env.store || null; this.onEmpty = env.onEmpty || (() => {});
    this.players = new Map(); // token -> {token, ws, name, pid, nid, lastChat}
    this.phase = 'lobby'; this.game = null; this.host = null;
    this.timer = null; this.emptyTimer = null;
    this.autoAt = this.opts.startAt || (this.opts.pub ? Date.now() + AUTO_START_MS : 0);
    this.lobbyTimer = setInterval(() => this.lobbyTick(), 1000);
  }
  get online() { return [...this.players.values()].filter(p => p.ws && p.ws.readyState === 1); }

  handleRaw(ws, raw) {
    const now = Date.now(); // антиспам: не более 30 сообщений в секунду
    if (!ws.rl || now - ws.rl.t > 1000) ws.rl = { t: now, c: 0 };
    if (++ws.rl.c > 30) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') return this.join(ws, m.name, m.token, m.pid);
    this.onMsg(ws, m);
  }

  join(ws, name, token, pid) {
    if (ws.token) return;
    name = String(name || 'игрок').trim().slice(0, 16) || 'игрок';
    pid = typeof pid === 'string' ? pid.slice(0, 40) : null;
    let pl = token && this.players.get(token);
    if (pl) pl.ws = ws;
    else {
      if (this.phase === 'playing') return send(ws, { t: 'err', text: 'игра уже идёт, подождите конца раунда' });
      if (this.players.size >= MAX_HUMANS) return send(ws, { t: 'err', text: 'комната заполнена' });
      pl = { token: crypto.randomUUID().replace(/-/g, ''), ws, name, pid, nid: -1, lastChat: 0 };
      this.players.set(pl.token, pl);
      if (!this.host) this.host = pl.token;
    }
    ws.room = this; ws.token = pl.token;
    clearTimeout(this.emptyTimer);
    send(ws, { t: 'joined', room: this.code, token: pl.token });
    if (this.phase === 'playing' && pl.nid >= 0) {
      this.game.N[pl.nid].online = true;
      send(ws, this.initMsg(pl));
      send(ws, { t: 'state', ...this.game.snapshot(pl.nid) });
      this.broadcast({ t: 'ev', text: `${pl.name} вернулся в игру`, kind: 'info' });
    } else this.sendLobby();
  }

  leave(ws) {
    const pl = this.players.get(ws.token); if (!pl || pl.ws !== ws) return;
    pl.ws = null;
    if (this.phase === 'playing') {
      if (pl.nid >= 0) { this.game.N[pl.nid].online = false; this.broadcast({ t: 'ev', text: `${pl.name} отключился — нацией управляет ии`, kind: 'info' }); }
    } else {
      this.players.delete(pl.token);
      if (this.host === pl.token) this.host = [...this.players.keys()][0] || null;
      this.sendLobby();
    }
    if (!this.online.length) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = setTimeout(() => this.destroy(), this.phase === 'playing' ? 120000 : 15000);
    }
  }

  destroy() { clearInterval(this.timer); clearInterval(this.lobbyTimer); clearTimeout(this.emptyTimer); this.onEmpty(this.code); }

  lobbyMsg() {
    return {
      t: 'lobby', code: this.code, pub: this.opts.pub, daily: this.opts.daily, host: this.host,
      map: this.opts.map, mode: this.opts.mode, diff: this.opts.diff,
      startsIn: this.autoAt ? Math.max(0, Math.ceil((this.autoAt - Date.now()) / 1000)) : null,
      players: [...this.players.values()].map(p => ({ name: p.name, host: p.token === this.host, online: !!p.ws })),
    };
  }
  sendLobby() { if (this.phase !== 'lobby') return; const m = this.lobbyMsg(); for (const p of this.online) send(p.ws, { ...m, me: p.token === this.host }); }
  lobbyTick() {
    if (this.phase !== 'lobby') return;
    if (this.autoAt && Date.now() >= this.autoAt && this.online.length >= 1) return this.start();
    if (this.autoAt && this.online.length) this.sendLobby();
  }

  start(byToken) {
    if (this.phase !== 'lobby') return;
    if (byToken && byToken !== this.host) return;
    const pls = this.online;
    if (!pls.length) return;
    let { map, mode } = this.opts;
    if (mode === 'teams' && pls.length < 2) return send(this.players.get(byToken)?.ws, { t: 'err', text: 'для команд 2×2 нужно минимум 2 игрока' });
    if (this.opts.pub && !this.opts.mapFixed) map = MAP_KEYS[(this.code.charCodeAt(1) + this.code.length) % MAP_KEYS.length];
    pls.forEach((p, i) => { p.nid = i; });
    for (const [tk, p] of this.players) if (!p.ws) this.players.delete(tk);
    const seed = this.opts.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.game = new Game(seed, pls.map(p => p.name), { map, mode, diff: this.opts.diff });
    this.phase = 'playing'; this.autoAt = 0;
    for (const p of pls) send(p.ws, this.initMsg(p));
    this.pushState();
    this.timer = setInterval(() => this.step(), 1000);
  }

  initMsg(pl) {
    const g = this.game;
    return {
      t: 'init', me: pl.nid, map: g.initPayload(), limit: g.limit, mode: g.mode, win: g.winShare,
      nations: g.N.map(n => ({ id: n.id, name: n.name, hue: n.hue, human: n.human, team: n.team, cap: n.cap, type: n.human ? 'human' : n.type })),
    };
  }

  step() {
    const g = this.game, w = g.tick();
    this.flushEvents(); this.pushState();
    if (w !== null) this.finish(w);
  }

  async finish(w) {
    clearInterval(this.timer);
    const g = this.game, res = g.results();
    const text = w === -2 ? 'все игроки уничтожены' : (g.timeUp ? `время вышло — лидер ${g.N[w].name}` : `${g.N[w].name} захватил ${Math.round(g.winShare * 100)}% карты`);
    const out = res.map(r => {
      const delta = this.opts.daily ? 0 : Math.max(-25, Math.min(25, 25 - 4 * (r.rank - 1))) + (r.won ? 10 : 0);
      const score = this.opts.daily ? Math.round(r.share * 1000) + (r.won ? r.left : 0) : 0;
      return { ...r, delta, score };
    });
    for (const r of out) { // персональные итоги и запись в рейтинг
      const pl = [...this.players.values()].find(p => p.nid === r.nid);
      if (pl && this.store && pl.pid) { try { await this.store.report({ pid: pl.pid, name: pl.name, delta: r.delta, won: r.won, day: this.opts.daily ? this.opts.day : 0, score: r.score }); } catch (e) { console.error('store', e); } }
    }
    for (const p of this.online) send(p.ws, { t: 'end', winner: w, text, results: out.map(r => ({ name: r.name, rank: r.rank, won: r.won, delta: r.delta, score: r.score, share: +(r.share * 100).toFixed(1), me: r.nid === p.nid })), daily: this.opts.daily });
    setTimeout(() => {
      if (this.phase !== 'playing') return;
      this.phase = 'lobby'; this.game = null;
      this.autoAt = this.opts.pub ? Date.now() + AUTO_START_MS : 0;
      for (const p of this.players.values()) p.nid = -1;
      for (const [tk, p] of this.players) if (!p.ws) this.players.delete(tk);
      if (!this.players.has(this.host)) this.host = [...this.players.keys()][0] || null;
      this.sendLobby();
    }, 12000);
  }

  flushEvents() {
    const g = this.game;
    for (const e of g.ev) for (const p of this.online) if (e.to === 'all' || e.to === p.nid) send(p.ws, { t: 'ev', text: e.text, kind: e.kind });
    g.ev = [];
    if (g.fx.length) { this.broadcast({ t: 'fx', list: g.fx.slice(0, 40) }); g.fx = []; }
  }
  pushState() { for (const p of this.online) if (p.nid >= 0) send(p.ws, { t: 'state', ...this.game.snapshot(p.nid) }); }
  broadcast(m) { for (const p of this.online) send(p.ws, m); }

  onMsg(ws, m) {
    const pl = this.players.get(ws.token); if (!pl) return;
    if (m.t === 'start') return this.start(ws.token);
    if (m.t === 'opts' && this.phase === 'lobby' && ws.token === this.host && !this.opts.pub && !this.opts.daily) {
      if (MAPS[m.map]) this.opts.map = m.map;
      if (MODES[m.mode] && m.mode !== 'daily') this.opts.mode = m.mode;
      if (DIFFS[m.diff]) this.opts.diff = m.diff;
      this.opts.mapFixed = true; return this.sendLobby();
    }
    if (m.t === 'chat') {
      const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 140), now = Date.now();
      if (!text || now - pl.lastChat < 700) return;
      pl.lastChat = now; return this.broadcast({ t: 'chat', from: pl.name, text, nid: pl.nid });
    }
    if (m.t === 'act' && this.phase === 'playing') {
      if (pl.nid < 0) return;
      this.game.act(pl.nid, String(m.k), m.p, m);
      this.flushEvents();
      send(ws, { t: 'state', ...this.game.snapshot(pl.nid) });
    }
  }
}
