// trainer-fork: one document of the library (Phase 2d): its draft, autosaved as you type, the
// editor for its kind, and Preview, Publish, the packet switch, Send to clients and Delete.
// A published version is never edited: typing starts a draft of the next one.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button, TextField, TextArea, Switch, Segmented, Check } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { menuSheet, confirmSheet } from '../sheets.jsx'
import { PublishSheet, SendSheet, PreviewSheet } from '../components/DocumentSheets.jsx'
import {
  ct, getDocument, saveDraft, discardDraft, deleteDocument, listDocuments, setPacket, uploadPdf, fileUrl,
  coachingError, publishError, coachingChanged, KIND_LABEL, QUESTION_TYPES, questionTypeLabel, newQuestion, retypeQuestion, MAX_PDF_MB,
} from '../lib/coaching.js'

const SAVE_MS = 700
const fmtDay = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const iconBtn = (icon, label, onClick, disabled) => <button className="iconbtn" aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon name={icon} /></button>

/* ---------- PDF ---------- */

function PdfField({ file, onChange, label }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_PDF_MB * 1024 * 1024) { setErr(ct('That file is larger than {0} MB.', MAX_PDF_MB)); return }
    setBusy(true); setErr('')
    try { const r = await uploadPdf(f); onChange({ hash: r.hash, name: f.name }) }
    catch (x) { setErr(publishError(x)) }
    finally { setBusy(false) }
  }
  return <div className="card" style={{ padding: 12 }}>
    <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={pick} aria-label={label} />
    {file ? <div className="row" style={{ gap: 10 }}>
      <span style={{ color: 'var(--red)' }}><Icon name="clipboard" /></span>
      <a className="grow small" href={fileUrl(file.hash)} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{file.name}</a>
      <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>{ct('Replace')}</Button>
    </div> : <Button icon="plus" onClick={() => input.current?.click()} disabled={busy}>{busy ? ct('Uploading…') : label}</Button>}
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}>{err}</div>}
  </div>
}

/* ---------- form builder ---------- */

function QuestionCard({ q, n, count, onChange, onMove, onRemove, flagged }) {
  const set = patch => onChange({ ...q, ...patch })
  const pickType = () => menuSheet({
    title: ct('Question type'),
    items: QUESTION_TYPES.map(([type, label]) => ({ label: label(), icon: type === q.type ? 'check' : undefined, onClick: () => onChange(retypeQuestion(q, type)) })),
  })
  const options = q.options || []
  return <div className="card" data-question={q.id} style={{ padding: 12, marginBottom: 10, outline: flagged ? '2px solid var(--red)' : 'none' }}>
    <div className="row" style={{ gap: 6, marginBottom: 8 }}>
      <span className="small muted" style={{ minWidth: 22 }}>{n}.</span>
      <Button size="sm" trailingIcon="chevronDown" onClick={pickType}>{questionTypeLabel(q.type)}</Button>
      <span className="grow" />
      {iconBtn('arrowUp', ct('Move up'), () => onMove(-1), n === 1)}
      {iconBtn('arrowDown', ct('Move down'), () => onMove(1), n === count)}
      {iconBtn('trash', ct('Delete question'), onRemove)}
    </div>
    <TextArea rows={2} placeholder={ct('Question')} aria-label={ct('Question {0}', n)} maxLength={1000} value={q.text} onChange={e => set({ text: e.target.value })} />
    {q.type === 'choice' && <div style={{ marginTop: 8 }}>
      {options.map((o, i) => <div key={i} className="row" style={{ gap: 6, marginBottom: 6 }}>
        <TextField placeholder={ct('Choice {0}', i + 1)} aria-label={ct('Choice {0}', i + 1)} maxLength={200} value={o}
          onChange={e => set({ options: options.map((x, k) => k === i ? e.target.value : x) })} />
        {iconBtn('xmark', ct('Remove choice'), () => set({ options: options.filter((_, k) => k !== i) }), options.length <= 2)}
      </div>)}
      <div className="row" style={{ gap: 10, justifyContent: 'space-between' }}>
        <Button size="sm" variant="ghost" icon="plus" onClick={() => set({ options: [...options, ''] })} disabled={options.length >= 30}>{ct('Add choice')}</Button>
        <label className="row small" style={{ gap: 8 }}><Check checked={!!q.multi} onChange={v => set({ multi: v })} label={ct('Allow more than one')} />{ct('Allow more than one')}</label>
      </div>
    </div>}
    {q.type === 'yes_no' && <div style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 10, padding: '6px 0' }}>
        <div className="grow" style={{ flex: 1 }}><div className="small" style={{ fontWeight: 600 }}>{ct('Flag a yes')}</div><div className="small muted">{ct('A yes shows on the client’s profile, and they are told you will see it before the first session.')}</div></div>
        <Switch checked={!!q.flagYes} onChange={v => set({ flagYes: v })} aria-label={ct('Flag a yes')} />
      </div>
      <div className="row" style={{ gap: 10, padding: '6px 0' }}>
        <div className="grow small" style={{ fontWeight: 600, flex: 1 }}>{ct('Ask a follow-up if yes')}</div>
        <Switch checked={!!q.followUp} onChange={v => set({ followUp: v ? { type: 'long_text', text: '' } : null })} aria-label={ct('Ask a follow-up if yes')} />
      </div>
      {q.followUp && <div style={{ borderInlineStart: '2px solid var(--acc)', paddingInlineStart: 10 }}>
        <TextArea rows={2} placeholder={ct('If yes, ask…')} aria-label={ct('Follow-up question')} maxLength={1000} value={q.followUp.text}
          onChange={e => set({ followUp: { ...q.followUp, text: e.target.value } })} />
        <Segmented className="small" value={q.followUp.type} onChange={type => set({ followUp: { ...q.followUp, type } })}
          options={[{ value: 'short_text', label: ct('Short answer') }, { value: 'long_text', label: ct('Long answer') }]} />
      </div>}
    </div>}
    <div className="row" style={{ gap: 10, paddingTop: 8 }}>
      <div className="grow small muted" style={{ flex: 1 }}>{ct('Required')}</div>
      <Switch checked={q.required !== false} onChange={v => set({ required: v })} aria-label={ct('Required')} />
    </div>
  </div>
}

