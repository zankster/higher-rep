// @vitest-environment happy-dom
// trainer-fork: the Settings screens of Phase 2g with the coaching calls mocked: Branding (saved as
// you type, the colours, the preview, back to Higher Rep's look), New client defaults, the
// client's Coaching card and Privacy, the phone switch on the client profile, the branded invite
// page and the Settings rows. Who may call what is the api's tests (api/test/coaching-branding).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  getBranding: vi.fn(), saveBranding: vi.fn(), uploadLogo: vi.fn(), setDefaultPreset: vi.fn(), myTrainer: vi.fn(),
  clientProfile: vi.fn(), setShowPhone: vi.fn(), invitePage: vi.fn(), coachingMe: vi.fn(),
}))
vi.mock('../lib/coaching.js', async real => ({ ...(await real()), ...calls }))

import Branding from './Branding.jsx'
import ClientDefaults from './ClientDefaults.jsx'
import Coaching from './Coaching.jsx'
import CoachingPrivacy from './CoachingPrivacy.jsx'
import ClientProfile from './ClientProfile.jsx'
import JoinInvite from './JoinInvite.jsx'
import CoachingRow, { SourceCodeRow } from '../components/CoachingRow.jsx'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { phoneShownLine, telHref, websiteLabel, trainerCardLine, presetLabel, contrastLine } from '../lib/coaching.js'

const mounted = []
async function render(node, path = '/') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/clients/:id" element={node} /><Route path="*" element={node} /></Routes></MemoryRouter>))
  await act(async () => {})
  return host
}
async function topSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return render(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const rowWith = (host, text) => [...host.querySelectorAll('.lrow')].find(el => el.textContent.includes(text))
const click = async el => act(async () => { el.click() })
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const blur = async input => act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })

const SWATCHES = [
  { id: 'blue', name: 'Coach blue', hex: '#2457E6', contrast: 5.9 }, { id: 'green', name: 'Green', hex: '#1E7B34', contrast: 5.3 },
  { id: 'red', name: 'Red', hex: '#B3261E', contrast: 6.5 }, { id: 'violet', name: 'Violet', hex: '#6B3FD4', contrast: 6.4 },
  { id: 'teal', name: 'Teal', hex: '#0E6E78', contrast: 6 }, { id: 'graphite', name: 'Graphite', hex: '#3A3A3C', contrast: 11.3 },
]
const settings = (b = {}) => ({
  branding: { business: null, tagline: null, mailFrom: null, accent: 'blue', contactEmail: null, phone: null, website: null, logo: null, ...b },
  name: 'Mike Smith', signInEmail: 'mike@example.com', swatches: SWATCHES, phoneShown: { shown: 1, of: 3 }, preset: 'balanced',
})
const NOW = Date.now()

beforeEach(() => {
  bindUI(useUI)
  for (const f of Object.values(calls)) f.mockReset()
})
afterEach(async () => {
  vi.useRealTimers()
  for (const [root, host] of mounted.splice(0)) { await act(async () => root.unmount()); host.remove() }
  useUI.setState({ sheets: [] })
})

describe('the small rules', () => {
  it('words the phone count, the links and the card line', () => {
    expect(phoneShownLine({ shown: 2, of: 5 })).toBe('Shown to 2 of 5 clients')
    expect(phoneShownLine({ shown: 3, of: 3 })).toBe('Shown to all 3 clients')
    expect(phoneShownLine({ shown: 0, of: 1 })).toBe('Hidden from your client')
    expect(phoneShownLine({ shown: 0, of: 0 })).toBe('No clients yet')
    expect(telHref('+1 (555) 010-2030')).toBe('tel:+15550102030')
    expect(websiteLabel('https://smithstrength.com/')).toBe('smithstrength.com')
    expect(trainerCardLine({ business: 'Smith Strength', since: Date.UTC(2026, 2, 10) })).toMatch(/^Smith Strength · since /)
    expect(trainerCardLine({ business: null, since: NOW })).toMatch(/^Since /)
    expect(presetLabel('hands_on')).toBe('Hands-on')
    expect(presetLabel(undefined)).toBe('Balanced')
    expect(contrastLine(5.86)).toBe('White text reads clearly on it (5.9 : 1)')
  })
})

