import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { ClientHistory, ClientHistoryService } from './client-history.service'

const SOURCE = 'ClientHistoryService'
const RECENT_SESSIONS_LIMIT = 20

/**
 * Tags a repository call's rejection with which operation failed, so the single
 * guardAgainstLeakingInternals catch around the Promise.all below logs an identifiable cause
 * instead of an ambiguous "one of N calls failed". The original error is preserved via the
 * standard Error `cause` chain, not discarded.
 */
function tagFailure<T>(operation: string, promise: Promise<T>): Promise<T> {
  return promise.catch((cause) => {
    throw new Error(`${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  })
}

export class DefaultClientHistoryService implements ClientHistoryService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async getHistory(clientId: string): Promise<ClientHistory> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const [subscriptions, recentSessions] = await Promise.all([
        tagFailure('findAllByClientId', this.subscriptionRepository.findAllByClientId(clientId)),
        tagFailure(
          'findRecentByClientId',
          this.sessionRepository.findRecentByClientId(clientId, RECENT_SESSIONS_LIMIT),
        ),
      ])

      // "Current" is a temporal business judgment (is this subscription still valid as of
      // now?), not a data-access concern — deliberately kept out of the repository layer so
      // this rule can evolve (grace periods, a future stored status...) without touching
      // persistence. A suspended-but-unexpired subscription still counts as current; the
      // active/suspended/expiring distinction is a frontend display concern.
      //
      // subscriptions is already ordered by endDate desc (with an id tiebreaker), so the first
      // entry that has actually started (startDate <= now) is the one with the latest endDate
      // among started subscriptions — skipping past a not-yet-started future renewal to find the
      // subscription that's genuinely in effect, rather than assuming the single latest-by-endDate
      // row is automatically current. No separate findLatestByClientId query is needed: that would
      // just recompute a value already derivable from this array via an extra round-trip and a
      // second, non-atomic read of the same table.
      const now = new Date()
      const latestStartedSubscription = subscriptions.find((subscription) => subscription.startDate <= now) ?? null
      const currentSubscription =
        latestStartedSubscription && latestStartedSubscription.endDate > now ? latestStartedSubscription : null

      return { currentSubscription, subscriptions, recentSessions }
    })
  }
}
