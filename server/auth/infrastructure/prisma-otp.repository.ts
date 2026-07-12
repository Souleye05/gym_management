import type { PrismaClient } from '../../../lib/generated/prisma/client'
import type { CreateOtpInput, OtpRecord, OtpRepository } from '../repositories/otp.repository'

export class PrismaOtpRepository implements OtpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateOtpInput): Promise<void> {
    await this.prisma.otpCode.create({
      data: {
        clientAccountId: input.clientAccountId,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
      },
    })
  }

  async findLatestValid(clientAccountId: string): Promise<OtpRecord | null> {
    return this.prisma.otpCode.findFirst({
      where: { clientAccountId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    })
  }

  async consume(id: string): Promise<boolean> {
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    return count > 0
  }
}
