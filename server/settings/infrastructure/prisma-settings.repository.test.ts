import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { PrismaSettingsRepository } from './prisma-settings.repository'

const repository = new PrismaSettingsRepository(prismaClient)

beforeEach(async () => {
  await prismaClient.appSettings.deleteMany()
})

describe('PrismaSettingsRepository.get', () => {
  it('creates the singleton row with a default sessionPrice when none exists', async () => {
    const settings = await repository.get()

    expect(settings.id).toBe('singleton')
    expect(settings.sessionPrice).toBe(8)
  })

  it('returns the existing row without creating a duplicate', async () => {
    await prismaClient.appSettings.create({ data: { id: 'singleton', sessionPrice: 12 } })

    const settings = await repository.get()

    expect(settings.sessionPrice).toBe(12)
    const count = await prismaClient.appSettings.count()
    expect(count).toBe(1)
  })
})

describe('PrismaSettingsRepository.update', () => {
  it('updates sessionPrice on the singleton row', async () => {
    await repository.get()

    const updated = await repository.update({ sessionPrice: 15 })

    expect(updated.sessionPrice).toBe(15)
  })

  it('creates the row if update is called before any get', async () => {
    const updated = await repository.update({ sessionPrice: 20 })

    expect(updated.sessionPrice).toBe(20)
    const count = await prismaClient.appSettings.count()
    expect(count).toBe(1)
  })
})
