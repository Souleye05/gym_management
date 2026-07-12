import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from './test-helpers/clean-db'
import { PrismaStaffAccountRepository } from './prisma-staff-account.repository'

const repository = new PrismaStaffAccountRepository(prismaClient)

beforeEach(async () => {
  await cleanAuthTables()
})

describe('PrismaStaffAccountRepository', () => {
  it('finds a staff account by email', async () => {
    await prismaClient.staffAccount.create({
      data: { email: 'admin@atlas.fit', passwordHash: 'hash', name: 'Admin Studio', role: 'ADMIN' },
    })

    const account = await repository.findByEmail('admin@atlas.fit')

    expect(account?.name).toBe('Admin Studio')
    expect(account?.role).toBe('ADMIN')
  })

  it('returns null when the email does not exist', async () => {
    const account = await repository.findByEmail('missing@atlas.fit')
    expect(account).toBeNull()
  })

  it('finds a staff account by id', async () => {
    const created = await prismaClient.staffAccount.create({
      data: { email: 'agent@atlas.fit', passwordHash: 'hash', name: 'Agent Caisse', role: 'AGENT' },
    })

    const account = await repository.findById(created.id)

    expect(account?.email).toBe('agent@atlas.fit')
  })

  it('returns null when the id does not exist', async () => {
    const account = await repository.findById('does-not-exist')
    expect(account).toBeNull()
  })
})
