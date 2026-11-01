// trainer-fork: the sheets of the client profile (Phase 2f): add or rename a tag, write or edit a
// private note, read one record, export the record (ZIP), and send a library document to this
// one client. The profile itself is views/ClientProfile.jsx.
import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { Button, Switch, TextField, TextArea, Section, Row } from './ui.jsx'
import Icon from './Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import {
  ct, addTag, updateTag, addNote, editNote, deleteNote, clientRecord, clientRecordUrl, clientExportUrl, fileUrl,
  listDocuments, sendDocument, profileError, coachingChanged, noteLine, KIND_ICON, KIND_SHORT,
} from '../lib/coaching.js'

const err = text => text && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}><Icon name="warning" /> {text}</div>
const toast = s => useUI.getState().toast(s)

/* A link that looks like a button: downloads go through the browser, with the session cookie. */
const LinkButton = ({ href, icon, variant = 'plain', children, onClick }) =>
  <a className={'btn ' + variant} href={href} target="_blank" rel="noreferrer" onClick={onClick} style={{ textDecoration: 'none' }}>
    {icon && <Icon name={icon} />}<span>{children}</span>
  </a>

export function TagSheet({ clientId, tag, close, onTags }) {
  const [text, setText] = useState(tag?.text || '')
  const [warning, setWarning] = useState(!!tag?.warning)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const save = async () => {
    if (!text.trim()) { setProblem(ct('Type something first.')); return }
    setBusy(true); setProblem('')
    try { onTags(tag ? await updateTag(clientId, tag.id, { text, warning }) : await addTag(clientId, { text, warning })); close() }
    catch (e) { setProblem(profileError(e)); setBusy(false) }
  }
  return <>
    <h3 style={{ marginBottom: 12 }}>{tag ? ct('Edit tag') : ct('Add a tag')}</h3>
    <TextField placeholder={ct('Tag')} aria-label={ct('Tag')} maxLength={40} value={text} autoFocus
      onChange={e => { setText(e.target.value); setProblem('') }} onKeyDown={e => { if (e.key === 'Enter') save() }} />
    <div className="card row" style={{ gap: 10, marginTop: 10 }}>
      <div className="grow" style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{ct('Warning')}</div>
        <div className="small muted">{ct('Amber on the profile and beside the name on your roster.')}</div>
      </div>
      <Switch checked={warning} onChange={setWarning} aria-label={ct('Warning')} />
    </div>
    {err(problem)}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save} disabled={busy}>{tag ? ct('Save') : ct('Add tag')}</Button>
  </>
}

export function NoteSheet({ clientId, name, note, close, onNotes }) {
  const [text, setText] = useState(note?.text || '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const save = async () => {
    if (!text.trim()) { setProblem(ct('Type something first.')); return }
    setBusy(true); setProblem('')
    try { onNotes(note ? await editNote(clientId, note.id, text) : await addNote(clientId, text)); close() }
    catch (e) { setProblem(profileError(e)); setBusy(false) }
  }
  const remove = () => confirmSheet({
    title: ct('Delete this note?'), message: ct('It cannot be brought back.'), danger: true, confirmText: ct('Delete note'),
    onConfirm: async () => {
      try { onNotes(await deleteNote(clientId, note.id)); close() } catch (e) { toast(profileError(e)) }
    },
  })
  return <>
    <h3 style={{ marginBottom: 4 }}>{note ? ct('Edit note') : ct('New note')}</h3>
    <div className="small muted" style={{ marginBottom: 10 }}><Icon name="lock" /> {ct('Only you. Never shown or sent to {0}.', name)}</div>
    {note && <div className="small muted" style={{ marginBottom: 6 }}>{noteLine(note)}</div>}
    <TextArea aria-label={ct('Note')} maxLength={4000} rows={6} value={text} autoFocus onChange={e => { setText(e.target.value); setProblem('') }} />
    {err(problem)}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save} disabled={busy}>{ct('Save note')}</Button>
    {note && <><div style={{ height: 8 }} /><Button variant="danger" icon="trash" onClick={remove}>{ct('Delete note')}</Button></>}
  </>
}

const signerTitle = s => s.signer === 'guardian' ? ct('{0} ({1})', s.name, s.relationship || ct('parent or guardian')) : s.name

