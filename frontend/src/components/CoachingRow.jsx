// trainer-fork: the rows Settings' root gains (Phase 2b, 2d, 2e, 2g). A trainer gets Clients,
// Documents, Branding (with the business name) and New client defaults (with the preset); a client
// gets Coaching with their trainer's business or name, My documents and Privacy; anyone else, a
// guest or the demo sees nothing. SourceCodeRow is for everyone.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Row } from './ui.jsx'
import { ct, coachingMe, getBranding, onCoachingChanged, presetLabel, SOURCE_URL } from '../lib/coaching.js'

export default function CoachingRow({ user }) {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [brand, setBrand] = useState(null)
  useEffect(() => {
    if (!user) return
    let gone = false
    const load = () => coachingMe().then(m => {
      if (gone) return
      setMe(m)
      if (m.trainer) getBranding().then(b => { if (!gone) setBrand(b) }, () => {})
    }, () => {})
    load()
    const off = onCoachingChanged(load)
    return () => { gone = true; off() }
  }, [user])
  if (!user || !me || (!me.trainer && !me.coach)) return null
  return <Section>
    {me.trainer && <Row icon="person" iconTint="var(--acc)" title={ct('Clients')} accessory="chevron" onClick={() => nav('/clients')} className="sp-root-row" />}
    {me.trainer && <Row icon="clipboard" iconTint="var(--acc)" title={ct('Documents')} accessory="chevron" onClick={() => nav('/documents')} className="sp-root-row" />}
    {me.trainer && <Row icon="palette" iconTint="var(--acc)" title={ct('Branding')} value={brand?.branding.business || null} accessory="chevron" onClick={() => nav('/branding')} className="sp-root-row" />}
    {me.trainer && <Row icon="slider" iconTint="var(--acc)" title={ct('New client defaults')} value={brand ? presetLabel(brand.preset) : null} accessory="chevron" onClick={() => nav('/client-defaults')} className="sp-root-row" />}
    {/* A trainer can have a trainer of their own. */}
    {me.coach && <Row icon="figureStrength" iconTint="var(--acc)" title={ct('Coaching')} value={me.coach.business || me.coach.name} accessory="chevron" onClick={() => nav('/coaching')} className="sp-root-row" />}
    {me.coach && <Row icon="clipboard" iconTint="var(--acc)" title={ct('My documents')} value={me.coach.todo ? ct('{0} to do', me.coach.todo) : null} accessory="chevron" onClick={() => nav('/my-documents')} className="sp-root-row" />}
    {me.coach && <Row icon="lock" iconTint="var(--acc)" title={ct('Privacy')} accessory="chevron" onClick={() => nav('/coaching/privacy')} className="sp-root-row" />}
  </Section>
}

/* The fork's own source code, which the AGPL asks us to offer everyone who uses the app (2g). */
export function SourceCodeRow() {
  return <Section title={ct('About Higher Rep')} footer={ct('Higher Rep is free software (AGPL). Anyone can read and reuse its code.')}>
    <Row icon="globe" iconTint="var(--grey)" title={ct('Source code')} subtitle="github.com/zankster/higher-rep" accessory="chevron"
      onClick={() => window.open(SOURCE_URL, '_blank', 'noopener')} />
  </Section>
}
