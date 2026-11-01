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
   );`,
  // 2. Phase 2b: invites. `code` is also an openGym invite code in db.json, so an invite-only
  // instance lets the invited person sign up with it. Expiry is read from expires_at, never
  // stored as a status.
  `CREATE TABLE invites (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     code TEXT NOT NULL UNIQUE,
     first_name TEXT NOT NULL,
     email TEXT,
     note TEXT,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     opened_at INTEGER,
     status TEXT NOT NULL CHECK (status IN ('pending', 'joined', 'revoked')),
     client_id TEXT,
     link_id INTEGER REFERENCES links (id)
   );
   CREATE INDEX invites_trainer ON invites (trainer_id, status);`,
  // 3. Phase 2d: the trainer's document library. A document has at most one draft and any number
  // of published versions; a published version is never changed. `requests` is every time a
  // client is asked for a document (the sign-up packet in 2e, "Send to clients", "sign the new
  // version"), and is marked done when they complete it. Files are stored by their SHA-256 under
  // DATA_DIR/coaching-files and are read only through the routes that check who may.
  `CREATE TABLE documents (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('sign', 'form', 'pdf_return')),
     title TEXT NOT NULL,
     in_packet INTEGER NOT NULL DEFAULT 0,
     packet_order INTEGER,
     rights_confirmed_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX documents_trainer ON documents (trainer_id);
   CREATE TABLE document_versions (
     id INTEGER PRIMARY KEY,
     document_id INTEGER NOT NULL REFERENCES documents (id),
     version INTEGER,
     status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
     title TEXT NOT NULL,
     body TEXT NOT NULL DEFAULT '{}',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     published_at INTEGER
   );
   CREATE UNIQUE INDEX document_one_draft ON document_versions (document_id) WHERE status = 'draft';
   CREATE UNIQUE INDEX document_version_number ON document_versions (document_id, version) WHERE status = 'published';
   CREATE TABLE files (
     hash TEXT NOT NULL,
     owner_id TEXT NOT NULL,
     size INTEGER NOT NULL,
     type TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (hash, owner_id)
   );
   CREATE TABLE requests (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     client_id TEXT NOT NULL,
     document_id INTEGER NOT NULL REFERENCES documents (id),
     version_id INTEGER NOT NULL REFERENCES document_versions (id),
     reason TEXT NOT NULL CHECK (reason IN ('packet', 'sent', 'new_version')),
     status TEXT NOT NULL CHECK (status IN ('open', 'done', 'cancelled')),
     due_at INTEGER,
     created_at INTEGER NOT NULL,
     done_at INTEGER
   );
   CREATE INDEX requests_client ON requests (client_id, status);
   CREATE INDEX requests_document ON requests (document_id, status);`,
  // 4. Phase 2e: the client's side. `clients` holds the date of birth (asked before the link is
  // made; under 13 nothing is stored). A document can be required before training starts, and a
  // request copies that when it is made. For a client under 18 a document to sign needs the
  // guardian's signature as well: the request stays open, with client_done_at set, until the
  // guardian signs. `submissions` is the signed record and is insert only: the triggers refuse
  // any change, so a correction is always a new record.
  `ALTER TABLE documents ADD COLUMN required INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE requests ADD COLUMN required INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE requests ADD COLUMN guardian_needed INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE requests ADD COLUMN client_done_at INTEGER;
   CREATE TABLE clients (
     client_id TEXT PRIMARY KEY,
     dob TEXT NOT NULL,
     tz TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE guardians (
     id INTEGER PRIMARY KEY,
     client_id TEXT NOT NULL,
     trainer_id TEXT NOT NULL,
     name TEXT NOT NULL,
     email TEXT,
     relationship TEXT NOT NULL,
     token_hash TEXT,
     token_expires_at INTEGER,
     token_used_at INTEGER,
     emailed_at INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX guardians_client ON guardians (client_id, created_at);
   CREATE UNIQUE INDEX guardians_token ON guardians (token_hash) WHERE token_hash IS NOT NULL;
   CREATE TABLE submissions (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     client_id TEXT NOT NULL,
     request_id INTEGER NOT NULL REFERENCES requests (id),
     document_id INTEGER NOT NULL REFERENCES documents (id),
     version_id INTEGER NOT NULL REFERENCES document_versions (id),
     signer TEXT NOT NULL CHECK (signer IN ('client', 'guardian')),
     guardian_id INTEGER REFERENCES guardians (id),
     signer_name TEXT,
     agreed INTEGER NOT NULL DEFAULT 0,
     answers TEXT,
     flagged_yes INTEGER NOT NULL DEFAULT 0,
     content_hash TEXT NOT NULL,
     signature_hash TEXT,
     file_hash TEXT,
     device TEXT,
     app_version TEXT,
     tz TEXT,
     signed_at INTEGER NOT NULL
   );
   CREATE INDEX submissions_client ON submissions (client_id, signed_at);
   CREATE UNIQUE INDEX submissions_once ON submissions (request_id, signer);
   CREATE TRIGGER submissions_no_update BEFORE UPDATE ON submissions
     BEGIN SELECT RAISE(ABORT, 'submissions are insert only'); END;
   CREATE TRIGGER submissions_no_delete BEFORE DELETE ON submissions
     BEGIN SELECT RAISE(ABORT, 'submissions are insert only'); END;`,
  // 5. Phase 2f: the trainer's own tags and private notes on a client. Only the trainer's routes
  // read these tables; nothing the client can reach does. A tag made from a flagged answer keeps
  // the submission it came from. How long records are kept is worked out from links.ended_at and
  // the date of birth (profile.js, keepUntil), so it needs no table of its own.
  `CREATE TABLE tags (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     client_id TEXT NOT NULL,
     text TEXT NOT NULL,
     warning INTEGER NOT NULL DEFAULT 0,
     submission_id INTEGER REFERENCES submissions (id),
     created_at INTEGER NOT NULL
   );
   CREATE UNIQUE INDEX tags_once ON tags (trainer_id, client_id, text COLLATE NOCASE);
   CREATE TABLE notes (
     id INTEGER PRIMARY KEY,
     trainer_id TEXT NOT NULL,
     client_id TEXT NOT NULL,
     text TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     edited_at INTEGER
   );
   CREATE INDEX notes_client ON notes (trainer_id, client_id, created_at);`
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
