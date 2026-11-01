// trainer-fork: the page the forgot-password email opens (#/reset/<code>, Phase 2c). The code in
// the link is openGym's own reset code; with the account's email and a new password, openGym's
// POST /api/login/password-reset sets it and signs in. The email is asked for here rather than
// carried in the link, so the link names nobody.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui.jsx'
import { MIN_PASSWORD, looksLikeEmail, passwordError, signedIn } from '../components/PasswordAuth.jsx'
import { openForgotPassword } from '../components/ForgotPassword.jsx'
import { passwordResetRedeem } from '../lib/api.js'
import { ct } from '../lib/coaching.js'

const length = s => [...String(s || '')].length

export default function ResetPassword({ code }) {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dead, setDead] = useState(false)

  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const bad = !looksLikeEmail(email) ? ct('Enter the email on your account.')
      : length(next) < MIN_PASSWORD ? ct('Use at least {0} characters.', MIN_PASSWORD)
      : next !== again ? ct('The two passwords are not the same.')
      : ''
    if (bad) { setErr(bad); return }
    setBusy(true); setErr('')
    try {
      await signedIn(await passwordResetRedeem(email.trim(), code, next), () => {})
      nav('/', { replace: true })
    } catch (e) {
      // Wrong email and a used or old link look the same to the server, on purpose.
      if (e?.data?.code === 'reset-invalid') { setDead(true); setErr(ct('This link has expired or was already used, or the email does not match the account.')) }
      else setErr(passwordError(e))
    } finally { setBusy(false) }
  }

  return <div className="narrow" style={{ paddingTop: 40 }}>
    <h1 style={{ marginBottom: 6 }}>{ct('Choose a new password')}</h1>
    <div className="muted small" style={{ marginBottom: 16 }}>{ct('Enter the email on your account and a new password. It signs you out on your other devices.')}</div>
    <form onSubmit={submit} noValidate>
      <input className="input" type="email" name="username" autoComplete="username" inputMode="email" placeholder={ct('Email')} aria-label={ct('Email')}
        maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setErr('') }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <div style={{ height: 10 }} />
      <input className="input" type="password" name="new-password" autoComplete="new-password" placeholder={ct('New password')} aria-label={ct('New password')}
        value={next} onChange={e => { setNext(e.target.value); setErr('') }} />
      <div style={{ height: 10 }} />
      <input className="input" type="password" name="new-password-again" autoComplete="new-password" placeholder={ct('Repeat the password')} aria-label={ct('Repeat the password')}
        value={again} onChange={e => { setAgain(e.target.value); setErr('') }} />
      <div className="dim small" style={{ marginTop: 6 }}>{ct('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}</div>
      {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{ct('Set password and sign in')}</Button>
    </form>
    <div style={{ height: 8 }} />
    {dead && <><Button onClick={openForgotPassword}>{ct('Send a new link')}</Button><div style={{ height: 8 }} /></>}
    <Button variant="ghost" className="dim" onClick={() => nav('/', { replace: true })}>{ct('Back to sign in')}</Button>
  </div>
}
