import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from './test-helpers/clean-db'
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository'

const repository = new PrismaRefreshTokenRepository(prismaClient)

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000)
const oneHourAgo = () => new Date(Date.now() - 60 * 60 * 1000)

beforeEach(async () => {
  await cleanAuthTables()
})

describe('PrismaRefreshTokenRepository', () => {
  it('creates a token owned by a staff account', async () => {
    const staff = await prismaClient.staffAccount.create({
      data: { email: 'admin@atlas.fit', passwordHash: 'hash', name: 'Admin Studio', role: 'ADMIN' },
    })

    await repository.create({
      tokenHash: 'hash-1',
      ownerId: staff.id,
      ownerKind: 'staff',
      expiresAt: inOneHour(),
    })

    const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash: 'hash-1' } })
    expect(stored?.staffAccountId).toBe(staff.id)
    expect(stored?.clientAccountId).toBeNull()
  })

  it('creates a token owned by a client account', async () => {
    const client = await prismaClient.clientAccount.create({
      data: { phone: '+33612345601', name: 'Yasmine Kaddour' },
    })

    await repository.create({
      tokenHash: 'hash-2',
      ownerId: client.id,
      ownerKind: 'client',
      expiresAt: inOneHour(),
    })

    const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash: 'hash-2' } })
    expect(stored?.clientAccountId).toBe(client.id)
    expect(stored?.staffAccountId).toBeNull()
  })

  it('finds a valid (non-expired, non-revoked) token by hash', async () => {
    const staff = await prismaClient.staffAccount.create({
      data: { email: 'admin@atlas.fit', passwordHash: 'hash', name: 'Admin Studio', role: 'ADMIN' },
    })
    await repository.create({ tokenHash: 'valid-hash', ownerId: staff.id, ownerKind: 'staff', expiresAt: inOneHour() })

    const found = await repository.findValidByHash('valid-hash')

    expect(found?.tokenHash).toBe('valid-hash')
  })

  it('does not find an expired token', async () => {
    const staff = await prismaClient.staffAccount.create({
      data: { email: 'admin@atlas.fit', passwordHash: 'hash', name: 'Admin Studio', role: 'ADMIN' },
    })
    await prismaClient.refreshToken.create({
      data: { tokenHash: 'expired-hash', staffAccountId: staff.id, expiresAt: oneHourAgo() },
    })

    const found = await repository.findValidByHash('expired-hash')

    expect(found).toBeNull()
  })

  it('does not find a revoked token', async () => {
    const staff = await prismaClient.staffAccount.create({
      data: { email: 'admin@atlas.fit', passwordHash: 'hash', name: 'Admin Studio', role: 'ADMIN' },
    })
    await repository.create({ tokenHash: 'revoked-hash', ownerId: staff.id, ownerKind: 'staff', expiresAt: inOneHour() })

    await repository.revoke('revoked-hash')
    const found = await repository.findValidByHash('revoked-hash')

    expect(found).toBeNull()
  })

  it('revoke is idempotent for an unknown token hash', async () => {
    await expect(repository.revoke('never-existed')).resolves.not.toThrow()
  })
})
