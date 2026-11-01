/* The client's side of the paperwork (trainer-fork, Phase 2e): "about you" (date of birth), the
 * sign-up packet and later requests, signing, a PDF or photos returned, the guardian (on the same
 * phone or by a one-time emailed link), the signed records and their PDFs. Spread into
 * coachingRoutes.
 *
 * Who may do what:
 *   - /api/coaching/my/*: the signed-in client, for their own live link's requests. Their own
 *     records stay readable after coaching ends.
 *   - /api/coaching/guardian*: no session. The token is the secret, works for 7 days, and is used
 *     up once nothing is left for the guardian to sign.
 * Submissions are insert only (the table's triggers refuse any change).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { tx } from './db.js';
import { MAX_PDF, readRaw, sniff, storeFile, filePath, FILE_TYPES } from './files.js';
import { makePdf, photosToPdf, jpegInfo } from './pdf.js';
import { waiverEmail, guardianEmail, looksLikeEmail } from './email.js';
import {
  MIN_AGE, ADULT, LIMITS, parseDob, ageOn, cleanTz, cleanName, signatureJpeg, contentHash, checkAnswers, clearance,
} from './submission.js';

export const GUARDIAN_DAYS = 7;
export const GUARDIAN_EMAIL_GAP_MS = 2 * 60000;
const DAY = 86400000;
const HASH = /^[0-9a-f]{64}$/;

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

/** The open requests that decide whether a client is cleared, and the verdict. */
export function clearanceOf(sql, trainerId, clientId) {
  const about = !!sql.prepare('SELECT 1 FROM clients WHERE client_id = ?').get(clientId);
  const open = sql.prepare(`SELECT required, guardian_needed, client_done_at FROM requests WHERE trainer_id = ? AND client_id = ? AND status = 'open'`).all(trainerId, clientId);
  return clearance({ about, open });
}

/** Stores the date of birth (and time zone), replacing an earlier one. */
export function saveAbout(sql, clientId, dob, tz, t) {
  sql.prepare(`INSERT INTO clients (client_id, dob, tz, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (client_id) DO UPDATE SET dob = excluded.dob, tz = COALESCE(excluded.tz, clients.tz), updated_at = excluded.updated_at`)
    .run(clientId, dob, tz, t, t);
}

/** Asks a new client for the trainer's packet: each published document in it, in order. Drafts
 *  are skipped. Done once per link. */
export function createPacket(sql, link, t) {
  const had = sql.prepare(`SELECT 1 FROM requests WHERE trainer_id = ? AND client_id = ? AND reason = 'packet' AND created_at >= ?`).get(link.trainer_id, link.client_id, link.started_at);
  if (had) return 0;
  const docs = sql.prepare(`SELECT d.id, d.required, (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.status = 'published' ORDER BY v.version DESC LIMIT 1) AS vid
                            FROM documents d WHERE d.trainer_id = ? AND d.in_packet = 1 ORDER BY d.packet_order, d.id`).all(link.trainer_id);
  const add = sql.prepare(`INSERT INTO requests (trainer_id, client_id, document_id, version_id, reason, status, required, created_at) VALUES (?, ?, ?, ?, 'packet', 'open', ?, ?)`);
  let n = 0;
  for (const d of docs) if (d.vid) { add.run(link.trainer_id, link.client_id, d.id, d.vid, d.required ? 1 : 0, t); n++; }
  return n;
}

/** "1 November 2026 at 14:03 (Europe/Zurich)". */
export function fmtSigned(ms, tz) {
  const z = cleanTz(tz);
  const opts = z ? { timeZone: z } : { timeZone: 'UTC' };
  const day = new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...opts });
  const time = new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...opts });
  return `${day} at ${time} (${z || 'UTC'})`;
}

export function answerText(q, a) {
  if (a === undefined) return 'Not answered';
  if (q.type === 'yes_no') return (a.yes ? 'Yes' : 'No') + (a.followUp ? `. ${a.followUp}` : '');
  if (Array.isArray(a)) return a.join(', ');
  if (q.type === 'signature') return '';
  return String(a);
}

