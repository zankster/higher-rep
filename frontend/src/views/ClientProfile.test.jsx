// @vitest-environment happy-dom
// trainer-fork: the client profile (Phase 2f) with the coaching calls mocked. Who may read it is
// the api's tests (api/test/coaching-profile.test.js).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  clientProfile: vi.fn(), pauseClient: vi.fn(), removeClient: vi.fn(), addTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn(),
  addNote: vi.fn(), editNote: vi.fn(), deleteNote: vi.fn(), resendGuardianLink: vi.fn(), clientRecord: vi.fn(), listDocuments: vi.fn(), sendDocument: vi.fn(),
}))
vi.mock('../lib/coaching.js', async real => ({ ...(await real()), ...calls }))

import ClientProfile from './ClientProfile.jsx'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { retentionLine, recordLine, initials, paperworkPill, ageLine } from '../lib/coaching.js'

const mounted = []
async function render(node, path = '/clients/u_zoe') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/clients/:id" element={node} /><Route path="/clients" element={<div data-testid="roster">roster</div>} />
  </Routes></MemoryRouter>))
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

const NOW = Date.now()
const DAY = 86400000
const profile = () => ({
  client: { id: 'u_zoe', name: 'Zoe Lee', status: 'active', since: NOW - 30 * DAY, dob: '2010-03-01', age: 16, minor: true,
    cleared: false, paperwork: 'guardian', todo: 0, warnings: ['Knee pain'] },
  tags: [{ id: 1, text: 'Knee pain', warning: true, fromAnswer: false, created: NOW }, { id: 2, text: 'Mornings', warning: false, fromAnswer: false, created: NOW }],
  notes: [{ id: 5, text: 'Talk about sleep.', created: NOW - DAY, edited: null }],
  flagged: [{ record: 11, title: 'PAR-Q', question: 'Heart condition?', followUp: 'Murmur', submission: 3, at: NOW - DAY, tag: 'Murmur', tagged: false }],
  waiting: [{ id: 12, kind: 'sign', title: 'Liability waiver', version: 2, required: true, due: null, sent: NOW - DAY, waitingGuardian: true }],
  guardian: { name: 'Dana Lee', relationship: 'Mother', email: 'da•••@example.com', linkSent: NOW - DAY, linkExpires: NOW + 6 * DAY, canResend: true },
  records: [
    { id: 12, kind: 'sign', title: 'Liability waiver', version: 2, reason: 'packet', done: null, waitingGuardian: true, signers: [{ signer: 'client', name: 'Zoe Lee', at: NOW }] },
    { id: 11, kind: 'form', title: 'PAR-Q', version: 1, reason: 'packet', done: NOW - DAY, waitingGuardian: false, signers: [{ signer: 'client', name: 'Zoe Lee', at: NOW }], yesCount: 2, flagged: 1 },
  ],
  retention: { years: 5, keepUntil: null, notBefore: Date.UTC(2033, 2, 1) },
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  bindUI(useUI)
  useUI.setState({ sheets: [], toast: vi.fn() })
  for (const f of Object.values(calls)) f.mockReset()
  calls.clientProfile.mockResolvedValue(profile())
})
afterEach(() => {
  for (const [root, host] of mounted.splice(0)) { act(() => root.unmount()); host.remove() }
})

