// генерируемые флаги наций (разные узоры по номеру нации, цвета по оттенку)
const cache = new Map();
export function flag(n, w = 30, h = 20) {
  const key = n.id + ':' + w; if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  const a = `hsl(${n.hue},70%,50%)`, b = `hsl(${(n.hue + 150) % 360},60%,92%)`, d = `hsl(${(n.hue + 210) % 360},70%,32%)`;
  const kind = n.id % 7;
  c.fillStyle = a; c.fillRect(0, 0, w, h);
  c.fillStyle = b;
  if (kind === 0) { c.fillRect(0, h / 3, w, h / 3); }
  else if (kind === 1) { c.fillRect(w / 3, 0, w / 3, h); }
  else if (kind === 2) { c.fillRect(0, h * .4, w, h * .2); c.fillRect(w * .3, 0, w * .15, h); }
  else if (kind === 3) { c.beginPath(); c.arc(w / 2, h / 2, h * .3, 0, 7); c.fill(); }
  else if (kind === 4) { c.beginPath(); c.moveTo(0, 0); c.lineTo(w * .5, h / 2); c.lineTo(0, h); c.fill(); c.fillStyle = d; c.fillRect(w * .5, 0, w * .5, h / 2); }
  else if (kind === 5) { c.fillStyle = d; c.fillRect(0, 0, w, h / 2); c.fillStyle = b; c.fillRect(0, h * .45, w, h * .1); }
  else { c.beginPath(); c.moveTo(0, h); c.lineTo(w, 0); c.lineTo(w, h); c.fill(); }
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.strokeRect(.5, .5, w - 1, h - 1);
  cache.set(key, cv); return cv;
}
export const flagUrl = n => flag(n).toDataURL();
