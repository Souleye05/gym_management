import { describe, expect, it } from 'vitest'
import type { Client } from '../../clients/domain/entities'
import type { ClientService, ListClientsResult } from '../../clients/services/client.service'
import type { ClientDomainError } from '../../clients/domain/errors'
import { err, ok, type Result } from '../../shared/result'
import type { AppSettings } from '../../settings/domain/entities'
import type { SettingsService } from '../../settings/services/settings.service'
import type { Session, Subscription } from '../domain/entities'
import type { CreateSessionInput, SessionRepository } from '../repositories/session.repository'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import { DefaultStaffSessionService } from './default-staff-session.service'

const CLIENT: Client = {
  id: 'c1',
  cardNumber: 'CARD-00001',
  name: 'Yasmine Kaddour',
  phone: '+33612345601',
  email: null,
  isActive: true,
  joinedAt: new Date('2026-01-01'),
}

const VALID_SUBSCRIPTION: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  endDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date(),
}

const SETTINGS: AppSettings = { id: 'singleton', sessionPrice: 8, updatedAt: new Date() }

function fakeClientService(overrides: Partial<ClientService> = {}): ClientService {
  return {
    createClient: async () => err({ code: 'not-found', message: 'unused' }) as Result<Client, ClientDomainError>,
    getClient: async () => ok(CLIENT),
    listClients: async (): Promise<ListClientsResult> => ({ clients: [] }),
    findByPhone: async () => null,
    findByCardNumber: async () => null,
    findByClientAccountId: async () => null,
    updateClient: async () => ok(CLIENT),
    deactivateClient: async () => ok(undefined),
    ...overrides,
  }
}

function fakeSubscriptionRepository(overrides: Partial<SubscriptionRepository> = {}): SubscriptionRepository {
  return {
    findAllByClientId: async () => [VALID_SUBSCRIPTION],
    findById: async () => null,
    create: async () => VALID_SUBSCRIPTION,
    setSuspended: async () => VALID_SUBSCRIPTION,
    ...overrides,
  }
}

function fakeSessionRepository(overrides: Partial<SessionRepository> = {}): SessionRepository {
  return {
    findRecentByClientId: async () => [],
    create: async (input: CreateSessionInput): Promise<Session> =>
      input.type === 'SUBSCRIBER'
        ? { id: 'new-sess', type: 'SUBSCRIBER', clientId: input.clientId, visitorName: null, visitorPhone: null, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() }
        : { id: 'new-sess', type: 'VISITOR', clientId: null, visitorName: input.visitorName, visitorPhone: input.visitorPhone, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() },
    ...overrides,
  }
}

function fakeSettingsService(overrides: Partial<SettingsService> = {}): SettingsService {
  return {
    getSettings: async () => SETTINGS,
    updateSettings: async () => SETTINGS,
    ...overrides,
  }
}

describe('DefaultStaffSessionService.recordSubscriberSession', () => {
  it('records a session with amountPaid from settings when the client is eligible', async () => {
    const calls: CreateSessionInput[] = []
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository(),
      fakeSessionRepository({
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sess', type: 'SUBSCRIBER', clientId: 'c1', visitorName: null, visitorPhone: null, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() }
        },
      }),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(true)
    expect(calls[0]).toMatchObject({ type: 'SUBSCRIBER', clientId: 'c1', amountPaid: 8, createdByStaffId: 'staff1' })
  })

  it('rejects when the client does not exist or is inactive', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository(),
      fakeSessionRepository(),
      fakeClientService({ getClient: async () => err({ code: 'not-found', message: 'Client introuvable.' }) }),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'missing', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('client-not-found')
  })

  it('never calls the subscription repository when the client check fails (fail-fast ordering)', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('should not be called — client check must run first')
        },
      }),
      fakeSessionRepository(),
      fakeClientService({ getClient: async () => err({ code: 'not-found', message: 'Client introuvable.' }) }),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'missing', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('client-not-found')
  })

  it('rejects with session-ineligible and reason "expired" when the subscription has ended', async () => {
    const expired: Subscription = { ...VALID_SUBSCRIPTION, endDate: new Date(Date.now() - 1000) }
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [expired] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('session-ineligible')
      expect(result.error.reason).toBe('expired')
    }
  })

  it('rejects with session-ineligible and reason "suspended" when the subscription is suspended', async () => {
    const suspended: Subscription = { ...VALID_SUBSCRIPTION, suspended: true }
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [suspended] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('session-ineligible')
      expect(result.error.reason).toBe('suspended')
    }
  })

  it('rejects with session-ineligible and reason "none" when the client has no subscriptions', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('session-ineligible')
      expect(result.error.reason).toBe('none')
    }
  })

  it('never creates a session when the eligibility check fails (fail-fast ordering)', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [] }),
      fakeSessionRepository({
        create: async () => {
          throw new Error('should not be called — eligibility check must run first')
        },
      }),
      fakeClientService(),
      fakeSettingsService({
        getSettings: async () => {
          throw new Error('should not be called — eligibility check must run first')
        },
      }),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('session-ineligible')
  })

  it('succeeds when there is a valid current subscription plus a future early-renewal', async () => {
    const validCurrent: Subscription = VALID_SUBSCRIPTION
    const futureRenewal: Subscription = {
      ...VALID_SUBSCRIPTION,
      id: 'sub2',
      startDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 170 * 24 * 60 * 60 * 1000),
    }
    const service = new DefaultStaffSessionService(
      // future sorts first, matching real endDate desc ordering from the repository
      fakeSubscriptionRepository({ findAllByClientId: async () => [futureRenewal, validCurrent] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(true)
  })

  it('never lets a raw repository error message escape recordSubscriberSession', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    await expect(
      service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' }),
    ).rejects.toThrow('internal-error')
  })
})

describe('DefaultStaffSessionService.recordVisitorSession', () => {
  it('records a visitor session with amountPaid from settings, no eligibility check', async () => {
    const calls: CreateSessionInput[] = []
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository(),
      fakeSessionRepository({
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sess', type: 'VISITOR', clientId: null, visitorName: 'Nadia Ferrand', visitorPhone: '+33698765432', amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() }
        },
      }),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordVisitorSession({
      visitorName: 'Nadia Ferrand',
      visitorPhone: '+33698765432',
      paymentMethod: 'CASH',
      createdByStaffId: 'staff1',
    })

    expect(result.ok).toBe(true)
    expect(calls[0]).toMatchObject({ type: 'VISITOR', visitorName: 'Nadia Ferrand', amountPaid: 8 })
  })
})
