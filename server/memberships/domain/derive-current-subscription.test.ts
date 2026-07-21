import { describe, expect, it } from 'vitest'
import type { Subscription } from './entities'
import { deriveCurrentSubscription } from './derive-current-subscription'

const NOW = new Date('2026-07-21T12:00:00.000Z')

const BASE: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-09-01'),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date('2026-06-01'),
}

describe('deriveCurrentSubscription', () => {
  it('returns the subscription when it has started and not expired', () => {
    expect(deriveCurrentSubscription([BASE], NOW)?.id).toBe('sub1')
  })

  it('returns null when the list is empty', () => {
    expect(deriveCurrentSubscription([], NOW)).toBeNull()
  })

  it('returns null when the latest subscription has expired', () => {
    const expired: Subscription = { ...BASE, endDate: new Date('2026-07-01') }
    expect(deriveCurrentSubscription([expired], NOW)).toBeNull()
  })

  it('returns null when the only subscription has not started yet', () => {
    const future: Subscription = { ...BASE, id: 'sub2', startDate: new Date('2026-08-01'), endDate: new Date('2026-11-01') }
    expect(deriveCurrentSubscription([future], NOW)).toBeNull()
  })

  it('skips a not-yet-started future subscription and finds an earlier active one', () => {
    const future: Subscription = { ...BASE, id: 'sub2', startDate: new Date('2026-08-01'), endDate: new Date('2026-11-01') }
    // Ordered by endDate desc, as findAllByClientId returns it — future sorts first.
    expect(deriveCurrentSubscription([future, BASE], NOW)?.id).toBe('sub1')
  })

  it('treats a suspended-but-unexpired subscription as still current', () => {
    const suspended: Subscription = { ...BASE, suspended: true }
    const result = deriveCurrentSubscription([suspended], NOW)
    expect(result?.id).toBe('sub1')
    expect(result?.suspended).toBe(true)
  })
})
