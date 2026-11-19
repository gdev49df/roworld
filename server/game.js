import { generateMap } from './map.js';
import { rng } from './rng.js';
import { COST, NNAT, TYPES, AGGR, BOT_NAMES, WIN_SHARE, TIME_LIMIT } from '../shared/consts.js';

// авторитетная игровая логика: клиенты только шлют команды
export class Game {
  constructor(seed, humanNames) {
    this.r = rng(seed ^ 0x9e3779b9);
    const m = generateMap(seed);
    this.P = m.P; this.pid = m.pid; this.totalLand = m.totalLand;
    const n = this.P.length;
    this.owner = new Array(n).fill(-1);
    this.troops = this.P.map(() => 3 + Math.floor(this.r() * 8));
    this.city = new Array(n).fill(0);
    this.fort = new Array(n).fill(0);
    this.tickNo = 0; this.over = false; this.ev = []; this.invites = [];
    this.N = [];
    for (let i = 0; i < NNAT; i++) {
      const human = i < humanNames.length;
      this.N.push({
        id: i, human, online: human, alive: true, gold: human ? 120 : 80,
        name: human ? humanNames[i] : BOT_NAMES[i - humanNames.length] || ('Нация ' + i),
        hue: Math.round(i * 360 / NNAT), allies: new Set(),
        type: TYPES[Math.floor(this.r() * TYPES.length)],
      });
    }
    // старты по принципу «самая дальняя точка»
    const P = this.P, starts = [P[Math.floor(this.r() * P.length)]];
    while (starts.length < NNAT) {
      let best = null, bd = -1;
      for (const p of P) {
        let mn = 1e9; for (const s of starts) mn = Math.min(mn, (p.cx - s.cx) ** 2 + (p.cy - s.cy) ** 2);
        if (mn > bd) { bd = mn; best = p; }
      }
      starts.push(best);
    }
    starts.forEach((s, i) => {
      this.owner[s.id] = i; this.troops[s.id] = 15; let k = 0;
      for (const j of s.nb) if (this.owner[j] === -1 && k < 2) { this.owner[j] = i; this.troops[j] = 12; k++; }
    });
  }

  rnd(n) { return Math.floor(this.r() * n); }
  say(to, text, kind = 'info') { this.ev.push({ to, text, kind }); }
  nbAll(p) { return [...this.P[p].nb, ...this.P[p].sea]; }
  allied(a, b) { return a >= 0 && b >= 0 && this.N[a].allies.has(b); }
  makeAlly(a, b) { this.N[a].allies.add(b); this.N[b].allies.add(a); }
  breakAlly(a, b) { this.N[a].allies.delete(b); this.N[b].allies.delete(a); }
  mine(nid) { const r = []; for (let i = 0; i < this.P.length; i++) if (this.owner[i] === nid) r.push(i); return r; }

  attackers(nid, t) {
    const r = [], tp = this.P[t];
    for (const i of tp.nb) if (this.owner[i] === nid && this.troops[i] > 3) r.push([i, 1]);
    for (const i of tp.sea) if (this.owner[i] === nid && this.troops[i] > 3 && !tp.nb.includes(i)) r.push([i, .6]);
    return r;
  }

  attack(nid, t, bot) {
    const prev = this.owner[t];
    if (prev === nid) return false;
    if (this.allied(nid, prev)) { if (!bot) this.say(nid, 'нельзя атаковать союзника — сначала разорвите союз', 'warn'); return false; }
    const a = this.attackers(nid, t);
    if (!a.length) { if (!bot) this.say(nid, 'рядом нет ваших провинций с войсками', 'warn'); return false; }
    const def = this.troops[t] * (1 + .5 * this.fort[t]);
    let tot = 0; for (const [q, f] of a) tot += Math.floor(this.troops[q] * .7) * f;
    if (bot && tot < def * 1.15) return false;
    for (const [q] of a) this.troops[q] -= Math.floor(this.troops[q] * .7);
    if (tot > def) {
      this.owner[t] = nid; this.troops[t] = Math.max(1, Math.floor(tot - def));
      this.fort[t] = Math.max(0, this.fort[t] - 1); this.N[nid].gold += 10;
      if (prev >= 0) {
        this.say(prev, `${this.N[nid].name} захватил вашу провинцию`, 'bad');
        this.checkDead(prev);
      }
      if (!bot || prev >= 0) this.say(nid, prev >= 0 ? `захвачена провинция ${this.N[prev].name}` : 'захвачена нейтральная провинция', 'good');
    } else {
      this.troops[t] = Math.max(0, Math.floor(this.troops[t] - tot / (1 + .5 * this.fort[t])));
      if (!bot) this.say(nid, 'атака отбита, защитник ослаблен', 'warn');
      if (prev >= 0) this.say(prev, `${this.N[nid].name} атаковал вас — отбились`, 'info');
    }
    return true;
  }

