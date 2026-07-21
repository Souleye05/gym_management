import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanMembershipsTables } from './test-helpers/clean-memberships-tables'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { createTestClient } from './test-helpers/create-test-client'
import { PrismaSubscriptionRepository } from './prisma-subscription.repository'

const repository = new PrismaSubscriptionRepository(prismaClient)

beforeEach(async () => {
  await cleanMembershipsTables()
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

    const results = await repository.findAllByClientId(clientId)

    expect(results[0]?.id).toBe(suspended.id)
    expect(results[0]?.suspended).toBe(true)
  })

  it('breaks endDate ties deterministically using id as a secondary sort key', async () => {
    const clientId = await createTestClient('+33600001008')
    const tiedEndDate = new Date('2026-06-01')
    const first = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: tiedEndDate,
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    const second = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'QUARTERLY',
        startDate: new Date('2026-01-01'),
        endDate: tiedEndDate,
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })

    const results = await repository.findAllByClientId(clientId)

    expect(results).toHaveLength(2)
    const expectedOrder = [first.id, second.id].sort()
    expect(results.map((r) => r.id)).toEqual(expectedOrder)
  })
})
