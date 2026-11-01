/* trainer-fork: invites, pause, remove and end coaching (Phase 2b). Every route is asked by the
 * people who must be refused as well as by the one who may. Real server.js in a child. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startCoachingServer, user } from './coaching-harness.mjs';

const MIKE = 'u_mike', TESS = 'u_tess', ADAM = 'u_adam', ANA = 'u_ana', PIA = 'u_pia',
  BEN = 'u_ben', CAL = 'u_cal', SAM = 'u_sam', NEW = 'u_new';
const world = {
  users: [
    user(MIKE, 'Mike', { admin: true, owner: true, trainer: true }), user(TESS, 'Tess', { trainer: true }),
    user(ADAM, 'Adam', { admin: true }), user(ANA, 'Ana'), user(PIA, 'Pia'), user(BEN, 'Ben'),
    user(CAL, 'Cal'), user(SAM, 'Sam'), user(NEW, 'Newt')
  ],
  trainers: [MIKE, TESS],
  links: [[MIKE, ANA, 'active'], [MIKE, PIA, 'paused'], [TESS, BEN, 'active'], [MIKE, CAL, 'blocked']]
};
const DAY = 86400000;
const invite = async (h, uid = MIKE, body = { firstName: 'Sam', email: 'sam@example.com', note: 'See you Monday' }) =>
  (await h.post(uid, '/api/coaching/invites/new', body)).body.invite;
const clientIds = async (h, uid) => (await h.get(uid, '/api/coaching/clients')).body.clients.map(c => c.id);

test('only a trainer creates invites, and sees only their own', async t => {
  const h = await startCoachingServer(t, world);
  const make = (uid, body) => h.post(uid, '/api/coaching/invites/new', body);
  assert.equal((await make(null, { firstName: 'X' })).status, 401);
  for (const uid of [ANA, SAM, ADAM]) assert.equal((await make(uid, { firstName: 'X' })).status, 403, uid);
  assert.equal((await make(MIKE, { firstName: '  ' })).body.code, 'missing');
  assert.equal((await make(MIKE, { firstName: 'Sam', email: 'not-an-address' })).body.code, 'email');

  const inv = await invite(h);
  assert.equal(inv.status, 'pending');
  assert.match(inv.code, /^[0-9A-F]{16}$/);
  assert.equal(inv.url, `http://localhost:8080/#/join/${inv.code}`, 'the link is on the server\'s ORIGIN');
  assert.equal(inv.firstName, 'Sam');
  assert.equal(inv.email, 'sam@example.com');
  assert.ok(Math.abs(inv.expires - inv.created - 14 * DAY) < 1000, '14 days');
  const g = h.db().invites.find(i => i.code === inv.code);
  assert.equal(g.createdBy, MIKE, 'it is an openGym invite code as well');

  assert.deepEqual((await h.get(MIKE, '/api/coaching/invites')).body.invites.map(i => i.id), [inv.id]);
  assert.deepEqual((await h.get(TESS, '/api/coaching/invites')).body.invites, []);
  assert.equal((await h.get(SAM, '/api/coaching/invites')).status, 403);
  // Tess can't touch Mike's invite.
  assert.equal((await h.post(TESS, '/api/coaching/invites/revoke', { id: inv.id })).status, 404);
  assert.equal((await h.post(TESS, '/api/coaching/invites/renew', { id: inv.id })).status, 404);
  assert.equal((await h.post(ANA, '/api/coaching/invites/revoke', { id: inv.id })).status, 403);
  assert.equal((await h.get(MIKE, '/api/coaching/invites')).body.invites[0].status, 'pending', 'still there');
});

test('the invite page needs no session, names the trainer and marks the invite opened', async t => {
  const h = await startCoachingServer(t, world);
  const inv = await invite(h);
  assert.equal((await h.get(MIKE, '/api/coaching/invites')).body.invites[0].opened, null);
  const page = await h.get(null, `/api/coaching/invite?code=${inv.code.toLowerCase()}`);
  assert.equal(page.status, 200);
  assert.deepEqual({ ...page.body, expires: 0 }, { status: 'valid', trainer: { name: 'Mike', business: null, tagline: null, logo: null, accent: '#2457E6' }, firstName: 'Sam', note: 'See you Monday', expires: 0 });
  assert.ok((await h.get(MIKE, '/api/coaching/invites')).body.invites[0].opened > 0);
  assert.equal((await h.get(null, '/api/coaching/invite?code=0000000000000000')).status, 404);
  assert.equal((await h.get(null, '/api/coaching/invite')).status, 404);
});

test('accepting links the signed-in person once, and nobody else after them', async t => {
  const h = await startCoachingServer(t, world);
  const inv = await invite(h);
  const accept = uid => h.post(uid, '/api/coaching/invites/accept', { code: inv.code, dob: '1990-05-01' });
  assert.equal((await accept(null)).status, 401);
  assert.equal((await accept(MIKE)).body.code, 'own');
  assert.equal((await accept(BEN)).body.code, 'other', 'Ben already trains with Tess');
  assert.equal((await accept(ANA)).body.code, 'linked', 'Ana already trains with Mike');
  assert.equal((await h.post(SAM, '/api/coaching/invites/accept', { code: 'NOPE' })).status, 404);

  const ok = await accept(SAM);
  assert.deepEqual(ok.body, { ok: true, trainer: { id: MIKE, name: 'Mike' } });
  assert.deepEqual(await clientIds(h, MIKE), [ANA, PIA, SAM]);
  assert.deepEqual(await clientIds(h, TESS), [BEN]);
  assert.equal((await h.get(SAM, '/api/coaching/me')).body.coach.id, MIKE);
  assert.equal((await accept(SAM)).status, 200, 'accepting twice is harmless');
  const r = await accept(NEW);
  assert.equal(r.status, 410);
  assert.equal(r.body.code, 'used');
  assert.equal(h.db().invites.find(i => i.code === inv.code).usedBy, SAM, 'the openGym code is burned');
  assert.equal((await h.get(null, `/api/coaching/invite?code=${inv.code}`)).body.status, 'used');
  assert.deepEqual((await h.get(MIKE, '/api/coaching/invites')).body.invites, [], 'a joined invite leaves the list');
  h.sql(s => assert.ok(s.prepare('SELECT 1 FROM link_settings JOIN links ON links.id = link_id WHERE client_id = ?').get(SAM), 'settings row made'));
});

test('a client who ended coaching can be coached again through a new invite', async t => {
  const h = await startCoachingServer(t, world);
  assert.equal((await h.get(CAL, '/api/coaching/me')).body.coach, null);
  const inv = await invite(h, MIKE, { firstName: 'Cal' });
  assert.equal((await h.post(CAL, '/api/coaching/invites/accept', { code: inv.code, dob: '1990-05-01' })).status, 200);
  assert.ok((await clientIds(h, MIKE)).includes(CAL));
});

test('a revoked invite opens nothing, here or at sign-up', async t => {
  const h = await startCoachingServer(t, world);
  const inv = await invite(h);
  assert.deepEqual((await h.post(MIKE, '/api/coaching/invites/revoke', { id: inv.id })).body, { ok: true });
  assert.equal((await h.post(MIKE, '/api/coaching/invites/revoke', { id: inv.id })).status, 404);
  assert.equal((await h.post(SAM, '/api/coaching/invites/accept', { code: inv.code, dob: '1990-05-01' })).body.code, 'revoked');
  assert.equal((await h.get(null, `/api/coaching/invite?code=${inv.code}`)).body.status, 'revoked');
  assert.equal(h.db().invites.find(i => i.code === inv.code).revoked, true);
  assert.deepEqual((await h.get(MIKE, '/api/coaching/invites')).body.invites, []);
});

test('an expired invite shows as expired, refuses, and "Send new" replaces it', async t => {
  const h = await startCoachingServer(t, world);
  const inv = await invite(h);
  h.sql(s => s.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, inv.id));
  const listed = (await h.get(MIKE, '/api/coaching/invites')).body.invites;
  assert.equal(listed[0].status, 'expired');
  assert.equal(listed[0].code, undefined, 'no link to copy');
  assert.equal(h.db().invites.find(i => i.code === inv.code).revoked, true, 'its openGym code is revoked');
  assert.equal((await h.post(SAM, '/api/coaching/invites/accept', { code: inv.code, dob: '1990-05-01' })).body.code, 'expired');

  const fresh = (await h.post(MIKE, '/api/coaching/invites/renew', { id: inv.id })).body.invite;
  assert.equal(fresh.status, 'pending');
  assert.notEqual(fresh.code, inv.code);
  assert.equal(fresh.firstName, 'Sam');
  assert.deepEqual((await h.get(MIKE, '/api/coaching/invites')).body.invites.map(i => i.id), [fresh.id]);
  assert.equal((await h.post(SAM, '/api/coaching/invites/accept', { code: fresh.code, dob: '1990-05-01' })).status, 200);

  // A month after expiry it drops off the roster.
  const old = await invite(h, MIKE, { firstName: 'Old' });
  h.sql(s => s.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run(Date.now() - 31 * DAY, old.id));
  assert.deepEqual((await h.get(MIKE, '/api/coaching/invites')).body.invites, []);
});

test('pause and remove are the trainer\'s, for their own clients only', async t => {
  const h = await startCoachingServer(t, world);
  const pause = (uid, id, paused) => h.post(uid, '/api/coaching/client/pause', { id, paused });
  assert.equal((await pause(null, ANA, true)).status, 401);
  assert.equal((await pause(SAM, ANA, true)).status, 403);
  assert.equal((await pause(ANA, ANA, true)).status, 403, 'a client cannot pause themself');
  assert.equal((await pause(TESS, ANA, true)).status, 404);
  assert.equal((await pause(MIKE, BEN, true)).status, 404);
  assert.equal((await pause(MIKE, ANA, 'yes')).status, 400);
  assert.equal((await pause(MIKE, ANA, true)).body.client.status, 'paused');
  assert.equal((await h.get(ANA, '/api/coaching/me')).body.coach.status, 'paused');
  assert.equal((await pause(MIKE, ANA, false)).body.client.status, 'active');

  const remove = (uid, id) => h.post(uid, '/api/coaching/client/remove', { id });
  assert.equal((await remove(TESS, PIA)).status, 404);
  assert.equal((await remove(PIA, PIA)).status, 403);
  assert.deepEqual((await remove(MIKE, PIA)).body, { ok: true });
  assert.equal((await remove(MIKE, PIA)).status, 404, 'gone already');
  assert.equal((await h.get(MIKE, `/api/coaching/client?id=${PIA}`)).status, 404);
  assert.equal((await h.get(PIA, '/api/coaching/me')).body.coach, null);
  h.sql(s => {
    const l = s.prepare('SELECT * FROM links WHERE client_id = ?').get(PIA);
    assert.deepEqual([l.status, l.ended_by], ['ended', MIKE], 'kept as the record, not deleted');
  });
});

test('a client ends coaching as a block, and only their own', async t => {
  const h = await startCoachingServer(t, world);
  assert.equal((await h.post(null, '/api/coaching/end', {})).status, 401);
  assert.equal((await h.post(SAM, '/api/coaching/end', {})).status, 404, 'no trainer to end');
  assert.deepEqual((await h.post(ANA, '/api/coaching/end', {})).body, { ok: true });
  assert.equal((await h.get(MIKE, `/api/coaching/client?id=${ANA}`)).status, 404);
  assert.deepEqual(await clientIds(h, MIKE), [PIA]);
  assert.deepEqual(await clientIds(h, TESS), [BEN], 'Ben is untouched');
  assert.equal((await h.post(ANA, '/api/coaching/end', {})).status, 404);
  h.sql(s => {
    const l = s.prepare('SELECT * FROM links WHERE client_id = ?').get(ANA);
    assert.deepEqual([l.status, l.ended_by], ['blocked', ANA]);
  });
  // The trainer can no longer pause or remove her either.
  assert.equal((await h.post(MIKE, '/api/coaching/client/pause', { id: ANA, paused: true })).status, 404);
  assert.equal(h.stackFrames(), 0);
});

test('on an invite-only instance the coaching code is the sign-up code, until it lapses', async t => {
  const h = await startCoachingServer(t, { ...world, env: { INVITE_ONLY: '1', PASSWORD_LOGIN: '1' } });
  const signUp = async (name, code) => {
    const r = await fetch(h.api + '/api/register/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password: 'correct horse battery staple', code })
    });
    return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], body: await r.json() };
  };
  const inv = await invite(h, MIKE, { firstName: 'Zoe' });
  const zoe = await signUp('Zoe', inv.code);
  assert.equal(zoe.status, 200);
  const r = await fetch(h.api + '/api/coaching/invites/accept', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: zoe.cookie }, body: JSON.stringify({ code: inv.code, dob: '1990-05-01' })
  });
  assert.equal(r.status, 200, 'the person who signed up with the code takes the invite');
  assert.ok((await clientIds(h, MIKE)).includes(zoe.body.user.id));

  const lapsed = await invite(h, MIKE, { firstName: 'Yan' });
  h.sql(s => s.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, lapsed.id));
  await h.get(MIKE, '/api/coaching/invites');   // the sweep runs before the list
  assert.equal((await signUp('Yan', lapsed.code)).status, 403, 'a lapsed code opens no account');
});
