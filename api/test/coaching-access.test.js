/* trainer-fork: the permission test for every coaching route (PLAN.md, "Tests").
 *
 * One real server.js in a child, with two trainers and their clients planted in db.json and
 * coaching.sqlite. Each route is asked by everyone who should be refused and by everyone who
 * should not: client A can't read client B, a trainer can't read a non-client or another
 * trainer's client, an ended link reads nothing, and being an admin grants nothing in coaching.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { openCoachingDb } from '../coaching/db.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');

// Same construction as server.js makeSession(): payload `uid:exp:sv`, HMAC-SHA256 over SECRET.
function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

// MIKE owns the instance and is a trainer. TESS is a second trainer. ADAM is an admin and nothing
// more. ANA and PIA are Mike's clients (PIA paused), BEN is Tess's, CAL's link with Mike ended,
// SAM is nobody's anything. FLAG carries the user flag but no trainers row: a half-made grant.
const MIKE = 'u_mike', TESS = 'u_tess', ADAM = 'u_adam', ANA = 'u_ana', PIA = 'u_pia',
  BEN = 'u_ben', CAL = 'u_cal', SAM = 'u_sam', FLAG = 'u_flag';
const now = Date.now();
const user = (id, name, extra = {}) => ({ id, name, created: new Date(now).toISOString(), ...extra });

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-coaching-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      user(MIKE, 'Mike', { admin: true, owner: true, trainer: true }),
      user(TESS, 'Tess', { trainer: true }),
      user(ADAM, 'Adam', { admin: true }),
      user(ANA, 'Ana'), user(PIA, 'Pia'), user(BEN, 'Ben'), user(CAL, 'Cal'), user(SAM, 'Sam'),
      user(FLAG, 'Flag', { trainer: true })
    ], creds: [], subs: [], invites: []
  }));
  const sql = openCoachingDb(dataDir);
  const addTrainer = sql.prepare('INSERT INTO trainers (user_id, created_at) VALUES (?, ?)');
  addTrainer.run(MIKE, now); addTrainer.run(TESS, now);
  const link = sql.prepare('INSERT INTO links (trainer_id, client_id, status, started_at, ended_at, ended_by) VALUES (?, ?, ?, ?, ?, ?)');
  link.run(MIKE, ANA, 'active', now - 3000, null, null);
  link.run(MIKE, PIA, 'paused', now - 2000, null, null);
  link.run(TESS, BEN, 'active', now - 1000, null, null);
  link.run(MIKE, CAL, 'ended', now - 5000, now - 4000, CAL);
  sql.close();

  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  // The server holds coaching.sqlite open, and Windows refuses to remove an open file, so the
  // folder goes only once the child has really exited.
  const exited = new Promise(r => child.once('exit', r));
  t.after(async () => {
    child.kill('SIGKILL'); await exited;
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  });
  const api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  const headers = uid => ({ 'Content-Type': 'application/json', ...(uid ? { Cookie: `gymsid=${mintSession(uid)}` } : {}) });
  h.get = async (uid, p) => { const r = await fetch(api + p, { headers: headers(uid) }); return { status: r.status, body: await r.json() }; };
  h.post = async (uid, p, body) => {
    const r = await fetch(api + p, { method: 'POST', headers: headers(uid), body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return h;
}

test('GET /api/coaching/me says who you are in coaching', async t => {
  const h = await startServer(t);
  assert.equal((await h.get(null, '/api/coaching/me')).status, 401);
  const me = async uid => (await h.get(uid, '/api/coaching/me')).body;
  assert.deepEqual(await me(MIKE), { trainer: true, coach: null });
  assert.deepEqual(await me(ADAM), { trainer: false, coach: null }, 'an admin is not a trainer');
  assert.deepEqual(await me(FLAG), { trainer: false, coach: null }, 'the flag without a trainers row grants nothing');
  assert.deepEqual(await me(SAM), { trainer: false, coach: null });
  const ana = await me(ANA);
  assert.equal(ana.trainer, false);
  assert.deepEqual({ ...ana.coach, since: 0 }, { id: MIKE, name: 'Mike', status: 'active', since: 0, cleared: false, paperwork: 'about', todo: 0, guardian: 0 }, 'no date of birth yet: not cleared');
  assert.equal((await me(PIA)).coach.status, 'paused');
  assert.equal((await me(BEN)).coach.id, TESS);
  assert.equal((await me(CAL)).coach, null, 'an ended link is no coach');
});

test('GET /api/coaching/clients lists only the trainer\'s own live clients', async t => {
  const h = await startServer(t);
  assert.equal((await h.get(null, '/api/coaching/clients')).status, 401);
  for (const uid of [ANA, BEN, SAM, ADAM, FLAG]) {
    assert.equal((await h.get(uid, '/api/coaching/clients')).status, 403, `${uid} is not a trainer`);
  }
  const ids = async uid => (await h.get(uid, '/api/coaching/clients')).body.clients.map(c => c.id);
  assert.deepEqual(await ids(MIKE), [ANA, PIA], 'not Ben (Tess\'s), not Cal (ended), not strangers');
  assert.deepEqual(await ids(TESS), [BEN]);
  const pia = (await h.get(MIKE, '/api/coaching/clients')).body.clients[1];
  assert.deepEqual({ ...pia, since: 0 }, { id: PIA, name: 'Pia', status: 'paused', since: 0, dob: null, age: null, cleared: false, paperwork: 'about', todo: 0, warnings: [] });
});

test('GET /api/coaching/client opens only the trainer\'s own client, and 404s alike otherwise', async t => {
  const h = await startServer(t);
  const one = (uid, id) => h.get(uid, `/api/coaching/client${id === undefined ? '' : '?id=' + id}`);
  assert.equal((await one(null, ANA)).status, 401);
  assert.equal((await one(MIKE, ANA)).body.client.id, ANA);
  assert.equal((await one(MIKE, PIA)).body.client.status, 'paused', 'a paused client stays readable');
  assert.equal((await one(TESS, BEN)).body.client.id, BEN);

  const refused = [
    [MIKE, BEN, 404, 'another trainer\'s client'],
    [MIKE, CAL, 404, 'an ended link'],
    [MIKE, SAM, 404, 'a stranger'],
    [MIKE, 'u_nobody', 404, 'no such user'],
    [MIKE, undefined, 404, 'no id'],
    [MIKE, MIKE, 404, 'the trainer themself'],
    [TESS, ANA, 404, 'Mike\'s client, asked by Tess'],
    [ANA, ANA, 403, 'a client is no trainer, even about themself'],
    [ANA, BEN, 403, 'client A asking for client B'],
    [ADAM, ANA, 403, 'an admin who is not a trainer'],
    [FLAG, ANA, 403, 'a half-made trainer']
  ];
  for (const [uid, id, status, why] of refused) {
    const r = await one(uid, id);
    assert.equal(r.status, status, why);
    assert.equal(r.body.client, undefined, why);
  }
  // Not-yours and does-not-exist read the same, so a trainer cannot probe for accounts.
  assert.deepEqual((await one(MIKE, BEN)).body, (await one(MIKE, 'u_nobody')).body);
});

test('POST /api/admin/user/trainer is the owner\'s, and refuses to strand clients', async t => {
  const h = await startServer(t);
  const set = (uid, body) => h.post(uid, '/api/admin/user/trainer', body);
  assert.equal((await set(null, { id: SAM, trainer: true })).status, 401);
  assert.equal((await set(ADAM, { id: SAM, trainer: true })).status, 403, 'an admin who is not the owner');
  assert.equal((await set(TESS, { id: SAM, trainer: true })).status, 403, 'a trainer');
  assert.equal((await set(ANA, { id: SAM, trainer: true })).status, 403, 'a client');
  assert.equal((await set(MIKE, { id: 'u_nobody', trainer: true })).status, 404);
  assert.equal((await set(MIKE, { id: SAM, trainer: 'yes' })).status, 400);

  // Sam becomes a trainer: an empty roster, and still no way into anyone else's clients.
  assert.deepEqual((await set(MIKE, { id: SAM, trainer: true })).body, { ok: true, id: SAM, trainer: true });
  assert.deepEqual((await h.get(SAM, '/api/coaching/clients')).body, { clients: [] });
  assert.equal((await h.get(SAM, `/api/coaching/client?id=${ANA}`)).status, 404);
  const listed = (await h.get(MIKE, '/api/admin/users')).body.users;
  assert.equal(listed.find(u => u.id === SAM).trainer, true);
  assert.equal(listed.find(u => u.id === ANA).trainer, false);

  // The flag-only user is completed by a grant.
  assert.equal((await set(MIKE, { id: FLAG, trainer: true })).body.trainer, true);
  assert.equal((await h.get(FLAG, '/api/coaching/clients')).status, 200);

  // Tess still has Ben, so her role stays.
  const r = await set(MIKE, { id: TESS, trainer: false });
  assert.equal(r.status, 409);
  assert.equal(r.body.clients, 1);
  assert.equal((await h.get(TESS, '/api/coaching/clients')).status, 200);

  // Sam has none, so his goes, and with it every coaching route.
  assert.equal((await set(MIKE, { id: SAM, trainer: false })).body.trainer, false);
  assert.equal((await h.get(SAM, '/api/coaching/clients')).status, 403);
  assert.equal((await h.get(SAM, '/api/coaching/me')).body.trainer, false);
  const saved = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'db.json'), 'utf8'));
  assert.equal(saved.users.find(u => u.id === SAM).trainer, undefined, 'the flag is gone from db.json');
  assert.equal(h.log.split('\n').filter(l => /^\s+at /.test(l)).length, 0, 'no stack traces');
});
