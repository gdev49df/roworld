import { COST, TYPE_RU, TIME_LIMIT } from '/shared/consts.js';

const $ = id => document.getElementById(id);
export { $ };

export function show(screen) {
  for (const s of ['menu', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== screen);
}

export function renderLobby(m) {
  $('lobbyCode').textContent = m.code;
  $('lobbyInfo').textContent = m.pub ? (m.startsIn != null ? `публичная комната · старт через ${m.startsIn} с` : 'публичная комната') : 'отправьте код друзьям';
  $('lobbyPlayers').innerHTML = m.players.map(p => `<li class="${p.online ? '' : 'off'}"><span>${esc(p.name)}</span><span>${p.host ? '👑' : ''}</span></li>`).join('');
  $('start').classList.toggle('hidden', !m.me);
}

export function renderTop(st, me, total) {
  $('gold').textContent = st.gold;
  $('share').textContent = (st.cnt[me] / total * 100).toFixed(1) + '%';
  const left = Math.max(0, TIME_LIMIT - st.k), mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  $('time').textContent = `${mm}:${ss}`;
}

export function renderList(st, nations, me, total) {
  const rows = nations.filter(n => st.alive[n.id]).sort((a, b) => st.cnt[b.id] - st.cnt[a.id]).slice(0, 8);
  $('list').innerHTML = rows.map(n => `<div class="${n.id === me ? 'me' : ''}"><i style="background:hsl(${n.hue},68%,52%)"></i><span>${esc(n.name)}${st.al.includes(n.id) ? ' 🤝' : ''}${n.human && !st.on[n.id] ? ' 💤' : ''}</span><span>${(st.cnt[n.id] / total * 100).toFixed(0)}%</span></div>`).join('');
}

export function renderPanel(st, nations, me, sel, mapProv, act) {
  const el = $('panel');
  if (sel < 0) { el.innerHTML = '<span class="hint">нажмите на провинцию. чтобы захватить территорию — выберите чужую провинцию рядом с вашей и нажмите «атаковать». колесо/щипок — масштаб</span>'; return; }
  const o = st.o[sel], n = o >= 0 ? nations[o] : null, mine = o === me, gold = st.gold;
  const title = mine ? 'ваша провинция' : n ? `${esc(n.name)} (${TYPE_RU[n.type] || ''})` : 'племя (нейтральная)';
  let h = `<b>${title}</b> · войска ${st.tr[sel]} · город ${st.ci[sel]}/3 · форт ${st.fo[sel]}/3<div class="row">`;
  const b = (k, label, dis) => `<button data-k="${k}" ${dis ? 'disabled' : ''}>${label}</button>`;
  if (mine) h += b('city', `🏙 город −${COST.city}`, st.ci[sel] >= 3 || gold < COST.city) + b('fort', `🛡 форт −${COST.fort}`, st.fo[sel] >= 3 || gold < COST.fort) + b('draft', `⚔ призыв +20 −${COST.draft}`, gold < COST.draft);
  else {
    const al = n && st.al.includes(n.id);
    h += b('attack', '⚔ атаковать', al);
    if (n) h += al ? b('break', '💔 разорвать союз') : b('ally', '🤝 союз');
    h += b('nuke', `☢ бомба −${COST.nuke}`, gold < COST.nuke);
  }
  el.innerHTML = h + '</div>';
  el.querySelectorAll('button[data-k]').forEach(btn => btn.onclick = () => act(btn.dataset.k));
}

export function feed(text, kind) {
  const d = document.createElement('div'); d.textContent = text; if (kind) d.className = kind;
  const f = $('feed'); f.appendChild(d); while (f.children.length > 5) f.firstChild.remove();
  setTimeout(() => d.remove(), 6000);
}

export function invite(fromId, text, reply) {
  const d = document.createElement('div');
  d.innerHTML = `<span>${esc(text)}</span><button>принять</button><button>отказ</button>`;
  const [y, n] = d.querySelectorAll('button');
  y.onclick = () => { reply(true); d.remove(); }; n.onclick = () => { reply(false); d.remove(); };
  $('invites').appendChild(d); setTimeout(() => d.remove(), 30000);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
