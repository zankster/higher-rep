// trainer-fork: Settings › Branding, for a trainer (Phase 2g, #/branding). Logo, business name,
// tagline, the email "from" name, one of six accent colours and the contact details clients see
// in Settings › Coaching. Saved as you type: text after a pause, addresses when the field is left.
// Preview shows the invite page and the invite email; "Use the Higher Rep look" clears the logo
// and the colour. The phone number is given out client by client, on each client's profile.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { confirmSheet } from '../sheets.jsx'
import { TrainerMark, InviteHeader, InAccent } from '../components/TrainerBrand.jsx'
import {
  ct, getBranding, saveBranding, uploadLogo, brandingError, coachingError, coachingChanged, contrastLine, phoneShownLine,
  MAX_LOGO_MB, LOGO_TYPES,
} from '../lib/coaching.js'

const toast = s => useUI.getState().toast(s)
const problem = text => text && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 6 }}><Icon name="warning" /> {text}</div>
const PAD = { padding: '12px 14px' }

/* One field, saved on its own. `onLeave`: only when the field is left (an address half typed
   would not pass the server's check). A pending change is still saved if the screen closes. */
function Field({ k, label, value, placeholder, hint, onSaved, onLeave = false, maxLength = 60, type = 'text', inputMode, autoComplete = 'off' }) {
  const [text, setText] = useState(value || '')
  const [err, setErr] = useState('')
  const saved = useRef(value || '')
  const pending = useRef(null)
  const timer = useRef(0)
  const flush = async () => {
    clearTimeout(timer.current)
    const v = pending.current
    pending.current = null
    if (v === null || v === saved.current) return
    try {
      const r = await saveBranding({ [k]: v })
      saved.current = v; setErr(''); onSaved(r)
      return r
    } catch (e) { setErr(brandingError(e)) }
  }
  // Leaving the screen with a change still waiting: save it anyway.
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (pending.current !== null && pending.current !== saved.current) saveBranding({ [k]: pending.current }).then(coachingChanged, () => {})
  }, [k])
  const change = e => {
    setText(e.target.value); setErr('')
    pending.current = e.target.value
    clearTimeout(timer.current)
    if (!onLeave) timer.current = setTimeout(flush, 700)
  }
  // The server tidies what it stores ("smithstrength.com" gains https://): show that once left.
  const leave = async () => { const r = await flush(); if (r) setText(r.branding[k] || '') }
  const id = 'branding-' + k
  return <div style={{ marginTop: 10 }}>
    <label htmlFor={id} className="small" style={{ color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>{label}</label>
    <TextField id={id} value={text} placeholder={placeholder} maxLength={maxLength} type={type} inputMode={inputMode} autoComplete={autoComplete}
      onChange={change} onBlur={leave} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    {hint && !err && <div className="small muted" style={{ marginTop: 4 }}>{hint}</div>}
    {problem(err)}
  </div>
}

function Swatches({ swatches, value, onPick }) {
  return <div role="radiogroup" aria-label={ct('Accent colour')} className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
    {swatches.map(s => <button key={s.id} role="radio" aria-checked={s.id === value} aria-label={s.name} title={s.name} onClick={() => onPick(s.id)}
      style={{ width: 40, height: 40, borderRadius: '50%', background: s.hex, color: '#fff', border: 'none', padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer',
        boxShadow: s.id === value ? '0 0 0 2px var(--surface), 0 0 0 4px ' + s.hex : 'inset 0 0 0 1px rgba(127, 127, 127, 0.35)' }}>
      {s.id === value && <Icon name="check" />}
    </button>)}
  </div>
}

/* What clients see: the invite page, and the invite email in an inbox. */
export function BrandingPreview({ data, close }) {
  const b = data.branding
  const accent = (data.swatches.find(s => s.id === b.accent) || data.swatches[0]).hex
  const trainer = { name: data.name, business: b.business, tagline: b.tagline, logo: b.logo, accent }
  const title = b.business || data.name
  return <>
    <h3 style={{ marginBottom: 10 }}>{ct('Preview')}</h3>
    <div className="small muted" style={{ marginBottom: 6 }}>{ct('Invite page')}</div>
    <div className="card" style={{ padding: '20px 16px' }}>
      <InviteHeader trainer={trainer} title={ct('{0} invited you, {1}', data.name, 'Ava')} />
      <div style={{ height: 14 }} />
      <InAccent accent={accent}><Button variant="primary" onClick={() => {}} tabIndex={-1}>{ct('Join {0}', data.name)}</Button></InAccent>
    </div>
    <div className="small muted" style={{ margin: '14px 0 6px' }}>{ct('Invite email')}</div>
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="small" style={{ padding: '10px 14px', borderBottom: '1px solid var(--sep)' }}>
        <div><span className="muted">{ct('From:')}</span> {ct('{0} via Higher Rep', b.mailFrom || data.name)}</div>
        <div><span className="muted">{ct('Subject:')}</span> {ct('{0} invited you to train with them', data.name)}</div>
      </div>
      <div style={{ height: 4, background: accent }} />
      <div className="row" style={{ gap: 10, padding: '14px' }}>
        <TrainerMark logo={b.logo} accent={accent} name={title} size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div className="small muted">{b.tagline || (b.business ? data.name : ct('Personal training'))}</div>
        </div>
      </div>
      <div style={{ padding: '0 14px 16px' }}>
        <div className="small">{ct('Hi Ava, {0} invited you to Higher Rep.', data.name)}</div>
        <span style={{ display: 'inline-block', marginTop: 10, background: accent, color: '#fff', borderRadius: 10, padding: '8px 16px', fontWeight: 600, fontSize: 14 }}>{ct('Accept invite')}</span>
      </div>
    </div>
    <div style={{ height: 14 }} />
    <Button onClick={close}>{ct('Close')}</Button>
  </>
}

export default function Branding() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState('')
  const [logoErr, setLogoErr] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef(null)
  useEffect(() => { getBranding().then(setData, e => setFailed(coachingError(e))) }, [])
  // Settings' own row shows the business name: tell it when the save lands.
  const onSaved = r => { setData(r); coachingChanged() }

  const back = <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
  const hdr = <div className="hdr">{back}<div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Branding')}</h1></div></div>
  if (!data) return <div className="narrow">{hdr}{failed ? <div className="card small" role="alert">{failed}</div> : <div className="small muted">{ct('Loading…')}</div>}</div>

  const b = data.branding
  const swatch = data.swatches.find(s => s.id === b.accent) || data.swatches[0]
  const pickLogo = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!LOGO_TYPES.includes(f.type)) { setLogoErr(ct('Use a PNG or JPEG image.')); return }
    if (f.size > MAX_LOGO_MB * 1024 * 1024) { setLogoErr(ct('The logo is larger than {0} MB.', MAX_LOGO_MB)); return }
    setBusy(true); setLogoErr('')
    try { onSaved(await uploadLogo(f)) } catch (err) { setLogoErr(brandingError(err)) } finally { setBusy(false) }
  }
  const set = async fields => { try { onSaved(await saveBranding(fields)) } catch (e) { toast(brandingError(e)) } }
  const reset = () => confirmSheet({
    title: ct('Use the Higher Rep look?'), message: ct('Your logo comes off and the colour goes back to Coach blue. Your names and contact details stay.'),
    confirmText: ct('Use the Higher Rep look'), onConfirm: () => set({ logo: null, accent: null }),
  })
  const preview = () => useUI.getState().openSheet(close => <BrandingPreview data={data} close={close} />)

  return <div className="narrow">
    {hdr}

    <Section title={ct('Logo')}>
      <div className="row" style={{ ...PAD, gap: 14 }}>
        <TrainerMark logo={b.logo} accent={swatch.hex} name={b.business || data.name} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small muted">{ct('Square PNG or JPEG, up to {0} MB.', MAX_LOGO_MB)}</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button size="sm" variant="tinted" onClick={() => file.current?.click()} disabled={busy}>{b.logo ? ct('Change') : ct('Add a logo')}</Button>
            {b.logo && <Button size="sm" variant="plain" onClick={() => set({ logo: null })} disabled={busy}>{ct('Remove')}</Button>}
          </div>
          {problem(logoErr)}
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={pickLogo} aria-label={ct('Logo')} />
      </div>
    </Section>

    <Section title={ct('Names')}>
      <div style={{ ...PAD, paddingTop: 2 }}>
        <Field k="business" label={ct('Business name')} value={b.business} placeholder={ct('Optional')} onSaved={onSaved}
          hint={b.business ? null : ct('Empty: clients see {0}.', data.name)} />
        <Field k="tagline" label={ct('Tagline')} value={b.tagline} placeholder={ct('Personal training')} onSaved={onSaved} />
        <Field k="mailFrom" label={ct('Email “from” name')} value={b.mailFrom} placeholder={data.name} onSaved={onSaved}
          hint={ct('Emails arrive from “{0} via Higher Rep”.', b.mailFrom || data.name)} />
      </div>
    </Section>

    <Section title={ct('Accent colour')} footer={ct('Used on your invite page, your emails and your card in your clients’ Settings.')}>
      <div style={PAD}>
        <Swatches swatches={data.swatches} value={b.accent} onPick={id => set({ accent: id })} />
        <div className="small" style={{ marginTop: 10 }}><b>{swatch.name}</b> · <span className="muted">{contrastLine(swatch.contrast)}</span></div>
      </div>
    </Section>

    <Section title={ct('Contact')} footer={ct('Clients see these in Settings › Coaching. Saved as you type.')}>
      <div style={{ ...PAD, paddingTop: 2 }}>
        <Field k="contactEmail" label={ct('Email')} value={b.contactEmail} placeholder={data.signInEmail || 'you@example.com'} onSaved={onSaved} onLeave
          type="email" inputMode="email" maxLength={254} hint={data.signInEmail && !b.contactEmail ? ct('Empty: clients see your sign-in email.') : null} />
        <Field k="phone" label={ct('Phone')} value={b.phone} placeholder="+1 555 010 2030" onSaved={onSaved} onLeave type="tel" inputMode="tel" maxLength={30}
          hint={b.phone ? phoneShownLine(data.phoneShown) + '. ' + ct('Turn it on for each client on their profile.') : ct('Only the clients you pick see it, on their profile.')} />
        <Field k="website" label={ct('Website (optional)')} value={b.website} placeholder="smithstrength.com" onSaved={onSaved} onLeave inputMode="url" maxLength={200} />
      </div>
    </Section>

    <Section>
      <Row icon="expand" iconTint="var(--acc)" title={ct('Preview')} subtitle={ct('Your invite page and email')} accessory="chevron" onClick={preview} />
      <Row icon="reset" iconTint="var(--grey)" title={ct('Use the Higher Rep look')} onClick={reset} />
    </Section>
  </div>
}
