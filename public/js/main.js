import * as net from './net.js';
import { Renderer } from './render.js';
import * as ui from './ui.js';
import { rasterLand } from '/shared/maps.js';
import { GAME_NAME, TAGLINE } from '/shared/consts.js';
const { $ } = ui;

document.title = GAME_NAME; $('title').textContent = GAME_NAME.toUpperCase(); $('tagline').textContent = TAGLINE;
let me = -1, nations = [], total = 1, sel = -1, st = null, map = null, limit = 1800, curTab = 'rating', boardData = null;
const r = new Renderer($('c'));
const pid = localStorage.getItem('game.pid') || (() => { const v = crypto.randomUUID(); localStorage.setItem('game.pid', v); return v; })();

// фон меню: карта мира из того же растеризатора
(function bg() {
  const { W, H, land } = rasterLand('world', 1), cv = $('bg'), c = cv.getContext('2d');
  cv.width = W; cv.height = H;
  c.fillStyle = '#0b2440'; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (land[x][y]) { c.fillStyle = (x * 7 + y * 13) % 5 ? '#b5764a' : '#c88655'; c.fillRect(x, y, 1, 1); }
})();
ui.fillMaps($('optMap')); ui.fillModes($('optMode')); ui.fillMaps($('soloMap'));
$('name').value = localStorage.getItem('game.name') || '';

function connect(query) {
  const name = ($('name').value || 'игрок').trim();
  localStorage.setItem('game.name', name); $('menuErr').textContent = '';
  net.setSession(null); pendingName = name;
  net.open(query, { t: 'hello', name, pid });
}
let pendingName = '';
$('solo').onclick = () => connect('mode=solo&map=' + $('soloMap').value);
$('quick').onclick = () => connect('mode=quick');
$('blitz').onclick = () => connect('mode=blitz');
$('daily').onclick = () => connect('mode=daily');
$('create').onclick = () => connect('mode=create');
$('join').onclick = () => { const c = $('code').value.trim(); if (c.length === 4) connect('room=' + c); else $('menuErr').textContent = 'введите 4 буквы кода'; };
$('start').onclick = () => net.send({ t: 'start' });
$('optMap').onchange = $('optMode').onchange = () => net.send({ t: 'opts', map: $('optMap').value, mode: $('optMode').value });
$('leave').onclick = $('gleave').onclick = () => { net.close(); ui.show('menu'); };
$('again').onclick = () => $('end').classList.remove('show');
$('zin').onclick = () => r.zoom(1.4); $('zout').onclick = () => r.zoom(1 / 1.4);
$('chatBtn').onclick = () => { $('gameChat').classList.toggle('hidden'); if (!$('gameChat').classList.contains('hidden')) $('gameChat').querySelector('input').focus(); };
for (const id of ['lobbyChat', 'gameChat']) {
  const inp = $(id).querySelector('input');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { net.send({ t: 'chat', text: inp.value }); inp.value = ''; } });
}

// рейтинг и помощь
async function loadBoard() { try { boardData = await (await fetch('/api/leaderboard')).json(); } catch { boardData = { rating: [], daily: [] }; } ui.renderBoard(boardData, curTab); }
$('openBoard').onclick = () => { $('board').classList.remove('hidden'); loadBoard(); };
$('openHelp').onclick = () => $('help').classList.remove('hidden');
document.querySelectorAll('.closeBtn').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hidden'));
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { curTab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); boardData && ui.renderBoard(boardData, curTab); });

net.on('joined', m => net.setSession({ room: m.room, token: m.token, name: pendingName || localStorage.getItem('game.name'), pid }));
net.on('err', m => { $('menuErr').textContent = m.text; ui.feed(m.text, 'warn'); if (!$('menu').classList.contains('hidden') || m.text.includes('не найдена')) { net.close(); ui.show('menu'); } });
net.on('lobby', m => { ui.show('lobby'); ui.renderLobby(m); $('end').classList.remove('show'); });
net.on('init', m => {
  me = m.me; nations = m.nations; map = m.map; total = map.total; limit = m.limit; sel = -1; st = null;
  ui.show('game'); r.setMap(map, nations); r.resize(); r.fit();
});
net.on('state', s => {
  st = s; r.setState(s); r.sel = sel;
  ui.renderTop(s, me, total, limit); ui.renderList(s, nations, me, total); ui.renderPanel(s, nations, me, sel, map, act);
});
net.on('ev', m => {
  if (m.kind && m.kind.startsWith('invite:')) { const from = +m.kind.split(':')[1]; ui.invite(m.text, yes => net.send({ t: 'act', k: 'reply', from, yes })); }
  else ui.feed(m.text, m.kind);
});
net.on('chat', m => { ui.chatLine(m.from, m.text); if (!$('game').classList.contains('hidden')) ui.feed(`${m.from}: ${m.text}`, 'chatmsg'); });
net.on('end', m => ui.renderEnd(m, me));

r.onPick = p => { sel = p; r.sel = p; r.dirty = true; if (st) ui.renderPanel(st, nations, me, sel, map, act); };
function act(k) { if (sel >= 0) net.send({ t: 'act', k, p: sel }); }

addEventListener('resize', () => { if (r.map) { r.resize(); } });
(function loop() { r.draw(); requestAnimationFrame(loop); })();

// автоматический вход после перезагрузки страницы
const s = net.getSession();
if (s) { pendingName = s.name; net.open('room=' + s.room, { t: 'hello', token: s.token, name: s.name, pid: s.pid || pid }); }
