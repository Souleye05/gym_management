// components/providers/clients-provider.tsx
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import {
  createClientRequest,
  deactivateClientRequest,
  fetchClients,
  updateClientRequest,
  type NewClientInput,
  type UpdateClientInput,
} from '@/lib/clients/fetch-clients'
import { createApiClientRepository, type AsyncClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

const CLIENTS_QUERY_KEY = ['clients'] as const

type MutationOpts<TResult = void> = { onSuccess?: (result: TResult) => void; onError?: (message: string) => void }

type ClientsContextValue = {
  clients: Client[]
  total?: number
  isLoading: boolean
  isError: boolean
  refetch: () => void
  clientRepository: AsyncClientRepository
  addClient(input: NewClientInput, opts?: MutationOpts<Client>): void
  updateClient(id: string, input: UpdateClientInput, opts?: MutationOpts): void
  deactivateClient(id: string, opts?: MutationOpts): void
  getClient(id: string): Client | undefined
}

const ClientsContext = createContext<ClientsContextValue | null>(null)

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function ClientsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: () => fetchClients({}),
  })

  const clients = query.data?.clients ?? []

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY })
  }, [queryClient])

  const addMutation = useMutation({
    mutationFn: createClientRequest,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClientInput }) => updateClientRequest(id, input),
  })

  const deactivateMutation = useMutation({
    mutationFn: deactivateClientRequest,
  })

  const addClient = useCallback(
    (input: NewClientInput, opts?: MutationOpts<Client>) => {
      addMutation.mutate(input, {
        onSuccess: (client) => {
          invalidate()
          opts?.onSuccess?.(client)
        },
        onError: (error) => opts?.onError?.(errorMessage(error, "Impossible de créer le client.")),
      })
    },
    [addMutation, invalidate],
  )

  const updateClient = useCallback(
    (id: string, input: UpdateClientInput, opts?: MutationOpts) => {
      updateMutation.mutate(
        { id, input },
        {
          onSuccess: () => {
            invalidate()
            opts?.onSuccess?.()
          },
          onError: (error) => opts?.onError?.(errorMessage(error, 'Impossible de modifier le client.')),
        },
      )
    },
    [updateMutation, invalidate],
  )

  const deactivateClient = useCallback(
    (id: string, opts?: MutationOpts) => {
      deactivateMutation.mutate(id, {
        onSuccess: () => {
          invalidate()
          opts?.onSuccess?.()
        },
        onError: (error) => opts?.onError?.(errorMessage(error, 'Impossible de désactiver le client.')),
      })
    },
    [deactivateMutation, invalidate],
  )

  const getClient = useCallback((id: string) => clients.find((client) => client.id === id), [clients])

  const clientRepository = useMemo(() => createApiClientRepository(), [])

  const value = useMemo<ClientsContextValue>(
    () => ({
      clients,
      total: query.data?.total,
      isLoading: query.isPending,
      isError: query.isError,
      refetch: query.refetch,
      clientRepository,
      addClient,
      updateClient,
      deactivateClient,
      getClient,
    }),
    [
      clients,
      query.data?.total,
      query.isPending,
      query.isError,
      query.refetch,
      clientRepository,
      addClient,
      updateClient,
      deactivateClient,
      getClient,
    ],
  )

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
}

export function useClients(): ClientsContextValue {
  const ctx = useContext(ClientsContext)
  if (!ctx) throw new Error('useClients must be used within a ClientsProvider')
  return ctx
}
