// trainer-fork: Settings › Documents, the trainer's document library (Phase 2d). The sign-up
// packet first, in the order new clients complete it (drag the handles to reorder), then the
// documents not in it. A document's own page adds it to the packet or takes it out.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Button, TextField, Check } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { useListReorder, moved } from '../lib/use-list-reorder.js'
import {
  ct, listDocuments, newDocument, setPacket, coachingError, coachingChanged, onCoachingChanged,
  KIND_LABEL, KIND_SHORT, KIND_ICON, versionLine,
} from '../lib/coaching.js'

const KIND_HINT = {
  sign: () => ct('Paste the text or upload a PDF. Clients read it and sign.'),
  form: () => ct('Build the questions here: yes/no, text, choice, date and more.'),
  pdf_return: () => ct('Clients download it, fill it in and upload it back.'),
}

export function NewDocumentSheet({ close, onCreated }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('sign')
  const [rights, setRights] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const create = async () => {
    if (!title.trim()) { setErr(ct('Give the document a title.')); return }
    if (!rights) { setErr(ct('Tick the box to confirm you may use this document.')); return }
    setBusy(true); setErr('')
    try { const d = await newDocument({ title, kind, rights }); coachingChanged(); close(); onCreated?.(d) }
    catch (e) { setErr(coachingError(e)); setBusy(false) }
  }
  return <>
    <h3 style={{ marginBottom: 12 }}>{ct('New document')}</h3>
    <TextField placeholder={ct('Title')} aria-label={ct('Title')} maxLength={120} value={title} onChange={e => { setTitle(e.target.value); setErr('') }} />
    <div role="radiogroup" aria-label={ct('Kind of document')} style={{ marginTop: 10 }}>
      {Object.keys(KIND_LABEL).map(k => <button key={k} role="radio" aria-checked={kind === k} className="card"
        onClick={() => setKind(k)}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'start', marginBottom: 8, padding: '10px 12px',
          outline: kind === k ? '2px solid var(--acc)' : 'none', outlineOffset: -2 }}>
        <span style={{ color: 'var(--acc)', flex: 'none', marginTop: 2 }}><Icon name={KIND_ICON[k]} /></span>
        <span><span style={{ fontWeight: 600, display: 'block' }}>{KIND_LABEL[k]()}</span><span className="muted small">{KIND_HINT[k]()}</span></span>
      </button>)}
    </div>
    <div className="row" style={{ gap: 10, alignItems: 'flex-start', margin: '6px 0 4px' }}>
      <Check checked={rights} onChange={v => { setRights(v); setErr('') }} label={ct('I wrote this document or have permission to use it.')} />
      <span className="small" onClick={() => { setRights(r => !r); setErr('') }}>{ct('I wrote this document or have permission to use it.')}</span>
    </div>
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}><Icon name="warning" /> {err}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={create} disabled={busy}>{ct('Create draft')}</Button>
  </>
}

function DocRow({ d, onOpen, handle, style }) {
  return <div data-reorder-row className="item" style={{ ...style, cursor: 'pointer' }} role="button" tabIndex={0}
    onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}>
    <span className="lrow-i" style={{ color: 'var(--acc)' }}><Icon name={KIND_ICON[d.kind]} /></span>
    <div className="grow"><div className="tt">{d.title}</div><div className="ss">{KIND_SHORT[d.kind]()} · {versionLine(d)}</div></div>
    {d.version == null && <span className="small" style={{ color: 'var(--orange)', fontWeight: 600, marginInlineEnd: 6 }}>{ct('DRAFT')}</span>}
    {handle ? <button className="iconbtn" aria-label={ct('Move {0}', d.title)} title={ct('Drag to reorder')} {...handle}><Icon name="chevronsUpDown" /></button>
      : <Icon name="chevronRight" className="chev" />}
  </div>
}

export default function Documents() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [docs, setDocs] = useState(null)
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    try { setDocs(await listDocuments()); setFailed('') } catch (e) { setFailed(coachingError(e)) }
  }, [])
  useEffect(() => { load(); return onCoachingChanged(load) }, [load])

  const packet = (docs || []).filter(d => d.inPacket)
  const others = (docs || []).filter(d => !d.inPacket)
  const reorder = useListReorder(packet.length, async (from, to) => {
    const next = moved(packet, from, to)
    setDocs([...next, ...others])
    try { setDocs(await setPacket(next.map(d => d.id))) } catch (e) { toast(coachingError(e)); load() }
  })
  const open = d => nav('/documents/' + d.id)
  const create = () => useUI.getState().openSheet(close => <NewDocumentSheet close={close} onCreated={open} />)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Documents')}</h1></div>
      <button className="iconbtn" onClick={create} aria-label={ct('New document')}><Icon name="plus" /></button>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    {docs && <>
      <Section title={ct('Sign-up packet')} footer={packet.length ? ct('New clients complete these in this order. Drafts are skipped until you publish them.') : ct('Open a document and turn on “In the sign-up packet” to add it.')}>
        {packet.length > 0 && <div className="list" ref={reorder.listRef}>
          {packet.map((d, i) => <DocRow key={d.id} d={d} onOpen={() => open(d)} style={reorder.rowStyle(i)} handle={packet.length > 1 ? reorder.handle(i) : null} />)}
        </div>}
      </Section>
      <Section title={ct('Not in the packet')}>
        {others.length ? <div className="list">{others.map(d => <DocRow key={d.id} d={d} onOpen={() => open(d)} />)}</div>
          : <div className="small muted" style={{ padding: '10px 14px' }}>{docs.length ? ct('Every document is in the packet.') : ct('No documents yet.')}</div>}
      </Section>
      <div className="muted small" style={{ margin: '0 4px 12px' }}>{ct('Drafts are never shown to clients. Publishing makes a new version; what a client signed always keeps its version.')}</div>
    </>}
    <Button variant="primary" icon="plus" onClick={create}>{ct('New document')}</Button>
  </div>
}
