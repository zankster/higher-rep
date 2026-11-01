/* The client profile, as the trainer sees it (trainer-fork, Phase 2f): tags (a tag can be a
 * warning), private notes, the client's records with their answers and PDFs, what is still open
 * with the guardian, how long the records are kept, and the record export (ZIP). Spread into
 * coachingRoutes.
 *
 * Every route here is the trainer's, for their own live client (access.requireOwnClient). Tags
 * and notes are the trainer's only: no route a client can reach reads those tables. Exports are
 * written to the activity log; opening a client's records is not (PHASE2.md, 2f).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { filePath } from './files.js';
import { makeZip } from './zip.js';
import { recordPdf, recordName, answerText, emailGuardianLink, fmtSigned, GUARDIAN_EMAIL_GAP_MS } from './packet.js';
import { ADULT, ageOn } from './submission.js';

export const RETAIN_YEARS = 5;
export const LIMITS = { tag: 40, tags: 30, note: 4000 };

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** `years` after a time in ms, or after a "YYYY-MM-DD" day, in UTC. */
function addYears(at, years) {
  const d = typeof at === 'string' ? new Date(at + 'T00:00:00Z') : new Date(at);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.getTime();
}

/**
 * How long a client's records are kept: 5 years after coaching ends, and for someone coached as a
 * minor at least until 5 years after their 18th birthday, whichever is later.
 *   keepUntil: the date (ms), once coaching has ended; null while it goes on.
 *   notBefore: the minor's floor (ms) when it is still ahead, else null.
 * Nothing is deleted automatically; the profile only shows the date.
 */
export function keepUntil({ endedAt, dob, now = Date.now() }) {
  const floor = dob ? addYears(dob, ADULT + RETAIN_YEARS) : null;
  const after = endedAt ? addYears(endedAt, RETAIN_YEARS) : null;
  return {
    keepUntil: after == null ? null : Math.max(after, floor || 0),
    notBefore: floor && floor > (after ?? now) ? floor : null,
  };
}

/** "da•••@example.com": enough for the trainer to recognise the address, not to copy it. */
export function maskEmail(email) {
  const m = /^([^@]+)@(.+)$/.exec(String(email || ''));
  if (!m) return null;
  return m[1].slice(0, Math.min(2, m[1].length - 1) || 1) + '•••@' + m[2];
}

/** A tag's wording from a flagged answer: the follow-up when it is short, else the question,
 *  cut at a word to fit. */
