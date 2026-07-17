import type { Client } from '../domain/entities'

/**
 * Thrown by `create`/`update` when the database's own uniqueness enforcement (a partial
 * unique index scoped to active clients) rejects a phone number already in use by another
 * active client. This is the race-condition safety net behind the service-level
 * `findByPhone` pre-check — implementations must throw this specific type (never a raw
 * driver/ORM error) so callers can distinguish it from a genuinely unexpected failure.
 */
export class PhoneAlreadyUsedError extends Error {
  constructor() {
    super('phone-already-used')
    this.name = 'PhoneAlreadyUsedError'
  }
}

export const DEFAULT_LIST_ACTIVE_LIMIT = 100

export type ListActivePagination = { page: number; limit: number }
export type ListActiveResult = { clients: Client[]; total: number }

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
  /** Active clients only, ordered by joinedAt descending. `total` is a real count, independent of `limit`. */
  listActive(pagination: ListActivePagination): Promise<ListActiveResult>
  update(id: string, input: UpdateClientInput): Promise<Client>
  /** Soft delete: sets isActive to false and deletedAt to now. */
  deactivate(id: string): Promise<void>
}
