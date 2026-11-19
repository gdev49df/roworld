import { COST, TYPE_RU, MAPS, MODES, DIFFS, TECH_COST, TECH_NAME } from '/shared/consts.js';
import { flagUrl } from './flags.js';

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
export const fillDiffs = el => { fillSelect(el, DIFFS); el.value = 'normal'; };

export function renderLobby(m) {
  $('lobbyCode').textContent = m.code;
  $('lobbyInfo').textContent = m.daily ? 'ежедневный турнир' : m.pub ? 'публичная комната' + (m.startsIn != null ? ` · старт через ${m.startsIn} с` : '') : (m.startsIn != null ? `старт через ${m.startsIn} с` : 'отправьте код друзьям');
  $('lobbyPlayers').innerHTML = m.players.map(p => `<li class="${p.online ? '' : 'off'}"><span>${esc(p.name)}</span><span>${p.host ? '👑' : ''}</span></li>`).join('');
  const canEdit = m.me && !m.pub && !m.daily;
  $('optMap').value = m.map; $('optMode').value = m.mode === 'daily' ? 'classic' : m.mode; $('optDiff').value = m.diff || 'normal';
  for (const id of ['optMap', 'optMode', 'optDiff']) $(id).disabled = !canEdit;
  $('lobbyOpts').style.opacity = canEdit ? 1 : .6;
  $('start').classList.toggle('hidden', !m.me || m.daily);
}

export function renderTop(st, me, total, limit, win) {
  const share = st.cnt[me] / total;
  $('gold').textContent = st.gold;
  $('share').textContent = (share * 100).toFixed(1) + '%';
  $('goalBar').style.width = Math.min(100, share / win * 100) + '%';
  $('goalMark').title = `цель: ${Math.round(win * 100)}%`;
  const left = Math.max(0, limit - st.k);
  $('time').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  $('time').parentElement.classList.toggle('warn', left < 60);
}

export function renderList(st, nations, me, total) {
  const myTeam = nations[me].team;
  const rows = nations.filter(n => st.alive[n.id]).sort((a, b) => st.cnt[b.id] - st.cnt[a.id]).slice(0, 8);
  $('list').innerHTML = rows.map(n => `<div class="${n.id === me ? 'me' : ''}"><img src="${flagUrl(n)}" width="18" height="12"><span>${esc(n.name)}${st.al.includes(n.id) ? ' 🤝' : ''}${myTeam >= 0 && n.team === myTeam && n.id !== me ? ' 🛡' : ''}${st.en.includes(n.id) ? ' ⚔' : ''}${n.human && !st.on[n.id] ? ' 💤' : ''}</span><span>${(st.cnt[n.id] / total * 100).toFixed(0)}%</span></div>`).join('');
}

// оценка силы атаки по тем же правилам, что на сервере (защита врага без учёта его технологий)
export function attackInfo(st, map, me, t, frac) {
  const pr = map.prov[t]; let tot = 0, srcs = 0;
  const add = (i, sea) => {
    if (st.o[i] !== me || st.tr[i] <= 3) return;
    if (sea && !(st.pt[i] && st.fl[i] >= 2 && !st.bl[i])) return;
    let s = Math.floor(st.tr[i] * frac); if (sea) s = Math.min(s, st.fl[i] * 6);
    tot += s; srcs++;
  };
  pr.nb.forEach(i => add(i, false)); pr.sea.forEach(i => { if (!pr.nb.includes(i)) add(i, true); });
  tot = Math.floor(tot * (1 + .15 * ((st.tech && st.tech.atk) || 0)));
  const def = Math.floor(st.tr[t] * (1 + .5 * st.fo[t]));
  return { tot, def, srcs };
}

