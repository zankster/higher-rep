// @vitest-environment happy-dom
// trainer-fork: the roster, the invite sheet, the join page and end coaching (Phase 2b), with the
// coaching calls mocked. The permissions behind them are the api's tests (api/test/coaching-*).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  listClients: vi.fn(), listInvites: vi.fn(), newInvite: vi.fn(), pauseClient: vi.fn(), removeClient: vi.fn(),
  revokeInvite: vi.fn(), renewInvite: vi.fn(), invitePage: vi.fn(), acceptInvite: vi.fn(), endCoaching: vi.fn(), coachingMe: vi.fn(),
}))
vi.mock('../lib/coaching.js', async real => ({ ...(await real()), ...calls }))

import Clients from './Clients.jsx'
import JoinInvite from './JoinInvite.jsx'
import Coaching from './Coaching.jsx'
import { InviteSheet } from '../components/InviteSheet.jsx'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { markAutoAccept, coachingChanged } from '../lib/coaching.js'

const mounted = []
async function render(node) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  await act(async () => root.render(<MemoryRouter>{node}</MemoryRouter>))
  await act(async () => {})
  return host
}
async function topSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return render(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const click = async el => act(async () => { el.click() })
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

const NOW = Date.now()
const ava = { id: 'u_ava', name: 'Ava Reyes', status: 'active', since: NOW - 90 * 86400000 }
const pia = { id: 'u_pia', name: 'Priya Kaur', status: 'paused', since: NOW - 30 * 86400000 }
const leo = { id: 7, firstName: 'Leo', status: 'pending', created: NOW - 2 * 86400000, expires: NOW + 12 * 86400000, opened: null, code: 'AAAA', url: 'http://x/#/join/AAAA' }
const nia = { id: 8, firstName: 'Nia', status: 'expired', created: NOW - 20 * 86400000, expires: NOW - 6 * 86400000, opened: NOW - 19 * 86400000 }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  bindUI(useUI)
  useUI.setState({ sheets: [], toast: vi.fn() })
  for (const f of Object.values(calls)) f.mockReset()
  calls.listClients.mockResolvedValue([ava, pia])
  calls.listInvites.mockResolvedValue([leo, nia])
  sessionStorage.clear()
})
afterEach(() => {
  for (const [root, host] of mounted.splice(0)) { act(() => root.unmount()); host.remove() }
})

describe('Clients', () => {
  it('lists clients and invites, and the chips filter them', async () => {
    const host = await render(<Clients />)
    const text = host.textContent
    expect(text).toContain('Ava Reyes')
    expect(text).toContain('Priya Kaur')
    expect(text).toContain('Sent 2 days ago · Not opened')
    expect(text).toMatch(/Expired /)
    expect(button(host, 'All 2')).toBeTruthy()
    await click(button(host, 'Paused 1'))
    expect(host.textContent).not.toContain('Ava Reyes')
    expect(host.textContent).toContain('Priya Kaur')
    expect(host.textContent).not.toContain('Leo')
    await click(button(host, 'Invited 2'))
    expect(host.textContent).not.toContain('Priya Kaur')
    expect(host.textContent).toContain('Leo')
  })

  it('reloads when a sheet announces a change, even one opened by an earlier mount', async () => {
    const host = await render(<Clients />)
    expect(host.textContent).toContain('Invited 2')
    calls.listInvites.mockResolvedValue([leo, nia, { ...leo, id: 10, firstName: 'Zoe' }])
    await act(async () => { coachingChanged() })
    expect(host.textContent).toContain('Invited 3')
    expect(host.textContent).toContain('Zoe')
  })

  it('pauses a client from the row menu', async () => {
    calls.pauseClient.mockResolvedValue({ ...ava, status: 'paused' })
    const host = await render(<Clients />)
    await click([...host.querySelectorAll('button.lrow')].find(b => b.textContent.includes('Ava Reyes')))
    const menu = await topSheet()
    await click([...menu.querySelectorAll('.menu-item')].find(el => el.textContent.includes('Pause coaching')))
    expect(calls.pauseClient).toHaveBeenCalledWith('u_ava', true)
    expect(calls.listClients).toHaveBeenCalledTimes(2)
  })

  it('removes a client only after the confirm', async () => {
    calls.removeClient.mockResolvedValue({ ok: true })
    const host = await render(<Clients />)
    await click([...host.querySelectorAll('button.lrow')].find(b => b.textContent.includes('Ava Reyes')))
    await click([...(await topSheet()).querySelectorAll('.menu-item')].find(el => el.textContent.includes('Remove client')))
    expect(calls.removeClient).not.toHaveBeenCalled()
    const confirm = await topSheet()
    expect(confirm.textContent).toContain('keeps their account and their own data')
    await click(button(confirm, 'Remove Ava Reyes'))
    expect(calls.removeClient).toHaveBeenCalledWith('u_ava')
  })

  it('an expired invite offers only Send new', async () => {
    calls.renewInvite.mockResolvedValue({ ...leo, id: 9 })
    const host = await render(<Clients />)
    await click([...host.querySelectorAll('button.lrow')].find(b => b.textContent.includes('Nia')))
    const items = [...(await topSheet()).querySelectorAll('.menu-item')].map(el => el.textContent)
    expect(items).toEqual(['Send new invite'])
  })
})

