/* trainer-fork: the document library (Phase 2d). The body rules on their own, then every route
 * through a real server.js, asked by the people who must be refused as well. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBody, publishProblem, emptyBody } from '../coaching/doc-body.js';
import { startCoachingServer, user } from './coaching-harness.mjs';

const H = 'a'.repeat(64);

test('a form keeps the wording as typed, drops what it does not know, and caps lengths', () => {
  const b = cleanBody('form', { intro: '  Hi  ', junk: 1, questions: [
    { id: 'heart', type: 'yes_no', text: '  Has your doctor ever said…?  ', flagYes: true, followUp: { type: 'nope', text: 'Explain' }, extra: 'x' },
    { type: 'choice', text: 'Goal', options: ['Strength', '', 'x'.repeat(500)], multi: true },
    { id: 'heart', type: 'weird', text: 'Dup id' },
    'not a question',
  ] });
  assert.equal(b.intro, 'Hi');
  assert.deepEqual(b.questions[0], { id: 'heart', type: 'yes_no', text: 'Has your doctor ever said…?', required: true, flagYes: true, followUp: { type: 'long_text', text: 'Explain' } });
  assert.equal(b.questions[1].options[2].length, 200);
  assert.equal(b.questions[1].multi, true);
  assert.equal(b.questions[2].type, 'short_text');
  assert.notEqual(b.questions[2].id, 'heart', 'ids stay unique');
  assert.equal(b.questions.length, 3);
});

test('publishing needs a complete body', () => {
  assert.deepEqual(publishProblem('form', emptyBody('form')), { code: 'no-questions' });
  assert.deepEqual(publishProblem('form', cleanBody('form', { questions: [{ type: 'yes_no', text: '' }] })), { code: 'question-text', index: 0 });
  assert.deepEqual(publishProblem('form', cleanBody('form', { questions: [{ type: 'choice', text: 'Pick', options: ['One'] }] })), { code: 'choice-options', index: 0 });
  assert.deepEqual(publishProblem('form', cleanBody('form', { questions: [{ type: 'yes_no', text: 'Q', followUp: { text: '' } }] })), { code: 'follow-up-text', index: 0 });
  assert.equal(publishProblem('form', cleanBody('form', { questions: [{ type: 'date', text: 'When?' }] })), null);
  assert.deepEqual(publishProblem('sign', cleanBody('sign', { text: '   ' })), { code: 'empty' });
  assert.equal(publishProblem('sign', cleanBody('sign', { text: 'I agree' })), null);
  assert.deepEqual(cleanBody('sign', { text: 'x', file: { hash: H, name: 'w.pdf' } }), { file: { hash: H, name: 'w.pdf' } });
  assert.deepEqual(cleanBody('sign', { file: { hash: 'nope' } }), { text: '' });
  assert.deepEqual(publishProblem('pdf_return', cleanBody('pdf_return', {})), { code: 'no-file' });
});

/* ---------- through the server ---------- */

const MIKE = 'u_mike', TESS = 'u_tess', ANA = 'u_ana', PIA = 'u_pia', CAL = 'u_cal', SAM = 'u_sam';
const world = {
  users: [user(MIKE, 'Mike', { admin: true, owner: true, trainer: true }), user(TESS, 'Tess', { trainer: true }),
    user(ANA, 'Ana'), user(PIA, 'Pia'), user(CAL, 'Cal'), user(SAM, 'Sam')],
  trainers: [MIKE, TESS],
  links: [[MIKE, ANA, 'active'], [MIKE, PIA, 'paused'], [MIKE, CAL, 'ended'], [TESS, SAM, 'active']],
};
const form = { questions: [{ id: 'q1', type: 'yes_no', text: 'Any heart condition?', flagYes: true, followUp: { type: 'long_text', text: 'Tell me more' } }] };
const make = async (h, uid = MIKE, extra = {}) => (await h.post(uid, '/api/coaching/documents/new', { title: 'PAR-Q', kind: 'form', rights: true, ...extra })).body.document;
const publish = (h, id, extra = {}, uid = MIKE) => h.post(uid, '/api/coaching/document/publish', { id, ...extra });
const draft = (h, id, body, uid = MIKE, title) => h.post(uid, '/api/coaching/document/draft', { id, body, title });

