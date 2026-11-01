// trainer-fork: the sheets of a library document (Phase 2d): Publish (with "ask current clients
// to sign the new version"), Send to clients, and Preview, which shows roughly what a client
// will see. The client's own screens, with signing, come in 2e.
import { useEffect, useState } from 'react'
import { Button, Switch, Check } from './ui.jsx'
import Icon from './Icon.jsx'
import { ct, publishDocument, documentRecipients, sendDocument, publishError, coachingError, coachingChanged, fileUrl, questionTypeLabel } from '../lib/coaching.js'

const point = (icon, text) => <div className="row" style={{ gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
  <span style={{ color: 'var(--acc)', flex: 'none' }}><Icon name={icon} /></span><span className="small">{text}</span>
</div>

export function PublishSheet({ doc, version, close, onDone, onProblem }) {
  const asked = doc.completedEarlier || 0
  const [ask, setAsk] = useState(asked > 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try { const r = await publishDocument(doc.id, ask && asked > 0); close(); onDone?.(r) }
    catch (e) { setErr(publishError(e)); onProblem?.(e); setBusy(false) }
  }
  return <>
    <h3 style={{ marginBottom: 4 }}>{ct('Publish version {0}?', version)}</h3>
    <div className="muted small" style={{ marginBottom: 6 }}>{doc.title}</div>
    <div className="card" style={{ paddingTop: 2 }}>
      {point('person', version === 1 ? ct('Clients can be asked for it from now on.') : ct('New clients get version {0}.', version))}
      {point('lock', version === 1 ? ct('It cannot be changed after this, only replaced by a new version.') : ct('Version {0} and everything done on it stay as they are.', version - 1))}
    </div>
    {asked > 0 && <div className="card row" style={{ gap: 10, marginTop: 10 }}>
      <div className="grow" style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{ct('Ask current clients to do version {0}', version)}</div>
        <div className="small muted">{ct('{0} clients did an earlier version. It goes on their home as a to-do.', asked)}</div></div>
      <Switch checked={ask} onChange={setAsk} aria-label={ct('Ask current clients to do version {0}', version)} />
    </div>}
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}><Icon name="warning" /> {err}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{ask && asked > 0 ? ct('Publish and ask {0} clients', asked) : ct('Publish')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{ct('Cancel')}</Button>
  </>
}

const isoDay = d => d.toISOString().slice(0, 10)

export function SendSheet({ doc, close, onSent }) {
  const [list, setList] = useState(null)
  const [chosen, setChosen] = useState(new Set())
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    documentRecipients(doc.id).then(r => {
      setList(r)
      setChosen(new Set(r.clients.filter(c => c.state === 'none' || c.state === 'done_earlier').map(c => c.id)))
    }, e => setErr(coachingError(e)))
  }, [doc.id])
  const open = (list?.clients || []).filter(c => c.state === 'none' || c.state === 'done_earlier')
  const all = open.length > 0 && open.every(c => chosen.has(c.id))
  const toggle = (id, on) => setChosen(s => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n })
  const why = c => c.state === 'done' ? ct('Already did version {0}', list.version) : c.state === 'open' ? ct('Already has it to do')
    : c.state === 'done_earlier' ? ct('Did an earlier version') : c.paused ? ct('Paused. Sees it when coaching resumes.') : null
  const go = async () => {
    if (!chosen.size) { setErr(ct('Choose at least one client.')); return }
    setBusy(true); setErr('')
    try {
      // The due date is the end of that day, where the trainer is.
      const at = due ? new Date(due + 'T23:59:59').getTime() : null
      const r = await sendDocument(doc.id, [...chosen], at)
      coachingChanged(); close(); onSent?.(r)
    } catch (e) { setErr(coachingError(e)); setBusy(false) }
  }
  return <>
    <h3 style={{ marginBottom: 4 }}>{ct('Send {0}', doc.title)}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{ct('Version {0}. It goes on their home as a to-do. Training is never blocked while it is open.', doc.version)}</div>
    {!list && !err && <div className="small muted">{ct('Loading…')}</div>}
    {list && !list.clients.length && <div className="card small muted">{ct('You have no clients yet.')}</div>}
    {list && list.clients.length > 0 && <div className="card" style={{ padding: 0 }}>
      {open.length > 1 && <div className="row" style={{ gap: 10, padding: '10px 12px', borderBottom: '0.5px solid var(--sep)' }}>
        <Check checked={all} onChange={v => setChosen(v ? new Set(open.map(c => c.id)) : new Set())} label={ct('All clients')} />
        <span style={{ fontWeight: 600 }}>{ct('All clients')}</span>
      </div>}
      {list.clients.map(c => {
        const can = c.state === 'none' || c.state === 'done_earlier'
        return <div key={c.id} className="row" style={{ gap: 10, padding: '10px 12px', opacity: can ? 1 : 0.55 }}>
          {can ? <Check checked={chosen.has(c.id)} onChange={v => toggle(c.id, v)} label={c.name} /> : <span style={{ width: 22 }} />}
          <div className="grow" style={{ flex: 1 }}><div>{c.name}</div>{why(c) && <div className="small muted">{why(c)}</div>}</div>
        </div>
      })}
    </div>}
    <label className="row" style={{ gap: 10, marginTop: 10 }}>
      <span className="grow small">{ct('Due by (optional)')}</span>
      <input className="input" type="date" min={isoDay(new Date())} value={due} onChange={e => setDue(e.target.value)} style={{ width: 'auto' }} aria-label={ct('Due by')} />
    </label>
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}><Icon name="warning" /> {err}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go} disabled={busy || !list}>{chosen.size === 1 ? ct('Send to 1 client') : ct('Send to {0} clients', chosen.size)}</Button>
  </>
}

