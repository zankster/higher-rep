// trainer-fork: Settings › Coaching for a client (Phase 2b): who coaches you, and End coaching,
// which works as a block (SPEC.md, Permissions). "Download my documents and chat" joins the end
// sheet once there are documents (2e) and a chat (Phase 5) to download.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { ct, coachingMe, endCoaching, coachingError, sinceLine, coachingChanged, onCoachingChanged } from '../lib/coaching.js'

const POINTS = [
  ['lock', name => ct('{0} can no longer see your workouts, progress or messages.', name)],
  ['chat', () => ct('Neither of you can message the other.')],
  ['person', () => ct('Your account, workouts and measurements stay yours.')],
  ['clipboard', name => ct('Your signed documents are kept as {0}’s record for at least 5 years.', name)],
]

export function EndCoachingSheet({ name, close, onEnded }) {
  const [busy, setBusy] = useState(false)
  const end = async () => {
    setBusy(true)
    try { await endCoaching(); close(); onEnded?.() }
    catch (e) { useUI.getState().toast(coachingError(e, name)); setBusy(false) }
  }
  return <>
    <h3 style={{ marginBottom: 10 }}>{ct('End coaching with {0}?', name)}</h3>
    <div className="card" style={{ marginBottom: 10 }}>
      {POINTS.map(([icon, text], i) => <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', marginTop: i ? 8 : 0 }}>
        <span style={{ color: 'var(--acc)', flex: 'none' }}><Icon name={icon} /></span><span className="small">{text(name)}</span>
      </div>)}
    </div>
    <div className="muted small" style={{ marginBottom: 14 }}>{ct('To train with {0} again later, they send you a new invite.', name)}</div>
    <button className="btn danger" onClick={end} disabled={busy}>{ct('End coaching')}</button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{ct('Keep coaching')}</Button>
  </>
}

export default function Coaching() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [failed, setFailed] = useState('')
  useEffect(() => {
    const load = () => coachingMe().then(setMe, e => setFailed(coachingError(e)))
    load()
    return onCoachingChanged(load)
  }, [])
  const coach = me?.coach
  // Through the event, not setMe: see coachingChanged in lib/coaching.js.
  const ended = () => { coachingChanged(); useUI.getState().toast(ct('Coaching ended')) }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Coaching')}</h1></div>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    {me && (coach ? <>
      <Section title={ct('Your trainer')} footer={coach.status === 'paused' ? ct('{0} has paused coaching for now. Nothing counts as missed while it is paused.', coach.name) : null}>
        <Row icon="figureStrength" iconTint="var(--acc)" title={coach.name} subtitle={sinceLine(coach.since)} value={coach.status === 'paused' ? ct('Paused') : null} />
      </Section>
      <Section>
        <Row title={ct('End coaching')} danger onClick={() => useUI.getState().openSheet(close => <EndCoachingSheet name={coach.name} close={close} onEnded={ended} />)} />
      </Section>
    </> : <div className="card small muted">{ct('You have no trainer right now. To start, open the invite link your trainer sent you.')}</div>)}
  </div>
}