/**
 * The signed record as a PDF: the document (text, or which PDF by name and hash), the answers for
 * a form, then each signature with its name, time, time zone, device and app version.
 * `answers: false` leaves a form's answers out (never needed now: forms are not emailed).
 */
export function recordPdf({ dataDir, trainerName, clientName, kind, title, version, body, subs }) {
  const doc = makePdf({ title: `${title}, version ${version}` });
  doc.text(title, { size: 18, bold: true }).text(`Version ${version} · ${trainerName}`, { size: 10, color: 0.4 }).gap(4).rule();
  if (kind === 'sign' && body.file) {
    doc.text(`The document signed is the PDF "${body.file.name}".`).text(`Its SHA-256 is ${body.file.hash}.`, { size: 9, color: 0.35 })
      .text('The PDF itself is kept with this record in the app.', { size: 9, color: 0.35 });
  } else if (kind === 'sign') {
    doc.text(body.text || '');
  } else if (kind === 'form') {
    if (body.intro) doc.text(body.intro, { color: 0.25 }).gap(4);
    const client = subs.find(s => s.signer === 'client');
    const answers = parse(client?.answers);
    (body.questions || []).forEach((q, i) => {
      doc.gap(4).text(`${i + 1}. ${q.text}`, { bold: true, size: 10 });
      const a = answers[q.id];
      if (q.type === 'signature' && a?.signature) {
        const p = filePath(dataDir, a.signature, 'image/jpeg');
        if (fs.existsSync(p)) doc.image(fs.readFileSync(p), { maxW: 180, maxH: 70, frame: true });
      } else doc.text(answerText(q, a), { indent: 12, color: 0.15 });
      if (q.type === 'yes_no' && q.flagYes && a?.yes) doc.text(`${trainerName} sees this answer before the first session.`, { indent: 12, size: 8.5, color: 0.45 });
    });
  } else if (kind === 'pdf_return') {
    doc.text(`The filled-in "${body.file?.name || 'document'}" was returned as a PDF and is kept with this record.`);
  }
  for (const s of subs) {
    doc.gap(14).rule();
    const who = s.signer === 'guardian' ? `${s.signer_name} (${s.relationship || 'parent or guardian'} of ${clientName})` : s.signer_name || clientName;
    doc.text(s.signer === 'guardian' ? 'Signed by the parent or guardian' : kind === 'form' ? 'Completed by' : 'Signed by', { bold: true, size: 11 });
    if (s.agreed) doc.text(`[x] I've read ${kind === 'form' ? 'this form' : 'the document'} and agree`, { size: 10 });
    if (s.signature_hash) {
      const p = filePath(dataDir, s.signature_hash, 'image/jpeg');
      if (fs.existsSync(p)) doc.image(fs.readFileSync(p), { maxW: 220, maxH: 80, frame: true });
    }
    doc.pair('Name', who || '');
    doc.pair('Signed', fmtSigned(s.signed_at, s.tz));
    if (s.device) doc.pair('Device', s.device);
    if (s.app_version) doc.pair('App version', s.app_version);
    doc.pair('Content SHA-256', s.content_hash);
    doc.pair('Record', `#${s.id}`);
  }
  doc.gap(14).text('This record is kept as it was signed and is never edited. A correction is a new version, signed again.', { size: 8.5, color: 0.45 });
  return doc.toBuffer();
}

/** "liability-waiver-v2.pdf": a record's file name, from its title and version. */
export const recordName = (r, suffix = '') => `${r.title.replace(/[^\w .-]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'document'}-v${r.version}${suffix}.pdf`;

/** A fresh one-time link for the guardian, emailed to them (a new link replaces the old one).
 *  Resolves whether the email went out. Used by the client's packet and by the trainer. */
