// @vitest-environment happy-dom
// trainer-fork: the document library in the app (Phase 2d), with the coaching calls mocked. The
// rules behind them are the api's tests (api/test/coaching-documents.test.js).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  listDocuments: vi.fn(), getDocument: vi.fn(), newDocument: vi.fn(), saveDraft: vi.fn(), publishDocument: vi.fn(),
  setPacket: vi.fn(), deleteDocument: vi.fn(), documentRecipients: vi.fn(), sendDocument: vi.fn(), discardDraft: vi.fn(), uploadPdf: vi.fn(),
}))
vi.mock('../lib/coaching.js', async real => ({ ...(await real()), ...calls }))

import Documents, { NewDocumentSheet } from './Documents.jsx'
import DocumentEdit from './DocumentEdit.jsx'
import { PublishSheet, SendSheet } from '../components/DocumentSheets.jsx'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { versionLine, publishError, retypeQuestion, newQuestion } from '../lib/coaching.js'

const mounted = []
async function render(node, path = '/') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>))
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
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)))

const parq = { id: 1, kind: 'form', title: 'PAR-Q', inPacket: true, order: 0, version: 1, hasDraft: true, updated: 1 }
const waiver = { id: 2, kind: 'sign', title: 'Liability waiver', inPacket: true, order: 1, version: null, hasDraft: true, updated: 1 }
const policy = { id: 3, kind: 'sign', title: 'Cancellation policy', inPacket: false, order: null, version: 2, hasDraft: false, updated: 1 }
const toast = vi.fn()

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  bindUI(useUI)
  toast.mockReset()
  useUI.setState({ sheets: [], toast })
  for (const f of Object.values(calls)) f.mockReset()
  calls.listDocuments.mockResolvedValue([parq, waiver, policy])
})
afterEach(() => {
  for (const [root, host] of mounted.splice(0)) { act(() => root.unmount()); host.remove() }
})

describe('helpers', () => {
  it('says which version a row is at', () => {
    expect(versionLine(waiver)).toBe('Draft')
    expect(versionLine(parq)).toBe('Version 1 · draft of 2')
    expect(versionLine(policy)).toBe('Version 2')
  })
  it('keeps the wording when a question changes type', () => {
    const q = { ...newQuestion('yes_no'), text: 'Any injuries?' }
    const c = retypeQuestion(q, 'choice')
    expect(c).toMatchObject({ id: q.id, type: 'choice', text: 'Any injuries?', options: ['', ''] })
    expect(retypeQuestion(c, 'yes_no')).toMatchObject({ text: 'Any injuries?', flagYes: false, followUp: null })
  })
  it('words a publish refusal with the question number', () => {
    expect(publishError({ data: { code: 'choice-options', index: 2 } })).toBe('Question 3 needs at least two choices.')
  })
})

describe('library', () => {
  it('lists the packet in order, then the rest', async () => {
    const host = await render(<Documents />)
    const titles = [...host.querySelectorAll('.tt')].map(el => el.textContent)
    expect(titles).toEqual(['PAR-Q', 'Liability waiver', 'Cancellation policy'])
    expect(host.textContent).toContain('DRAFT')
    expect(host.querySelectorAll('[data-reorder-handle]').length).toBe(2)
  })
  it('a new document needs a title and the rights tick', async () => {
    calls.newDocument.mockResolvedValue({ ...policy, id: 9 })
    const created = vi.fn()
    const host = await render(<NewDocumentSheet close={() => {}} onCreated={created} />)
    await click(button(host, 'Create draft'))
    expect(host.textContent).toContain('Give the document a title.')
    type(host.querySelector('input[aria-label="Title"]'), 'Photo consent')
    await click([...host.querySelectorAll('[role="radio"]')].find(b => b.textContent.includes('PDF to fill and return')))
    await click(button(host, 'Create draft'))
    expect(host.textContent).toContain('Tick the box')
    expect(calls.newDocument).not.toHaveBeenCalled()
    await click(host.querySelector('[role="checkbox"]'))
    await click(button(host, 'Create draft'))
    expect(calls.newDocument).toHaveBeenCalledWith({ title: 'Photo consent', kind: 'pdf_return', rights: true })
    expect(created).toHaveBeenCalled()
  })
})

