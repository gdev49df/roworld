// проверка: все карты и режимы, партии ботов доигрываются
import { Game } from '../server/game.js';
const cases = [['random', 'classic'], ['pangea', 'blitz'], ['world', 'classic'], ['europe', 'blitz'], ['mars', 'classic']];
for (const [map, mode] of cases) {
  const g = new Game(7919, [], { map, mode });
  let w = null, i = 0;
  while (w === null && i++ < 4000) w = g.tick();
  console.log(`${map}/${mode}: провинций ${g.P.length}, тиков ${i}, итог ${w}${g.timeUp ? ' (по времени)' : ''}`);
}
// командный режим: напарники — союзники
const t = new Game(1, ['a', 'b', 'c', 'd'], { mode: 'teams', map: 'world' });
console.log('teams:', t.N.slice(0, 4).map(n => n.team).join(','), 'allied(0,2)=', t.allied(0, 2), 'allied(0,1)=', t.allied(0, 1));
// порты/флот
const g = new Game(5, ['x'], { map: 'random' });
const mine = g.mine(0), cp = mine.find(p => g.P[p].isCoast);
console.log('порт на старте:', cp !== undefined && g.port[cp], 'флот', g.fleet[cp]);
