// trainer-fork: one client's profile, for their trainer (Phase 2f, #/clients/:id). Header with
// age, start date and paperwork; tags (warnings in amber); flagged answers that can become tags;
// what is still open, with the guardian; private notes; the injury log (from Phase 5); records
// with their PDFs and the record export. The roster row's old menu lives in the … button.
// Programs join the header in Phase 3.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { menuSheet, confirmSheet } from '../sheets.jsx'
import { removeMessage } from './Clients.jsx'
import { openTagSheet, openNoteSheet, openRecordSheet, openExportSheet, openSendToClient } from '../components/ClientProfileSheets.jsx'
import {
  ct, clientProfile, pauseClient, removeClient, addTag, updateTag, deleteTag, resendGuardianLink, coachingError, profileError,
  coachingChanged, onCoachingChanged, sinceLine, ageLine, paperworkPill, initials, retentionLine, recordLine, noteLine, KIND_ICON,
} from '../lib/coaching.js'

// Plain rgba, not color-mix(): the iPhone app still runs on iOS 15, which has no color-mix().
export const AMBER = 'rgba(255, 149, 0, 0.2)'
const CHIP = { display: 'inline-flex', alignItems: 'center', gap: 4 }
const day = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export const Pill = ({ ok, warn, children }) => <span className="tag nocap" style={{
  background: ok ? 'rgba(52, 199, 89, 0.18)' : warn ? AMBER : 'var(--surface-2)', color: 'var(--label)',
}}>{children}</span>

