// trainer-fork: the coaching calls (api/coaching/routes.js) and the small pure rules the coaching
// screens share. The only file on this side that knows the coaching routes.
import { api } from './api.js'
import { t } from './i18n.js'
import { fmtAgo } from './format.js'

// Coaching copy is English while we decide which languages Higher Rep ships in. ct() is t(), so a
// pack that does translate a string is used, but these strings stay out of openGym's locale
// checks (check-source-strings.mjs collects literal calls to t only) and out of its 19 packs, which keeps
// upstream merges clean. Swap ct for t once the packs carry them.
export const ct = (s, ...args) => t(s, ...args)

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })

export const coachingMe = () => api('/api/coaching/me')
export const listClients = () => api('/api/coaching/clients').then(r => r.clients || [])
export const listInvites = () => api('/api/coaching/invites').then(r => r.invites || [])
// `emailed` rides on the invite: true sent, false the email failed, null no address.
const withEmailed = r => ({ ...r.invite, emailed: r.emailed ?? null })
export const newInvite = ({ firstName, email, note }) => post('/api/coaching/invites/new', { firstName, email, note }).then(withEmailed)
export const revokeInvite = id => post('/api/coaching/invites/revoke', { id })
export const renewInvite = id => post('/api/coaching/invites/renew', { id }).then(withEmailed)
export const emailInvite = id => post('/api/coaching/invites/email', { id })
export const forgotPassword = email => post('/api/coaching/password/forgot', { email })

/* ---------- the document library (Phase 2d) ---------- */
export const listDocuments = () => api('/api/coaching/documents').then(r => r.documents || [])
export const getDocument = id => api('/api/coaching/document?id=' + encodeURIComponent(id)).then(r => r.document)
export const newDocument = ({ title, kind, rights }) => post('/api/coaching/documents/new', { title, kind, rights }).then(r => r.document)
export const saveDraft = (id, { title, body }) => post('/api/coaching/document/draft', { id, title, body }).then(r => r.draft)
export const discardDraft = id => post('/api/coaching/document/discard', { id }).then(r => r.document)
export const publishDocument = (id, askCurrent) => post('/api/coaching/document/publish', { id, askCurrent: !!askCurrent })
export const setPacket = ids => post('/api/coaching/documents/packet', { ids }).then(r => r.documents || [])
export const deleteDocument = id => post('/api/coaching/document/delete', { id })
export const documentRecipients = id => api('/api/coaching/document/recipients?id=' + encodeURIComponent(id))
export const sendDocument = (id, clients, due) => post('/api/coaching/document/send', { id, clients, due: due ?? null })
// The raw PDF, not JSON: the server checks the bytes start like a PDF and caps it at 10 MB.
export const uploadPdf = file => api('/api/coaching/files', { method: 'POST', body: file, headers: { 'Content-Type': 'application/pdf' }, timeout: 120000 })
export const fileUrl = hash => './api/coaching/file?hash=' + encodeURIComponent(hash)
export const MAX_PDF_MB = 10

export const KIND_LABEL = { sign: () => ct('Document to sign'), form: () => ct('Form to answer'), pdf_return: () => ct('PDF to fill and return') }
export const KIND_SHORT = { sign: () => ct('To sign'), form: () => ct('Form'), pdf_return: () => ct('PDF to fill and return') }
export const KIND_ICON = { sign: 'pencil', form: 'list', pdf_return: 'download' }
export const QUESTION_TYPES = [
  ['yes_no', () => ct('Yes / no')], ['short_text', () => ct('Short text')], ['long_text', () => ct('Long text')],
  ['choice', () => ct('Choice')], ['date', () => ct('Date')], ['number', () => ct('Number')], ['signature', () => ct('Signature')],
]
export const questionTypeLabel = type => (QUESTION_TYPES.find(([k]) => k === type)?.[1] || (() => type))()

let seq = 0
/** A new question for the form builder. Ids only need to be unique within the form. */
export function newQuestion(type = 'yes_no') {
  const id = 'q' + Date.now().toString(36) + (seq++).toString(36)
  const q = { id, type, text: '', required: true }
  if (type === 'choice') Object.assign(q, { options: ['', ''], multi: false })
  if (type === 'yes_no') Object.assign(q, { flagYes: false, followUp: null })
  return q
}
/** The same question as another type, keeping its wording. */
export function retypeQuestion(q, type) {
  const next = { id: q.id, type, text: q.text, required: q.required !== false }
  if (type === 'choice') Object.assign(next, { options: q.options?.length ? q.options : ['', ''], multi: !!q.multi })
  if (type === 'yes_no') Object.assign(next, { flagYes: !!q.flagYes, followUp: q.followUp || null })
  return next
}

