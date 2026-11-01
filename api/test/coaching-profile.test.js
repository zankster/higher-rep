/* trainer-fork: the client profile (Phase 2f). The pure rules (retention, masked email, a tag from
 * an answer, CSV, the ZIP writer) on their own, then the routes through a real server.js: who may
 * call them, tags and notes that stay the trainer's, records with flagged answers first, the
 * guardian's new link, and the record export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { keepUntil, maskEmail, tagFromAnswer, csv } from '../coaching/profile.js';
import { makeZip, readZip } from '../coaching/zip.js';
import { startCoachingServer, user } from './coaching-harness.mjs';

const TINY = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const SIG = 'data:image/jpeg;base64,' + Buffer.concat([TINY.subarray(0, 20), Buffer.alloc(60, 0), TINY.subarray(20)]).toString('base64');
const DAY = 86400000;
const isoYearsAgo = y => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };

test('records are kept 5 years after coaching ends, and for a minor until 23 at least', () => {
  const ended = Date.UTC(2030, 0, 15);
  assert.equal(keepUntil({ endedAt: ended, dob: '1990-05-01' }).keepUntil, Date.UTC(2035, 0, 15));
  assert.equal(keepUntil({ endedAt: ended, dob: '1990-05-01' }).notBefore, null);
  const kid = keepUntil({ endedAt: ended, dob: '2014-06-10' });
  assert.equal(kid.keepUntil, Date.UTC(2037, 5, 10), '5 years after the 18th birthday is later');
  assert.equal(kid.notBefore, Date.UTC(2037, 5, 10));
  const live = keepUntil({ endedAt: null, dob: '2010-03-01', now: Date.UTC(2026, 10, 1) });
  assert.deepEqual(live, { keepUntil: null, notBefore: Date.UTC(2033, 2, 1) }, 'still coached: only the floor is known');
  assert.deepEqual(keepUntil({ endedAt: null, dob: '1980-01-01', now: Date.UTC(2026, 10, 1) }), { keepUntil: null, notBefore: null });
});

test('small rules: masked email, a tag from an answer, CSV cells', () => {
  assert.equal(maskEmail('dana@example.com'), 'da•••@example.com');
  assert.equal(maskEmail('d@x.io'), 'd•••@x.io');
  assert.equal(maskEmail('nope'), null);
  assert.equal(tagFromAnswer('Heart condition?', 'Murmur'), 'Murmur');
  assert.equal(tagFromAnswer('Do you have a bone or joint problem?', null), 'Do you have a bone or joint problem');
  const long = tagFromAnswer('Has your doctor ever said that you have a heart condition and should only exercise under supervision?', null);
  assert.ok(long.length <= 40 && long.endsWith('…') && !long.includes('  '), long);
  assert.equal(csv([['a', 'b,c'], ['say "hi"', '=SUM(A1)'], [null, 3]]), 'a,"b,c"\r\n"say ""hi""",\'=SUM(A1)\r\n,3\r\n');
});

test('the ZIP writer round-trips text and binary, deflated or stored', () => {
  const big = 'line of text\n'.repeat(500);
  const rand = crypto.randomBytes(2000);
  const zip = makeZip([{ name: 'a.txt', data: big }, { name: 'dir/ü.bin', data: rand }, { name: 'empty', data: '' }], Date.UTC(2026, 10, 1, 12, 30));
  assert.ok(zip.length < big.length, 'text is deflated');
  const back = readZip(zip);
  assert.equal(back['a.txt'].toString(), big);
  assert.ok(back['dir/ü.bin'].equals(rand));
  assert.equal(back.empty.length, 0);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
});

/* ---------- through the server ---------- */

const MIKE = 'u_mike', TESS = 'u_tess', ANA = 'u_ana', ZOE = 'u_zoe', BEN = 'u_ben', CAL = 'u_cal', SAM = 'u_sam';
const world = {
  users: [user(MIKE, 'Mike', { admin: true, owner: true, trainer: true }), user(TESS, 'Tess', { trainer: true }),
    user(ANA, 'Ana Reyes', { email: 'ana@example.com' }), user(ZOE, 'Zoe Lee'), user(BEN, 'Ben'), user(CAL, 'Cal'), user(SAM, 'Sam')],
  trainers: [MIKE, TESS],
  links: [[TESS, BEN, 'active'], [MIKE, CAL, 'ended']],
};

