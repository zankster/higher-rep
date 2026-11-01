// trainer-fork: the guardian's page, #/guardian/<token> (Phase 2e). Opened from the emailed link,
// no account needed: the token is the secret. Shows the client's answers so the guardian knows
// what they agree to, then each document left to sign. The link works once, for 7 days.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { SignStep } from '../components/PacketSteps.jsx'
import { ct, guardianPage, guardianSign, guardianFileUrl } from '../lib/coaching.js'

const lapsed = code => code === 'used' ? ct('This link was already used. Everything on it is signed.')
  : code === 'expired' ? ct('This link has expired. Ask for a new one from the app.')
  : code === 'revoked' ? ct('This link is no longer valid.')
  : ct('This link is not valid. Check the link in the email.')

export default function GuardianSign({ token }) {
  const [page, setPage] = useState(undefined)   // undefined: loading
  const [failed, setFailed] = useState('')
  const [open, setOpen] = useState(null)
  const [finished, setFinished] = useState(false)
  const load = () => guardianPage(token).then(setPage, e => setFailed(lapsed(e?.data?.code)))
  useEffect(() => { load() }, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <div className="narrow"><div className="card" role="alert" style={{ marginTop: 40, textAlign: 'center' }}>{failed}</div></div>
  if (!page) return <div className="narrow" />
  const client = page.client.name, trainer = page.trainer.name
  if (finished || !page.sign.length) return <div className="narrow" style={{ textAlign: 'center', paddingTop: 40 }}>
    <div style={{ fontSize: 32, color: 'var(--green)', display: 'flex', justifyContent: 'center' }}><Icon name="checkCircle" /></div>
    <h2 style={{ margin: '10px 0 6px' }}>{ct('Thank you, {0}', page.guardian.name)}</h2>
    <div className="muted">{ct('Everything for {0}’s training with {1} is signed. A copy is on its way to your email.', client, trainer)}</div>
  </div>

  const item = page.sign[0]
  const submit = async fields => {
    const r = await guardianSign(token, item.id, fields)
    if (!r.left) setFinished(true)
    else await load()
  }
  return <div className="narrow">
    <div className="small muted" style={{ marginTop: 20 }}>{ct('No account needed')}</div>
    <h1 style={{ fontSize: 24, margin: '4px 0 12px' }}>{ct('Sign for {0}’s training with {1}', client, trainer)}</h1>
    {page.read.length > 0 && <div className="card" style={{ marginBottom: 12 }}>
      <div className="small muted" style={{ marginBottom: 6 }}>{ct('{0}’s answers, so you know what you’re agreeing to', client)}</div>
      {page.read.map(f => <div key={f.id} style={{ marginTop: 6 }}>
        <button className="row" onClick={() => setOpen(open === f.id ? null : f.id)} style={{ gap: 8, width: '100%', background: 'none', border: 0, padding: 0, textAlign: 'start', color: 'inherit' }}>
          <span style={{ color: 'var(--green)' }}><Icon name="checkCircle" /></span>
          <span style={{ flex: 1 }}>{f.title}{f.items.some(i => i.flagged) && <span className="small" style={{ color: 'var(--orange)' }}> · {ct('{0} yes', f.items.filter(i => i.flagged).length)}</span>}</span>
          <span className="small" style={{ color: 'var(--acc)' }}>{open === f.id ? ct('Hide') : ct('Read')}</span>
        </button>
        {open === f.id && <div style={{ margin: '6px 0 0 26px' }}>{f.items.map((i, n) => <div key={n} className="small" style={{ marginTop: 6 }}>
          <div className="muted">{i.q}</div><div style={{ color: i.flagged ? 'var(--orange)' : 'inherit' }}>{i.a}</div>
        </div>)}</div>}
      </div>)}
    </div>}
    {page.sign.length > 1 && <div className="small muted" style={{ marginBottom: 6 }}>{ct('{0} documents to sign', page.sign.length)}</div>}
    <SignStep key={item.id} step={item} asGuardian clientName={client} defaultName={page.guardian.name}
      fileUrl={hash => guardianFileUrl(token, hash)} onSubmit={submit} />
    <div className="small muted" style={{ marginTop: 12 }}>{ct('The link works once, until {0}.', new Date(page.expires).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }))}</div>
  </div>
}
