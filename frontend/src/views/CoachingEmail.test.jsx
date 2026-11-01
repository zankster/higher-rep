// @vitest-environment happy-dom
// trainer-fork: the email parts of Phase 2c in the app: the invite sheet says it emailed, the
// roster offers "Email again", Forgot password, and the page the reset email opens.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  listClients: vi.fn(), listInvites: vi.fn(), newInvite: vi.fn(), renewInvite: vi.fn(), emailInvite: vi.fn(), forgotPassword: vi.fn(),
  redeem: vi.fn(), signedIn: vi.fn(),
}))
vi.mock('../lib/coaching.js', async real => {
  const { redeem, signedIn, ...mine } = calls
  return { ...(await real()), ...mine }
})
vi.mock('../lib/api.js', async real => ({ ...(await real()), passwordResetRedeem: (...a) => calls.redeem(...a) }))
vi.mock('../components/PasswordAuth.jsx', async real => ({ ...(await real()), signedIn: (...a) => calls.signedIn(...a) }))

import Clients from './Clients.jsx'
import ResetPassword from './ResetPassword.jsx'
import { InviteSheet } from '../components/InviteSheet.jsx'
import { ForgotPasswordSheet } from '../components/ForgotPassword.jsx'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { resetLinkCode } from '../lib/coaching.js'

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
const submit = async host => act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })

const NOW = Date.now()
const sam = { id: 5, firstName: 'Sam', email: 'sam@example.com', status: 'pending', created: NOW, expires: NOW + 14 * 86400000, opened: null, code: 'AAAA', url: 'http://x/#/join/AAAA' }
const toast = vi.fn()

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  bindUI(useUI)
  toast.mockReset()
  useUI.setState({ sheets: [], toast })
  for (const f of Object.values(calls)) f.mockReset()
  calls.listClients.mockResolvedValue([])
  calls.listInvites.mockResolvedValue([sam])
})
afterEach(() => {
  for (const [root, host] of mounted.splice(0)) { act(() => root.unmount()); host.remove() }
})

describe('invite email', () => {
  it('with an address the button sends, and the sheet says it was emailed', async () => {
    calls.newInvite.mockResolvedValue({ ...sam, emailed: true })
    const host = await render(<InviteSheet close={() => {}} />)
    type(host.querySelector('input[aria-label="First name"]'), 'Sam')
    expect(button(host, 'Create invite')).toBeTruthy()
    type(host.querySelector('input[aria-label="Email"]'), 'sam@example.com')
    await click(button(host, 'Send invite'))
    expect(host.textContent).toContain('Emailed to sam@example.com.')
    expect(host.textContent).toContain('You can also send it yourself.')
  })
  it('a failed email says so, and the link is still there', async () => {
    calls.newInvite.mockResolvedValue({ ...sam, emailed: false })
    const host = await render(<InviteSheet close={() => {}} />)
    type(host.querySelector('input[aria-label="First name"]'), 'Sam')
    await click(button(host, 'Create invite'))
    expect(host.querySelector('[role="alert"]').textContent).toContain('The email could not be sent.')
    expect(host.querySelector('[data-testid="invite-url"]').textContent).toBe(sam.url)
  })
  it('the roster emails an invite again, and Send new emails the fresh link', async () => {
    calls.emailInvite.mockResolvedValue({ ok: true })
    calls.renewInvite.mockResolvedValue({ ...sam, id: 6, emailed: true })
    const host = await render(<Clients />)
    const open = async () => { await click([...host.querySelectorAll('button.lrow')].find(b => b.textContent.includes('Sam'))); return topSheet() }
    await click([...(await open()).querySelectorAll('.menu-item')].find(el => el.textContent.includes('Email again')))
    expect(calls.emailInvite).toHaveBeenCalledWith(5)
    expect(toast).toHaveBeenCalledWith('Invite emailed to Sam')
    await click([...(await open()).querySelectorAll('.menu-item')].find(el => el.textContent.includes('Send new invite')))
    expect(calls.renewInvite).toHaveBeenCalledWith(5)
    expect(toast).toHaveBeenCalledWith('New invite emailed to Sam')
  })
})

describe('forgot password', () => {
  it('needs an address, then gives the same answer whatever the server knows', async () => {
    calls.forgotPassword.mockResolvedValue({ ok: true })
    const host = await render(<ForgotPasswordSheet close={() => {}} />)
    await submit(host)
    expect(host.textContent).toContain('Enter the email on your account.')
    expect(calls.forgotPassword).not.toHaveBeenCalled()
    type(host.querySelector('input[type="email"]'), 'ava@example.com')
    await submit(host)
    expect(calls.forgotPassword).toHaveBeenCalledWith('ava@example.com')
    expect(host.textContent).toContain('If an account uses ava@example.com, a link to choose a new password is on its way.')
  })
})

describe('reset page', () => {
  it('reads the code from the link', () => {
    expect(resetLinkCode('/reset/abcd-efgh-jkmn')).toBe('ABCD-EFGH-JKMN')
    expect(resetLinkCode('/join/ABCD1234')).toBeNull()
    expect(resetLinkCode('/reset/x')).toBeNull()
  })
  it('sets the password with the email and the code, then signs in', async () => {
    calls.redeem.mockResolvedValue({ id: 'u_ava', name: 'Ava' })
    const host = await render(<ResetPassword code="ABCD-EFGH-JKMN" />)
    const [email, next, again] = host.querySelectorAll('input')
    type(email, 'ava@example.com'); type(next, 'a long new password'); type(again, 'a long new passwor')
    await submit(host)
    expect(host.textContent).toContain('The two passwords are not the same.')
    type(again, 'a long new password')
    await submit(host)
    expect(calls.redeem).toHaveBeenCalledWith('ava@example.com', 'ABCD-EFGH-JKMN', 'a long new password')
    expect(calls.signedIn).toHaveBeenCalledWith({ id: 'u_ava', name: 'Ava' }, expect.any(Function))
  })
  it('a used or old link offers a new one', async () => {
    calls.redeem.mockRejectedValue(Object.assign(new Error('x'), { status: 400, data: { code: 'reset-invalid' } }))
    const host = await render(<ResetPassword code="ABCD-EFGH-JKMN" />)
    const [email, next, again] = host.querySelectorAll('input')
    type(email, 'ava@example.com'); type(next, 'a long new password'); type(again, 'a long new password')
    await submit(host)
    expect(host.textContent).toContain('This link has expired or was already used')
    expect(button(host, 'Send a new link')).toBeTruthy()
  })
})
