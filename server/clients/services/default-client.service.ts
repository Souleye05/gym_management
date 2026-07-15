import { err, ok, type Result } from '../../shared/result'
import type { Client } from '../domain/entities'
import type { ClientDomainError } from '../domain/errors'
import type { CreateClientDto, UpdateClientDto } from '../dto/client.dto'
import type { ClientRepository } from '../repositories/client.repository'
import { parseCardNumber } from '../infrastructure/format-card-number'
import type { ClientService } from './client.service'

const NOT_FOUND: ClientDomainError = { code: 'not-found', message: 'Client introuvable.' }
const PHONE_ALREADY_USED: ClientDomainError = {
  code: 'phone-already-used',
  message: 'Ce numéro de téléphone est déjà utilisé par un autre client.',
  field: 'phone',
}

/**
 * Runs a repository call and, if it throws anything other than a ClientDomainError-carrying
 * rejection (this repository never throws those — domain failures are always expressed via the
 * Result-returning callers above, never by throwing), logs the real error server-side and rethrows
 * a generic error whose message is safe to eventually surface in an HTTP response. No Prisma
 * message, code, or constraint name is ever allowed past this boundary.
 */
async function guardAgainstLeakingInternals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    console.error('[ClientService] unexpected repository failure', cause)
    throw new Error('internal-error')
  }
}

export class DefaultClientService implements ClientService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async createClient(input: CreateClientDto): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const existing = await this.clientRepository.findByPhone(input.phone, { activeOnly: true })
      if (existing) return err(PHONE_ALREADY_USED)

      const client = await this.clientRepository.create(input)
      return ok(client)
    })
  }

  async getClient(id: string): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const client = await this.clientRepository.findById(id)
      if (!client || !client.isActive) return err(NOT_FOUND)
      return ok(client)
    })
  }

  async listClients(query?: string): Promise<Client[]> {
    return guardAgainstLeakingInternals(async () => {
      if (!query || query.trim().length === 0) return []
      return this.clientRepository.search(query)
    })
  }

  async findByPhone(phone: string): Promise<Client | null> {
    return guardAgainstLeakingInternals(() => this.clientRepository.findByPhone(phone, { activeOnly: true }))
  }

  async findByCardNumber(cardNumber: string): Promise<Client | null> {
    const sequence = parseCardNumber(cardNumber)
    if (sequence === null) return null
    return guardAgainstLeakingInternals(async () => {
      const client = await this.clientRepository.findByCardSequence(sequence)
      return client && client.isActive ? client : null
    })
  }

  async updateClient(id: string, input: UpdateClientDto): Promise<Result<Client, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const existing = await this.clientRepository.findById(id)
      if (!existing || !existing.isActive) return err(NOT_FOUND)

      if (input.phone && input.phone !== existing.phone) {
        const phoneOwner = await this.clientRepository.findByPhone(input.phone, { activeOnly: true })
        if (phoneOwner) return err(PHONE_ALREADY_USED)
      }

      const updated = await this.clientRepository.update(id, input)
      return ok(updated)
    })
  }

  async deactivateClient(id: string): Promise<Result<void, ClientDomainError>> {
    return guardAgainstLeakingInternals(async () => {
      const existing = await this.clientRepository.findById(id)
      if (!existing || !existing.isActive) return err(NOT_FOUND)

      await this.clientRepository.deactivate(id)
      return ok(undefined)
    })
  }
}
