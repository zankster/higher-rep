// trainer-fork: the screens of the client's sign-up packet (Phase 2e): about you (date of birth),
// the under-13 stop, and one step per kind of document (form, sign, PDF to return), plus the
// parent or guardian. views/Packet.jsx runs them in order; views/GuardianSign.jsx reuses SignStep.
import { useRef, useState } from 'react'
import { Button, TextField, TextArea, Check } from './ui.jsx'
import Icon from './Icon.jsx'
import SignaturePad from './SignaturePad.jsx'
import { menuSheet } from '../sheets.jsx'
import { ct, dobFrom, ageFrom, MIN_AGE, submitError, myFileUrl, uploadMine, MAX_PDF_MB } from '../lib/coaching.js'

const MONTHS = () => [ct('January'), ct('February'), ct('March'), ct('April'), ct('May'), ct('June'), ct('July'), ct('August'), ct('September'), ct('October'), ct('November'), ct('December')]
const errLine = err => err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}><Icon name="warning" /> {err}</div>

/** The step bar: "Step 2 of 4 · from Mike", "Save and finish later", the dashes. */
export function StepBar({ at, of, from, onLater }) {
  return <div style={{ margin: '8px 0 12px' }}>
    <div className="row small muted" style={{ justifyContent: 'space-between', gap: 8 }}>
      <span>{ct('Step {0} of {1} · from {2}', at, of, from)}</span>
      {onLater && <button className="small" onClick={onLater} style={{ color: 'var(--acc)', background: 'none', border: 0, padding: 0 }}>{ct('Save and finish later')}</button>}
    </div>
    <div style={{ display: 'flex', gap: 4, marginTop: 6 }} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < at ? 'var(--acc)' : 'var(--sep)' }} />)}
    </div>
  </div>
}

/* ---------- about you ---------- */

export function AboutYou({ trainerName, onNext, busy, error, invited = true }) {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState(null)
  const [year, setYear] = useState('')
  const [err, setErr] = useState('')
  const pickMonth = () => menuSheet({
    title: ct('Month'),
    items: MONTHS().map((label, i) => ({ label, onClick: () => { setMonth(i + 1); setErr('') } })),
  })
  const next = () => {
    const dob = dobFrom(day, month, year)
    if (!dob) { setErr(ct('Check the date of birth.')); return }
    onNext(dob, ageFrom(dob))
  }
  return <div>
    {trainerName && invited && <div className="small muted">{ct('{0} invited you', trainerName)}</div>}
    <h2 style={{ margin: '6px 0 12px' }}>{ct('When were you born?')}</h2>
    <div className="row" style={{ gap: 8 }}>
      <TextField style={{ flex: 1 }} inputMode="numeric" maxLength={2} placeholder={ct('Day')} aria-label={ct('Day')} value={day} onChange={e => { setDay(e.target.value.replace(/\D/g, '')); setErr('') }} />
      <button className="field" style={{ flex: 2, textAlign: 'start', color: month ? 'var(--label)' : 'var(--label-3)' }} onClick={pickMonth} aria-label={ct('Month')}>{month ? MONTHS()[month - 1] : ct('Month')}</button>
      <TextField style={{ flex: 1.4 }} inputMode="numeric" maxLength={4} placeholder={ct('Year')} aria-label={ct('Year')} value={year} onChange={e => { setYear(e.target.value.replace(/\D/g, '')); setErr('') }} />
    </div>
    <div className="small muted" style={{ marginTop: 10 }}>
      {trainerName ? ct('{0} keeps your date of birth on your coaching record. If you’re under 18, a parent or guardian signs too.', trainerName)
        : ct('Your trainer keeps your date of birth on your coaching record. If you’re under 18, a parent or guardian signs too.')}
    </div>
    {errLine(err || error)}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={next} disabled={busy}>{ct('Next')}</Button>
  </div>
}

/** Under 13. Nothing typed was kept; the trainer is not told. */
export function TooYoung({ onClose }) {
  return <div style={{ textAlign: 'center', padding: '28px 6px' }}>
    <div style={{ fontSize: 30, color: 'var(--grey)', display: 'flex', justifyContent: 'center' }}><Icon name="lock" /></div>
    <h2 style={{ margin: '10px 0 6px' }}>{ct('You need to be {0} or older', MIN_AGE)}</h2>
    <div className="muted">{ct('Higher Rep is for people {0} and up. Nothing you typed was saved, not even your date of birth.', MIN_AGE)}</div>
    {onClose && <><div style={{ height: 16 }} /><Button onClick={onClose}>{ct('Close')}</Button></>}
  </div>
}

