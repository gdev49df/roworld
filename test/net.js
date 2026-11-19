// интеграционная проверка: два клиента → комната → старт → атака → состояние тикает
import WebSocket from 'ws';
const URL = 'ws://localhost:' + (process.env.PORT || 3000) + '/ws';
const mk = name => new Promise(res => { const ws = new WebSocket(URL); ws.msgs = []; ws.on('message', d => { const m = JSON.parse(d); ws.msgs.push(m); ws.emit('m', m); }); ws.on('open', () => res(ws)); });
const wait = (ws, t) => new Promise(res => { const f = ws.msgs.find(m => m.t === t); if (f) return res(f); const h = m => { if (m.t === t) { ws.off('m', h); res(m); } }; ws.on('m', h); });
const a = await mk(), b = await mk();
a.send(JSON.stringify({ t: 'hello', mode: 'create', name: 'A' }));
const j = await wait(a, 'joined');
b.send(JSON.stringify({ t: 'hello', room: j.room, name: 'B' }));
await wait(b, 'lobby'); await new Promise(r => setTimeout(r, 200));
a.send(JSON.stringify({ t: 'start' }));
const ia = await wait(a, 'init'), ib = await wait(b, 'init');
console.log('me', ia.me, ib.me, 'prov', ia.map.prov.length, 'pidlen', ia.map.pid.length);
const s0 = await wait(a, 'state');
const mine = s0.o.map((o, i) => o === ia.me ? i : -1).filter(i => i >= 0);
a.send(JSON.stringify({ t: 'act', k: 'draft', p: mine[0] }));
await new Promise(r => setTimeout(r, 2500));
const last = a.msgs.filter(m => m.t === 'state').pop();
console.log('ticks', last.k, 'gold', last.gold, 'troops of mine', last.tr[mine[0]], 'allies', last.al);
// союз игроков
const bp = s0.o.map((o, i) => o === ib.me ? i : -1).find(i => i >= 0);
a.send(JSON.stringify({ t: 'act', k: 'ally', p: bp }));
const inv = await new Promise(res => b.on('m', m => m.t === 'ev' && m.kind?.startsWith('invite') && res(m)));
b.send(JSON.stringify({ t: 'act', k: 'reply', from: ia.me, yes: true }));
await new Promise(r => setTimeout(r, 300));
console.log('invite ok:', inv.text, '| allied:', b.msgs.filter(m => m.t === 'state').pop().al.includes(ia.me));
process.exit(0);
