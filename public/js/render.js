import { flag } from './flags.js';

const S = 6; // пикселей на клетку в базовых слоях
const sstep = (a, b, x) => { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi + s, yi), b = hash(xi + 1 + s, yi), c = hash(xi + s, yi + 1), d = hash(xi + 1 + s, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => .55 * vnoise(x, y, s) + .3 * vnoise(x * 2.1, y * 2.1, s + 17) + .15 * vnoise(x * 4.3, y * 4.3, s + 33);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(st, t) { for (let i = 1; i < st.length; i++) if (t <= st[i][0]) return mix(st[i - 1][1], st[i][1], (t - st[i - 1][0]) / (st[i][0] - st[i - 1][0])); return st[st.length - 1][1]; }
const EARTH = [[0, [54, 112, 58]], [.35, [96, 138, 66]], [.55, [150, 132, 76]], [.75, [128, 112, 96]], [.9, [176, 172, 170]], [1, [240, 244, 248]]];
const MARS = [[0, [140, 66, 40]], [.4, [186, 96, 54]], [.7, [212, 132, 78]], [1, [120, 56, 38]]];

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export class Renderer {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.view = { s: 8, x: 0, y: 0 }; this.sel = -1; this.targets = []; this.dirty = true; this.st = null; this.onPick = () => {};
    this.fx = []; this.shake = 0; this.cam = null; this.last = 0; this.edgeCache = new Map(); this.flash = 0;
    this.bind();
  }

  setMap(map, nations) {
    this.map = map; this.nations = nations; this.W = map.W; this.H = map.H;
    this.rgb = nations.map(n => hsl(n.hue, 68, 52));
    this.edgeCache.clear(); this.fx = []; this.prevOwner = null;
    const { W, H } = this, pid = map.pid;
    this.cellsOf = map.prov.map(() => []); this.segs = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = pid[y * W + x]; if (p < 0) continue;
      this.cellsOf[p].push(x, y);
      if (x + 1 < W) { const q = pid[y * W + x + 1]; if (q >= 0 && q !== p) this.segs.push(x + 1, y, x + 1, y + 1, p, q); }
      if (y + 1 < H) { const q = pid[(y + 1) * W + x]; if (q >= 0 && q !== p) this.segs.push(x, y + 1, x + 1, y + 1, p, q); }
    }
    this.flags = nations.map(n => flag(n));
    this.buildTerrain();
    this.st = null; this.sel = -1; this.resize(); this.fit();
  }

  // рельеф, глубина моря, гладкая береговая линия — один раз на карту
  buildTerrain() {
    const { W, H } = this, pid = this.map.pid, mars = this.map.name === 'mars', N = W * H, Wh = W * S, Hh = H * S;
    const land = new Uint8Array(N); for (let i = 0; i < N; i++) land[i] = pid[i] >= 0 ? 1 : 0;
    const bfs = (isSrc, pass) => {
      const dist = new Int16Array(N).fill(-1), near = new Int32Array(N).fill(-1), q = [];
      for (let i = 0; i < N; i++) if (isSrc(i)) { dist[i] = 0; near[i] = i; q.push(i); }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx; if (dist[j] >= 0 || !pass(j)) continue;
          dist[j] = dist[i] + 1; near[j] = near[i]; q.push(j);
        }
      }
      return { dist, near };
    };
    const dl = bfs(i => land[i], i => !land[i]);
    const ds = bfs(i => !land[i] || (i % W === 0 || i % W === W - 1 || i < W || i >= N - W), i => land[i]);
    const landC = new Array(N), seaC = new Array(N), sd = mars ? 7 : 3;
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue; const x = i % W, y = (i / W) | 0;
      let h = fbm(x * .14, y * .14, sd) * .75 + Math.min(ds.dist[i], 7) / 7 * .25;
      if (!mars && (this.map.name === 'world' || this.map.name === 'europe')) { const t = y / H; if (t < .1) h += (1 - t / .1) * .55; if (t > .93) h += (t - .93) / .07 * .5; }
      landC[i] = ramp(mars ? MARS : EARTH, Math.max(0, Math.min(1, h)));
    }
    for (let i = 0; i < N; i++) {
      if (land[i]) { seaC[i] = null; continue; }
      const t = Math.min(dl.dist[i], 9) / 9;
      seaC[i] = mars ? mix([98, 52, 40], [48, 24, 22], t) : mix([46, 128, 164], [9, 34, 68], t);
      landC[i] = dl.near[i] >= 0 ? landC[dl.near[i]] : [90, 90, 90];
    }
    for (let i = 0; i < N; i++) if (land[i]) seaC[i] = dl.near[i] >= 0 ? seaC[i] : null;
    // у суши ближайшее море для заливки под берегом
    const seaNear = bfs(i => !land[i], i => land[i]);
    for (let i = 0; i < N; i++) if (land[i]) seaC[i] = seaC[seaNear.near[i]] || [20, 60, 100];
    const lowL = mk(W, H), lowS = mk(W, H), li = lowL.getContext('2d').createImageData(W, H), si = lowS.getContext('2d').createImageData(W, H);
    for (let i = 0; i < N; i++) { const a = landC[i], b = seaC[i]; li.data.set([a[0], a[1], a[2], 255], i * 4); si.data.set([b[0], b[1], b[2], 255], i * 4); }
    lowL.getContext('2d').putImageData(li, 0, 0); lowS.getContext('2d').putImageData(si, 0, 0);
    const bigL = mk(Wh, Hh), bigS = mk(Wh, Hh);
    for (const [src, dst] of [[lowL, bigL], [lowS, bigS]]) { const c = dst.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(src, 0, 0, Wh, Hh); }
    const L = bigL.getContext('2d').getImageData(0, 0, Wh, Hh), Sd = bigS.getContext('2d').getImageData(0, 0, Wh, Hh);
    // гладкая маска суши: размытие + билинейное увеличение + порог
    let m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = land[i];
    for (let pass = 0; pass < 2; pass++) {
      const t = new Float32Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) { s += m[y * W + x]; } else s += m[ny * W + nx]; c++; }
        t[y * W + x] = s / c;
      }
      m = t;
    }
    const mask = mk(Wh, Hh), md = mask.getContext('2d').createImageData(Wh, Hh), out = mk(Wh, Hh), oc = out.getContext('2d'), od = oc.createImageData(Wh, Hh);
    const samp = (fx, fy) => {
      const x = Math.max(0, Math.min(W - 1.001, fx - .5)), y = Math.max(0, Math.min(H - 1.001, fy - .5)), xi = x | 0, yi = y | 0, u = x - xi, v = y - yi;
      return m[yi * W + xi] * (1 - u) * (1 - v) + m[yi * W + xi + 1] * u * (1 - v) + m[(yi + 1) * W + xi] * (1 - u) * v + m[(yi + 1) * W + xi + 1] * u * v;
    };
    for (let py = 0; py < Hh; py++) for (let px = 0; px < Wh; px++) {
      const k = (py * Wh + px) * 4, v = samp((px + .5) / S, (py + .5) / S), a = sstep(.4, .6, v), n = (hash(px, py) - .5) * 8;
      let r = Sd.data[k], g = Sd.data[k + 1], b = Sd.data[k + 2];
      const foam = sstep(.18, .42, v) * (1 - sstep(.42, .55, v)); // пена у берега
      r += (255 - r) * foam * .5; g += (255 - g) * foam * .5; b += (255 - b) * foam * .5;
      let lr = L.data[k], lg = L.data[k + 1], lb = L.data[k + 2];
      const beach = sstep(.5, .66, v) * (1 - sstep(.66, .85, v)) * .35; // песок на кромке
      lr += (214 - lr) * beach; lg += (196 - lg) * beach; lb += (146 - lb) * beach;
      od.data[k] = r * (1 - a) + lr * a + n; od.data[k + 1] = g * (1 - a) + lg * a + n; od.data[k + 2] = b * (1 - a) + lb * a + n; od.data[k + 3] = 255;
      md.data[k + 3] = Math.round(a * 255);
    }
    oc.putImageData(od, 0, 0); mask.getContext('2d').putImageData(md, 0, 0);
    this.terr = out; this.maskHi = mask; this.ownHi = mk(Wh, Hh); this.ownLow = mk(W, H);
  }

  setState(st) {
    this.st = st;
    const o = st.o, pv = this.prevOwner;
    let changed = !pv || pv.length !== o.length; if (!changed) for (let i = 0; i < o.length; i++) if (pv[i] !== o[i]) { changed = true; break; }
    if (changed) { this.prevOwner = o.slice(); this.buildOwn(); }
    this.dirty = true;
  }
  buildOwn() {
    const { W, H } = this, pid = this.map.pid, st = this.st, Wh = W * S, Hh = H * S;
    const lc = this.ownLow.getContext('2d'), id = lc.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const p = pid[i]; if (p < 0) continue; const o = st.o[p], c = o >= 0 ? this.rgb[o] : [150, 145, 120], a = o >= 0 ? 165 : 45;
      id.data.set([c[0], c[1], c[2], a], i * 4);
    }
    lc.putImageData(id, 0, 0);
    const c = this.ownHi.getContext('2d'); c.clearRect(0, 0, Wh, Hh);
    c.imageSmoothingEnabled = true; c.drawImage(this.ownLow, 0, 0, Wh, Hh);
    c.globalCompositeOperation = 'destination-in'; c.drawImage(this.maskHi, 0, 0); c.globalCompositeOperation = 'source-over';
    const thin = new Path2D(), thick = new Path2D(), s = this.segs;
    for (let i = 0; i < s.length; i += 6) {
      const path = st.o[s[i + 4]] !== st.o[s[i + 5]] ? thick : thin;
      path.moveTo(s[i] * S, s[i + 1] * S); path.lineTo(s[i + 2] * S, s[i + 3] * S);
    }
    c.lineCap = 'round'; c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1; c.stroke(thin);
    c.strokeStyle = 'rgba(8,16,30,.8)'; c.lineWidth = 2.6; c.stroke(thick);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = .9; c.stroke(thick);
  }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    const ow = this.cv.width / (this.dpr || 1), oh = this.cv.height / (this.dpr || 1);
    this.cv.width = r.width * d; this.cv.height = r.height * d; this.dpr = d; this.dirty = true;
    if (this.view && ow > 50 && oh > 50 && this.map) {
      const dx = (r.width - ow) / 2, dy = (r.height - oh) / 2;
      this.view.x += dx; this.view.y += dy;
      if (this.cam) { this.cam.to.x += dx; this.cam.to.y += dy; this.cam.from.x += dx; this.cam.from.y += dy; }
    }
  }
  fit() {
    if (!this.map) return;
    const w = this.cv.width / this.dpr, h = this.cv.height / this.dpr, s = Math.min(w / this.W, h / this.H);
    this.view = { s, x: (w - this.W * s) / 2, y: (h - this.H * s) / 2 }; this.minS = s * .8; this.dirty = true;
  }
  focus(p, scale, instant) {
    const pr = this.map.prov[p]; if (!pr) return;
    const w = this.cv.width / this.dpr, h = this.cv.height / this.dpr, s = Math.max(this.minS || 1, Math.min(40, scale || this.view.s));
    const to = { s, x: w / 2 - pr.cx * s, y: h / 2 - pr.cy * s };
    if (instant) { this.view = to; this.dirty = true; } else this.cam = { from: { ...this.view }, to, t0: performance.now(), dur: 650 };
  }
  zoom(f, cx, cy) {
    const v = this.view, w = this.cv.width / this.dpr, h = this.cv.height / this.dpr; this.cam = null;
    cx = cx ?? w / 2; cy = cy ?? h / 2;
    const ns = Math.max(this.minS || 1, Math.min(60, v.s * f)), k = ns / v.s;
    v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.s = ns; this.dirty = true;
  }
  bind() {
    const cv = this.cv, pts = new Map(); let moved = 0, pinch = 0;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; this.cam = null; });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [c, d] = [...pts.values()], d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (pinch && d0) { const r = cv.getBoundingClientRect(); this.zoom(d1 / d0, (c.x + d.x) / 2 - r.left, (c.y + d.y) / 2 - r.top); }
        pinch = 1; moved = 99; return;
      }
      moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY;
      if (moved > 6) { this.view.x += dx; this.view.y += dy; this.dirty = true; }
    });
    const up = e => {
      const had = pts.has(e.pointerId); pts.delete(e.pointerId); if (!pts.size) pinch = 0;
      if (had && moved <= 6 && e.type === 'pointerup') { const r = cv.getBoundingClientRect(); this.onPick(this.pick(e.clientX - r.left, e.clientY - r.top)); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }
  pick(px, py) {
    if (!this.map) return -1;
    const v = this.view, x = Math.floor((px - v.x) / v.s), y = Math.floor((py - v.y) / v.s);
    return x >= 0 && y >= 0 && x < this.W && y < this.H ? this.map.pid[y * this.W + x] : -1;
  }

  edges(p) {
    let e = this.edgeCache.get(p); if (e) return e;
    const { W, H } = this, pid = this.map.pid, a = this.cellsOf[p], path = new Path2D();
    const other = (x, y) => x < 0 || y < 0 || x >= W || y >= H || pid[y * W + x] !== p;
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i], y = a[i + 1];
      if (other(x + 1, y)) { path.moveTo(x + 1, y); path.lineTo(x + 1, y + 1); }
      if (other(x - 1, y)) { path.moveTo(x, y); path.lineTo(x, y + 1); }
      if (other(x, y + 1)) { path.moveTo(x, y + 1); path.lineTo(x + 1, y + 1); }
      if (other(x, y - 1)) { path.moveTo(x, y); path.lineTo(x + 1, y); }
    }
    this.edgeCache.set(p, path); return path;
  }

  // ---- эффекты по событиям сервера ----
  addFx(list, me) {
    if (!this.map) return; const now = performance.now(), prov = this.map.prov;
    for (const e of list) {
      const col = this.rgb[e.n] || [255, 255, 255], to = prov[e.to];
      if (e.k === 'atk') {
        let maxEnd = 0;
        e.from.forEach(([p, sea], i) => {
          const f = prov[p], dur = sea ? 1300 : 800, cnt = Math.min(9, 3 + (f.n >> 2));
          this.fx.push({ k: 'run', fx: f.cx, fy: f.cy, tx: to.cx, ty: to.cy, sea, col, t0: now + i * 60, dur, cnt });
          maxEnd = Math.max(maxEnd, i * 60 + dur + cnt * 45);
        });
        this.fx.push({ k: 'burst', x: to.cx, y: to.cy, col, win: e.win, t0: now + maxEnd - 120, dur: 1000 });
      } else if (e.k === 'nuke') {
        this.fx.push({ k: 'nuke', x: to.cx, y: to.cy, t0: now, dur: 2400 });
      } else if (e.k === 'blk') {
        for (const p of e.from) this.fx.push({ k: 'run', fx: prov[p].cx, fy: prov[p].cy, tx: to.cx, ty: to.cy, sea: true, col, t0: now, dur: 1200, cnt: 1 });
        this.fx.push({ k: 'ring', x: to.cx, y: to.cy, col: e.win ? col : [255, 120, 120], t0: now + 1100, dur: 1400 });
      }
    }
    this.dirty = true;
  }

  drawFx(c, now) {
    const keep = [];
    for (const f of this.fx) {
      const el = now - f.t0;
      if (f.k === 'run') {
        if (el > f.dur + f.cnt * 45) continue; keep.push(f);
        const dx = f.tx - f.fx, dy = f.ty - f.fy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (let j = 0; j < f.cnt; j++) {
          const p = (el - j * 45) / f.dur; if (p < 0 || p > 1) continue;
          const e = p * p * (3 - 2 * p), off = (j % 3 - 1) * .35 * (f.sea ? 0 : 1);
          let x = f.fx + dx * e + nx * off, y = f.fy + dy * e + ny * off;
          if (f.sea) { y -= Math.sin(Math.PI * e) * L * .12; this.ship(c, x, y, dx, f.col, p); continue; }
          c.fillStyle = rgba(f.col, .35); c.beginPath(); c.arc(x - dx / L * .5, y - dy / L * .5, .22, 0, 7); c.fill();
          c.fillStyle = rgba(f.col, 1); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = .08;
          c.beginPath(); c.arc(x, y, .3, 0, 7); c.fill(); c.stroke();
        }
      } else if (f.k === 'burst') {
        const p = el / f.dur; if (p > 1) continue; keep.push(f); if (p < 0) continue;
        if (f.win) {
          c.strokeStyle = rgba(f.col, 1 - p); c.lineWidth = .35 * (1 - p) + .05; c.beginPath(); c.arc(f.x, f.y, .5 + p * 3.2, 0, 7); c.stroke();
          c.fillStyle = `rgba(255,255,255,${.4 * (1 - p)})`; c.beginPath(); c.arc(f.x, f.y, .5 + p * 1.6, 0, 7); c.fill();
          for (let i = 0; i < 9; i++) { const a = i * 0.698 + .3, r = p * 3.6; c.fillStyle = `rgba(255,236,170,${1 - p})`; c.beginPath(); c.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, .2 * (1 - p) + .03, 0, 7); c.fill(); }
        } else {
          c.fillStyle = `rgba(110,110,115,${.5 * (1 - p)})`;
          for (let i = 0; i < 4; i++) { const a = i * 1.57 + .5; c.beginPath(); c.arc(f.x + Math.cos(a) * p * 1.3, f.y + Math.sin(a) * p * 1.3 - p, .5 + p, 0, 7); c.fill(); }
        }
      } else if (f.k === 'ring') {
        const p = el / f.dur; if (p > 1) continue; keep.push(f); if (p < 0) continue;
        for (let i = 0; i < 3; i++) { const q = Math.max(0, p - i * .18); c.strokeStyle = rgba(f.col, (1 - q) * .8); c.lineWidth = .15; c.beginPath(); c.arc(f.x, f.y, .5 + q * 4, 0, 7); c.stroke(); }
      } else if (f.k === 'nuke') {
        const p = el / f.dur; if (p > 1) continue; keep.push(f);
        this.shake = Math.max(this.shake, 7 * (1 - p));
        if (p < .12) this.flash = 1 - p / .12;
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 1 + p * 7);
        g.addColorStop(0, `rgba(255,250,200,${1 - p})`); g.addColorStop(.35, `rgba(255,150,40,${.9 * (1 - p)})`); g.addColorStop(1, 'rgba(120,20,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, 1 + p * 7, 0, 7); c.fill();
        c.strokeStyle = `rgba(255,255,255,${.7 * (1 - p)})`; c.lineWidth = .5 * (1 - p) + .05; c.beginPath(); c.arc(f.x, f.y, p * 15, 0, 7); c.stroke();
        c.fillStyle = `rgba(40,30,30,${.6 * (1 - p)})`; c.beginPath(); c.arc(f.x, f.y - p * 4, 1.3 + p * 2.4, 0, 7); c.fill();
      }
    }
    this.fx = keep;
  }
  ship(c, x, y, dir, col, p) {
    c.save(); c.translate(x, y); c.scale(dir < 0 ? -1 : 1, 1);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-.9, .25, .9, .14, 0, 0, 7); c.fill(); // кильватер
    c.fillStyle = '#26333f'; c.beginPath(); c.moveTo(-.7, -.1); c.lineTo(.8, -.1); c.lineTo(.5, .3); c.lineTo(-.5, .3); c.closePath(); c.fill();
    c.fillStyle = rgba(col, 1); c.fillRect(-.3, -.45, .6, .35); c.fillStyle = '#fff'; c.fillRect(.05, -.7, .08, .3);
    c.restore();
  }

  draw(now) {
    if (!this.map) return;
    const busy = this.dirty || this.fx.length || this.cam || this.sel >= 0;
    if (!busy && now - this.last < 200) return;
    this.last = now; this.dirty = false;
    if (this.cam) {
      const k = Math.min(1, (now - this.cam.t0) / this.cam.dur), e = 1 - (1 - k) ** 3, a = this.cam.from, b = this.cam.to;
      this.view = { s: a.s + (b.s - a.s) * e, x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
      if (k >= 1) this.cam = null;
    }
    const c = this.ctx, d = this.dpr, v = this.view;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0a2038'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    if (!this.st || !this.terr) return;
    this.shake *= .9; if (this.shake < .2) this.shake = 0;
    const sx = (Math.random() - .5) * this.shake, sy = (Math.random() - .5) * this.shake;
    c.setTransform(v.s * d, 0, 0, v.s * d, (v.x + sx) * d, (v.y + sy) * d);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.terr, 0, 0, this.W, this.H); c.drawImage(this.ownHi, 0, 0, this.W, this.H);
    const st = this.st, prov = this.map.prov, pulse = .5 + .5 * Math.sin(now / 260);
    for (let p = 0; p < st.bl.length; p++) if (st.bl[p]) { c.fillStyle = 'rgba(0,0,0,.4)'; const a = this.cellsOf[p]; for (let i = 0; i < a.length; i += 2) c.fillRect(a[i], a[i + 1], 1.02, 1.02); }
    if (this.sel >= 0) {
      const a = this.cellsOf[this.sel]; c.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < a.length; i += 2) c.fillRect(a[i], a[i + 1], 1.02, 1.02);
      c.lineJoin = 'round'; c.strokeStyle = `rgba(255,255,255,${.7 + .3 * pulse})`; c.lineWidth = .22; c.stroke(this.edges(this.sel));
      c.setLineDash([.5, .4]); c.lineDashOffset = -now / 120; c.strokeStyle = `rgba(255,90,70,${.55 + .45 * pulse})`; c.lineWidth = .2;
      for (const t of this.targets) c.stroke(this.edges(t));
      c.setLineDash([]);
    }
    this.drawOverlay(c, st, prov, v.s);
    this.drawFx(c, now);
    if (this.flash > 0.02) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(255,255,255,${this.flash * .75})`; c.fillRect(0, 0, this.cv.width, this.cv.height); this.flash *= .88; }
  }

  drawOverlay(c, st, prov, scale) {
    if (scale < 4.5) return;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const big = scale > 9;
    for (let p = 0; p < prov.length; p++) {
      const pr = prov[p]; if (pr.n < 3 && scale < 12) continue;
      const o = st.o[p], col = o >= 0 ? this.rgb[o] : [92, 90, 74];
      const t = String(st.tr[p]), neutral = o < 0, k = neutral ? .8 : 1;
      c.font = `bold ${1.15 * k}px system-ui,sans-serif`;
      const w = Math.max(1.6 * k, t.length * .72 * k + .9 * k), h = 1.45 * k, x = pr.cx - w / 2, y = pr.cy - h / 2;
      c.globalAlpha = neutral ? .72 : 1;
      c.fillStyle = 'rgba(10,18,30,.82)'; c.beginPath(); c.roundRect(x, y, w, h, .5); c.fill();
      c.strokeStyle = rgba(col, 1); c.lineWidth = .14; c.stroke();
      c.fillStyle = '#fff'; c.fillText(t, pr.cx, pr.cy + .06); c.globalAlpha = 1;
      // значки: города ★, форт, порт
      let ix = pr.cx - ((st.ci[p] ? 1 : 0) + (st.fo[p] ? 1 : 0) + (st.pt[p] ? 1 : 0) - 1) * .75, iy = pr.cy + 1.45;
      if (st.ci[p]) { this.city(c, ix, iy, st.ci[p]); ix += 1.5; }
      if (st.fo[p]) { this.fort(c, ix, iy, st.fo[p]); ix += 1.5; }
      if (st.pt[p]) { c.font = '1.2px system-ui'; c.fillStyle = '#fff'; c.fillText('⚓', ix, iy); if (big) { c.font = 'bold .7px system-ui'; c.fillText(st.fl[p], ix + .85, iy + .5); } }
    }
    // флаги на столицах
    for (let n = 0; n < st.cap.length; n++) {
      const p = st.cap[n]; if (p < 0 || !st.alive[n]) continue; const pr = prov[p];
      c.strokeStyle = '#ddd'; c.lineWidth = .1; c.beginPath(); c.moveTo(pr.cx - .6, pr.cy - .8); c.lineTo(pr.cx - .6, pr.cy - 2.6); c.stroke();
      c.drawImage(this.flags[n], pr.cx - .55, pr.cy - 2.65, 1.5, 1);
    }
  }
  city(c, x, y, lvl) {
    c.fillStyle = '#f2e7c9'; c.strokeStyle = '#2a2a2a'; c.lineWidth = .06;
    for (let i = 0; i < lvl; i++) { const h = .5 + i * .22; c.fillRect(x - .55 + i * .38, y + .45 - h, .3, h); c.strokeRect(x - .55 + i * .38, y + .45 - h, .3, h); }
  }
  fort(c, x, y, lvl) {
    c.fillStyle = lvl > 1 ? '#9fc3ff' : '#c8d6e8'; c.strokeStyle = '#1b2a44'; c.lineWidth = .07;
    c.beginPath(); c.moveTo(x - .45, y - .4); c.lineTo(x + .45, y - .4); c.lineTo(x + .4, y + .15); c.lineTo(x, y + .5); c.lineTo(x - .4, y + .15); c.closePath(); c.fill(); c.stroke();
    if (lvl > 1) { c.fillStyle = '#1b2a44'; c.font = 'bold .6px system-ui'; c.fillText(lvl, x, y); }
  }
}
