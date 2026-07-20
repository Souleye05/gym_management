import { describe, expect, it } from 'vitest'
import { ok } from '../../shared/result'
import type { Client } from '../domain/entities'
import {
  DEFAULT_LIST_ACTIVE_LIMIT,
  PhoneAlreadyUsedError,
  type ClientRepository,
  type CreateClientInput,
  type FindByPhoneOptions,
  type ListActivePagination,
  type ListActiveResult,
  type UpdateClientInput,
} from '../repositories/client.repository'
import { DefaultClientService } from './default-client.service'

const CLIENT: Client = {
  id: 'c1',
  cardNumber: 'CARD-00001',
  name: 'Yasmine Kaddour',
  phone: '+33612345601',
  email: null,
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function fakeClientRepository(overrides: Partial<ClientRepository> = {}): ClientRepository {
  return {
    create: async (input: CreateClientInput) => ({ ...CLIENT, name: input.name, phone: input.phone, email: input.email ?? null }),
    findById: async (id) => (id === CLIENT.id ? CLIENT : null),
    findByPhone: async () => null,
    findByCardSequence: async (sequence) => (sequence === 1 ? CLIENT : null),
    findByClientAccountId: async () => null,
    search: async () => [CLIENT],
    listActive: async (_pagination: ListActivePagination): Promise<ListActiveResult> => ({ clients: [CLIENT], total: 1 }),
    update: async (id, input: UpdateClientInput) => ({ ...CLIENT, ...input }),
    deactivate: async () => {},
    ...overrides,
  }
}

describe('DefaultClientService.createClient', () => {
  it('creates a client when the phone is not already used by an active client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.createClient({ name: 'Yasmine Kaddour', phone: '+33612345601' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe('Yasmine Kaddour')
  })

  it('rejects when the phone is already used by an active client', async () => {
    const repository = fakeClientRepository({ findByPhone: async () => CLIENT })
    const service = new DefaultClientService(repository)

    const result = await service.createClient({ name: 'Another Person', phone: '+33612345601' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('phone-already-used')
  })

  it('checks phone uniqueness scoped to active clients only', async () => {
    const calls: FindByPhoneOptions[] = []
    const repository = fakeClientRepository({
      findByPhone: async (_phone, options) => {
        calls.push(options)
        return null
      },
    })
    const service = new DefaultClientService(repository)

    await service.createClient({ name: 'Test', phone: '+33612345601' })

    expect(calls).toEqual([{ activeOnly: true }])
  })

  it('translates a PhoneAlreadyUsedError from a concurrent create into phone-already-used, not internal-error', async () => {
    const repository = fakeClientRepository({
      create: async () => {
        throw new PhoneAlreadyUsedError()
      },
    })
    const service = new DefaultClientService(repository)

    const result = await service.createClient({ name: 'Racer', phone: '+33612345601' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('phone-already-used')
  })
})

describe('DefaultClientService.getClient', () => {
  it('returns the client when found', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.getClient('c1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.id).toBe('c1')
  })

  it('returns not-found when the client does not exist', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.getClient('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('returns not-found when the client exists but is deactivated', async () => {
    const deactivated: Client = { ...CLIENT, isActive: false }
    const repository = fakeClientRepository({ findById: async (id) => (id === deactivated.id ? deactivated : null) })
    const service = new DefaultClientService(repository)

    const result = await service.getClient('c1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('returns a deactivated client when activeOnly is false', async () => {
    // Historical display use case (e.g. resolving a client's name on their own old session
    // records after they've been deactivated) — deactivation soft-deletes for the active
    // roster, it must not make the client's data unreachable everywhere.
    const deactivated: Client = { ...CLIENT, isActive: false }
    const repository = fakeClientRepository({ findById: async (id) => (id === deactivated.id ? deactivated : null) })
    const service = new DefaultClientService(repository)

    const result = await service.getClient('c1', { activeOnly: false })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.id).toBe('c1')
      expect(result.value.isActive).toBe(false)
    }
  })

  it('still returns not-found for a nonexistent id when activeOnly is false', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.getClient('missing', { activeOnly: false })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })
})

describe('DefaultClientService.listClients', () => {
  it('returns search results with no total when a query is provided', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.listClients('yasmine')

    expect(result.clients).toEqual([CLIENT])
    expect(result.total).toBeUndefined()
  })

  it('delegates to listActive with a real total when no query is provided', async () => {
    const repository = fakeClientRepository({
      listActive: async ({ page, limit }) => {
        expect(page).toBe(1)
        expect(limit).toBe(DEFAULT_LIST_ACTIVE_LIMIT)
        return { clients: [CLIENT], total: 1 }
      },
    })
    const service = new DefaultClientService(repository)

    const result = await service.listClients()

    expect(result.clients).toEqual([CLIENT])
    expect(result.total).toBe(1)
  })

  it('delegates to listActive with a real total when the query is an empty string', async () => {
    const repository = fakeClientRepository({
      listActive: async () => ({ clients: [], total: 0 }),
    })
    const service = new DefaultClientService(repository)

    const result = await service.listClients('')

    expect(result.clients).toEqual([])
    expect(result.total).toBe(0)
  })

  it('passes explicit pagination through to listActive', async () => {
    const repository = fakeClientRepository({
      listActive: async (pagination) => {
        expect(pagination).toEqual({ page: 2, limit: 5 })
        return { clients: [], total: 12 }
      },
    })
    const service = new DefaultClientService(repository)

    await service.listClients(undefined, { page: 2, limit: 5 })
  })
})

describe('DefaultClientService.findByCardNumber', () => {
  it('parses the card number and delegates to findByCardSequence', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const found = await service.findByCardNumber('CARD-00001')

    expect(found?.id).toBe('c1')
  })

  it('returns null for a malformed card number without querying the repository', async () => {
    const repository = fakeClientRepository({
      findByCardSequence: async () => {
        throw new Error('should not be called for a malformed card number')
      },
    })
    const service = new DefaultClientService(repository)

    const found = await service.findByCardNumber('not-a-card-number')

    expect(found).toBeNull()
  })

  it('returns null when the matching client is deactivated', async () => {
    const deactivated: Client = { ...CLIENT, isActive: false }
    const repository = fakeClientRepository({ findByCardSequence: async (sequence) => (sequence === 1 ? deactivated : null) })
    const service = new DefaultClientService(repository)

    const found = await service.findByCardNumber('CARD-00001')

    expect(found).toBeNull()
  })
})

