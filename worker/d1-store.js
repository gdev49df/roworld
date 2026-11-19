// рейтинг и ежедневный турнир в cloudflare d1. если база не подключена — работает без рейтинга
export class D1Store {
  constructor(db) { this.db = db; }
  async report({ pid, name, delta, won, day, score }) {
    if (!this.db) return;
    if (!day) {
      await this.db.prepare(
        `INSERT INTO players (id, name, rating, games, wins, updated) VALUES (?1, ?2, MAX(0, 1000 + ?3), 1, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET name = ?2, rating = MAX(0, rating + ?3), games = games + 1, wins = wins + ?4, updated = ?5`
      ).bind(pid, name, delta, won ? 1 : 0, Date.now()).run();
    } else {
      await this.db.prepare(
        `INSERT INTO daily (day, id, name, score) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(day, id) DO UPDATE SET name = ?3, score = MAX(score, ?4)`
      ).bind(day, pid, name, score).run();
    }
  }
  async leaderboard(day) {
    if (!this.db) return { rating: [], daily: [], day, nodb: true };
    const rating = (await this.db.prepare('SELECT name, rating, games, wins FROM players ORDER BY rating DESC LIMIT 20').all()).results;
    const daily = (await this.db.prepare('SELECT name, score FROM daily WHERE day = ?1 ORDER BY score DESC LIMIT 20').bind(day).all()).results;
    return { rating, daily, day };
  }
}
