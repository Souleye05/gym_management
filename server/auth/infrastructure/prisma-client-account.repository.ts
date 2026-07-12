import type { PrismaClient } from '../../../lib/generated/prisma/client'
import type { ClientAccountRecord, ClientAccountRepository } from '../repositories/client-account.repository'

export class PrismaClientAccountRepository implements ClientAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPhone(phone: string): Promise<ClientAccountRecord | null> {
    return this.prisma.clientAccount.findUnique({ where: { phone } })
  }

  async findById(id: string): Promise<ClientAccountRecord | null> {
    return this.prisma.clientAccount.findUnique({ where: { id } })
  }
}