export function tagFromAnswer(question, followUp) {
  const pick = followUp && followUp.length <= LIMITS.tag ? followUp : question;
  const s = String(pick || '').replace(/\s+/g, ' ').trim().replace(/[?.:]+$/, '');
  if (s.length <= LIMITS.tag) return s;
  const cut = s.slice(0, LIMITS.tag - 1);
  return (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '…';
}

/** A CSV cell. A cell that a spreadsheet would run as a formula starts with a quote mark. */
const cell = v => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const csv = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function profileRoutes({ sql, access, json, readBody, audit, dataDir, now, mailer, trainerInfo, trainerName, base, clientRow }) {
  const { userById, requireOwnClient } = access;
  const query = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);

  /* ---------- reading ---------- */
  const tagsOf = (trainerId, clientId) => sql.prepare(
    'SELECT * FROM tags WHERE trainer_id = ? AND client_id = ? ORDER BY warning DESC, created_at, id').all(trainerId, clientId)
    .map(t => ({ id: t.id, text: t.text, warning: !!t.warning, fromAnswer: t.submission_id != null, created: t.created_at }));
  const notesOf = (trainerId, clientId) => sql.prepare(
    'SELECT * FROM notes WHERE trainer_id = ? AND client_id = ? ORDER BY created_at DESC, id DESC').all(trainerId, clientId)
    .map(n => ({ id: n.id, text: n.text, created: n.created_at, edited: n.edited_at || null }));

  // Every request of this trainer's that has at least one signature: done, or waiting on the guardian.
  const recordsOf = (trainerId, clientId) => sql.prepare(
    `SELECT r.*, d.kind, v.version, v.title, v.body FROM requests r
     JOIN documents d ON d.id = r.document_id JOIN document_versions v ON v.id = r.version_id
     WHERE r.trainer_id = ? AND r.client_id = ? AND EXISTS (SELECT 1 FROM submissions s WHERE s.request_id = r.id)
     ORDER BY COALESCE(r.done_at, r.client_done_at) DESC, r.id DESC`).all(trainerId, clientId);
  const subsOf = requestId => sql.prepare(
    `SELECT s.*, g.relationship, g.email AS guardian_email FROM submissions s LEFT JOIN guardians g ON g.id = s.guardian_id
     WHERE s.request_id = ? ORDER BY s.id`).all(requestId);
  const recordOf = (trainerId, clientId, id) => recordsOf(trainerId, clientId).find(r => r.id === Number(id)) || null;

  /** A form's answers as rows: flagged yes answers first, then in the form's order. */
  function answerItems(r, subs) {
    const body = parse(r.body);
    const client = subs.find(s => s.signer === 'client');
    const answers = parse(client?.answers);
    const items = (body.questions || []).filter(q => q.type !== 'signature').map((q, i) => {
      const a = answers[q.id];
      const yes = q.type === 'yes_no' && a?.yes === true;
      return { n: i + 1, questionId: q.id, q: q.text, a: answerText(q, a), yes, flagged: !!(yes && q.flagYes), followUp: yes ? a.followUp || null : null };
    });
    return [...items.filter(x => x.flagged), ...items.filter(x => !x.flagged)];
  }

  function recordSummary(r) {
    const subs = subsOf(r.id);
    const items = r.kind === 'form' ? answerItems(r, subs) : null;
    return {
      id: r.id, kind: r.kind, title: r.title, version: r.version, reason: r.reason,
      done: r.done_at || null, waitingGuardian: r.status === 'open' && !!r.client_done_at && !!r.guardian_needed,
      signers: subs.map(s => ({ signer: s.signer, name: s.signer_name, relationship: s.signer === 'guardian' ? s.relationship || null : undefined, at: s.signed_at })),
      ...(items ? { yesCount: items.filter(x => x.yes).length, flagged: items.filter(x => x.flagged).length } : {}),
    };
  }

  function recordDetail(r) {
    const subs = subsOf(r.id);
    const body = parse(r.body);
    return {
      ...recordSummary(r),
      signers: subs.map(s => ({
        signer: s.signer, name: s.signer_name, relationship: s.signer === 'guardian' ? s.relationship || null : undefined, at: s.signed_at,
        signed: fmtSigned(s.signed_at, s.tz), tz: s.tz || null, device: s.device || null, appVersion: s.app_version || null, contentHash: s.content_hash,
      })),
      ...(r.kind === 'form' ? { intro: body.intro || null, items: answerItems(r, subs) } : {}),
      ...(r.kind === 'sign' ? (body.file ? { document: { name: body.file.name, hash: body.file.hash } } : { text: body.text || '' }) : {}),
      ...(r.kind === 'pdf_return' ? { returned: !!subs[0]?.file_hash } : {}),
    };
  }

  // Flagged yes answers across the client's forms, for "Make it a tag": the latest answer to each question.
  function flaggedOf(trainerId, clientId, tags) {
    const out = [], seen = new Set();
    for (const r of recordsOf(trainerId, clientId).filter(x => x.kind === 'form')) {
      const subs = subsOf(r.id);
      const sub = subs.find(s => s.signer === 'client');
      for (const x of answerItems(r, subs).filter(i => i.flagged)) {
        const key = r.document_id + ':' + x.questionId;
        if (seen.has(key)) continue;
        seen.add(key);
        const suggested = tagFromAnswer(x.q, x.followUp);
        out.push({ record: r.id, title: r.title, question: x.q, followUp: x.followUp, submission: sub.id, at: sub.signed_at,
          tag: suggested, tagged: tags.some(t => t.text.toLowerCase() === suggested.toLowerCase()) });
      }
    }
    return out;
  }

  function waitingOf(trainerId, clientId) {
    const open = sql.prepare(
      `SELECT r.*, d.kind, v.version, v.title FROM requests r JOIN documents d ON d.id = r.document_id JOIN document_versions v ON v.id = r.version_id
       WHERE r.trainer_id = ? AND r.client_id = ? AND r.status = 'open'
       ORDER BY CASE r.reason WHEN 'packet' THEN 0 ELSE 1 END, d.packet_order, r.created_at, r.id`).all(trainerId, clientId);
    return open.map(r => ({ id: r.id, kind: r.kind, title: r.title, version: r.version, required: !!r.required, due: r.due_at || null,
      sent: r.created_at, waitingGuardian: !!r.client_done_at && !!r.guardian_needed }));
  }

  const guardianOf = (clientId, trainerId) => sql.prepare(
    'SELECT * FROM guardians WHERE client_id = ? AND trainer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(clientId, trainerId) || null;
  const guardianView = (g, t) => g && ({
    name: g.name, relationship: g.relationship, email: maskEmail(g.email),
    linkSent: g.emailed_at || null, linkExpires: g.token_hash && !g.token_used_at && g.token_expires_at > t ? g.token_expires_at : null,
    canResend: !!g.email,
  });

  function profile(own) {
    const { trainer, client, link } = own;
    const t = now();
    const about = sql.prepare('SELECT dob FROM clients WHERE client_id = ?').get(client.id);
    const tags = tagsOf(trainer.id, client.id);
    const waiting = waitingOf(trainer.id, client.id);
    const minor = about ? ageOn(about.dob, t) < ADULT : false;
    return {
      client: { ...clientRow(link, client), minor },
      tags,
      notes: notesOf(trainer.id, client.id),
      flagged: flaggedOf(trainer.id, client.id, tags),
      waiting,
      guardian: minor || waiting.some(w => w.waitingGuardian) ? guardianView(guardianOf(client.id, trainer.id), t) : null,
      records: recordsOf(trainer.id, client.id).map(recordSummary),
      retention: { years: RETAIN_YEARS, ...keepUntil({ endedAt: link.ended_at, dob: about?.dob, now: t }) },
    };
  }

  function sendBytes(res, buf, type, name) {
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': buf.length,
      'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  }
  const readStored = hash => { const p = filePath(dataDir, hash, 'application/pdf'); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
  const pdfOf = (r, clientName) => recordPdf({ dataDir, trainerName: trainerName(r.trainer_id) || 'Your trainer', clientName, kind: r.kind, title: r.title, version: r.version, body: parse(r.body), subs: subsOf(r.id) });

  /* ---------- the export ---------- */
  function exportZip(own, withNotes) {
    const { trainer, client, link } = own;
    const t = now();
    const files = [];
    const add = (name, data) => files.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') });
    const records = recordsOf(trainer.id, client.id).reverse();
    const recordRows = [['record', 'document', 'kind', 'version', 'signer', 'name', 'relationship', 'signed_at_utc', 'time_zone', 'device', 'app_version', 'content_sha256']];
    const answerRows = [['record', 'document', 'version', 'question_no', 'question', 'answer', 'flagged']];
    const json = [];
    records.forEach((r, i) => {
      const n = String(i + 1).padStart(2, '0');
      const d = recordDetail(r);
      const subs = subsOf(r.id);
      add(`records/${n}-${recordName(r)}`, pdfOf(r, client.name || 'the client'));
      const body = parse(r.body);
      if (r.kind === 'sign' && body.file?.hash) { const b = readStored(body.file.hash); if (b) add(`files/${n}-${recordName(r, '-document')}`, b); }
      if (r.kind === 'pdf_return' && subs[0]?.file_hash) { const b = readStored(subs[0].file_hash); if (b) add(`files/${n}-${recordName(r, '-returned')}`, b); }
      for (const s of subs) recordRows.push([r.id, r.title, r.kind, r.version, s.signer, s.signer_name, s.signer === 'guardian' ? s.relationship : '', new Date(s.signed_at).toISOString(), s.tz, s.device, s.app_version, s.content_hash]);
      for (const x of d.items || []) answerRows.push([r.id, r.title, r.version, x.n, x.q, x.a, x.flagged ? 'yes' : '']);
      json.push(d);
    });
    add('records.csv', csv(recordRows));
    add('answers.csv', csv(answerRows));
    const about = sql.prepare('SELECT dob, tz FROM clients WHERE client_id = ?').get(client.id);
    const guardians = sql.prepare('SELECT name, email, relationship, created_at FROM guardians WHERE client_id = ? AND trainer_id = ? ORDER BY created_at').all(client.id, trainer.id);
    const data = {
      client: { id: client.id, name: client.name || null, dob: about?.dob || null, timeZone: about?.tz || null, since: link.started_at, status: link.status },
      trainer: { id: trainer.id, name: trainerName(trainer.id) },
      guardians: guardians.map(g => ({ name: g.name, email: g.email, relationship: g.relationship, added: g.created_at })),
      records: json,
      open: waitingOf(trainer.id, client.id),
      retention: { years: RETAIN_YEARS, ...keepUntil({ endedAt: link.ended_at, dob: about?.dob, now: t }) },
    };
    if (withNotes) {
      data.tags = tagsOf(trainer.id, client.id);
      data.notes = notesOf(trainer.id, client.id);
      add('tags.csv', csv([['tag', 'warning', 'added_utc'], ...data.tags.map(x => [x.text, x.warning ? 'yes' : '', new Date(x.created).toISOString()])]));
      add('notes.csv', csv([['note', 'written_utc', 'edited_utc'], ...data.notes.map(x => [x.text, new Date(x.created).toISOString(), x.edited ? new Date(x.edited).toISOString() : ''])]));
    }
    add('client.json', JSON.stringify(data, null, 2));
    add('README.txt', [
      `Records of ${client.name || 'a client'} kept by ${trainerName(trainer.id) || 'their trainer'}, exported ${new Date(t).toISOString()}.`,
      '',
      'records/   one PDF per signed document or completed form, as it was signed',
      'files/     the PDFs that were signed, and the PDFs the client returned',
      'records.csv, answers.csv, client.json   the same records as data',
      withNotes ? 'tags.csv, notes.csv   the trainer\'s private tags and notes' : 'The trainer\'s private tags and notes are not included.',
      'manifest.json   the SHA-256 of every file here, to show nothing was changed',
      '',
    ].join('\r\n'));
    const manifest = {
      exported: new Date(t).toISOString(), client: { id: client.id, name: client.name || null }, trainer: { id: trainer.id, name: trainerName(trainer.id) },
      includesNotesAndTags: !!withNotes,
      files: files.map(f => ({ path: f.name, size: f.data.length, sha256: sha(f.data) })),
    };
    add('manifest.json', JSON.stringify(manifest, null, 2));
    return makeZip(files, t);
  }

  /* ---------- writing ---------- */
  const cleanTag = v => str(v, LIMITS.tag * 2).replace(/\s+/g, ' ').slice(0, LIMITS.tag).trim();
  const ownTag = (own, id) => sql.prepare('SELECT * FROM tags WHERE id = ? AND trainer_id = ? AND client_id = ?').get(Number(id), own.trainer.id, own.client.id) || null;
  const ownNote = (own, id) => sql.prepare('SELECT * FROM notes WHERE id = ? AND trainer_id = ? AND client_id = ?').get(Number(id), own.trainer.id, own.client.id) || null;
  const taken = (own, text, except = 0) => !!sql.prepare('SELECT 1 FROM tags WHERE trainer_id = ? AND client_id = ? AND text = ? COLLATE NOCASE AND id != ?')
    .get(own.trainer.id, own.client.id, text, except);
  const tagsAnswer = (res, own) => json(res, 200, { tags: tagsOf(own.trainer.id, own.client.id) });
  const notesAnswer = (res, own) => json(res, 200, { notes: notesOf(own.trainer.id, own.client.id) });

  return {
    // Everything on the profile in one read.
    'GET /api/coaching/client/profile': async (req, res) => {
      const own = requireOwnClient(req, res, query(req, 'id')); if (!own) return;
      json(res, 200, profile(own));
    },

    // One record: who signed and when, and for a form every answer, flagged yes answers first.
    'GET /api/coaching/client/record': async (req, res) => {
      const own = requireOwnClient(req, res, query(req, 'id')); if (!own) return;
      const r = recordOf(own.trainer.id, own.client.id, query(req, 'record'));
      if (!r) return json(res, 404, { error: 'no such record' });
      json(res, 200, { record: recordDetail(r) });
    },

    // The record as its PDF (the same PDF the client has), or the PDF the client returned.
    'GET /api/coaching/client/record/pdf': async (req, res) => {
      const own = requireOwnClient(req, res, query(req, 'id')); if (!own) return;
      const r = recordOf(own.trainer.id, own.client.id, query(req, 'record'));
      if (!r) return json(res, 404, { error: 'no such record' });
      const returned = r.kind === 'pdf_return' && subsOf(r.id)[0]?.file_hash;
      if (returned) {
        const b = readStored(returned);
        return b ? sendBytes(res, b, 'application/pdf', recordName(r, '-returned')) : json(res, 404, { error: 'no such file' });
      }
      sendBytes(res, pdfOf(r, own.client.name || 'the client'), 'application/pdf', recordName(r));
    },

    'POST /api/coaching/client/tags': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      let text = cleanTag(body.text), submission = null, warning = body.warning === true;
      // "Make it a tag" from a flagged answer: the wording comes from the answer, and it is a warning.
      if (body.fromAnswer) {
        const f = flaggedOf(own.trainer.id, own.client.id, []).find(x => x.record === Number(body.fromAnswer.record) && x.question === body.fromAnswer.question);
        if (!f) return json(res, 404, { error: 'no such answer' });
        text = text || f.tag; submission = f.submission; warning = true;
      }
      if (!text) return json(res, 400, { error: 'the tag needs a name', code: 'text' });
      if (taken(own, text)) return json(res, 409, { error: 'that tag is already there', code: 'taken' });
      const n = sql.prepare('SELECT COUNT(*) AS n FROM tags WHERE trainer_id = ? AND client_id = ?').get(own.trainer.id, own.client.id).n;
      if (n >= LIMITS.tags) return json(res, 400, { error: `at most ${LIMITS.tags} tags`, code: 'too-many' });
      sql.prepare('INSERT INTO tags (trainer_id, client_id, text, warning, submission_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(own.trainer.id, own.client.id, text, warning ? 1 : 0, submission, now());
      tagsAnswer(res, own);
    },

    // Rename a tag, or make it a warning or not.
    'POST /api/coaching/client/tag': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      const tag = ownTag(own, body.tag);
      if (!tag) return json(res, 404, { error: 'no such tag' });
      const text = body.text === undefined ? tag.text : cleanTag(body.text);
      if (!text) return json(res, 400, { error: 'the tag needs a name', code: 'text' });
      if (taken(own, text, tag.id)) return json(res, 409, { error: 'that tag is already there', code: 'taken' });
      const warning = typeof body.warning === 'boolean' ? body.warning : !!tag.warning;
      sql.prepare('UPDATE tags SET text = ?, warning = ? WHERE id = ?').run(text, warning ? 1 : 0, tag.id);
      tagsAnswer(res, own);
    },

    'POST /api/coaching/client/tag/delete': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      const tag = ownTag(own, body.tag);
      if (!tag) return json(res, 404, { error: 'no such tag' });
      sql.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
      tagsAnswer(res, own);
    },

    'POST /api/coaching/client/notes': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      const text = str(body.text, LIMITS.note);
      if (!text) return json(res, 400, { error: 'the note is empty', code: 'text' });
      sql.prepare('INSERT INTO notes (trainer_id, client_id, text, created_at) VALUES (?, ?, ?, ?)').run(own.trainer.id, own.client.id, text, now());
      notesAnswer(res, own);
    },

    'POST /api/coaching/client/note': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      const note = ownNote(own, body.note);
      if (!note) return json(res, 404, { error: 'no such note' });
      const text = str(body.text, LIMITS.note);
      if (!text) return json(res, 400, { error: 'the note is empty', code: 'text' });
      if (text !== note.text) sql.prepare('UPDATE notes SET text = ?, edited_at = ? WHERE id = ?').run(text, now(), note.id);
      notesAnswer(res, own);
    },

    'POST /api/coaching/client/note/delete': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      const note = ownNote(own, body.note);
      if (!note) return json(res, 404, { error: 'no such note' });
      sql.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
      notesAnswer(res, own);
    },

    // "Send <name> a new link": the guardian's signing link again, with the client's 2-minute limit.
    'POST /api/coaching/client/guardian/link': async (req, res) => {
      const body = await readBody(req);
      const own = requireOwnClient(req, res, body.id); if (!own) return;
      const g = guardianOf(own.client.id, own.trainer.id);
      const pending = waitingOf(own.trainer.id, own.client.id).some(w => w.waitingGuardian);
      if (!g || !pending) return json(res, 409, { error: 'nothing for the guardian to sign', code: 'nothing' });
      if (!g.email) return json(res, 409, { error: 'no email address for the guardian', code: 'no-email' });
      if (g.emailed_at && now() - g.emailed_at < GUARDIAN_EMAIL_GAP_MS) return json(res, 429, { error: 'the email was sent a moment ago', code: 'too-soon' });
      const emailed = await emailGuardianLink({ sql, mailer, trainerInfo, base, now }, g, own.client.name);
      if (!emailed) return json(res, 502, { error: 'the email could not be sent', code: 'not-sent' });
      audit(req, 'coaching.guardian.link', { user: own.trainer, target: own.client });
      json(res, 200, { ok: true, guardian: guardianView(guardianOf(own.client.id, own.trainer.id), now()) });
    },

    // Every record as PDFs, the files, the same data as JSON and CSV, and a manifest with each
    // file's SHA-256. Notes and tags only when asked for. Always written to the activity log.
    'GET /api/coaching/client/export': async (req, res) => {
      const own = requireOwnClient(req, res, query(req, 'id')); if (!own) return;
      const withNotes = query(req, 'notes') === '1';
      const zip = exportZip(own, withNotes);
      audit(req, 'coaching.client.export', { user: own.trainer, target: own.client, msg: withNotes ? 'with notes and tags' : 'records' });
      const slug = String(own.client.name || 'client').replace(/[^\w .-]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'client';
      sendBytes(res, zip, 'application/zip', `${slug}-records-${new Date(now()).toISOString().slice(0, 10)}.zip`);
    },
  };
}
