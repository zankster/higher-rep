// trainer-fork: the invite page, #/join/<code> (Phase 2b). Signed out, it names the trainer and
// offers openGym's own sign-up (the code rides along, for an invite-only instance) or sign-in.
// Signed in, it takes the invite: at once when this tab just signed up from here, otherwise with
// a tap, because linking an existing account to a trainer is the client's consent to give.
// Phase 2e: "When were you born?" comes first, before any account is made. Under 13 it stops
// there and nothing is kept. The date rides along to the accept, then the packet opens.
// Phase 2g: a trainer who set up Branding gets their logo, business name and colour here.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import Login, { RegisterSheet } from './Login.jsx'
import { AboutYou, TooYoung } from '../components/PacketSteps.jsx'
import { InviteHeader, InAccent, isBranded } from '../components/TrainerBrand.jsx'
import { ct, invitePage, acceptInvite, coachingError, submitError, markAutoAccept, takeAutoAccept, rememberJoinDob, takeJoinDob, MIN_AGE } from '../lib/coaching.js'

function InviteCard({ invite }) {
  const name = invite.trainer.name
  const title = invite.firstName ? ct('{0} invited you, {1}', name, invite.firstName) : ct('{0} invited you to train with them', name)
  return <div style={{ textAlign: 'center', margin: '28px 0 18px' }}>
    {isBranded(invite.trainer) ? <InviteHeader trainer={invite.trainer} title={title} /> : <>
      <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="figureStrength" /></div>
      <h1 style={{ fontSize: 26, margin: '10px 0 4px' }}>{ct('{0} invited you to train with them', name)}</h1>
      <div className="muted">{ct('Higher Rep · Fitness coaching')}</div>
    </>}
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
  const [dob, setDob] = useState(null)
  const [young, setYoung] = useState(false)

  useEffect(() => {
    let gone = false
    invitePage(code).then(i => { if (!gone) setInvite(i) }, e => { if (!gone) setInvite(e?.status === 404 ? null : { error: coachingError(e) }) })
    return () => { gone = true }
  }, [code])

  const join = async (born = dob) => {
    setBusy(true); setErr('')
    try {
      const r = await acceptInvite(code, born)
      useUI.getState().toast(ct('You’re now training with {0}', r.trainer.name))
      nav('/packet', { replace: true })
    } catch (e) {
      setErr(['dob', 'too-young'].includes(e?.data?.code) ? submitError(e) : coachingError(e, invite?.trainer?.name)); setBusy(false)
      if (e?.data?.code === 'dob') setDob(null)
    }
  }
  // Just signed up from this page: take the invite without asking again.
  useEffect(() => {
    if (!signedIn || invite?.status !== 'valid') return
    const born = takeJoinDob()
    if (takeAutoAccept(code) && born) { setDob(born); join(born) }
    else if (born) setDob(born)   // signed in with an account they had: the date is kept, they tap Join
  }, [signedIn, invite])   // eslint-disable-line react-hooks/exhaustive-deps

  if (invite === undefined) return <div className="narrow" />
  if (invite?.error) return <div className="narrow"><div className="card" role="alert" style={{ marginTop: 40 }}>{invite.error}</div></div>
  if (!invite || invite.status !== 'valid') return <div className="narrow"><Lapsed invite={invite} />
    {signedIn && <><div style={{ height: 12 }} /><Button onClick={() => nav('/home', { replace: true })}>{ct('Go to Home')}</Button></>}
  </div>

  if (young) return <div className="narrow"><TooYoung onClose={signedIn ? () => nav('/home', { replace: true }) : null} /></div>
  if (!dob && !busy) {
    const next = (born, age) => { if (age < MIN_AGE) setYoung(true); else setDob(born) }
    // A branded invite shows its header first; it already says who invited you.
    const branded = isBranded(invite.trainer)
    return <div className="narrow" style={{ paddingTop: branded ? 0 : 28 }}>{branded && <InviteCard invite={invite} />}<AboutYou trainerName={invite.trainer.name} invited={!branded} onNext={next} error={err} /></div>
  }

  if (!signedIn && signIn) return <>
    <div className="narrow"><InviteCard invite={invite} /></div>
    <Login />
  </>

  const register = () => {
    markAutoAccept(code)
    rememberJoinDob(dob)
    useUI.getState().openSheet(close => <RegisterSheet close={close} initialCode={code} />)
  }
  return <div className="narrow">
    <InviteCard invite={invite} />
    {signedIn ? <>
      <InAccent accent={isBranded(invite.trainer) ? invite.trainer.accent : null}><Button variant="primary" onClick={() => join()} disabled={busy}>{ct('Join {0}', invite.trainer.name)}</Button></InAccent>
      <div className="muted small" style={{ marginTop: 10, textAlign: 'center' }}>{ct('{0} will see your workouts, progress and messages. You can end coaching at any time in Settings.', invite.trainer.name)}</div>
    </> : <>
      <InAccent accent={isBranded(invite.trainer) ? invite.trainer.accent : null}><Button variant="primary" onClick={register}>{ct('Create account')}</Button></InAccent>
      <div style={{ height: 8 }} />
      <Button variant="ghost" onClick={() => { rememberJoinDob(dob); setSignIn(true) }}>{ct('I already have an account')}</Button>
    </>}
    {err && <div className="card small" role="alert" style={{ marginTop: 12 }}>{err}</div>}
  </div>
}