/* ---------- a form ---------- */

// Inputs and chips share the card's colour, so inside a card they take the next surface up.
const IN = { background: 'var(--surface-2)' }
const chipStyle = on => on ? null : IN

function Answer({ q, value, onChange }) {
  if (q.type === 'yes_no') {
    return <>
      <div className="row" style={{ gap: 8 }} role="radiogroup" aria-label={q.text}>
        {[[true, ct('Yes')], [false, ct('No')]].map(([yes, label]) => <button key={label} role="radio" aria-checked={value?.yes === yes}
          className={'chip nocap' + (value?.yes === yes ? ' on' : '')} style={{ flex: 1, justifyContent: 'center', ...chipStyle(value?.yes === yes) }} onClick={() => onChange({ ...(value || {}), yes })}>{label}</button>)}
      </div>
      {value?.yes && q.followUp && <div style={{ marginTop: 10 }}>
        <div className="small">{q.followUp.text}</div>
        {q.followUp.type === 'short_text'
          ? <TextField style={{ marginTop: 4, ...IN }} aria-label={q.followUp.text} value={value.followUp || ''} onChange={e => onChange({ ...value, followUp: e.target.value })} />
          : <TextArea style={{ marginTop: 4, ...IN }} rows={3} aria-label={q.followUp.text} value={value.followUp || ''} onChange={e => onChange({ ...value, followUp: e.target.value })} />}
      </div>}
    </>
  }
  if (q.type === 'choice') {
    const picked = q.multi ? (value || []) : value
    const on = o => q.multi ? picked.includes(o) : picked === o
    const toggle = o => onChange(q.multi ? (on(o) ? picked.filter(x => x !== o) : [...picked, o]) : o)
    return <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
      {q.options.map(o => <button key={o} className={'chip nocap' + (on(o) ? ' on' : '')} style={chipStyle(on(o))} aria-pressed={on(o)} onClick={() => toggle(o)}>{o}</button>)}
    </div>
  }
  if (q.type === 'long_text') return <TextArea style={IN} rows={3} aria-label={q.text} value={value || ''} onChange={e => onChange(e.target.value)} />
  if (q.type === 'number') return <TextField style={IN} inputMode="decimal" aria-label={q.text} value={value ?? ''} onChange={e => onChange(e.target.value.replace(',', '.'))} />
  if (q.type === 'date') return <input className="field" style={IN} type="date" aria-label={q.text} value={value || ''} onChange={e => onChange(e.target.value)} />
  if (q.type === 'signature') return <SignaturePad label={q.text} onChange={onChange} />
  return <TextField style={IN} aria-label={q.text} value={value || ''} onChange={e => onChange(e.target.value)} />
}

