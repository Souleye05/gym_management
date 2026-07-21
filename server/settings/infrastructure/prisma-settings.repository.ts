import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { AppSettings } from '../domain/entities'
import type { SettingsRepository } from '../repositories/settings.repository'

const SINGLETON_ID = 'singleton'
const DEFAULT_SESSION_PRICE = 8

type PrismaAppSettingsRow = {
  id: string
  sessionPrice: number
  updatedAt: Date
}

function toDomain(row: PrismaAppSettingsRow): AppSettings {
  return { id: row.id, sessionPrice: row.sessionPrice, updatedAt: row.updatedAt }
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async get(): Promise<AppSettings> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID, sessionPrice: DEFAULT_SESSION_PRICE },
    })
    return toDomain(row)
  }

  async update(input: { sessionPrice: number }): Promise<AppSettings> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: { sessionPrice: input.sessionPrice },
      create: { id: SINGLETON_ID, sessionPrice: input.sessionPrice },
    })
    return toDomain(row)
  }
}
