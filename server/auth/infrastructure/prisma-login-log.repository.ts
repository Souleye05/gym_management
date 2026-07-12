import { LoginKind as PrismaLoginKind, type PrismaClient } from '../../../lib/generated/prisma/client'
import type { LoginLogRepository, RecordLoginLogInput } from '../repositories/login-log.repository'

export class PrismaLoginLogRepository implements LoginLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordLoginLogInput): Promise<void> {
    await this.prisma.loginLog.create({
      data: {
        kind: input.kind === 'staff' ? PrismaLoginKind.STAFF : PrismaLoginKind.CLIENT,
        succeeded: input.succeeded,
        staffAccountId: input.staffAccountId,
        clientAccountId: input.clientAccountId,
        reason: input.reason,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    })
  }
}
