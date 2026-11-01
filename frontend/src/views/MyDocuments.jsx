// trainer-fork: Settings › My documents for a client (Phase 2e): what the trainer asked for and
// is still to do, what waits for the guardian, and every signed record with its PDF.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Row } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { ct, myDocuments, coachingError, recordUrl, KIND_ICON } from '../lib/coaching.js'

const day = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function MyDocuments() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState('')
  useEffect(() => { myDocuments().then(setData, e => setFailed(coachingError(e))) }, [])

  const doneLine = d => {
    const who = d.signers.find(s => s.signer === 'guardian')
    const base = d.kind === 'sign' ? ct('Version {0} · signed {1}', d.version, day(d.done)) : ct('Version {0} · {1}', d.version, day(d.done))
    return who ? base + ' · ' + ct('with {0}', who.name) : base
  }
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('My documents')}</h1></div>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    {data && <>
      {!data.about && <Section footer={ct('{0} needs your date of birth before your documents.', data.trainer.name)}>
        <Row icon="person" iconTint="var(--orange)" title={ct('About you')} accessory="chevron" onClick={() => nav('/packet')} />
      </Section>}
      {data.todo.length > 0 && <Section title={ct('To do')} footer={!data.cleared ? ct('The ones marked required come before your first session with {0}.', data.trainer.name) : null}>
        {data.todo.map(s => <Row key={s.id} icon={KIND_ICON[s.kind]} iconTint="var(--acc)" title={s.title}
          subtitle={[ct('Version {0}', s.version), s.required ? ct('required') : null, s.due ? ct('due {0}', day(s.due)) : null].filter(Boolean).join(' · ')}
          value={s.kind === 'sign' ? ct('Sign') : ct('Open')} accessory="chevron" onClick={() => nav('/packet')} />)}
      </Section>}
      {data.waiting.length > 0 && <Section title={ct('Waiting for your parent or guardian')}>
        {data.waiting.map(s => <Row key={s.id} icon="clock" iconTint="var(--orange)" title={s.title} subtitle={ct('You signed. {0} still signs.', data.guardian?.name || ct('Your guardian'))}
          accessory="chevron" onClick={() => nav('/packet')} />)}
      </Section>}
      <Section title={ct('Done')} footer={ct('Records are never edited. A correction is a new version you sign again.')}>
        {!data.done.length && <Row title={ct('Nothing signed yet')} />}
        {data.done.map(d => <a key={d.id} href={recordUrl(d.id)} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
          <Row icon={KIND_ICON[d.kind]} iconTint="var(--green)" title={d.title} subtitle={doneLine(d)} value={<Icon name="download" />} />
        </a>)}
      </Section>
    </>}
  </div>
}
