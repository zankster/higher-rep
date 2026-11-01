// trainer-fork: the rows Settings' root gains (Phase 2b, 2d). A trainer gets Clients and Documents, a client gets
// Coaching with their trainer's name; anyone else, a guest or the demo sees nothing.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Row } from './ui.jsx'
import { ct, coachingMe } from '../lib/coaching.js'

export default function CoachingRow({ user }) {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  useEffect(() => {
    if (!user) return
    let gone = false
    coachingMe().then(m => { if (!gone) setMe(m) }, () => {})
    return () => { gone = true }
  }, [user])
  if (!user || !me || (!me.trainer && !me.coach)) return null
  return <Section>
    {me.trainer && <Row icon="person" iconTint="var(--acc)" title={ct('Clients')} accessory="chevron" onClick={() => nav('/clients')} className="sp-root-row" />}
    {me.trainer && <Row icon="clipboard" iconTint="var(--acc)" title={ct('Documents')} accessory="chevron" onClick={() => nav('/documents')} className="sp-root-row" />}
    {/* A trainer can have a trainer of their own. */}
    {me.coach && <Row icon="figureStrength" iconTint="var(--acc)" title={ct('Coaching')} value={me.coach.name} accessory="chevron" onClick={() => nav('/coaching')} className="sp-root-row" />}
  </Section>
}
