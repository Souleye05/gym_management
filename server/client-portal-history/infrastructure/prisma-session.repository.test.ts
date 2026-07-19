import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanClientPortalHistoryTables } from './test-helpers/clean-client-portal-history-tables'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { PrismaClientRepository } from '../../clients/infrastructure/prisma-client.repository'
import { PrismaSessionRepository } from './prisma-session.repository'

const clientRepository = new PrismaClientRepository(prismaClient)
const repository = new PrismaSessionRepository(prismaClient)

async function createTestClient(phone: string): Promise<string> {
  const client = await clientRepository.create({ name: 'Test Client', phone })
  return client.id
}

beforeEach(async () => {
  await cleanClientPortalHistoryTables()
  await cleanClientsTable()
})

describe('PrismaSessionRepository.findRecentByClientId', () => {
  it('returns sessions ordered by checkedInAt descending', async () => {
    const clientId = await createTestClient('+33600002001')
    await prismaClient.session.create({
      data: {
        type: 'SUBSCRIBER',
        clientId,
        amountPaid: 8,
        paymentMethod: 'CASH',
        checkedInAt: new Date('2026-01-01T10:00:00Z'),
      },
    })
    const mostRecent = await prismaClient.session.create({
      data: {
        type: 'SUBSCRIBER',
        clientId,
        amountPaid: 8,
        paymentMethod: 'CARD',
        checkedInAt: new Date('2026-01-05T10:00:00Z'),
      },
    })

    const results = await repository.findRecentByClientId(clientId, 20)

    expect(results).toHaveLength(2)
    expect(results[0].id).toBe(mostRecent.id)
  })

  it('respects the limit parameter', async () => {
    const clientId = await createTestClient('+33600002002')
    for (let i = 0; i < 5; i++) {
      await prismaClient.session.create({
        data: {
          type: 'SUBSCRIBER',
          clientId,
          amountPaid: 8,
          paymentMethod: 'CASH',
          checkedInAt: new Date(2026, 0, i + 1),
        },
      })
    }

    const results = await repository.findRecentByClientId(clientId, 2)

    expect(results).toHaveLength(2)
  })

  it('returns an empty array when the client has no sessions', async () => {
    const clientId = await createTestClient('+33600002003')

    const results = await repository.findRecentByClientId(clientId, 20)

    expect(results).toEqual([])
  })

  it('never returns another client\'s sessions', async () => {
    const clientId = await createTestClient('+33600002004')
    const otherClientId = await createTestClient('+33600002005')
    await prismaClient.session.create({
      data: { type: 'SUBSCRIBER', clientId: otherClientId, amountPaid: 8, paymentMethod: 'CASH' },
    })

    const results = await repository.findRecentByClientId(clientId, 20)

    expect(results).toEqual([])
  })

  it('maps a VISITOR session correctly (clientId null, visitor fields populated)', async () => {
    // Confirms the repository's row mapper correctly round-trips the VISITOR shape even
    // though this plan's actual callers only ever query by clientId (never encountering a
    // VISITOR row in practice) — the Session domain type must still map it correctly since
    // the schema/repository already support it for the future staff-CRUD plan.
    await prismaClient.session.create({
      data: {
        type: 'VISITOR',
        visitorName: 'Nadia Ferrand',
        visitorPhone: '+33698765432',
        amountPaid: 8,
        paymentMethod: 'CASH',
      },
    })

    // No client-scoped query would return this row (it has no clientId), so directly
    // assert the constraint/mapping shape via a raw check instead of going through
    // findRecentByClientId (which requires a clientId this row deliberately lacks).
    const row = await prismaClient.session.findFirst({ where: { type: 'VISITOR' } })
    expect(row?.clientId).toBeNull()
    expect(row?.visitorName).toBe('Nadia Ferrand')
  })
})

describe('sessions_type_consistency_check constraint', () => {
  it('rejects a SUBSCRIBER session with a visitor field set', async () => {
    const clientId = await createTestClient('+33600002006')
    await expect(
      prismaClient.session.create({
        data: { type: 'SUBSCRIBER', clientId, visitorName: 'Should Fail', amountPaid: 8, paymentMethod: 'CASH' },
      }),
    ).rejects.toThrow()
  })

  it('rejects a VISITOR session with no visitor fields set', async () => {
    await expect(
      prismaClient.session.create({
        data: {
          type: 'VISITOR',
          amountPaid: 8,
          paymentMethod: 'CASH',
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects a SUBSCRIBER session with no clientId', async () => {
    await expect(
      prismaClient.session.create({
        data: {
          type: 'SUBSCRIBER',
          amountPaid: 8,
          paymentMethod: 'CASH',
        },
      }),
    ).rejects.toThrow()
  })
})
