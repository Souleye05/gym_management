import { findClientByCardNumberRequest, fetchClients } from './fetch-clients'
import type { Client } from './types'

export type AsyncClientRepository = {
  findByCardNumber(cardNumber: string): Promise<Client | undefined>
  search(query: string): Promise<Client[]>
}

export function createApiClientRepository(): AsyncClientRepository {
  return {
    findByCardNumber: (cardNumber) => findClientByCardNumberRequest(cardNumber.trim()),
    search: async (query) => {
      const normalizedQuery = query.trim()
      if (normalizedQuery.length === 0) return []
      const result = await fetchClients({ q: normalizedQuery })
      return result.clients
    },
  }
}
