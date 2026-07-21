import { describe, expect, it } from 'vitest'
import type { Session, Subscription } from '../domain/entities'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { SessionRepository } from '../repositories/session.repository'
import { DefaultClientHistoryService } from './default-client-history.service'

const ACTIVE_SUBSCRIPTION: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date(),
}

const EXPIRED_SUBSCRIPTION: Subscription = {
  ...ACTIVE_SUBSCRIPTION,
  id: 'sub2',
  endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
}

const SUSPENDED_SUBSCRIPTION: Subscription = {
  ...ACTIVE_SUBSCRIPTION,
  id: 'sub3',
  suspended: true,
}

const FUTURE_SUBSCRIPTION: Subscription = {
  ...ACTIVE_SUBSCRIPTION,
  id: 'sub4',
  startDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
  endDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000),
}

const SESSION: Session = {
  id: 'sess1',
  type: 'SUBSCRIBER',
  clientId: 'c1',
  visitorName: null,
  visitorPhone: null,
  amountPaid: 8,
  paymentMethod: 'CASH',
  checkedInAt: new Date(),
}

function fakeSubscriptionRepository(overrides: Partial<SubscriptionRepository> = {}): SubscriptionRepository {
  return {
    findAllByClientId: async () => [],
    findById: async () => null,
    create: async () => {
      throw new Error('fakeSubscriptionRepository.create should not be called by DefaultClientHistoryService')
    },
    setSuspended: async () => {
      throw new Error('fakeSubscriptionRepository.setSuspended should not be called by DefaultClientHistoryService')
    },
    ...overrides,
  }
}

function fakeSessionRepository(overrides: Partial<SessionRepository> = {}): SessionRepository {
  return {
    findRecentByClientId: async () => [],
    create: async () => {
      throw new Error('fakeSessionRepository.create should not be called by DefaultClientHistoryService')
    },
    ...overrides,
  }
}

describe('DefaultClientHistoryService.getHistory', () => {
  it('returns the latest subscription as current when it has not expired', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [ACTIVE_SUBSCRIPTION] }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription?.id).toBe('sub1')
  })

  it('returns null for current when the latest subscription has expired', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [EXPIRED_SUBSCRIPTION] }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription).toBeNull()
  })

  it('returns null for current when the client has no subscriptions', async () => {
    const service = new DefaultClientHistoryService(fakeSubscriptionRepository(), fakeSessionRepository())

    const history = await service.getHistory('c1')

    expect(history.currentSubscription).toBeNull()
  })

  it('treats a suspended-but-unexpired subscription as still current', async () => {
    // "Current" here means "on file, started, and not yet expired" — the active/suspended/expiring
    // distinction is a display concern computed by the frontend's computeSubscriptionStatus(),
    // not by this backend (see design doc's "statut non calculé côté backend" decision).
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [SUSPENDED_SUBSCRIPTION] }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription?.id).toBe('sub3')
    expect(history.currentSubscription?.suspended).toBe(true)
  })

  it('skips a not-yet-started future subscription and falls back to the active one', async () => {
    // subscriptions is ordered by endDate desc, so the future renewal (later endDate) sorts
    // before the currently-active one — "current" must skip past it since it hasn't started yet.
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [FUTURE_SUBSCRIPTION, ACTIVE_SUBSCRIPTION] }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription?.id).toBe('sub1')
  })

  it('returns null for current when the only subscription has not started yet', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [FUTURE_SUBSCRIPTION] }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription).toBeNull()
  })

  it('returns the full subscriptions list and recent sessions unchanged', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [ACTIVE_SUBSCRIPTION, EXPIRED_SUBSCRIPTION] }),
      fakeSessionRepository({ findRecentByClientId: async () => [SESSION] }),
    )

    const history = await service.getHistory('c1')

    expect(history.subscriptions).toEqual([ACTIVE_SUBSCRIPTION, EXPIRED_SUBSCRIPTION])
    expect(history.recentSessions).toEqual([SESSION])
  })

  it('passes the RECENT_SESSIONS_LIMIT constant (20) to findRecentByClientId', async () => {
    const calls: number[] = []
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository(),
      fakeSessionRepository({
        findRecentByClientId: async (_clientId, limit) => {
          calls.push(limit)
          return []
        },
      }),
    )

    await service.getHistory('c1')

    expect(calls).toEqual([20])
  })

  it('never lets a raw repository error message escape getHistory', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
      fakeSessionRepository(),
    )

    await expect(service.getHistory('c1')).rejects.toThrow('internal-error')
  })
})
