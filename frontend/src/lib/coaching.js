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
export const publishDocument = (id, askCurrent, required) => post('/api/coaching/document/publish', { id, askCurrent: !!askCurrent, required: !!required })
export const setPacket = ids => post('/api/coaching/documents/packet', { ids }).then(r => r.documents || [])
export const deleteDocument = id => post('/api/coaching/document/delete', { id })
export const documentRecipients = id => api('/api/coaching/document/recipients?id=' + encodeURIComponent(id))
export const sendDocument = (id, clients, due, required) => post('/api/coaching/document/send', { id, clients, due: due ?? null, ...(typeof required === 'boolean' ? { required } : {}) })
export const setRequired = (id, required) => post('/api/coaching/document/required', { id, required }).then(r => r.document)
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
export const acceptInvite = (code, dob) => post('/api/coaching/invites/accept', { code, dob, tz: localTz() })
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

/* ---------- the client's paperwork (Phase 2e) ---------- */
export const MIN_AGE = 13
export const ADULT = 18
export const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null } }
const device = () => String(globalThis.navigator?.userAgent || '').slice(0, 200)
const appVersion = () => typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''   // eslint-disable-line no-undef

export const myDocuments = () => api('/api/coaching/my/documents')
export const saveAbout = dob => post('/api/coaching/my/about', { dob, tz: localTz() })
/** Complete one request: { answers } for a form, { agreed, name, signature } to sign, { files } to return. */
export const submitRequest = (request, fields) => post('/api/coaching/my/submit', { request, tz: localTz(), device: device(), appVersion: appVersion(), ...fields })
export const saveGuardian = ({ name, email, relationship, send }) => post('/api/coaching/my/guardian', { name, email, relationship, send: !!send })
// The raw file, not JSON: a filled-in PDF or one JPEG photo of a page.
export const uploadMine = (blob, type) => api('/api/coaching/my/files', { method: 'POST', body: blob, headers: { 'Content-Type': type }, timeout: 120000 })
export const myFileUrl = hash => './api/coaching/my/file?hash=' + encodeURIComponent(hash)
export const recordUrl = requestId => './api/coaching/my/record?id=' + encodeURIComponent(requestId)
export const guardianPage = token => api('/api/coaching/guardian?token=' + encodeURIComponent(token))
export const guardianFileUrl = (token, hash) => './api/coaching/guardian/file?token=' + encodeURIComponent(token) + '&hash=' + encodeURIComponent(hash)
export const guardianSign = (token, request, fields) => post('/api/coaching/guardian/sign', { token, request, tz: localTz(), device: device(), ...fields })

/** "YYYY-MM-DD" from what was typed, or null when it is not a real day in the past. */
export function dobFrom(day, month, year, now = Date.now()) {
  const d = Number(day), m = Number(month), y = Number(year)
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 1900) return null
  const t = Date.UTC(y, m - 1, d), back = new Date(t)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d || t > now) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
/** Whole years from a "YYYY-MM-DD" date of birth to today (the same rule as the server). */
export function ageFrom(dob, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''))
  if (!m) return null
  const at = new Date(now)
  let age = at.getUTCFullYear() - +m[1]
  if (at.getUTCMonth() + 1 < +m[2] || (at.getUTCMonth() + 1 === +m[2] && at.getUTCDate() < +m[3])) age--
  return age
}

// The join page asks the date of birth before the account is made; it rides along to the accept
// that follows sign-up, for the length of this tab only.
const JOIN_DOB = 'hr_join_dob'
export function rememberJoinDob(dob) { try { sessionStorage.setItem(JOIN_DOB, dob) } catch { /* private mode: asked again */ } }
export function takeJoinDob() {
  try { const v = sessionStorage.getItem(JOIN_DOB); sessionStorage.removeItem(JOIN_DOB); return v || null } catch { return null }
}

/** The guardian token in a /guardian/<token> path, or null. */
export function guardianToken(pathname) {
  const m = /^\/guardian\/([A-Za-z0-9_-]{30,100})\/?$/.exec(String(pathname || ''))
  return m ? m[1] : null
}

/** What the trainer's roster says about a client's paperwork, or null when nothing is open. */
export function paperworkLine(c) {
  if (c.paperwork === 'about') return ct('Sign-up not finished')
  if (c.paperwork === 'guardian') return ct('Waiting on guardian')
  if (c.todo > 0) return c.todo === 1 ? ct('1 to sign') : ct('{0} to sign', c.todo)
  return null
}

