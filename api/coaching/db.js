/* The coaching store: one SQLite file beside db.json, DATA_DIR/coaching.sqlite.
 *
 * trainer-fork: everything a trainer and a client share lives here, never in state-<uid>.json.
 * /api/data is last-write-wins per document, so a row the trainer wrote into the client's file
 * would be lost the next time the client's phone synced. User ids are openGym's (db.json).
 *
 * Migrations are numbered and run once each, in order, inside a transaction; the number reached
 * is kept in schema_version. Never edit a migration that has shipped: add the next one.
 * Every row that belongs to a trainer carries trainer_id (PLAN.md, "Ready for more trainers").
 * Times are UTC milliseconds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS = [
  // 1. Phase 2a: trainers, the trainer-client link and the link's settings.
  `CREATE TABLE trainers (
     user_id TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL,
     branding TEXT NOT NULL DEFAULT '{}',
     default_preset TEXT
   );
   CREATE TABLE links (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     client_id TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'ended', 'blocked')),
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     ended_by TEXT
   );
   CREATE INDEX links_trainer ON links (trainer_id, status);
   CREATE INDEX links_client ON links (client_id, status);
   -- One trainer per client in v1. Ended and blocked links stay as history (and as the
   -- liability record), so only a live link is unique.
   CREATE UNIQUE INDEX links_one_live ON links (client_id) WHERE status IN ('active', 'paused');
   CREATE TABLE link_settings (
     link_id INTEGER PRIMARY KEY REFERENCES links (id),
     trainer_id TEXT NOT NULL,
     preset TEXT,
     visibility TEXT NOT NULL DEFAULT '{}',
     autonomy TEXT NOT NULL DEFAULT '{}',
     notify TEXT NOT NULL DEFAULT '{}',
     updated_at INTEGER NOT NULL
   );`
];

export function openCoachingDb(dataDir, { file = 'coaching.sqlite' } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const sql = new DatabaseSync(file === ':memory:' ? ':memory:' : path.join(dataDir, file));
  try {
    sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(sql);
  } catch (e) { sql.close(); throw e; }
  return sql;
}

export function migrate(sql) {
  sql.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = sql.prepare('SELECT version FROM schema_version').get();
  let at = row ? row.version : 0;
  if (!row) sql.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  if (at > MIGRATIONS.length) {
    throw new Error(`coaching.sqlite is at schema ${at}, newer than this server (${MIGRATIONS.length}). Refusing to start.`);
  }
  while (at < MIGRATIONS.length) {
    sql.exec('BEGIN');
    try {
      sql.exec(MIGRATIONS[at]);
      sql.prepare('UPDATE schema_version SET version = ?').run(at + 1);
      sql.exec('COMMIT');
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
    at++;
  }
  return at;
}

/** Run fn inside one transaction. node:sqlite has no helper for it. */
export function tx(sql, fn) {
  sql.exec('BEGIN IMMEDIATE');
  try { const out = fn(); sql.exec('COMMIT'); return out; }
  catch (e) { sql.exec('ROLLBACK'); throw e; }
}
