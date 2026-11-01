// trainer-fork: the invite page, #/join/<code> (Phase 2b). Signed out, it names the trainer and
// offers openGym's own sign-up (the code rides along, for an invite-only instance) or sign-in.
// Signed in, it takes the invite: at once when this tab just signed up from here, otherwise with
// a tap, because linking an existing account to a trainer is the client's consent to give.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import Login, { RegisterSheet } from './Login.jsx'
import { ct, invitePage, acceptInvite, coachingError, markAutoAccept, takeAutoAccept } from '../lib/coaching.js'

function InviteCard({ invite }) {
  const name = invite.trainer.name
  return <div style={{ textAlign: 'center', margin: '28px 0 18px' }}>
    <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="figureStrength" /></div>
    <h1 style={{ fontSize: 26, margin: '10px 0 4px' }}>{ct('{0} invited you to train with them', name)}</h1>
    <div className="muted">{ct('Higher Rep · Fitness coaching')}</div>
    {invite.note && <div className="card" style={{ marginTop: 16, fontStyle: 'italic', textAlign: 'start' }}>“{invite.note}”</div>}
  </div>
}

function Lapsed({ invite }) {
  const name = invite?.trainer?.name
  const text = !invite ? ct('This invite link is not valid. Check the link, or ask your trainer for a new one.')
    : invite.status === 'expired' ? ct('This invite has expired. Ask {0} for a new one.', name)
    : ct('This invite is no longer valid. Ask {0} for a new one.', name)
  return <div className="card" role="alert" style={{ marginTop: 40, textAlign: 'center' }}>{text}</div>
}

export default function JoinInvite({ code, signedIn }) {
  const nav = useNavigate()
  const [invite, setInvite] = useState(undefined)   // undefined: loading, null: no such invite
  const [signIn, setSignIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let gone = false
    invitePage(code).then(i => { if (!gone) setInvite(i) }, e => { if (!gone) setInvite(e?.status === 404 ? null : { error: coachingError(e) }) })
    return () => { gone = true }
  }, [code])

  const join = async () => {
    setBusy(true); setErr('')
    try {
      const r = await acceptInvite(code)
      useUI.getState().toast(ct('You’re now training with {0}', r.trainer.name))
      nav('/home', { replace: true })
    } catch (e) { setErr(coachingError(e, invite?.trainer?.name)); setBusy(false) }
  }
  // Just signed up from this page: take the invite without asking again.
  useEffect(() => {
    if (signedIn && invite?.status === 'valid' && takeAutoAccept(code)) join()
  }, [signedIn, invite])   // eslint-disable-line react-hooks/exhaustive-deps

  if (invite === undefined) return <div className="narrow" />
  if (invite?.error) return <div className="narrow"><div className="card" role="alert" style={{ marginTop: 40 }}>{invite.error}</div></div>
  if (!invite || invite.status !== 'valid') return <div className="narrow"><Lapsed invite={invite} />
    {signedIn && <><div style={{ height: 12 }} /><Button onClick={() => nav('/home', { replace: true })}>{ct('Go to Home')}</Button></>}
  </div>

  if (!signedIn && signIn) return <>
    <div className="narrow"><InviteCard invite={invite} /></div>
    <Login />
  </>

  const register = () => {
    markAutoAccept(code)
    useUI.getState().openSheet(close => <RegisterSheet close={close} initialCode={code} />)
  }
  return <div className="narrow">
    <InviteCard invite={invite} />
    {signedIn ? <>
      <Button variant="primary" onClick={join} disabled={busy}>{ct('Join {0}', invite.trainer.name)}</Button>
      <div className="muted small" style={{ marginTop: 10, textAlign: 'center' }}>{ct('{0} will see your workouts, progress and messages. You can end coaching at any time in Settings.', invite.trainer.name)}</div>
    </> : <>
      <Button variant="primary" onClick={register}>{ct('Create account')}</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" onClick={() => setSignIn(true)}>{ct('I already have an account')}</Button>
    </>}
    {err && <div className="card small" role="alert" style={{ marginTop: 12 }}>{err}</div>}
  </div>
}
