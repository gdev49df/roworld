import * as net from './net.js';
import { Renderer } from './render.js';
import * as ui from './ui.js';
const { $ } = ui;

let me = -1, nations = [], total = 1, sel = -1, st = null;
const r = new Renderer($('c'));

function startNet(hello) {
  hello.name = ($('name').value || localStorage.getItem('roworld.name') || 'игрок').trim();
  localStorage.setItem('roworld.name', hello.name);
  $('menuErr').textContent = '';
  net.open(hello);
}
$('name').value = localStorage.getItem('roworld.name') || '';
$('quick').onclick = () => startNet({ t: 'hello', mode: 'quick' });
$('create').onclick = () => startNet({ t: 'hello', mode: 'create' });
$('join').onclick = () => { const c = $('code').value.trim(); if (c.length === 4) startNet({ t: 'hello', room: c }); else $('menuErr').textContent = 'введите 4 буквы кода'; };
$('start').onclick = () => net.send({ t: 'start' });
$('leave').onclick = $('gleave').onclick = () => { net.close(); ui.show('menu'); };
$('again').onclick = () => $('end').classList.remove('show');
$('zin').onclick = () => r.zoom(1.4); $('zout').onclick = () => r.zoom(1 / 1.4);

net.on('joined', m => { net.setSession({ room: m.room, token: m.token, name: $('name').value || localStorage.getItem('roworld.name') }); });
net.on('err', m => { $('menuErr').textContent = m.text; if (!$('menu').classList.contains('hidden')) net.close(); else ui.feed(m.text, 'warn'); const s = net.getSession(); if (m.text.includes('не найдена')) net.setSession(null); });
net.on('lobby', m => { ui.show('lobby'); ui.renderLobby(m); $('end').classList.remove('show'); });
net.on('init', m => {
  me = m.me; nations = m.nations; total = m.map.total; sel = -1; st = null;
  ui.show('game'); r.setMap(m.map, nations); r.resize(); r.fit();
});
net.on('state', s => {
  st = s; r.setState(s); r.sel = sel;
  ui.renderTop(s, me, total); ui.renderList(s, nations, me, total); ui.renderPanel(s, nations, me, sel, null, act);
});
net.on('ev', m => {
  if (m.kind && m.kind.startsWith('invite:')) {
    const from = +m.kind.split(':')[1];
    ui.invite(from, m.text, yes => net.send({ t: 'act', k: 'reply', from, yes }));
  } else ui.feed(m.text, m.kind);
});
net.on('end', m => { $('endtxt').textContent = (m.winner === me ? '🏆 победа! ' : '') + m.text; $('end').classList.add('show'); });

r.onPick = p => { sel = p; r.sel = p; r.dirty = true; if (st) ui.renderPanel(st, nations, me, sel, null, act); };
function act(k) { if (sel >= 0) net.send({ t: 'act', k, p: sel }); }

addEventListener('resize', () => { if (r.map) { r.resize(); } });
(function loop() { r.draw(); requestAnimationFrame(loop); })();

// автоматический вход после перезагрузки страницы
const s = net.getSession();
if (s) net.open({ t: 'hello', room: s.room, token: s.token, name: s.name });
