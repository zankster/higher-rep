/* trainer-fork: the client's side of the paperwork (Phase 2e). The pure rules and the PDF writer
 * on their own, then the routes through a real server.js: joining with a date of birth, the
 * packet, signing, the guardian, photos returned, and who is cleared to train. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDob, ageOn, checkAnswers, clearance, contentHash, signatureJpeg } from '../coaching/submission.js';
import { makePdf, wrap, jpegInfo, photosToPdf } from '../coaching/pdf.js';
import { startCoachingServer, user } from './coaching-harness.mjs';

// The smallest JPEG there is (1 x 1, grey), and the same padded so it passes the size floor of a
// signature.
const TINY = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const SIG = 'data:image/jpeg;base64,' + Buffer.concat([TINY.subarray(0, 20), Buffer.alloc(60, 0), TINY.subarray(20)]).toString('base64');
const DAY = 86400000;
const isoYearsAgo = (y, extraDays = 0) => { const d = new Date(Date.now() - extraDays * DAY); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };

test('a date of birth is a real day in the past, and age counts whole years', () => {
  assert.equal(parseDob('2010-02-30'), null);
  assert.equal(parseDob('1899-12-31'), null);
  assert.equal(parseDob('3000-01-01'), null);
  assert.equal(parseDob('12/03/2010'), null);
  assert.equal(parseDob('2010-03-12'), '2010-03-12');
  const at = Date.UTC(2026, 10, 1);
  assert.equal(ageOn('2013-11-01', at), 13, 'the birthday itself counts');
  assert.equal(ageOn('2013-11-02', at), 12);
  assert.equal(ageOn('2008-11-02', at), 17);
});

test('answers are checked against the questions', () => {
  const qs = [
    { id: 'h', type: 'yes_no', text: 'Heart?', required: true, flagYes: true, followUp: { type: 'long_text', text: 'Tell me' } },
    { id: 'g', type: 'choice', text: 'Goal', required: true, options: ['Strength', 'Health'], multi: false },
    { id: 'n', type: 'short_text', text: 'Note', required: false },
    { id: 's', type: 'signature', text: 'Sign', required: true },
  ];
  assert.deepEqual(checkAnswers(qs, {}), { code: 'required', index: 0 });
  assert.deepEqual(checkAnswers(qs, { h: { yes: true } }), { code: 'follow-up', index: 0 });
  assert.deepEqual(checkAnswers(qs, { h: { yes: false }, g: 'Cardio' }), { code: 'choice', index: 1 });
  assert.deepEqual(checkAnswers(qs, { h: { yes: false }, g: 'Health', s: 'data:image/png;base64,AAAA' }), { code: 'signature', index: 3 });
  const ok = checkAnswers(qs, { h: { yes: true, followUp: ' Murmur ' }, g: 'Health', s: SIG, junk: 1 });
  assert.equal(ok.flagged, 1);
  assert.deepEqual(ok.answers, { h: { yes: true, followUp: 'Murmur' }, g: 'Health' });
  assert.ok(Buffer.isBuffer(ok.signatures.s));
  assert.equal(signatureJpeg('data:image/jpeg;base64,AAAA'), null, 'too small to be a signature');
  assert.equal(contentHash('sign', { file: { hash: 'f'.repeat(64) } }), 'f'.repeat(64));
  assert.equal(contentHash('sign', { text: 'a' }), contentHash('sign', { text: 'a' }));
  assert.notEqual(contentHash('sign', { text: 'a' }), contentHash('sign', { text: 'a ' }));
});

test('cleared means nothing required is left, the guardian included', () => {
  assert.equal(clearance({ about: false, open: [] }).state, 'about');
  assert.equal(clearance({ about: true, open: [] }).state, 'cleared');
  assert.equal(clearance({ about: true, open: [{ required: 0 }] }).cleared, true, 'an optional to-do never blocks');
  assert.equal(clearance({ about: true, open: [{ required: 1 }] }).state, 'todo');
  const g = clearance({ about: true, open: [{ required: 1, client_done_at: 1, guardian_needed: 1 }] });
  assert.deepEqual([g.state, g.cleared, g.guardian, g.todo], ['guardian', false, 1, 0]);
});

test('the PDF writer wraps text, embeds JPEGs and writes a sound cross-reference table', () => {
  assert.deepEqual(jpegInfo(TINY), { w: 1, h: 1, space: '/DeviceGray', cmyk: false });
  assert.equal(jpegInfo(Buffer.from('nope')), null);
  const lines = wrap('one two three four five six seven eight nine ten', 10, 60);
  assert.ok(lines.length > 2 && lines.every(l => l.length));
  assert.equal(wrap('a\n\nb', 10, 500).length, 3, 'blank lines stay');
  const doc = makePdf({ title: 'Waiver' });
  doc.text('Liability waiver', { size: 18, bold: true });
  for (let i = 0; i < 120; i++) doc.text(`Line ${i}: “quoted” – dashed, (brackets) and back\\slash ✓`);
  doc.image(TINY, { frame: true });
  const buf = doc.toBuffer();
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\/Count [2-9]/, 'long text runs onto more pages');
  assert.match(s, /\/Filter \/DCTDecode/);
  const start = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.slice(start).startsWith('xref'));
  const offsets = s.slice(start).split('\n').slice(3).filter(l => / 00000 n $/.test(l)).map(l => Number(l.slice(0, 10)));
  offsets.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1} is where the table says`));
  assert.match(photosToPdf([TINY, TINY]).toString('latin1'), /\/Count 2/);
});

/* ---------- through the server ---------- */

