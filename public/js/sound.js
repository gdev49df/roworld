// звуки синтезируются на лету (webaudio), файлов не нужно
let ac = null, muted = localStorage.getItem('game.mute') === '1';
const ctx = () => {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
};
function tone(f0, f1, dur, type = 'sine', vol = .06, delay = 0) {
  if (muted) return; const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .03);
}
function noise(dur, vol = .1, lp = 900, delay = 0) {
  if (muted) return; const a = ctx(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + delay;
  f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol; s.buffer = buf;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
export const sfx = {
  click: () => tone(520, 780, .07, 'triangle', .04),
  attack: () => { tone(240, 90, .25, 'sawtooth', .04); noise(.22, .05, 1400); },
  capture: () => { tone(523, 523, .1, 'triangle', .06); tone(659, 659, .1, 'triangle', .06, .09); tone(784, 784, .2, 'triangle', .06, .18); },
  lost: () => { tone(330, 70, .5, 'sawtooth', .05); },
  nuke: () => { noise(1.5, .35, 320); tone(90, 24, 1.3, 'sine', .25); },
  build: () => { tone(420, 640, .1, 'square', .03); tone(640, 960, .12, 'square', .03, .09); },
  ship: () => { noise(.5, .04, 500); tone(180, 260, .4, 'sine', .04); },
  err: () => tone(170, 120, .14, 'square', .03),
  msg: () => tone(900, 900, .06, 'sine', .03),
};
export const isMuted = () => muted;
export function setMuted(v) { muted = v; localStorage.setItem('game.mute', v ? '1' : '0'); }
