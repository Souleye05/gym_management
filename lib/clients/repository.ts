import type { Client } from './types'

export type ClientRepository = {
  findByCardNumber(cardNumber: string): Client | undefined
  search(query: string): Client[]
}

export function createInMemoryClientRepository(clients: Client[]): ClientRepository {
  return {
    findByCardNumber: (cardNumber) => {
      const normalized = cardNumber.trim()
      return clients.find((c) => c.cardNumber === normalized)
    },
    search: (query) => {
      const normalizedQuery = query.trim().toLowerCase()
      if (normalizedQuery.length === 0) return []
      return clients.filter(
        (client) =>
          client.name.toLowerCase().includes(normalizedQuery) ||
          client.phone.toLowerCase().includes(normalizedQuery),
      )
    },
  }
}
