import * as net from './net.js';
import { Renderer } from './render.js';
import * as ui from './ui.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { rasterLand } from '/shared/maps.js';
import { GAME_NAME, TAGLINE } from '/shared/consts.js';
const { $ } = ui;

document.title = GAME_NAME; $('title').textContent = GAME_NAME.toUpperCase(); $('tagline').textContent = TAGLINE;
let me = -1, nations = [], total = 1, sel = -1, st = null, map = null, limit = 1800, win = .8, pct = 60, curTab = 'rating', boardData = null, pendingName = '', lastGold = 0;
const r = new Renderer($('c'));
const pid = localStorage.getItem('game.pid') || (() => { const v = crypto.randomUUID(); localStorage.setItem('game.pid', v); return v; })();

// фон меню: карта мира
(function bg() {
  const { W, H, land } = rasterLand('world', 1), cv = $('bg'), c = cv.getContext('2d');
  cv.width = W; cv.height = H; c.fillStyle = '#0b2440'; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (land[x][y]) { c.fillStyle = (x * 7 + y * 13) % 5 ? '#b5764a' : '#c88655'; c.fillRect(x, y, 1, 1); }
})();
ui.fillMaps($('optMap')); ui.fillModes($('optMode')); ui.fillMaps($('soloMap')); ui.fillDiffs($('soloDiff')); ui.fillDiffs($('optDiff'));
$('name').value = localStorage.getItem('game.name') || '';
$('muteBtn').textContent = isMuted() ? '🔇' : '🔊';

function connect(query) {
  const name = ($('name').value || 'игрок').trim();
  localStorage.setItem('game.name', name); $('menuErr').textContent = '';
  net.setSession(null); pendingName = name; sfx.click();
  net.open(query, { t: 'hello', name, pid });
}
$('solo').onclick = () => connect(`mode=solo&map=${$('soloMap').value}&diff=${$('soloDiff').value}`);
$('quick').onclick = () => connect('mode=quick');
$('blitz').onclick = () => connect('mode=blitz');
$('daily').onclick = () => connect('mode=daily');
$('create').onclick = () => connect('mode=create');
$('join').onclick = () => { const c = $('code').value.trim(); if (c.length === 4) connect('room=' + c); else $('menuErr').textContent = 'введите 4 буквы кода'; };
$('start').onclick = () => net.send({ t: 'start' });
const sendOpts = () => net.send({ t: 'opts', map: $('optMap').value, mode: $('optMode').value, diff: $('optDiff').value });
$('optMap').onchange = $('optMode').onchange = $('optDiff').onchange = sendOpts;
$('leave').onclick = $('gleave').onclick = () => { net.close(); ui.show('menu'); };
$('again').onclick = () => $('end').classList.remove('show');
$('zin').onclick = () => r.zoom(1.4); $('zout').onclick = () => r.zoom(1 / 1.4);
$('focusBtn').onclick = focusHome;
$('muteBtn').onclick = () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? '🔇' : '🔊'; };
$('techBtn').onclick = () => { $('tech').classList.remove('hidden'); if (st) ui.renderTech(st, w => net.send({ t: 'act', k: 'tech', which: w })); };
$('chatBtn').onclick = () => { $('gameChat').classList.toggle('hidden'); if (!$('gameChat').classList.contains('hidden')) $('gameChat').querySelector('input').focus(); };
$('tutOk').onclick = () => { $('tut').classList.add('hidden'); localStorage.setItem('game.tut', '1'); };
for (const id of ['lobbyChat', 'gameChat']) {
  const inp = $(id).querySelector('input');
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { net.send({ t: 'chat', text: inp.value }); inp.value = ''; } });
}

async function loadBoard() { try { boardData = await (await fetch('/api/leaderboard')).json(); } catch { boardData = { rating: [], daily: [] }; } ui.renderBoard(boardData, curTab); }
$('openBoard').onclick = () => { $('board').classList.remove('hidden'); loadBoard(); };
$('openHelp').onclick = () => $('help').classList.remove('hidden');
document.querySelectorAll('.closeBtn').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hidden'));
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { curTab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); boardData && ui.renderBoard(boardData, curTab); });

function focusHome() {
  if (!st || me < 0) return;
  const cap = st.cap[me]; const mine = cap >= 0 ? cap : st.o.findIndex(o => o === me);
  if (mine >= 0) r.focus(mine, Math.max(r.view.s, 12));
}
function targetsOf(p) {
  if (p < 0 || !st || st.o[p] !== me) return [];
  const pr = map.prov[p], out = [];
  for (const q of pr.nb) if (st.o[q] !== me && !st.al.includes(st.o[q])) out.push(q);
  if (st.pt[p] && st.fl[p] >= 2 && !st.bl[p]) for (const q of pr.sea) if (!pr.nb.includes(q) && st.o[q] !== me && !st.al.includes(st.o[q])) out.push(q);
  return out;
}
function panel() { if (st) ui.renderPanel(st, nations, me, sel, map, act, pct, v => { pct = v; sfx.click(); panel(); }); }
function select(p) {
  if (p === sel) p = -1;
  sel = p; r.sel = p; r.targets = targetsOf(p); r.dirty = true; if (p >= 0) sfx.click(); panel();
}

