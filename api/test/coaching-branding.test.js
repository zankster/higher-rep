/* trainer-fork: branding and the trainer's settings (Phase 2g). The pure rules (the six colours,
 * phone and website clean-up, PNG size), then the routes through a real server.js: who may call
 * them, the logo that only a trainer's current logo hash can fetch, the phone number a client sees
 * only when switched on, the preset new clients start with, and the invite page and email that
 * carry the brand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { SWATCHES, contrastWithWhite, cleanPhone, cleanWebsite, pngInfo } from '../coaching/branding.js';
import { inviteEmail } from '../coaching/email.js';
import { startCoachingServer, user } from './coaching-harness.mjs';

const MIKE = 'u_mike', ANA = 'u_ana', BEN = 'u_ben', TESS = 'u_tess', SAM = 'u_sam';

/** A real w×h PNG: one grey row repeated. */
function png(w, h) {
  const crcTable = n => zlib.crc32(n);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crcTable(Buffer.concat([Buffer.from(type, 'latin1'), data])));
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h, 0x80); for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('the six colours all carry white text at 4.5:1 or better', () => {
  assert.equal(SWATCHES.length, 6);
  assert.equal(SWATCHES[0].hex, '#2457E6', 'Coach blue comes first: it is the default');
  for (const s of SWATCHES) assert.ok(contrastWithWhite(s.hex) >= 4.5, `${s.name} ${contrastWithWhite(s.hex).toFixed(2)}`);
  assert.ok(contrastWithWhite('#FFCC00') < 4.5, 'and the check does catch a light colour');
});

test('phone numbers, websites and PNG sizes', () => {
  assert.equal(cleanPhone(' +1 (555) 010-2030 '), '+1 (555) 010-2030');
  assert.equal(cleanPhone(''), '');
  assert.equal(cleanPhone('call me'), null);
  assert.equal(cleanPhone('12345'), null, 'too few digits');
  assert.equal(cleanWebsite('smithstrength.com'), 'https://smithstrength.com/');
  assert.equal(cleanWebsite('http://a.example.org/x'), 'http://a.example.org/x');
  assert.equal(cleanWebsite('javascript:alert(1)'), null);
  assert.equal(cleanWebsite('https://user:pw@example.com'), null);
  assert.equal(cleanWebsite('localhost'), null);
  assert.deepEqual(pngInfo(png(40, 30)), { w: 40, h: 30 });
  assert.equal(pngInfo(Buffer.from('not a png at all, really not')), null);
});

test('branding: trainer only, saved field by field, cleared back to Higher Rep’s look', async t => {
  const h = await startCoachingServer(t, {
    users: [user(MIKE, 'Mike Smith', { trainer: true, email: 'mike@example.com' }), user(TESS, 'Tess', { trainer: true }), user(ANA, 'Ana'), user(SAM, 'Sam')],
    trainers: [MIKE, TESS], links: [[MIKE, ANA, 'active']],
  });
  assert.equal((await h.get(null, '/api/coaching/branding')).status, 401);
  assert.equal((await h.get(ANA, '/api/coaching/branding')).status, 403, 'a client is not a trainer');
  assert.equal((await h.post(SAM, '/api/coaching/branding', { business: 'x' })).status, 403);

  const fresh = (await h.get(MIKE, '/api/coaching/branding')).body;
  assert.deepEqual(fresh.branding, { business: null, tagline: null, mailFrom: null, accent: 'blue', contactEmail: null, phone: null, website: null, logo: null });
  assert.equal(fresh.name, 'Mike Smith');
  assert.equal(fresh.signInEmail, 'mike@example.com');
  assert.equal(fresh.preset, 'balanced', 'Balanced until the trainer picks');
  assert.deepEqual(fresh.phoneShown, { shown: 0, of: 1 });
  assert.equal(fresh.swatches.length, 6);

  let r = await h.post(MIKE, '/api/coaching/branding', { business: '  Smith\nStrength ', accent: 'teal' });
  assert.equal(r.status, 200);
  assert.equal(r.body.branding.business, 'Smith Strength', 'one line');
  assert.equal(r.body.branding.accent, 'teal');
  r = await h.post(MIKE, '/api/coaching/branding', { tagline: 'Strength for real life', phone: '+1 555 010 2030', website: 'smithstrength.com', contactEmail: 'Coach@SmithStrength.com', mailFrom: 'Mike at Smith Strength' });
  assert.equal(r.body.branding.business, 'Smith Strength', 'fields not sent stay as they were');
  assert.equal(r.body.branding.website, 'https://smithstrength.com/');
  assert.equal(r.body.branding.contactEmail, 'coach@smithstrength.com');

  for (const [body, code] of [[{ accent: 'pink' }, 'accent'], [{ contactEmail: 'nope' }, 'email'], [{ phone: 'call me' }, 'phone'], [{ website: 'ftp://x.com' }, 'website'], [{ logo: 'abc' }, 'logo'], [{ business: 5 }, 'business']]) {
    const bad = await h.post(MIKE, '/api/coaching/branding', body);
    assert.equal(bad.status, 400, JSON.stringify(body));
    assert.equal(bad.body.code, code);
  }
  r = await h.post(MIKE, '/api/coaching/branding', { accent: null, phone: '' });
  assert.equal(r.body.branding.accent, 'blue', 'cleared: Coach blue');
  assert.equal(r.body.branding.phone, null);
  assert.equal((await h.get(TESS, '/api/coaching/branding')).body.branding.business, null, 'each trainer has their own');

  assert.equal((await h.post(ANA, '/api/coaching/default-preset', { preset: 'independent' })).status, 403);
  assert.equal((await h.post(MIKE, '/api/coaching/default-preset', { preset: 'custom' })).body.code, 'preset');
  assert.deepEqual((await h.post(MIKE, '/api/coaching/default-preset', { preset: 'hands_on' })).body, { preset: 'hands_on' });
  assert.equal((await h.get(MIKE, '/api/coaching/branding')).body.preset, 'hands_on');
});

