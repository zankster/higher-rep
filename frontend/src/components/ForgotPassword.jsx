// trainer-fork: "Forgot your password?" (Phase 2c). Asks for the sign-in email and has the server
// email a one-hour link (POST /api/coaching/password/forgot). The answer is the same whether or
// not an account uses the address, so the screen never says which.
import { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import { looksLikeEmail } from './PasswordAuth.jsx'
import { ct, forgotPassword } from '../lib/coaching.js'

export function ForgotPasswordSheet({ close }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    if (!looksLikeEmail(email)) { setErr(ct('Enter the email on your account.')); return }
    setBusy(true); setErr('')
    try { await forgotPassword(email.trim()); setSent(true) }
    catch (e) { setErr(e?.status === 429 ? ct('Too many requests. Try again in a few minutes.') : e?.message || ct('Something went wrong. Try again.')) }
    finally { setBusy(false) }
  }
  if (sent) return <>
    <h3 style={{ marginBottom: 6 }}>{ct('Check your email')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{ct('If an account uses {0}, a link to choose a new password is on its way. It works for 1 hour.', email.trim())}</div>
    <div className="muted small" style={{ marginBottom: 14 }}>{ct('Nothing after a few minutes? Check your spam folder, or ask your trainer.')}</div>
    <Button variant="primary" onClick={close}>{ct('Done')}</Button>
  </>
  return <>
    <h3 style={{ marginBottom: 6 }}>{ct('Forgot your password?')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{ct('Enter the email on your account and we will send you a link to choose a new one.')}</div>
    <form onSubmit={submit} noValidate>
      <input className="input" type="email" name="email" autoComplete="email" inputMode="email" placeholder={ct('Email')} aria-label={ct('Email')}
        maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setErr('') }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{ct('Send link')}</Button>
    </form>
  </>
}

export const openForgotPassword = () => useUI.getState().openSheet(close => <ForgotPasswordSheet close={close} />)

/** The link under "Sign in with password" (PasswordAuth.jsx), one marked line there. */
export function ForgotLink({ close }) {
  return <>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" onClick={() => { close(); openForgotPassword() }}>{ct('Forgot your password?')}</Button>
  </>
}
