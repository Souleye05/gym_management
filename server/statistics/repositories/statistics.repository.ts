// server/statistics/repositories/statistics.repository.ts
import type { PlanId, SessionType } from '../../memberships/domain/entities'

export type RawSubscriptionEvent = {
  id: string
  clientId: string
  clientName: string
  planId: PlanId
  amountPaid: number
  createdAt: Date
  /** True if this is the earliest subscription ever created for this client (no earlier row exists). */
  isFirstForClient: boolean
}

export type RawSessionEvent = {
  id: string
  clientId: string | null
  /** Client name for a SUBSCRIBER session, visitorName for a VISITOR session. */
  name: string
  type: SessionType
  checkedInAt: Date
}

export type RawSignupEvent = {
  id: string
  clientId: string
  name: string
  createdAt: Date
}

export type RawExpirationEvent = {
  id: string
  clientId: string
  clientName: string
  endDate: Date
}

export type RawExpiringCandidate = {
  clientId: string
  clientName: string
  planId: PlanId
  suspended: boolean
  endDate: Date
  lastVisitAt: Date | null
}

export type RawTopMember = {
  clientId: string
  clientName: string
  planId: PlanId
  sessionsCount: number
}

export interface StatisticsRepository {
  /** Sum of Subscription.amountPaid (createdAt in range) + Session.amountPaid (checkedInAt in range). `end` exclusive. */
  getRevenueForPeriod(start: Date, end: Date): Promise<number>
  /** Distinct clients with a subscription spanning `asOf` (startDate <= asOf <= endDate). Suspension ignored — no suspension history exists to check retroactively. */
  countActiveClientsAsOf(asOf: Date): Promise<number>
  /** Sessions (subscriber + visitor) checked in within [start, end). */
  countSessionsForPeriod(start: Date, end: Date): Promise<number>
  /** Distinct clients whose latest-started subscription (by endDate, among subscriptions with startDate <= asOf) has already ended by `asOf`. */
  countExpiredSubscriptionsAsOf(asOf: Date): Promise<number>
  /** Count of currently-active (spanning `asOf`) subscriptions grouped by planId. A client with two simultaneously-overlapping active subscriptions of different plans (permitted by design) counts under both — an accepted rare-case approximation. */
  getPlanDistribution(asOf: Date): Promise<{ planId: PlanId; count: number }[]>
  /** The `limit` most recently created subscriptions with createdAt >= `since`, newest first. */
  getRecentSubscriptionEvents(since: Date, limit: number): Promise<RawSubscriptionEvent[]>
  /** The `limit` most recent sessions with checkedInAt >= `since`, newest first. */
  getRecentSessionEvents(since: Date, limit: number): Promise<RawSessionEvent[]>
  /** The `limit` most recently joined clients with joinedAt >= `since`, newest first. */
  getRecentSignupEvents(since: Date, limit: number): Promise<RawSignupEvent[]>
  /** The `limit` most recently expired subscriptions (since <= endDate <= now), most-recently-expired first. */
  getRecentExpirationEvents(since: Date, now: Date, limit: number): Promise<RawExpirationEvent[]>
  /** Each client's latest-started subscription (startDate <= now), one row per client — unfiltered, for the caller to classify via classifySubscriptionStatus. */
  getLatestStartedSubscriptionPerClient(now: Date): Promise<RawExpiringCandidate[]>
  /** Clients ranked by SUBSCRIBER session count with checkedInAt >= `since`, descending, top `limit`. Visitor sessions are not attributable to a client and are excluded. */
  getTopMembersBySessionCount(since: Date, limit: number): Promise<RawTopMember[]>
}
