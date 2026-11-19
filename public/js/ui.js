import { COST, TYPE_RU, MAPS, MODES } from '/shared/consts.js';

export const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function show(screen) {
  for (const s of ['menu', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== screen);
  $('bg').classList.toggle('hidden', screen === 'game'); $('shade').classList.toggle('hidden', screen === 'game');
}

export function fillSelect(el, obj, skip) {
  el.innerHTML = Object.entries(obj).filter(([k]) => k !== skip).map(([k, v]) => `<option value="${k}">${esc(typeof v === 'string' ? v : v.name)}</option>`).join('');
}
export const fillMaps = el => fillSelect(el, MAPS);
export const fillModes = el => fillSelect(el, MODES, 'daily');

export function renderLobby(m) {
  $('lobbyCode').textContent = m.code;
  $('lobbyInfo').textContent = m.daily ? 'ежедневный турнир' : m.pub ? 'публичная комната' + (m.startsIn != null ? ` · старт через ${m.startsIn} с` : '') : (m.startsIn != null ? `старт через ${m.startsIn} с` : 'отправьте код друзьям');
  $('lobbyPlayers').innerHTML = m.players.map(p => `<li class="${p.online ? '' : 'off'}"><span>${esc(p.name)}</span><span>${p.host ? '👑' : ''}</span></li>`).join('');
  const canEdit = m.me && !m.pub && !m.daily;
  $('lobbyOpts').classList.toggle('hidden', m.pub && !m.daily ? false : false);
  $('optMap').value = m.map; $('optMode').value = m.mode === 'daily' ? 'classic' : m.mode;
  $('optMap').disabled = !canEdit; $('optMode').disabled = !canEdit;
  $('lobbyOpts').style.opacity = canEdit ? 1 : .6;
  $('start').classList.toggle('hidden', !m.me || m.daily);
}

export function renderTop(st, me, total, limit) {
  const sc = st.cnt[me];
  $('gold').textContent = st.gold;
  $('share').textContent = (sc / total * 100).toFixed(1) + '%';
  const left = Math.max(0, limit - st.k), mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  $('time').textContent = `${mm}:${ss}`;
}

export function renderList(st, nations, me, total) {
  const myTeam = nations[me].team;
  const rows = nations.filter(n => st.alive[n.id]).sort((a, b) => st.cnt[b.id] - st.cnt[a.id]).slice(0, 8);
  $('list').innerHTML = rows.map(n => `<div class="${n.id === me ? 'me' : ''}"><i style="background:hsl(${n.hue},68%,52%)"></i><span>${esc(n.name)}${st.al.includes(n.id) ? ' 🤝' : ''}${myTeam >= 0 && n.team === myTeam && n.id !== me ? ' 🛡' : ''}${st.en.includes(n.id) ? ' ⚔' : ''}${n.human && !st.on[n.id] ? ' 💤' : ''}</span><span>${(st.cnt[n.id] / total * 100).toFixed(0)}%</span></div>`).join('');
}

export function renderPanel(st, nations, me, sel, map, act) {
  const el = $('panel');
  if (sel < 0) { el.innerHTML = '<span class="hint">нажмите на провинцию. чтобы захватить территорию — выберите чужую рядом с вашей и нажмите «атаковать». для моря нужны ⚓ порт и флот</span>'; return; }
  const o = st.o[sel], n = o >= 0 ? nations[o] : null, mine = o === me, gold = st.gold, coast = map.prov[sel].coast;
  const title = mine ? 'ваша провинция' : n ? `${esc(n.name)} (${TYPE_RU[n.type] || ''})` : 'племя (нейтральная)';
  let h = `<b>${title}</b> · войска ${st.tr[sel]} · город ${st.ci[sel]}/3 · форт ${st.fo[sel]}/3${st.pt[sel] ? ` · ⚓ флот ${st.fl[sel]}` : ''}${st.bl[sel] ? ' · 🌊 блокада' : ''}<div class="row">`;
  const b = (k, label, dis) => `<button data-k="${k}" ${dis ? 'disabled' : ''}>${label}</button>`;
  if (mine) {
    h += b('city', `🏙 город −${COST.city}`, st.ci[sel] >= 3 || gold < COST.city) + b('fort', `🛡 форт −${COST.fort}`, st.fo[sel] >= 3 || gold < COST.fort) + b('draft', `⚔ призыв +20 −${COST.draft}`, gold < COST.draft);
    if (coast && !st.pt[sel]) h += b('port', `⚓ порт −${COST.port}`, gold < COST.port);
    if (st.pt[sel]) h += b('ship', `🚢 флот +5 −${COST.ship}`, st.fl[sel] >= 40 || gold < COST.ship);
  } else {
    const al = n && st.al.includes(n.id), mate = n && nations[me].team >= 0 && n.team === nations[me].team;
    h += b('attack', '⚔ атаковать', al || mate);
    if (n && st.pt[sel] && !al) h += b('blockade', '🌊 блокада', false);
    if (n) h += al ? b('break', '💔 разорвать союз', mate) : b('ally', '🤝 союз');
    if (n) h += b('gift', `💸 дар −${COST.gift}`, gold < COST.gift);
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

export function invite(text, reply) {
  const d = document.createElement('div');
  d.innerHTML = `<span>${esc(text)}</span><button>принять</button><button>отказ</button>`;
  const [y, n] = d.querySelectorAll('button');
  y.onclick = () => { reply(true); d.remove(); }; n.onclick = () => { reply(false); d.remove(); };
  $('invites').appendChild(d); setTimeout(() => d.remove(), 30000);
}

export function chatLine(from, text) {
  for (const id of ['lobbyChat', 'gameChat']) {
    const log = $(id).querySelector('.log'), d = document.createElement('div');
    d.innerHTML = `<b>${esc(from)}:</b> ${esc(text)}`; log.appendChild(d);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
}

export function renderEnd(m, me) {
  $('endtxt').textContent = (m.winner === me ? '🏆 победа! ' : '') + m.text;
  const rows = m.results.map(r => `<tr class="${r.me ? 'me' : ''}"><td>#${r.rank}</td><td>${esc(r.name)}</td><td>${r.share}%</td><td>${m.daily ? r.score + ' очк.' : (r.delta > 0 ? '+' : '') + r.delta + ' рейтинга'}</td></tr>`);
  $('endtbl').innerHTML = rows.join('');
  $('end').classList.add('show');
}

export function renderBoard(data, tab) {
  const rows = tab === 'rating'
    ? data.rating.map(p => `<li>${esc(p.name)} <span>${p.rating} · ${p.wins}/${p.games}</span></li>`)
    : data.daily.map(p => `<li>${esc(p.name)} <span>${p.score}</span></li>`);
  $('boardList').innerHTML = rows.join('') || `<li style="list-style:none;color:#8fa5bf">${data.nodb ? 'рейтинг не подключён (нужна база d1)' : 'пока пусто — сыграйте первым'}</li>`;
}