export function RecordSheet({ clientId, recordId, close }) {
  const [r, setR] = useState(null)
  const [problem, setProblem] = useState('')
  useEffect(() => { clientRecord(clientId, recordId).then(setR, e => setProblem(profileError(e))) }, [clientId, recordId])
  if (!r) return <>{problem ? err(problem) : <div className="small muted">{ct('Loading…')}</div>}<div style={{ height: 12 }} /><Button onClick={close}>{ct('Close')}</Button></>
  const flagged = (r.items || []).filter(i => i.flagged)
  return <>
    <h3 style={{ marginBottom: 2 }}>{r.title}</h3>
    <div className="small muted" style={{ marginBottom: 10 }}>{ct('Version {0}', r.version)} · {KIND_SHORT[r.kind]()}{r.kind === 'form' ? ' · ' + (r.yesCount === 1 ? ct('1 yes') : ct('{0} yes', r.yesCount)) : ''}</div>

    {r.kind === 'form' && <>
      {flagged.length > 0 && <div className="small row" style={{ gap: 6, marginBottom: 8 }}><Icon name="warning" style={{ color: 'var(--orange)' }} /><span>{ct('Flagged answers come first.')}</span></div>}
      {r.items.map(i => <div key={i.questionId} className="card" style={{ marginBottom: 8, ...(i.flagged ? { boxShadow: 'inset 3px 0 0 var(--orange)' } : {}) }}>
        <div className="small muted">{i.n}. {i.q}</div>
        <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontWeight: i.flagged ? 600 : 400 }}>{i.a}</div>
        {i.flagged && <div className="small" style={{ marginTop: 4 }}><span className="tag nocap" style={{ background: 'rgba(255, 149, 0, 0.2)' }}>{ct('Flagged')}</span></div>}
      </div>)}
    </>}
    {r.kind === 'sign' && (r.document
      ? <a className="card small" style={{ display: 'block' }} href={fileUrl(r.document.hash)} target="_blank" rel="noreferrer"><Icon name="download" /> {r.document.name}</a>
      : <div className="card small" style={{ whiteSpace: 'pre-wrap', maxHeight: '35vh', overflow: 'auto' }}>{r.text}</div>)}

    <Section title={r.kind === 'form' ? ct('Completed by') : r.kind === 'sign' ? ct('Signed by') : ct('Returned by')}>
      {r.signers.map((s, i) => <Row key={i} icon={s.signer === 'guardian' ? 'person' : 'personCircle'} iconTint="var(--green)" title={signerTitle(s)}
        subtitle={[s.signed, s.device && s.device.length > 60 ? s.device.slice(0, 60) + '…' : s.device, s.appVersion ? ct('app {0}', s.appVersion) : null].filter(Boolean).join(' · ')} />)}
    </Section>
    {r.waitingGuardian && <div className="small muted" style={{ marginBottom: 10 }}>{ct('Waiting for the parent or guardian to sign.')}</div>}

    <LinkButton variant="primary" icon="download" href={clientRecordUrl(clientId, r.id)}>{r.kind === 'pdf_return' ? ct('Open the returned PDF') : ct('Download PDF')}</LinkButton>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{ct('Close')}</Button>
  </>
}

export function ExportSheet({ client, close }) {
  const [notes, setNotes] = useState(false)
  return <>
    <h3 style={{ marginBottom: 4 }}>{ct('Export {0}’s record', client.name)}</h3>
    <div className="small muted" style={{ marginBottom: 10 }}>{ct('One ZIP file. The export is noted in the activity log.')}</div>
    <div className="card small">
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><Icon name="list" /><span>{ct('A PDF of every signed document and completed form, as it was signed')}</span></div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 6 }}><Icon name="folder" /><span>{ct('The PDFs that were signed and the ones {0} returned', client.name)}</span></div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 6 }}><Icon name="grid" /><span>{ct('The same records as data (JSON and CSV)')}</span></div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 6 }}><Icon name="shield" /><span>{ct('A manifest with a SHA-256 for every file, to show nothing was changed')}</span></div>
    </div>
    <div className="card row" style={{ gap: 10, marginTop: 10 }}>
      <div className="grow" style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{ct('Include my notes and tags')}</div>
        <div className="small muted">{notes ? ct('Your private notes and tags go in the file too.') : ct('Off: they stay out of the file.')}</div>
      </div>
      <Switch checked={notes} onChange={setNotes} aria-label={ct('Include my notes and tags')} />
    </div>
    <div style={{ height: 12 }} />
    <LinkButton variant="primary" icon="download" href={clientExportUrl(client.id, notes)} onClick={() => setTimeout(close, 300)}>{ct('Export record (ZIP)')}</LinkButton>
  </>
}

/* Send one of the trainer's published documents to this client. */
export function SendToClientSheet({ client, close }) {
  const [docs, setDocs] = useState(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { listDocuments().then(d => setDocs(d.filter(x => x.version != null)), e => setProblem(profileError(e))) }, [])
  const send = async d => {
    setBusy(true)
    try {
      const r = await sendDocument(d.id, [client.id], null, d.required)
      toast(r.sent ? ct('{0} sent to {1}', d.title, client.name) : ct('{0} already has it, or did this version', client.name))
      coachingChanged(); close()
    } catch (e) { setProblem(profileError(e)); setBusy(false) }
  }
  return <>
    <h3 style={{ marginBottom: 4 }}>{ct('Send {0} a document', client.name)}</h3>
    <div className="small muted" style={{ marginBottom: 10 }}>{ct('It goes on their home as a to-do. Required documents hold up training until done.')}</div>
    {!docs && !problem && <div className="small muted">{ct('Loading…')}</div>}
    {docs && !docs.length && <div className="card small muted">{ct('Nothing published yet. Add documents in Settings › Documents.')}</div>}
    {docs && docs.length > 0 && <Section>
      {docs.map(d => <Row key={d.id} icon={KIND_ICON[d.kind]} iconTint="var(--acc)" title={d.title}
        subtitle={ct('Version {0}', d.version) + (d.required ? ' · ' + ct('required') : '')} accessory="chevron" onClick={busy ? undefined : () => send(d)} />)}
    </Section>}
    {err(problem)}
  </>
}

const open = render => useUI.getState().openSheet(render)
export const openTagSheet = (clientId, tag, onTags) => open(close => <TagSheet clientId={clientId} tag={tag} close={close} onTags={onTags} />)
export const openNoteSheet = (clientId, name, note, onNotes) => open(close => <NoteSheet clientId={clientId} name={name} note={note} close={close} onNotes={onNotes} />)
export const openRecordSheet = (clientId, recordId) => open(close => <RecordSheet clientId={clientId} recordId={recordId} close={close} />)
export const openExportSheet = client => open(close => <ExportSheet client={client} close={close} />)
export const openSendToClient = client => open(close => <SendToClientSheet client={client} close={close} />)
