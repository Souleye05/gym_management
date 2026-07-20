import { err, ok, type Result } from '../../shared/result'
import type { Client } from '../domain/entities'
import type { ClientDomainError } from '../domain/errors'
import type { CreateClientDto, UpdateClientDto } from '../dto/client.dto'
import {
  DEFAULT_LIST_ACTIVE_LIMIT,
  PhoneAlreadyUsedError,
  type ClientRepository,
  type ListActivePagination,
} from '../repositories/client.repository'
import { parseCardNumber } from '../infrastructure/format-card-number'
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import type { ClientService, GetClientOptions, ListClientsResult } from './client.service'

const SOURCE = 'ClientService'

const NOT_FOUND: ClientDomainError = { code: 'not-found', message: 'Client introuvable.' }
const PHONE_ALREADY_USED: ClientDomainError = {
  code: 'phone-already-used',
  message: 'Ce numéro de téléphone est déjà utilisé par un autre client.',
  field: 'phone',
}

export class DefaultClientService implements ClientService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.clientRepository.findByPhone(input.phone, { activeOnly: true })
      if (existing) return err(PHONE_ALREADY_USED)

      // The findByPhone check above is a fast pre-check, not the enforcement mechanism — two
      // concurrent requests can both pass it before either commits. The database's own partial
      // unique index is what actually closes that race; PhoneAlreadyUsedError is how the
      // repository reports losing it, translated here into the same domain error the pre-check
      // produces so callers see one consistent 409, not an occasional raw 500.
      try {
        const client = await this.clientRepository.create(input)
        return ok(client)
      } catch (cause) {
        if (cause instanceof PhoneAlreadyUsedError) return err(PHONE_ALREADY_USED)
        throw cause
      }
    })
  }

  async getClient(
    id: string,
    options: GetClientOptions = { activeOnly: true },
  ): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const client = await this.clientRepository.findById(id)
      if (!client || (options.activeOnly && !client.isActive)) return err(NOT_FOUND)
      return ok(client)
    })
  }

  async listClients(query?: string, pagination?: ListActivePagination): Promise<ListClientsResult> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      if (query && query.trim().length > 0) {
        const clients = await this.clientRepository.search(query)
        return { clients }
      }
      return this.clientRepository.listActive(pagination ?? { page: 1, limit: DEFAULT_LIST_ACTIVE_LIMIT })
    })
  }

  async findByPhone(phone: string): Promise<Client | null> {
    return guardAgainstLeakingInternals(SOURCE, () => this.clientRepository.findByPhone(phone, { activeOnly: true }))
  }

  async findByCardNumber(cardNumber: string): Promise<Client | null> {
    const sequence = parseCardNumber(cardNumber)
    if (sequence === null) return null
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const client = await this.clientRepository.findByCardSequence(sequence)
      return client && client.isActive ? client : null
    })
  }

  async findByClientAccountId(clientAccountId: string): Promise<Client | null> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const client = await this.clientRepository.findByClientAccountId(clientAccountId)
      return client && client.isActive ? client : null
    })
  }

  async updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.clientRepository.findById(id)
      if (!existing || !existing.isActive) return err(NOT_FOUND)

      if (input.phone && input.phone !== existing.phone) {
        const phoneOwner = await this.clientRepository.findByPhone(input.phone, { activeOnly: true })
        if (phoneOwner) return err(PHONE_ALREADY_USED)
      }

      // Same race-safety net as createClient — see its comment above.
      try {
        const updated = await this.clientRepository.update(id, input)
        return ok(updated)
      } catch (cause) {
        if (cause instanceof PhoneAlreadyUsedError) return err(PHONE_ALREADY_USED)
        throw cause
      }
    })
  }

  async deactivateClient(id: string): Promise<Result<void, ClientDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.clientRepository.findById(id)
      if (!existing || !existing.isActive) return err(NOT_FOUND)

      await this.clientRepository.deactivate(id)
      return ok(undefined)
    })
  }
}
