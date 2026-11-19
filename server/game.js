import { generateMap } from './map.js';
import { rng } from '../public/shared/rng.js';
import { COST, NNAT, TYPES, AGGR, BOT_NAMES, MODES, TECH_COST, TECH_NAME } from '../public/shared/consts.js';

// авторитетная игровая логика: клиенты только шлют команды
export class Game {
  constructor(seed, humanNames, opts = {}) {
    this.mapName = opts.map || 'random'; this.mode = opts.mode || 'classic';
    const M = MODES[this.mode] || MODES.classic;
    this.limit = M.time; this.winShare = M.win; this.mult = M.mult;
    this.diff = opts.diff || 'normal';
    this.diffA = { easy: .6, normal: 1, hard: 1.25 }[this.diff] || 1; // агрессия ботов
    this.diffI = { easy: .8, normal: 1, hard: 1.3 }[this.diff] || 1; // доход ботов
    this.fx = [];
    this.r = rng(seed ^ 0x9e3779b9);
    const m = generateMap(seed, this.mapName);
    this.W = m.W; this.H = m.H; this.P = m.P; this.pid = m.pid; this.totalLand = m.totalLand;
    const n = this.P.length;
    this.owner = new Array(n).fill(-1);
    this.troops = this.P.map(() => 3 + Math.floor(this.r() * 8));
    this.city = new Array(n).fill(0); this.fort = new Array(n).fill(0);
    this.port = new Array(n).fill(0); this.fleet = new Array(n).fill(0); this.block = new Array(n).fill(0);
    this.tickNo = 0; this.over = false; this.timeUp = false; this.winner = null; this.ev = []; this.invites = [];
    this.N = [];
    const teamsOn = this.mode === 'teams' && humanNames.length >= 2;
    for (let i = 0; i < NNAT; i++) {
      const human = i < humanNames.length;
      this.N.push({
        id: i, human, online: human, alive: true, gold: human ? 120 : 80,
        name: human ? humanNames[i] : BOT_NAMES[i - humanNames.length] || ('Нация ' + i),
        hue: Math.round(i * 360 / NNAT), allies: new Set(), enemies: new Set(),
        team: teamsOn && human ? i % 2 : -1, cap: -1, tech: { eco: 0, atk: 0, def: 0 },
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
      this.owner[s.id] = i; this.N[i].cap = s.id; this.troops[s.id] = 25; let k = 0;
      for (const j of s.nb) if (this.owner[j] === -1 && k < 2) { this.owner[j] = i; this.troops[j] = 12; k++; }
      for (const j of this.mine(i)) if (P[j].isCoast) { this.port[j] = 1; this.fleet[j] = 6; }
    });
  }

  rnd(n) { return Math.floor(this.r() * n); }
  say(to, text, kind = 'info') { this.ev.push({ to, text, kind }); }
  nbAll(p) { return [...this.P[p].nb, ...this.P[p].sea]; }
  allied(a, b) { return a >= 0 && b >= 0 && a !== b && (this.N[a].allies.has(b) || (this.N[a].team >= 0 && this.N[a].team === this.N[b].team)); }
  makeAlly(a, b) { this.N[a].allies.add(b); this.N[b].allies.add(a); }
  breakAlly(a, b) { this.N[a].allies.delete(b); this.N[b].allies.delete(a); }
  mine(nid) { const r = []; for (let i = 0; i < this.P.length; i++) if (this.owner[i] === nid) r.push(i); return r; }

  // может ли провинция q атаковать t: по суше всегда, по морю — только из порта с флотом
  canSea(q) { return this.port[q] && this.fleet[q] >= 2 && this.block[q] <= 0; }
  attackers(nid, t) {
    const r = [], tp = this.P[t];
    for (const i of tp.nb) if (this.owner[i] === nid && this.troops[i] > 3) r.push([i, 1, false]);
    for (const i of tp.sea) if (this.owner[i] === nid && this.troops[i] > 3 && !tp.nb.includes(i) && this.canSea(i)) r.push([i, 1, true]);
    return r;
  }

  attack(nid, t, bot, frac = .7) {
    const prev = this.owner[t];
    if (prev === nid) return false;
    if (this.allied(nid, prev)) { if (!bot) this.say(nid, 'нельзя атаковать союзника — сначала разорвите союз', 'warn'); return false; }
    const a = this.attackers(nid, t);
    if (!a.length) { if (!bot) this.say(nid, this.P[t].sea.some(i => this.owner[i] === nid) ? 'для морской атаки нужен порт и флот (от 2 кораблей)' : 'рядом нет ваших провинций с войсками', 'warn'); return false; }
    const atkK = 1 + .15 * this.N[nid].tech.atk, defK = prev >= 0 ? 1 + .2 * this.N[prev].tech.def : 1;
    const def = this.troops[t] * (1 + .5 * this.fort[t]) * defK;
    const sendOf = ([q, , sea]) => Math.min(Math.floor(this.troops[q] * frac), sea ? this.fleet[q] * 6 : 1e9);
    let tot = 0; for (const x of a) tot += sendOf(x);
    tot *= atkK;
    if (bot && tot < def * 1.15) return false;
    for (const x of a) { const s = sendOf(x); this.troops[x[0]] -= s; if (x[2]) this.fleet[x[0]] = Math.max(1, Math.floor(this.fleet[x[0]] * .8)); }
    this.fx.push({ k: 'atk', n: nid, from: a.map(x => [x[0], x[2] ? 1 : 0]), to: t, win: tot > def });
    if (prev >= 0 && !this.N[prev].enemies.has(nid)) {
      this.N[prev].enemies.add(nid);
      for (const z of this.N[prev].allies) if (!this.N[z].enemies.has(nid)) { this.N[z].enemies.add(nid); this.say(z, `союзник ${this.N[prev].name} атакован: ${this.N[nid].name}`, 'warn'); }
    }
    if (tot > def) {
      this.owner[t] = nid; this.troops[t] = Math.max(1, Math.floor(tot - def));
      this.fort[t] = Math.max(0, this.fort[t] - 1); this.N[nid].gold += 10; this.block[t] = 0;
      if (prev >= 0) {
        this.say(prev, `${this.N[nid].name} захватил вашу провинцию`, 'bad');
        if (this.N[prev].cap === t) { // падение столицы: победитель забирает половину казны
          const loot = Math.floor(this.N[prev].gold * .5); this.N[prev].gold -= loot; this.N[nid].gold += loot; this.N[prev].cap = -1;
          this.say('all', `столица ${this.N[prev].name} пала! ${this.N[nid].name} забрал ${loot} золота`, 'bad');
        }
        this.checkDead(prev);
      }
      if (!bot || prev >= 0) this.say(nid, prev >= 0 ? `захвачена провинция ${this.N[prev].name}` : 'захвачена нейтральная провинция', 'good');
    } else {
      this.troops[t] = Math.max(0, Math.floor(this.troops[t] - tot / ((1 + .5 * this.fort[t]) * defK)));
      if (!bot) this.say(nid, 'атака отбита, защитник ослаблен', 'warn');
      if (prev >= 0) this.say(prev, `${this.N[nid].name} атаковал вас — отбились`, 'info');
    }
    return true;
  }

  // морская блокада вражеского порта: бой флотов
  blockade(nid, t) {
    const prev = this.owner[t];
    if (prev < 0 || prev === nid || this.allied(nid, prev)) { this.say(nid, 'блокировать можно только порт врага', 'warn'); return; }
    if (!this.port[t]) { this.say(nid, 'в этой провинции нет порта', 'warn'); return; }
    const tp = this.P[t], ships = [];
    for (const i of [...tp.sea, ...tp.nb]) if (this.owner[i] === nid && this.port[i] && this.fleet[i] >= 3) ships.push(i);
    if (!ships.length) { this.say(nid, 'нужен ваш порт рядом с флотом от 3 кораблей', 'warn'); return; }
    let tot = 0; for (const i of ships) { tot += Math.floor(this.fleet[i] * .8); this.fleet[i] -= Math.floor(this.fleet[i] * .8); }
    this.fx.push({ k: 'blk', n: nid, from: ships, to: t, win: tot > this.fleet[t] });
    if (tot > this.fleet[t]) {
      this.fleet[t] = 0; this.block[t] = 40;
      this.say(nid, 'порт заблокирован на 40 с', 'good'); this.say(prev, `${this.N[nid].name} блокировал ваш порт!`, 'bad');
    } else {
      this.fleet[t] -= tot; this.say(nid, 'флот врага отбил блокаду', 'warn');
    }
  }

  checkDead(i) {
    if (this.owner.includes(i)) return;
    const n = this.N[i]; n.alive = false;
    for (const o of this.N) o.allies.delete(i);
    n.allies.clear();
    this.say('all', `${n.name} уничтожен`, 'info');
  }

  nuke(t, by) {
    this.fx.push({ k: 'nuke', n: by, to: t });
    this.troops[t] = 0; this.fort[t] = 0; this.city[t] = 0; this.fleet[t] = 0;
    for (const q of this.nbAll(t)) this.troops[q] = Math.floor(this.troops[q] * .3);
    const o = this.owner[t];
    if (o >= 0) this.say(o, `${this.N[by].name} сбросил бомбу на вашу провинцию!`, 'bad');
  }

  act(nid, k, p, extra) {
    if (this.over) return;
    const me = this.N[nid]; if (!me || !me.alive) return;
    if (k === 'reply') {
      const idx = this.invites.findIndex(v => v.from === extra.from && v.to === nid);
      if (idx < 0) return;
      this.invites.splice(idx, 1);
      if (extra.yes && this.N[extra.from].alive) { this.makeAlly(nid, extra.from); this.say('all', `${this.N[nid].name} и ${this.N[extra.from].name} заключили союз`, 'info'); }
      else this.say(extra.from, `${me.name} отказал в союзе`, 'warn');
      return;
    }
    if (k === 'tech') {
      const w = extra && extra.which, t = me.tech;
      if (!['eco', 'atk', 'def'].includes(w) || t[w] >= 3) return;
      const cost = TECH_COST[t[w]];
      if (me.gold >= cost) { me.gold -= cost; t[w]++; this.say(nid, `изучено: ${TECH_NAME[w]} ${t[w]}`, 'good'); }
      return;
    }
    if (!Number.isInteger(p) || p < 0 || p >= this.P.length) return;
    const own = this.owner[p] === nid, o = this.owner[p];
    if (own) {
      if (k === 'city' && this.city[p] < 3 && me.gold >= COST.city) { me.gold -= COST.city; this.city[p]++; }
      else if (k === 'fort' && this.fort[p] < 3 && me.gold >= COST.fort) { me.gold -= COST.fort; this.fort[p]++; }
      else if (k === 'draft' && me.gold >= COST.draft) { me.gold -= COST.draft; this.troops[p] += 20; }
      else if (k === 'port' && !this.port[p] && this.P[p].isCoast && me.gold >= COST.port) { me.gold -= COST.port; this.port[p] = 1; this.fleet[p] = 3; }
      else if (k === 'ship' && this.port[p] && this.fleet[p] < 40 && me.gold >= COST.ship) { me.gold -= COST.ship; this.fleet[p] = Math.min(40, this.fleet[p] + 5); }
      return;
    }
    if (k === 'attack') { const pc = +(extra && extra.pct); this.attack(nid, p, false, [30, 60, 100].includes(pc) ? pc / 100 : .7); }
    else if (k === 'blockade') this.blockade(nid, p);
    else if (k === 'nuke') { if (me.gold >= COST.nuke) { me.gold -= COST.nuke; this.nuke(p, nid); this.say(nid, 'бомба сброшена', 'good'); } }
    else if (k === 'gift' && o >= 0 && me.gold >= COST.gift) {
      me.gold -= COST.gift; this.N[o].gold += COST.gift;
      this.say(o, `${me.name} подарил вам ${COST.gift} золота`, 'good'); this.say(nid, `подарок отправлен: ${this.N[o].name}`, 'info');
      if (!this.N[o].human && !this.allied(nid, o) && this.r() < .5) { this.makeAlly(nid, o); this.say('all', `${this.N[o].name} и ${me.name} заключили союз`, 'info'); }
    } else if (k === 'ally' && o >= 0 && !this.allied(nid, o)) {
      const t = this.N[o];
      if (t.human && t.online) {
        if (!this.invites.some(v => v.from === nid && v.to === o)) this.invites.push({ from: nid, to: o });
        this.say(o, `${me.name} предлагает союз`, 'invite:' + nid);
        this.say(nid, `предложение отправлено: ${t.name}`, 'info');
      } else if (this.r() < (t.type === 'diplomat' ? .85 : .35)) {
        this.makeAlly(nid, o); this.say('all', `${t.name} и ${me.name} заключили союз`, 'info');
      } else this.say(nid, `${t.name} отказал в союзе`, 'warn');
    } else if (k === 'break' && o >= 0 && this.allied(nid, o)) {
      if (me.team >= 0 && me.team === this.N[o].team) { this.say(nid, 'нельзя разорвать союз с напарником', 'warn'); return; }
      this.breakAlly(nid, o);
      this.say(o, `${me.name} разорвал союз с вами`, 'bad'); this.say(nid, 'союз разорван', 'info');
    }
  }

  botTurn(n) {
    const mine = this.mine(n.id); if (!mine.length) return;
    const pick = () => mine[this.rnd(mine.length)];
    if (n.gold >= COST.city && this.r() < (n.type === 'economist' ? .6 : .25)) {
      const p = pick(); if (this.city[p] < 3) { this.city[p]++; n.gold -= COST.city; }
    } else if (n.gold >= COST.fort && (n.type === 'defender' || this.r() < .1)) {
      const p = pick(); if (this.fort[p] < 3) { this.fort[p]++; n.gold -= COST.fort; }
    }
    if (this.r() < .06) { const w = ['eco', 'atk', 'def'][this.rnd(3)]; if (n.tech[w] < 3 && n.gold >= TECH_COST[n.tech[w]] + 60) { n.gold -= TECH_COST[n.tech[w]]; n.tech[w]++; } }
    // порты и флот
    if (n.gold >= COST.port && this.r() < .15) { const p = pick(); if (this.P[p].isCoast && !this.port[p]) { this.port[p] = 1; this.fleet[p] = 3; n.gold -= COST.port; } }
    if (n.gold >= COST.ship && this.r() < .25) { const p = pick(); if (this.port[p] && this.fleet[p] < 12) { this.fleet[p] += 5; n.gold -= COST.ship; } }
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
    if (this.r() > Math.min(1, AGGR[n.type] * this.diffA)) return;
    let best = -1, bs = 1e9;
    for (const p of mine) {
      if (this.troops[p] <= 8) continue;
      const pn = this.P[p].nb;
      for (const q of this.nbAll(p)) {
        const o = this.owner[q];
        if (o === n.id || this.allied(n.id, o)) continue;
        if (!pn.includes(q) && !this.canSea(p)) continue;
        if (n.type === 'defender' && o >= 0 && !n.enemies.has(o)) continue;
        const sc = this.troops[q] * (1 + .5 * this.fort[q]) - (o >= 0 ? 2 : 0) - this.city[q] * 2 - (n.enemies.has(o) ? 8 : 0);
        if (sc < bs) { bs = sc; best = q; }
      }
    }
    if (best >= 0) this.attack(n.id, best, true);
  }

  // доля территории нации; в командах — суммарно по команде
  shares() {
    const c = new Array(NNAT).fill(0);
    for (let p = 0; p < this.P.length; p++) if (this.owner[p] >= 0) c[this.owner[p]] += this.P[p].cells.length;
    return c;
  }
  scoreShares() {
    const c = this.shares(), out = c.slice();
    for (const n of this.N) if (n.team >= 0) out[n.id] = this.N.filter(m => m.team === n.team).reduce((s, m) => s + c[m.id], 0);
    return out;
  }

  // один игровой тик (1 секунда). возвращает победителя (id), -2 если все игроки уничтожены, либо null
  tick() {
    this.tickNo++;
    const k = this.mult;
    for (let p = 0; p < this.P.length; p++) {
      if (this.block[p] > 0) this.block[p]--;
      const o = this.owner[p];
      if (o >= 0) {
        const cap = 60 + 30 * this.city[p];
        if (this.troops[p] < cap) this.troops[p] = Math.min(cap, this.troops[p] + k * (.5 + .15 * this.city[p] + this.P[p].cells.length * .012));
        if (this.block[p] <= 0) {
          const nn = this.N[o];
          nn.gold += k * (.8 + this.city[p] * 3 + (this.port[p] ? 1 : 0) + (nn.cap === p ? 2 : 0)) * (1 + .25 * nn.tech.eco) * (nn.online ? 1 : this.diffI);
        }
      } else if (this.troops[p] < 10) this.troops[p] += .08;
    }
    for (const n of this.N) if (n.alive && !n.online) this.botTurn(n);
    for (const a of this.N) for (const b of [...a.allies]) if (a.id > b && !a.human && !this.N[b].human && this.r() < .01) this.breakAlly(a.id, b);
    this.invites = this.invites.filter(v => this.N[v.from].alive && this.N[v.to].alive);
    const sc = this.scoreShares();
    for (const n of this.N) if (n.alive && sc[n.id] / this.totalLand >= this.winShare) return this.finish(n.id, false);
    if (this.tickNo >= this.limit) {
      let w = 0; for (const n of this.N) if (sc[n.id] > sc[w]) w = n.id;
      return this.finish(w, true);
    }
    if (this.N.some(n => n.human) && !this.N.some(n => n.human && n.alive)) return this.finish(-2, false);
    return null;
  }
  finish(w, timeUp) { this.over = true; this.timeUp = timeUp; this.winner = w; return w; }

  // итоги для рейтинга: место по доле территории (в командах — по команде)
  results() {
    const sc = this.scoreShares(), win = this.winner;
    const order = this.N.map(n => n.id).sort((a, b) => sc[b] - sc[a]);
    const wn = win >= 0 ? this.N[win] : null;
    return this.N.filter(n => n.human).map(n => {
      const rank = order.indexOf(n.id) + 1;
      const won = !!wn && (n.id === win || (n.team >= 0 && n.team === wn.team));
      return { nid: n.id, name: n.name, rank, won, share: sc[n.id] / this.totalLand, left: this.limit - this.tickNo };
    });
  }

  initPayload() {
    const flat = []; for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) flat.push(this.pid[x][y]);
    return {
      W: this.W, H: this.H, pid: flat, total: this.totalLand, name: this.mapName,
      prov: this.P.map(p => ({ cx: +p.cx.toFixed(1), cy: +p.cy.toFixed(1), n: p.cells.length, nb: p.nb, sea: p.sea, coast: p.isCoast ? 1 : 0 })),
    };
  }

  snapshot(nid) {
    const me = this.N[nid];
    return {
      k: this.tickNo, o: this.owner, tr: this.troops.map(Math.floor), ci: this.city, fo: this.fort,
      pt: this.port, fl: this.fleet, bl: this.block.map(b => b > 0 ? 1 : 0),
      cnt: this.shares(), alive: this.N.map(n => n.alive ? 1 : 0), on: this.N.map(n => n.online ? 1 : 0),
      cap: this.N.map(n => n.cap), tech: me ? me.tech : null, gold: me ? Math.floor(me.gold) : 0, al: me ? [...me.allies] : [], en: me ? [...me.enemies] : [],
    };
  }
}