net.on('joined', m => net.setSession({ room: m.room, token: m.token, name: pendingName || localStorage.getItem('game.name'), pid }));
net.on('err', m => { $('menuErr').textContent = m.text; ui.feed(m.text, 'warn'); if (!$('menu').classList.contains('hidden') || m.text.includes('не найдена')) { net.close(); ui.show('menu'); } });
net.on('lobby', m => { ui.show('lobby'); ui.renderLobby(m); $('end').classList.remove('show'); });
net.on('init', m => {
  me = m.me; nations = m.nations; map = m.map; total = map.total; limit = m.limit; win = m.win; sel = -1; st = null; pct = 60; lastGold = 0;
  ui.show('game'); r.setMap(map, nations); r.resize(); r.fit();
  if (!localStorage.getItem('game.tut')) $('tut').classList.remove('hidden');
  $('end').classList.remove('show'); first = true;
});
let first = true;
net.on('state', s => {
  st = s; r.setState(s); r.targets = targetsOf(sel);
  ui.renderTop(s, me, total, limit, win); ui.renderList(s, nations, me, total); panel();
  if (!$('tech').classList.contains('hidden')) ui.renderTech(s, w => net.send({ t: 'act', k: 'tech', which: w }));
  $('techBtn').classList.toggle('pulse', s.gold >= 100 && s.tech && (s.tech.eco + s.tech.atk + s.tech.def) < 9 && s.gold >= [100, 200, 350][Math.min(...['eco', 'atk', 'def'].map(k => s.tech[k]))]);
  if (first) { first = false; const cap = s.cap[me]; if (cap >= 0) r.focus(cap, Math.min(14, r.view.s * 3), true); }
});
net.on('ev', m => {
  if (m.kind && m.kind.startsWith('invite:')) { const from = +m.kind.split(':')[1]; ui.invite(m.text, yes => net.send({ t: 'act', k: 'reply', from, yes })); sfx.msg(); }
  else { ui.feed(m.text, m.kind); if (m.kind === 'good') sfx.capture(); else if (m.kind === 'bad') sfx.lost(); else if (m.kind === 'warn') sfx.err(); }
});
net.on('fx', m => {
  r.addFx(m.list, me);
  for (const e of m.list) { if (e.k === 'nuke') sfx.nuke(); else if (e.k === 'atk' && e.n === me) (e.from.some(f => f[1]) ? sfx.ship : sfx.attack)(); }
});
net.on('chat', m => { ui.chatLine(m.from, m.text); sfx.msg(); if (!$('game').classList.contains('hidden')) ui.feed(`${m.from}: ${m.text}`, 'chatmsg'); });
net.on('end', m => ui.renderEnd(m, me));

r.onPick = select;
function act(k) {
  if (sel < 0) return;
  net.send({ t: 'act', k, p: sel, pct });
  if (['city', 'fort', 'draft', 'port'].includes(k)) sfx.build(); else if (k === 'ship') sfx.ship();
}
// горячие клавиши
addEventListener('keydown', e => {
  if ($('game').classList.contains('hidden') || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { select(-1); $('tech').classList.add('hidden'); }
  else if (k === ' ') { e.preventDefault(); focusHome(); }
  else if (k === 't') $('techBtn').click();
  else if (k === 'm') $('muteBtn').click();
  else if (k === '+' || k === '=') r.zoom(1.3); else if (k === '-') r.zoom(1 / 1.3);
  else if (sel >= 0) { const map2 = { a: 'attack', c: 'city', f: 'fort', d: 'draft', p: 'port', s: 'ship', b: 'blockade', g: 'gift', n: 'nuke' }; if (map2[k]) { const btn = document.querySelector(`#panel button[data-k="${map2[k]}"]`); if (btn && !btn.disabled) btn.click(); } }
});
addEventListener('resize', () => { if (r.map) r.resize(); });
new ResizeObserver(() => { if (r.map) r.resize(); }).observe($('wrap'));
(function loop(now) { r.draw(now); requestAnimationFrame(loop); })(0);

const s = net.getSession();
if (s) { pendingName = s.name; net.open('room=' + s.room, { t: 'hello', token: s.token, name: s.name, pid: s.pid || pid }); }
