/* HTTP surface for coaching (trainer-fork). Every route is listed in openapi.yaml, and every
 * route has a permission test in test/coaching-access.test.js or coaching-invites.test.js.
 *
 * A factory taking server.js's own helpers, like coach/routes.js: they are closures over db.json
 * and the session secret. Ids travel in the query string or the body, so openGym's dispatcher
 * stays a plain lookup.
 */
import crypto from 'node:crypto';
import { makeAccess } from './access.js';
import { tx } from './db.js';

export const INVITE_DAYS = 14;
// An expired invite stays on the roster this long, with "Send new", then drops off.
const EXPIRED_SHOWN_DAYS = 30;
const DAY = 86400000;

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function coachingRoutes({ sql, users, invites, saveDb, json, readBody, readSession, requireOwner, audit, origin = '', now = Date.now }) {
  const access = makeAccess({ sql, users, json, readSession });
  const { userById, isTrainer, liveLinkOf, requireUser, requireTrainer, requireOwnClient } = access;
  const query = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);

  const clientRow = (link, u) => ({
    id: link.client_id, name: u ? u.name : null, status: link.status, since: link.started_at
  });
  // The name a client sees: the trainer's branding name once 2g sets one, else their profile name.
  const trainerName = id => {
    const row = sql.prepare('SELECT branding FROM trainers WHERE user_id = ?').get(id);
    let b = {}; try { b = JSON.parse(row?.branding || '{}'); } catch { /* keep the default */ }
    return str(b.name, 60) || userById(id)?.name || null;
  };

  /* ---------- invites ---------- */
  const inviteState = inv => inv.status !== 'pending' ? inv.status : inv.expires_at <= now() ? 'expired' : 'pending';
  const inviteRow = inv => {
    const status = inviteState(inv);
    return {
      id: inv.id, firstName: inv.first_name, email: inv.email || null, note: inv.note || null,
      created: inv.created_at, expires: inv.expires_at, opened: inv.opened_at || null, status,
      // The code is the link; only a live invite hands it out again (Copy link).
      ...(status === 'pending' ? { code: inv.code, url: joinUrl(inv.code) } : {})
    };
  };
  // The app is a hash router, so the join page is a fragment of the server's own address.
  const joinUrl = code => String(origin).replace(/\/$/, '') + '/#/join/' + code;
  const ownInvite = (trainer, id) => sql.prepare('SELECT * FROM invites WHERE id = ? AND trainer_id = ?').get(Number(id), trainer.id) || null;
  const gymInvite = code => invites().find(i => i.code === code) || null;

  // Every coaching code is also an openGym invite, so an invite-only instance lets the person sign
  // up with it. Once the coaching invite is revoked or past its date, that openGym code is
  // revoked too: registration refuses a revoked code (server.js). Done lazily before every invite
  // route and on a timer, so a lapsed code cannot open an account for long.
  function sweepLapsed() {
    const lapsed = sql.prepare(
      `SELECT code FROM invites WHERE status = 'revoked' OR (status = 'pending' AND expires_at <= ?)`
    ).all(now());
    let changed = false;
    for (const { code } of lapsed) {
      const g = gymInvite(code);
      if (g && !g.usedBy && !g.revoked) { g.revoked = true; changed = true; }
    }
    if (changed) saveDb();
  }
  setInterval(sweepLapsed, 10 * 60000).unref();

  function createInvite(trainer, { firstName, email, note }) {
    let code;
    // Same shape as openGym's own invite codes (16 hex, 64 bits): the code is the secret.
    do { code = crypto.randomBytes(8).toString('hex').toUpperCase(); }
    while (invites().some(i => i.code === code) || sql.prepare('SELECT 1 FROM invites WHERE code = ?').get(code));
    const t = now();
    invites().push({ code, note: str(`Coaching: ${firstName}`, 60), createdBy: trainer.id, created: new Date(t).toISOString() });
    saveDb();
    const { lastInsertRowid } = sql.prepare(
      `INSERT INTO invites (trainer_id, code, first_name, email, note, created_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(trainer.id, code, firstName, email || null, note || null, t, t + INVITE_DAYS * DAY);
    return sql.prepare('SELECT * FROM invites WHERE id = ?').get(lastInsertRowid);
  }

  function revokeInvite(inv) {
    sql.prepare(`UPDATE invites SET status = 'revoked' WHERE id = ?`).run(inv.id);
    sweepLapsed();
  }

  /* ---------- the link ---------- */
  const setStatus = (link, status, by) => sql.prepare(
    'UPDATE links SET status = ?, ended_at = ?, ended_by = ? WHERE id = ?'
  ).run(status, status === 'ended' || status === 'blocked' ? now() : null, status === 'ended' || status === 'blocked' ? by : null, link.id);

  return {
    // Appoint or remove a trainer. Owner only, like appointing an admin. Removing is refused while
    // the trainer still has clients: their clients would be left linked to nobody.
    'POST /api/admin/user/trainer': async (req, res) => {
      const owner = requireOwner(req, res); if (!owner) return;
      const body = await readBody(req);
      const u = userById(body.id);
      if (!u) return json(res, 404, { error: 'no such user' });
      if (typeof body.trainer !== 'boolean') return json(res, 400, { error: 'trainer must be true or false' });
      if (body.trainer && u.disabled) return json(res, 400, { error: 'enable the account first' });
      if (!body.trainer) {
        const n = sql.prepare(`SELECT COUNT(*) AS n FROM links WHERE trainer_id = ? AND status IN ('active', 'paused')`).get(u.id).n;
        if (n) return json(res, 409, { error: 'this trainer still has clients', clients: n });
      }
      if (body.trainer) {
        sql.prepare('INSERT OR IGNORE INTO trainers (user_id, created_at) VALUES (?, ?)').run(u.id, now());
        u.trainer = true;
      } else delete u.trainer;
      saveDb();
      audit(req, body.trainer ? 'admin.trainer.grant' : 'admin.trainer.revoke', { user: owner, target: u });
      json(res, 200, { ok: true, id: u.id, trainer: isTrainer(u) });
    },

    // Who am I in coaching: a trainer, someone's client, both or neither. Any signed-in user.
    'GET /api/coaching/me': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const link = liveLinkOf(user.id);
      json(res, 200, {
        trainer: isTrainer(user),
        coach: link ? { id: link.trainer_id, name: trainerName(link.trainer_id), status: link.status, since: link.started_at } : null
      });
    },

    // The trainer's own clients with a live link (active or paused).
    'GET /api/coaching/clients': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const rows = sql.prepare(
        `SELECT * FROM links WHERE trainer_id = ? AND status IN ('active', 'paused') ORDER BY started_at`
      ).all(trainer.id);
      const clients = [];
      for (const l of rows) { const u = userById(l.client_id); if (u) clients.push(clientRow(l, u)); }
      json(res, 200, { clients });
    },

    // One of the trainer's own clients.
    'GET /api/coaching/client': async (req, res) => {
      const own = requireOwnClient(req, res, query(req, 'id')); if (!own) return;
      json(res, 200, { client: clientRow(own.link, own.client) });
    },

    // Pause (holiday, injury break) or resume. Access stays; alerts and "missed" stop (Phase 4).
    'POST /api/coaching/client/pause': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      if (typeof body.paused !== 'boolean') return json(res, 400, { error: 'paused must be true or false' });
      setStatus(own.link, body.paused ? 'paused' : 'active');
      audit(req, body.paused ? 'coaching.client.pause' : 'coaching.client.resume', { user: own.trainer, target: own.client });
      json(res, 200, { client: clientRow({ ...own.link, status: body.paused ? 'paused' : 'active' }, own.client) });
    },

    // The trainer ends coaching. Access ends; the client keeps their account and own data, and
    // the liability record stays (SPEC.md, "Removing a client").
    'POST /api/coaching/client/remove': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      setStatus(own.link, 'ended', own.trainer.id);
      audit(req, 'coaching.client.remove', { user: own.trainer, target: own.client });
      json(res, 200, { ok: true });
    },

    // The client ends coaching. Works as a block: the trainer loses access and neither side can
    // message the other. Coaching again takes a new invite from the trainer, accepted by the client.
    'POST /api/coaching/end': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const link = liveLinkOf(user.id);
      if (!link) return json(res, 404, { error: 'you have no trainer' });
      setStatus(link, 'blocked', user.id);
      audit(req, 'coaching.end', { user, target: userById(link.trainer_id) });
      json(res, 200, { ok: true });
    },

    // The trainer's open invites, newest first: pending ones, and expired ones for a while.
    'GET /api/coaching/invites': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      sweepLapsed();
      const rows = sql.prepare(
        `SELECT * FROM invites WHERE trainer_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC, id DESC`
      ).all(trainer.id, now() - EXPIRED_SHOWN_DAYS * DAY);
      json(res, 200, { invites: rows.map(inviteRow), days: INVITE_DAYS });
    },

    'POST /api/coaching/invites/new': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const firstName = str(body.firstName, 40);
      const email = str(body.email, 254).toLowerCase();
      if (!firstName) return json(res, 400, { error: 'first name required', code: 'missing' });
      if (email && !EMAIL.test(email)) return json(res, 400, { error: 'that email address does not look right', code: 'email' });
      const inv = createInvite(trainer, { firstName, email, note: str(body.note, 200) });
      audit(req, 'coaching.invite.create', { user: trainer, msg: firstName });
      json(res, 200, { invite: inviteRow(inv) });
    },

    'POST /api/coaching/invites/revoke': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const inv = ownInvite(trainer, body.id);
      if (!inv || inv.status !== 'pending') return json(res, 404, { error: 'no such invite' });
      revokeInvite(inv);
      audit(req, 'coaching.invite.revoke', { user: trainer, msg: inv.first_name });
      json(res, 200, { ok: true });
    },

    // "Send new": the old link stops working and a fresh one, with a new date, takes its place.
    'POST /api/coaching/invites/renew': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const old = ownInvite(trainer, body.id);
      if (!old || old.status !== 'pending') return json(res, 404, { error: 'no such invite' });
      const inv = tx(sql, () => {
        sql.prepare(`UPDATE invites SET status = 'revoked' WHERE id = ?`).run(old.id);
        return createInvite(trainer, { firstName: old.first_name, email: old.email, note: old.note });
      });
      sweepLapsed();
      audit(req, 'coaching.invite.renew', { user: trainer, msg: old.first_name });
      json(res, 200, { invite: inviteRow(inv) });
    },

    // The invite page. No session needed: the code is the secret, and only its holder learns the
    // trainer's name and the note. Opening it is what "Opened" on the trainer's roster shows.
    'GET /api/coaching/invite': async (req, res) => {
      const code = str(query(req, 'code'), 40).toUpperCase();
      const inv = code && sql.prepare('SELECT * FROM invites WHERE code = ?').get(code);
      if (!inv) return json(res, 404, { error: 'no such invite' });
      const status = inviteState(inv);
      if (status === 'pending' && !inv.opened_at) sql.prepare('UPDATE invites SET opened_at = ? WHERE id = ?').run(now(), inv.id);
      json(res, 200, {
        status: status === 'pending' ? 'valid' : status === 'joined' ? 'used' : status,
        trainer: { name: trainerName(inv.trainer_id) },
        ...(status === 'pending' ? { firstName: inv.first_name, note: inv.note || null, expires: inv.expires_at } : {})
      });
    },

    // Accepting is the client's consent. The person signed in takes the invite: right after
    // creating their account from the invite page, or with an account they already had.
    'POST /api/coaching/invites/accept': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const body = await readBody(req);
      const code = str(body.code, 40).toUpperCase();
      const inv = code && sql.prepare('SELECT * FROM invites WHERE code = ?').get(code);
      if (!inv) return json(res, 404, { error: 'no such invite' });
      const status = inviteState(inv);
      if (status === 'joined' && inv.client_id === user.id) return json(res, 200, { ok: true, trainer: { id: inv.trainer_id, name: trainerName(inv.trainer_id) } });
      if (status !== 'pending') return json(res, 410, { error: status === 'expired' ? 'this invite has expired' : 'this invite is no longer valid', code: status === 'joined' ? 'used' : status });
      if (inv.trainer_id === user.id) return json(res, 400, { error: 'this is your own invite', code: 'own' });
      const trainer = userById(inv.trainer_id);
      if (!isTrainer(trainer)) return json(res, 410, { error: 'this invite is no longer valid', code: 'revoked' });
      // On an invite-only instance someone else may have signed up with this code: it is theirs.
      const g = gymInvite(inv.code);
      if (g && g.usedBy && g.usedBy !== user.id) return json(res, 410, { error: 'this invite is no longer valid', code: 'used' });
      const live = liveLinkOf(user.id);
      if (live) {
        return json(res, 409, live.trainer_id === inv.trainer_id
          ? { error: 'you already train with this trainer', code: 'linked' }
          : { error: 'you already have a trainer. End that coaching first', code: 'other' });
      }
      const t = now();
      tx(sql, () => {
        const { lastInsertRowid: linkId } = sql.prepare(
          `INSERT INTO links (trainer_id, client_id, status, started_at) VALUES (?, ?, 'active', ?)`
        ).run(inv.trainer_id, user.id, t);
        const preset = sql.prepare('SELECT default_preset FROM trainers WHERE user_id = ?').get(inv.trainer_id)?.default_preset || null;
        sql.prepare('INSERT INTO link_settings (link_id, trainer_id, preset, updated_at) VALUES (?, ?, ?, ?)').run(linkId, inv.trainer_id, preset, t);
        sql.prepare(`UPDATE invites SET status = 'joined', client_id = ?, link_id = ? WHERE id = ?`).run(user.id, linkId, inv.id);
      });
      // Burn the openGym code as well, so nobody signs up with it afterwards.
      if (g && !g.usedBy) { g.usedBy = user.id; g.usedAt = new Date(t).toISOString(); saveDb(); }
      audit(req, 'coaching.invite.accept', { user, target: trainer });
      json(res, 200, { ok: true, trainer: { id: inv.trainer_id, name: trainerName(inv.trainer_id) } });
    }
  };
}
