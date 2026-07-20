import type { Result } from '../../shared/result'
import type { Client } from '../domain/entities'
import type { ClientDomainError } from '../domain/errors'
import type { CreateClientDto, UpdateClientDto } from '../dto/client.dto'
import type { ListActivePagination } from '../repositories/client.repository'

export type ListClientsResult = { clients: Client[]; total?: number }

export type GetClientOptions = { activeOnly: boolean }

export interface ClientService {
  createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>>
  /**
   * `activeOnly` (default true) excludes deactivated clients, returning `not-found` for one —
   * the behavior every existing caller relies on. Pass `{ activeOnly: false }` to resolve a
   * client regardless of status, e.g. to display a deactivated client's name on their own old
   * records: deactivation soft-deletes for the active roster, it must not make the underlying
   * data unreachable everywhere.
   */
  getClient(id: string, options?: GetClientOptions): Promise<Result<Client, ClientDomainError>>
  /**
   * Query present → substring search on name/phone, `total` absent (search has no true
   * pagination — a derived total would misleadingly imply one).
   * Query absent/empty → all active clients, paginated; `total` present and independent of `limit`.
   */
  listClients(query?: string, pagination?: ListActivePagination): Promise<ListClientsResult>
  findByPhone(phone: string): Promise<Client | null>
  /** Accepts a formatted card number (e.g. "CARD-00001"). Returns null if malformed or not found. */
  findByCardNumber(cardNumber: string): Promise<Client | null>
  /** Looks up the Client linked to a ClientAccount, if any. Returns null if none is linked. */
  findByClientAccountId(clientAccountId: string): Promise<Client | null>
  updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>>
  deactivateClient(id: string): Promise<Result<void, ClientDomainError>>
}