async function setUp(t) {
  const h = await startCoachingServer(t, world);
  const doc = async (title, kind, body) => {
    const d = (await h.post(MIKE, '/api/coaching/documents/new', { title, kind, rights: true })).body.document;
    await h.post(MIKE, '/api/coaching/document/draft', { id: d.id, body });
    assert.equal((await h.post(MIKE, '/api/coaching/document/publish', { id: d.id })).status, 200);
    return d;
  };
  const parq = await doc('PAR-Q', 'form', { questions: [
    { id: 'h', type: 'yes_no', text: 'Heart condition?', flagYes: true, followUp: { type: 'long_text', text: 'Tell me' } },
    { id: 'j', type: 'yes_no', text: 'Joint problem?' },
    { id: 'g', type: 'short_text', text: 'Your goal' },
  ] });
  const waiver = await doc('Liability waiver', 'sign', { text: 'I accept the risks of training.' });
  await h.post(MIKE, '/api/coaching/documents/packet', { ids: [parq.id, waiver.id] });
  await h.post(MIKE, '/api/coaching/document/required', { id: waiver.id, required: true });
  const join = async (uid, dob) => {
    const inv = (await h.post(MIKE, '/api/coaching/invites/new', { firstName: uid })).body.invite;
    assert.equal((await h.post(uid, '/api/coaching/invites/accept', { code: inv.code, dob, tz: 'Europe/Zurich' })).status, 200);
    return (await h.get(uid, '/api/coaching/my/documents')).body.todo;
  };
  const submit = (uid, body) => h.post(uid, '/api/coaching/my/submit', { tz: 'Europe/Zurich', appVersion: '1.4.3', ...body });
  return { h, join, submit };
}
const download = async (h, uid, p) => {
  const r = await fetch(h.api + p, { headers: { Cookie: `gymsid=${h.mint(uid)}` } });
  return { status: r.status, type: r.headers.get('content-type'), name: r.headers.get('content-disposition'), buf: Buffer.from(await r.arrayBuffer()) };
};

test('every profile route is the trainer\'s, for their own live client only', async t => {
  const { h, join } = await setUp(t);
  await join(ANA, '1990-05-01');
  const gets = ['/api/coaching/client/profile?id=', '/api/coaching/client/record?record=1&id=', '/api/coaching/client/record/pdf?record=1&id=', '/api/coaching/client/export?id='];
  const posts = ['/api/coaching/client/tags', '/api/coaching/client/tag', '/api/coaching/client/tag/delete', '/api/coaching/client/notes',
    '/api/coaching/client/note', '/api/coaching/client/note/delete', '/api/coaching/client/guardian/link'];
  const refused = [
    [null, ANA, 401, 'signed out'], [ANA, ANA, 403, 'the client themself'], [SAM, ANA, 403, 'a stranger'],
    [TESS, ANA, 404, 'another trainer'], [MIKE, BEN, 404, 'another trainer\'s client'], [MIKE, CAL, 404, 'an ended link'], [MIKE, 'u_nobody', 404, 'no such user'],
  ];
  for (const [uid, id, status, why] of refused) {
    for (const p of gets) assert.equal((await download(h, uid, p + id)).status, status, `${p}: ${why}`);
    for (const p of posts) assert.equal((await h.post(uid, p, { id, text: 'x', tag: 1, note: 1 })).status, status, `${p}: ${why}`);
  }
  assert.equal((await h.get(MIKE, '/api/coaching/client/profile?id=' + ANA)).status, 200);
  assert.equal(h.stackFrames(), 0, 'no stack traces');
});