export function FormStep({ step, trainerName, onSubmit }) {
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bad, setBad] = useState(null)
  const body = step.body || {}
  const go = async () => {
    setBusy(true); setErr(''); setBad(null)
    try { await onSubmit({ answers }) }
    catch (e) {
      setErr(submitError(e)); setBad(e?.data?.index ?? null); setBusy(false)
      const el = e?.data?.index != null && document.querySelector(`[data-answer="${e.data.index}"]`)
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }
  }
  return <div>
    <h2 style={{ margin: '0 0 8px' }}>{step.title}</h2>
    {body.intro && <div className="small muted" style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{body.intro}</div>}
    {(body.questions || []).map((q, i) => {
      const v = answers[q.id]
      return <div key={q.id} className="card" data-answer={i} style={{ marginBottom: 10, outline: bad === i ? '2px solid var(--red)' : 'none', outlineOffset: -2 }}>
        <div style={{ marginBottom: 8 }}>{i + 1}. {q.text}{q.required === false && <span className="muted small"> {ct('(optional)')}</span>}</div>
        <Answer q={q} value={v} onChange={nv => { setAnswers(a => ({ ...a, [q.id]: nv })); if (bad === i) { setBad(null); setErr('') } }} />
        {q.type === 'yes_no' && q.flagYes && v?.yes && <div className="small" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'color-mix(in srgb, var(--orange) 14%, transparent)', color: 'var(--orange)' }}>
          <Icon name="info" /> {ct('{0} will see this before your first session.', trainerName)}
        </div>}
      </div>
    })}
    {errLine(err)}
    <div style={{ height: 6 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{ct('Next')}</Button>
  </div>
}

/* ---------- a document to sign ---------- */

/** Read, "I've read and agree", full name, finger signature. `asGuardian` words it for the guardian. */
export function SignStep({ step, onSubmit, defaultName = '', asGuardian, clientName, fileUrl = myFileUrl }) {
  const [agreed, setAgreed] = useState(false)
  const [name, setName] = useState(defaultName)
  const [signature, setSignature] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const body = step.body || {}
  const go = async () => {
    if (!agreed) { setErr(ct('Tick the box to say you have read it and agree.')); return }
    if (name.trim().length < 2) { setErr(ct('Type your full name.')); return }
    if (!signature) { setErr(ct('Sign with your finger in the box.')); return }
    setBusy(true); setErr('')
    try { await onSubmit({ agreed: true, name: name.trim(), signature }) }
    catch (e) { setErr(submitError(e)); setBusy(false) }
  }
  const agreeText = asGuardian ? ct('I’ve read it and agree, as {0}’s parent or guardian', clientName) : ct('I’ve read the {0} and agree', step.title.toLowerCase())
  return <div>
    <h2 style={{ margin: '0 0 8px' }}>{step.title}</h2>
    {body.file
      ? <a className="card row" style={{ gap: 10 }} href={fileUrl(body.file.hash)} target="_blank" rel="noreferrer">
          <span style={{ color: 'var(--acc)' }}><Icon name="clipboard" /></span><span className="grow" style={{ flex: 1, wordBreak: 'break-all' }}>{body.file.name}</span><span className="small" style={{ color: 'var(--acc)' }}>{ct('Open')}</span>
        </a>
      : <div className="card small" style={{ whiteSpace: 'pre-wrap', maxHeight: open ? 'none' : 160, overflow: 'hidden', position: 'relative' }}>
          {body.text}
          {!open && <button className="small" onClick={() => setOpen(true)} style={{ position: 'absolute', right: 0, bottom: 0, left: 0, padding: '24px 12px 8px', textAlign: 'end', border: 0, color: 'var(--acc)', background: 'linear-gradient(transparent, var(--surface) 60%)' }}>{ct('Read all')}</button>}
        </div>}
    <div className="row" style={{ gap: 10, alignItems: 'flex-start', margin: '12px 0 10px' }}>
      <Check checked={agreed} onChange={v => { setAgreed(v); setErr('') }} label={agreeText} />
      <span onClick={() => { setAgreed(a => !a); setErr('') }}>{agreeText}</span>
    </div>
    <TextField placeholder={ct('Full name')} aria-label={ct('Full name')} autoComplete="name" maxLength={120} value={name} onChange={e => { setName(e.target.value); setErr('') }} />
    <div style={{ height: 10 }} />
    <SignaturePad onChange={s => { setSignature(s); setErr('') }} />
    {errLine(err)}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{ct('Sign')}</Button>
  </div>
}

/* ---------- a PDF to fill and return ---------- */

/** A photo as a JPEG no larger than 2000 px on its long side. */
async function photoJpeg(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url })
    const s = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82))
  } finally { URL.revokeObjectURL(url) }
}

