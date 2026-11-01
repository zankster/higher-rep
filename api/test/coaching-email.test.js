/* trainer-fork: email (Phase 2c). The four templates and the sender on their own, then the routes
 * that send through a real server.js, which writes the emails to its log (no RESEND_API_KEY). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMailer, inviteEmail, resetEmail, guardianEmail, waiverEmail } from '../coaching/email.js';
import { startCoachingServer, user } from './coaching-harness.mjs';

const trainer = { name: 'Mike Smith', contactEmail: 'mike@higherrep.com' };
const DAY = 86400000;

test('the invite names the trainer, carries the note and the link, and escapes what was typed', () => {
  const m = inviteEmail({ trainer, firstName: 'Ava <b>', note: 'See you <script>', url: 'https://app.test/#/join/AB', expires: Date.UTC(2026, 10, 15, 12), tz: 'UTC' });
  assert.equal(m.subject, 'Mike Smith invited you to train with them');
  assert.match(m.html, /Ava &lt;b&gt;/);
  assert.match(m.html, /See you &lt;script&gt;/);
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /href="https:\/\/app\.test\/#\/join\/AB"/);
  assert.match(m.text, /Accept invite: https:\/\/app\.test\/#\/join\/AB/);
  assert.match(m.text, /works until 15 November/);
  assert.match(m.text, /Reply to this email to reach Mike Smith/);
});

test('the reset email says how long the link lives and that ignoring it changes nothing', () => {
  const m = resetEmail({ name: 'Ava', url: 'https://app.test/#/reset/X', minutes: 60 });
  assert.equal(m.subject, 'Reset your Higher Rep password');
  assert.match(m.text, /works once, for 1 hour/);
  assert.match(m.text, /Your password stays the same/);
});

test('the guardian email says what a guardian can do', () => {
  const m = guardianEmail({ trainer, guardianName: 'Dana', clientName: 'Ava', url: 'https://app.test/#/guardian/T', days: 7 });
  assert.equal(m.subject, "Please sign for Ava's training with Mike Smith");
  assert.match(m.text, /read and sign Mike Smith's documents for Ava/);
  assert.match(m.text, /Progress photos are off/);
  assert.match(m.text, /works once, for 7 days/);
});

test('the waiver copy attaches the PDF and carries no health answers', () => {
  const pdf = { filename: 'Waiver-v1.pdf', content: Buffer.from('%PDF-1.4') };
  const m = waiverEmail({ trainer, recipientName: 'Ava', signerName: 'Ava Reyes', title: 'Liability waiver', version: 1, signedAt: Date.UTC(2026, 10, 1, 14, 32), tz: 'UTC', tzLabel: 'UTC', pdf });
  assert.equal(m.subject, 'Your signed liability waiver with Mike Smith');
  assert.match(m.text, /Liability waiver, version 1/);
  assert.match(m.text, /1 November 2026 at 14:32 \(UTC time\)/);
  assert.deepEqual(m.attachments, [pdf]);
  assert.match(m.text, /health answers are never sent by email/);
});

test('without a key the sender only logs, with the address masked', async () => {
  const lines = [];
  const mailer = makeMailer({ log: l => lines.push(l), fetch: () => assert.fail('nothing is sent') });
  assert.equal(mailer.live, false);
  const r = await mailer.send({ to: 'ava@example.com', subject: 'Hi', html: '<p>x</p>', text: 'the link' });
  assert.deepEqual(r, { ok: true, logged: true });
  assert.match(lines[0], /the link/);
  assert.doesNotMatch(lines[0], /ava@example\.com/);
});

test('with a key it posts to Resend, and a name cannot break the header', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: 'em_1' }) }; };
  const mailer = makeMailer({ apiKey: 're_test', from: 'hello@higherrep.com', fetch: fake, log: () => {} });
  const r = await mailer.send({
    to: 'ava@example.com', via: 'Mike "Evil"\r\nBcc: x@y.z', replyTo: 'mike@higherrep.com', subject: 'Hi\r\nthere',
    html: '<p>x</p>', text: 'x', attachments: [{ filename: 'a.pdf', content: Buffer.from('hi') }],
  });
  assert.deepEqual(r, { ok: true, id: 'em_1' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.authorization, 'Bearer re_test');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.from, '"Mike Evil Bcc: x@y.z via Higher Rep" <hello@higherrep.com>');
  assert.equal(body.subject, 'Hi there');
  assert.equal(body.reply_to, 'mike@higherrep.com');
  assert.deepEqual(body.attachments, [{ filename: 'a.pdf', content: Buffer.from('hi').toString('base64') }]);
  assert.equal((await mailer.send({ to: 'not an address', subject: 'x', html: '', text: '' })).ok, false);
});

test('a failed send resolves, it never throws', async () => {
  const mailer = makeMailer({ apiKey: 'k', fetch: async () => { throw new Error('offline'); }, log: () => {} });
  assert.deepEqual(await mailer.send({ to: 'a@b.co', subject: 'x', html: '', text: '' }), { ok: false, error: 'network' });
  const refused = makeMailer({ apiKey: 'k', fetch: async () => ({ ok: false, status: 422, json: async () => ({ message: 'bad' }) }), log: () => {} });
  assert.equal((await refused.send({ to: 'a@b.co', subject: 'x', html: '', text: '' })).error, 'provider');
});

/* ---------- through the server ---------- */

