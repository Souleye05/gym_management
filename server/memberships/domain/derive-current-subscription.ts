// server/memberships/domain/derive-current-subscription.ts
import type { Subscription } from './entities'

/**
 * "Current" is a temporal business judgment (is this subscription still valid as of now?), not
 * a data-access concern. `subscriptions` must already be ordered by endDate descending (as
 * SubscriptionRepository.findAllByClientId returns it) — the first entry that has actually
 * started (startDate <= now) is the one with the latest endDate among started subscriptions,
 * skipping past a not-yet-started future renewal. A suspended-but-unexpired subscription still
 * counts as current; the active/suspended/expiring distinction is a frontend display concern.
 */
export function deriveCurrentSubscription(subscriptions: Subscription[], now: Date): Subscription | null {
  const latestStarted = subscriptions.find((subscription) => subscription.startDate <= now) ?? null
  return latestStarted && latestStarted.endDate > now ? latestStarted : null
}
