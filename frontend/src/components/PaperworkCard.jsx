// trainer-fork: the client's Home card for their trainer's paperwork (Phase 2e). Until the required
// documents are done (the guardian's signature included) it says "Before you train with <name>";
// after that, a document sent later shows as a plain to-do. Nothing shows when nothing is open.
// The client's own openGym tracking is never locked; what waits is coaching (plans, sessions).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import { ct, coachingMe, onCoachingChanged } from '../lib/coaching.js'

export function paperworkText(coach) {
  const name = coach.name
  if (coach.paperwork === 'about') return ct('{0} needs your date of birth and a few documents first.', name)
  if (coach.paperwork === 'todo') return coach.todo === 1 ? ct('1 document to do.') : ct('{0} documents to do.', coach.todo)
  if (coach.paperwork === 'guardian') return ct('Waiting for your parent or guardian to sign.')
  return coach.todo === 1 ? ct('1 document from {0} to review and sign.', name) : ct('{0} documents from {1} to review and sign.', coach.todo, name)
}

export default function PaperworkCard({ user }) {
  const nav = useNavigate()
  const [coach, setCoach] = useState(null)
  useEffect(() => {
    if (!user) return
    let gone = false
    const load = () => coachingMe().then(m => { if (!gone) setCoach(m.coach) }, () => {})
    load()
    const off = onCoachingChanged(load)
    return () => { gone = true; off() }
  }, [user])
  if (!coach || (coach.cleared && !coach.todo)) return null
  const blocked = !coach.cleared
  return <div className="card" style={blocked ? { boxShadow: 'inset 0 0 0 1px var(--orange)' } : null}>
    <div className="row" style={{ gap: 10 }}>
      <span style={{ color: blocked ? 'var(--orange)' : 'var(--acc)', flex: 'none' }}><Icon name={blocked ? 'lock' : 'clipboard'} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{blocked ? ct('Before you train with {0}', coach.name) : ct('From {0}', coach.name)}</div>
        <div className="small muted">{paperworkText(coach)}</div>
      </div>
    </div>
    <div style={{ height: 10 }} />
    <Button size="sm" variant="tinted" onClick={() => nav(coach.paperwork === 'guardian' ? '/my-documents' : '/packet')}>
      {coach.paperwork === 'guardian' ? ct('See where it stands') : coach.paperwork === 'about' ? ct('Start') : ct('Review and sign')}
    </Button>
  </div>
}
