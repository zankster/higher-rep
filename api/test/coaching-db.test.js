/* trainer-fork: the coaching store's migrations and the rules its schema enforces by itself. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openCoachingDb, migrate, MIGRATIONS, tx } from '../coaching/db.js';

function fresh(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coaching-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const link = (sql, trainer, client, status) => sql.prepare(
  'INSERT INTO links (trainer_id, client_id, status, started_at) VALUES (?, ?, ?, ?)'
).run(trainer, client, status, Date.now());

test('migrations run once, in order, and survive a reopen', t => {
  const dir = fresh(t);
  let sql = openCoachingDb(dir);
  assert.equal(sql.prepare('SELECT version FROM schema_version').get().version, MIGRATIONS.length);
  sql.prepare('INSERT INTO trainers (user_id, created_at) VALUES (?, ?)').run('u_t', 1);
  sql.close();
  sql = openCoachingDb(dir);
  assert.equal(migrate(sql), MIGRATIONS.length, 'nothing left to run');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM trainers').get().n, 1, 'data kept');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM schema_version').get().n, 1);
  sql.close();
});

test('a store from a newer server is refused rather than written to', t => {
  const dir = fresh(t);
  const sql = openCoachingDb(dir);
  sql.prepare('UPDATE schema_version SET version = ?').run(MIGRATIONS.length + 1);
  sql.close();
  assert.throws(() => openCoachingDb(dir), /newer than this server/);
});

test('a client has one live trainer at a time; ended links stay as history', t => {
  const sql = openCoachingDb(fresh(t));
  link(sql, 'u_t1', 'u_c', 'active');
  assert.throws(() => link(sql, 'u_t2', 'u_c', 'active'), /UNIQUE/);
  assert.throws(() => link(sql, 'u_t2', 'u_c', 'paused'), /UNIQUE/);
  sql.prepare(`UPDATE links SET status = 'ended' WHERE client_id = 'u_c'`).run();
  link(sql, 'u_t2', 'u_c', 'active');
  link(sql, 'u_t3', 'u_c2', 'ended');
  link(sql, 'u_t3', 'u_c2', 'blocked');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM links').get().n, 4);
  assert.throws(() => link(sql, 'u_t1', 'u_c3', 'gone'), /CHECK/);
  sql.close();
});

test('tx commits as one and rolls back as one', t => {
  const sql = openCoachingDb(fresh(t));
  assert.throws(() => tx(sql, () => { link(sql, 'u_t', 'u_a', 'active'); link(sql, 'u_t', 'u_a', 'active'); }), /UNIQUE/);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM links').get().n, 0);
  tx(sql, () => { link(sql, 'u_t', 'u_a', 'active'); link(sql, 'u_t', 'u_b', 'active'); });
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM links').get().n, 2);
  sql.close();
});
