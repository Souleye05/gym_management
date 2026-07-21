// server/memberships/services/staff-subscription.service.ts
import type { Result } from '../../shared/result'
import type { PaymentMethod, PlanId, Subscription } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'

export type CreateOrRenewSubscriptionInput = {
  clientId: string
  planId: PlanId
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export interface StaffSubscriptionService {
  createOrRenewSubscription(input: CreateOrRenewSubscriptionInput): Promise<Result<Subscription, MembershipDomainError>>
  suspendSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
  reactivateSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
}
