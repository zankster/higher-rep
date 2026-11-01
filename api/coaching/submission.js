/* The client's side of a document, as pure rules (trainer-fork, Phase 2e): the date of birth and
 * age, what a form's answers may hold, a signature image, the hash of what was signed, and
 * whether a client is cleared to train. The packet routes and the tests share them.
 */
import crypto from 'node:crypto';

export const MIN_AGE = 13;
export const ADULT = 18;
export const LIMITS = { name: 120, answer: 5000, signature: 400 * 1024, photos: 30, relationship: 40 };

const DOB = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real date of birth as YYYY-MM-DD, not in the future and not before 1900, or null. */
export function parseDob(s, now = Date.now()) {
  const m = DOB.exec(String(s || ''));
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  if (y < 1900 || t > now) return null;
  return m[0];
}

/** Whole years from `dob` (YYYY-MM-DD) to the day of `at` (UTC). */
export function ageOn(dob, at = Date.now()) {
  const m = DOB.exec(String(dob || ''));
  if (!m) return null;
  const now = new Date(at);
  let age = now.getUTCFullYear() - +m[1];
  const before = now.getUTCMonth() + 1 < +m[2] || (now.getUTCMonth() + 1 === +m[2] && now.getUTCDate() < +m[3]);
  if (before) age--;
  return age;
}

/** An IANA time zone the server knows, or null. */
export function cleanTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch { return null; }
}

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export const cleanName = v => str(v, LIMITS.name).replace(/\s+/g, ' ');

/** The bytes of a "data:image/jpeg;base64,..." signature, or null when it is not one. */
export function signatureJpeg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf.length > LIMITS.signature || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return buf;
}

/** What the client signed, as one hash: the PDF's own hash, or the SHA-256 of the exact text or
 *  form that was shown. */
export function contentHash(kind, body) {
  if (body?.file?.hash) return body.file.hash;
  const what = kind === 'sign' ? String(body?.text ?? '') : JSON.stringify(body ?? {});
  return crypto.createHash('sha256').update(what, 'utf8').digest('hex');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A form's answers, checked against its questions. Resolves { answers, flagged, signatures } with
 * one entry per answered question (keyed by question id), or { code, index } for the first
 * problem. A signature question's answer is a JPEG data URL here; `signatures` lists them by
 * question id so the caller can store the images and keep their hashes as the answer.
 */
export function checkAnswers(questions, given) {
  const a = given && typeof given === 'object' ? given : {};
  const answers = {}, signatures = {};
  let flagged = 0;
  for (const [index, q] of questions.entries()) {
    const v = a[q.id];
    const missing = () => q.required !== false ? { code: 'required', index } : null;
    if (q.type === 'yes_no') {
      const yes = v?.yes === true ? true : v?.yes === false ? false : null;
      if (yes === null) { const p = missing(); if (p) return p; continue; }
      const out = { yes };
      if (yes && q.followUp) {
        const f = str(v.followUp, LIMITS.answer);
        if (!f) return { code: 'follow-up', index };
        out.followUp = f;
      }
      if (yes && q.flagYes) flagged++;
      answers[q.id] = out;
    } else if (q.type === 'short_text' || q.type === 'long_text') {
      const s = str(v, q.type === 'short_text' ? 300 : LIMITS.answer);
      if (!s) { const p = missing(); if (p) return p; continue; }
      answers[q.id] = s;
    } else if (q.type === 'number') {
      if (v === '' || v == null) { const p = missing(); if (p) return p; continue; }
      const n = Number(v);
      if (!Number.isFinite(n)) return { code: 'number', index };
      answers[q.id] = n;
    } else if (q.type === 'date') {
      if (!v) { const p = missing(); if (p) return p; continue; }
      if (!DATE.test(String(v))) return { code: 'date', index };
      answers[q.id] = String(v);
    } else if (q.type === 'choice') {
      const opts = q.options || [];
      const picked = (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String);
      if (!picked.length) { const p = missing(); if (p) return p; continue; }
      if (picked.some(o => !opts.includes(o)) || (!q.multi && picked.length > 1)) return { code: 'choice', index };
      answers[q.id] = q.multi ? [...new Set(picked)] : picked[0];
    } else if (q.type === 'signature') {
      if (!v) { const p = missing(); if (p) return p; continue; }
      const buf = signatureJpeg(v);
      if (!buf) return { code: 'signature', index };
      signatures[q.id] = buf;
    }
  }
  return { answers, flagged, signatures };
}

/**
 * Where a client stands with their trainer's paperwork, from their open requests and whether
 * they gave their date of birth. Cleared means nothing required is left: every required request
 * is done, the guardian's signature included.
 *   state: 'about' (no date of birth yet), 'todo' (a required document to do), 'guardian'
 *   (only the guardian's signature is left), 'cleared'
 */
export function clearance({ about, open }) {
  const toDo = open.filter(r => !r.client_done_at);
  const required = open.filter(r => r.required);
  const state = !about ? 'about'
    : required.some(r => !r.client_done_at) ? 'todo'
    : required.length ? 'guardian'
    : 'cleared';
  return {
    cleared: state === 'cleared', state,
    todo: toDo.length,
    requiredLeft: required.filter(r => !r.client_done_at).length,
    guardian: open.filter(r => r.client_done_at && r.guardian_needed).length,
  };
}