describe('editor', () => {
  const doc = {
    ...parq, rightsConfirmed: 1, versions: [{ version: 1, published: 1 }], completedEarlier: 3, open: 0,
    draft: { version: null, title: 'PAR-Q', body: { intro: '', questions: [{ id: 'a', type: 'yes_no', text: 'Heart?', required: true, flagYes: true, followUp: null }] }, updated: 1 },
    published: { version: 1, title: 'PAR-Q', body: { intro: '', questions: [] }, published: 1 },
  }
  const page = () => render(<Routes><Route path="/documents/:id" element={<DocumentEdit />} /></Routes>, '/documents/1')

  it('autosaves the draft after typing', async () => {
    calls.getDocument.mockResolvedValue(doc)
    calls.saveDraft.mockImplementation(async (id, w) => ({ version: null, title: w.title, body: w.body, updated: 2 }))
    const host = await page()
    type(host.querySelector('textarea[aria-label="Question 1"]'), 'Has your doctor ever said you have a heart condition?')
    expect(calls.saveDraft).not.toHaveBeenCalled()
    await wait(800)
    expect(calls.saveDraft).toHaveBeenCalledTimes(1)
    const [id, w] = calls.saveDraft.mock.calls[0]
    expect(id).toBe('1')
    expect(w.body.questions[0].text).toBe('Has your doctor ever said you have a heart condition?')
    expect(host.textContent).toContain('Draft of version 2 · saved')
  })
  it('adds a question and changes its type from the menu', async () => {
    calls.getDocument.mockResolvedValue(doc)
    calls.saveDraft.mockImplementation(async (id, w) => ({ version: null, title: w.title, body: w.body, updated: 2 }))
    const host = await page()
    await click(button(host, 'Add question'))
    expect(host.querySelectorAll('[data-question]').length).toBe(2)
    await click([...host.querySelectorAll('[data-question]')][1].querySelector('button'))
    await click([...(await topSheet()).querySelectorAll('.menu-item')].find(el => el.textContent.includes('Choice')))
    expect(host.querySelector('input[aria-label="Choice 1"]')).toBeTruthy()
  })
})

describe('publish and send', () => {
  const doc = { ...parq, completedEarlier: 3 }
  it('offers to ask current clients, on by default', async () => {
    calls.publishDocument.mockResolvedValue({ version: 2, asked: 3, document: doc })
    const done = vi.fn()
    const host = await render(<PublishSheet doc={doc} version={2} close={() => {}} onDone={done} />)
    expect(host.textContent).toContain('3 clients did an earlier version.')
    await click(button(host, 'Publish and ask 3 clients'))
    expect(calls.publishDocument).toHaveBeenCalledWith(1, true, false)
    expect(done).toHaveBeenCalled()
  })
  it('a refused publish says why and points at the question', async () => {
    calls.publishDocument.mockRejectedValue({ data: { code: 'question-text', index: 0 } })
    const problem = vi.fn()
    const host = await render(<PublishSheet doc={{ ...doc, completedEarlier: 0 }} version={2} close={() => {}} onProblem={problem} />)
    await click(button(host, 'Publish'))
    expect(host.textContent).toContain('Question 1 has no wording yet.')
    expect(problem).toHaveBeenCalled()
  })
  it('send picks those who still need it, and skips the rest', async () => {
    calls.documentRecipients.mockResolvedValue({ version: 2, clients: [
      { id: 'a', name: 'Ava', paused: false, state: 'none' },
      { id: 'j', name: 'Jordan', paused: true, state: 'none' },
      { id: 's', name: 'Sam', paused: false, state: 'done' },
    ] })
    calls.sendDocument.mockResolvedValue({ sent: 2, skipped: 0 })
    const host = await render(<SendSheet doc={{ ...policy }} close={() => {}} onSent={() => {}} />)
    expect(host.textContent).toContain('Already did version 2')
    expect(host.textContent).toContain('Paused. Sees it when coaching resumes.')
    await click(button(host, 'Send to 2 clients'))
    expect(calls.sendDocument).toHaveBeenCalledWith(3, ['a', 'j'], null, false)
  })
})
