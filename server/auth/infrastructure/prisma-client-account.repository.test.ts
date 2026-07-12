import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from './test-helpers/clean-db'
import { PrismaClientAccountRepository } from './prisma-client-account.repository'

const repository = new PrismaClientAccountRepository(prismaClient)

beforeEach(async () => {
  await cleanAuthTables()
})

describe('PrismaClientAccountRepository', () => {
  it('finds a client account by phone', async () => {
    await prismaClient.clientAccount.create({
      data: { phone: '+33612345601', name: 'Yasmine Kaddour' },
    })

    const account = await repository.findByPhone('+33612345601')

    expect(account?.name).toBe('Yasmine Kaddour')
  })

  it('returns null when the phone does not exist', async () => {
    const account = await repository.findByPhone('+33600000000')
    expect(account).toBeNull()
  })

  it('finds a client account by id', async () => {
    const created = await prismaClient.clientAccount.create({
      data: { phone: '+33612345602', name: 'Marc Delaunay' },
    })

    const account = await repository.findById(created.id)

    expect(account?.phone).toBe('+33612345602')
  })
})