const MIKE = 'u_mike', TESS = 'u_tess', ANA = 'u_ana', ZOE = 'u_zoe', KID = 'u_kid', OLD = 'u_old';
const world = {
  users: [user(MIKE, 'Mike', { admin: true, owner: true, trainer: true }), user(TESS, 'Tess', { trainer: true }),
    user(ANA, 'Ana', { email: 'ana@example.com' }), user(ZOE, 'Zoe'), user(KID, 'Kid'), user(OLD, 'Old')],
  trainers: [MIKE, TESS],
  links: [[MIKE, OLD, 'active']],
};
const newDoc = async (h, title, kind, body, { packet = true } = {}) => {
  const d = (await h.post(MIKE, '/api/coaching/documents/new', { title, kind, rights: true })).body.document;
  if (body) {
    await h.post(MIKE, '/api/coaching/document/draft', { id: d.id, body });
    assert.equal((await h.post(MIKE, '/api/coaching/document/publish', { id: d.id })).status, 200);
  }
  return d;
};
async function library(h) {
  const parq = await newDoc(h, 'PAR-Q', 'form', { questions: [{ id: 'h', type: 'yes_no', text: 'Heart?', flagYes: true, followUp: { type: 'long_text', text: 'Tell me' } }] });
  const waiver = await newDoc(h, 'Liability waiver', 'sign', { text: 'I accept the risks of training.' });
  const draftOnly = await newDoc(h, 'Not ready', 'sign', null);
  const up = await fetch(h.api + '/api/coaching/files', { method: 'POST', headers: { 'Content-Type': 'application/pdf', Cookie: `gymsid=${h.mint(MIKE)}` }, body: Buffer.from('%PDF-1.4\n%%EOF\n') });
  const pdf = (await up.json()).hash;
  const photo = await newDoc(h, 'Photo consent', 'pdf_return', { file: { hash: pdf, name: 'consent.pdf' } });
  const ids = [parq.id, waiver.id, draftOnly.id, photo.id];
  await h.post(MIKE, '/api/coaching/documents/packet', { ids });
  for (const d of [parq, waiver]) assert.equal((await h.post(MIKE, '/api/coaching/document/required', { id: d.id, required: true })).status, 200);
  return { parq, waiver, draftOnly, photo };
}
const invite = async (h, firstName) => (await h.post(MIKE, '/api/coaching/invites/new', { firstName })).body.invite;
const join = (h, uid, code, dob) => h.post(uid, '/api/coaching/invites/accept', { code, dob, tz: 'Europe/Zurich' });
const mine = async (h, uid) => (await h.get(uid, '/api/coaching/my/documents')).body;
const submit = (h, uid, body) => h.post(uid, '/api/coaching/my/submit', { tz: 'Europe/Zurich', appVersion: '1.4.3', ...body });

