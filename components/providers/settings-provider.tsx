'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { fetchSettings, updateSettingsRequest } from '@/lib/settings/fetch-settings'
import type { AppSettings } from '@/lib/settings/types'

const SETTINGS_QUERY_KEY = ['settings'] as const

type UpdateSettingsOpts = { onSuccess?: () => void; onError?: (message: string) => void }

type SettingsContextValue = {
  settings: AppSettings | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
  updateSettings(input: { sessionPrice: number }, opts?: UpdateSettingsOpts): void
  isUpdating: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: fetchSettings,
  })

  const mutation = useMutation({
    mutationFn: updateSettingsRequest,
  })

  const updateSettings = useCallback(
    (input: { sessionPrice: number }, opts?: UpdateSettingsOpts) => {
      mutation.mutate(input, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
          opts?.onSuccess?.()
        },
        onError: (error) => opts?.onError?.(errorMessage(error, 'Impossible de mettre à jour les paramètres.')),
      })
    },
    [mutation, queryClient],
  )

  return (
    <SettingsContext.Provider
      value={{
        settings: query.data,
        isLoading: query.isPending,
        isError: query.isError,
        refetch: () => query.refetch(),
        updateSettings,
        isUpdating: mutation.isPending,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
