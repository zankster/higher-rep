// trainer-fork: Settings › Coaching for a client (Phase 2b): who coaches you, and End coaching,
// which works as a block (SPEC.md, Permissions). "Download my documents and chat" joins the end
// sheet once there are documents (2e) and a chat (Phase 5) to download. Phase 2g: the trainer's
// card (their logo or initials on their colour, business name) and how to reach them; the phone
// number only when the trainer turned it on for this client.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { TrainerMark } from '../components/TrainerBrand.jsx'
import { Pill } from './ClientProfile.jsx'
import { ct, myTrainer, endCoaching, coachingError, coachingChanged, onCoachingChanged, trainerCardLine, telHref, websiteLabel } from '../lib/coaching.js'

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
  const [coach, setCoach] = useState(undefined)   // undefined: loading, null: no trainer
  const [failed, setFailed] = useState('')
  useEffect(() => {
    const load = () => myTrainer().then(setCoach, e => e?.status === 404 ? setCoach(null) : setFailed(coachingError(e)))
    load()
    return onCoachingChanged(load)
  }, [])
  const first = String(coach?.name || '').split(/\s+/)[0] || coach?.name
  // A website in a new tab; mailto: and tel: hand over to the mail or phone app.
  const open = url => { if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener'); else window.location.href = url }
  // Through the event, not setMe: see coachingChanged in lib/coaching.js.
  const ended = () => { coachingChanged(); useUI.getState().toast(ct('Coaching ended')) }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Coaching')}</h1></div>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    {coach !== undefined && (coach ? <>
      <Section title={ct('Your trainer')} footer={coach.status === 'paused' ? ct('{0} has paused coaching for now. Nothing counts as missed while it is paused.', coach.name) : null}>
        <div className="row" style={{ gap: 14, padding: '14px' }}>
          <TrainerMark logo={coach.logo} accent={coach.accent} name={coach.business || coach.name} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 17 }}>{coach.name}</div>
            <div className="small" style={{ color: 'var(--label-2)' }}>{trainerCardLine(coach)}</div>
            {coach.tagline && <div className="small muted">{coach.tagline}</div>}
          </div>
          {coach.status === 'paused' && <Pill warn>{ct('Paused')}</Pill>}
        </div>
      </Section>
      {(coach.email || coach.phone || coach.website) && <Section title={ct('Contact')} footer={ct('Messages to {0} go through chat once it opens.', first)}>
        {coach.email && <Row icon="envelope" iconTint="var(--acc)" title={coach.email} subtitle={ct('Email')} accessory="chevron" onClick={() => open('mailto:' + coach.email)} />}
        {coach.phone && <Row icon="phoneScreen" iconTint="var(--acc)" title={coach.phone} subtitle={ct('Phone')} accessory="chevron" onClick={() => open(telHref(coach.phone))} />}
        {coach.website && <Row icon="globe" iconTint="var(--acc)" title={websiteLabel(coach.website)} subtitle={ct('Website')} accessory="chevron" onClick={() => open(coach.website)} />}
      </Section>}
      <Section>
        <Row title={ct('End coaching')} danger onClick={() => useUI.getState().openSheet(close => <EndCoachingSheet name={coach.name} close={close} onEnded={ended} />)} />
      </Section>
    </> : <div className="card small muted">{ct('You have no trainer right now. To start, open the invite link your trainer sent you.')}</div>)}
  </div>
}
