function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export class Renderer {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.off = document.createElement('canvas'); this.octx = this.off.getContext('2d');
    this.view = { s: 8, x: 0, y: 0 }; this.sel = -1; this.dirty = true; this.st = null;
    this.onPick = () => {};
    this.bind();
  }
  setMap(map, nations) {
    this.map = map; this.nations = nations; this.W = map.W; this.H = map.H;
    this.off.width = this.W; this.off.height = this.H;
    this.rgb = nations.map(n => hsl(n.hue, 68, 52));
    const { W, H } = this, pid = map.pid; this.segs = [];
    this.cellsOf = map.prov.map(() => []);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = pid[y * W + x]; if (p < 0) continue;
      this.cellsOf[p].push(x, y);
      if (x + 1 < W && pid[y * W + x + 1] >= 0 && pid[y * W + x + 1] !== p) this.segs.push(x + 1, y, x + 1, y + 1);
      if (y + 1 < H && pid[(y + 1) * W + x] >= 0 && pid[(y + 1) * W + x] !== p) this.segs.push(x, y + 1, x + 1, y + 1);
    }
    this.st = null; this.sel = -1; this.resize(); this.fit();
  }
  setState(st) { this.st = st; this.rebuild(); this.dirty = true; }
  rebuild() {
    const { W, H } = this, pid = this.map.pid, o = this.st.o, img = this.octx.createImageData(W, H), d = img.data;
    for (let i = 0; i < W * H; i++) {
      const p = pid[i]; let c;
      if (p < 0) c = [14, 42, 71]; else c = o[p] >= 0 ? this.rgb[o[p]] : [110, 108, 88];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    this.octx.putImageData(img, 0, 0);
  }
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.cv.width = r.width * d; this.cv.height = r.height * d; this.dpr = d; this.dirty = true;
  }
  fit() {
    if (!this.map) return;
    const w = this.cv.width / this.dpr, h = this.cv.height / this.dpr, s = Math.min(w / this.W, h / this.H);
    this.view = { s, x: (w - this.W * s) / 2, y: (h - this.H * s) / 2 }; this.minS = s * .8; this.dirty = true;
  }
  zoom(f, cx, cy) {
    const v = this.view, w = this.cv.width / this.dpr, h = this.cv.height / this.dpr;
    cx = cx ?? w / 2; cy = cy ?? h / 2;
    const ns = Math.max(this.minS || 1, Math.min(60, v.s * f)), k = ns / v.s;
    v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.s = ns; this.dirty = true;
  }
  bind() {
    const cv = this.cv, pts = new Map(); let moved = 0, pinch = 0;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; });
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
  draw() {
    if (!this.dirty || !this.map) return; this.dirty = false;
    const c = this.ctx, d = this.dpr, v = this.view;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0e2a47'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    if (!this.st) return;
    c.setTransform(v.s * d, 0, 0, v.s * d, v.x * d, v.y * d);
    c.imageSmoothingEnabled = false; c.drawImage(this.off, 0, 0);
    const fill = (p, col) => { c.fillStyle = col; const a = this.cellsOf[p]; for (let i = 0; i < a.length; i += 2) c.fillRect(a[i], a[i + 1], 1.02, 1.02); };
    const st = this.st;
    for (let p = 0; p < st.bl.length; p++) if (st.bl[p]) fill(p, 'rgba(0,0,0,.35)'); // заблокированные порты
    if (this.sel >= 0) {
      const pr = this.map.prov[this.sel];
      for (const q of [...pr.nb, ...pr.sea]) fill(q, 'rgba(255,255,255,.12)');
      fill(this.sel, 'rgba(255,255,255,.38)');
    }
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = .12; c.beginPath();
    const s = this.segs; for (let i = 0; i < s.length; i += 4) { c.moveTo(s[i], s[i + 1]); c.lineTo(s[i + 2], s[i + 3]); }
    c.stroke();
    if (v.s >= 5) {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = .35; c.strokeStyle = 'rgba(0,0,0,.75)'; c.fillStyle = '#fff'; c.lineJoin = 'round';
      const { prov } = this.map;
      for (let p = 0; p < prov.length; p++) {
        const pr = prov[p]; if (pr.n < 3) continue;
        c.font = 'bold 1.3px system-ui,sans-serif';
        const t = String(st.tr[p]); c.strokeText(t, pr.cx, pr.cy); c.fillText(t, pr.cx, pr.cy);
        const m = '★'.repeat(st.ci[p]) + '▲'.repeat(st.fo[p]) + (st.pt[p] ? '⚓' + st.fl[p] : '');
        if (m) { c.font = '.85px system-ui'; c.fillText(m, pr.cx, pr.cy + 1.2); }
      }
    }
  }
}
