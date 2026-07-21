// server/memberships/services/staff-session.service.ts
import type { Result } from '../../shared/result'
import type { PaymentMethod, Session } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'

export type RecordSubscriberSessionInput = {
  clientId: string
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export type RecordVisitorSessionInput = {
  visitorName: string
  visitorPhone: string
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export interface StaffSessionService {
  recordSubscriberSession(input: RecordSubscriberSessionInput): Promise<Result<Session, MembershipDomainError>>
  recordVisitorSession(input: RecordVisitorSessionInput): Promise<Result<Session, MembershipDomainError>>
}
