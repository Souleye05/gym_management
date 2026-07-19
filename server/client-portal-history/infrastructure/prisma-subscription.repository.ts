import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import { PAYMENT_METHODS, PLAN_IDS, type Subscription } from '../domain/entities'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import { validateEnum } from './validate-enum'

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
    planId: validateEnum(row.planId, PLAN_IDS, 'Subscription.planId'),
    startDate: row.startDate,
    endDate: row.endDate,
    suspended: row.suspended,
    amountPaid: row.amountPaid,
    paymentMethod: validateEnum(row.paymentMethod, PAYMENT_METHODS, 'Subscription.paymentMethod'),
    createdAt: row.createdAt,
  }
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findAllByClientId(clientId: string): Promise<Subscription[]> {
    // Secondary `id` tiebreaker makes ordering deterministic when two subscriptions share an
    // identical endDate — without it, Postgres gives no guarantee about tie order, and callers
    // that treat this array's first element as "the latest" (DefaultClientHistoryService) could
    // observe a different row than a caller re-running the same query moments later.
    const rows = await this.prisma.subscription.findMany({
      where: { clientId },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
    })
    return rows.map(toDomain)
  }
}
