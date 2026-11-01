// trainer-fork: every event the coaching routes write has a plain label in the activity log.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditLabel } from './audit.js'

const routes = fs.readFileSync(new URL('../../../api/coaching/routes.js', import.meta.url), 'utf8')
const events = [...new Set([...routes.matchAll(/'((?:admin\.trainer|coaching)\.[a-z.]+)'/g)].map(m => m[1]))]

describe('coaching activity log labels', () => {
  it('finds the events in the routes', () => {
    expect(events).toContain('coaching.end')
    expect(events.length).toBeGreaterThanOrEqual(10)
  })
  it.each(events)('%s has a label', ev => {
    expect(auditLabel(ev)).not.toBe(ev)
  })
})
