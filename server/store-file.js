import fs from 'fs';
import path from 'path';

// простое хранилище рейтинга для запуска на обычном node (json-файл). в cloudflare используется d1
export class FileStore {
  constructor(file = path.join(process.env.DATA_DIR || 'data', 'store.json')) {
    this.file = file; this.db = { players: {}, daily: {} };
    try { this.db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* новый файл */ }
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.db)); } catch { /* только память */ } }
  async report({ pid, name, delta, won, day, score }) {
    if (!day) {
      const p = this.db.players[pid] || (this.db.players[pid] = { name, rating: 1000, games: 0, wins: 0 });
      p.name = name; p.rating = Math.max(0, p.rating + delta); p.games++; if (won) p.wins++;
    } else {
      const d = this.db.daily[day] || (this.db.daily[day] = {});
      if (!d[pid] || d[pid].score < score) d[pid] = { name, score };
    }
    this.save();
  }
  async leaderboard(day) {
    const rating = Object.values(this.db.players).sort((a, b) => b.rating - a.rating).slice(0, 20);
    const daily = Object.values(this.db.daily[day] || {}).sort((a, b) => b.score - a.score).slice(0, 20);
    return { rating, daily, day };
  }
}
