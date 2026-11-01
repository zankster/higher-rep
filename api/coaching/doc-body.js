/* What a document's body may hold, per kind (trainer-fork, Phase 2d). Pure, so the library
 * routes and the tests share it.
 *
 *   sign        { text } or { file: { hash, name } }: read it, then sign it
 *   form        { intro?, questions: [...] }: built in the app
 *   pdf_return  { file: { hash, name }, instructions? }: download, fill in, upload it back
 *
 * A question: { id, type, text, required, options? (choice), flagYes?, followUp? (yes_no) }.
 * Wording is kept exactly as typed: only trimmed of outer whitespace and capped in length.
 */

export const KINDS = ['sign', 'form', 'pdf_return'];
export const QUESTION_TYPES = ['yes_no', 'short_text', 'long_text', 'choice', 'date', 'number', 'signature'];
export const FOLLOW_UP_TYPES = ['short_text', 'long_text'];
export const LIMITS = { title: 120, text: 100000, intro: 5000, question: 1000, option: 200, options: 30, questions: 150, instructions: 2000, fileName: 120 };

const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,24}$/;

export const cleanTitle = t => str(t, LIMITS.title).replace(/\s+/g, ' ');

function cleanFile(f) {
  if (!f || typeof f !== 'object' || !HASH.test(f.hash || '')) return null;
  return { hash: f.hash, name: str(f.name, LIMITS.fileName).replace(/[\r\n/\\]/g, ' ') || 'document.pdf' };
}

function cleanQuestion(q, i, seen) {
  if (!q || typeof q !== 'object') return null;
  const type = QUESTION_TYPES.includes(q.type) ? q.type : 'short_text';
  let id = ID.test(q.id || '') ? q.id : 'q' + (i + 1);
  while (seen.has(id)) id = id.slice(0, 20) + '_' + seen.size;
  seen.add(id);
  const out = { id, type, text: str(q.text, LIMITS.question), required: q.required !== false };
  if (type === 'choice') {
    out.options = (Array.isArray(q.options) ? q.options : []).map(o => str(o, LIMITS.option)).slice(0, LIMITS.options);
    out.multi = q.multi === true;
  }
  if (type === 'yes_no') {
    out.flagYes = q.flagYes === true;
    const f = q.followUp;
    out.followUp = f && typeof f === 'object'
      ? { type: FOLLOW_UP_TYPES.includes(f.type) ? f.type : 'long_text', text: str(f.text, LIMITS.question) }
      : null;
  }
  return out;
}

/** The body as it may be stored for this kind: unknown fields dropped, lengths capped. A draft
 *  may be incomplete; publishProblem says whether it is ready. */
export function cleanBody(kind, body) {
  const b = body && typeof body === 'object' ? body : {};
  if (kind === 'sign') {
    const file = cleanFile(b.file);
    return file ? { file } : { text: typeof b.text === 'string' ? b.text.slice(0, LIMITS.text).replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '') : '' };
  }
  if (kind === 'form') {
    const seen = new Set();
    const questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, LIMITS.questions)
      .map((q, i) => cleanQuestion(q, i, seen)).filter(Boolean);
    return { intro: str(b.intro, LIMITS.intro), questions };
  }
  if (kind === 'pdf_return') return { file: cleanFile(b.file), instructions: str(b.instructions, LIMITS.instructions) };
  return {};
}

/** The files a body points at. */
export const fileHashes = body => [body?.file?.hash].filter(Boolean);

/** Null when a cleaned body can be published, else a code and, for a form, which question. */
export function publishProblem(kind, body) {
  if (kind === 'sign') return body.file || body.text ? null : { code: 'empty' };
  if (kind === 'pdf_return') return body.file ? null : { code: 'no-file' };
  if (kind === 'form') {
    if (!body.questions?.length) return { code: 'no-questions' };
    for (const [i, q] of body.questions.entries()) {
      if (!q.text) return { code: 'question-text', index: i };
      if (q.type === 'choice' && q.options.filter(Boolean).length < 2) return { code: 'choice-options', index: i };
      if (q.type === 'yes_no' && q.followUp && !q.followUp.text) return { code: 'follow-up-text', index: i };
    }
    return null;
  }
  return { code: 'kind' };
}

/** A new, empty draft body. */
export const emptyBody = kind => kind === 'form' ? { intro: '', questions: [] } : kind === 'pdf_return' ? { file: null, instructions: '' } : { text: '' };
