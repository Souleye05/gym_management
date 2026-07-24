import { describe, expect, it } from 'vitest'
import { classifySubscriptionStatus } from './classify-subscription-status'

const NOW = new Date('2026-07-22T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('classifySubscriptionStatus', () => {
  it('classifies as expiring at exactly the threshold boundary (7 days left)', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() + 7 * DAY) }, NOW, 7)
    expect(result).toEqual({ status: 'expiring', daysLeft: 7 })
  })

  it('excludes a subscription one day beyond the threshold (8 days left)', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() + 8 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })

  it('classifies as expired when endDate is in the past', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() - 1 * DAY) }, NOW, 7)
    expect(result).toEqual({ status: 'expired', daysLeft: -1 })
  })

  it('classifies as expired when endDate equals now exactly (inclusive boundary)', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: NOW }, NOW, 7)
    expect(result).toEqual({ status: 'expired', daysLeft: 0 })
  })

  it('excludes a suspended subscription even when its dates would otherwise classify as expiring', () => {
    const result = classifySubscriptionStatus({ suspended: true, endDate: new Date(NOW.getTime() + 1 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })

  it('excludes a suspended subscription even when its dates would otherwise classify as expired', () => {
    const result = classifySubscriptionStatus({ suspended: true, endDate: new Date(NOW.getTime() - 5 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })

  it('excludes a subscription comfortably within its validity window', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() + 30 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })
})