/** Why a submission was refused, in words. */
export function submitError(e) {
  const n = e?.data?.index != null ? e.data.index + 1 : null
  switch (e?.data?.code) {
    case 'agree': return ct('Tick the box to say you have read it and agree.')
    case 'name': return ct('Type your full name.')
    case 'signature': return n ? ct('Question {0} needs a signature.', n) : ct('Sign with your finger in the box.')
    case 'required': return ct('Question {0} needs an answer.', n)
    case 'follow-up': return ct('Question {0}: please add the details.', n)
    case 'number': return ct('Question {0} needs a number.', n)
    case 'date': case 'choice': return ct('Check your answer to question {0}.', n)
    case 'files': return ct('Add the filled-in PDF or a photo of each page.')
    case 'too-large': return ct('That file is larger than {0} MB.', MAX_PDF_MB)
    case 'type': return ct('That file could not be read. Use a PDF or a photo.')
    case 'too-young': return ct('You need to be {0} or older.', MIN_AGE)
    case 'dob': return ct('Check the date of birth.')
    case 'email': return ct('That email address does not look right')
    case 'too-soon': return ct('The link was emailed a moment ago. Give it a little time.')
    case 'no-guardian': return ct('Add your parent or guardian first.')
    default: return coachingError(e)
  }
}

/** Filter the roster: 'all', 'paused' or 'invited' (invites are listed apart). */
export function rosterFilter(clients, filter, q = '') {
  const s = q.trim().toLowerCase()
  return clients
    .filter(c => filter !== 'paused' || c.status === 'paused')
    .filter(c => !s || String(c.name || '').toLowerCase().includes(s))
}

/* ---------- the client profile, trainer side (Phase 2f) ---------- */
const enc = encodeURIComponent
export const clientProfile = id => api('/api/coaching/client/profile?id=' + enc(id))
export const clientRecord = (id, record) => api(`/api/coaching/client/record?id=${enc(id)}&record=${enc(record)}`).then(r => r.record)
export const clientRecordUrl = (id, record) => `./api/coaching/client/record/pdf?id=${enc(id)}&record=${enc(record)}`
export const clientExportUrl = (id, notes) => './api/coaching/client/export?id=' + enc(id) + (notes ? '&notes=1' : '')
export const addTag = (id, fields) => post('/api/coaching/client/tags', { id, ...fields }).then(r => r.tags)
export const updateTag = (id, tag, fields) => post('/api/coaching/client/tag', { id, tag, ...fields }).then(r => r.tags)
export const deleteTag = (id, tag) => post('/api/coaching/client/tag/delete', { id, tag }).then(r => r.tags)
export const addNote = (id, text) => post('/api/coaching/client/notes', { id, text }).then(r => r.notes)
export const editNote = (id, note, text) => post('/api/coaching/client/note', { id, note, text }).then(r => r.notes)
export const deleteNote = (id, note) => post('/api/coaching/client/note/delete', { id, note }).then(r => r.notes)
export const resendGuardianLink = id => post('/api/coaching/client/guardian/link', { id })

const longDay = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const dobDay = dob => new Date(dob + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "34 · born 1 May 1990", or null before the client gave their date of birth. */
export const ageLine = c => c.dob ? ct('{0} · born {1}', c.age, dobDay(c.dob)) : null

/** The profile's paperwork pill: what it says and whether it is good news. */
export function paperworkPill(c) {
  if (c.cleared) return { label: ct('Cleared to train'), ok: true }
  return { label: paperworkLine(c) || ct('Not cleared yet'), ok: false }
}

/** First letters of the first and last name, for the avatar. */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] || '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase()
}

