import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from './test-helpers/clean-db'
import { PrismaLoginLogRepository } from './prisma-login-log.repository'

const repository = new PrismaLoginLogRepository(prismaClient)

beforeEach(async () => {
  await cleanAuthTables()
})

describe('PrismaLoginLogRepository', () => {
  it('records a staff login log entry', async () => {
    await repository.record({ kind: 'staff', succeeded: true })

    const entry = await prismaClient.loginLog.findFirstOrThrow()
    expect(entry.kind).toBe('STAFF')
    expect(entry.succeeded).toBe(true)
  })

  it('records a client login log entry with a failure reason', async () => {
    await repository.record({ kind: 'client', succeeded: false, reason: 'invalid-otp' })

    const entry = await prismaClient.loginLog.findFirstOrThrow()
    expect(entry.kind).toBe('CLIENT')
    expect(entry.succeeded).toBe(false)
    expect(entry.reason).toBe('invalid-otp')
  })
})