test('under 13: no link, nothing stored', async t => {
  const h = await startCoachingServer(t, world);
  await library(h);
  const inv = await invite(h, 'Kid');
  const r = await join(h, KID, inv.code, isoYearsAgo(12, -1));
  assert.deepEqual([r.status, r.body.code], [400, 'too-young']);
  assert.deepEqual([(await join(h, KID, inv.code, 'nope')).body.code, (await h.post(KID, '/api/coaching/invites/accept', { code: inv.code })).body.code], ['dob', 'dob']);
  h.sql(s => {
    assert.equal(s.prepare('SELECT COUNT(*) AS n FROM clients').get().n, 0, 'not even the date of birth');
    assert.equal(s.prepare('SELECT COUNT(*) AS n FROM links WHERE client_id = ?').get(KID).n, 0);
    assert.equal(s.prepare('SELECT COUNT(*) AS n FROM requests').get().n, 0);
  });
  assert.equal((await join(h, KID, inv.code, isoYearsAgo(13))).status, 200, '13 today may join');
});

test('an adult joins, does the packet in order, and is cleared once the required ones are done', async t => {
  const h = await startCoachingServer(t, world);
  const lib = await library(h);
  const inv = await invite(h, 'Ana');
  assert.equal((await join(h, ANA, inv.code, '1990-05-01')).status, 200);
  let me = await mine(h, ANA);
  assert.deepEqual(me.todo.map(s => s.title), ['PAR-Q', 'Liability waiver', 'Photo consent'], 'in packet order, the draft skipped');
  assert.deepEqual(me.todo.map(s => s.required), [true, true, false]);
  assert.deepEqual([me.state, me.cleared, me.minor, me.age >= 36], ['todo', false, false, true]);
  const client = (await h.get(MIKE, '/api/coaching/clients')).body.clients.find(c => c.id === ANA);
  assert.deepEqual([client.dob, client.paperwork, client.todo, client.cleared], ['1990-05-01', 'todo', 3, false], 'the trainer sees the date of birth and what is left');

  const [parq, waiver, photo] = me.todo;
  assert.deepEqual((await submit(h, ANA, { request: parq.id, answers: { h: { yes: true } } })).body.code, 'follow-up');
  const f = await submit(h, ANA, { request: parq.id, answers: { h: { yes: true, followUp: 'Murmur' } } });
  assert.equal(f.status, 200);
  assert.equal((await submit(h, ANA, { request: parq.id, answers: { h: { yes: false } } })).status, 404, 'a done request takes nothing more');

  assert.equal((await submit(h, ANA, { request: waiver.id, name: 'Ana Reyes', signature: SIG })).body.code, 'agree');
  assert.equal((await submit(h, ANA, { request: waiver.id, agreed: true, name: 'A', signature: SIG })).body.code, 'name');
  assert.equal((await submit(h, ANA, { request: waiver.id, agreed: true, name: 'Ana Reyes', signature: 'x' })).body.code, 'signature');
  const w = await submit(h, ANA, { request: waiver.id, agreed: true, name: 'Ana Reyes', signature: SIG });
  assert.deepEqual([w.status, w.body.complete, w.body.cleared, w.body.state], [200, true, true, 'cleared'], 'the optional photo consent does not block');
  assert.match(h.log, /to a…@e… \| Your signed liability waiver/, 'the signed copy goes to the client');

  const rec = await fetch(h.api + '/api/coaching/my/record?id=' + waiver.id, { headers: { Cookie: `gymsid=${h.mint(ANA)}` } });
  assert.equal(rec.headers.get('content-type'), 'application/pdf');
  const pdf = Buffer.from(await rec.arrayBuffer()).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-') && pdf.includes('Ana Reyes') && pdf.includes('Europe/Zurich') && pdf.includes('1.4.3'));
  assert.equal((await fetch(h.api + '/api/coaching/my/record?id=' + waiver.id, { headers: { Cookie: `gymsid=${h.mint(ZOE)}` } })).status, 404, 'nobody else\'s record');

  // Photos of the filled-in pages become one PDF.
  const up = async (uid, buf, type) => (await fetch(h.api + '/api/coaching/my/files', { method: 'POST', headers: { 'Content-Type': type, Cookie: `gymsid=${h.mint(uid)}` }, body: buf })).json();
  assert.equal((await up(ANA, Buffer.from('not a jpeg at all'), 'image/jpeg')).code, 'type');
  const p1 = await up(ANA, TINY, 'image/jpeg');
  assert.equal((await submit(h, ZOE, { request: photo.id, files: [p1.hash] })).status, 404, 'not her request');
  const p = await submit(h, ANA, { request: photo.id, files: [p1.hash, p1.hash] });
  assert.equal(p.status, 200);
  const back = await fetch(h.api + '/api/coaching/my/record?id=' + photo.id, { headers: { Cookie: `gymsid=${h.mint(ANA)}` } });
  assert.match(Buffer.from(await back.arrayBuffer()).toString('latin1'), /\/Count 2/);
  me = await mine(h, ANA);
  assert.deepEqual([me.todo.length, me.done.length], [0, 3]);

  h.sql(s => {
    assert.throws(() => s.prepare('UPDATE submissions SET signer_name = ?').run('Someone else'), /insert only/);
    assert.throws(() => s.prepare('DELETE FROM submissions').run(), /insert only/);
    const sub = s.prepare(`SELECT * FROM submissions WHERE signer = 'client' AND signature_hash IS NOT NULL`).get();
    assert.equal(sub.content_hash, contentHash('sign', { text: 'I accept the risks of training.' }));
    assert.equal(sub.tz, 'Europe/Zurich');
    assert.equal(s.prepare('SELECT flagged_yes FROM submissions WHERE answers IS NOT NULL').get().flagged_yes, 1);
    assert.ok(fs.existsSync(path.join(h.dataDir, 'coaching-files', sub.signature_hash + '.jpg')));
  });
  assert.ok(lib);
});

