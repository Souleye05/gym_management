import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from './test-helpers/clean-db'
import { PrismaOtpRepository } from './prisma-otp.repository'

const repository = new PrismaOtpRepository(prismaClient)

const inTenMinutes = () => new Date(Date.now() + 10 * 60 * 1000)
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60 * 1000)

async function createClient() {
  return prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'Yasmine Kaddour' } })
}

beforeEach(async () => {
  await cleanAuthTables()
})

describe('PrismaOtpRepository', () => {
  it('finds the latest valid OTP for a client', async () => {
    const client = await createClient()
    await repository.create({ clientAccountId: client.id, codeHash: 'hash-a', expiresAt: inTenMinutes() })

    const found = await repository.findLatestValid(client.id)

    expect(found?.codeHash).toBe('hash-a')
  })

  it('returns the most recently created OTP when multiple exist', async () => {
    const client = await createClient()
    await repository.create({ clientAccountId: client.id, codeHash: 'older', expiresAt: inTenMinutes() })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await repository.create({ clientAccountId: client.id, codeHash: 'newer', expiresAt: inTenMinutes() })

    const found = await repository.findLatestValid(client.id)

    expect(found?.codeHash).toBe('newer')
  })

  it('does not find an expired OTP', async () => {
    const client = await createClient()
    await prismaClient.otpCode.create({
      data: { clientAccountId: client.id, codeHash: 'expired', expiresAt: tenMinutesAgo() },
    })

    const found = await repository.findLatestValid(client.id)

    expect(found).toBeNull()
  })

  it('does not find a consumed OTP', async () => {
    const client = await createClient()
    const created = await prismaClient.otpCode.create({
      data: { clientAccountId: client.id, codeHash: 'consumed', expiresAt: inTenMinutes() },
    })
    await repository.consume(created.id)

    const found = await repository.findLatestValid(client.id)

    expect(found).toBeNull()
  })

  it('increments attempts', async () => {
    const client = await createClient()
    const created = await prismaClient.otpCode.create({
      data: { clientAccountId: client.id, codeHash: 'hash-b', expiresAt: inTenMinutes() },
    })

    await repository.incrementAttempts(created.id)
    await repository.incrementAttempts(created.id)

    const updated = await prismaClient.otpCode.findUnique({ where: { id: created.id } })
    expect(updated?.attempts).toBe(2)
  })
})