/** "Draft", "Version 2", or "Version 2 · draft of 3" for a library row. */
export function versionLine(d) {
  if (d.version == null) return ct('Draft')
  return d.hasDraft ? ct('Version {0} · draft of {1}', d.version, d.version + 1) : ct('Version {0}', d.version)
}

/** Why a draft cannot be published yet, in words. */
export function publishError(e) {
  const n = e?.data?.index != null ? e.data.index + 1 : null
  switch (e?.data?.code) {
    case 'no-questions': return ct('Add at least one question.')
    case 'question-text': return ct('Question {0} has no wording yet.', n)
    case 'choice-options': return ct('Question {0} needs at least two choices.', n)
    case 'follow-up-text': return ct('The follow-up of question {0} has no wording yet.', n)
    case 'empty': return ct('Add the text or a PDF first.')
    case 'no-file': return ct('Upload the PDF first.')
    case 'too-large': return ct('That file is larger than {0} MB.', MAX_PDF_MB)
    case 'type': return ct('Only PDF files can be uploaded.')
    default: return coachingError(e)
  }
}
export const invitePage = code => api('/api/coaching/invite?code=' + encodeURIComponent(code))
export const acceptInvite = code => post('/api/coaching/invites/accept', { code })
export const pauseClient = (id, paused) => post('/api/coaching/client/pause', { id, paused }).then(r => r.client)
export const removeClient = id => post('/api/coaching/client/remove', { id })
export const endCoaching = () => post('/api/coaching/end')

// A change made from a sheet (a new invite, a paused client) tells the open screens to reload.
// Not a callback into the screen: App's lazyView swaps its Suspense wrapper for the loaded view on
// the next render, which remounts the screen, so a callback captured when the sheet opened can
// point at a screen that is gone.
const CHANGED = 'hr-coaching-changed'
export const coachingChanged = () => window.dispatchEvent(new Event(CHANGED))
export function onCoachingChanged(fn) {
  window.addEventListener(CHANGED, fn)
  return () => window.removeEventListener(CHANGED, fn)
}

/** The invite code in a /join/<code> path, or null. */
export function joinCode(pathname) {
  const m = /^\/join\/([0-9A-Za-z]{4,40})\/?$/.exec(String(pathname || ''))
  return m ? m[1].toUpperCase() : null
}

/** The reset code in a /reset/<code> path (the forgot-password email's link), or null. */
export function resetLinkCode(pathname) {
  const m = /^\/reset\/([0-9A-Za-z-]{8,40})\/?$/.exec(String(pathname || ''))
  return m ? m[1].toUpperCase() : null
}

// The join page signs someone up and then takes the invite for them, without a second tap: the
// code they came with is noted for the length of this tab, and only that code is taken.
const AUTO = 'hr_join_auto'
export function markAutoAccept(code) { try { sessionStorage.setItem(AUTO, code) } catch { /* private mode: they tap Join */ } }
export function takeAutoAccept(code) {
  try {
    const want = sessionStorage.getItem(AUTO)
    if (want) sessionStorage.removeItem(AUTO)
    return !!want && want === code
  } catch { return false }
}

/** "Sent 2 days ago · Opened" for a live invite, "Expired Oct 20" for a lapsed one. */
export function inviteLine(inv, now = Date.now()) {
  if (inv.status === 'expired') return ct('Expired {0}', new Date(inv.expires).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  return ct('Sent {0}', fmtAgo(inv.created, now)) + ' · ' + (inv.opened ? ct('Opened') : ct('Not opened'))
}

/** "Since Mar 2026". */
export const sinceLine = ms => ct('Since {0}', new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }))

/** What an error answer from a coaching route means to the person who got it. */
export function coachingError(e, trainerName) {
  const who = trainerName || ct('your trainer')
  switch (e?.data?.code) {
    case 'expired': return ct('This invite has expired. Ask {0} for a new one.', who)
    case 'revoked': case 'used': return ct('This invite is no longer valid. Ask {0} for a new one.', who)
    case 'own': return ct('This is your own invite. Send the link to your client.')
    case 'linked': return ct('You already train with {0}.', who)
    case 'other': return ct('You already have a trainer. End that coaching in Settings first.')
    case 'missing': return ct('Enter a first name')
    case 'email': return ct('That email address does not look right')
    case 'no-email': return ct('This invite has no email address. Share the link instead.')
    case 'too-soon': return ct('The email was sent a few minutes ago. Give it a little time.')
    case 'not-sent': return ct('The email could not be sent. Share the link instead.')
    default: return e?.message || ct('Something went wrong. Try again.')
  }
}

/** Filter the roster: 'all', 'paused' or 'invited' (invites are listed apart). */
export function rosterFilter(clients, filter, q = '') {
  const s = q.trim().toLowerCase()
  return clients
    .filter(c => filter !== 'paused' || c.status === 'paused')
    .filter(c => !s || String(c.name || '').toLowerCase().includes(s))
}
