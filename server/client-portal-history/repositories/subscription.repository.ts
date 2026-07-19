import type { Subscription } from '../domain/entities'

export interface SubscriptionRepository {
  /** All subscriptions for a client, ordered by endDate descending (most recent first). */
  findAllByClientId(clientId: string): Promise<Subscription[]>
  /**
   * The subscription with the latest endDate for a client, or null if none exist. Pure data
   * access — no judgment about whether it's still valid ("current"); that's the service's job.
   */
  findLatestByClientId(clientId: string): Promise<Subscription | null>
}