test('tags and notes are the trainer\'s, warnings reach the roster, and the client never sees them', async t => {
  const { h, join, submit } = await setUp(t);
  const [parq] = await join(ANA, '1990-05-01');
  await submit(ANA, { request: parq.id, answers: { h: { yes: true, followUp: 'Murmur' }, j: { yes: true }, g: 'Get strong' } });

  let p = (await h.get(MIKE, '/api/coaching/client/profile?id=' + ANA)).body;
  assert.deepEqual(p.flagged.map(f => [f.question, f.followUp, f.tag, f.tagged]), [['Heart condition?', 'Murmur', 'Murmur', false]], 'only the flagged question');
  const add = body => h.post(MIKE, '/api/coaching/client/tags', { id: ANA, ...body });
  assert.equal((await add({ text: '  ' })).body.code, 'text');
  assert.deepEqual((await add({ text: 'Knee  pain', warning: true })).body.tags.map(x => [x.text, x.warning]), [['Knee pain', true]]);
  assert.equal((await add({ text: 'knee pain' })).status, 409, 'the same name in other letters');
  const fromAnswer = await add({ fromAnswer: { record: parq.id, question: 'Heart condition?' } });
  assert.deepEqual(fromAnswer.body.tags.map(x => [x.text, x.warning, x.fromAnswer]), [['Knee pain', true, false], ['Murmur', true, true]]);
  assert.equal((await add({ fromAnswer: { record: parq.id, question: 'Joint problem?' } })).status, 404, 'not a flagged question');
  const morning = (await add({ text: 'Mornings only' })).body.tags.find(x => x.text === 'Mornings only');
  assert.equal(morning.warning, false);

  assert.deepEqual((await h.get(MIKE, '/api/coaching/clients')).body.clients[0].warnings, ['Knee pain', 'Murmur']);
  p = (await h.get(MIKE, '/api/coaching/client/profile?id=' + ANA)).body;
  assert.equal(p.flagged[0].tagged, true);

  const renamed = await h.post(MIKE, '/api/coaching/client/tag', { id: ANA, tag: morning.id, text: 'AM only', warning: true });
  assert.deepEqual(renamed.body.tags.find(x => x.id === morning.id), { ...morning, text: 'AM only', warning: true });
  assert.equal((await h.post(MIKE, '/api/coaching/client/tag', { id: ANA, tag: morning.id, text: 'murmur' })).status, 409);
  assert.equal((await h.post(MIKE, '/api/coaching/client/tag/delete', { id: ANA, tag: morning.id })).body.tags.length, 2);

  assert.equal((await h.post(MIKE, '/api/coaching/client/notes', { id: ANA, text: ' ' })).body.code, 'text');
  await h.post(MIKE, '/api/coaching/client/notes', { id: ANA, text: 'Prefers dumbbells.' });
  const notes = (await h.post(MIKE, '/api/coaching/client/notes', { id: ANA, text: 'Secret: talk about sleep.' })).body.notes;
  assert.deepEqual(notes.map(n => n.text), ['Secret: talk about sleep.', 'Prefers dumbbells.'], 'newest first');
  const edited = (await h.post(MIKE, '/api/coaching/client/note', { id: ANA, note: notes[1].id, text: 'Prefers dumbbells and cables.' })).body.notes[1];
  assert.ok(edited.edited >= edited.created);
  assert.equal((await h.post(MIKE, '/api/coaching/client/note/delete', { id: ANA, note: notes[0].id })).body.notes.length, 1);

  // Tess cannot touch Mike's tags and notes even with their ids.
  await h.sql(s => s.prepare(`INSERT INTO links (trainer_id, client_id, status, started_at) VALUES (?, ?, 'active', ?)`).run(TESS, SAM, Date.now()));
  assert.equal((await h.post(TESS, '/api/coaching/client/tag/delete', { id: SAM, tag: morning.id - 1 })).status, 404);
  assert.equal((await h.post(TESS, '/api/coaching/client/note/delete', { id: SAM, note: notes[1].id })).status, 404);

  // Nothing the client can read carries them.
  const seen = JSON.stringify([(await h.get(ANA, '/api/coaching/me')).body, (await h.get(ANA, '/api/coaching/my/documents')).body]);
  for (const s of ['Knee pain', 'Murmur"', 'dumbbells', 'warnings']) assert.ok(!seen.includes(s), `the client sees ${s}`);
});

