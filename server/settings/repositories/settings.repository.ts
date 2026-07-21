import type { AppSettings } from '../domain/entities'

export interface SettingsRepository {
  /** Always succeeds — creates the singleton row with default values if it doesn't exist yet. */
  get(): Promise<AppSettings>
  update(input: { sessionPrice: number }): Promise<AppSettings>
}
