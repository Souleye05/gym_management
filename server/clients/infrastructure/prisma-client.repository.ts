import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Client } from '../domain/entities'
import type {
  ClientRepository,
  CreateClientInput,
  FindByPhoneOptions,
  UpdateClientInput,
} from '../repositories/client.repository'
import { formatCardNumber } from './format-card-number'

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
    const row = await this.prisma.client.create({
      data: { name: input.name, phone: input.phone, email: input.email ?? null },
    })
    return toDomain(row)
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

  async update(id: string, input: UpdateClientInput): Promise<Client> {
    const row = await this.prisma.client.update({
      where: { id },
      data: input,
    })
    return toDomain(row)
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.client.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    })
  }
}
