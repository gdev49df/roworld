# Terra Clash

онлайн-стратегия в браузере: захватите 80% карты (в блице 60%) или будьте лидером, когда выйдет время. название меняется в одном месте — `GAME_NAME` в `public/shared/consts.js`.

- до 8 игроков в комнате, остальные нации (всего 13) — боты с характерами: воин, экономист, дипломат, оппортунист, защитник, ядерщик
- карты: случайные острова, пангея, мир, европа, марс
- режимы: классика 30 мин, блиц 10 мин, команды 2×2, ежедневный турнир
- города, форты, призыв, порты и флот (морские атаки, блокады), союзы, подарки золота, бомба
- чат, рейтинг игроков и таблица ежедневного турнира
- отключился игрок — нацией временно управляет ии, можно вернуться

## запуск локально

```bash
npm install
npm start            # обычный node, http://localhost:3000 (рейтинг в data/store.json)
npm run dev:cf       # то же на локальном cloudflare runtime (wrangler dev)
npm test             # симуляция партий ботов на всех картах
```

## деплой на cloudflare (workers + durable objects)

1. `npx wrangler login`
2. `npx wrangler deploy` — игра уже работает на `*.workers.dev` (комната = durable object, статика из `public/`)
3. рейтинг и турнир (по желанию):
   ```bash
   npx wrangler d1 create roworld          # скопируйте database_id
   # раскомментируйте блок [[d1_databases]] в wrangler.toml и вставьте id
   npx wrangler d1 execute roworld --remote --file=schema.sql
   npx wrangler deploy
   ```
своё имя домена — в панели cloudflare: workers → roworld → settings → domains.

## структура

```
server/    game.js (вся логика), room.js (комнаты, лобби, чат, итоги), map.js, index.js (node), store-file.js
worker/    index.js (cloudflare worker + durable object RoomDO), d1-store.js
public/    index.html, css/, js/{main,net,render,ui}.js
public/shared/   consts.js, maps.js (карты), rng.js — общий код клиента и сервера
test/      sim.js (боты), net.js (интеграция; нужен запущенный сервер, PORT=…)
```

сервер авторитетный: клиент шлёт только команды, состояние приходит раз в секунду. рейтинг привязан к анониму из localStorage — для защиты от подделки позже стоит добавить вход через telegram.