describe('profile helpers', () => {
  it('say how long records are kept', () => {
    expect(retentionLine({ years: 5, keepUntil: null, notBefore: null })).toBe('Records are kept 5 years after coaching ends.')
    expect(retentionLine({ years: 5, keepUntil: null, notBefore: Date.UTC(2033, 2, 1) })).toContain(new Date(Date.UTC(2033, 2, 1, 12)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
    expect(retentionLine({ years: 5, keepUntil: Date.UTC(2031, 0, 2), notBefore: null })).toMatch(/may be deleted after .*2031\. Nothing is deleted automatically/)
  })
  it('describe records, people and paperwork', () => {
    const [waiver, parq] = profile().records
    expect(recordLine(waiver)).toBe('Version 2 · waiting on guardian')
    expect(recordLine(parq)).toMatch(/^Version 1 · .* · 2 yes · 1 flagged$/)
    expect(recordLine({ ...parq, yesCount: 1, flagged: 0 })).toMatch(/· 1 yes$/)
    expect(recordLine({ id: 1, kind: 'sign', version: 3, done: NOW, signers: [{ signer: 'client', name: 'Zoe' }, { signer: 'guardian', name: 'Dana' }] })).toMatch(/^Version 3 · signed .* · with Dana$/)
    expect([initials('Zoe Lee'), initials('ana maria reyes'), initials(''), initials('Cher')]).toEqual(['ZL', 'AR', '?', 'C'])
    expect(paperworkPill({ cleared: true })).toEqual({ label: 'Cleared to train', ok: true })
    expect(paperworkPill({ cleared: false, paperwork: 'guardian' }).label).toBe('Waiting on guardian')
    expect(paperworkPill({ cleared: false, paperwork: 'todo', todo: 2 }).label).toBe('2 to sign')
    expect(ageLine({ dob: '2010-03-01', age: 16 })).toMatch(/^16 · born .*2010$/)
    expect(ageLine({ dob: null })).toBeNull()
  })
})

describe('ClientProfile', () => {
  it('shows the header, tags, flagged answers, what is waiting, notes and records', async () => {
    const host = await render(<ClientProfile />)
    expect(calls.clientProfile).toHaveBeenCalledWith('u_zoe')
    const text = host.textContent
    for (const s of ['Zoe Lee', 'ZL', '16 · born', 'Waiting on guardian', 'Under 18', 'Knee pain', 'Mornings', 'Heart condition?', 'Murmur',
      'Make it a tag', 'Still waiting', 'Zoe signed. Waiting on Dana Lee.', 'Dana Lee (Mother)', 'da•••@example.com', 'Send Dana a new link',
      'Talk about sleep.', 'Only you. Never shown or sent to Zoe.', 'Nothing reported', 'PAR-Q', '2 yes · 1 flagged', 'Export record (ZIP)', 'at least until']) {
      expect(text).toContain(s)
    }
    expect(text).not.toContain('dana@example.com')
  })

  it('makes a tag from a flagged answer in one tap', async () => {
    const p = profile()
    calls.addTag.mockResolvedValue([...p.tags, { id: 3, text: 'Murmur', warning: true, fromAnswer: true, created: NOW }])
    const host = await render(<ClientProfile />)
    await click(button(host, 'Make it a tag'))
    expect(calls.addTag).toHaveBeenCalledWith('u_zoe', { fromAnswer: { record: 11, question: 'Heart condition?' } })
    expect(host.textContent).toContain('Tagged')
    expect(button(host, 'Make it a tag')).toBeUndefined()
  })

  it('adds a warning tag from the + tag sheet, and a note from Add a note', async () => {
    calls.addTag.mockResolvedValue([...profile().tags, { id: 4, text: 'Asthma', warning: true, created: NOW }])
    calls.addNote.mockResolvedValue([{ id: 6, text: 'Bring inhaler.', created: NOW, edited: null }, ...profile().notes])
    const host = await render(<ClientProfile />)
    await click(button(host, 'tag'))
    let sheet = await topSheet()
    await click(button(sheet, 'Add tag'))
    expect(sheet.textContent).toContain('Type something first.')
    await type(sheet.querySelector('input'), 'Asthma')
    await click(sheet.querySelector('[role="switch"]'))
    await click(button(sheet, 'Add tag'))
    expect(calls.addTag).toHaveBeenCalledWith('u_zoe', { text: 'Asthma', warning: true })
    expect(host.textContent).toContain('Asthma')

    await click(rowWith(host, 'Add a note'))
    sheet = await topSheet()
    expect(sheet.textContent).toContain('Only you. Never shown or sent to Zoe.')
    await type(sheet.querySelector('textarea'), 'Bring inhaler.')
    await click(button(sheet, 'Save note'))
    expect(calls.addNote).toHaveBeenCalledWith('u_zoe', 'Bring inhaler.')
    expect(host.textContent).toContain('Bring inhaler.')
  })

  it('sends the guardian a new link', async () => {
    calls.resendGuardianLink.mockResolvedValue({ ok: true, guardian: { ...profile().guardian, linkSent: NOW } })
    const host = await render(<ClientProfile />)
    await click(rowWith(host, 'Send Dana a new link'))
    expect(calls.resendGuardianLink).toHaveBeenCalledWith('u_zoe')
    expect(useUI.getState().toast).toHaveBeenCalledWith('New link emailed to Dana Lee')
  })

  it('opens a record with flagged answers first and a PDF link', async () => {
    calls.clientRecord.mockResolvedValue({ id: 11, kind: 'form', title: 'PAR-Q', version: 1, yesCount: 2, flagged: 1, signers: [{ signer: 'client', name: 'Zoe Lee', signed: '1 November 2026 at 14:03 (Europe/Zurich)', at: NOW }],
      items: [{ n: 1, questionId: 'h', q: 'Heart condition?', a: 'Yes. Murmur', yes: true, flagged: true }, { n: 2, questionId: 'j', q: 'Joint problem?', a: 'Yes', yes: true, flagged: false }] })
    const host = await render(<ClientProfile />)
    await click(rowWith(host, '2 yes · 1 flagged'))
    const sheet = await topSheet()
    expect(calls.clientRecord).toHaveBeenCalledWith('u_zoe', 11)
    expect(sheet.textContent).toContain('Flagged answers come first.')
    expect(sheet.textContent.indexOf('Heart condition?')).toBeLessThan(sheet.textContent.indexOf('Joint problem?'))
    expect(sheet.querySelector('a.btn').getAttribute('href')).toBe('./api/coaching/client/record/pdf?id=u_zoe&record=11')
  })

  it('exports with notes and tags only when the switch is on', async () => {
    const host = await render(<ClientProfile />)
    await click(rowWith(host, 'Export record (ZIP)'))
    const sheet = await topSheet()
    const link = () => [...sheet.querySelectorAll('a.btn')].find(a => a.textContent.includes('Export record'))
    expect(link().getAttribute('href')).toBe('./api/coaching/client/export?id=u_zoe')
    await click(sheet.querySelector('[role="switch"]'))
    expect(link().getAttribute('href')).toBe('./api/coaching/client/export?id=u_zoe&notes=1')
  })

  it('pauses from the … menu, and removing goes back to the roster after the confirm', async () => {
    calls.pauseClient.mockResolvedValue({ ...profile().client, status: 'paused' })
    calls.removeClient.mockResolvedValue({ ok: true })
    const host = await render(<ClientProfile />)
    await click(host.querySelector('button[aria-label="More"]'))
    let menu = await topSheet()
    expect(menu.textContent).toContain('Send a document')
    await click([...menu.querySelectorAll('.menu-item')].find(el => el.textContent.includes('Pause coaching')))
    expect(calls.pauseClient).toHaveBeenCalledWith('u_zoe', true)

    await click(host.querySelector('button[aria-label="More"]'))
    menu = await topSheet()
    await click([...menu.querySelectorAll('.menu-item')].find(el => el.textContent.includes('Remove client')))
    expect(calls.removeClient).not.toHaveBeenCalled()
    const confirm = await topSheet()
    expect(confirm.textContent).toContain('keeps their account and their own data')
    await click(button(confirm, 'Remove Zoe Lee'))
    expect(calls.removeClient).toHaveBeenCalledWith('u_zoe')
    expect(host.querySelector('[data-testid="roster"]')).toBeTruthy()
  })

  it('says so when the client is not yours', async () => {
    calls.clientProfile.mockRejectedValue(Object.assign(new Error('no such client'), { data: { error: 'no such client' } }))
    const host = await render(<ClientProfile />)
    expect(host.querySelector('[role="alert"]').textContent).toContain('no such client')
  })
})
