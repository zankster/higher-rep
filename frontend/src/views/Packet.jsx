// trainer-fork: the client's sign-up packet and later documents, #/packet (Phase 2e). Runs what
// is open in order (the packet first), one step per document, with "Save and finish later":
// every step is saved as it is done. A client under 18 then names a parent or guardian, who signs
// on this phone or by an emailed link. Ends on "You're all set" or "Almost there".
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { StepBar, AboutYou, TooYoung, FormStep, SignStep, ReturnStep, GuardianDetails } from '../components/PacketSteps.jsx'
import { ct, myDocuments, saveAbout, submitRequest, saveGuardian, coachingError, submitError, coachingChanged, MIN_AGE } from '../lib/coaching.js'

function Shell({ children, onBack }) {
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={onBack} aria-label={ct('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1 }} />
    </div>
    {children}
  </div>
}

const Tick = ({ ok, wait }) => <span style={{ color: ok ? 'var(--green)' : wait ? 'var(--orange)' : 'var(--grey)', flex: 'none' }}><Icon name={ok ? 'check' : wait ? 'clock' : 'dot'} /></span>

/** The end of the packet: what is done and, for a client under 18, the guardian still to sign. */
export function Finish({ data, onGuardianHere, onResend, onDone, email }) {
  const trainer = data.trainer.name
  const g = data.guardian
  const waitingGuardian = data.waiting.length > 0
  const all = [...data.done.slice(0, 6).reverse().map(d => ({ key: 'd' + d.id, title: d.title, ok: true, note: d.kind === 'sign' ? ct('signed') : null })),
    ...data.waiting.map(w => ({ key: 'w' + w.id, title: w.title, ok: true, note: ct('you signed') })),
    ...(waitingGuardian ? [{ key: 'g', title: ct('{0}’s signature', g?.name || ct('Your guardian')), wait: true, note: g?.linkSent ? ct('link sent') : ct('waiting') }] : [])]
  return <div>
    <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
      <div style={{ fontSize: 32, display: 'flex', justifyContent: 'center', color: data.cleared ? 'var(--green)' : 'var(--orange)' }}><Icon name={data.cleared ? 'checkCircle' : 'clock'} /></div>
      <h2 style={{ margin: '8px 0 0' }}>{data.cleared ? ct('You’re all set') : ct('Almost there')}</h2>
    </div>
    {all.length > 0 && <div className="card">
      {all.map((r, i) => <div key={r.key} className="row" style={{ gap: 10, marginTop: i ? 8 : 0 }}>
        <Tick ok={r.ok} wait={r.wait} /><span style={{ flex: 1 }}>{r.title}</span>{r.note && <span className="small muted">{r.note}</span>}
      </div>)}
    </div>}
    <div className="small muted" style={{ margin: '4px 2px 0' }}>
      {data.cleared ? (email ? ct('A copy of what you signed is on its way to {0}. Everything is in Settings › My documents.', email) : ct('Everything you signed is in Settings › My documents.'))
        : data.state === 'todo' ? ct('Some documents {0} needs before your first session are still to do.', trainer)
        : ct('Training with {0} starts once {1} signs.', trainer, g?.name || ct('your parent or guardian'))}
    </div>
    {waitingGuardian && <>
      <div style={{ height: 12 }} />
      <Button onClick={onGuardianHere}>{ct('{0}’s here: sign on this phone', g?.name || ct('My guardian'))}</Button>
      {g?.email && <><div style={{ height: 8 }} /><Button onClick={onResend}>{ct('Send the link again')}</Button></>}
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={onDone}>{data.cleared ? ct('Start training') : ct('Go to Home')}</Button>
  </div>
}

export default function Packet() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const user = useStore(s => s.user)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState('')
  const [young, setYoung] = useState(false)
  const [steps, setSteps] = useState(null)   // the to-dos when the packet opened, in order
  const [at, setAt] = useState(0)
  const [mode, setMode] = useState('steps')  // steps | guardian | guardianHere | finish
  const [busy, setBusy] = useState(false)
  const [aboutErr, setAboutErr] = useState('')

  const start = d => {
    setData(d)
    setSteps(d.todo)
    setAt(0)
    setMode(d.todo.length ? 'steps' : d.minor && d.waiting.length && !d.guardian ? 'guardian' : 'finish')
  }
  useEffect(() => { myDocuments().then(start, e => setFailed(coachingError(e))) }, [])
  const home = () => { coachingChanged(); nav('/home', { replace: true }) }

  if (failed) return <Shell onBack={home}><div className="card small" role="alert">{failed}</div></Shell>
  if (!data) return <Shell onBack={home} />
  if (young) return <Shell onBack={home}><TooYoung onClose={home} /></Shell>

  // A client from before dates of birth were asked.
  if (!data.about) {
    const next = async (dob, age) => {
      if (age < MIN_AGE) { setYoung(true); return }
      setBusy(true); setAboutErr('')
      try { start(await saveAbout(dob)) } catch (e) { setAboutErr(submitError(e)) } finally { setBusy(false) }
    }
    return <Shell onBack={home}><AboutYou trainerName={data.trainer.name} onNext={next} busy={busy} error={aboutErr} /></Shell>
  }

  const trainer = data.trainer.name
  // After the last step: a client under 18 with something waiting names the guardian first.
  const afterSteps = d => setMode(d.minor && d.waiting.length && !d.guardian ? 'guardian' : 'finish')
  const done = d => {
    setData(d)
    if (at + 1 < steps.length) { setAt(at + 1); window.scrollTo?.(0, 0) } else afterSteps(d)
  }

  if (mode === 'steps' && steps[at]) {
    const step = steps[at]
    const submit = async fields => done(await submitRequest(step.id, fields))
    const skip = () => { if (at + 1 < steps.length) setAt(at + 1); else afterSteps(data) }
    return <Shell onBack={home}>
      <StepBar at={at + 1} of={steps.length} from={trainer} onLater={home} />
      {step.kind === 'form' && <FormStep key={step.id} step={step} trainerName={trainer} onSubmit={submit} />}
      {step.kind === 'sign' && <SignStep key={step.id} step={step} onSubmit={submit} />}
      {step.kind === 'pdf_return' && <ReturnStep key={step.id} step={step} onSubmit={submit} />}
      {!step.required && <button className="small muted" onClick={skip} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 0 }}>{ct('Skip for now')}</button>}
    </Shell>
  }

  if (mode === 'guardian') {
    const here = async g => { setData(await saveGuardian({ ...g, send: false })); setMode('guardianHere') }
    const email = async g => {
      const r = await saveGuardian({ ...g, send: true })
      setData(r)
      toast(r.emailed ? ct('Link emailed to {0}', g.name) : ct('The email could not be sent. Try again in a moment.'))
      setMode('finish')
    }
    return <Shell onBack={home}><GuardianDetails age={data.age} trainerName={trainer} guardian={data.guardian} onHere={here} onEmail={email} /></Shell>
  }

  if (mode === 'guardianHere' && data.waiting[0]) {
    const item = data.waiting[0]
    const submit = async fields => {
      const d = await submitRequest(item.id, { ...fields, signer: 'guardian' })
      setData(d)
      if (!d.waiting.length) setMode('finish')
    }
    return <Shell onBack={home}>
      <div className="card small" style={{ marginBottom: 12 }}><Icon name="person" /> {ct('Hand the phone to {0}.', data.guardian?.name)}</div>
      <SignStep key={'g' + item.id} step={item} asGuardian clientName={user?.name} defaultName={data.guardian?.name || ''} onSubmit={submit} />
    </Shell>
  }

  const resend = async () => {
    try {
      const g = data.guardian
      const r = await saveGuardian({ name: g.name, email: g.email, relationship: g.relationship, send: true })
      setData(r); toast(r.emailed ? ct('Link emailed to {0}', g.name) : ct('The email could not be sent. Try again in a moment.'))
    } catch (e) { toast(submitError(e)) }
  }
  return <Shell onBack={home}>
    <Finish data={data} email={user?.email} onDone={home} onResend={resend}
      onGuardianHere={() => data.guardian ? setMode('guardianHere') : setMode('guardian')} />
  </Shell>
}
