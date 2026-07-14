// components/providers/clients-provider.tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { mockClients } from '@/lib/clients/mock-clients'
import { createInMemoryClientRepository, type ClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

type NewClientInput = {
  name: string
  phone: string
  email?: string
}

type UpdateClientInput = Partial<Pick<Client, 'name' | 'phone' | 'email'>>

type ClientsContextValue = {
  clients: Client[]
  clientRepository: ClientRepository
  addClient(input: NewClientInput): Client
  updateClient(id: string, input: UpdateClientInput): void
  deleteClient(id: string): void
  getClient(id: string): Client | undefined
}

const ClientsContext = createContext<ClientsContextValue | null>(null)

export function ClientsProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>(() => [...mockClients])
  const sequenceRef = useRef(mockClients.length)

  const addClient = useCallback((input: NewClientInput) => {
    sequenceRef.current += 1
    const newClient: Client = {
      id: `cl${Date.now()}`,
      name: input.name,
      phone: input.phone,
      email: input.email,
      cardNumber: `CARD-${String(sequenceRef.current).padStart(5, '0')}`,
      joinedAt: new Date().toISOString(),
    }
    setClients((prev) => [...prev, newClient])
    return newClient
  }, [])

  const updateClient = useCallback((id: string, input: UpdateClientInput) => {
    setClients((prev) =>
      prev.map((client) => (client.id === id ? { ...client, ...input } : client)),
    )
  }, [])

  const deleteClient = useCallback((id: string) => {
    setClients((prev) => prev.filter((client) => client.id !== id))
  }, [])

  const getClient = useCallback(
    (id: string) => clients.find((client) => client.id === id),
    [clients],
  )

  const clientRepository = useMemo(() => createInMemoryClientRepository(clients), [clients])

  return (
    <ClientsContext.Provider
      value={{ clients, clientRepository, addClient, updateClient, deleteClient, getClient }}
    >
      {children}
    </ClientsContext.Provider>
  )
}

export function useClients(): ClientsContextValue {
  const ctx = useContext(ClientsContext)
  if (!ctx) throw new Error('useClients must be used within a ClientsProvider')
  return ctx
}