export function ReturnStep({ step, onSubmit }) {
  const [pages, setPages] = useState([])   // { blob, url } photos, in order
  const [pdf, setPdf] = useState(null)     // a File
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const photoInput = useRef(null), pdfInput = useRef(null)
  const body = step.body || {}
  const addPhotos = async files => {
    setErr(''); setPdf(null)
    try {
      const add = []
      for (const f of files) { const blob = await photoJpeg(f); if (blob) add.push({ blob, url: URL.createObjectURL(blob) }) }
      setPages(p => [...p, ...add].slice(0, 30))
    } catch { setErr(ct('That photo could not be read. Try another one.')) }
  }
  const pickPdf = f => {
    if (!f) return
    if (f.size > MAX_PDF_MB * 1024 * 1024) { setErr(ct('That file is larger than {0} MB.', MAX_PDF_MB)); return }
    setErr(''); setPages([]); setPdf(f)
  }
  const go = async () => {
    if (!pdf && !pages.length) { setErr(ct('Add the filled-in PDF or a photo of each page.')); return }
    setBusy(true); setErr('')
    try {
      const files = pdf ? [(await uploadMine(pdf, 'application/pdf')).hash]
        : await Promise.all(pages.map(async p => (await uploadMine(p.blob, 'image/jpeg')).hash))
      await onSubmit({ files })
    } catch (e) { setErr(submitError(e)); setBusy(false) }
  }
  return <div>
    <h2 style={{ margin: '0 0 6px' }}>{step.title}</h2>
    <div className="small muted" style={{ marginBottom: 10, whiteSpace: 'pre-wrap' }}>{body.instructions || ct('Print it or fill it in on your phone, then add it here.')}</div>
    {body.file && <a className="card row" style={{ gap: 10 }} href={myFileUrl(body.file.hash)} target="_blank" rel="noreferrer">
      <span style={{ color: 'var(--acc)' }}><Icon name="download" /></span><span style={{ flex: 1, wordBreak: 'break-all' }}>{body.file.name}</span><span className="small" style={{ color: 'var(--acc)' }}>{ct('Download')}</span>
    </a>}
    {pages.length > 0 && <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {pages.map((p, i) => <div key={p.url} style={{ position: 'relative' }}>
        <img src={p.url} alt={ct('Page {0}', i + 1)} style={{ width: 64, height: 84, objectFit: 'cover', borderRadius: 6, border: '0.5px solid var(--sep)' }} />
        <button aria-label={ct('Remove page {0}', i + 1)} onClick={() => setPages(ps => ps.filter((_, j) => j !== i))}
          style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 0, background: 'var(--grey)', color: '#fff', fontSize: 11 }}><Icon name="xmark" /></button>
      </div>)}
    </div>}
    {pdf && <div className="card row small" style={{ gap: 10, marginTop: 12 }}><Icon name="clipboard" /><span style={{ flex: 1, wordBreak: 'break-all' }}>{pdf.name}</span>
      <button className="small" onClick={() => setPdf(null)} style={{ color: 'var(--acc)', background: 'none', border: 0 }}>{ct('Remove')}</button></div>}
    <div className="row" style={{ gap: 8, marginTop: 12 }}>
      <Button icon="camera" onClick={() => photoInput.current?.click()} style={{ flex: 1 }}>{pages.length ? ct('Add a page') : ct('Take photo')}</Button>
      <Button icon="clipboard" onClick={() => pdfInput.current?.click()} style={{ flex: 1 }}>{ct('Upload PDF')}</Button>
    </div>
    <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple hidden onChange={e => { addPhotos([...e.target.files]); e.target.value = '' }} />
    <input ref={pdfInput} type="file" accept="application/pdf" hidden onChange={e => { pickPdf(e.target.files[0]); e.target.value = '' }} />
    <div className="small muted" style={{ marginTop: 8 }}>{ct('Photos are joined into one PDF, in this order.')}</div>
    {errLine(err)}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{busy ? ct('Uploading…') : ct('Next')}</Button>
  </div>
}

/* ---------- the parent or guardian ---------- */

const RELATIONSHIPS = () => [ct('Parent'), ct('Legal guardian')]

export function GuardianDetails({ age, trainerName, guardian, onHere, onEmail }) {
  const [name, setName] = useState(guardian?.name || '')
  const [email, setEmail] = useState(guardian?.email || '')
  const [rel, setRel] = useState(guardian?.relationship || RELATIONSHIPS()[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (fn, needEmail) => {
    if (name.trim().length < 2) { setErr(ct('Type their full name.')); return }
    if (needEmail && !email.trim()) { setErr(ct('Type their email to send the link.')); return }
    setBusy(true); setErr('')
    try { await fn({ name: name.trim(), email: email.trim(), relationship: rel }) }
    catch (e) { setErr(submitError(e)); setBusy(false) }
  }
  return <div>
    <h2 style={{ margin: '0 0 6px' }}>{ct('A parent or guardian signs next')}</h2>
    <div className="small muted" style={{ marginBottom: 10 }}>{ct('Because you’re {0}, a parent or guardian signs {1}’s documents too.', age, trainerName)}</div>
    <TextField placeholder={ct('Their full name')} aria-label={ct('Their full name')} value={name} onChange={e => { setName(e.target.value); setErr('') }} />
    <div style={{ height: 8 }} />
    <TextField type="email" inputMode="email" placeholder={ct('Their email')} aria-label={ct('Their email')} value={email} onChange={e => { setEmail(e.target.value); setErr('') }} />
    <div className="chips" style={{ margin: '8px 0 0' }}>
      {RELATIONSHIPS().map(r => <button key={r} className={'chip nocap' + (rel === r ? ' on' : '')} aria-pressed={rel === r} onClick={() => setRel(r)}>{r}</button>)}
    </div>
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{ct('Your guardian can')}</div>
      <div className="small muted">{ct('Sign {0}’s documents for you, and read your messages with {0}. Progress photos stay off until you’re 18.', trainerName)}</div>
    </div>
    {errLine(err)}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={() => run(onHere)} disabled={busy}>{ct('They’re here: sign on this phone')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={() => run(onEmail, true)} disabled={busy}>{ct('Email them a link')}</Button>
  </div>
}
