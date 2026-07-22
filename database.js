// database.js — SQLite (better-sqlite3): schema, helpers e session store
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const session = require('express-session');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'nexor.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  empresa TEXT NOT NULL,
  segmento TEXT NOT NULL,
  instagram TEXT,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Novo',
  origem TEXT DEFAULT 'landing-page',
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS lead_status_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  alterado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS lead_observacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  autor TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_criado ON leads(criado_em);
CREATE INDEX IF NOT EXISTS idx_hist_lead ON lead_status_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_obs_lead ON lead_observacoes(lead_id);
`);

const STATUS_VALIDOS = [
  'Novo',
  'Em contato',
  'Qualificado',
  'Reunião agendada',
  'Cliente',
  'Não convertido'
];

// ---------- Session store (persistente em SQLite) ----------
class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this._get = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expire > ?');
    this._set = db.prepare(
      'INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ' +
      'ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire'
    );
    this._del = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this._gc = db.prepare('DELETE FROM sessions WHERE expire <= ?');
    setInterval(() => this._gc.run(Date.now()), 15 * 60 * 1000).unref();
  }
  get(sid, cb) {
    try {
      const row = this._get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 24 * 60 * 60 * 1000;
      this._set.run(sid, JSON.stringify(sess), Date.now() + maxAge);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
  destroy(sid, cb) {
    try { this._del.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
  }
}

module.exports = { db, STATUS_VALIDOS, SqliteSessionStore };
