// проверка: карта связна, ботов-партия доигрывает до победы
import { Game } from '../server/game.js';
for (let s = 1; s <= 5; s++) {
  const g = new Game(s * 7919, []);
  let w = null, i = 0;
  while (w === null && i++ < 2000) w = g.tick();
  console.log(`seed ${s}: провинций ${g.P.length}, тиков ${i}, итог ${w}`);
}
