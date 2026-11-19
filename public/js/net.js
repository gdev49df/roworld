// websocket-клиент с авто-переподключением
const handlers = {};
let ws, session = null, wantOpen = false, retry = 0;
export const on = (t, f) => { handlers[t] = f; };

export function setSession(s) { session = s; s ? localStorage.setItem('game.session', JSON.stringify(s)) : localStorage.removeItem('game.session'); }
export function getSession() { try { return JSON.parse(localStorage.getItem('game.session')); } catch { return null; } }

// query — часть адреса (mode=quick, room=ABCD…), hello — первое сообщение
export function open(query, hello) {
  wantOpen = true;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?${query}`);
  ws.onopen = () => { retry = 0; send(hello); };
  ws.onmessage = e => { const m = JSON.parse(e.data); handlers[m.t] && handlers[m.t](m); };
  ws.onclose = () => {
    if (wantOpen && session) setTimeout(() => open(`room=${session.room}`, { t: 'hello', token: session.token, name: session.name, pid: session.pid }), Math.min(5000, 700 * ++retry));
  };
}
export function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
export function close() { wantOpen = false; setSession(null); ws && ws.close(); }
