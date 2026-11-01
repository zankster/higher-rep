// @vitest-environment happy-dom
// trainer-fork: the client's sign-up packet in the app (Phase 2e), with the coaching calls
// mocked. The rules behind them are the api's tests (api/test/coaching-packet.test.js).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  myDocuments: vi.fn(), saveAbout: vi.fn(), submitRequest: vi.fn(), saveGuardian: vi.fn(), coachingMe: vi.fn(),
  listDocuments: vi.fn(), setRequired: vi.fn(), setPacket: vi.fn(),
}))
vi.mock('../lib/coaching.js', async real => ({ ...(await real()), ...calls }))

import Packet from './Packet.jsx'
import Documents from './Documents.jsx'
import { FormStep, SignStep } from '../components/PacketSteps.jsx'
import { paperworkText } from '../components/PaperworkCard.jsx'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { dobFrom, ageFrom, guardianToken, paperworkLine } from '../lib/coaching.js'

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
const button = (host, text) => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const click = async el => act(async () => { el.click() })
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

const parq = { id: 11, kind: 'form', title: 'PAR-Q', version: 1, required: true, body: { intro: '', questions: [
  { id: 'h', type: 'yes_no', text: 'Heart condition?', required: true, flagYes: true, followUp: { type: 'long_text', text: 'Please describe it.' } },
] } }
const waiver = { id: 12, kind: 'sign', title: 'Liability waiver', version: 1, required: true, body: { text: 'I accept the risks.' } }
const consent = { id: 13, kind: 'pdf_return', title: 'Photo consent', version: 1, required: false, body: { file: { hash: 'a'.repeat(64), name: 'consent.pdf' } } }
const base = { trainer: { id: 'u_mike', name: 'Mike' }, about: true, age: 30, minor: false, guardian: null, todo: [], waiting: [], done: [], cleared: false, state: 'todo' }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  bindUI(useUI)
  useUI.setState({ sheets: [], toast: vi.fn() })
  for (const f of Object.values(calls)) f.mockReset()
})
afterEach(() => {
  for (const [root, host] of mounted.splice(0)) { act(() => root.unmount()); host.remove() }
})

describe('helpers', () => {
  it('reads a date of birth and an age the way the server does', () => {
    const at = Date.UTC(2026, 10, 1)
    expect(dobFrom('31', 2, '2010', at)).toBeNull()
    expect(dobFrom('1', 1, '2030', at)).toBeNull()
    expect(dobFrom('5', 3, '2010', at)).toBe('2010-03-05')
    expect(ageFrom('2013-11-01', at)).toBe(13)
    expect(ageFrom('2013-11-02', at)).toBe(12)
  })
  it('finds the guardian token in the link', () => {
    expect(guardianToken('/guardian/' + 'A'.repeat(43))).toBe('A'.repeat(43))
    expect(guardianToken('/guardian/short')).toBeNull()
  })
  it('words where a client stands, for the trainer and the client', () => {
    expect(paperworkLine({ paperwork: 'guardian', todo: 0 })).toBe('Waiting on guardian')
    expect(paperworkLine({ paperwork: 'todo', todo: 2 })).toBe('2 to sign')
    expect(paperworkLine({ paperwork: 'cleared', todo: 0 })).toBeNull()
    expect(paperworkText({ name: 'Mike', paperwork: 'cleared', todo: 1 })).toBe('1 document from Mike to review and sign.')
  })
})

