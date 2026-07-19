import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Session } from '../domain/entities'
import type { SessionRepository } from '../repositories/session.repository'

type PrismaSessionRow = {
  id: string
  type: string
  clientId: string | null
  visitorName: string | null
  visitorPhone: string | null
  amountPaid: number
  paymentMethod: string
  checkedInAt: Date
}

function toDomain(row: PrismaSessionRow): Session {
  return {
    id: row.id,
    type: row.type as Session['type'],
    clientId: row.clientId,
    visitorName: row.visitorName,
    visitorPhone: row.visitorPhone,
    amountPaid: row.amountPaid,
    paymentMethod: row.paymentMethod as Session['paymentMethod'],
    checkedInAt: row.checkedInAt,
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findRecentByClientId(clientId: string, limit: number): Promise<Session[]> {
    const rows = await this.prisma.session.findMany({
      where: { clientId },
      orderBy: { checkedInAt: 'desc' },
      take: limit,
    })
    return rows.map(toDomain)
  }
}
