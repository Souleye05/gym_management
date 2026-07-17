import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { PhoneAlreadyUsedError } from '../repositories/client.repository'
import { cleanClientsTable } from './test-helpers/clean-clients-table'
import { PrismaClientRepository } from './prisma-client.repository'

const repository = new PrismaClientRepository(prismaClient)

beforeEach(async () => {
  await cleanClientsTable()
})

describe('PrismaClientRepository.create', () => {
  it('creates a client and returns it with a formatted card number', async () => {
    const client = await repository.create({ name: 'Yasmine Kaddour', phone: '+33612345601' })

    expect(client.name).toBe('Yasmine Kaddour')
    expect(client.phone).toBe('+33612345601')
    expect(client.email).toBeNull()
    expect(client.isActive).toBe(true)
    expect(client.cardNumber).toMatch(/^CARD-\d{5,}$/)
  })

  it('stores an optional email when provided', async () => {
    const client = await repository.create({ name: 'Marc Delaunay', phone: '+33612345602', email: 'marc@example.com' })

    expect(client.email).toBe('marc@example.com')
  })

  it('assigns sequential, unique card numbers to successive clients', async () => {
    const first = await repository.create({ name: 'Client A', phone: '+33600000001' })
    const second = await repository.create({ name: 'Client B', phone: '+33600000002' })

    expect(first.cardNumber).not.toBe(second.cardNumber)
  })

  it('rejects the loser of two concurrent creates with the same phone via PhoneAlreadyUsedError', async () => {
    const phone = '+33600000099'

    const results = await Promise.allSettled([
      repository.create({ name: 'Racer A', phone }),
      repository.create({ name: 'Racer B', phone }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PhoneAlreadyUsedError)

    const allWithPhone = await prismaClient.client.findMany({ where: { phone, isActive: true } })
    expect(allWithPhone).toHaveLength(1)
  })
})

describe('PrismaClientRepository.findById', () => {
  it('finds a client by id', async () => {
    const created = await repository.create({ name: 'Inès Fabre', phone: '+33612345603' })

    const found = await repository.findById(created.id)

    expect(found?.name).toBe('Inès Fabre')
  })

  it('returns null when the id does not exist', async () => {
    const found = await repository.findById('does-not-exist')
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.findByPhone', () => {
  it('finds an active client by exact phone match', async () => {
    await repository.create({ name: 'Karim Benali', phone: '+33612345604' })

    const found = await repository.findByPhone('+33612345604', { activeOnly: true })

    expect(found?.name).toBe('Karim Benali')
  })

  it('excludes deactivated clients when activeOnly is true', async () => {
    const created = await repository.create({ name: 'Old Client', phone: '+33612345605' })
    await repository.deactivate(created.id)

    const found = await repository.findByPhone('+33612345605', { activeOnly: true })

    expect(found).toBeNull()
  })

  it('includes deactivated clients when activeOnly is false', async () => {
    const created = await repository.create({ name: 'Old Client', phone: '+33612345606' })
    await repository.deactivate(created.id)

    const found = await repository.findByPhone('+33612345606', { activeOnly: false })

    expect(found?.id).toBe(created.id)
  })

  it('returns null when no client has that phone', async () => {
    const found = await repository.findByPhone('+33600000000', { activeOnly: true })
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.findByCardSequence', () => {
  it('finds a client by its raw card sequence', async () => {
    const created = await repository.create({ name: 'Sequence Test', phone: '+33612345607' })

    const found = await repository.findByCardSequence(
      Number(created.cardNumber.replace('CARD-', '')),
    )

    expect(found?.id).toBe(created.id)
  })

  it('returns null for a sequence that does not exist', async () => {
    const found = await repository.findByCardSequence(999999)
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.findByClientAccountId', () => {
  it('finds a client linked to the given clientAccountId', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33600000010', name: 'Linked Account' } })
    const created = await prismaClient.client.create({
      data: { name: 'Linked Client', phone: '+33600000011', clientAccountId: account.id },
    })

    const found = await repository.findByClientAccountId(account.id)

    expect(found?.id).toBe(created.id)
  })

  it('returns null when no client is linked to the given clientAccountId', async () => {
    const found = await repository.findByClientAccountId('does-not-exist')
    expect(found).toBeNull()
  })
})

describe('PrismaClientRepository.search', () => {
  it('matches by case-insensitive name substring', async () => {
    await repository.create({ name: 'Yasmine Kaddour', phone: '+33612345601' })

    const results = await repository.search('yasmine')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Yasmine Kaddour')
  })

  it('matches by phone substring', async () => {
    await repository.create({ name: 'Marc Delaunay', phone: '+33612345602' })

    const results = await repository.search('345602')

    expect(results).toHaveLength(1)
  })

  it('returns an empty array for an empty query', async () => {
    await repository.create({ name: 'Client A', phone: '+33600000001' })

    const results = await repository.search('')

    expect(results).toEqual([])
  })

  it('excludes deactivated clients', async () => {
    const created = await repository.create({ name: 'Deactivated Person', phone: '+33600000002' })
    await repository.deactivate(created.id)

    const results = await repository.search('deactivated')

    expect(results).toEqual([])
  })
})

describe('PrismaClientRepository.update', () => {
  it('updates the provided fields and leaves others unchanged', async () => {
    const created = await repository.create({ name: 'Original Name', phone: '+33612345608', email: 'orig@example.com' })

    const updated = await repository.update(created.id, { name: 'New Name' })

    expect(updated.name).toBe('New Name')
    expect(updated.phone).toBe('+33612345608')
    expect(updated.email).toBe('orig@example.com')
  })

  it('can clear the email by passing null', async () => {
    const created = await repository.create({ name: 'Has Email', phone: '+33612345609', email: 'has@example.com' })

    const updated = await repository.update(created.id, { email: null })

    expect(updated.email).toBeNull()
  })
})

describe('PrismaClientRepository.deactivate', () => {
  it('sets isActive to false and stamps deletedAt', async () => {
    const created = await repository.create({ name: 'To Deactivate', phone: '+33612345610' })

    await repository.deactivate(created.id)

    const found = await repository.findById(created.id)
    expect(found?.isActive).toBe(false)
  })
})

describe('PrismaClientRepository.listActive', () => {
  it('returns active clients and the total count', async () => {
    await repository.create({ name: 'Client A', phone: '+33600000101' })
    await repository.create({ name: 'Client B', phone: '+33600000102' })

    const result = await repository.listActive({ page: 1, limit: 10 })

    expect(result.clients).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('excludes deactivated clients from both the list and the total', async () => {
    const created = await repository.create({ name: 'Will Deactivate', phone: '+33600000103' })
    await repository.create({ name: 'Stays Active', phone: '+33600000104' })
    await repository.deactivate(created.id)

    const result = await repository.listActive({ page: 1, limit: 10 })

    expect(result.clients).toHaveLength(1)
    expect(result.clients[0].name).toBe('Stays Active')
    expect(result.total).toBe(1)
  })

  it('respects limit, and total stays independent of it', async () => {
    for (let i = 0; i < 5; i++) {
      await repository.create({ name: `Client ${i}`, phone: `+336000002${i}0` })
    }

    const result = await repository.listActive({ page: 1, limit: 2 })

    expect(result.clients).toHaveLength(2)
    expect(result.total).toBe(5)
  })

  it('returns the second page when requested', async () => {
    const created: string[] = []
    for (let i = 0; i < 3; i++) {
      const client = await repository.create({ name: `Page Client ${i}`, phone: `+336000003${i}0` })
      created.push(client.id)
    }

    const firstPage = await repository.listActive({ page: 1, limit: 2 })
    const secondPage = await repository.listActive({ page: 2, limit: 2 })

    expect(firstPage.clients).toHaveLength(2)
    expect(secondPage.clients).toHaveLength(1)
    const firstPageIds = firstPage.clients.map((c) => c.id)
    const secondPageIds = secondPage.clients.map((c) => c.id)
    expect(firstPageIds).not.toEqual(expect.arrayContaining(secondPageIds))
  })

  it('returns an empty list and zero total when there are no active clients', async () => {
    const result = await repository.listActive({ page: 1, limit: 10 })

    expect(result.clients).toEqual([])
    expect(result.total).toBe(0)
  })
})
