// общие константы для сервера и клиента
export const NNAT = 13, MAX_HUMANS = 8;
export const COST = { city: 60, fort: 40, draft: 30, nuke: 300, port: 80, ship: 30, gift: 50 };
export const TYPES = ['warrior', 'economist', 'diplomat', 'opportunist', 'defender', 'nuker'];
export const TYPE_RU = { warrior: 'воин', economist: 'экономист', diplomat: 'дипломат', opportunist: 'оппортунист', defender: 'защитник', nuker: 'ядерщик', human: 'игрок' };
export const AGGR = { warrior: .9, opportunist: .6, nuker: .5, economist: .3, diplomat: .25, defender: .2 };
export const BOT_NAMES = ['Рутения', 'Кальдера', 'Нордмарк', 'Сорания', 'Эльбрус', 'Вальдория', 'Тарсис', 'Аурелия', 'Бореалия', 'Ксандрия', 'Мирдан', 'Оствальд', 'Тарнис'];
export const MAPS = { random: 'случайные острова', pangea: 'пангея', world: 'мир', europe: 'европа', mars: 'марс' };
// time — длительность в секундах, win — доля карты для мгновенной победы, mult — множитель экономики
export const MODES = {
  classic: { name: 'классика (30 мин)', time: 1800, win: .8, mult: 1 },
  blitz: { name: 'блиц (10 мин)', time: 600, win: .6, mult: 2 },
  teams: { name: 'команды 2×2 (30 мин)', time: 1800, win: .8, mult: 1 },
  daily: { name: 'ежедневный турнир (15 мин)', time: 900, win: .8, mult: 1.5 },
};
// название игры — меняется в одном месте
export const GAME_NAME = 'Borderline';
export const TAGLINE = 'захвати весь мир';