test('only a trainer has a library, and only their own documents', async t => {
  const h = await startCoachingServer(t, world);
  assert.equal((await h.get(null, '/api/coaching/documents')).status, 401);
  assert.equal((await h.get(ANA, '/api/coaching/documents')).status, 403);
  const d = await make(h);
  for (const [m, p, b] of [
    ['get', `/api/coaching/document?id=${d.id}`], ['get', `/api/coaching/document/recipients?id=${d.id}`],
    ['post', '/api/coaching/document/draft', { id: d.id, body: form }], ['post', '/api/coaching/document/publish', { id: d.id }],
    ['post', '/api/coaching/document/discard', { id: d.id }], ['post', '/api/coaching/document/delete', { id: d.id }],
    ['post', '/api/coaching/document/send', { id: d.id, clients: 'all' }], ['post', '/api/coaching/documents/packet', { ids: [d.id] }],
  ]) {
    const r = m === 'get' ? await h.get(TESS, p) : await h.post(TESS, p, b);
    assert.equal(r.status, 404, `${p} as another trainer`);
    const c = m === 'get' ? await h.get(ANA, p) : await h.post(ANA, p, b);
    assert.equal(c.status, 403, `${p} as a client`);
  }
  assert.deepEqual((await h.get(TESS, '/api/coaching/documents')).body.documents, []);
});

test('a new document needs a title, a kind and the rights tick, and starts as a draft', async t => {
  const h = await startCoachingServer(t, world);
  const n = body => h.post(MIKE, '/api/coaching/documents/new', body);
  assert.equal((await n({ title: '', kind: 'form', rights: true })).body.code, 'title');
  assert.equal((await n({ title: 'X', kind: 'video', rights: true })).body.code, 'kind');
  assert.equal((await n({ title: 'X', kind: 'form' })).body.code, 'rights');
  const d = await make(h);
  assert.equal(d.version, null);
  assert.equal(d.hasDraft, true);
  assert.deepEqual(d.draft.body, { intro: '', questions: [] });
  assert.ok(d.rightsConfirmed > 0);
  assert.equal((await publish(h, d.id)).body.code, 'no-questions');
});

test('publishing freezes a version; the next draft never changes it', async t => {
  const h = await startCoachingServer(t, world);
  const d = await make(h);
  assert.equal((await draft(h, d.id, form)).status, 200);
  const v1 = await publish(h, d.id);
  assert.equal(v1.body.version, 1);
  assert.equal(v1.body.document.hasDraft, false);
  assert.equal(v1.body.document.published.body.questions[0].text, 'Any heart condition?');

  const edited = { questions: [{ ...form.questions[0], text: 'Changed wording' }] };
  const dr = await draft(h, d.id, edited, MIKE, 'PAR-Q (2026)');
  assert.equal(dr.body.draft.title, 'PAR-Q (2026)');
  let doc = (await h.get(MIKE, `/api/coaching/document?id=${d.id}`)).body.document;
  assert.equal(doc.published.body.questions[0].text, 'Any heart condition?', 'v1 unchanged while the draft is edited');
  assert.equal(doc.draft.body.questions[0].text, 'Changed wording');

  assert.equal((await h.post(MIKE, '/api/coaching/document/discard', { id: d.id })).status, 200);
  doc = (await h.get(MIKE, `/api/coaching/document?id=${d.id}`)).body.document;
  assert.equal(doc.draft, null);

  await draft(h, d.id, edited);
  const v2 = await publish(h, d.id);
  assert.equal(v2.body.version, 2);
  assert.deepEqual(v2.body.document.versions.map(v => v.version), [2, 1]);
  const stored = h.sql(s => s.prepare(`SELECT version, body FROM document_versions WHERE document_id = ? AND status = 'published' ORDER BY version`).all(d.id));
  assert.equal(JSON.parse(stored[0].body).questions[0].text, 'Any heart condition?');
  assert.equal((await publish(h, d.id)).body.code, 'no-draft');
});

test('the packet keeps the order given; delete only what was never published', async t => {
  const h = await startCoachingServer(t, world);
  const a = await make(h, MIKE, { title: 'Waiver', kind: 'sign' });
  const b = await make(h, MIKE, { title: 'Intake' });
  const c = await make(h, MIKE, { title: 'Policy', kind: 'sign' });
  const set = ids => h.post(MIKE, '/api/coaching/documents/packet', { ids });
  let list = (await set([b.id, a.id])).body.documents;
  assert.deepEqual(list.map(d => [d.title, d.inPacket]), [['Intake', true], ['Waiver', true], ['Policy', false]]);
  list = (await set([a.id])).body.documents;
  assert.deepEqual(list.filter(d => d.inPacket).map(d => d.title), ['Waiver']);
  assert.equal((await set([a.id, a.id])).body.code, 'ids');

  await draft(h, c.id, { text: 'Cancel 24 hours ahead.' });
  await publish(h, c.id);
  assert.equal((await h.post(MIKE, '/api/coaching/document/delete', { id: c.id })).body.code, 'published');
  assert.equal((await h.post(MIKE, '/api/coaching/document/discard', { id: a.id })).body.code, 'never-published');
  assert.equal((await h.post(MIKE, '/api/coaching/document/delete', { id: a.id })).status, 200);
  assert.deepEqual((await h.get(MIKE, '/api/coaching/documents')).body.documents.map(d => d.title).sort(), ['Intake', 'Policy']);
});

