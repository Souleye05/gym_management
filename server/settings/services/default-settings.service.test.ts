import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../domain/entities'
import type { SettingsRepository } from '../repositories/settings.repository'
import { DefaultSettingsService } from './default-settings.service'

const SETTINGS: AppSettings = { id: 'singleton', sessionPrice: 8, updatedAt: new Date('2026-07-01') }

function fakeSettingsRepository(overrides: Partial<SettingsRepository> = {}): SettingsRepository {
  return {
    get: async () => SETTINGS,
    update: async (input) => ({ ...SETTINGS, sessionPrice: input.sessionPrice }),
    ...overrides,
  }
}

describe('DefaultSettingsService.getSettings', () => {
  it('delegates to the repository', async () => {
    const service = new DefaultSettingsService(fakeSettingsRepository())

    const result = await service.getSettings()

    expect(result.sessionPrice).toBe(8)
  })

  it('never lets a raw repository error message escape getSettings', async () => {
    const service = new DefaultSettingsService(
      fakeSettingsRepository({
        get: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
    )

    await expect(service.getSettings()).rejects.toThrow('internal-error')
  })
})

describe('DefaultSettingsService.updateSettings', () => {
  it('delegates to the repository and returns the updated value', async () => {
    const service = new DefaultSettingsService(fakeSettingsRepository())

    const result = await service.updateSettings({ sessionPrice: 15 })

    expect(result.sessionPrice).toBe(15)
  })
})