export function renderPanel(st, nations, me, sel, map, act, pct, setPct) {
  const el = $('panel');
  if (sel < 0) { el.innerHTML = '<div class="hint">нажмите на провинцию. свои выделены цветом. чтобы захватить территорию — выберите чужую рядом с вашей и нажмите «атаковать»</div>'; return; }
  const o = st.o[sel], n = o >= 0 ? nations[o] : null, mine = o === me, gold = st.gold, coast = map.prov[sel].coast;
  const mate = n && nations[me].team >= 0 && n.team === nations[me].team, al = n && st.al.includes(n.id);
  const title = mine ? 'ваша провинция' : n ? `${esc(n.name)} <small>${TYPE_RU[n.type] || ''}</small>` : 'племя <small>нейтральная</small>';
  const chips = `<span class="chip">⚔ ${st.tr[sel]}</span><span class="chip">🏙 ${st.ci[sel]}/3</span><span class="chip">🛡 ${st.fo[sel]}/3</span>${st.pt[sel] ? `<span class="chip">⚓ ${st.fl[sel]}</span>` : ''}${st.bl[sel] ? '<span class="chip bad">🌊 блокада</span>' : ''}${n && st.cap[n.id] === sel ? '<span class="chip gold">★ столица</span>' : ''}`;
  let h = `<div class="phead">${n ? `<img src="${flagUrl(n)}" width="26" height="17">` : '<span class="nf"></span>'}<b>${title}</b></div><div class="chips">${chips}</div>`;
  const b = (k, ico, label, sub, dis, why) => `<button class="act" data-k="${k}" ${dis ? 'disabled' : ''} title="${dis && why ? why : ''}"><i>${ico}</i><span>${label}</span><small>${sub}</small></button>`;
  if (mine) {
    h += '<div class="acts">' + b('city', '🏙', 'город', `−${COST.city} · +золото`, st.ci[sel] >= 3 || gold < COST.city, st.ci[sel] >= 3 ? 'максимум' : 'не хватает золота')
      + b('fort', '🛡', 'форт', `−${COST.fort} · защита`, st.fo[sel] >= 3 || gold < COST.fort, st.fo[sel] >= 3 ? 'максимум' : 'не хватает золота')
      + b('draft', '⚔', 'призыв', `−${COST.draft} · +20`, gold < COST.draft, 'не хватает золота');
    if (coast && !st.pt[sel]) h += b('port', '⚓', 'порт', `−${COST.port} · море`, gold < COST.port, 'не хватает золота');
    if (st.pt[sel]) h += b('ship', '🚢', 'флот', `−${COST.ship} · +5`, st.fl[sel] >= 40 || gold < COST.ship, 'максимум или нет золота');
    h += '</div>';
  } else {
    const info = attackInfo(st, map, me, sel, pct / 100);
    const ratio = info.def === 0 ? 9 : info.tot / info.def, verdict = !info.srcs ? ['нет доступа', 'bad'] : ratio >= 1.5 ? ['победа вероятна', 'good'] : ratio >= 1 ? ['шансы равные', 'mid'] : ['слабовато', 'bad'];
    h += `<div class="pv"><div class="pvbar"><i class="a" style="width:${Math.min(100, info.tot / Math.max(1, info.tot + info.def) * 100)}%"></i></div><span>вы <b>${info.tot}</b> против <b>${info.def}</b> <em class="${verdict[1]}">${verdict[0]}</em></span></div>`;
    h += `<div class="pct">${[30, 60, 100].map(v => `<button data-pct="${v}" class="${pct === v ? 'on' : ''}">${v}%</button>`).join('')}<small>доля войск в атаку</small></div>`;
    h += '<div class="acts">' + b('attack', '⚔', 'атаковать', info.srcs ? `${info.srcs} отряд.` : 'нет доступа', al || mate || !info.srcs, al ? 'это союзник' : mate ? 'напарник' : 'рядом нет ваших войск или нет порта/флота');
    if (n && st.pt[sel] && !al) h += b('blockade', '🌊', 'блокада', 'флот 3+', false);
    if (n) h += al ? b('break', '💔', 'разорвать', 'союз', mate) : b('ally', '🤝', 'союз', 'предложить');
    if (n) h += b('gift', '💸', 'дар', `−${COST.gift}`, gold < COST.gift, 'не хватает золота');
    h += b('nuke', '☢', 'бомба', `−${COST.nuke}`, gold < COST.nuke, 'не хватает золота') + '</div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('button[data-k]').forEach(btn => btn.onclick = () => act(btn.dataset.k));
  el.querySelectorAll('button[data-pct]').forEach(btn => btn.onclick = () => setPct(+btn.dataset.pct));
}

export function renderTech(st, buy) {
  const t = st.tech || { eco: 0, atk: 0, def: 0 };
  const rows = [['eco', '💰', 'экономика', '+25% золота за уровень'], ['atk', '⚔', 'атака', '+15% силы атаки за уровень'], ['def', '🛡', 'оборона', '+20% защиты за уровень']];
  $('techList').innerHTML = rows.map(([k, ico, name, eff]) => {
    const lv = t[k], cost = TECH_COST[lv];
    return `<div class="trow"><i>${ico}</i><div><b>${name}</b><small>${eff}</small><div class="pips">${[0, 1, 2].map(i => `<u class="${i < lv ? 'on' : ''}"></u>`).join('')}</div></div><button data-w="${k}" ${lv >= 3 || st.gold < cost ? 'disabled' : ''}>${lv >= 3 ? 'макс' : `${cost} 💰`}</button></div>`;
  }).join('');
  $('techList').querySelectorAll('button[data-w]').forEach(b => b.onclick = () => buy(b.dataset.w));
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
  $('endtbl').innerHTML = m.results.map(r => `<tr class="${r.me ? 'me' : ''}"><td>#${r.rank}</td><td>${esc(r.name)}</td><td>${r.share}%</td><td>${m.daily ? r.score + ' очк.' : (r.delta > 0 ? '+' : '') + r.delta + ' рейтинга'}</td></tr>`).join('');
  $('end').classList.add('show');
}
export function renderBoard(data, tab) {
  const rows = tab === 'rating'
    ? data.rating.map(p => `<li>${esc(p.name)} <span>${p.rating} · ${p.wins}/${p.games}</span></li>`)
    : data.daily.map(p => `<li>${esc(p.name)} <span>${p.score}</span></li>`);
  $('boardList').innerHTML = rows.join('') || `<li style="list-style:none;color:#8fa5bf">${data.nodb ? 'рейтинг не подключён (нужна база d1)' : 'пока пусто — сыграйте первым'}</li>`;
}
