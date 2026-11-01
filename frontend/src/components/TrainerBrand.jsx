// trainer-fork: how a trainer looks to clients (Phase 2g). The mark is their logo, or their
// initials on their accent colour; the accent is used only here, on the invite page, the emails
// and the client's trainer card. The rest of the app keeps Higher Rep's own blue.
import { ct, initials, logoUrl, COACH_BLUE } from '../lib/coaching.js'

/* The logo, square with rounded corners, or the initials on the accent. */
export function TrainerMark({ logo, accent, name, size = 56, src }) {
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.24), flex: 'none' }
  const url = src || logoUrl(logo)
  if (url) return <img src={url} alt="" aria-hidden="true" style={{ ...box, objectFit: 'cover', display: 'block' }} />
  return <div aria-hidden="true" style={{ ...box, background: accent || COACH_BLUE, color: '#fff', display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.36), fontWeight: 600 }}>{initials(name)}</div>
}

/* A primary button in the trainer's colour: only the buttons inside take it. */
export const InAccent = ({ accent, children }) => <div style={accent ? { '--acc': accent, '--on-acc': '#fff' } : null}>{children}</div>

/* Whether a trainer has made anything their own, so an unbranded invite keeps Higher Rep's look. */
export const isBranded = tr => !!(tr && (tr.business || tr.logo || (tr.accent && tr.accent.toUpperCase() !== COACH_BLUE)))

/* The top of the invite page: the business, the mark, and who invited you. */
export function InviteHeader({ trainer, title }) {
  const name = trainer.business || trainer.name
  return <div style={{ textAlign: 'center' }}>
    <div style={{ display: 'flex', justifyContent: 'center' }}><TrainerMark logo={trainer.logo} src={trainer.logoSrc} accent={trainer.accent} name={name} size={64} /></div>
    {trainer.business && <div style={{ fontWeight: 600, fontSize: 17, marginTop: 10 }}>{trainer.business}</div>}
    {trainer.tagline && <div className="small muted" style={{ marginTop: 2 }}>{trainer.tagline}</div>}
    <h1 style={{ fontSize: 24, margin: '14px 0 4px' }}>{title}</h1>
    <div className="small muted">{ct('on Higher Rep')}</div>
  </div>
}