  checkDead(i) {
    if (this.owner.includes(i)) return;
    const n = this.N[i]; n.alive = false;
    for (const o of this.N) o.allies.delete(i);
    n.allies.clear();
    this.say('all', `${n.name} уничтожен`, 'info');
  }

  nuke(t, by) {
    this.troops[t] = 0; this.fort[t] = 0; this.city[t] = 0;
    for (const q of this.nbAll(t)) this.troops[q] = Math.floor(this.troops[q] * .3);
    const o = this.owner[t];
    if (o >= 0) this.say(o, `${this.N[by].name} сбросил бомбу на вашу провинцию!`, 'bad');
  }

  // команды игрока. возвращает void, результаты — через события
  act(nid, k, p, extra) {
    if (this.over) return;
    const me = this.N[nid]; if (!me || !me.alive) return;
    if (k === 'reply') { // ответ на приглашение в союз
      const idx = this.invites.findIndex(v => v.from === extra.from && v.to === nid);
      if (idx < 0) return;
      this.invites.splice(idx, 1);
      if (extra.yes && this.N[extra.from].alive) {
        this.makeAlly(nid, extra.from);
        this.say('all', `${this.N[nid].name} и ${this.N[extra.from].name} заключили союз`, 'info');
      } else this.say(extra.from, `${me.name} отказал в союзе`, 'warn');
      return;
    }
    if (!Number.isInteger(p) || p < 0 || p >= this.P.length) return;
    const own = this.owner[p] === nid;
    if (own) {
      if (k === 'city' && this.city[p] < 3 && me.gold >= COST.city) { me.gold -= COST.city; this.city[p]++; }
      else if (k === 'fort' && this.fort[p] < 3 && me.gold >= COST.fort) { me.gold -= COST.fort; this.fort[p]++; }
      else if (k === 'draft' && me.gold >= COST.draft) { me.gold -= COST.draft; this.troops[p] += 20; }
      return;
    }
    const o = this.owner[p];
    if (k === 'attack') this.attack(nid, p, false);
    else if (k === 'nuke') { if (me.gold >= COST.nuke) { me.gold -= COST.nuke; this.nuke(p, nid); this.say(nid, 'бомба сброшена', 'good'); } }
    else if (k === 'ally' && o >= 0 && !this.allied(nid, o)) {
      const t = this.N[o];
      if (t.human && t.online) {
        if (!this.invites.some(v => v.from === nid && v.to === o)) this.invites.push({ from: nid, to: o });
        this.say(o, `${me.name} предлагает союз`, 'invite:' + nid);
        this.say(nid, `предложение отправлено: ${t.name}`, 'info');
      } else if (this.r() < (t.type === 'diplomat' ? .85 : .35)) {
        this.makeAlly(nid, o); this.say('all', `${t.name} и ${me.name} заключили союз`, 'info');
      } else this.say(nid, `${t.name} отказал в союзе`, 'warn');
    } else if (k === 'break' && o >= 0 && this.allied(nid, o)) {
      this.breakAlly(nid, o);
      this.say(o, `${me.name} разорвал союз с вами`, 'bad'); this.say(nid, 'союз разорван', 'info');
    }
  }

