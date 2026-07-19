import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Subscription } from '../domain/entities'
import type { SubscriptionRepository } from '../repositories/subscription.repository'

type PrismaSubscriptionRow = {
  id: string
  clientId: string
  planId: string
  startDate: Date
  endDate: Date
  suspended: boolean
  amountPaid: number
  paymentMethod: string
  createdAt: Date
}

function toDomain(row: PrismaSubscriptionRow): Subscription {
  return {
    id: row.id,
    clientId: row.clientId,
    planId: row.planId as Subscription['planId'],
    startDate: row.startDate,
    endDate: row.endDate,
    suspended: row.suspended,
    amountPaid: row.amountPaid,
    paymentMethod: row.paymentMethod as Subscription['paymentMethod'],
    createdAt: row.createdAt,
  }
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findAllByClientId(clientId: string): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { clientId },
      orderBy: { endDate: 'desc' },
    })
    return rows.map(toDomain)
  }

  async findLatestByClientId(clientId: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findFirst({
      where: { clientId },
      orderBy: { endDate: 'desc' },
    })
    return row ? toDomain(row) : null
  }
}
