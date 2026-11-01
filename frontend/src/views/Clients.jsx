// trainer-fork: the trainer's roster (Phase 2b). Clients with a live link, the open invites, and
// per invite the actions the approved mock-up shows: copy, share, revoke or send new. Tapping a
// client opens their profile (Phase 2f, views/ClientProfile.jsx), which holds pause and remove;
// warning tags show beside the name. The "Needs attention" and "Unread" chips come with programs
// and chat (Phases 4 and 5).
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { Section, Row, SearchField, Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { menuSheet } from '../sheets.jsx'
import { openInviteSheet, copyInvite, shareInvite } from '../components/InviteSheet.jsx'
import {
  ct, listClients, listInvites, revokeInvite, renewInvite, emailInvite,
  coachingError, inviteLine, sinceLine, rosterFilter, coachingChanged, onCoachingChanged, paperworkLine,
} from '../lib/coaching.js'

export const removeMessage = name => <div style={{ textAlign: 'start' }}>
  <p>{ct('You lose access to {0}’s workouts, progress and chat.', name)}</p>
  <p style={{ marginTop: 8 }}>{ct('{0} keeps their account and their own data.', name)}</p>
  <p style={{ marginTop: 8 }}>{ct('Their signed documents stay in your records.')}</p>
</div>

export default function Clients() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [clients, setClients] = useState(null)
  const [invites, setInvites] = useState([])
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    try { const [c, i] = await Promise.all([listClients(), listInvites()]); setClients(c); setInvites(i); setFailed('') }
    catch (e) { setFailed(coachingError(e)) }
  }, [])
  useEffect(() => { load(); return onCoachingChanged(load) }, [load])

  // Through the event, not load(): see coachingChanged in lib/coaching.js.
  const act = fn => async () => { try { await fn() } catch (e) { toast(coachingError(e)) } finally { coachingChanged() } }

  // A fresh link goes out by email when the invite has an address, else through the share sheet.
  const sendNew = inv => act(async () => {
    const fresh = await renewInvite(inv.id)
    if (fresh.emailed) toast(ct('New invite emailed to {0}', inv.firstName))
    else await shareInvite(fresh)
  })

  const inviteMenu = inv => menuSheet({
    title: inv.firstName, subtitle: inviteLine(inv),
    items: inv.status === 'expired' ? [
      { icon: 'repeat', label: ct('Send new invite'), onClick: sendNew(inv) },
    ] : [
      ...(inv.email ? [{ icon: 'envelope', label: ct('Email again'), sub: inv.email, onClick: act(async () => { await emailInvite(inv.id); toast(ct('Invite emailed to {0}', inv.firstName)) }) }] : []),
      { icon: 'copy', label: ct('Copy link'), onClick: () => copyInvite(inv) },
      { icon: 'share', label: ct('Share link'), onClick: () => shareInvite(inv) },
      { icon: 'repeat', label: ct('Send new invite'), sub: ct('The old link stops working.'), onClick: sendNew(inv) },
      { icon: 'xmark', label: ct('Revoke invite'), danger: true, onClick: act(async () => { await revokeInvite(inv.id); toast(ct('Invite revoked')) }) },
    ],
  })

  const all = clients || []
  const shown = rosterFilter(all, filter, q)
  const paused = all.filter(c => c.status === 'paused').length
  const chip = (id, label) => <button key={id} className={'chip nocap' + (filter === id ? ' on' : '')} onClick={() => setFilter(id)}>{label}</button>

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={ct('Settings')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{ct('Clients')}</h1></div>
      <button className="iconbtn" onClick={() => openInviteSheet()} aria-label={ct('Invite a client')}><Icon name="plus" /></button>
    </div>
    {failed && <div className="card small" role="alert">{failed}</div>}
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={ct('Search clients')} aria-label={ct('Search clients')} />
    <div className="chips" style={{ margin: '10px 0' }}>
      {chip('all', ct('All {0}', all.length))}
      {chip('paused', ct('Paused {0}', paused))}
      {chip('invited', ct('Invited {0}', invites.length))}
    </div>

    {filter !== 'invited' && <Section>
      {clients && !shown.length && <Row title={all.length ? ct('No client matches') : ct('No clients yet')} subtitle={all.length ? null : ct('Invite your first client with the button below.')} />}
      {shown.map(c => <Row key={c.id} title={<>{c.name}{(c.warnings || []).map(w => <span key={w} className="tag nocap" style={{ marginInlineStart: 6, background: 'rgba(255, 149, 0, 0.2)', color: 'var(--label)', fontSize: 12, verticalAlign: 'middle' }}><Icon name="warning" style={{ color: 'var(--orange)' }} /> {w}</span>)}</>}
        subtitle={(c.age != null ? c.age + ' · ' : '') + sinceLine(c.since)}
        value={c.status === 'paused' ? ct('Paused') : paperworkLine(c) && <span style={{ color: c.cleared ? 'var(--label-2)' : 'var(--orange)' }}>{paperworkLine(c)}</span>}
        icon="person" iconTint="var(--acc)" accessory="chevron" onClick={() => nav('/clients/' + encodeURIComponent(c.id))} />)}
    </Section>}

    {(filter === 'invited' || (filter === 'all' && invites.length > 0)) && <Section title={ct('Invites')}>
      {!invites.length && <Row title={ct('No open invites')} />}
      {invites.map(inv => <Row key={inv.id} title={inv.firstName} subtitle={inviteLine(inv)}
        value={inv.status === 'expired' ? ct('Send new') : null} icon="envelope" iconTint="var(--grey)" accessory="chevron" onClick={() => inviteMenu(inv)} />)}
    </Section>}

    <Button variant="primary" icon="plus" onClick={() => openInviteSheet()}>{ct('Invite a client')}</Button>
  </div>
}