describe('InviteSheet', () => {
  it('needs a first name, then shows the link to send', async () => {
    calls.newInvite.mockResolvedValue({ ...leo, firstName: 'Ava', url: 'http://x/#/join/BBBB' })
    const created = vi.fn()
    const host = await render(<InviteSheet close={() => {}} onCreated={created} />)
    await click(button(host, 'Create invite'))
    expect(host.textContent).toContain('Enter a first name')
    expect(calls.newInvite).not.toHaveBeenCalled()
    type(host.querySelector('input[aria-label="First name"]'), 'Ava')
    await click(button(host, 'Create invite'))
    expect(calls.newInvite).toHaveBeenCalledWith({ firstName: 'Ava', email: '', note: '' })
    expect(created).toHaveBeenCalled()
    expect(host.querySelector('[data-testid="invite-url"]').textContent).toBe('http://x/#/join/BBBB')
  })
})

describe('JoinInvite', () => {
  const page = { status: 'valid', trainer: { name: 'Mike' }, firstName: 'Ava', note: 'See you Monday', expires: NOW + 86400000 }
  // "When were you born?" comes first (Phase 2e).
  async function born(host, day, month, year) {
    type(host.querySelector('input[aria-label="Day"]'), day)
    await click(host.querySelector('button[aria-label="Month"]'))
    await click([...(await topSheet()).querySelectorAll('.menu-item')].find(el => el.textContent.includes(month)))
    type(host.querySelector('input[aria-label="Year"]'), year)
    await click(button(host, 'Next'))
  }
  it('under 13: stops before any account, and keeps nothing', async () => {
    calls.invitePage.mockResolvedValue(page)
    const host = await render(<JoinInvite code="ABCD1234" />)
    expect(host.textContent).toContain('When were you born?')
    await born(host, '31', 'February', '2010')
    expect(host.textContent).toContain('Check the date of birth.')
    await born(host, '1', 'January', String(new Date().getFullYear() - 10))
    expect(host.textContent).toContain('You need to be 13 or older')
    expect(button(host, 'Create account')).toBeUndefined()
    expect(sessionStorage.getItem('hr_join_dob')).toBeNull()
    expect(calls.acceptInvite).not.toHaveBeenCalled()
  })
  it('signed out: names the trainer, shows the note, offers sign-up', async () => {
    calls.invitePage.mockResolvedValue(page)
    const host = await render(<JoinInvite code="ABCD1234" />)
    await born(host, '12', 'March', '1990')
    expect(host.textContent).toContain('Mike invited you to train with them')
    expect(host.textContent).toContain('See you Monday')
    await click(button(host, 'Create account'))
    expect(useUI.getState().sheets.length).toBe(1)
    expect(sessionStorage.getItem('hr_join_auto')).toBe('ABCD1234')
    expect(sessionStorage.getItem('hr_join_dob')).toBe('1990-03-12')
  })
  it('an expired invite says whom to ask', async () => {
    calls.invitePage.mockResolvedValue({ status: 'expired', trainer: { name: 'Mike' } })
    const host = await render(<JoinInvite code="ABCD1234" />)
    expect(host.textContent).toContain('This invite has expired. Ask Mike for a new one.')
    expect(button(host, 'Create account')).toBeUndefined()
  })
  it('signed in with an existing account: joins only on a tap', async () => {
    calls.invitePage.mockResolvedValue(page)
    calls.acceptInvite.mockResolvedValue({ ok: true, trainer: { id: 'u_mike', name: 'Mike' } })
    const host = await render(<JoinInvite code="ABCD1234" signedIn />)
    await born(host, '12', 'March', '1990')
    expect(calls.acceptInvite).not.toHaveBeenCalled()
    await click(button(host, 'Join Mike'))
    expect(calls.acceptInvite).toHaveBeenCalledWith('ABCD1234', '1990-03-12')
  })
  it('right after signing up from the page: joins without a second tap', async () => {
    calls.invitePage.mockResolvedValue(page)
    calls.acceptInvite.mockResolvedValue({ ok: true, trainer: { id: 'u_mike', name: 'Mike' } })
    markAutoAccept('ABCD1234')
    sessionStorage.setItem('hr_join_dob', '1990-03-12')
    await render(<JoinInvite code="ABCD1234" signedIn />)
    expect(calls.acceptInvite).toHaveBeenCalledWith('ABCD1234', '1990-03-12')
  })
})

describe('Coaching (client)', () => {
  it('ends coaching only from the confirm sheet', async () => {
    calls.coachingMe.mockResolvedValue({ trainer: false, coach: { id: 'u_mike', name: 'Mike', status: 'active', since: NOW } })
    calls.endCoaching.mockResolvedValue({ ok: true })
    const host = await render(<Coaching />)
    expect(host.textContent).toContain('Mike')
    await click([...host.querySelectorAll('button.lrow')].find(b => b.textContent === 'End coaching'))
    const sheet = await topSheet()
    expect(sheet.textContent).toContain('Mike can no longer see your workouts, progress or messages.')
    expect(calls.endCoaching).not.toHaveBeenCalled()
    await click(button(sheet, 'End coaching'))
    expect(calls.endCoaching).toHaveBeenCalled()
  })
})