test('16: the waiver waits for the guardian, who signs on the same phone or by a one-time link', async t => {
  const h = await startCoachingServer(t, world);
  await library(h);
  const inv = await invite(h, 'Zoe');
  assert.equal((await join(h, ZOE, inv.code, isoYearsAgo(16))).status, 200);
  let me = await mine(h, ZOE);
  assert.equal(me.minor, true);
  const [parq, waiver] = me.todo;
  await submit(h, ZOE, { request: parq.id, answers: { h: { yes: false } } });
  const w = await submit(h, ZOE, { request: waiver.id, agreed: true, name: 'Zoe Lee', signature: SIG });
  assert.deepEqual([w.body.complete, w.body.state, w.body.cleared, w.body.waiting.length], [false, 'guardian', false, 1], 'not cleared until the guardian signs');
  assert.equal((await submit(h, ZOE, { request: waiver.id, signer: 'guardian', agreed: true, name: 'Dana Lee', signature: SIG })).body.code, 'no-guardian');

  assert.equal((await h.post(ZOE, '/api/coaching/my/guardian', { name: 'Dana Lee', send: true })).body.code, 'email');
  const g = await h.post(ZOE, '/api/coaching/my/guardian', { name: 'Dana Lee', email: 'dana@example.com', relationship: 'Mother', send: true });
  assert.deepEqual([g.status, g.body.emailed, g.body.guardian.relationship], [200, true, 'Mother']);
  assert.equal((await h.post(ZOE, '/api/coaching/my/guardian', { name: 'Dana Lee', email: 'dana@example.com', send: true })).body.code, 'too-soon');
  const token = /#\/guardian\/([A-Za-z0-9_-]+)/.exec(h.log)[1];

  const page = await h.get(null, '/api/coaching/guardian?token=' + token);
  assert.equal(page.status, 200);
  assert.deepEqual([page.body.client.name, page.body.sign.map(s => s.title), page.body.read[0].title], ['Zoe', ['Liability waiver'], 'PAR-Q'], 'Dana reads the answers and signs the waiver');
  assert.equal((await h.get(null, '/api/coaching/guardian?token=' + 'x'.repeat(43))).status, 404);
  const sign = body => h.post(null, '/api/coaching/guardian/sign', { token, request: waiver.id, tz: 'Europe/Zurich', ...body });
  assert.equal((await sign({ agreed: true, name: 'Dana Lee' })).body.code, 'signature');
  const s = await sign({ agreed: true, name: 'Dana Lee', signature: SIG });
  assert.deepEqual([s.status, s.body.left], [200, 0]);
  assert.equal((await h.get(null, '/api/coaching/guardian?token=' + token)).body.code, 'used', 'the link works once');
  me = await mine(h, ZOE);
  assert.deepEqual([me.cleared, me.state], [true, 'cleared']);
  assert.match(h.log, /to d…@e… \| Your signed liability waiver/, 'Dana gets the signed copy');

  const pdf = Buffer.from(await (await fetch(h.api + '/api/coaching/my/record?id=' + waiver.id, { headers: { Cookie: `gymsid=${h.mint(ZOE)}` } })).arrayBuffer()).toString('latin1');
  assert.ok(pdf.includes('Zoe Lee') && pdf.includes('Dana Lee') && pdf.includes('Mother of Zoe'));
});

