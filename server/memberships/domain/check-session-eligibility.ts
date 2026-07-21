// server/memberships/domain/check-session-eligibility.ts
import type { Subscription } from './entities'

export type SessionEligibility = { allowed: true } | { allowed: false; reason: 'none' | 'expired' | 'suspended' }

/**
 * `latest` is the client's latest subscription by endDate (SubscriptionRepository.findAllByClientId
 * result's first element), NOT deriveCurrentSubscription's result — eligibility looks at the raw
 * latest subscription regardless of whether it has started, so it can report the more specific
 * "suspended"/"expired" reasons instead of collapsing everything into "none". Suspended takes
 * priority over expired when a subscription is both (matches the mock's computeSubscriptionStatus
 * precedence). A not-yet-started subscription denies with reason 'none' — the mock never produces
 * this case (its renewals always chain from max(current end, now)), so no UI message exists yet
 * to distinguish it from "no subscription at all".
 */
export function checkSessionEligibility(latest: Subscription | null, now: Date): SessionEligibility {
  if (!latest) return { allowed: false, reason: 'none' }
  if (latest.suspended) return { allowed: false, reason: 'suspended' }
  if (latest.endDate <= now) return { allowed: false, reason: 'expired' }
  if (latest.startDate > now) return { allowed: false, reason: 'none' }
  return { allowed: true }
}
