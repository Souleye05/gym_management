'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS } from '@/lib/settings/mock-settings'
import type { AppSettings } from '@/lib/settings/types'

type SettingsContextValue = {
  settings: AppSettings
  updateSettings(patch: Partial<AppSettings>): void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS }))

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
