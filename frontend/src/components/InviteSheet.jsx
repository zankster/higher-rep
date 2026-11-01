// trainer-fork: "Invite a client" (Phase 2b). First name, email and an optional note make a
// one-time link that lasts 14 days. Until the invite email exists (Phase 2c) the trainer sends
// the link themself, so the result step leads with Copy link and Share.
import { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { Button, TextField, TextArea } from './ui.jsx'
import Icon from './Icon.jsx'
import { copyText } from '../lib/clipboard.js'
import { ct, newInvite, coachingError, coachingChanged } from '../lib/coaching.js'

export async function shareInvite(inv) {
  const text = ct('{0}, here is your link to join me on Higher Rep:', inv.firstName)
  if (navigator.share) {
    try { await navigator.share({ title: 'Higher Rep', text, url: inv.url }); return } catch (e) { if (e?.name === 'AbortError') return }
  }
  const ok = await copyText(inv.url)
  useUI.getState().toast(ok ? ct('Link copied') : ct('Could not copy the link'))
}

export async function copyInvite(inv) {
  const ok = await copyText(inv.url)
  useUI.getState().toast(ok ? ct('Link copied') : ct('Could not copy the link'))
}

export function InviteSheet({ close, onCreated }) {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [made, setMade] = useState(null)

  const send = async () => {
    if (!firstName.trim()) { setErr(ct('Enter a first name')); return }
    setBusy(true); setErr('')
    try { const inv = await newInvite({ firstName, email, note }); setMade(inv); coachingChanged(); onCreated?.(inv) }
    catch (e) { setErr(coachingError(e)) }
    finally { setBusy(false) }
  }

  if (made) return <>
    <h3 style={{ marginBottom: 6 }}>{ct('Invite ready for {0}', made.firstName)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{ct('The link works once and expires in 14 days. Send it to {0} by text, email or WhatsApp.', made.firstName)}</div>
    <div className="card small" style={{ wordBreak: 'break-all', marginBottom: 12 }} data-testid="invite-url">{made.url}</div>
    <Button variant="primary" icon="share" onClick={() => shareInvite(made)}>{ct('Share link')}</Button>
    <div style={{ height: 8 }} />
    <Button icon="copy" onClick={() => copyInvite(made)}>{ct('Copy link')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{ct('Done')}</Button>
  </>

  return <>
    <h3 style={{ marginBottom: 12 }}>{ct('Invite a client')}</h3>
    <TextField placeholder={ct('First name')} aria-label={ct('First name')} maxLength={40} value={firstName}
      onChange={e => { setFirstName(e.target.value); setErr('') }} autoComplete="off" />
    <div style={{ height: 8 }} />
    <TextField type="email" placeholder={ct('Email (optional)')} aria-label={ct('Email')} maxLength={254} value={email}
      onChange={e => { setEmail(e.target.value); setErr('') }} autoComplete="off" inputMode="email" />
    <div style={{ height: 8 }} />
    <TextArea placeholder={ct('Note (optional)')} aria-label={ct('Note')} maxLength={200} rows={2} value={note} onChange={e => setNote(e.target.value)} />
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}><Icon name="warning" /> {err}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={send} disabled={busy}>{ct('Create invite')}</Button>
  </>
}

export const openInviteSheet = onCreated => useUI.getState().openSheet(close => <InviteSheet close={close} onCreated={onCreated} />)
