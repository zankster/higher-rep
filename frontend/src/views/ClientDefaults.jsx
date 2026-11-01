// trainer-fork: Settings › New client defaults, for a trainer (Phase 2g, #/client-defaults). The
// preset a new client's settings start as (SPEC-client-settings.md). Clients who already joined
// keep theirs; each client's own settings screen comes with programs in Phase 3.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { ct, getBranding, setDefaultPreset, coachingError, coachingChanged, PRESETS } from '../lib/coaching.js'

export default function ClientDefaults() {
  const nav = useNavigate()
  const [preset, setPreset] = useState(null)
  const [failed, setFailed] = useState('')
  useEffect(() => { getBranding().then(r => setPreset(r.preset), e => setFailed(coachingError(e))) }, [])
  const pick = async id => {
    const was = preset
    setPreset(id)
    try { await setDefaultPreset(id); coachingChanged() } catch (e) { setPreset(was); useUI.getState().toast(coachingError(e)) }
  }
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('New client defaults')}</h1></div>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    {preset && <Section title={ct('Start new clients as')} footer={ct('New clients start with this. Clients who already joined keep theirs.')}>
      {PRESETS.map(p => <Row key={p.id} title={p.label()} subtitle={p.text()} accessory={p.id === preset ? 'check' : 'none'} onClick={() => pick(p.id)} />)}
    </Section>}
  </div>
}