test('send asks live clients once; a new version can ask those who finished the old one', async t => {
  const h = await startCoachingServer(t, world);
  const d = await make(h);
  const send = body => h.post(MIKE, '/api/coaching/document/send', { id: d.id, ...body });
  assert.equal((await send({ clients: 'all' })).body.code, 'unpublished');
  await draft(h, d.id, form);
  await publish(h, d.id);

  let r = (await h.get(MIKE, `/api/coaching/document/recipients?id=${d.id}`)).body;
  assert.deepEqual(r.clients.map(c => [c.id, c.paused, c.state]), [[ANA, false, 'none'], [PIA, true, 'none']], 'live clients only, paused included');
  assert.equal((await send({ clients: [CAL] })).status, 404, 'an ended client');
  assert.equal((await send({ clients: [SAM] })).status, 404, 'another trainer\'s client');
  assert.equal((await send({ clients: [] })).body.code, 'clients');
  assert.equal((await send({ clients: [ANA], due: Date.now() - 3 * 86400000 })).body.code, 'due');
  assert.deepEqual((await send({ clients: [ANA], due: Date.now() + 86400000 })).body, { sent: 1, skipped: 0 });
  assert.deepEqual((await send({ clients: 'all' })).body, { sent: 1, skipped: 1 }, 'Ana already has it open');

  // Ana finishes version 1 (2e does this when she signs).
  h.sql(s => s.prepare(`UPDATE requests SET status = 'done', done_at = ? WHERE client_id = ?`).run(Date.now(), ANA));
  r = (await h.get(MIKE, `/api/coaching/document/recipients?id=${d.id}`)).body;
  assert.deepEqual(r.clients.map(c => c.state), ['done', 'open']);

  await draft(h, d.id, { questions: [{ ...form.questions[0], text: 'New wording' }] });
  const doc = (await h.get(MIKE, `/api/coaching/document?id=${d.id}`)).body.document;
  assert.equal(doc.completedEarlier, 1, 'the publish sheet offers to ask Ana');
  const v2 = await publish(h, d.id, { askCurrent: true });
  assert.equal(v2.body.asked, 1, 'Ana, who finished v1');
  const rows = h.sql(s => s.prepare(`SELECT client_id, reason, status, version_id FROM requests ORDER BY id`).all());
  const v2id = h.sql(s => s.prepare(`SELECT id FROM document_versions WHERE version = 2`).get().id);
  assert.equal(rows.find(x => x.client_id === PIA).version_id, v2id, 'Pia\'s open request moved to v2');
  assert.deepEqual(rows.filter(x => x.reason === 'new_version').map(x => [x.client_id, x.status, x.version_id]), [[ANA, 'open', v2id]]);
});

test('PDF uploads: PDFs only, up to 10 MB, readable by the trainer who may use them', async t => {
  const h = await startCoachingServer(t, world);
  const up = (uid, buf, type = 'application/pdf') => fetch(h.api + '/api/coaching/files', { method: 'POST', headers: { 'content-type': type, Cookie: `gymsid=${h.mint(uid)}` }, body: buf });
  const pdf = Buffer.from('%PDF-1.4\n% test file\n%%EOF\n');
  assert.equal((await up(ANA, pdf)).status, 403);
  assert.equal((await up(MIKE, pdf, 'text/plain')).status, 415);
  assert.equal((await up(MIKE, Buffer.from('not a pdf at all'))).status, 400);
  assert.equal((await up(MIKE, Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]))).status, 413);
  const r = await up(MIKE, pdf);
  assert.equal(r.status, 200);
  const { hash } = await r.json();
  assert.match(hash, /^[0-9a-f]{64}$/);

  const read = (uid, hh = hash) => fetch(h.api + `/api/coaching/file?hash=${hh}`, { headers: { Cookie: `gymsid=${h.mint(uid)}` } });
  const got = await read(MIKE);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), pdf);
  assert.equal((await read(TESS)).status, 404, 'another trainer');
  assert.equal((await read(ANA)).status, 403);

  const d = await make(h, MIKE, { title: 'Photo consent', kind: 'pdf_return' });
  const e = await make(h, TESS, { title: 'Mine', kind: 'pdf_return' });
  assert.equal((await draft(h, e.id, { file: { hash, name: 'x.pdf' } }, TESS)).body.code, 'file', 'Tess cannot attach Mike\'s file by its hash');
  assert.equal((await draft(h, d.id, { file: { hash, name: 'consent.pdf' } })).status, 200);
  assert.equal((await publish(h, d.id)).body.version, 1);
});
