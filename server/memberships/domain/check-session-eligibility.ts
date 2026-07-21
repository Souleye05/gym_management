// server/memberships/domain/check-session-eligibility.ts
import type { Subscription } from './entities'

export type SessionEligibility = { allowed: true } | { allowed: false; reason: 'none' | 'expired' | 'suspended' }

/**
 * `subscriptions` must already be ordered by endDate descending (as
 * SubscriptionRepository.findAllByClientId returns it), same input deriveCurrentSubscription
 * receives. Eligibility first finds "the latest subscription that has actually started"
 * (skipping any not-yet-started renewal, same `.find(s => s.startDate <= now)` idiom as
 * deriveCurrentSubscription), then classifies suspended/expired against THAT subscription — not
 * against the naive max-endDate one. This matters because early renewal is allowed by design: a
 * client can have an active subscription A plus a future-dated renewal B with a later endDate but
 * a startDate that hasn't arrived yet. Classifying against B (the naive max-endDate pick) would
 * wrongly report "none" for a client who is in fact currently covered by A. Because the subscription
 * we classify is by construction already started, there is no "not yet started" branch to report —
 * that case is folded into "no started subscription at all" → reason 'none'. Suspended still takes
 * priority over expired when the latest-started subscription is both (matches the mock's
 * computeSubscriptionStatus precedence).
 */
export function checkSessionEligibility(subscriptions: Subscription[], now: Date): SessionEligibility {
  const latestStarted = subscriptions.find((subscription) => subscription.startDate <= now) ?? null
  if (!latestStarted) return { allowed: false, reason: 'none' }
  if (latestStarted.suspended) return { allowed: false, reason: 'suspended' }
  if (latestStarted.endDate <= now) return { allowed: false, reason: 'expired' }
  return { allowed: true }
}