describe('steps', () => {
  it('a flagged yes says the trainer will see it, and asks the follow-up', async () => {
    const submit = vi.fn()
    const host = await render(<FormStep step={parq} trainerName="Mike" onSubmit={submit} />)
    expect(host.textContent).not.toContain('Mike will see this')
    await click(button(host, 'Yes'))
    expect(host.textContent).toContain('Mike will see this before your first session.')
    type(host.querySelector('textarea[aria-label="Please describe it."]'), 'Mild murmur')
    await click(button(host, 'Next'))
    expect(submit).toHaveBeenCalledWith({ answers: { h: { yes: true, followUp: 'Mild murmur' } } })
  })
  it('a refused answer points at its question', async () => {
    const host = await render(<FormStep step={parq} trainerName="Mike" onSubmit={() => Promise.reject({ data: { code: 'required', index: 0 } })} />)
    await click(button(host, 'Next'))
    expect(host.textContent).toContain('Question 1 needs an answer.')
  })
  it('signing needs the tick, the full name and a signature', async () => {
    const submit = vi.fn()
    const host = await render(<SignStep step={waiver} onSubmit={submit} />)
    await click(button(host, 'Sign'))
    expect(host.textContent).toContain('Tick the box')
    await click(host.querySelector('[role="checkbox"]'))
    await click(button(host, 'Sign'))
    expect(host.textContent).toContain('Type your full name.')
    type(host.querySelector('input[aria-label="Full name"]'), 'Ava Reyes')
    await click(button(host, 'Sign'))
    expect(host.textContent).toContain('Sign with your finger in the box.')
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('the packet', () => {
  it('runs the to-dos in order, skips an optional one, and ends on all set', async () => {
    calls.myDocuments.mockResolvedValue({ ...base, todo: [parq, consent] })
    calls.submitRequest.mockResolvedValue({ ...base, todo: [consent], done: [{ id: 11, kind: 'form', title: 'PAR-Q', version: 1, done: 1, signers: [] }], cleared: true, state: 'cleared' })
    const host = await render(<Packet />)
    expect(host.textContent).toContain('Step 1 of 2 · from Mike')
    expect(button(host, 'Skip for now')).toBeUndefined()
    await click(button(host, 'No'))
    await click(button(host, 'Next'))
    expect(calls.submitRequest).toHaveBeenCalledWith(11, { answers: { h: { yes: false } } })
    expect(host.textContent).toContain('Step 2 of 2')
    await click(button(host, 'Skip for now'))
    expect(host.textContent).toContain('You’re all set')
    expect(button(host, 'Start training')).toBeTruthy()
  })
  it('a client from before 2e gives the date of birth first', async () => {
    calls.myDocuments.mockResolvedValue({ ...base, about: false, state: 'about' })
    const host = await render(<Packet />)
    expect(host.textContent).toContain('When were you born?')
  })
  it('under 18: the guardian is named next, and an emailed link leaves it at almost there', async () => {
    const waitingWaiver = { ...waiver, clientDone: 1, guardianNeeded: true }
    // The waiver is signed (a canvas signature cannot be drawn here); the guardian is next.
    calls.myDocuments.mockResolvedValue({ ...base, age: 16, minor: true, todo: [], waiting: [waitingWaiver], state: 'guardian' })
    calls.saveGuardian.mockResolvedValue({ ...base, age: 16, minor: true, waiting: [waitingWaiver], state: 'guardian', emailed: true,
      guardian: { name: 'Dana Lee', email: 'dana@example.com', relationship: 'Parent', linkSent: 1 } })
    const host = await render(<Packet />)
    expect(host.textContent).toContain('A parent or guardian signs next')
    expect(host.textContent).toContain('Because you’re 16')
    type(host.querySelector('input[aria-label="Their full name"]'), 'Dana Lee')
    await click(button(host, 'Email them a link'))
    expect(host.textContent).toContain('Type their email to send the link.')
    type(host.querySelector('input[aria-label="Their email"]'), 'dana@example.com')
    await click(button(host, 'Email them a link'))
    expect(calls.saveGuardian).toHaveBeenCalledWith({ name: 'Dana Lee', email: 'dana@example.com', relationship: 'Parent', send: true })
    expect(host.textContent).toContain('Almost there')
    expect(host.textContent).toContain('Training with Mike starts once Dana Lee signs.')
    expect(button(host, 'Dana Lee’s here: sign on this phone')).toBeTruthy()
  })
})

describe('trainer', () => {
  it('a packet document is marked required with its switch', async () => {
    calls.listDocuments.mockResolvedValue([{ id: 1, kind: 'form', title: 'PAR-Q', inPacket: true, order: 0, version: 1, hasDraft: false, required: false, updated: 1 }])
    calls.setRequired.mockResolvedValue({})
    const host = await render(<Documents />)
    expect(host.textContent).toContain('optional')
    await click(host.querySelector('[role="switch"]'))
    expect(calls.setRequired).toHaveBeenCalledWith(1, true)
    expect(host.textContent).toContain('required to start')
  })
})
