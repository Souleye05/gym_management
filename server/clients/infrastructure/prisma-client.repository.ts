import { Prisma, type PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Client } from '../domain/entities'
import {
  PhoneAlreadyUsedError,
  type ClientRepository,
  type CreateClientInput,
  type FindByPhoneOptions,
  type ListActivePagination,
  type ListActiveResult,
  type UpdateClientInput,
} from '../repositories/client.repository'
import { formatCardNumber } from './format-card-number'

/**
 * True if `error` is a unique-constraint violation (Prisma P2002) from `create`/`update`
 * below. Prisma's engine cannot report which constraint fired for a hand-written partial
 * index — it wasn't declared via `@unique`, so `error.meta.target` comes back empty — so
 * this cannot inspect the constraint name. It doesn't need to: `create`/`update`'s inputs
 * (`CreateClientInput`/`UpdateClientInput`) never set `clientAccountId` or `cardSequence`,
 * the only other unique-constrained columns on `Client`, so within these two methods a
 * P2002 can only ever be the `clients_phone_active_key` partial index.
 */
function isPhoneActiveUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

type PrismaClientRow = {
  id: string
  cardSequence: number
  name: string
  phone: string
  email: string | null
  isActive: boolean
  joinedAt: Date
}

function toDomain(row: PrismaClientRow): Client {
  return {
    id: row.id,
    cardNumber: formatCardNumber(row.cardSequence),
    name: row.name,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    joinedAt: row.joinedAt,
  }
}

export class PrismaClientRepository implements ClientRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async create(input: CreateClientInput): Promise<Client> {
    try {
      const row = await this.prisma.client.create({
        data: { name: input.name, phone: input.phone, email: input.email ?? null },
      })
      return toDomain(row)
    } catch (error) {
      if (isPhoneActiveUniqueViolation(error)) throw new PhoneAlreadyUsedError()
      throw error
    }
  }

  async findById(id: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async findByPhone(phone: string, options: FindByPhoneOptions): Promise<Client | null> {
    const row = await this.prisma.client.findFirst({
      where: { phone, ...(options.activeOnly ? { isActive: true } : {}) },
    })
    return row ? toDomain(row) : null
  }

  async findByCardSequence(sequence: number): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { cardSequence: sequence } })
    return row ? toDomain(row) : null
  }

  async findByClientAccountId(clientAccountId: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { clientAccountId } })
    return row ? toDomain(row) : null
  }

  async search(query: string): Promise<Client[]> {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    const rows = await this.prisma.client.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { phone: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
    })
    return rows.map(toDomain)
  }

  async listActive({ page, limit }: ListActivePagination): Promise<ListActiveResult> {
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where: { isActive: true },
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where: { isActive: true } }),
    ])
    return { clients: rows.map(toDomain), total }
  }

  async update(id: string, input: UpdateClientInput): Promise<Client> {
    try {
      const row = await this.prisma.client.update({
        where: { id },
        data: input,
      })
      return toDomain(row)
    } catch (error) {
      if (isPhoneActiveUniqueViolation(error)) throw new PhoneAlreadyUsedError()
      throw error
    }
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.client.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    })
  }
}
