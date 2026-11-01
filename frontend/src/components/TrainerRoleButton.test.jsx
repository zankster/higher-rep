// @vitest-environment happy-dom
// trainer-fork: the Trainer switch in the Admin drill-down.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), toast: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: (...a) => m.api(...a) }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: (...a) => m.confirm(...a) }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: m.toast }) } }))

import TrainerRoleButton, { trainerError } from './TrainerRoleButton.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mounted = []
async function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  await act(async () => root.render(el))
  return host
}
beforeEach(() => { for (const f of Object.values(m)) f.mockReset() })
afterEach(() => { for (const [root, host] of mounted.splice(0)) { act(() => root.unmount()); host.remove() } })

const ana = { id: 'u_ana', name: 'Ana' }

describe('TrainerRoleButton', () => {
  it('shows only to the owner, and not for a disabled account', async () => {
    expect((await render(<TrainerRoleButton u={ana} viewerOwner={false} />)).textContent).toBe('')
    expect((await render(<TrainerRoleButton u={{ ...ana, disabled: true }} viewerOwner />)).textContent).toBe('')
    expect((await render(<TrainerRoleButton u={ana} viewerOwner />)).textContent).toContain('Make trainer')
  })

  it('makes a trainer only after the confirm', async () => {
    m.api.mockResolvedValue({ ok: true, trainer: true })
    const changed = vi.fn()
    const host = await render(<TrainerRoleButton u={ana} viewerOwner onChanged={changed} />)
    await act(async () => host.querySelector('button').click())
    expect(m.api).not.toHaveBeenCalled()
    expect(m.confirm.mock.calls[0][0].confirmText).toBe('Make trainer')
    await act(async () => m.confirm.mock.calls[0][0].onConfirm())
    expect(m.api).toHaveBeenCalledWith('/api/admin/user/trainer', { method: 'POST', body: JSON.stringify({ id: 'u_ana', trainer: true }) })
    expect(changed).toHaveBeenCalled()
    expect(m.toast).toHaveBeenCalledWith('Ana is a trainer now')
  })

  it('removing one who still has clients says what to do', async () => {
    m.api.mockRejectedValue(Object.assign(new Error('this trainer still has clients'), { status: 409 }))
    const host = await render(<TrainerRoleButton u={{ ...ana, trainer: true }} viewerOwner />)
    expect(host.textContent).toContain('Remove trainer')
    await act(async () => host.querySelector('button').click())
    await act(async () => m.confirm.mock.calls[0][0].onConfirm())
    expect(m.toast).toHaveBeenCalledWith('Remove or hand over their clients first.')
    expect(trainerError(new Error('boom'))).toBe('boom')
  })
})
