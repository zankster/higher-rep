/* trainer-fork: one real server.js in a child with users planted in db.json and rows planted in
 * coaching.sqlite, for the coaching route tests. Same session construction as server.js. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { openCoachingDb } from '../coaching/db.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });

/**
 * users: db.json users. trainers: ids given a trainers row. links: [trainer, client, status, startedAt?].
 * env: extra environment (INVITE_ONLY, PASSWORD_LOGIN).
 */
export async function startCoachingServer(t, { users, trainers = [], links = [], env = {} }) {
  const SECRET = crypto.randomBytes(32).toString('hex');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-coaching-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));
  const sql = openCoachingDb(dataDir);
  const now = Date.now();
  for (const id of trainers) sql.prepare('INSERT INTO trainers (user_id, created_at) VALUES (?, ?)').run(id, now);
  const link = sql.prepare('INSERT INTO links (trainer_id, client_id, status, started_at, ended_at, ended_by) VALUES (?, ?, ?, ?, ?, ?)');
  links.forEach(([tr, cl, status, at], i) => {
    const ended = status === 'ended' || status === 'blocked';
    link.run(tr, cl, status, at ?? now - 10000 + i, ended ? now - 100 : null, ended ? cl : null);
  });
  sql.close();

  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', ...env }
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
  h.api = api;
  h.mint = uid => {
    const payload = `${uid}:${Date.now() + 86400000}:0`;
    return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  };
  const headers = uid => ({ 'Content-Type': 'application/json', ...(uid ? { Cookie: `gymsid=${h.mint(uid)}` } : {}) });
  h.get = async (uid, p) => { const r = await fetch(api + p, { headers: headers(uid) }); return { status: r.status, body: await r.json() }; };
  h.post = async (uid, p, body) => {
    const r = await fetch(api + p, { method: 'POST', headers: headers(uid), body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  // A second handle on the store, for what no route shows (and for moving the clock).
  h.sql = fn => { const s = openCoachingDb(dataDir); try { return fn(s); } finally { s.close(); } };
  h.stackFrames = () => h.log.split('\n').filter(l => /^\s+at /.test(l)).length;
  return h;
}
