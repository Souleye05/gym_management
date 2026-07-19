import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanClientPortalHistoryTables } from './test-helpers/clean-client-portal-history-tables'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { PrismaClientRepository } from '../../clients/infrastructure/prisma-client.repository'
import { PrismaSubscriptionRepository } from './prisma-subscription.repository'

const clientRepository = new PrismaClientRepository(prismaClient)
const repository = new PrismaSubscriptionRepository(prismaClient)

async function createTestClient(phone: string): Promise<string> {
  const client = await clientRepository.create({ name: 'Test Client', phone })
  return client.id
}

beforeEach(async () => {
  await cleanClientPortalHistoryTables()
  await cleanClientsTable()
})

describe('PrismaSubscriptionRepository.findAllByClientId', () => {
  it('returns all subscriptions for a client, ordered by endDate descending', async () => {
    const clientId = await createTestClient('+33600001001')
    await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'QUARTERLY',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-05-01'),
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })

    const results = await repository.findAllByClientId(clientId)

    expect(results).toHaveLength(2)
    expect(results[0].planId).toBe('QUARTERLY')
    expect(results[1].planId).toBe('MONTHLY')
  })

  it('returns an empty array when the client has no subscriptions', async () => {
    const clientId = await createTestClient('+33600001002')

    const results = await repository.findAllByClientId(clientId)

    expect(results).toEqual([])
  })

  it('never returns another client\'s subscriptions', async () => {
    const clientId = await createTestClient('+33600001003')
    const otherClientId = await createTestClient('+33600001004')
    await prismaClient.subscription.create({
      data: {
        clientId: otherClientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })

    const results = await repository.findAllByClientId(clientId)

    expect(results).toEqual([])
  })
})

describe('PrismaSubscriptionRepository.findLatestByClientId', () => {
  it('returns the subscription with the latest endDate', async () => {
    const clientId = await createTestClient('+33600001005')
    await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    const latest = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'QUARTERLY',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-05-01'),
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })

    const result = await repository.findLatestByClientId(clientId)

    expect(result?.id).toBe(latest.id)
  })

  it('returns null when the client has no subscriptions', async () => {
    const clientId = await createTestClient('+33600001006')

    const result = await repository.findLatestByClientId(clientId)

    expect(result).toBeNull()
  })

  it('includes a suspended subscription if it is still the latest by endDate', async () => {
    const clientId = await createTestClient('+33600001007')
    const suspended = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'ANNUAL',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-01-01'),
        suspended: true,
        amountPaid: 350,
        paymentMethod: 'MOBILE_MONEY',
      },
    })

    const result = await repository.findLatestByClientId(clientId)

    expect(result?.id).toBe(suspended.id)
    expect(result?.suspended).toBe(true)
  })
})