test('records list with yes counts, flagged answers first, and the PDFs the client has', async t => {
  const { h, join, submit } = await setUp(t);
  const [parq, waiver] = await join(ANA, '1990-05-01');
  let p = (await h.get(MIKE, '/api/coaching/client/profile?id=' + ANA)).body;
  assert.deepEqual(p.records, []);
  assert.deepEqual(p.waiting.map(w => [w.title, w.required]), [['PAR-Q', false], ['Liability waiver', true]]);
  assert.equal(p.guardian, null, 'an adult has no guardian');
  assert.deepEqual([p.client.age >= 36, p.client.minor, p.retention.keepUntil, p.retention.years], [true, false, null, 5]);

  await submit(ANA, { request: parq.id, answers: { h: { yes: true, followUp: 'Murmur' }, j: { yes: true }, g: 'Get strong' } });
  await submit(ANA, { request: waiver.id, agreed: true, name: 'Ana Reyes', signature: SIG });
  p = (await h.get(MIKE, '/api/coaching/client/profile?id=' + ANA)).body;
  assert.deepEqual(p.records.map(r => [r.title, r.yesCount, r.flagged]), [['Liability waiver', undefined, undefined], ['PAR-Q', 2, 1]]);
  assert.deepEqual([p.waiting.length, p.client.cleared], [0, true]);

  const rec = (await h.get(MIKE, `/api/coaching/client/record?id=${ANA}&record=${parq.id}`)).body.record;
  assert.deepEqual(rec.items.map(i => [i.q, i.flagged]), [['Heart condition?', true], ['Joint problem?', false], ['Your goal', false]]);
  assert.equal(rec.items[0].a, 'Yes. Murmur');
  assert.equal(rec.signers[0].tz, 'Europe/Zurich');
  const w = (await h.get(MIKE, `/api/coaching/client/record?id=${ANA}&record=${waiver.id}`)).body.record;
  assert.deepEqual([w.text, w.signers[0].name, w.signers[0].appVersion], ['I accept the risks of training.', 'Ana Reyes', '1.4.3']);

  const pdf = await download(h, MIKE, `/api/coaching/client/record/pdf?id=${ANA}&record=${waiver.id}`);
  assert.deepEqual([pdf.status, pdf.type], [200, 'application/pdf']);
  assert.match(pdf.name, /liability-waiver-v1\.pdf/);
  assert.ok(pdf.buf.toString('latin1').includes('Ana Reyes'));
  // Tess has a client too, but not this record.
  assert.equal((await download(h, TESS, `/api/coaching/client/record/pdf?id=${BEN}&record=${waiver.id}`)).status, 404, 'a record of someone else\'s client');
  assert.equal((await h.get(MIKE, `/api/coaching/client/record?id=${ANA}&record=99`)).status, 404);
});

