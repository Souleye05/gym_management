import type { Result } from '../../shared/result'
import type { Client } from '../domain/entities'
import type { ClientDomainError } from '../domain/errors'
import type { CreateClientDto, UpdateClientDto } from '../dto/client.dto'

export interface ClientService {
  createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>>
  getClient(id: string): Promise<Result<Client, ClientDomainError>>
  /** Empty/absent query returns all active clients; otherwise a substring search on name/phone. */
  listClients(query?: string): Promise<Client[]>
  findByPhone(phone: string): Promise<Client | null>
  /** Accepts a formatted card number (e.g. "CARD-00001"). Returns null if malformed or not found. */
  findByCardNumber(cardNumber: string): Promise<Client | null>
  updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>>
  deactivateClient(id: string): Promise<Result<void, ClientDomainError>>
}
