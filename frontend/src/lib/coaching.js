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
export const newInvite = ({ firstName, email, note }) => post('/api/coaching/invites/new', { firstName, email, note }).then(r => r.invite)
export const revokeInvite = id => post('/api/coaching/invites/revoke', { id })
export const renewInvite = id => post('/api/coaching/invites/renew', { id }).then(r => r.invite)
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
