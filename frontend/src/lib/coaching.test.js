// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest'
import { joinCode, inviteLine, coachingError, rosterFilter, markAutoAccept, takeAutoAccept } from './coaching.js'

describe('joinCode', () => {
  it('reads the code from a /join path, upper-cased', () => {
    expect(joinCode('/join/a1b2c3d4e5f6a7b8')).toBe('A1B2C3D4E5F6A7B8')
    expect(joinCode('/join/K7QF2M9X/')).toBe('K7QF2M9X')
  })
  it('is null anywhere else', () => {
    for (const p of ['/home', '/join', '/join/', '/join/x', '/join/ab/cd', '/settings/join/ABCD', '', null]) expect(joinCode(p)).toBeNull()
  })
})

describe('inviteLine', () => {
  const now = Date.UTC(2026, 10, 1, 12)
  it('says when a live invite went out and whether it was opened', () => {
    expect(inviteLine({ status: 'pending', created: now - 2 * 86400000, opened: null }, now)).toMatch(/^Sent 2 days ago · Not opened$/)
    expect(inviteLine({ status: 'pending', created: now - 2 * 86400000, opened: now }, now)).toMatch(/· Opened$/)
  })
  it('gives the date for an expired one', () => {
    expect(inviteLine({ status: 'expired', expires: Date.UTC(2026, 9, 20, 12) }, now)).toMatch(/^Expired /)
  })
})

describe('coachingError', () => {
  it('names the trainer where it helps', () => {
    expect(coachingError({ data: { code: 'expired' } }, 'Mike')).toBe('This invite has expired. Ask Mike for a new one.')
    expect(coachingError({ data: { code: 'used' } })).toBe('This invite is no longer valid. Ask your trainer for a new one.')
  })
  it('falls back to the server message, then a plain one', () => {
    expect(coachingError({ message: 'not signed in', data: {} })).toBe('not signed in')
    expect(coachingError(null)).toBe('Something went wrong. Try again.')
  })
})

describe('rosterFilter', () => {
  const clients = [{ id: 'a', name: 'Ava Reyes', status: 'active' }, { id: 'p', name: 'Priya Kaur', status: 'paused' }]
  it('filters by status and by name', () => {
    expect(rosterFilter(clients, 'all').map(c => c.id)).toEqual(['a', 'p'])
    expect(rosterFilter(clients, 'paused').map(c => c.id)).toEqual(['p'])
    expect(rosterFilter(clients, 'all', ' ava ').map(c => c.id)).toEqual(['a'])
  })
})

describe('auto-accept after sign-up', () => {
  beforeEach(() => sessionStorage.clear())
  it('takes only the code that was noted, and only once', () => {
    markAutoAccept('ABCD1234')
    expect(takeAutoAccept('OTHER123')).toBe(false)
    markAutoAccept('ABCD1234')
    expect(takeAutoAccept('ABCD1234')).toBe(true)
    expect(takeAutoAccept('ABCD1234')).toBe(false)
  })
})
