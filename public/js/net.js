// websocket-клиент с авто-переподключением
const handlers = {};
let ws, session = null, wantOpen = false, retry = 0;
export const on = (t, f) => { handlers[t] = f; };
export const connectionState = f => { handlers._conn = f; };

export function setSession(s) { session = s; s ? localStorage.setItem('roworld.session', JSON.stringify(s)) : localStorage.removeItem('roworld.session'); }
export function getSession() { try { return JSON.parse(localStorage.getItem('roworld.session')); } catch { return null; } }

export function open(helloMsg) {
  wantOpen = true;
  return new Promise(res => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; send(helloMsg); handlers._conn && handlers._conn(true); res(); };
    ws.onmessage = e => { const m = JSON.parse(e.data); handlers[m.t] && handlers[m.t](m); };
    ws.onclose = () => {
      handlers._conn && handlers._conn(false);
      if (wantOpen && session) setTimeout(() => open({ t: 'hello', room: session.room, token: session.token, name: session.name }), Math.min(5000, 700 * ++retry));
    };
  });
}
export function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
export function close() { wantOpen = false; setSession(null); ws && ws.close(); }
