import type { PaymentMethod, PlanId, Subscription } from '../domain/entities'

export type CreateSubscriptionInput = {
  clientId: string
  planId: PlanId
  startDate: Date
  endDate: Date
  amountPaid: number
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export interface SubscriptionRepository {
  /**
   * All subscriptions for a client, ordered by endDate descending (most recent first, with `id`
   * as a secondary tiebreaker for deterministic ordering on endDate ties). The first element is
   * "the latest" — callers needing that single record use `subscriptions[0] ?? null` rather than
   * a separate query, since a second `findFirst` with the same ordering would just recompute the
   * same answer via an extra round-trip. Pure data access — no judgment about whether the latest
   * is still valid ("current"); that's the service's job.
   */
  findAllByClientId(clientId: string): Promise<Subscription[]>
  findById(id: string): Promise<Subscription | null>
  create(input: CreateSubscriptionInput): Promise<Subscription>
  setSuspended(id: string, suspended: boolean): Promise<Subscription>
}