export async function emailGuardianLink({ sql, mailer, trainerInfo, base, now }, g, clientName) {
  const t = now();
  const token = crypto.randomBytes(32).toString('base64url');
  sql.prepare('UPDATE guardians SET token_hash = ?, token_expires_at = ?, token_used_at = NULL WHERE id = ?').run(sha(token), t + GUARDIAN_DAYS * DAY, g.id);
  const trainer = trainerInfo(g.trainer_id);
  const mail = guardianEmail({ trainer, guardianName: g.name, clientName, url: base + '/#/guardian/' + token, days: GUARDIAN_DAYS });
  const ok = (await mailer.send({ to: g.email, via: trainer.via, replyTo: trainer.contactEmail, ...mail })).ok;
  if (ok) sql.prepare('UPDATE guardians SET emailed_at = ? WHERE id = ?').run(t, g.id);
  return ok;
}

export function packetRoutes({ sql, access, json, readBody, audit, dataDir, now, mailer, trainerInfo, trainerName, base }) {
  const { userById, liveLinkOf, requireUser } = access;
  const query = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);

  const aboutOf = clientId => sql.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId) || null;
  const guardianOf = (clientId, trainerId) => sql.prepare('SELECT * FROM guardians WHERE client_id = ? AND trainer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(clientId, trainerId) || null;
  const requestRow = id => sql.prepare(
    `SELECT r.*, d.kind, d.packet_order, v.version, v.title, v.body FROM requests r
     JOIN documents d ON d.id = r.document_id JOIN document_versions v ON v.id = r.version_id WHERE r.id = ?`).get(Number(id)) || null;
  const subsOf = requestId => sql.prepare(
    `SELECT s.*, g.relationship FROM submissions s LEFT JOIN guardians g ON g.id = s.guardian_id WHERE s.request_id = ? ORDER BY s.id`).all(requestId);
  const openOf = (trainerId, clientId) => sql.prepare(
    `SELECT r.*, d.kind, d.packet_order, v.version, v.title, v.body FROM requests r
     JOIN documents d ON d.id = r.document_id JOIN document_versions v ON v.id = r.version_id
     WHERE r.trainer_id = ? AND r.client_id = ? AND r.status = 'open'
     ORDER BY CASE r.reason WHEN 'packet' THEN 0 ELSE 1 END, d.packet_order, r.created_at, r.id`).all(trainerId, clientId);

  const guardianView = g => g && ({
    name: g.name, email: g.email || null, relationship: g.relationship,
    linkSent: g.emailed_at || null, linkExpires: g.token_hash && !g.token_used_at ? g.token_expires_at : null,
  });
  const step = r => ({
    id: r.id, documentId: r.document_id, kind: r.kind, title: r.title, version: r.version, body: parse(r.body),
    required: !!r.required, due: r.due_at || null, reason: r.reason, guardianNeeded: !!r.guardian_needed, clientDone: r.client_done_at || null,
  });

  function recordFor(r) {
    const subs = subsOf(r.id);
    const client = userById(r.client_id);
    return {
      pdf: recordPdf({ dataDir, trainerName: trainerName(r.trainer_id) || 'Your trainer', clientName: client?.name || 'the client', kind: r.kind, title: r.title, version: r.version, body: parse(r.body), subs }),
      subs,
    };
  }

  // The signed copy of a document to sign goes to the client and, when they signed, the guardian.
  // Forms and returned PDFs are not emailed: they can hold health answers.
  async function emailCopies(r) {
    if (r.kind !== 'sign') return;
    const { pdf, subs } = recordFor(r);
    const trainer = trainerInfo(r.trainer_id);
    const client = userById(r.client_id);
    const last = subs[subs.length - 1];
    const signerName = subs.map(s => s.signer_name).filter(Boolean).join(' and ');
    const mail = name => waiverEmail({ trainer, recipientName: name, signerName, title: r.title, version: r.version, signedAt: last.signed_at, tz: cleanTz(last.tz) || undefined, tzLabel: cleanTz(last.tz) || undefined, pdf: { filename: recordName(r), content: pdf } });
    if (looksLikeEmail(client?.email)) await mailer.send({ to: client.email, via: trainer.via, replyTo: trainer.contactEmail, ...mail(client.name) });
    const g = subs.find(s => s.signer === 'guardian');
    const gRow = g && sql.prepare('SELECT * FROM guardians WHERE id = ?').get(g.guardian_id);
    if (looksLikeEmail(gRow?.email)) await mailer.send({ to: gRow.email, via: trainer.via, replyTo: trainer.contactEmail, ...mail(gRow.name) });
  }

  /** Stores a JPEG (a signature) as a file the client owns. */
  function keepJpeg(owner, buf, t) {
    const hash = storeFile(dataDir, buf, 'image/jpeg');
    sql.prepare('INSERT OR IGNORE INTO files (hash, owner_id, size, type, created_at) VALUES (?, ?, ?, ?, ?)').run(hash, owner, buf.length, 'image/jpeg', t);
    return hash;
  }

  // A client may read the files of the documents they were asked for, what they uploaded, and
  // the files of their own records.
  const clientMayRead = (clientId, hash) => !!(
    sql.prepare('SELECT 1 FROM files WHERE hash = ? AND owner_id = ?').get(hash, clientId) ||
    sql.prepare('SELECT 1 FROM submissions WHERE client_id = ? AND (signature_hash = ? OR file_hash = ? OR answers LIKE ?)').get(clientId, hash, hash, `%${hash}%`) ||
    sql.prepare(`SELECT 1 FROM requests r JOIN document_versions v ON v.id = r.version_id WHERE r.client_id = ? AND v.body LIKE ?`).get(clientId, `%"hash":"${hash}"%`)
  );
  function sendFile(res, hash, name) {
    const type = sql.prepare('SELECT type FROM files WHERE hash = ? LIMIT 1').get(hash)?.type || 'application/pdf';
    const p = filePath(dataDir, hash, FILE_TYPES.includes(type) ? type : 'application/pdf');
    if (!fs.existsSync(p)) return json(res, 404, { error: 'no such file' });
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': fs.statSync(p).size,
      'Content-Disposition': name ? `attachment; filename="${name}"` : 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(p).pipe(res);
  }
  function sendPdf(res, buf, name) {
    res.writeHead(200, {
      'Content-Type': 'application/pdf', 'Content-Length': buf.length,
      'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  }

  /**
   * Checks and records one submission. Returns { status, body } to answer with. `who` is the
   * signer: { signer: 'client' } or { signer: 'guardian', guardian }.
   */
  function submit(req, r, who, body, owner) {
    const t = now();
    const about = aboutOf(r.client_id);
    if (!about) return { status: 409, body: { error: 'date of birth first', code: 'about' } };
    const minor = ageOn(about.dob, t) < ADULT;
    const content = parse(r.body);
    if (who.signer === 'client' && r.client_done_at) return { status: 409, body: { error: 'already done', code: 'done' } };
    if (who.signer === 'guardian' && !(r.client_done_at && r.guardian_needed)) return { status: 409, body: { error: 'nothing for the guardian to sign', code: 'done' } };
    const row = {
      signer_name: null, agreed: 0, answers: null, flagged_yes: 0, signature_hash: null, file_hash: null,
      device: str(body.device, 200) || str(req.headers['user-agent'], 200) || null, app_version: str(body.appVersion, 40) || null,
      tz: cleanTz(body.tz), content_hash: contentHash(r.kind, content),
    };
    if (r.kind === 'sign') {
      if (body.agreed !== true) return { status: 400, body: { error: 'tick "I\'ve read and agree"', code: 'agree' } };
      const name = cleanName(body.name);
      if (name.length < 2) return { status: 400, body: { error: 'type your full name', code: 'name' } };
      const sig = signatureJpeg(body.signature);
      if (!sig) return { status: 400, body: { error: 'sign with your finger', code: 'signature' } };
      Object.assign(row, { signer_name: name, agreed: 1, signature_hash: keepJpeg(owner, sig, t) });
    } else if (r.kind === 'form') {
      const checked = checkAnswers(content.questions || [], body.answers);
      if (checked.code) return { status: 400, body: { error: 'check the answers', ...checked } };
      for (const [id, buf] of Object.entries(checked.signatures)) checked.answers[id] = { signature: keepJpeg(owner, buf, t) };
      Object.assign(row, { signer_name: userById(r.client_id)?.name || null, answers: JSON.stringify(checked.answers), flagged_yes: checked.flagged });
    } else if (r.kind === 'pdf_return') {
      const hashes = Array.isArray(body.files) ? body.files.map(String) : [];
      if (!hashes.length || hashes.length > LIMITS.photos || hashes.some(h => !HASH.test(h))) return { status: 400, body: { error: 'upload the filled-in PDF or photos of it', code: 'files' } };
      const rows = hashes.map(h => sql.prepare('SELECT * FROM files WHERE hash = ? AND owner_id = ?').get(h, owner));
      if (rows.some(x => !x)) return { status: 400, body: { error: 'unknown file', code: 'files' } };
      let hash;
      if (rows.length === 1 && rows[0].type === 'application/pdf') hash = rows[0].hash;
      else if (rows.every(x => x.type === 'image/jpeg')) {
        const pdf = photosToPdf(rows.map(x => fs.readFileSync(filePath(dataDir, x.hash, 'image/jpeg'))), r.title);
        hash = storeFile(dataDir, pdf);
        sql.prepare('INSERT OR IGNORE INTO files (hash, owner_id, size, type, created_at) VALUES (?, ?, ?, ?, ?)').run(hash, owner, pdf.length, 'application/pdf', t);
      } else return { status: 400, body: { error: 'one PDF, or photos only', code: 'files' } };
      Object.assign(row, { signer_name: userById(r.client_id)?.name || null, file_hash: hash });
    }
    // For a client under 18, a document to sign waits for the guardian as well.
    const needsGuardian = who.signer === 'client' && minor && r.kind === 'sign';
    const id = tx(sql, () => {
      const { lastInsertRowid } = sql.prepare(
        `INSERT INTO submissions (trainer_id, client_id, request_id, document_id, version_id, signer, guardian_id, signer_name, agreed, answers, flagged_yes,
           content_hash, signature_hash, file_hash, device, app_version, tz, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(r.trainer_id, r.client_id, r.id, r.document_id, r.version_id, who.signer, who.guardian?.id ?? null, row.signer_name, row.agreed, row.answers, row.flagged_yes,
        row.content_hash, row.signature_hash, row.file_hash, row.device, row.app_version, row.tz, t);
      if (needsGuardian) sql.prepare('UPDATE requests SET client_done_at = ?, guardian_needed = 1 WHERE id = ?').run(t, r.id);
      else sql.prepare(`UPDATE requests SET status = 'done', done_at = ?, client_done_at = COALESCE(client_done_at, ?) WHERE id = ?`).run(t, t, r.id);
      if (row.tz && who.signer === 'client') sql.prepare('UPDATE clients SET tz = ? WHERE client_id = ?').run(row.tz, r.client_id);
      return lastInsertRowid;
    });
    return { status: 200, id, done: !needsGuardian, flagged: row.flagged_yes };
  }

  // The client's own live link, or 404 already sent.
  function ownLink(req, res) {
    const user = requireUser(req, res); if (!user) return null;
    const link = liveLinkOf(user.id);
    if (!link) { json(res, 404, { error: 'you have no trainer', code: 'no-trainer' }); return null; }
    return { user, link };
  }

  const myView = (user, link) => {
    const about = aboutOf(user.id);
    const age = about ? ageOn(about.dob, now()) : null;
    const open = openOf(link.trainer_id, user.id);
    const done = sql.prepare(
      `SELECT r.id, r.document_id, r.done_at, d.kind, v.version, v.title FROM requests r JOIN documents d ON d.id = r.document_id JOIN document_versions v ON v.id = r.version_id
       WHERE r.client_id = ? AND r.trainer_id = ? AND r.status = 'done' ORDER BY r.done_at DESC, r.id DESC`).all(user.id, link.trainer_id);
    return {
      trainer: { id: link.trainer_id, name: trainerName(link.trainer_id) },
      about: !!about, dob: about?.dob || null, age, minor: age != null && age < ADULT,
      guardian: guardianView(guardianOf(user.id, link.trainer_id)),
      todo: open.filter(r => !r.client_done_at).map(step),
      waiting: open.filter(r => r.client_done_at).map(step),
      done: done.map(r => {
        const subs = subsOf(r.id);
        return { id: r.id, documentId: r.document_id, kind: r.kind, title: r.title, version: r.version, done: r.done_at,
          signers: subs.map(s => ({ signer: s.signer, name: s.signer_name, at: s.signed_at })) };
      }),
      ...(c => ({ cleared: c.cleared, state: c.state, requiredLeft: c.requiredLeft, guardianLeft: c.guardian }))(clearance({ about: !!about, open })),
    };
  };

  /* ---------- the guardian's link ---------- */
  const guardianByToken = token => {
    const t = str(token, 100);
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(t)) return null;
    return sql.prepare('SELECT * FROM guardians WHERE token_hash = ?').get(sha(t)) || null;
  };
  // A guardian link is good while unused, not past its date, and the coaching it belongs to is live.
  function guardianFrom(token, res) {
    const g = guardianByToken(token);
    if (!g) { json(res, 404, { error: 'this link is not valid', code: 'invalid' }); return null; }
    if (g.token_used_at) { json(res, 410, { error: 'this link was already used', code: 'used' }); return null; }
    if (g.token_expires_at <= now()) { json(res, 410, { error: 'this link has expired', code: 'expired' }); return null; }
    const link = liveLinkOf(g.client_id);
    if (!link || link.trainer_id !== g.trainer_id) { json(res, 410, { error: 'this link is no longer valid', code: 'revoked' }); return null; }
    return g;
  }
  const guardianPending = g => openOf(g.trainer_id, g.client_id).filter(r => r.client_done_at && r.guardian_needed);

  return {
    // For someone who was already a client before 2e: the date of birth, then the packet.
    'POST /api/coaching/my/about': async (req, res) => {
      const own = ownLink(req, res); if (!own) return;
      const body = await readBody(req);
      if (aboutOf(own.user.id)) return json(res, 409, { error: 'already given', code: 'already' });
      const dob = parseDob(body.dob, now());
      if (!dob) return json(res, 400, { error: 'that date does not look right', code: 'dob' });
      if (ageOn(dob, now()) < MIN_AGE) return json(res, 400, { error: `you need to be ${MIN_AGE} or older`, code: 'too-young' });
      tx(sql, () => { saveAbout(sql, own.user.id, dob, cleanTz(body.tz), now()); createPacket(sql, own.link, now()); });
      json(res, 200, myView(own.user, own.link));
    },

    // Everything the client sees about their paperwork: to do, waiting for the guardian, done.
    'GET /api/coaching/my/documents': async (req, res) => {
      const own = ownLink(req, res); if (!own) return;
      json(res, 200, myView(own.user, own.link));
    },

    // A filled-in PDF, or one photo of a page (JPEG): the raw bytes, up to 10 MB.
    'POST /api/coaching/my/files': async (req, res) => {
      const own = ownLink(req, res); if (!own) { req.resume(); return; }
      const declared = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!FILE_TYPES.includes(declared)) { req.resume(); return json(res, 415, { error: 'a PDF or a JPEG photo', code: 'type' }); }
      const buf = await readRaw(req, MAX_PDF);
      if (!buf) return json(res, 413, { error: 'the file is larger than 10 MB', code: 'too-large' });
      if (sniff(buf) !== declared || (declared === 'image/jpeg' && !jpegInfo(buf))) return json(res, 400, { error: 'that file could not be read', code: 'type' });
      const hash = storeFile(dataDir, buf, declared);
      sql.prepare('INSERT OR IGNORE INTO files (hash, owner_id, size, type, created_at) VALUES (?, ?, ?, ?, ?)').run(hash, own.user.id, buf.length, declared, now());
      json(res, 200, { hash, size: buf.length, type: declared });
    },

    'GET /api/coaching/my/file': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const hash = String(query(req, 'hash') || '');
      if (!HASH.test(hash) || !clientMayRead(user.id, hash)) return json(res, 404, { error: 'no such file' });
      sendFile(res, hash);
    },

    // Complete one request: answer a form, sign a document, return a PDF. `signer: 'guardian'`
    // is the guardian signing on the client's phone.
    'POST /api/coaching/my/submit': async (req, res) => {
      const own = ownLink(req, res); if (!own) return;
      const body = await readBody(req);
      const r = requestRow(body.request);
      if (!r || r.client_id !== own.user.id || r.trainer_id !== own.link.trainer_id || r.status !== 'open') return json(res, 404, { error: 'no such request' });
      let who = { signer: 'client' };
      if (body.signer === 'guardian') {
        const g = guardianOf(own.user.id, own.link.trainer_id);
        if (!g) return json(res, 409, { error: 'add the parent or guardian first', code: 'no-guardian' });
        who = { signer: 'guardian', guardian: g };
      }
      const out = submit(req, r, who, body, own.user.id);
      if (out.status !== 200) return json(res, out.status, out.body);
      audit(req, who.signer === 'guardian' ? 'coaching.guardian.sign' : 'coaching.document.complete', { user: own.user, target: userById(own.link.trainer_id), msg: `${r.title} v${r.version}` });
      if (out.done) await emailCopies(r);
      json(res, 200, { ...myView(own.user, own.link), ok: true, record: out.id, complete: out.done });
    },

    // The parent or guardian of a client under 18: their details, and with `send` a one-time
    // link by email (a new link replaces the old one).
    'POST /api/coaching/my/guardian': async (req, res) => {
      const own = ownLink(req, res); if (!own) return;
      const body = await readBody(req);
      const about = aboutOf(own.user.id);
      if (!about || ageOn(about.dob, now()) >= ADULT) return json(res, 409, { error: 'only for clients under 18', code: 'adult' });
      const name = cleanName(body.name);
      const relationship = str(body.relationship, LIMITS.relationship) || 'Parent';
      const email = str(body.email, 254).toLowerCase() || null;
      if (name.length < 2) return json(res, 400, { error: 'their full name', code: 'name' });
      if (email && !looksLikeEmail(email)) return json(res, 400, { error: 'that email address does not look right', code: 'email' });
      if (body.send && !email) return json(res, 400, { error: 'their email, to send the link', code: 'email' });
      const t = now();
      let g = guardianOf(own.user.id, own.link.trainer_id);
      if (body.send && g?.emailed_at && t - g.emailed_at < GUARDIAN_EMAIL_GAP_MS && g.email === email) {
        return json(res, 429, { error: 'the email was sent a moment ago', code: 'too-soon' });
      }
      const fresh = !g || g.token_used_at || g.name !== name || g.email !== email;
      if (fresh) {
        const { lastInsertRowid } = sql.prepare('INSERT INTO guardians (client_id, trainer_id, name, email, relationship, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(own.user.id, own.link.trainer_id, name, email, relationship, t);
        g = sql.prepare('SELECT * FROM guardians WHERE id = ?').get(lastInsertRowid);
      } else if (g.relationship !== relationship) {
        sql.prepare('UPDATE guardians SET relationship = ? WHERE id = ?').run(relationship, g.id);
      }
      let emailed = null;
      if (body.send) {
        emailed = await emailGuardianLink({ sql, mailer, trainerInfo, base, now }, g, own.user.name);
        audit(req, 'coaching.guardian.link', { user: own.user, target: userById(own.link.trainer_id) });
      }
      json(res, 200, { emailed, ...myView(own.user, own.link) });
    },

    // A signed record as a PDF, or the PDF the client returned. The client's own, also after
    // coaching ended.
    'GET /api/coaching/my/record': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const r = requestRow(query(req, 'id'));
      if (!r || r.client_id !== user.id) return json(res, 404, { error: 'no such record' });
      const subs = subsOf(r.id);
      if (!subs.length) return json(res, 404, { error: 'no such record' });
      if (r.kind === 'pdf_return' && subs[0].file_hash) return sendFile(res, subs[0].file_hash, recordName(r));
      sendPdf(res, recordFor(r).pdf, recordName(r));
    },

    // The guardian's page. Shows the client's completed forms so the guardian knows what they
    // agree to, and what is left to sign.
    'GET /api/coaching/guardian': async (req, res) => {
      const g = guardianFrom(query(req, 'token'), res); if (!g) return;
      const client = userById(g.client_id);
      const forms = sql.prepare(
        `SELECT r.id, v.title, v.version, v.body, s.answers FROM requests r JOIN documents d ON d.id = r.document_id JOIN document_versions v ON v.id = r.version_id
         JOIN submissions s ON s.request_id = r.id AND s.signer = 'client'
         WHERE r.client_id = ? AND r.trainer_id = ? AND r.status = 'done' AND d.kind = 'form' ORDER BY r.done_at DESC`).all(g.client_id, g.trainer_id);
      const seen = new Set();
      json(res, 200, {
        client: { name: client?.name || null }, trainer: { name: trainerName(g.trainer_id) },
        guardian: { name: g.name, relationship: g.relationship }, expires: g.token_expires_at,
        sign: guardianPending(g).map(step),
        read: forms.filter(f => !seen.has(f.title) && seen.add(f.title)).map(f => {
          const body = parse(f.body), answers = parse(f.answers);
          return { id: f.id, title: f.title, version: f.version,
            items: (body.questions || []).filter(q => q.type !== 'signature').map(q => ({ q: q.text, a: answerText(q, answers[q.id]), flagged: !!(q.flagYes && answers[q.id]?.yes) })) };
        }),
      });
    },

    // The PDF of a document the guardian is asked to sign, when it is an uploaded PDF.
    'GET /api/coaching/guardian/file': async (req, res) => {
      const g = guardianFrom(query(req, 'token'), res); if (!g) return;
      const hash = String(query(req, 'hash') || '');
      if (!HASH.test(hash) || !guardianPending(g).some(r => parse(r.body).file?.hash === hash)) return json(res, 404, { error: 'no such file' });
      sendFile(res, hash);
    },

    'POST /api/coaching/guardian/sign': async (req, res) => {
      const body = await readBody(req);
      const g = guardianFrom(body.token, res); if (!g) return;
      const r = requestRow(body.request);
      if (!r || r.client_id !== g.client_id || r.trainer_id !== g.trainer_id || r.status !== 'open') return json(res, 404, { error: 'no such request' });
      const out = submit(req, r, { signer: 'guardian', guardian: g }, body, g.client_id);
      if (out.status !== 200) return json(res, out.status, out.body);
      const left = guardianPending(g).length;
      if (!left) sql.prepare('UPDATE guardians SET token_used_at = ? WHERE id = ?').run(now(), g.id);
      audit(req, 'coaching.guardian.sign', { uid: g.client_id, name: g.name, target: userById(g.trainer_id), msg: `${r.title} v${r.version}` });
      await emailCopies(r);
      json(res, 200, { ok: true, left });
    },
  };
}