const MIKE = 'u_mike', TESS = 'u_tess', ANA = 'u_ana';
const world = {
  users: [user(MIKE, 'Mike Smith', { admin: true, owner: true, trainer: true, email: 'mike@higherrep.com' }), user(TESS, 'Tess', { trainer: true }), user(ANA, 'Ana')],
  trainers: [MIKE, TESS],
  env: { PASSWORD_LOGIN: '1' },
};
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 20)); }
  return fn();
};

test('an invite with an email is emailed; one without is not', async t => {
  const h = await startCoachingServer(t, world);
  const r = await h.post(MIKE, '/api/coaching/invites/new', { firstName: 'Sam', email: 'sam@example.com', note: 'Monday 7am' });
  assert.equal(r.status, 200);
  assert.equal(r.body.emailed, true);
  const line = await until(() => h.log.includes(`Accept invite: ${r.body.invite.url}`));
  assert.ok(line, 'the logged email carries the join link');
  assert.match(h.log, /Mike Smith invited you to train with them/);
  assert.match(h.log, /"Monday 7am"/);

  const bare = await h.post(MIKE, '/api/coaching/invites/new', { firstName: 'Lee' });
  assert.equal(bare.body.emailed, null);

  // Send new emails the fresh link.
  const fresh = await h.post(MIKE, '/api/coaching/invites/renew', { id: r.body.invite.id });
  assert.equal(fresh.body.emailed, true);
  assert.ok(await until(() => h.log.includes(fresh.body.invite.url)));
});

test('Email again: own pending invites with an address, not twice in 10 minutes', async t => {
  const h = await startCoachingServer(t, world);
  const inv = (await h.post(MIKE, '/api/coaching/invites/new', { firstName: 'Sam', email: 'sam@example.com' })).body.invite;
  const bare = (await h.post(MIKE, '/api/coaching/invites/new', { firstName: 'Lee' })).body.invite;
  const again = (uid, id) => h.post(uid, '/api/coaching/invites/email', { id });
  assert.equal((await again(null, inv.id)).status, 401);
  assert.equal((await again(ANA, inv.id)).status, 403);
  assert.equal((await again(TESS, inv.id)).status, 404, 'another trainer\'s invite');
  assert.equal((await again(MIKE, bare.id)).body.code, 'no-email');
  assert.equal((await again(MIKE, inv.id)).body.code, 'too-soon', 'it was emailed on creation');
  await h.post(MIKE, '/api/coaching/invites/revoke', { id: inv.id });
  assert.equal((await again(MIKE, inv.id)).status, 404, 'a revoked invite');
});

test('forgot password: a link for a real address, the same answer for any other', async t => {
  const h = await startCoachingServer(t, world);
  const pw = 'correct horse battery staple';
  const reg = await fetch(h.api + '/api/register/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ava', password: pw, email: 'ava@example.com' }) });
  assert.equal(reg.status, 200);

  const forgot = email => h.post(null, '/api/coaching/password/forgot', { email });
  assert.equal((await forgot('nobody@example.com')).status, 200, 'no hint that the address is unknown');
  assert.equal((await forgot('nope')).body.code, 'email');
  assert.equal((await forgot('AVA@example.com')).status, 200);
  const code = (await until(() => h.log.match(/#\/reset\/([A-Z0-9-]+)/)))?.[1];
  assert.ok(code, 'the logged email carries the reset link');
  assert.doesNotMatch(h.log, /nobody@example\.com|Reset your Higher Rep password[\s\S]*nobody/);

  // Asking leaves the old password working.
  const login = await fetch(h.api + '/api/login/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ava@example.com', password: pw }) });
  assert.equal(login.status, 200);

  // A second ask within 2 minutes sends nothing new.
  const before = h.log.match(/#\/reset\//g).length;
  await forgot('ava@example.com');
  await new Promise(r => setTimeout(r, 100));
  assert.equal(h.log.match(/#\/reset\//g).length, before);

  // openGym's own route redeems it with the email, once.
  const redeem = next => fetch(h.api + '/api/login/password-reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ava@example.com', code, next }) });
  assert.equal((await redeem('a brand new long password')).status, 200);
  assert.equal((await redeem('another brand new password')).status, 400, 'single use');
});

test('forgot password leaves an admin-issued reset alone, and is off without password sign-in', async t => {
  const h = await startCoachingServer(t, { ...world, users: [...world.users, user('u_bo', 'Bo', { email: 'bo@example.com', pwReset: { h: 'x'.repeat(64), exp: Date.now() + DAY, by: MIKE } })] });
  await h.post(null, '/api/coaching/password/forgot', { email: 'bo@example.com' });
  await new Promise(r => setTimeout(r, 100));
  assert.doesNotMatch(h.log, /#\/reset\//);
  assert.equal(h.db().users.find(u => u.id === 'u_bo').pwReset.by, MIKE);

  const off = await startCoachingServer(t, { ...world, env: {} });
  assert.equal((await off.post(null, '/api/coaching/password/forgot', { email: 'bo@example.com' })).status, 404);
});