function FormEditor({ body, onChange, flagged }) {
  const qs = body.questions || []
  const setQs = questions => onChange({ ...body, questions })
  const move = (i, d) => { const next = [...qs]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); setQs(next) }
  return <>
    <TextArea rows={2} placeholder={ct('Introduction (optional)')} aria-label={ct('Introduction')} maxLength={5000} value={body.intro || ''} onChange={e => onChange({ ...body, intro: e.target.value })} />
    <div style={{ height: 10 }} />
    {qs.map((q, i) => <QuestionCard key={q.id} q={q} n={i + 1} count={qs.length} flagged={flagged === i}
      onChange={nq => setQs(qs.map((x, k) => k === i ? nq : x))} onMove={d => move(i, d)}
      onRemove={() => setQs(qs.filter((_, k) => k !== i))} />)}
    {!qs.length && <div className="card small muted" style={{ marginBottom: 10 }}>{ct('No questions yet.')}</div>}
    <Button icon="plus" onClick={() => setQs([...qs, newQuestion()])} disabled={qs.length >= 150}>{ct('Add question')}</Button>
  </>
}

function SignEditor({ body, onChange }) {
  const mode = 'file' in body ? 'pdf' : 'text'
  return <>
    <Segmented value={mode} onChange={m => onChange(m === 'pdf' ? { file: null, text: '' } : { text: body.text || '' })}
      options={[{ value: 'text', label: ct('Paste text') }, { value: 'pdf', label: ct('Upload a PDF') }]} />
    <div style={{ height: 10 }} />
    {mode === 'text'
      ? <TextArea rows={14} placeholder={ct('Paste the document here. It is kept exactly as written.')} aria-label={ct('Document text')} value={body.text || ''} onChange={e => onChange({ text: e.target.value })} />
      : <PdfField file={body.file} onChange={file => onChange({ file })} label={ct('Upload the PDF')} />}
  </>
}

function PdfReturnEditor({ body, onChange }) {
  return <>
    <PdfField file={body.file} onChange={file => onChange({ ...body, file })} label={ct('Upload the PDF clients fill in')} />
    <div style={{ height: 10 }} />
    <TextArea rows={3} placeholder={ct('Instructions for the client (optional)')} aria-label={ct('Instructions')} maxLength={2000} value={body.instructions || ''} onChange={e => onChange({ ...body, instructions: e.target.value })} />
  </>
}

/* ---------- the page ---------- */

