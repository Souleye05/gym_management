import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from './test-helpers/clean-db'
import { PrismaLoginAttemptRepository } from './prisma-login-attempt.repository'

const repository = new PrismaLoginAttemptRepository(prismaClient)

beforeEach(async () => {
  await cleanAuthTables()
})

describe('PrismaLoginAttemptRepository', () => {
  it('records an attempt', async () => {
    await repository.record({ kind: 'LOGIN', identifier: 'admin@atlas.fit', succeeded: false })

    const count = await prismaClient.loginAttempt.count()
    expect(count).toBe(1)
  })

  it('counts only recent LOGIN failures for the given identifier', async () => {
    await repository.record({ kind: 'LOGIN', identifier: 'admin@atlas.fit', succeeded: false })
    await repository.record({ kind: 'LOGIN', identifier: 'admin@atlas.fit', succeeded: false })
    await repository.record({ kind: 'LOGIN', identifier: 'admin@atlas.fit', succeeded: true })
    await repository.record({ kind: 'LOGIN', identifier: 'other@atlas.fit', succeeded: false })

    const count = await repository.countRecentFailures('admin@atlas.fit', 15)

    expect(count).toBe(2)
  })

  it('excludes failures older than the given window', async () => {
    await prismaClient.loginAttempt.create({
      data: {
        kind: 'LOGIN',
        identifier: 'admin@atlas.fit',
        succeeded: false,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    })

    const count = await repository.countRecentFailures('admin@atlas.fit', 15)

    expect(count).toBe(0)
  })

  it('counts recent attempts of a given kind regardless of outcome', async () => {
    await repository.record({ kind: 'OTP_REQUEST', identifier: '+33612345601', succeeded: true })
    await repository.record({ kind: 'OTP_REQUEST', identifier: '+33612345601', succeeded: true })
    await repository.record({ kind: 'LOGIN', identifier: '+33612345601', succeeded: false })

    const count = await repository.countRecent('OTP_REQUEST', '+33612345601', 15)

    expect(count).toBe(2)
  })

  it('excludes attempts of a given kind older than the window', async () => {
    await prismaClient.loginAttempt.create({
      data: {
        kind: 'OTP_REQUEST',
        identifier: '+33612345601',
        succeeded: true,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    })

    const count = await repository.countRecent('OTP_REQUEST', '+33612345601', 15)

    expect(count).toBe(0)
  })
})
