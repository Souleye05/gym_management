import { describe, expect, it } from 'vitest'
import type { Client } from '../../clients/domain/entities'
import type { ClientService, ListClientsResult } from '../../clients/services/client.service'
import type { Result } from '../../shared/result'
import { ok, err } from '../../shared/result'
import type { ClientDomainError } from '../../clients/domain/errors'
import type { Subscription } from '../domain/entities'
import type { CreateSubscriptionInput, SubscriptionRepository } from '../repositories/subscription.repository'
import { DefaultStaffSubscriptionService } from './default-staff-subscription.service'

const NOW = new Date('2026-07-21T12:00:00.000Z')

const CLIENT: Client = {
  id: 'c1',
  cardNumber: 'CARD-00001',
  name: 'Yasmine Kaddour',
  phone: '+33612345601',
  email: null,
  isActive: true,
  joinedAt: new Date('2026-01-01'),
}

const EXISTING_SUBSCRIPTION: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'MONTHLY',
  startDate: new Date('2026-06-21'),
  endDate: new Date('2026-07-21'),
  suspended: false,
  amountPaid: 40,
  paymentMethod: 'CASH',
  createdAt: new Date('2026-06-21'),
}

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
    findAllByClientId: async () => [],
    findById: async () => null,
    create: async (input: CreateSubscriptionInput) => ({
      id: 'new-sub',
      clientId: input.clientId,
      planId: input.planId,
      startDate: input.startDate,
      endDate: input.endDate,
      suspended: false,
      amountPaid: input.amountPaid,
      paymentMethod: input.paymentMethod,
      createdAt: NOW,
    }),
    setSuspended: async (id, suspended) => ({ ...EXISTING_SUBSCRIPTION, id, suspended }),
    ...overrides,
  }
}

describe('DefaultStaffSubscriptionService.createOrRenewSubscription', () => {
  it('rejects when the client does not exist or is inactive', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository(),
      fakeClientService({ getClient: async () => err({ code: 'not-found', message: 'Client introuvable.' }) }),
    )

    const result = await service.createOrRenewSubscription({
      clientId: 'missing',
      planId: 'MONTHLY',
      paymentMethod: 'CASH',
      createdByStaffId: 'staff1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('client-not-found')
  })

  it('starts from now and computes amountPaid/endDate from the plan catalog when the client has no subscriptions', async () => {
    const calls: CreateSubscriptionInput[] = []
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [],
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sub', clientId: input.clientId, planId: input.planId, startDate: input.startDate, endDate: input.endDate, suspended: false, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, createdAt: new Date() }
        },
      }),
      fakeClientService(),
    )

    const result = await service.createOrRenewSubscription({
      clientId: 'c1',
      planId: 'QUARTERLY',
      paymentMethod: 'CARD',
      createdByStaffId: 'staff1',
    })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].amountPaid).toBe(105)
    expect(calls[0].createdByStaffId).toBe('staff1')
    const durationMs = calls[0].endDate.getTime() - calls[0].startDate.getTime()
    expect(durationMs).toBe(90 * 24 * 60 * 60 * 1000)
  })

  it('chains startDate from the latest subscription endDate when it has not expired yet', async () => {
    const calls: CreateSubscriptionInput[] = []
    const futureEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [{ ...EXISTING_SUBSCRIPTION, endDate: futureEndDate }],
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sub', clientId: input.clientId, planId: input.planId, startDate: input.startDate, endDate: input.endDate, suspended: false, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, createdAt: new Date() }
        },
      }),
      fakeClientService(),
    )

    await service.createOrRenewSubscription({ clientId: 'c1', planId: 'MONTHLY', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(calls[0].startDate.getTime()).toBe(futureEndDate.getTime())
  })

  it('starts from now when the latest subscription has already expired', async () => {
    const calls: CreateSubscriptionInput[] = []
    const pastEndDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [{ ...EXISTING_SUBSCRIPTION, endDate: pastEndDate }],
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sub', clientId: input.clientId, planId: input.planId, startDate: input.startDate, endDate: input.endDate, suspended: false, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, createdAt: new Date() }
        },
      }),
      fakeClientService(),
    )

    const before = Date.now()
    await service.createOrRenewSubscription({ clientId: 'c1', planId: 'MONTHLY', paymentMethod: 'CASH', createdByStaffId: 'staff1' })
    const after = Date.now()

    expect(calls[0].startDate.getTime()).toBeGreaterThanOrEqual(before)
    expect(calls[0].startDate.getTime()).toBeLessThanOrEqual(after)
  })

  it('never lets a raw repository error message escape createOrRenewSubscription', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
      fakeClientService(),
    )

    await expect(
      service.createOrRenewSubscription({ clientId: 'c1', planId: 'MONTHLY', paymentMethod: 'CASH', createdByStaffId: 'staff1' }),
    ).rejects.toThrow('internal-error')
  })
})

describe('DefaultStaffSubscriptionService.suspendSubscription', () => {
  it('suspends an existing subscription', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({ findById: async (id) => (id === 'sub1' ? EXISTING_SUBSCRIPTION : null) }),
      fakeClientService(),
    )

    const result = await service.suspendSubscription('sub1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.suspended).toBe(true)
  })

  it('returns subscription-not-found for an unknown id', async () => {
    const service = new DefaultStaffSubscriptionService(fakeSubscriptionRepository(), fakeClientService())

    const result = await service.suspendSubscription('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subscription-not-found')
  })
})

describe('DefaultStaffSubscriptionService.reactivateSubscription', () => {
  it('reactivates an existing subscription', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({ findById: async (id) => (id === 'sub1' ? { ...EXISTING_SUBSCRIPTION, suspended: true } : null) }),
      fakeClientService(),
    )

    const result = await service.reactivateSubscription('sub1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.suspended).toBe(false)
  })

  it('returns subscription-not-found for an unknown id', async () => {
    const service = new DefaultStaffSubscriptionService(fakeSubscriptionRepository(), fakeClientService())

    const result = await service.reactivateSubscription('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subscription-not-found')
  })
})