describe('Branding', () => {
  it('saves a name after a pause, and an address only once the field is left', async () => {
    calls.getBranding.mockResolvedValue(settings())
    calls.saveBranding.mockImplementation(async f => settings({ ...f, website: f.website ? 'https://smithstrength.com/' : null }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const host = await render(<Branding />)
    expect(host.textContent).toContain('Empty: clients see Mike Smith.')
    await type(host.querySelector('#branding-business'), 'Smith Strength')
    expect(calls.saveBranding).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(calls.saveBranding).toHaveBeenCalledWith({ business: 'Smith Strength' })

    const site = host.querySelector('#branding-website')
    await type(site, 'smithstrength.com')
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(calls.saveBranding).toHaveBeenCalledTimes(1)
    await blur(site)
    expect(calls.saveBranding).toHaveBeenLastCalledWith({ website: 'smithstrength.com' })
    expect(site.value).toBe('https://smithstrength.com/', 'shows what the server stored')
  })

  it('shows the server’s word on a bad address under the field', async () => {
    calls.getBranding.mockResolvedValue(settings())
    calls.saveBranding.mockRejectedValue(Object.assign(new Error('x'), { status: 400, data: { code: 'phone' } }))
    const host = await render(<Branding />)
    const phone = host.querySelector('#branding-phone')
    await type(phone, 'call me')
    await blur(phone)
    expect(host.textContent).toContain('That phone number does not look right')
  })

  it('picks a colour, previews it, and goes back to the Higher Rep look only after asking', async () => {
    calls.getBranding.mockResolvedValue(settings({ business: 'Smith Strength', phone: '+1 555 010 2030' }))
    calls.saveBranding.mockImplementation(async f => settings({ business: 'Smith Strength', ...f, accent: f.accent || 'blue' }))
    const host = await render(<Branding />)
    expect(host.textContent).toContain('Shown to 1 of 3 clients')
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(6)
    await click(host.querySelector('[aria-label="Green"]'))
    expect(calls.saveBranding).toHaveBeenCalledWith({ accent: 'green' })
    expect(host.querySelector('[aria-label="Green"]').getAttribute('aria-checked')).toBe('true')
    expect(host.textContent).toContain('White text reads clearly on it (5.3 : 1)')

    await click(rowWith(host, 'Preview'))
    const preview = await topSheet()
    expect(preview.textContent).toContain('Mike Smith invited you, Ava')
    expect(preview.textContent).toContain('Smith Strength')
    expect(preview.textContent).toContain('Mike Smith via Higher Rep')
    expect(preview.innerHTML).toContain('#1E7B34')
    useUI.setState({ sheets: [] })

    await click(rowWith(host, 'Use the Higher Rep look'))
    expect(calls.saveBranding).toHaveBeenCalledTimes(1)
    const confirm = await topSheet()
    await click(button(confirm, 'Use the Higher Rep look'))
    expect(calls.saveBranding).toHaveBeenLastCalledWith({ logo: null, accent: null })
  })

  it('refuses a logo that is not a PNG or JPEG before sending it', async () => {
    calls.getBranding.mockResolvedValue(settings())
    const host = await render(<Branding />)
    const input = host.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'logo.gif', { type: 'image/gif' })], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(calls.uploadLogo).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Use a PNG or JPEG image.')
  })
})

describe('New client defaults', () => {
  it('checks the current preset and saves a new one', async () => {
    calls.getBranding.mockResolvedValue(settings())
    calls.setDefaultPreset.mockResolvedValue('independent')
    const host = await render(<ClientDefaults />)
    expect(rowWith(host, 'Balanced').querySelector('.lrow-k')).not.toBeNull()
    expect(host.textContent).toContain('They see the whole block, can move days and add sessions.')
    await click(rowWith(host, 'Independent'))
    expect(calls.setDefaultPreset).toHaveBeenCalledWith('independent')
    expect(rowWith(host, 'Independent').querySelector('.lrow-k')).not.toBeNull()
  })
})

