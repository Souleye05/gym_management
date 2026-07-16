import type { Client } from '../domain/entities'

export type CreateClientInput = {
  name: string
  phone: string
  email?: string
}

export type UpdateClientInput = Partial<{
  name: string
  phone: string
  email: string | null
}>

export type FindByPhoneOptions = {
  activeOnly: boolean
}

export interface ClientRepository {
  create(input: CreateClientInput): Promise<Client>
  findById(id: string): Promise<Client | null>
  /** Excludes deactivated clients when `activeOnly` is true. */
  findByPhone(phone: string, options: FindByPhoneOptions): Promise<Client | null>
  /** Looks up by the raw card sequence integer (already parsed from "CARD-xxxxx" by the caller). */
  findByCardSequence(sequence: number): Promise<Client | null>
  /** Looks up the Client linked to a ClientAccount, if any. A ClientAccount links to at most one Client. */
  findByClientAccountId(clientAccountId: string): Promise<Client | null>
  /** Case-insensitive substring match on name or phone, active clients only. Empty query returns []. */
  search(query: string): Promise<Client[]>
  update(id: string, input: UpdateClientInput): Promise<Client>
  /** Soft delete: sets isActive to false and deletedAt to now. */
  deactivate(id: string): Promise<void>
}