test('the logo: PNG or JPEG up to 2 MB, served only while it is some trainer’s logo', async t => {
  const h = await startCoachingServer(t, { users: [user(MIKE, 'Mike', { trainer: true }), user(ANA, 'Ana')], trainers: [MIKE], links: [[MIKE, ANA, 'active']] });
  const up = (uid, buf, type = 'image/png') => fetch(h.api + '/api/coaching/branding/logo', { method: 'POST', headers: { 'content-type': type, Cookie: `gymsid=${h.mint(uid)}` }, body: buf });
  const logo = png(64, 64);
  assert.equal((await up(ANA, logo)).status, 403, 'a client cannot set one');
  assert.equal((await up(MIKE, logo, 'image/gif')).status, 415);
  assert.equal((await up(MIKE, logo, 'image/jpeg')).status, 400, 'the bytes must be what the type says');
  assert.equal((await (await up(MIKE, png(8, 8))).json()).code, 'dims', 'too small to read');
  assert.equal((await up(MIKE, Buffer.concat([logo, Buffer.alloc(2 * 1024 * 1024)]))).status, 413);

  const r = await up(MIKE, logo);
  assert.equal(r.status, 200);
  const hash = (await r.json()).branding.logo;
  assert.match(hash, /^[0-9a-f]{64}$/);
  const got = await fetch(h.api + '/api/coaching/logo?h=' + hash);
  assert.equal(got.status, 200, 'no session needed: email clients load it');
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.from(await got.arrayBuffer()).equals(logo));

  // Another file in the store, a client's signature say, is not reachable through the logo route.
  const other = h.sql(s => s.prepare(`SELECT hash FROM files WHERE hash != ?`).get(hash));
  assert.equal(other, undefined);
  assert.equal((await fetch(h.api + '/api/coaching/logo?h=' + 'a'.repeat(64))).status, 404);
  assert.equal((await fetch(h.api + '/api/coaching/logo?h=../secret')).status, 404);

  await h.post(MIKE, '/api/coaching/branding', { logo: null });
  assert.equal((await fetch(h.api + '/api/coaching/logo?h=' + hash)).status, 404, 'removed: no longer served');
});

