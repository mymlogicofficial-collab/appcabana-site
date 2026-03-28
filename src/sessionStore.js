const session = require('express-session');

class SqliteStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    // Clean up expired sessions every 15 minutes
    setInterval(() => this.cleanup(), 15 * 60 * 1000);
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (new Date(row.expired) < new Date()) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (e) {
      callback(e);
    }
  }

  set(sid, session, callback) {
    try {
      const expires = session.cookie && session.cookie.expires
        ? new Date(session.cookie.expires).toISOString()
        : new Date(Date.now() + 86400000).toISOString();
      this.db.prepare(`
        INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
      `).run(sid, JSON.stringify(session), expires);
      callback(null);
    } catch (e) {
      callback(e);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (e) {
      callback(e);
    }
  }

  cleanup() {
    this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(new Date().toISOString());
  }
}

module.exports = SqliteStore;
