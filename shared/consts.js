// общие константы для сервера и клиента
export const W = 110, H = 66, NP = 230, NNAT = 13, MAX_HUMANS = 8;
export const COST = { city: 60, fort: 40, draft: 30, nuke: 300 };
export const TYPES = ['warrior', 'economist', 'diplomat', 'opportunist', 'defender', 'nuker'];
export const TYPE_RU = { warrior: 'воин', economist: 'экономист', diplomat: 'дипломат', opportunist: 'оппортунист', defender: 'защитник', nuker: 'ядерщик', human: 'игрок' };
export const AGGR = { warrior: .9, opportunist: .6, nuker: .5, economist: .3, diplomat: .25, defender: .2 };
export const BOT_NAMES = ['Рутения', 'Кальдера', 'Нордмарк', 'Сорания', 'Эльбрус', 'Вальдория', 'Тарсис', 'Аурелия', 'Бореалия', 'Ксандрия', 'Мирдан', 'Оствальд', 'Тарнис'];
export const WIN_SHARE = 0.8;
export const TIME_LIMIT = 1800; // тиков (≈30 минут): по истечении побеждает лидер по территории
