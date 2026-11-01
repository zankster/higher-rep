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
import { makeMailer, inviteEmail, resetEmail, looksLikeEmail } from './email.js';
import { makeResetCode, hashResetCode, normalizeEmail } from '../password.js';
import { createWindow } from '../rate-limit.js';
import { documentRoutes } from './documents.js';
import { packetRoutes, saveAbout, createPacket, clearanceOf } from './packet.js';
import { MIN_AGE, parseDob, ageOn, cleanTz } from './submission.js';

export const INVITE_DAYS = 14;
// An expired invite stays on the roster this long, with "Send new", then drops off.
const EXPIRED_SHOWN_DAYS = 30;
const DAY = 86400000;
// A self-serve reset link lives an hour; the same inbox gets one at most every 2 minutes.
export const RESET_MINUTES = 60;
const RESET_GAP_MS = 2 * 60000;
// "Email again" for one invite at most every 10 minutes.
const INVITE_EMAIL_GAP_MS = 10 * 60000;

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function coachingRoutes({
  sql, users, invites, saveDb, json, readBody, readSession, requireOwner, audit, origin = '', now = Date.now,
  passwordLogin = false, env = process.env, dataDir = '',
  mailer = makeMailer({ apiKey: env.RESEND_API_KEY || '', from: env.MAIL_FROM || undefined, product: env.MAIL_NAME || undefined }),
}) {
  const access = makeAccess({ sql, users, json, readSession });
  const { userById, isTrainer, liveLinkOf, requireUser, requireTrainer, requireOwnClient } = access;
  const forgotByAddress = createWindow({ max: 5, windowMs: 15 * 60000 });
  const addressOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '?';
  const query = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);

  // A client's age and date of birth (from 2e), and where they stand with the paperwork.
  const clientRow = (link, u) => {
    const about = sql.prepare('SELECT dob FROM clients WHERE client_id = ?').get(link.client_id);
    const c = clearanceOf(sql, link.trainer_id, link.client_id);
    return {
      id: link.client_id, name: u ? u.name : null, status: link.status, since: link.started_at,
      dob: about?.dob || null, age: about ? ageOn(about.dob, now()) : null,
      cleared: c.cleared, paperwork: c.state, todo: c.todo,
    };
  };
  // The name a client sees: the trainer's branding name once 2g sets one, else their profile name.
  const trainerName = id => {
    const row = sql.prepare('SELECT branding FROM trainers WHERE user_id = ?').get(id);
    let b = {}; try { b = JSON.parse(row?.branding || '{}'); } catch { /* keep the default */ }
    return str(b.name, 60) || userById(id)?.name || null;
  };
  // Who a trainer email comes from: the branding contact once 2g sets one, else their sign-in email.
  const trainerInfo = id => {
    const row = sql.prepare('SELECT branding FROM trainers WHERE user_id = ?').get(id);
    let b = {}; try { b = JSON.parse(row?.branding || '{}'); } catch { /* keep the default */ }
    const contact = [b.contactEmail, userById(id)?.email].find(looksLikeEmail) || null;
    return { name: trainerName(id), contactEmail: contact, tagline: str(b.tagline, 60) || null };
  };
  const base = String(origin).replace(/\/$/, '');

  const invitesEmailedAt = new Map();
  async function emailInvite(inv) {
    if (!inv.email) return null;
    const trainer = trainerInfo(inv.trainer_id);
    const mail = inviteEmail({ trainer, firstName: inv.first_name, note: inv.note, url: joinUrl(inv.code), expires: inv.expires_at, tz: env.TZ });
    const r = await mailer.send({ to: inv.email, via: trainer.name, replyTo: trainer.contactEmail, ...mail });
    if (r.ok) invitesEmailedAt.set(inv.id, now());
    return r.ok;
  }

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
  const joinUrl = code => base + '/#/join/' + code;
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
    ...documentRoutes({ sql, access, json, readBody, audit, dataDir, now }),
    ...packetRoutes({ sql, access, json, readBody, audit, dataDir, now, mailer, trainerInfo, trainerName, base }),

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
      // `cleared` false means the trainer's required paperwork is not done yet (state says what).
      const c = link && clearanceOf(sql, link.trainer_id, user.id);
      json(res, 200, {
        trainer: isTrainer(user),
        coach: link ? { id: link.trainer_id, name: trainerName(link.trainer_id), status: link.status, since: link.started_at,
          cleared: c.cleared, paperwork: c.state, todo: c.todo, guardian: c.guardian } : null
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
      // emailed: null without an address, false when the email could not be sent (the link still works).
      json(res, 200, { invite: inviteRow(inv), emailed: await emailInvite(inv) });
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
      json(res, 200, { invite: inviteRow(inv), emailed: await emailInvite(inv) });
    },

    // "Email again": the same link, sent again to the address on the invite.
    'POST /api/coaching/invites/email': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const inv = ownInvite(trainer, body.id);
      if (!inv || inviteState(inv) !== 'pending') return json(res, 404, { error: 'no such invite' });
      if (!inv.email) return json(res, 400, { error: 'this invite has no email address', code: 'no-email' });
      const last = invitesEmailedAt.get(inv.id) || 0;
      if (now() - last < INVITE_EMAIL_GAP_MS) return json(res, 429, { error: 'the email was sent a moment ago', code: 'too-soon', retryAfter: Math.ceil((last + INVITE_EMAIL_GAP_MS - now()) / 1000) });
      const ok = await emailInvite(inv);
      if (!ok) return json(res, 502, { error: 'the email could not be sent', code: 'not-sent' });
      audit(req, 'coaching.invite.email', { user: trainer, msg: inv.first_name });
      json(res, 200, { ok: true });
    },

    // Forgot password: a one-hour reset link to the sign-in email. It answers the same whether
    // or not an account uses that address, so it tells nobody which addresses have accounts. The
    // link carries openGym's own reset code, redeemed by POST /api/login/password-reset with the
    // email; unlike an admin's reset, asking for one leaves the current password working.
    'POST /api/coaching/password/forgot': async (req, res) => {
      if (!passwordLogin) return json(res, 404, { error: 'not found' });
      const body = await readBody(req);
      const email = normalizeEmail(str(body.email, 254));
      if (!email) return json(res, 400, { error: 'that email address does not look right', code: 'email' });
      const wait = forgotByAddress.take(addressOf(req));
      if (wait) return json(res, 429, { error: 'too many requests', code: 'locked', retryAfter: wait });
      const done = () => json(res, 200, { ok: true });
      const u = users().find(x => x.email === email);
      if (!u || u.disabled) return done();
      const held = u.pwReset && u.pwReset.exp > now();
      // An admin's code is already out there and the old password is gone: leave it be.
      if (held && u.pwReset.by !== 'self') return done();
      if (held && now() - (u.pwReset.at || 0) < RESET_GAP_MS) return done();
      const code = makeResetCode();
      u.pwReset = { h: hashResetCode(code), exp: now() + RESET_MINUTES * 60000, by: 'self', at: now() };
      saveDb();
      const mail = resetEmail({ name: u.name, url: base + '/#/reset/' + code, minutes: RESET_MINUTES, product: env.MAIL_NAME || undefined });
      await mailer.send({ to: email, ...mail });
      audit(req, 'coaching.password.forgot', { user: u });
      done();
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
    // creating their account from the invite page, or with an account they already had. The date
    // of birth comes with it (asked first on the invite page); under 13 nothing is stored and no
    // link is made. The trainer's sign-up packet is asked for in the same step.
    'POST /api/coaching/invites/accept': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const body = await readBody(req);
      const code = str(body.code, 40).toUpperCase();
      const inv = code && sql.prepare('SELECT * FROM invites WHERE code = ?').get(code);
      if (!inv) return json(res, 404, { error: 'no such invite' });
      const status = inviteState(inv);
      if (status === 'joined' && inv.client_id === user.id) return json(res, 200, { ok: true, trainer: { id: inv.trainer_id, name: trainerName(inv.trainer_id) } });
      if (status !== 'pending') return json(res, 410, { error: status === 'expired' ? 'this invite has expired' : 'this invite is no longer valid', code: status === 'joined' ? 'used' : status });
      const dob = parseDob(body.dob, now());
      if (!dob) return json(res, 400, { error: 'date of birth required', code: 'dob' });
      if (ageOn(dob, now()) < MIN_AGE) return json(res, 400, { error: `you need to be ${MIN_AGE} or older`, code: 'too-young' });
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
        saveAbout(sql, user.id, dob, cleanTz(body.tz), t);
        createPacket(sql, { trainer_id: inv.trainer_id, client_id: user.id, started_at: t }, t);
      });
      // Burn the openGym code as well, so nobody signs up with it afterwards.
      if (g && !g.usedBy) { g.usedBy = user.id; g.usedAt = new Date(t).toISOString(); saveDb(); }
      audit(req, 'coaching.invite.accept', { user, target: trainer });
      json(res, 200, { ok: true, trainer: { id: inv.trainer_id, name: trainerName(inv.trainer_id) } });
    }
  };
}
