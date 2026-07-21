import type { PaymentMethod, Session } from '../domain/entities'

export type CreateSessionInput =
  | { type: 'SUBSCRIBER'; clientId: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }
  | { type: 'VISITOR'; visitorName: string; visitorPhone: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }

export interface SessionRepository {
  /** The N most recent sessions for a client, ordered by checkedInAt descending. */
  findRecentByClientId(clientId: string, limit: number): Promise<Session[]>
  create(input: CreateSessionInput): Promise<Session>
}
