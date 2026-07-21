import { describe, expect, it } from 'vitest'
import type { Subscription } from './entities'
import { checkSessionEligibility } from './check-session-eligibility'

const NOW = new Date('2026-07-21T12:00:00.000Z')

const VALID: Subscription = {
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

describe('checkSessionEligibility', () => {
  it('allows a valid, started, unexpired subscription', () => {
    expect(checkSessionEligibility([VALID], NOW)).toEqual({ allowed: true })
  })

  it('denies with reason "none" when there is no subscription at all', () => {
    expect(checkSessionEligibility([], NOW)).toEqual({ allowed: false, reason: 'none' })
  })

  it('denies with reason "expired" when the subscription has ended', () => {
    const expired: Subscription = { ...VALID, endDate: new Date('2026-07-01') }
    expect(checkSessionEligibility([expired], NOW)).toEqual({ allowed: false, reason: 'expired' })
  })

  it('denies with reason "suspended" when the subscription is suspended', () => {
    const suspended: Subscription = { ...VALID, suspended: true }
    expect(checkSessionEligibility([suspended], NOW)).toEqual({ allowed: false, reason: 'suspended' })
  })

  it('prioritizes "suspended" over "expired" when both are true', () => {
    const both: Subscription = { ...VALID, suspended: true, endDate: new Date('2026-07-01') }
    expect(checkSessionEligibility([both], NOW)).toEqual({ allowed: false, reason: 'suspended' })
  })

  it('allows a session when there is a valid current subscription plus a future early-renewal', () => {
    const FUTURE_RENEWAL: Subscription = {
      ...VALID,
      id: 'sub2',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-01'),
    }
    // future sorts first, matching real endDate desc ordering from the repository
    expect(checkSessionEligibility([FUTURE_RENEWAL, VALID], NOW)).toEqual({ allowed: true })
  })

  it('denies with reason none when the only subscription has not started yet', () => {
    const FUTURE_ONLY: Subscription = { ...VALID, startDate: new Date('2026-08-01'), endDate: new Date('2026-11-01') }
    expect(checkSessionEligibility([FUTURE_ONLY], NOW)).toEqual({ allowed: false, reason: 'none' })
  })
})