describe('the client’s side', () => {
  const mike = { id: 'u_mike', name: 'Mike Smith', business: 'Smith Strength', tagline: null, email: 'coach@smithstrength.com', phone: null, website: 'https://smithstrength.com/', accent: '#1E7B34', logo: null, status: 'active', since: NOW }
  it('Coaching shows the card and the contact rows, the phone only when sent', async () => {
    calls.myTrainer.mockResolvedValue(mike)
    let host = await render(<Coaching />)
    expect(host.textContent).toContain('Mike Smith')
    expect(host.textContent).toContain('Smith Strength · since')
    expect(rowWith(host, 'coach@smithstrength.com')).toBeTruthy()
    expect(rowWith(host, 'smithstrength.com')).toBeTruthy()
    expect(host.textContent).not.toContain('Phone')
    expect(host.innerHTML).toMatch(/#1E7B34|rgb\(30, 123, 52\)/i)
    calls.myTrainer.mockResolvedValue({ ...mike, phone: '+1 555 010 2030' })
    host = await render(<Coaching />)
    expect(rowWith(host, '+1 555 010 2030')).toBeTruthy()
  })

  it('Coaching and Privacy without a trainer', async () => {
    calls.myTrainer.mockRejectedValue(Object.assign(new Error('x'), { status: 404 }))
    expect((await render(<Coaching />)).textContent).toContain('You have no trainer right now')
    expect((await render(<CoachingPrivacy />)).textContent).toContain('nobody else sees your data')
  })

  it('Privacy lists only what is true now', async () => {
    calls.myTrainer.mockResolvedValue(mike)
    const host = await render(<CoachingPrivacy />)
    expect(host.textContent).toContain('What Mike Smith can see')
    expect(rowWith(host, 'Documents you sign').textContent).toContain('Shared')
    expect(rowWith(host, 'Workouts and progress').textContent).toContain('Not yet')
    expect(rowWith(host, 'Only you')).toBeTruthy()
  })
})

describe('the phone switch on the client profile', () => {
  const profile = sees => ({
    client: { id: 'u_ana', name: 'Ana Reyes', status: 'active', since: NOW, dob: null, age: null, minor: false, cleared: true, paperwork: 'done', todo: 0, warnings: [] },
    tags: [], notes: [], flagged: [], waiting: [], guardian: null, records: [], retention: { years: 5, keepUntil: null, notBefore: null }, sees,
  })
  it('turns it on for this one client, and is off until there is a number', async () => {
    calls.clientProfile.mockResolvedValue(profile({ email: 'mike@example.com', phone: '+1 555 010 2030', showPhone: false }))
    calls.setShowPhone.mockResolvedValue({ showPhone: true, phoneShown: { shown: 1, of: 2 } })
    let host = await render(<ClientProfile />, '/clients/u_ana')
    expect(host.textContent).toContain('What Ana sees of you')
    const sw = host.querySelector('[role="switch"][aria-label="Show my phone number"]')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await click(sw)
    expect(calls.setShowPhone).toHaveBeenCalledWith('u_ana', true)
    expect(sw.getAttribute('aria-checked')).toBe('true')

    calls.clientProfile.mockResolvedValue(profile({ email: 'mike@example.com', phone: null, showPhone: false }))
    host = await render(<ClientProfile />, '/clients/u_ana')
    expect(host.querySelector('[role="switch"][aria-label="Show my phone number"]').disabled).toBe(true)
    expect(host.textContent).toContain('Add a number in Settings › Branding first.')
  })
})

describe('the invite page and Settings', () => {
  it('a branded invite shows the business and greets by name; a plain one keeps Higher Rep’s look', async () => {
    calls.invitePage.mockResolvedValue({ status: 'valid', trainer: { name: 'Mike Smith', business: 'Smith Strength', tagline: 'Strength for real life', logo: 'a'.repeat(64), accent: '#1E7B34' }, firstName: 'Ava', note: null, expires: NOW + 86400000 })
    let host = await render(<JoinInvite code="ABCD1234" />)
    expect(host.textContent).toContain('Smith Strength')
    expect(host.textContent).toContain('Mike Smith invited you, Ava')
    expect(host.querySelector('img').getAttribute('src')).toBe('./api/coaching/logo?h=' + 'a'.repeat(64))
    expect(host.textContent).toContain('When were you born?')
    expect(host.textContent.match(/invited you/g)).toHaveLength(1)
    calls.invitePage.mockResolvedValue({ status: 'valid', trainer: { name: 'Mike', business: null, tagline: null, logo: null, accent: '#2457E6' }, firstName: 'Ava', note: null, expires: NOW + 86400000 })
    host = await render(<JoinInvite code="ABCD1234" />)
    expect(host.textContent).toContain('Mike invited you')
    expect(host.querySelector('img')).toBeNull()
  })

  it('Settings rows: Branding and defaults for a trainer, Privacy for a client, source code for all', async () => {
    calls.coachingMe.mockResolvedValue({ trainer: true, coach: null })
    calls.getBranding.mockResolvedValue(settings({ business: 'Smith Strength' }))
    let host = await render(<CoachingRow user={{ id: 'u_mike' }} />)
    expect(rowWith(host, 'Branding').textContent).toContain('Smith Strength')
    expect(rowWith(host, 'New client defaults').textContent).toContain('Balanced')
    expect(rowWith(host, 'Privacy')).toBeUndefined()
    calls.coachingMe.mockResolvedValue({ trainer: false, coach: { id: 'u_mike', name: 'Mike Smith', business: 'Smith Strength', status: 'active', since: NOW, todo: 0 } })
    host = await render(<CoachingRow user={{ id: 'u_ana' }} />)
    expect(rowWith(host, 'Coaching').textContent).toContain('Smith Strength')
    expect(rowWith(host, 'Privacy')).toBeTruthy()
    expect(rowWith(host, 'Branding')).toBeUndefined()
    host = await render(<SourceCodeRow />)
    expect(host.textContent).toContain('github.com/zankster/higher-rep')
    expect(host.textContent).toContain('free software (AGPL)')
  })
})
