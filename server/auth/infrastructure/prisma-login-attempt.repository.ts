import type { PrismaClient } from '../../../lib/generated/prisma/client'
import type {
  AttemptKind,
  LoginAttemptRepository,
  RecordLoginAttemptInput,
} from '../repositories/login-attempt.repository'

export class PrismaLoginAttemptRepository implements LoginAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordLoginAttemptInput): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        kind: input.kind,
        identifier: input.identifier,
        succeeded: input.succeeded,
        staffAccountId: input.staffAccountId,
        ipAddress: input.ipAddress,
      },
    })
  }

  async countRecentFailures(identifier: string, sinceMinutesAgo: number): Promise<number> {
    const since = new Date(Date.now() - sinceMinutesAgo * 60 * 1000)
    return this.prisma.loginAttempt.count({
      where: { kind: 'LOGIN', identifier, succeeded: false, createdAt: { gte: since } },
    })
  }

  async countRecent(kind: AttemptKind, identifier: string, sinceMinutesAgo: number): Promise<number> {
    const since = new Date(Date.now() - sinceMinutesAgo * 60 * 1000)
    return this.prisma.loginAttempt.count({
      where: { kind, identifier, createdAt: { gte: since } },
    })
  }
}
