import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import type { AppSettings } from '../domain/entities'
import type { SettingsRepository } from '../repositories/settings.repository'
import type { SettingsService } from './settings.service'

const SOURCE = 'SettingsService'

export class DefaultSettingsService implements SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async getSettings(): Promise<AppSettings> {
    return guardAgainstLeakingInternals(SOURCE, () => this.settingsRepository.get())
  }

  async updateSettings(input: { sessionPrice: number }): Promise<AppSettings> {
    return guardAgainstLeakingInternals(SOURCE, () => this.settingsRepository.update(input))
  }
}
