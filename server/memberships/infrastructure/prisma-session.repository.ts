import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import { PAYMENT_METHODS, SESSION_TYPES, type Session } from '../domain/entities'
import type { CreateSessionInput, SessionRepository } from '../repositories/session.repository'
import { validateEnum } from './validate-enum'

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
    type: validateEnum(row.type, SESSION_TYPES, 'Session.type'),
    clientId: row.clientId,
    visitorName: row.visitorName,
    visitorPhone: row.visitorPhone,
    amountPaid: row.amountPaid,
    paymentMethod: validateEnum(row.paymentMethod, PAYMENT_METHODS, 'Session.paymentMethod'),
    checkedInAt: row.checkedInAt,
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findRecentByClientId(clientId: string, limit: number): Promise<Session[]> {
    // Secondary `id` tiebreaker makes the 20-item cutoff deterministic when sessions share an
    // identical checkedInAt — without it, which rows land inside vs. just outside `take` is not
    // guaranteed stable across identical calls.
    const rows = await this.prisma.session.findMany({
      where: { clientId },
      orderBy: [{ checkedInAt: 'desc' }, { id: 'asc' }],
      take: limit,
    })
    return rows.map(toDomain)
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const row =
      input.type === 'SUBSCRIBER'
        ? await this.prisma.session.create({
            data: {
              type: 'SUBSCRIBER',
              clientId: input.clientId,
              amountPaid: input.amountPaid,
              paymentMethod: input.paymentMethod,
              createdByStaffId: input.createdByStaffId,
            },
          })
        : await this.prisma.session.create({
            data: {
              type: 'VISITOR',
              visitorName: input.visitorName,
              visitorPhone: input.visitorPhone,
              amountPaid: input.amountPaid,
              paymentMethod: input.paymentMethod,
              createdByStaffId: input.createdByStaffId,
            },
          })
    return toDomain(row)
  }
}
