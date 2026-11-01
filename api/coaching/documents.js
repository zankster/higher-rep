/* The trainer's document library (trainer-fork, Phase 2d): documents, drafts and published
 * versions, the sign-up packet's order, PDF uploads, and asking clients for a document.
 * Spread into coachingRoutes. Every route is the trainer's own: another trainer's document, or a
 * client who is not theirs, is a 404 like anything else that is not yours.
 */
import fs from 'node:fs';
import { tx } from './db.js';
import { KINDS, cleanBody, cleanTitle, emptyBody, fileHashes, publishProblem } from './doc-body.js';
import { MAX_PDF, readRaw, isPdf, storeFile, filePath } from './files.js';

const HASH = /^[0-9a-f]{64}$/;
const LIVE = `('active', 'paused')`;

export function documentRoutes({ sql, access, json, readBody, audit, dataDir, now }) {
  const { userById, requireTrainer } = access;
  const query = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);
  const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

  const ownDoc = (trainer, id) => sql.prepare('SELECT * FROM documents WHERE id = ? AND trainer_id = ?').get(Number(id), trainer.id) || null;
  const draftOf = docId => sql.prepare(`SELECT * FROM document_versions WHERE document_id = ? AND status = 'draft'`).get(docId) || null;
  const latestOf = docId => sql.prepare(`SELECT * FROM document_versions WHERE document_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1`).get(docId) || null;
  const liveClients = trainerId => sql.prepare(`SELECT client_id, status FROM links WHERE trainer_id = ? AND status IN ${LIVE} ORDER BY started_at`).all(trainerId);

  // A trainer may use a file they uploaded, or one already in a document of theirs.
  const mayUseFile = (trainer, hash) => !!(
    sql.prepare('SELECT 1 FROM files WHERE hash = ? AND owner_id = ?').get(hash, trainer.id) ||
    sql.prepare(`SELECT 1 FROM document_versions v JOIN documents d ON d.id = v.document_id
                 WHERE d.trainer_id = ? AND v.body LIKE ?`).get(trainer.id, `%"hash":"${hash}"%`)
  );

  const summary = d => {
    const latest = latestOf(d.id), draft = draftOf(d.id);
    return {
      id: d.id, kind: d.kind, title: d.title, inPacket: !!d.in_packet, order: d.packet_order, required: !!d.required,
      version: latest ? latest.version : null, hasDraft: !!draft,
      updated: Math.max(draft?.updated_at || 0, latest?.published_at || 0, d.created_at),
    };
  };
  const versionView = v => v && ({ version: v.version, title: v.title, body: parse(v.body), updated: v.updated_at, published: v.published_at || null });

  // Current clients who finished a published version and have nothing open: the people "ask
  // current clients to sign the new version" asks, before it is published.
  const completedEarlier = doc => sql.prepare(
    `SELECT DISTINCT r.client_id FROM requests r JOIN links l ON l.client_id = r.client_id AND l.trainer_id = r.trainer_id AND l.status IN ${LIVE}
     WHERE r.document_id = ? AND r.status = 'done'
       AND NOT EXISTS (SELECT 1 FROM requests o WHERE o.document_id = r.document_id AND o.client_id = r.client_id AND o.status = 'open')`
  ).all(doc.id).map(r => r.client_id);

  const detail = d => {
    const latest = latestOf(d.id);
    return {
      ...summary(d), rightsConfirmed: d.rights_confirmed_at,
      draft: versionView(draftOf(d.id)), published: versionView(latest),
      versions: sql.prepare(`SELECT version, published_at FROM document_versions WHERE document_id = ? AND status = 'published' ORDER BY version DESC`).all(d.id)
        .map(v => ({ version: v.version, published: v.published_at })),
      completedEarlier: completedEarlier(d).length,
      open: sql.prepare(`SELECT COUNT(*) AS n FROM requests WHERE document_id = ? AND status = 'open'`).get(d.id).n,
    };
  };

  return {
    'GET /api/coaching/documents': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const docs = sql.prepare('SELECT * FROM documents WHERE trainer_id = ? ORDER BY in_packet DESC, packet_order, created_at').all(trainer.id);
      json(res, 200, { documents: docs.map(summary) });
    },

    // A new document starts as a draft. Ticking "I wrote this document or have permission to use
    // it" is required, and when is kept.
    'POST /api/coaching/documents/new': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const title = cleanTitle(body.title);
      if (!title) return json(res, 400, { error: 'title required', code: 'title' });
      if (!KINDS.includes(body.kind)) return json(res, 400, { error: 'unknown kind', code: 'kind' });
      if (body.rights !== true) return json(res, 400, { error: 'confirm you wrote this document or may use it', code: 'rights' });
      const t = now();
      const id = tx(sql, () => {
        const { lastInsertRowid } = sql.prepare('INSERT INTO documents (trainer_id, kind, title, rights_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(trainer.id, body.kind, title, t, t);
        sql.prepare(`INSERT INTO document_versions (document_id, status, title, body, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?, ?)`)
          .run(lastInsertRowid, title, JSON.stringify(emptyBody(body.kind)), t, t);
        return lastInsertRowid;
      });
      audit(req, 'coaching.document.create', { user: trainer, msg: title });
      json(res, 200, { document: detail(ownDoc(trainer, id)) });
    },

    'GET /api/coaching/document': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const d = ownDoc(trainer, query(req, 'id'));
      if (!d) return json(res, 404, { error: 'no such document' });
      json(res, 200, { document: detail(d) });
    },

    // Autosave. Starts a draft from the latest version when there is none; a published version is
    // never changed.
    'POST /api/coaching/document/draft': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const d = ownDoc(trainer, body.id);
      if (!d) return json(res, 404, { error: 'no such document' });
      const latest = latestOf(d.id), draft = draftOf(d.id);
      const title = cleanTitle(body.title) || draft?.title || latest?.title || d.title;
      const content = cleanBody(d.kind, body.body !== undefined ? body.body : parse((draft || latest)?.body));
      for (const h of fileHashes(content)) if (!mayUseFile(trainer, h)) return json(res, 400, { error: 'unknown file', code: 'file' });
      const t = now();
      if (draft) sql.prepare('UPDATE document_versions SET title = ?, body = ?, updated_at = ? WHERE id = ?').run(title, JSON.stringify(content), t, draft.id);
      else sql.prepare(`INSERT INTO document_versions (document_id, status, title, body, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?, ?)`).run(d.id, title, JSON.stringify(content), t, t);
      json(res, 200, { draft: versionView(draftOf(d.id)) });
    },

    // Drop the draft and keep the published version as it is. A document never published has
    // nothing to fall back on: that is Delete.
    'POST /api/coaching/document/discard': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const d = ownDoc(trainer, body.id);
      if (!d) return json(res, 404, { error: 'no such document' });
      if (!latestOf(d.id)) return json(res, 409, { error: 'never published: delete it instead', code: 'never-published' });
      sql.prepare(`DELETE FROM document_versions WHERE document_id = ? AND status = 'draft'`).run(d.id);
      json(res, 200, { document: detail(d) });
    },

    // Publishing freezes the draft as the next version. Open requests move to the new version,
    // except one the client already signed and that waits for the guardian: the guardian signs
    // what the client signed. `askCurrent` also asks the clients who completed an earlier version
    // to do this one; `required` makes that new request required before their next session.
    'POST /api/coaching/document/publish': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const d = ownDoc(trainer, body.id);
      if (!d) return json(res, 404, { error: 'no such document' });
      const draft = draftOf(d.id);
      if (!draft) return json(res, 409, { error: 'nothing to publish', code: 'no-draft' });
      const content = cleanBody(d.kind, parse(draft.body));
      if (d.kind === 'form') for (const q of content.questions) if (q.options) q.options = q.options.filter(Boolean);
      const problem = publishProblem(d.kind, content);
      if (problem) return json(res, 400, { error: 'not ready to publish', ...problem });
      const before = latestOf(d.id);
      const ask = body.askCurrent === true ? completedEarlier(d) : [];
      const t = now();
      const version = (before?.version || 0) + 1;
      tx(sql, () => {
        sql.prepare(`UPDATE document_versions SET status = 'published', version = ?, body = ?, published_at = ?, updated_at = ? WHERE id = ?`)
          .run(version, JSON.stringify(content), t, t, draft.id);
        sql.prepare('UPDATE documents SET title = ? WHERE id = ?').run(draft.title, d.id);
        sql.prepare(`UPDATE requests SET version_id = ? WHERE document_id = ? AND status = 'open' AND client_done_at IS NULL`).run(draft.id, d.id);
        const add = sql.prepare(`INSERT INTO requests (trainer_id, client_id, document_id, version_id, reason, status, required, created_at) VALUES (?, ?, ?, ?, 'new_version', 'open', ?, ?)`);
        for (const c of ask) add.run(trainer.id, c, d.id, draft.id, body.required === true ? 1 : 0, t);
      });
      audit(req, 'coaching.document.publish', { user: trainer, msg: `${draft.title} v${version}` });
      json(res, 200, { document: detail(ownDoc(trainer, d.id)), version, asked: ask.length });
    },

    // The sign-up packet, in order. Documents left out of the list leave the packet.
    'POST /api/coaching/documents/packet': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(Number) : null;
      if (!ids || new Set(ids).size !== ids.length || ids.length > 50) return json(res, 400, { error: 'ids must be a list of your documents', code: 'ids' });
      if (ids.some(id => !ownDoc(trainer, id))) return json(res, 404, { error: 'no such document' });
      tx(sql, () => {
        sql.prepare('UPDATE documents SET in_packet = 0, packet_order = NULL WHERE trainer_id = ?').run(trainer.id);
        const set = sql.prepare('UPDATE documents SET in_packet = 1, packet_order = ? WHERE id = ?');
        ids.forEach((id, i) => set.run(i, id));
      });
      const docs = sql.prepare('SELECT * FROM documents WHERE trainer_id = ? ORDER BY in_packet DESC, packet_order, created_at').all(trainer.id);
      json(res, 200, { documents: docs.map(summary) });
    },

    // "Required before training": a client is not cleared to train until every required request
    // is done. Applies to sign-up packets from now on; requests already made keep what they had.
    'POST /api/coaching/document/required': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const d = ownDoc(trainer, body.id);
      if (!d) return json(res, 404, { error: 'no such document' });
      if (typeof body.required !== 'boolean') return json(res, 400, { error: 'required must be true or false' });
      sql.prepare('UPDATE documents SET required = ? WHERE id = ?').run(body.required ? 1 : 0, d.id);
      json(res, 200, { document: summary(ownDoc(trainer, d.id)) });
    },

    // Only a document that was never published can go: a published one may already be signed.
    'POST /api/coaching/document/delete': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const d = ownDoc(trainer, body.id);
      if (!d) return json(res, 404, { error: 'no such document' });
      if (latestOf(d.id)) return json(res, 409, { error: 'a published document stays in your records', code: 'published' });
      tx(sql, () => {
        sql.prepare('DELETE FROM document_versions WHERE document_id = ?').run(d.id);
        sql.prepare('DELETE FROM documents WHERE id = ?').run(d.id);
      });
      audit(req, 'coaching.document.delete', { user: trainer, msg: d.title });
      json(res, 200, { ok: true });
    },

    // The trainer's live clients and where each stands with this document's latest version.
    'GET /api/coaching/document/recipients': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const d = ownDoc(trainer, query(req, 'id'));
      if (!d) return json(res, 404, { error: 'no such document' });
      const latest = latestOf(d.id);
      const state = clientId => {
        const rs = sql.prepare('SELECT status, version_id FROM requests WHERE document_id = ? AND client_id = ? AND trainer_id = ?').all(d.id, clientId, trainer.id);
        if (latest && rs.some(r => r.status === 'done' && r.version_id === latest.id)) return 'done';
        if (rs.some(r => r.status === 'open')) return 'open';
        if (rs.some(r => r.status === 'done')) return 'done_earlier';
        return 'none';
      };
      json(res, 200, {
        version: latest?.version ?? null,
        clients: liveClients(trainer.id).map(l => ({ id: l.client_id, name: userById(l.client_id)?.name || null, paused: l.status === 'paused', state: state(l.client_id) })),
      });
    },

    // Ask clients for the latest version. Someone who already finished it, or has it open, is
    // skipped. A paused client gets it now and sees it when coaching resumes. `required` (the
    // document's own setting when left out) makes it required before their next session.
    'POST /api/coaching/document/send': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const d = ownDoc(trainer, body.id);
      if (!d) return json(res, 404, { error: 'no such document' });
      const latest = latestOf(d.id);
      if (!latest) return json(res, 409, { error: 'publish it first', code: 'unpublished' });
      const live = new Set(liveClients(trainer.id).map(l => l.client_id));
      const wanted = body.clients === 'all' ? [...live] : Array.isArray(body.clients) ? body.clients.map(String) : null;
      if (!wanted?.length) return json(res, 400, { error: 'choose who to send it to', code: 'clients' });
      if (wanted.some(c => !live.has(c))) return json(res, 404, { error: 'no such client' });
      const due = body.due == null || body.due === '' ? null : Number(body.due);
      if (due !== null && !(Number.isFinite(due) && due > now() - 86400000)) return json(res, 400, { error: 'that date has passed', code: 'due' });
      const required = typeof body.required === 'boolean' ? body.required : !!d.required;
      const t = now();
      let sent = 0;
      tx(sql, () => {
        const busy = sql.prepare(`SELECT 1 FROM requests WHERE document_id = ? AND client_id = ? AND (status = 'open' OR (status = 'done' AND version_id = ?))`);
        const add = sql.prepare(`INSERT INTO requests (trainer_id, client_id, document_id, version_id, reason, status, required, due_at, created_at) VALUES (?, ?, ?, ?, 'sent', 'open', ?, ?, ?)`);
        for (const c of new Set(wanted)) if (!busy.get(d.id, c, latest.id)) { add.run(trainer.id, c, d.id, latest.id, required ? 1 : 0, due, t); sent++; }
      });
      audit(req, 'coaching.document.send', { user: trainer, msg: `${d.title} to ${sent}` });
      json(res, 200, { sent, skipped: new Set(wanted).size - sent });
    },

    // A PDF for a document: the raw bytes, Content-Type application/pdf, up to 10 MB.
    'POST /api/coaching/files': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      if (!/^application\/pdf\b/i.test(req.headers['content-type'] || '')) { req.resume(); return json(res, 415, { error: 'only PDF files', code: 'type' }); }
      const buf = await readRaw(req, MAX_PDF);
      if (!buf) return json(res, 413, { error: 'the file is larger than 10 MB', code: 'too-large' });
      if (!isPdf(buf)) return json(res, 400, { error: 'that is not a PDF', code: 'type' });
      const hash = storeFile(dataDir, buf);
      // One copy on disk; a row per uploader, so each may use what they uploaded.
      sql.prepare('INSERT OR IGNORE INTO files (hash, owner_id, size, type, created_at) VALUES (?, ?, ?, ?, ?)').run(hash, trainer.id, buf.length, 'application/pdf', now());
      json(res, 200, { hash, size: buf.length });
    },

    // A trainer reads the files of their own documents. Clients read theirs in 2e.
    'GET /api/coaching/file': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const hash = String(query(req, 'hash') || '');
      if (!HASH.test(hash) || !mayUseFile(trainer, hash)) return json(res, 404, { error: 'no such file' });
      const p = filePath(dataDir, hash);
      if (!fs.existsSync(p)) return json(res, 404, { error: 'no such file' });
      res.writeHead(200, {
        'Content-Type': 'application/pdf', 'Content-Length': fs.statSync(p).size,
        'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(p).pipe(res);
    },
  };
}