/** How long the records are kept, in one sentence. */
export function retentionLine(r) {
  if (r.keepUntil) return ct('Records may be deleted after {0}. Nothing is deleted automatically.', longDay(r.keepUntil))
  return r.notBefore
    // notBefore comes from the date of birth (midnight UTC), so it is shown as that day in UTC.
    ? ct('Records are kept {0} years after coaching ends, and at least until {1} (5 years after they turn 18).', r.years, new Date(r.notBefore).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
    : ct('Records are kept {0} years after coaching ends.', r.years)
}

/** A record's line on the profile. */
export function recordLine(r) {
  if (r.waitingGuardian) return ct('Version {0} · waiting on guardian', r.version)
  if (r.kind === 'form') {
    const yes = r.yesCount === 1 ? ct('1 yes') : ct('{0} yes', r.yesCount || 0)
    return ct('Version {0} · {1}', r.version, longDay(r.done)) + ' · ' + yes + (r.flagged ? ' · ' + ct('{0} flagged', r.flagged) : '')
  }
  const g = r.signers.find(s => s.signer === 'guardian')
  const base = r.kind === 'sign' ? ct('Version {0} · signed {1}', r.version, longDay(r.done)) : ct('Version {0} · returned {1}', r.version, longDay(r.done))
  return g ? base + ' · ' + ct('with {0}', g.name) : base
}

/** "Written 3 Nov 2026 · edited 5 Nov 2026". */
export const noteLine = n => ct('Written {0}', longDay(n.created)) + (n.edited ? ' · ' + ct('edited {0}', longDay(n.edited)) : '')

/** What went wrong on the profile, in words. */
export function profileError(e) {
  switch (e?.data?.code) {
    case 'taken': return ct('That tag is already there.')
    case 'text': return ct('Type something first.')
    case 'too-many': return ct('A client can have at most 30 tags.')
    case 'too-soon': return ct('The link was emailed a moment ago. Give it a little time.')
    case 'nothing': return ct('There is nothing left for the guardian to sign.')
    case 'no-email': return ct('There is no email address for the guardian. They can sign on the client’s phone.')
    default: return coachingError(e)
  }
}

/* ---------- settings: branding, new client defaults, the trainer card (Phase 2g) ---------- */
export const getBranding = () => api('/api/coaching/branding')
export const saveBranding = fields => post('/api/coaching/branding', fields)
// The raw image, not JSON: the server checks the bytes and caps it at 2 MB.
export const uploadLogo = file => api('/api/coaching/branding/logo', { method: 'POST', body: file, headers: { 'Content-Type': file.type }, timeout: 60000 })
export const logoUrl = hash => hash ? './api/coaching/logo?h=' + encodeURIComponent(hash) : null
export const setDefaultPreset = preset => post('/api/coaching/default-preset', { preset }).then(r => r.preset)
export const setShowPhone = (id, show) => post('/api/coaching/client/phone', { id, show })
export const myTrainer = () => api('/api/coaching/my/trainer').then(r => r.trainer)
export const MAX_LOGO_MB = 2
export const LOGO_TYPES = ['image/png', 'image/jpeg']
export const COACH_BLUE = '#2457E6'
// The fork's own code, which the AGPL asks us to offer everyone who uses the app.
export const SOURCE_URL = 'https://github.com/zankster/higher-rep'

export const PRESETS = [
  { id: 'hands_on', label: () => ct('Hands-on'), text: () => ct('They see the next workout. You make the changes.') },
  { id: 'balanced', label: () => ct('Balanced'), text: () => ct('They see this week and can swap to your alternates.') },
  { id: 'independent', label: () => ct('Independent'), text: () => ct('They see the whole block, can move days and add sessions.') },
]
export const presetLabel = id => (PRESETS.find(p => p.id === id) || PRESETS[1]).label()

export const phoneShownLine = ({ shown, of }) => !of ? ct('No clients yet')
  : of === 1 ? (shown ? ct('Shown to your client') : ct('Hidden from your client'))
  : shown === of ? ct('Shown to all {0} clients', of) : ct('Shown to {0} of {1} clients', shown, of)
export const contrastLine = ratio => ct('White text reads clearly on it ({0} : 1)', Number(ratio).toFixed(1))
// "tel:" keeps the digits and a leading +; "smithstrength.com" for https://smithstrength.com/.
export const telHref = phone => 'tel:' + String(phone).replace(/(?!^\+)[^\d]/g, '')
export const websiteLabel = url => String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '')
/** The line under the trainer's name on the client's trainer card. */
export const trainerCardLine = tr => tr.business
  ? ct('{0} · since {1}', tr.business, new Date(tr.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }))
  : sinceLine(tr.since)

export function brandingError(e) {
  switch (e?.data?.code) {
    case 'email': return ct('That email address does not look right')
    case 'phone': return ct('That phone number does not look right')
    case 'website': return ct('That website address does not look right')
    case 'size': return ct('The logo is larger than {0} MB.', MAX_LOGO_MB)
    case 'type': return ct('Use a PNG or JPEG image.')
    case 'dims': return ct('Use an image between 32 and 4096 pixels on a side.')
    default: return coachingError(e)
  }
}
