import crypto from 'crypto';
import { Game } from './game.js';
import { MAX_HUMANS, NNAT } from '../shared/consts.js';

const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const AUTO_START_MS = 25000;

export class Room {
  constructor(code, pub, onEmpty) {
    this.code = code; this.pub = pub; this.onEmpty = onEmpty;
    this.players = new Map(); // token -> {token, ws, name, nid}
    this.phase = 'lobby'; this.game = null; this.host = null;
    this.timer = null; this.autoAt = pub ? Date.now() + AUTO_START_MS : 0;
    this.emptyTimer = null;
    this.lobbyTimer = setInterval(() => this.lobbyTick(), 1000);
  }
  get online() { return [...this.players.values()].filter(p => p.ws && p.ws.readyState === 1); }

  join(ws, name, token) {
    name = String(name || 'игрок').trim().slice(0, 16) || 'игрок';
    let pl = token && this.players.get(token);
    if (pl) { // переподключение
      pl.ws = ws;
    } else {
      if (this.phase === 'playing') return send(ws, { t: 'err', text: 'игра уже идёт, подождите конца раунда' });
      if (this.players.size >= MAX_HUMANS) return send(ws, { t: 'err', text: 'комната заполнена' });
      pl = { token: crypto.randomBytes(12).toString('hex'), ws, name, nid: -1 };
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
    } else { this.players.delete(pl.token); if (this.host === pl.token) this.host = [...this.players.keys()][0] || null; this.sendLobby(); }
    if (!this.online.length) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = setTimeout(() => this.destroy(), this.phase === 'playing' ? 120000 : 15000);
    }
  }

  destroy() { clearInterval(this.timer); clearInterval(this.lobbyTimer); this.onEmpty(this.code); }

  lobbyMsg() {
    return {
      t: 'lobby', code: this.code, pub: this.pub, host: this.host,
      startsIn: this.pub && this.autoAt ? Math.max(0, Math.ceil((this.autoAt - Date.now()) / 1000)) : null,
      players: [...this.players.values()].map(p => ({ name: p.name, host: p.token === this.host, online: !!p.ws })),
    };
  }
  sendLobby() { if (this.phase !== 'lobby') return; const m = this.lobbyMsg(); for (const p of this.online) send(p.ws, { ...m, me: p.token === this.host }); }
  lobbyTick() {
    if (this.phase !== 'lobby') return;
    if (this.pub && this.autoAt && Date.now() >= this.autoAt && this.online.length >= 1) return this.start();
    if (this.pub && this.online.length) this.sendLobby();
  }

  start(byToken) {
    if (this.phase !== 'lobby') return;
    if (byToken && byToken !== this.host) return;
    const pls = this.online;
    if (!pls.length) return;
    pls.forEach((p, i) => { p.nid = i; });
    for (const [tk, p] of this.players) if (!p.ws) this.players.delete(tk);
    this.game = new Game((Math.random() * 2 ** 31) | 0, pls.map(p => p.name));
    this.phase = 'playing';
    for (const p of pls) send(p.ws, this.initMsg(p));
    this.pushState();
    this.timer = setInterval(() => this.step(), 1000);
  }

  initMsg(pl) {
    const g = this.game;
    return {
      t: 'init', me: pl.nid, map: g.initPayload(),
      nations: g.N.map(n => ({ id: n.id, name: n.name, hue: n.hue, human: n.human, type: n.human ? 'human' : n.type })),
    };
  }

  step() {
    const g = this.game, w = g.tick();
    this.flushEvents();
    this.pushState();
    if (w !== null) {
      clearInterval(this.timer);
      const text = w === -2 ? 'все игроки уничтожены' : (g.timeUp ? `время вышло — лидер ${g.N[w].name}` : `${g.N[w].name} захватил 80% карты`);
      this.broadcast({ t: 'end', winner: w, text });
      setTimeout(() => { this.phase = 'lobby'; this.game = null; this.autoAt = this.pub ? Date.now() + AUTO_START_MS : 0; for (const p of this.players.values()) p.nid = -1; this.sendLobby(); }, 12000);
    }
  }
  flushEvents() {
    const g = this.game;
    for (const e of g.ev) {
      for (const p of this.online) if (e.to === 'all' || e.to === p.nid) send(p.ws, { t: 'ev', text: e.text, kind: e.kind });
    }
    g.ev = [];
  }
  pushState() { for (const p of this.online) if (p.nid >= 0) send(p.ws, { t: 'state', ...this.game.snapshot(p.nid) }); }
  broadcast(m) { for (const p of this.online) send(p.ws, m); }

  onMsg(ws, m) {
    if (m.t === 'start') return this.start(ws.token);
    if (m.t === 'act' && this.phase === 'playing') {
      const pl = this.players.get(ws.token); if (!pl || pl.nid < 0) return;
      this.game.act(pl.nid, String(m.k), m.p, m);
      this.flushEvents();
      send(ws, { t: 'state', ...this.game.snapshot(pl.nid) });
    }
  }
}
