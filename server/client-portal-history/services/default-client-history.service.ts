import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { ClientHistory, ClientHistoryService } from './client-history.service'

const RECENT_SESSIONS_LIMIT = 20

/**
 * Same anti-leak boundary as DefaultClientService (server/clients/services/default-client.service.ts):
 * any unexpected error (Prisma, connection) is logged server-side and rethrown as a generic
 * error whose message is safe to eventually surface in an HTTP response. No Prisma message,
 * code, or constraint name is ever allowed past this boundary.
 */
async function guardAgainstLeakingInternals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    console.error('[ClientHistoryService] unexpected repository failure', cause)
    throw new Error('internal-error')
  }
}

export class DefaultClientHistoryService implements ClientHistoryService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async getHistory(clientId: string): Promise<ClientHistory> {
    return guardAgainstLeakingInternals(async () => {
      const [subscriptions, latestSubscription, recentSessions] = await Promise.all([
        this.subscriptionRepository.findAllByClientId(clientId),
        this.subscriptionRepository.findLatestByClientId(clientId),
        this.sessionRepository.findRecentByClientId(clientId, RECENT_SESSIONS_LIMIT),
      ])

      // "Current" is a temporal business judgment (is this subscription still valid as of
      // now?), not a data-access concern — deliberately kept out of the repository layer so
      // this rule can evolve (grace periods, a future stored status...) without touching
      // persistence. A suspended-but-unexpired subscription still counts as current; the
      // active/suspended/expiring distinction is a frontend display concern.
      const now = new Date()
      const currentSubscription = latestSubscription && latestSubscription.endDate > now ? latestSubscription : null

      return { currentSubscription, subscriptions, recentSessions }
    })
  }
}
