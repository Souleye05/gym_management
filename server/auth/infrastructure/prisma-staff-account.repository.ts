import type { PrismaClient } from '../../../lib/generated/prisma/client'
import type { StaffAccountRecord, StaffAccountRepository } from '../repositories/staff-account.repository'

export class PrismaStaffAccountRepository implements StaffAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<StaffAccountRecord | null> {
    return this.prisma.staffAccount.findUnique({ where: { email } })
  }

  async findById(id: string): Promise<StaffAccountRecord | null> {
    return this.prisma.staffAccount.findUnique({ where: { id } })
  }
}
