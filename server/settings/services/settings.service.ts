import type { AppSettings } from '../domain/entities'

export interface SettingsService {
  getSettings(): Promise<AppSettings>
  updateSettings(input: { sessionPrice: number }): Promise<AppSettings>
}