export default function ClientProfile() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [p, setP] = useState(null)
  const [failed, setFailed] = useState('')

  const load = useCallback(() => clientProfile(id).then(r => { setP(r); setFailed('') }, e => setFailed(coachingError(e))), [id])
  useEffect(() => { load(); return onCoachingChanged(load) }, [load])

  const back = <button className="iconbtn" data-back="/clients" onClick={() => nav('/clients')} aria-label={ct('Clients')}><Icon name="chevronLeft" /></button>
  if (!p) return <div className="narrow">
    <div className="hdr">{back}<div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Client')}</h1></div></div>
    {failed ? <div className="card small" role="alert">{failed}</div> : <div className="small muted">{ct('Loading…')}</div>}
  </div>

  const c = p.client
  const first = String(c.name || '').split(/\s+/)[0] || c.name
  const setTags = tags => setP(x => ({ ...x, tags, flagged: x.flagged.map(f => ({ ...f, tagged: tags.some(t => t.text.toLowerCase() === f.tag.toLowerCase()) })) }))
  const setNotes = notes => setP(x => ({ ...x, notes }))
  // Through the event, not load(): see coachingChanged in lib/coaching.js.
  const act = fn => async () => { try { await fn() } catch (e) { toast(profileError(e)) } finally { coachingChanged() } }

  const more = () => menuSheet({
    title: c.name, subtitle: c.status === 'paused' ? ct('Paused') : sinceLine(c.since),
    items: [
      { icon: 'envelope', label: ct('Send a document'), onClick: () => openSendToClient(c) },
      { icon: 'download', label: ct('Export record (ZIP)'), onClick: () => openExportSheet(c) },
      c.status === 'paused'
        ? { icon: 'play', label: ct('Resume coaching'), onClick: act(() => pauseClient(c.id, false)) }
        : { icon: 'pause', label: ct('Pause coaching'), sub: ct('Holiday or injury break. No alerts, nothing counts as missed.'), onClick: act(() => pauseClient(c.id, true)) },
      { icon: 'trash', label: ct('Remove client'), danger: true, onClick: () => confirmSheet({
        title: ct('Remove {0}?', c.name), message: removeMessage(c.name), danger: true, confirmText: ct('Remove {0}', c.name),
        onConfirm: async () => {
          try { await removeClient(c.id); toast(ct('{0} removed', c.name)); coachingChanged(); nav('/clients') } catch (e) { toast(coachingError(e)) }
        },
      }) },
    ],
  })

  const tagMenu = tag => menuSheet({
    title: tag.text, subtitle: tag.warning ? ct('Warning') : ct('Tag'),
    items: [
      { icon: 'pencil', label: ct('Rename'), onClick: () => openTagSheet(c.id, tag, setTags) },
      { icon: 'warning', label: tag.warning ? ct('Not a warning') : ct('Make it a warning'), onClick: async () => { try { setTags(await updateTag(c.id, tag.id, { warning: !tag.warning })) } catch (e) { toast(profileError(e)) } } },
      { icon: 'trash', label: ct('Remove tag'), danger: true, onClick: async () => { try { setTags(await deleteTag(c.id, tag.id)) } catch (e) { toast(profileError(e)) } } },
    ],
  })
  const tagFrom = async f => {
    try { setTags(await addTag(c.id, { fromAnswer: { record: f.record, question: f.question } })); toast(ct('Tagged “{0}”', f.tag)) }
    catch (e) { toast(profileError(e)) }
  }
  const resend = async () => {
    try { const r = await resendGuardianLink(c.id); setP(x => ({ ...x, guardian: r.guardian })); toast(ct('New link emailed to {0}', p.guardian.name)) }
    catch (e) { toast(profileError(e)) }
  }

  const pill = paperworkPill(c)
  const g = p.guardian
  const guardianWaiting = p.waiting.some(w => w.waitingGuardian)

  return <div className="narrow">
    <div className="hdr">
      {back}
      <div style={{ flex: 1, marginInlineStart: 12, minWidth: 0 }}><h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h1></div>
      <button className="iconbtn" onClick={more} aria-label={ct('More')}><Icon name="more" /></button>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}

    <div className="card row" style={{ gap: 14, alignItems: 'center', marginBottom: 14 }}>
      <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--acc)', color: 'var(--on-acc)', display: 'grid', placeItems: 'center', fontSize: 21, fontWeight: 600, flex: 'none' }}>{initials(c.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {ageLine(c) && <div className="small" style={{ color: 'var(--label-2)' }}>{ageLine(c)}</div>}
        <div className="small" style={{ color: 'var(--label-2)' }}>{sinceLine(c.since)}{c.status === 'paused' ? ' · ' + ct('Paused') : ''}</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <Pill ok={pill.ok} warn={!pill.ok}>{pill.label}</Pill>
          {c.minor && <Pill>{ct('Under 18')}</Pill>}
        </div>
      </div>
    </div>

    <Section title={ct('Tags')} footer={ct('Only you see tags. Warnings show beside {0}’s name on your roster.', first)}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', padding: '12px 14px' }}>
        {p.tags.map(tag => <button key={tag.id} className="chip nocap" onClick={() => tagMenu(tag)}
          style={{ ...CHIP, background: tag.warning ? AMBER : 'var(--surface-2)' }} aria-label={tag.warning ? ct('Warning: {0}', tag.text) : tag.text}>
          {tag.warning && <Icon name="warning" style={{ color: 'var(--orange)' }} />}{tag.text}
        </button>)}
        <button className="chip nocap" onClick={() => openTagSheet(c.id, null, setTags)} style={{ ...CHIP, color: 'var(--acc)', border: '1px dashed var(--sep)' }}><Icon name="plus" />{ct('tag')}</button>
      </div>
    </Section>

    {p.flagged.length > 0 && <Section title={ct('Flagged answers')} footer={ct('Yes answers your forms flag. Talk them through before the first session.')}>
      {p.flagged.map(f => <Row key={f.record + f.question} icon="warning" iconTint="var(--orange)" title={f.question}
        subtitle={[f.followUp, f.title + ' · ' + day(f.at)].filter(Boolean).join(' · ')}
        value={f.tagged ? <span className="small" style={{ color: 'var(--label-2)' }}><Icon name="check" /> {ct('Tagged')}</span>
          : <Button size="sm" variant="tinted" onClick={() => tagFrom(f)}>{ct('Make it a tag')}</Button>} />)}
    </Section>}

    {(p.waiting.length > 0 || g) && <Section title={ct('Still waiting')} footer={g && guardianWaiting && !g.canResend ? ct('No email for the guardian: they can sign on {0}’s phone.', first) : null}>
      {p.waiting.map(w => <Row key={w.id} icon={w.waitingGuardian ? 'clock' : KIND_ICON[w.kind]} iconTint="var(--orange)" title={w.title}
        subtitle={w.waitingGuardian ? ct('{0} signed. Waiting on {1}.', first, g?.name || ct('the guardian'))
          : [ct('Version {0}', w.version), w.required ? ct('required') : null, ct('sent {0}', day(w.sent)), w.due ? ct('due {0}', day(w.due)) : null].filter(Boolean).join(' · ')} />)}
      {g && <Row icon="person" iconTint="var(--grey)" title={ct('{0} ({1})', g.name, g.relationship)}
        subtitle={[g.email, g.linkSent ? ct('link sent {0}', day(g.linkSent)) : null, g.linkExpires ? ct('ends {0}', day(g.linkExpires)) : g.linkSent ? ct('link used or ended') : null].filter(Boolean).join(' · ')} />}
      {g && guardianWaiting && g.canResend && <Row icon="envelope" iconTint="var(--acc)" title={ct('Send {0} a new link', g.name.split(/\s+/)[0])} onClick={resend} />}
    </Section>}

    <Section title={ct('Private notes')} footer={ct('Only you. Never shown or sent to {0}.', first)}>
      <Row icon="plus" iconTint="var(--acc)" title={ct('Add a note')} onClick={() => openNoteSheet(c.id, first, null, setNotes)} />
      {p.notes.map(n => <Row key={n.id} icon="note" iconTint="var(--grey)" title={<span style={{ whiteSpace: 'pre-wrap', display: 'block', fontSize: 15 }}>{n.text}</span>}
        subtitle={noteLine(n)} accessory="chevron" onClick={() => openNoteSheet(c.id, first, n, setNotes)} />)}
    </Section>

    <Section title={ct('Injury log')}>
      <Row icon="heart" iconTint="var(--grey)" title={ct('Nothing reported')} subtitle={ct('Pain reports from {0} will show here.', first)} />
    </Section>

    <Section title={ct('Records')} footer={retentionLine(p.retention)}>
      {!p.records.length && <Row title={ct('Nothing signed yet')} />}
      {p.records.map(r => <Row key={r.id} icon={KIND_ICON[r.kind]} iconTint={r.waitingGuardian ? 'var(--orange)' : 'var(--green)'} title={r.title}
        subtitle={recordLine(r)} accessory="chevron" onClick={() => openRecordSheet(c.id, r.id)} />)}
      <Row icon="download" iconTint="var(--acc)" title={ct('Export record (ZIP)')} onClick={() => openExportSheet(c)} />
    </Section>
  </div>
}