/* What the client will see, without signing or saving anything. */
function previewAnswer(q) {
  const box = { border: '0.5px solid var(--sep)', borderRadius: 10, padding: '8px 10px', marginTop: 6, color: 'var(--grey)' }
  if (q.type === 'yes_no') return <div className="row" style={{ gap: 8, marginTop: 6 }}><span className="chip nocap">{ct('Yes')}</span><span className="chip nocap">{ct('No')}</span></div>
  if (q.type === 'choice') return <div style={{ marginTop: 6 }}>{(q.options || []).filter(Boolean).map((o, i) => <div key={i} className="small" style={{ padding: '3px 0' }}>{q.multi ? '☐' : '○'} {o}</div>)}</div>
  if (q.type === 'signature') return <div style={{ ...box, height: 70 }} className="small">{ct('Signature')}</div>
  return <div style={{ ...box, minHeight: q.type === 'long_text' ? 60 : 0 }} className="small">{questionTypeLabel(q.type)}</div>
}

export function PreviewSheet({ kind, title, body, close }) {
  return <>
    <div className="small muted" style={{ marginBottom: 4 }}>{ct('Preview. Nothing is saved.')}</div>
    <h3 style={{ marginBottom: 10 }}>{title}</h3>
    {kind === 'sign' && (body.file
      ? <a className="card small" style={{ display: 'block' }} href={fileUrl(body.file.hash)} target="_blank" rel="noreferrer">{body.file.name}</a>
      : <div className="card small" style={{ whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto' }}>{body.text || ct('No text yet.')}</div>)}
    {kind === 'sign' && <div className="muted small" style={{ marginTop: 10 }}>{ct('Then: “I’ve read and agree”, their full name and a finger signature.')}</div>}
    {kind === 'pdf_return' && <>
      {body.instructions && <div className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{body.instructions}</div>}
      {body.file ? <a className="card small" style={{ display: 'block' }} href={fileUrl(body.file.hash)} target="_blank" rel="noreferrer">{body.file.name}</a> : <div className="card small muted">{ct('No PDF yet.')}</div>}
      <div className="muted small" style={{ marginTop: 10 }}>{ct('Then they upload the filled-in PDF.')}</div>
    </>}
    {kind === 'form' && <>
      {body.intro && <div className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{body.intro}</div>}
      {(body.questions || []).map((q, i) => <div key={q.id} className="card" style={{ marginBottom: 8 }}>
        <div className="small">{i + 1}. {q.text || <span className="muted">{ct('No wording yet')}</span>}{q.required === false && <span className="muted"> {ct('(optional)')}</span>}</div>
        {previewAnswer(q)}
        {q.type === 'yes_no' && q.followUp && <div className="small muted" style={{ marginTop: 6 }}>{ct('If yes: {0}', q.followUp.text)}</div>}
        {q.type === 'yes_no' && q.flagYes && <div className="small" style={{ marginTop: 6, color: 'var(--orange)' }}>{ct('After a yes: your trainer will see this before your first session.')}</div>}
      </div>)}
    </>}
    <div style={{ height: 8 }} />
    <Button onClick={close}>{ct('Close preview')}</Button>
  </>
}
