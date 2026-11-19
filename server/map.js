import { rng } from './rng.js';
import { W, H, NP } from '../shared/consts.js';

// генерация карты: острова из «пятен» + провинции по ближайшему семени
export function generateMap(seed) {
  const r = rng(seed);
  const land = [], pid = [];
  const bl = [];
  for (let i = 0; i < 8; i++) bl.push({ x: r() * W, y: r() * H, r: 9 + r() * 12 });
  const cells = [];
  for (let x = 0; x < W; x++) {
    land[x] = []; pid[x] = [];
    for (let y = 0; y < H; y++) {
      let m = 9;
      for (const b of bl) m = Math.min(m, Math.hypot(x - b.x, (y - b.y) * 1.1) / b.r);
      const n = (Math.sin(x * .55 + 1) + Math.cos(y * .7) + Math.sin((x + y) * .35)) * .07;
      land[x][y] = m + n < .85; pid[x][y] = -1;
      if (land[x][y]) cells.push([x, y]);
    }
  }
  const seeds = [];
  for (let i = 0; i < NP; i++) seeds.push(cells[Math.floor(r() * cells.length)]);
  const raw = seeds.map(() => []);
  for (const [x, y] of cells) {
    let b = 0, bd = 1e9;
    for (let i = 0; i < NP; i++) { const d = (x - seeds[i][0]) ** 2 + (y - seeds[i][1]) ** 2; if (d < bd) { bd = d; b = i; } }
    raw[b].push([x, y]);
  }
  const P = [];
  for (const c of raw) {
    if (!c.length) continue;
    const p = { id: P.length, cells: c, cx: 0, cy: 0, nb: new Set(), sea: new Set(), coast: [] };
    for (const [x, y] of c) { pid[x][y] = p.id; p.cx += x; p.cy += y; }
    p.cx = p.cx / c.length + .5; p.cy = p.cy / c.length + .5;
    P.push(p);
  }
  const isL = (x, y) => x >= 0 && y >= 0 && x < W && y < H && land[x][y];
  for (const p of P) for (const [x, y] of p.cells) {
    if (!isL(x + 1, y) || !isL(x - 1, y) || !isL(x, y + 1) || !isL(x, y - 1)) p.coast.push([x, y]);
    if (isL(x + 1, y) && pid[x + 1][y] !== p.id) { p.nb.add(pid[x + 1][y]); P[pid[x + 1][y]].nb.add(p.id); }
    if (isL(x, y + 1) && pid[x][y + 1] !== p.id) { p.nb.add(pid[x][y + 1]); P[pid[x][y + 1]].nb.add(p.id); }
  }
  // морские связи — пока карта не станет связной
  const sample = P.map(p => p.coast.filter((_, i) => i % Math.max(1, Math.floor(p.coast.length / 12)) === 0));
  const comps = () => {
    const seen = new Set(); let c = 0;
    for (const p of P) {
      if (seen.has(p.id)) continue; c++;
      const st = [p.id]; seen.add(p.id);
      while (st.length) { const q = P[st.pop()]; for (const i of [...q.nb, ...q.sea]) if (!seen.has(i)) { seen.add(i); st.push(i); } }
    }
    return c;
  };
  let th = 6;
  for (let it = 0; it < 14; it++) {
    for (const p of P) p.sea.clear();
    for (const a of P) for (const b of P) {
      if (a.id >= b.id || a.nb.has(b.id) || !sample[a.id].length || !sample[b.id].length) continue;
      let ok = false;
      for (const s of sample[a.id]) { for (const t of sample[b.id]) if ((s[0] - t[0]) ** 2 + (s[1] - t[1]) ** 2 < th * th) { ok = true; break; } if (ok) break; }
      if (ok) { a.sea.add(b.id); b.sea.add(a.id); }
    }
    if (comps() === 1) break;
    th += 4;
  }
  for (const p of P) { p.nb = [...p.nb]; p.sea = [...p.sea]; }
  return { P, pid, totalLand: cells.length };
}
