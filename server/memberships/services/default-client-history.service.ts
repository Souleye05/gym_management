import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import { deriveCurrentSubscription } from '../domain/derive-current-subscription'
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

      const currentSubscription = deriveCurrentSubscription(subscriptions, new Date())

      return { currentSubscription, subscriptions, recentSessions }
    })
  }
}