  botTurn(n) {
    const mine = this.mine(n.id); if (!mine.length) return;
    if (n.gold >= COST.city && this.r() < (n.type === 'economist' ? .6 : .25)) {
      const p = mine[this.rnd(mine.length)]; if (this.city[p] < 3) { this.city[p]++; n.gold -= COST.city; }
    } else if (n.gold >= COST.fort && (n.type === 'defender' || this.r() < .1)) {
      const p = mine[this.rnd(mine.length)]; if (this.fort[p] < 3) { this.fort[p]++; n.gold -= COST.fort; }
    }
    // лишнее золото уходит в призыв на границах
    for (let i = 0; i < 3 && n.gold >= COST.draft + 40; i++) {
      const border = mine.filter(p => this.nbAll(p).some(q => this.owner[q] !== n.id && !this.allied(n.id, this.owner[q])));
      if (!border.length) break;
      const b = border[this.rnd(border.length)];
      if (this.troops[b] < 150 + 50 * this.city[b]) { this.troops[b] += 20; n.gold -= COST.draft; }
    }
    if (n.type === 'nuker' && n.gold >= COST.nuke) {
      const c = [];
      for (const p of mine) for (const q of this.nbAll(p)) { const o = this.owner[q]; if (o >= 0 && o !== n.id && !this.allied(n.id, o)) c.push(q); }
      if (c.length) { this.nuke(c[this.rnd(c.length)], n.id); n.gold -= COST.nuke; }
    }
    if (n.type === 'diplomat' && this.r() < .08) {
      const c = new Set();
      for (const p of mine) for (const q of this.nbAll(p)) { const o = this.owner[q]; if (o >= 0 && o !== n.id && !n.allies.has(o) && !this.N[o].human) c.add(o); }
      const arr = [...c];
      if (arr.length && this.r() < .5) { const o = arr[this.rnd(arr.length)]; this.makeAlly(n.id, o); this.say('all', `${n.name} и ${this.N[o].name} заключили союз`, 'info'); }
    }
    if (n.type === 'opportunist' && n.allies.size && this.r() < .01) {
      const o = [...n.allies][this.rnd(n.allies.size)]; this.breakAlly(n.id, o);
      this.say(o, `${n.name} предал союз!`, 'bad');
    }
    if (this.r() > AGGR[n.type]) return;
    let best = -1, bs = 1e9;
    for (const p of mine) {
      if (this.troops[p] <= 8) continue;
      for (const q of this.nbAll(p)) {
        const o = this.owner[q];
        if (o === n.id || this.allied(n.id, o)) continue;
        if (n.type === 'defender' && o >= 0) continue;
        const sc = this.troops[q] * (1 + .5 * this.fort[q]) - (o >= 0 ? 2 : 0) - this.city[q] * 2;
        if (sc < bs) { bs = sc; best = q; }
      }
    }
    if (best >= 0) this.attack(n.id, best, true);
  }

  // один игровой тик (1 секунда). возвращает победителя или null
  tick() {
    this.tickNo++;
    for (let p = 0; p < this.P.length; p++) {
      const o = this.owner[p];
      if (o >= 0) {
        const cap = 60 + 30 * this.city[p];
        if (this.troops[p] < cap) this.troops[p] = Math.min(cap, this.troops[p] + .5 + .15 * this.city[p] + this.P[p].cells.length * .012);
        this.N[o].gold += .8 + this.city[p] * 3;
      } else if (this.troops[p] < 10) this.troops[p] += .08;
    }
    for (const n of this.N) if (n.alive && !n.online) this.botTurn(n);
    // союзы ботов между собой со временем рвутся
    for (const a of this.N) for (const b of [...a.allies]) if (a.id > b && !a.human && !this.N[b].human && this.r() < .01) this.breakAlly(a.id, b);
    this.invites = this.invites.filter(v => this.N[v.from].alive && this.N[v.to].alive);
    const cnt = this.shares();
    for (const n of this.N) if (n.alive && cnt[n.id] / this.totalLand >= WIN_SHARE) { this.over = true; return n.id; }
    if (this.tickNo >= TIME_LIMIT) {
      let w = 0; for (const n of this.N) if (cnt[n.id] > cnt[w]) w = n.id;
      this.over = true; this.timeUp = true; return w;
    }
    const humanCount = this.N.some(n => n.human), humansAlive = this.N.some(n => n.human && n.alive);
    if (humanCount && !humansAlive) { this.over = true; return -2; }
    return null;
  }

  shares() {
    const c = new Array(NNAT).fill(0);
    for (let p = 0; p < this.P.length; p++) if (this.owner[p] >= 0) c[this.owner[p]] += this.P[p].cells.length;
    return c;
  }

  // статические данные карты (один раз при старте)
  initPayload() {
    const flat = []; for (let y = 0; y < this.pid[0].length; y++) for (let x = 0; x < this.pid.length; x++) flat.push(this.pid[x][y]);
    return {
      pid: flat, total: this.totalLand,
      prov: this.P.map(p => ({ cx: +p.cx.toFixed(1), cy: +p.cy.toFixed(1), n: p.cells.length, nb: p.nb, sea: p.sea })),
    };
  }

  snapshot(nid) {
    const me = this.N[nid];
    return {
      k: this.tickNo, o: this.owner, tr: this.troops.map(Math.floor), ci: this.city, fo: this.fort,
      cnt: this.shares(), alive: this.N.map(n => n.alive ? 1 : 0), on: this.N.map(n => n.online ? 1 : 0),
      gold: me ? Math.floor(me.gold) : 0, al: me ? [...me.allies] : [],
    };
  }
}