test('the guardian of a minor: what is waiting, and a new link from the trainer', async t => {
  const { h, join, submit } = await setUp(t);
  const [parq, waiver] = await join(ZOE, isoYearsAgo(16));
  await submit(ZOE, { request: parq.id, answers: { h: { yes: false }, j: { yes: false }, g: 'Football' } });
  await submit(ZOE, { request: waiver.id, agreed: true, name: 'Zoe Lee', signature: SIG });
  const link = () => h.post(MIKE, '/api/coaching/client/guardian/link', { id: ZOE });
  assert.equal((await link()).body.code, 'nothing', 'no guardian added yet');
  await h.post(ZOE, '/api/coaching/my/guardian', { name: 'Dana Lee', email: 'dana@example.com', relationship: 'Mother', send: true });

  const p = (await h.get(MIKE, '/api/coaching/client/profile?id=' + ZOE)).body;
  assert.equal(p.client.minor, true);
  assert.deepEqual(p.waiting.map(w => [w.title, w.waitingGuardian]), [['Liability waiver', true]]);
  assert.deepEqual([p.guardian.name, p.guardian.email, p.guardian.relationship, !!p.guardian.linkExpires], ['Dana Lee', 'da•••@example.com', 'Mother', true]);
  assert.ok(!JSON.stringify(p).includes('dana@example.com'), 'the address stays masked');
  assert.ok(p.retention.notBefore > Date.now() + 6 * 365 * DAY, 'kept until 5 years after 18 at least');
  assert.deepEqual(p.records.map(r => [r.title, r.waitingGuardian]), [['Liability waiver', true], ['PAR-Q', false]]);

  assert.equal((await link()).body.code, 'too-soon', 'the 2-minute limit is shared with the client');
  const first = /#\/guardian\/([A-Za-z0-9_-]+)/.exec(h.log)[1];
  h.sql(s => s.prepare('UPDATE guardians SET emailed_at = ?').run(Date.now() - 3 * 60000));
  const r = await link();
  assert.deepEqual([r.status, r.body.guardian.name], [200, 'Dana Lee']);
  const tokens = [...h.log.matchAll(/#\/guardian\/([A-Za-z0-9_-]+)/g)].map(m => m[1]);
  assert.equal(tokens.length, 2);
  assert.equal((await h.get(null, '/api/coaching/guardian?token=' + first)).status, 404, 'the old link stops working');
  assert.equal((await h.get(null, '/api/coaching/guardian?token=' + tokens[1])).status, 200);
  assert.match(fs.readFileSync(path.join(h.dataDir, 'audit.log'), 'utf8'), /coaching\.guardian\.link/);
});

test('the export holds every record, the data and a manifest; notes and tags only when asked', async t => {
  const { h, join, submit } = await setUp(t);
  const [parq, waiver] = await join(ANA, '1990-05-01');
  await submit(ANA, { request: parq.id, answers: { h: { yes: true, followUp: 'Murmur' }, j: { yes: false }, g: '=HYPERLINK("x")' } });
  await submit(ANA, { request: waiver.id, agreed: true, name: 'Ana Reyes', signature: SIG });
  await h.post(MIKE, '/api/coaching/client/tags', { id: ANA, text: 'Knee pain', warning: true });
  await h.post(MIKE, '/api/coaching/client/notes', { id: ANA, text: 'Private thought.' });

  const plain = await download(h, MIKE, '/api/coaching/client/export?id=' + ANA);
  assert.deepEqual([plain.status, plain.type], [200, 'application/zip']);
  assert.match(plain.name, /ana-reyes-records-\d{4}-\d{2}-\d{2}\.zip/);
  const z = readZip(plain.buf);
  const names = Object.keys(z).sort();
  assert.deepEqual(names, ['README.txt', 'answers.csv', 'client.json', 'manifest.json', 'records.csv', 'records/01-par-q-v1.pdf', 'records/02-liability-waiver-v1.pdf']);
  const manifest = JSON.parse(z['manifest.json']);
  assert.equal(manifest.includesNotesAndTags, false);
  assert.equal(manifest.files.length, names.length - 1, 'every file but the manifest itself');
  for (const f of manifest.files) assert.equal(crypto.createHash('sha256').update(z[f.path]).digest('hex'), f.sha256, f.path);
  const all = names.map(n => z[n].toString('latin1')).join('\n');
  assert.ok(!all.includes('Knee pain') && !all.includes('Private thought'), 'no notes or tags unless asked');
  assert.match(z['answers.csv'].toString(), /'=HYPERLINK/, 'a formula is written as text');
  assert.equal(JSON.parse(z['client.json']).client.dob, '1990-05-01');
  assert.match(z['records.csv'].toString(), /Ana Reyes/);

  const full = readZip((await download(h, MIKE, `/api/coaching/client/export?id=${ANA}&notes=1`)).buf);
  assert.ok(full['tags.csv'].toString().includes('Knee pain') && full['notes.csv'].toString().includes('Private thought.'));
  assert.equal(JSON.parse(full['manifest.json']).includesNotesAndTags, true);

  const log = fs.readFileSync(path.join(h.dataDir, 'audit.log'), 'utf8').split('\n').filter(l => l.includes('coaching.client.export'));
  assert.equal(log.length, 2, 'every export is logged');
  assert.ok(!fs.readFileSync(path.join(h.dataDir, 'audit.log'), 'utf8').includes('client.profile'), 'views are not');
});
