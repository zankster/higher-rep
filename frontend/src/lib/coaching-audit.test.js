// trainer-fork: every event the coaching routes write has a plain label in the activity log.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditLabel } from './audit.js'

const routes = ['routes.js', 'documents.js', 'packet.js'].map(f => fs.readFileSync(new URL('../../../api/coaching/' + f, import.meta.url), 'utf8')).join('\n')
const events = [...new Set([...routes.matchAll(/'((?:admin\.trainer|coaching)\.[a-z.]+)'/g)].map(m => m[1]))]

describe('coaching activity log labels', () => {
  it('finds the events in the routes', () => {
    expect(events).toContain('coaching.end')
    expect(events).toContain('coaching.document.publish')
    expect(events.length).toBeGreaterThanOrEqual(10)
  })
  it.each(events)('%s has a label', ev => {
    expect(auditLabel(ev)).not.toBe(ev)
  })
})