describe('DefaultClientService.findByClientAccountId', () => {
  it('delegates to the repository and returns the linked client', async () => {
    const repository = fakeClientRepository({
      findByClientAccountId: async (clientAccountId) => (clientAccountId === 'acc-1' ? CLIENT : null),
    })
    const service = new DefaultClientService(repository)

    const found = await service.findByClientAccountId('acc-1')

    expect(found?.id).toBe('c1')
  })

  it('returns null when no client is linked', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const found = await service.findByClientAccountId('acc-unknown')

    expect(found).toBeNull()
  })

  it('returns null when the linked client is deactivated', async () => {
    const deactivated: Client = { ...CLIENT, isActive: false }
    const repository = fakeClientRepository({
      findByClientAccountId: async (clientAccountId) => (clientAccountId === 'acc-1' ? deactivated : null),
    })
    const service = new DefaultClientService(repository)

    const found = await service.findByClientAccountId('acc-1')

    expect(found).toBeNull()
  })
})

describe('DefaultClientService.updateClient', () => {
  it('updates the client when the phone change does not collide', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.updateClient('c1', { name: 'Updated Name' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe('Updated Name')
  })

  it('returns not-found when updating a nonexistent client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.updateClient('missing', { name: 'X' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('rejects when changing the phone to one already used by another active client', async () => {
    const otherClient: Client = { ...CLIENT, id: 'c2', phone: '+33612345699' }
    const repository = fakeClientRepository({
      findByPhone: async (phone) => (phone === '+33612345699' ? otherClient : null),
    })
    const service = new DefaultClientService(repository)

    const result = await service.updateClient('c1', { phone: '+33612345699' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('phone-already-used')
  })

  it('translates a PhoneAlreadyUsedError from a concurrent update into phone-already-used, not internal-error', async () => {
    const repository = fakeClientRepository({
      update: async () => {
        throw new PhoneAlreadyUsedError()
      },
    })
    const service = new DefaultClientService(repository)

    const result = await service.updateClient('c1', { phone: '+33612345699' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('phone-already-used')
  })

  it('allows updating a client to keep its own current phone unchanged', async () => {
    const repository = fakeClientRepository({
      findByPhone: async (phone) => (phone === CLIENT.phone ? CLIENT : null),
    })
    const service = new DefaultClientService(repository)

    const result = await service.updateClient('c1', { phone: CLIENT.phone })

    expect(result.ok).toBe(true)
  })

  it('returns not-found when the client exists but is deactivated', async () => {
    const deactivated: Client = { ...CLIENT, isActive: false }
    const repository = fakeClientRepository({ findById: async (id) => (id === deactivated.id ? deactivated : null) })
    const service = new DefaultClientService(repository)

    const result = await service.updateClient('c1', { name: 'New Name' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })
})

describe('DefaultClientService.deactivateClient', () => {
  it('deactivates an existing client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.deactivateClient('c1')

    expect(result.ok).toBe(true)
  })

  it('returns not-found when deactivating a nonexistent client', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.deactivateClient('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })

  it('returns not-found when deactivating an already-deactivated client', async () => {
    const deactivated: Client = { ...CLIENT, isActive: false }
    const repository = fakeClientRepository({ findById: async (id) => (id === deactivated.id ? deactivated : null) })
    const service = new DefaultClientService(repository)

    const result = await service.deactivateClient('c1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })
})

describe('DefaultClientService unexpected repository failures', () => {
  it('never lets a raw repository error message escape createClient', async () => {
    const repository = fakeClientRepository({
      create: async () => {
        throw new Error('relation "clients" violates constraint xyz_pk on column "id"')
      },
    })
    const service = new DefaultClientService(repository)

    await expect(service.createClient({ name: 'Test', phone: '+33612345601' })).rejects.toThrow('internal-error')
  })

  it('never lets a raw repository error message escape getClient', async () => {
    const repository = fakeClientRepository({
      findById: async () => {
        throw new Error('connection terminated unexpectedly')
      },
    })
    const service = new DefaultClientService(repository)

    await expect(service.getClient('c1')).rejects.toThrow('internal-error')
  })
})
