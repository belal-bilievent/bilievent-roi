// SQLite storage using Node's built-in driver (no native dependencies).
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'roi.db');
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS orgs(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'exhibitor',
  icp_sectors TEXT NOT NULL DEFAULT '[]', webhook_url TEXT, hot_threshold INTEGER NOT NULL DEFAULT 70,
  warm_threshold INTEGER NOT NULL DEFAULT 55, weights TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sales', phone TEXT, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exhibitions(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, venue TEXT, city TEXT, start_date TEXT, end_date TEXT, stand TEXT, size_m2 REAL,
  status TEXT NOT NULL DEFAULT 'planning', goal_qualified INTEGER, goal_pipeline REAL, goal_cpql REAL,
  notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS costs(
  id INTEGER PRIMARY KEY, exhibition_id INTEGER NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
  category TEXT NOT NULL, label TEXT, amount REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS leads(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  exhibition_id INTEGER REFERENCES exhibitions(id) ON DELETE SET NULL, created_by INTEGER REFERENCES users(id),
  owner_id INTEGER REFERENCES users(id), client_uid TEXT UNIQUE, captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'form', company TEXT, name TEXT, title TEXT, email TEXT, phone TEXT,
  sector TEXT, company_size TEXT, interests TEXT NOT NULL DEFAULT '[]', timeline TEXT, budget TEXT, authority TEXT,
  engagement INTEGER NOT NULL DEFAULT 0, flags TEXT NOT NULL DEFAULT '[]', notes TEXT,
  score INTEGER NOT NULL DEFAULT 0, tier TEXT NOT NULL DEFAULT 'cold', reasons TEXT NOT NULL DEFAULT '[]',
  stage TEXT NOT NULL DEFAULT 'new', value REAL NOT NULL DEFAULT 0, won_at TEXT, lost_reason TEXT,
  next_step TEXT, next_due TEXT, first_contact_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS leads_org ON leads(org_id, exhibition_id);
CREATE TABLE IF NOT EXISTS activities(
  id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id), type TEXT NOT NULL, body TEXT, at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS improvements(
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  exhibition_id INTEGER REFERENCES exhibitions(id) ON DELETE CASCADE, rule_key TEXT, title TEXT NOT NULL,
  rationale TEXT, category TEXT, expected TEXT, status TEXT NOT NULL DEFAULT 'proposed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(exhibition_id, rule_key));
`);

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const J = (s, d = []) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
function tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }

module.exports = { db, one, all, run, J, tx, file };