test('the phone number reaches only the clients it is switched on for', async t => {
  const h = await startCoachingServer(t, {
    users: [user(MIKE, 'Mike Smith', { trainer: true, email: 'mike@example.com' }), user(TESS, 'Tess', { trainer: true }), user(ANA, 'Ana'), user(BEN, 'Ben'), user(SAM, 'Sam')],
    trainers: [MIKE, TESS], links: [[MIKE, ANA, 'active'], [MIKE, BEN, 'paused']],
  });
  await h.post(MIKE, '/api/coaching/branding', { business: 'Smith Strength', phone: '+1 555 010 2030' });

  let ana = (await h.get(ANA, '/api/coaching/my/trainer')).body.trainer;
  assert.equal(ana.name, 'Mike Smith');
  assert.equal(ana.business, 'Smith Strength');
  assert.equal(ana.email, 'mike@example.com', 'the email is shown to every client');
  assert.equal(ana.phone, null, 'off for every new client');
  assert.equal(ana.accent, '#2457E6');
  assert.equal((await h.get(SAM, '/api/coaching/my/trainer')).status, 404, 'no trainer, nothing to show');
  assert.equal((await h.get(null, '/api/coaching/my/trainer')).status, 401);

  assert.equal((await h.post(TESS, '/api/coaching/client/phone', { id: ANA, show: true })).status, 404, 'not her client');
  assert.equal((await h.post(MIKE, '/api/coaching/client/phone', { id: ANA, show: 'yes' })).status, 400);
  const on = await h.post(MIKE, '/api/coaching/client/phone', { id: ANA, show: true });
  assert.deepEqual(on.body, { showPhone: true, phoneShown: { shown: 1, of: 2 } }, 'Ben has no settings row yet: he counts as off');
  assert.equal((await h.get(ANA, '/api/coaching/my/trainer')).body.trainer.phone, '+1 555 010 2030');
  assert.equal((await h.get(BEN, '/api/coaching/my/trainer')).body.trainer.phone, null, 'Ben was not switched on');
  assert.deepEqual((await h.get(MIKE, '/api/coaching/client/profile?id=' + ANA)).body.sees, { email: 'mike@example.com', phone: '+1 555 010 2030', showPhone: true });
  assert.equal((await h.post(MIKE, '/api/coaching/client/phone', { id: BEN, show: true })).body.phoneShown.shown, 2, 'a paused client can be switched on too');

  // Nothing else the client reads carries the number.
  const seen = JSON.stringify([(await h.get(ANA, '/api/coaching/me')).body]);
  assert.ok(!seen.includes('555'), seen);
  await h.post(MIKE, '/api/coaching/client/phone', { id: ANA, show: false });
  assert.equal((await h.get(ANA, '/api/coaching/my/trainer')).body.trainer.phone, null);
  assert.equal((await h.get(ANA, '/api/coaching/me')).body.coach.business, 'Smith Strength');
});

test('new clients start with the trainer’s preset; the invite page and email carry the brand', async t => {
  const h = await startCoachingServer(t, { users: [user(MIKE, 'Mike Smith', { trainer: true, email: 'mike@example.com' }), user(ANA, 'Ana'), user(BEN, 'Ben')], trainers: [MIKE] });
  const join = async (uid, email) => {
    const inv = (await h.post(MIKE, '/api/coaching/invites/new', { firstName: uid, email })).body.invite;
    const page = (await h.get(null, '/api/coaching/invite?code=' + inv.code)).body;
    await h.post(uid, '/api/coaching/invites/accept', { code: inv.code, dob: '1990-05-01' });
    return page;
  };
  await join(ANA);
  await h.post(MIKE, '/api/coaching/default-preset', { preset: 'independent' });
  await h.post(MIKE, '/api/coaching/branding', { business: 'Smith Strength', tagline: 'Strength for real life', accent: 'green', mailFrom: 'Mike at Smith Strength' });
  const page = await join(BEN, 'ben@example.com');
  const presets = h.sql(s => s.prepare('SELECT l.client_id, s.preset, s.show_phone FROM links l JOIN link_settings s ON s.link_id = l.id ORDER BY l.id').all().map(r => ({ ...r })));
  assert.deepEqual(presets, [{ client_id: ANA, preset: 'balanced', show_phone: 0 }, { client_id: BEN, preset: 'independent', show_phone: 0 }], 'Ana keeps hers');
  assert.deepEqual(page.trainer, { name: 'Mike Smith', business: 'Smith Strength', tagline: 'Strength for real life', logo: null, accent: '#1E7B34' });
  assert.match(h.log, /Mike Smith invited you to Higher Rep/, 'the email body names the person');
  assert.match(h.log, /Sent by Higher Rep for Mike Smith/);
});

test('the email header: the business name over the trainer’s, their colour, their logo', () => {
  const plain = inviteEmail({ trainer: { name: 'Mike' }, firstName: 'Ava', url: 'https://app.test/#/join/AB', expires: Date.UTC(2026, 10, 15) });
  assert.match(plain.html, /background:#2457E6/, 'Higher Rep blue by default');
  const branded = inviteEmail({
    trainer: { name: 'Mike Smith', business: 'Smith Strength', accent: '#1E7B34', logoUrl: 'https://app.test/api/coaching/logo?h=' + 'a'.repeat(64) },
    firstName: 'Ava', url: 'https://app.test/#/join/AB', expires: Date.UTC(2026, 10, 15),
  });
  assert.match(branded.html, /background:#1E7B34/);
  assert.ok(!branded.html.includes('#2457E6'));
  assert.match(branded.html, /<img src="https:\/\/app\.test\/api\/coaching\/logo\?h=a{64}"/);
  assert.match(branded.html, /Smith Strength<\/div><div[^>]*>Mike Smith<\/div>/, 'business on top, the trainer below');
  const odd = inviteEmail({ trainer: { name: 'M', accent: 'red;background:url(x)', logoUrl: 'javascript:x' }, firstName: 'A', url: 'https://a.test', expires: 0 });
  assert.ok(!odd.html.includes('url(x)') && !odd.html.includes('javascript:'), 'only a colour and a web address get in');
});