export default function DocumentEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [doc, setDoc] = useState(null)
  const [work, setWork] = useState(null)      // { title, body } being edited
  const [saved, setSaved] = useState('idle')  // idle | saving | saved | failed
  const [failed, setFailed] = useState('')
  const [flagged, setFlagged] = useState(null)
  const timer = useRef(null)
  const pending = useRef(null)
  const inPacket = useRef(false)

  const adopt = d => {
    setDoc(d); inPacket.current = d.inPacket
    const v = d.draft || d.published
    setWork({ title: v?.title || d.title, body: v?.body || {} })
  }
  const load = useCallback(async () => {
    try { adopt(await getDocument(id)); setFailed('') } catch (e) { setFailed(coachingError(e)) }
  }, [id])
  useEffect(() => { load() }, [load])

  const save = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null
    const w = pending.current
    if (!w) return
    pending.current = null
    setSaved('saving')
    try {
      const draft = await saveDraft(id, w)
      setDoc(d => d && { ...d, draft, hasDraft: true, title: draft.title })
      setSaved(pending.current ? 'saving' : 'saved')
    } catch (e) { pending.current = pending.current || w; setSaved('failed'); toast(coachingError(e)) }
  }, [id, toast])
  // Leaving the page saves what is still waiting.
  useEffect(() => () => { if (pending.current) save() }, [save])

  const edit = patch => {
    setWork(w => { const next = { ...w, ...patch }; pending.current = next; return next })
    setFlagged(null)
    clearTimeout(timer.current)
    timer.current = setTimeout(save, SAVE_MS)
  }

  if (failed) return <div className="narrow"><div className="card small" role="alert">{failed}</div></div>
  if (!doc || !work) return <div className="narrow" />

  const published = doc.version != null
  const nextVersion = (doc.version || 0) + 1
  const statusLine = saved === 'saving' ? ct('Saving…') : saved === 'failed' ? ct('Not saved. Check your connection.') : doc.hasDraft
    ? ct('Draft of version {0} · saved', nextVersion) : ct('Version {0} · published {1}', doc.version, fmtDay(doc.published?.published || Date.now()))

  const publish = async () => {
    await save()
    useUI.getState().openSheet(close => <PublishSheet doc={doc} version={nextVersion} close={close}
      onDone={r => { adopt(r.document); coachingChanged(); toast(r.asked ? ct('Version {0} published. {1} clients asked to do it.', r.version, r.asked) : ct('Version {0} published', r.version)) }}
      onProblem={e => { if (e?.data?.index != null) setFlagged(e.data.index) }} />)
  }
  const preview = () => useUI.getState().openSheet(close => <PreviewSheet kind={doc.kind} title={work.title} body={work.body} close={close} />)
  const togglePacket = async on => {
    try {
      const all = await listDocuments()
      const ids = all.filter(d => d.inPacket && d.id !== doc.id).map(d => d.id)
      const next = await setPacket(on ? [...ids, doc.id] : ids)
      const me = next.find(d => d.id === doc.id)
      inPacket.current = !!me?.inPacket
      setDoc(d => ({ ...d, inPacket: !!me?.inPacket }))
      coachingChanged()
    } catch (e) { toast(coachingError(e)) }
  }
  const discard = () => confirmSheet({
    title: ct('Discard this draft?'), message: ct('Version {0} stays as it is.', doc.version), confirmText: ct('Discard draft'), danger: true,
    onConfirm: async () => { try { pending.current = null; clearTimeout(timer.current); adopt(await discardDraft(doc.id)); setSaved('idle') } catch (e) { toast(coachingError(e)) } },
  })
  const remove = () => confirmSheet({
    title: ct('Delete {0}?', doc.title), message: ct('It was never published, so no client has seen it.'), confirmText: ct('Delete'), danger: true,
    onConfirm: async () => { try { pending.current = null; clearTimeout(timer.current); await deleteDocument(doc.id); coachingChanged(); nav('/documents', { replace: true }) } catch (e) { toast(coachingError(e)) } },
  })
  const send = () => useUI.getState().openSheet(close => <SendSheet doc={doc} close={close} onSent={r => toast(ct('Sent to {0} clients', r.sent))} />)

  const Editor = doc.kind === 'form' ? FormEditor : doc.kind === 'sign' ? SignEditor : PdfReturnEditor

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/documents" onClick={async () => { await save(); nav('/documents') }} aria-label={ct('Documents')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12, minWidth: 0 }}>
        <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{work.title || doc.title}</h1>
        <div className="small muted" aria-live="polite">{statusLine}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={preview}>{ct('Preview')}</Button>
    </div>
    <div className="muted small" style={{ marginBottom: 8 }}>{KIND_LABEL[doc.kind]()}{doc.version == null && <> · <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{ct('DRAFT')}</span> {ct('Not shown to clients until you publish it.')}</>}</div>
    <TextField placeholder={ct('Title')} aria-label={ct('Title')} maxLength={120} value={work.title} onChange={e => edit({ title: e.target.value })} />
    <div style={{ height: 10 }} />
    <Editor body={work.body} onChange={body => edit({ body })} flagged={flagged} />
    <div style={{ height: 14 }} />
    {doc.hasDraft && <Button variant="primary" onClick={publish}>{ct('Publish version {0}', nextVersion)}</Button>}

    <Section>
      <Row title={ct('In the sign-up packet')} subtitle={ct('New clients complete it when they join.')}>
        <Switch checked={!!doc.inPacket} onChange={togglePacket} aria-label={ct('In the sign-up packet')} />
      </Row>
      {published && <Row icon="share" iconTint="var(--acc)" title={ct('Send to clients')} subtitle={doc.open ? ct('{0} clients have it to do', doc.open) : null} accessory="chevron" onClick={send} />}
      {published && doc.hasDraft && <Row icon="undo" title={ct('Discard draft')} onClick={discard} />}
      {!published && <Row icon="trash" title={ct('Delete document')} danger onClick={remove} />}
    </Section>
    <Section title={ct('Versions')} footer={ct('You confirmed you wrote this document or may use it on {0}.', fmtDay(doc.rightsConfirmed))}>
      {doc.versions.length ? doc.versions.map(v => <Row key={v.version} title={ct('Version {0}', v.version)} value={fmtDay(v.published)} />)
        : <Row title={ct('Not published yet')} />}
    </Section>
  </div>
}