test('a guardian signing on the client\'s phone, an expired link, and an adult has no guardian', async t => {
  const h = await startCoachingServer(t, world);
  await library(h);
  const inv = await invite(h, 'Zoe');
  await join(h, ZOE, inv.code, isoYearsAgo(15));
  const [parq, waiver] = (await mine(h, ZOE)).todo;
  await submit(h, ZOE, { request: parq.id, answers: { h: { yes: false } } });
  await submit(h, ZOE, { request: waiver.id, agreed: true, name: 'Zoe Lee', signature: SIG });
  await h.post(ZOE, '/api/coaching/my/guardian', { name: 'Dana Lee', email: 'dana@example.com', send: true });
  const token = /#\/guardian\/([A-Za-z0-9_-]+)/.exec(h.log)[1];
  h.sql(s => s.prepare('UPDATE guardians SET token_expires_at = ?').run(Date.now() - 1));
  assert.equal((await h.get(null, '/api/coaching/guardian?token=' + token)).body.code, 'expired');
  const here = await submit(h, ZOE, { request: waiver.id, signer: 'guardian', agreed: true, name: 'Dana Lee', signature: SIG });
  assert.deepEqual([here.status, here.body.cleared], [200, true]);
  h.sql(s => assert.equal(s.prepare(`SELECT guardian_id FROM submissions WHERE signer = 'guardian'`).get().guardian_id, 1));

  const adult = await invite(h, 'Ana');
  await join(h, ANA, adult.code, '1990-05-01');
  assert.equal((await h.post(ANA, '/api/coaching/my/guardian', { name: 'Someone' })).body.code, 'adult');
});

test('a client from before 2e gives the date of birth, then gets the packet; new versions can be required again', async t => {
  const h = await startCoachingServer(t, world);
  const lib = await library(h);
  assert.equal((await mine(h, OLD)).state, 'about');
  assert.equal((await submit(h, OLD, { request: 1 })).status, 404);
  const a = await h.post(OLD, '/api/coaching/my/about', { dob: '1985-01-02' });
  assert.deepEqual([a.status, a.body.todo.length, a.body.state], [200, 3, 'todo']);
  assert.equal((await h.post(OLD, '/api/coaching/my/about', { dob: '1985-01-02' })).body.code, 'already');
  for (const s of a.body.todo.filter(x => x.kind !== 'pdf_return')) {
    await submit(h, OLD, s.kind === 'form' ? { request: s.id, answers: { h: { yes: false } } } : { request: s.id, agreed: true, name: 'Old Timer', signature: SIG });
  }
  assert.equal((await mine(h, OLD)).cleared, true);

  // Version 2 of the waiver, asked of current clients and required before their next session.
  await h.post(MIKE, '/api/coaching/document/draft', { id: lib.waiver.id, body: { text: 'I accept the risks of training. Version 2.' } });
  const pub = await h.post(MIKE, '/api/coaching/document/publish', { id: lib.waiver.id, askCurrent: true, required: true });
  assert.equal(pub.body.asked, 1);
  const me = await mine(h, OLD);
  assert.deepEqual([me.cleared, me.todo.find(x => x.title === 'Liability waiver').version], [false, 2]);
  const sent = await h.post(MIKE, '/api/coaching/document/send', { id: lib.photo.id, clients: [OLD], required: false });
  assert.equal(sent.body.sent, 0, 'already has it open');
  assert.equal((await h.post(ANA, '/api/coaching/document/required', { id: lib.waiver.id, required: true })).status, 403);
  assert.equal((await h.post(TESS, '/api/coaching/document/required', { id: lib.waiver.id, required: true })).status, 404);
});
