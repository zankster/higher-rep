// trainer-fork: Settings › Privacy, for a client (Phase 2g, #/coaching/privacy). A placeholder that
// lists only what is true today: the trainer sees the documents you sign and the answers you
// give. Workouts, progress and progress photos join it when those features ship (Phases 3 to 5),
// each with its own switch where SPEC.md gives the client one.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { ct, myTrainer, coachingError } from '../lib/coaching.js'

export default function CoachingPrivacy() {
  const nav = useNavigate()
  const [coach, setCoach] = useState(undefined)
  const [failed, setFailed] = useState('')
  useEffect(() => { myTrainer().then(setCoach, e => e?.status === 404 ? setCoach(null) : setFailed(coachingError(e))) }, [])
  const name = coach?.name || ct('Your trainer')
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Privacy')}</h1></div>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    {coach === null && <div className="card small muted">{ct('You have no trainer right now, so nobody else sees your data.')}</div>}
    {coach && <>
      <Section title={ct('What {0} can see', name)} footer={ct('Your signed documents are kept as {0}’s record for at least 5 years, even after coaching ends.', name)}>
        <Row icon="clipboard" iconTint="var(--green)" title={ct('Documents you sign and forms you answer')} subtitle={ct('Including any health answers you give')} value={ct('Shared')} />
        <Row icon="dumbbell" iconTint="var(--grey)" title={ct('Workouts and progress')} subtitle={ct('Not yet. You will see what is shared before it starts.')} value={ct('Coming')} />
      </Section>
      <Section title={ct('Progress photos')}>
        <Row icon="camera" iconTint="var(--grey)" title={ct('Only you')} subtitle={ct('Coming soon.')} />
      </Section>
      <Section title={ct('Never shared')} footer={ct('Higher Rep has no ads and no tracking.')}>
        <Row icon="lock" iconTint="var(--grey)" title={ct('Your password and passkeys')} />
      </Section>
    </>}
  </div>
}
